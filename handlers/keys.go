package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	clientv3 "go.etcd.io/etcd/client/v3"
	"etcd-webui/config"
	"etcd-webui/etcd"
)

type Handler struct {
	pool       etcd.Pool
	clusters   []config.Cluster
	clusterMap map[string]*config.Cluster
}

func NewHandler(pool etcd.Pool, clusters []config.Cluster) *Handler {
	m := make(map[string]*config.Cluster, len(clusters))
	for i := range clusters {
		m[clusters[i].Name] = &clusters[i]
	}
	return &Handler{pool: pool, clusters: clusters, clusterMap: m}
}

// requireWritable returns false and sends a 403 if the cluster is read-only.
func (h *Handler) requireWritable(c *gin.Context, clusterName string) bool {
	if cl, ok := h.clusterMap[clusterName]; ok && cl.ReadOnly {
		c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("cluster %q is read-only", clusterName)})
		return false
	}
	return true
}

func (h *Handler) ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}

// clientFor resolves the etcd client for the requested cluster.
// Falls back to the only cluster when there is exactly one and no ?cluster= is given.
func (h *Handler) clientFor(c *gin.Context) (*clientv3.Client, string, bool) {
	name := c.Query("cluster")
	if name == "" {
		if len(h.clusters) == 1 {
			name = h.clusters[0].Name
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cluster parameter is required"})
			return nil, "", false
		}
	}
	cli, ok := h.pool[name]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unknown cluster %q", name)})
		return nil, "", false
	}
	return cli, name, true
}

// ListClusters returns metadata for all configured clusters (no secrets).
func (h *Handler) ListClusters(c *gin.Context) {
	type info struct {
		Name      string   `json:"name"`
		Endpoints []string `json:"endpoints"`
		AuthType  string   `json:"authType"`
		ReadOnly  bool     `json:"readonly"`
	}
	result := make([]info, 0, len(h.clusters))
	for _, cl := range h.clusters {
		authType := cl.Auth.Type
		if authType == "" {
			authType = "none"
		}
		result = append(result, info{
			Name:      cl.Name,
			Endpoints: cl.Endpoints,
			AuthType:  authType,
			ReadOnly:  cl.ReadOnly,
		})
	}
	c.JSON(http.StatusOK, gin.H{"clusters": result})
}

// ListKeys returns keys matching the given prefix with cursor-based pagination.
// Query params: ?cluster= &prefix= &limit= &cursor= (cursor = last key from previous page)
func (h *Handler) ListKeys(c *gin.Context) {
	cli, _, ok := h.clientFor(c)
	if !ok {
		return
	}
	prefix := c.Query("prefix")
	cursor := c.Query("cursor")

	limit := int64(500)
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.ParseInt(l, 10, 64); err == nil && parsed > 0 && parsed <= 5000 {
			limit = parsed
		}
	}

	ctx, cancel := h.ctx()
	defer cancel()

	opts := []clientv3.OpOption{
		clientv3.WithKeysOnly(),
		clientv3.WithLimit(limit + 1), // +1 to detect hasMore
	}

	var startKey string
	if cursor != "" {
		// Resume after cursor: range query [cursor\x00, endOfPrefix)
		startKey = cursor + "\x00"
		if prefix != "" {
			opts = append(opts, clientv3.WithRange(clientv3.GetPrefixRangeEnd(prefix)))
		} else {
			opts = append(opts, clientv3.WithFromKey())
		}
	} else {
		// First page
		if prefix != "" {
			startKey = prefix
			opts = append(opts, clientv3.WithPrefix())
		} else {
			startKey = "\x00"
			opts = append(opts, clientv3.WithFromKey())
		}
	}

	resp, err := cli.Get(ctx, startKey, opts...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	hasMore := int64(len(resp.Kvs)) > limit
	kvs := resp.Kvs
	if hasMore {
		kvs = kvs[:limit]
	}

	keys := make([]string, 0, len(kvs))
	for _, kv := range kvs {
		keys = append(keys, string(kv.Key))
	}

	var nextCursor string
	if hasMore && len(keys) > 0 {
		nextCursor = keys[len(keys)-1]
	}

	c.JSON(http.StatusOK, gin.H{
		"keys":       keys,
		"count":      len(keys),
		"hasMore":    hasMore,
		"nextCursor": nextCursor,
	})
}

// GetKey returns the value for the key specified in ?key=.
func (h *Handler) GetKey(c *gin.Context) {
	cli, _, ok := h.clientFor(c)
	if !ok {
		return
	}
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key parameter is required"})
		return
	}

	ctx, cancel := h.ctx()
	defer cancel()

	resp, err := cli.Get(ctx, key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(resp.Kvs) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "key not found"})
		return
	}
	kv := resp.Kvs[0]
	c.JSON(http.StatusOK, gin.H{
		"key":            string(kv.Key),
		"value":          string(kv.Value),
		"version":        kv.Version,
		"createRevision": kv.CreateRevision,
		"modRevision":    kv.ModRevision,
	})
}

// PutKey creates or updates the key specified in ?key=.
func (h *Handler) PutKey(c *gin.Context) {
	cli, clusterName, ok := h.clientFor(c)
	if !ok {
		return
	}
	if !h.requireWritable(c, clusterName) {
		return
	}
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key parameter is required"})
		return
	}

	var body struct {
		Value string `json:"value"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
		return
	}

	ctx, cancel := h.ctx()
	defer cancel()

	if _, err := cli.Put(ctx, key, body.Value); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"key": key, "value": body.Value})
}

// DeleteKey deletes the key specified in ?key=.
func (h *Handler) DeleteKey(c *gin.Context) {
	cli, clusterName, ok := h.clientFor(c)
	if !ok {
		return
	}
	if !h.requireWritable(c, clusterName) {
		return
	}
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key parameter is required"})
		return
	}

	ctx, cancel := h.ctx()
	defer cancel()

	resp, err := cli.Delete(ctx, key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if resp.Deleted == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "key not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": key})
}

// ExportKeys returns all key-value pairs for a cluster as JSON.
// Optional ?prefix= to filter. The response format matches what ImportKeys expects.
func (h *Handler) ExportKeys(c *gin.Context) {
	cli, clusterName, ok := h.clientFor(c)
	if !ok {
		return
	}
	prefix := c.Query("prefix")

	ctx, cancel := h.ctx()
	defer cancel()

	var resp *clientv3.GetResponse
	var err error
	if prefix == "" {
		resp, err = cli.Get(ctx, "", clientv3.WithPrefix())
	} else {
		resp, err = cli.Get(ctx, prefix, clientv3.WithPrefix())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type KV struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	kvs := make([]KV, 0, len(resp.Kvs))
	for _, kv := range resp.Kvs {
		kvs = append(kvs, KV{Key: string(kv.Key), Value: string(kv.Value)})
	}

	c.JSON(http.StatusOK, gin.H{
		"cluster":     clusterName,
		"prefix":      prefix,
		"count":       len(kvs),
		"exportedAt":  time.Now().UTC().Format(time.RFC3339),
		"keys":        kvs,
	})
}

// ImportKeys writes a batch of key-value pairs to the cluster.
// Body: { "keys": [{ "key": "...", "value": "..." }, ...] }
func (h *Handler) ImportKeys(c *gin.Context) {
	cli, clusterName, ok := h.clientFor(c)
	if !ok {
		return
	}
	if !h.requireWritable(c, clusterName) {
		return
	}

	var body struct {
		Keys []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		} `json:"keys"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
		return
	}

	ctx, cancel := h.ctx()
	defer cancel()

	var errors []string
	imported := 0
	for _, kv := range body.Keys {
		if kv.Key == "" {
			errors = append(errors, "skipped entry with empty key")
			continue
		}
		if _, err := cli.Put(ctx, kv.Key, kv.Value); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", kv.Key, err))
		} else {
			imported++
		}
	}

	status := http.StatusOK
	if imported == 0 && len(errors) > 0 {
		status = http.StatusInternalServerError
	}
	c.JSON(status, gin.H{"imported": imported, "errors": errors})
}
