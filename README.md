# etcd Web UI

A lightweight, self-contained web UI for managing etcd v3 clusters. Single Docker container — Go backend with embedded React frontend.

## Features

- **Key browser** — hierarchical tree view of all keys, split on `/`
- **CRUD operations** — view, create, edit, and delete keys
- **JSON formatter** — pretty-print JSON values with one click
- **Search / filter** — instant client-side key filtering
- **Multi-cluster support** — manage multiple etcd clusters from one UI, switch with a dropdown
- **Multiple auth modes** — mTLS, TLS-only, username/password, or no auth
- **Import / Export** — dump all keys to JSON, restore from file
- **Single binary** — React build is embedded in the Go binary via `//go:embed`; no nginx, no separate process

## Quick Start

### docker-compose (recommended)

```yaml
# docker-compose.yml
services:
  etcd-webui:
    image: registry.internal.telnyx.com/playground/etcd-webui:red
    ports:
      - "8080:8080"
    volumes:
      - ./config:/config:ro
      - ./certs:/certs:ro
    environment:
      - CONFIG_PATH=/config/config.yaml
    restart: unless-stopped
```

```bash
docker-compose up
```

### docker run

```bash
docker run -d \
  --name etcd-webui \
  --restart unless-stopped \
  -p 8080:8080 \
  -v "$(pwd)/config:/config:ro" \
  -v "$(pwd)/certs:/certs:ro" \
  -e CONFIG_PATH=/config/config.yaml \
  registry.internal.telnyx.com/playground/etcd-webui:red
```

### Build from source

```bash
git clone https://github.com/sjagannath05/etcdctl-webui.git
cd etcdctl-webui
./docker-run.sh        # builds image + starts container
```

Open **http://localhost:8080**.

---

## Configuration

Create `config/config.yaml` and mount it into the container at `/config/config.yaml`.

### Multiple clusters (any auth mix)

```yaml
clusters:
  - name: "production"
    endpoints:
      - "https://172.22.8.60:12379"
      - "https://172.22.16.60:12379"
      - "https://172.22.144.60:12379"
    auth:
      type: mtls
      cacert: /certs/ca.pem
      cert: /certs/client.pem
      key: /certs/client-key.pem

  - name: "staging"
    endpoints:
      - "https://10.0.0.1:2379"
    auth:
      type: password
      username: admin
      password: secret
      cacert: /certs/staging-ca.pem   # optional server TLS verification

  - name: "dev"
    endpoints:
      - "http://localhost:2379"
    auth:
      type: none
```

### Auth modes

| `type` | Required fields | Description |
|--------|----------------|-------------|
| `mtls` | `cacert`, `cert`, `key` | Mutual TLS — client cert + server verification |
| `tls` | `cacert` | Server TLS verification only, no client cert |
| `password` | `username`, `password` | etcd RBAC credentials. Add `cacert` if the server uses TLS. |
| `none` | — | No auth, plain HTTP. For dev/internal clusters. |

### Volume mounts

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `./config/` | `/config/` | Config YAML |
| `./certs/` | `/certs/` | TLS certificates (CA, client cert, client key) |

---

## Import / Export

**Export** — click **↓ Export** in the header to download a JSON snapshot of all keys in the active cluster:

```json
{
  "cluster": "production",
  "exportedAt": "2024-11-01T12:00:00Z",
  "count": 42,
  "prefix": "",
  "keys": [
    { "key": "/config/db/host", "value": "postgres.internal" },
    { "key": "/config/db/port", "value": "5432" }
  ]
}
```

**Import** — click **↑ Import** and select a JSON file. Accepts:
- The full export format above (with `keys` array)
- A bare array: `[{ "key": "...", "value": "..." }, ...]`

Existing keys are overwritten; new keys are created. The import result shows how many keys were written and any errors.

---

## API Reference

All endpoints accept a `?cluster=<name>` query parameter. When only one cluster is configured, the parameter is optional.

| Method | Path | Query params | Body | Description |
|--------|------|-------------|------|-------------|
| `GET` | `/api/clusters` | — | — | List all configured clusters |
| `GET` | `/api/keys` | `cluster`, `prefix` | — | List keys (keys-only, no values) |
| `GET` | `/api/key` | `cluster`, `key` | — | Get a single key's value + metadata |
| `PUT` | `/api/key` | `cluster`, `key` | `{"value":"..."}` | Create or update a key |
| `DELETE` | `/api/key` | `cluster`, `key` | — | Delete a key |
| `GET` | `/api/export` | `cluster`, `prefix` | — | Export all keys with values as JSON |
| `POST` | `/api/import` | `cluster` | `{"keys":[...]}` | Bulk import key-value pairs |
| `GET` | `/health` | — | — | Health check |

### Examples

```bash
# List clusters
curl http://localhost:8080/api/clusters

# List all keys
curl "http://localhost:8080/api/keys?cluster=production"

# Filter by prefix
curl "http://localhost:8080/api/keys?cluster=production&prefix=/config"

# Get a key
curl "http://localhost:8080/api/key?cluster=production&key=/config/db/host"

# Set a key
curl -X PUT "http://localhost:8080/api/key?cluster=production&key=/config/db/host" \
  -H "Content-Type: application/json" \
  -d '{"value":"postgres.internal"}'

# Delete a key
curl -X DELETE "http://localhost:8080/api/key?cluster=production&key=/config/db/host"

# Export all keys
curl "http://localhost:8080/api/export?cluster=production" -o backup.json

# Import from file
curl -X POST "http://localhost:8080/api/import?cluster=production" \
  -H "Content-Type: application/json" \
  -d @backup.json
```

---

## Architecture

```
etcdctl-webui/
├── Dockerfile               # 3-stage: node → golang → alpine (~10 MB image)
├── docker-compose.yml
├── docker-run.sh
├── main.go                  # Gin HTTP server; //go:embed static
├── config/
│   ├── config.go            # YAML loader + validation
│   └── config.yaml          # Your cluster config (not committed if sensitive)
├── etcd/
│   └── client.go            # etcd v3 client pool, TLS helpers
├── handlers/
│   └── keys.go              # All API handlers (CRUD, export, import)
├── static/                  # Populated with React build during Docker build
└── frontend/                # React + Vite + TypeScript + Tailwind CSS
    └── src/
        ├── App.tsx
        ├── api/keys.ts
        ├── types.ts
        └── components/
            ├── ClusterSelector.tsx
            ├── KeyTree.tsx
            ├── KeyEditor.tsx
            ├── NewKeyForm.tsx
            └── DeleteDialog.tsx
```

**How the single-container build works:**

```
Stage 1 (node:20-alpine)   →  npm run build  →  frontend/dist/
Stage 2 (golang:1.22-alpine) →  copies dist/ into static/, go build (embeds it)
Stage 3 (alpine:3.19)      →  copies ~10 MB binary, done
```

The Go binary serves `/api/*` routes via Gin and falls back to the embedded React SPA for all other paths, so client-side routing works without nginx.

---

## Development

To run frontend and backend separately with hot reload:

```bash
# Terminal 1 — Go backend (requires certs + config)
go run .

# Terminal 2 — React dev server (proxies /api to :8080)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server is configured to proxy `/api` and `/health` to `http://localhost:8080`.

---

## Requirements

- Docker (for container deployment)
- Go 1.22+ and Node 20+ (for local development only)
- etcd v3 cluster
