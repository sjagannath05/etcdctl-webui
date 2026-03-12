.PHONY: build frontend clean release

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -s -w -X main.version=$(VERSION)

# Build frontend and embed into Go binary
frontend:
	cd frontend && npm ci && npm run build
	rm -rf static && mkdir -p static
	cp -r frontend/dist/* static/

# Build for current platform
build: frontend
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o etcd-webui .

# Build release binaries for all platforms
release: frontend
	@mkdir -p dist
	GOOS=linux   GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o dist/etcd-webui-linux-amd64 .
	GOOS=linux   GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o dist/etcd-webui-linux-arm64 .
	GOOS=darwin  GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o dist/etcd-webui-darwin-amd64 .
	GOOS=darwin  GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o dist/etcd-webui-darwin-arm64 .
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o dist/etcd-webui-windows-amd64.exe .

clean:
	rm -rf dist static/index.html static/assets etcd-webui
