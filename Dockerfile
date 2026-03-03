# Stage 1 — Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build
# Output: /app/frontend/dist/

# Stage 2 — Build the Go binary with embedded frontend
FROM golang:1.22-alpine AS go-builder
WORKDIR /app

# Cache dependency downloads separately from source
COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
COPY config/ ./config/
COPY etcd/ ./etcd/
COPY handlers/ ./handlers/
COPY static/ ./static/

# Overwrite static/ with the real frontend build
COPY --from=frontend-builder /app/frontend/dist/ ./static/

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o etcd-webui .

# Stage 3 — Minimal runtime image
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=go-builder /app/etcd-webui .
EXPOSE 8080
CMD ["./etcd-webui"]
