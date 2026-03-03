package etcd

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
	"etcd-webui/config"
)

// Pool maps cluster name → etcd client.
type Pool map[string]*clientv3.Client

// NewPool connects to all configured clusters and returns a Pool.
// On partial failure it closes already-opened clients before returning the error.
func NewPool(clusters []config.Cluster) (Pool, error) {
	pool := make(Pool, len(clusters))
	for _, cl := range clusters {
		cli, err := newClient(cl)
		if err != nil {
			pool.Close()
			return nil, fmt.Errorf("cluster %q: %w", cl.Name, err)
		}
		pool[cl.Name] = cli
	}
	return pool, nil
}

func (p Pool) Close() {
	for _, cli := range p {
		cli.Close()
	}
}

func newClient(cluster config.Cluster) (*clientv3.Client, error) {
	cfg := clientv3.Config{
		Endpoints:   cluster.Endpoints,
		DialTimeout: 5 * time.Second,
	}

	switch cluster.Auth.Type {
	case "mtls":
		tlsCfg, err := buildMTLS(cluster.Auth.CACert, cluster.Auth.Cert, cluster.Auth.Key)
		if err != nil {
			return nil, fmt.Errorf("mtls: %w", err)
		}
		cfg.TLS = tlsCfg

	case "tls":
		tlsCfg, err := buildTLSOnly(cluster.Auth.CACert)
		if err != nil {
			return nil, fmt.Errorf("tls: %w", err)
		}
		cfg.TLS = tlsCfg

	case "password":
		cfg.Username = cluster.Auth.Username
		cfg.Password = cluster.Auth.Password
		if cluster.Auth.CACert != "" {
			tlsCfg, err := buildTLSOnly(cluster.Auth.CACert)
			if err != nil {
				return nil, fmt.Errorf("password+tls: %w", err)
			}
			cfg.TLS = tlsCfg
		}

	case "none", "":
		// plain HTTP
	}

	cli, err := clientv3.New(cfg)
	if err != nil {
		return nil, fmt.Errorf("connecting to etcd: %w", err)
	}
	return cli, nil
}

func buildMTLS(caCertPath, certPath, keyPath string) (*tls.Config, error) {
	pool, err := loadCA(caCertPath)
	if err != nil {
		return nil, err
	}
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("loading client cert/key: %w", err)
	}
	return &tls.Config{RootCAs: pool, Certificates: []tls.Certificate{cert}}, nil
}

func buildTLSOnly(caCertPath string) (*tls.Config, error) {
	pool, err := loadCA(caCertPath)
	if err != nil {
		return nil, err
	}
	return &tls.Config{RootCAs: pool}, nil
}

func loadCA(path string) (*x509.CertPool, error) {
	pem, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading CA cert %s: %w", path, err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("failed to parse CA cert %s", path)
	}
	return pool, nil
}
