package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"etcd-webui/config"
	etcdclient "etcd-webui/etcd"
	"etcd-webui/handlers"
)

//go:embed static
var staticFiles embed.FS

func main() {
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "config/config.yaml"
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	pool, err := etcdclient.NewPool(cfg.Clusters)
	if err != nil {
		log.Fatalf("Failed to connect to etcd: %v", err)
	}
	defer pool.Close()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.SetTrustedProxies(nil)

	h := handlers.NewHandler(pool, cfg.Clusters)
	api := r.Group("/api")
	{
		api.GET("/clusters", h.ListClusters)
		api.GET("/keys", h.ListKeys)      // ?cluster= &prefix=
		api.GET("/key", h.GetKey)         // ?cluster= &key=
		api.PUT("/key", h.PutKey)         // ?cluster= &key=
		api.DELETE("/key", h.DeleteKey)   // ?cluster= &key=
		api.GET("/export", h.ExportKeys)  // ?cluster= &prefix=
		api.POST("/import", h.ImportKeys) // ?cluster=
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Serve embedded React SPA — fall back to index.html for client-side routing.
	sub, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("Failed to create embedded FS: %v", err)
	}
	fileServer := http.FileServer(http.FS(sub))

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		trimmed := strings.TrimPrefix(path, "/")
		if trimmed == "" {
			trimmed = "index.html"
		}
		if _, err := sub.Open(trimmed); err != nil {
			c.Request.URL.Path = "/"
		}
		fileServer.ServeHTTP(c.Writer, c.Request)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("etcd Web UI listening on http://0.0.0.0:%s (%d cluster(s))", port, len(cfg.Clusters))
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
