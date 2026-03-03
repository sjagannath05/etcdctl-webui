package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Clusters []Cluster `yaml:"clusters"`
}

type Cluster struct {
	Name      string   `yaml:"name"`
	Endpoints []string `yaml:"endpoints"`
	Auth      Auth     `yaml:"auth"`
}

// Auth holds authentication configuration.
// Set Type to one of: mtls | tls | password | none
type Auth struct {
	Type     string `yaml:"type"`
	CACert   string `yaml:"cacert"`   // mtls + tls
	Cert     string `yaml:"cert"`     // mtls only
	Key      string `yaml:"key"`      // mtls only
	Username string `yaml:"username"` // password only
	Password string `yaml:"password"` // password only
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config %s: %w", path, err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}
	if len(cfg.Clusters) == 0 {
		return nil, fmt.Errorf("config must define at least one cluster under 'clusters:'")
	}
	names := make(map[string]bool)
	for _, cl := range cfg.Clusters {
		if cl.Name == "" {
			return nil, fmt.Errorf("every cluster must have a name")
		}
		if names[cl.Name] {
			return nil, fmt.Errorf("duplicate cluster name %q", cl.Name)
		}
		names[cl.Name] = true
		if len(cl.Endpoints) == 0 {
			return nil, fmt.Errorf("cluster %q must have at least one endpoint", cl.Name)
		}
		if err := validateAuth(cl.Name, cl.Auth); err != nil {
			return nil, err
		}
	}
	return &cfg, nil
}

func validateAuth(clusterName string, a Auth) error {
	switch a.Type {
	case "mtls":
		if a.CACert == "" || a.Cert == "" || a.Key == "" {
			return fmt.Errorf("cluster %q: mtls requires cacert, cert, and key", clusterName)
		}
	case "tls":
		if a.CACert == "" {
			return fmt.Errorf("cluster %q: tls requires cacert", clusterName)
		}
	case "password":
		if a.Username == "" || a.Password == "" {
			return fmt.Errorf("cluster %q: password auth requires username and password", clusterName)
		}
	case "none", "":
		// ok
	default:
		return fmt.Errorf("cluster %q: unknown auth type %q (valid: mtls, tls, password, none)", clusterName, a.Type)
	}
	return nil
}
