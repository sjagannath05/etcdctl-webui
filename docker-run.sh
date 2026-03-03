#!/usr/bin/env bash
set -euo pipefail

IMAGE="etcd-webui"
CONTAINER="etcd-webui"

# Build the image
docker build -t "$IMAGE" .

# Remove any existing container with the same name
docker rm -f "$CONTAINER" 2>/dev/null || true

# Run
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p 8080:8080 \
  -v "$(pwd)/config:/config:ro" \
  -v "$(pwd)/certs:/certs:ro" \
  -e CONFIG_PATH=/config/config.yaml \
  "$IMAGE"

echo "etcd Web UI running at http://localhost:8080"
