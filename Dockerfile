# Stage 1: Build
FROM node:22-alpine@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Ensure ONNX weights are present in the builder output. The postbuild script
# copies them from pwa/model/ when available; in a release build the weights
# are exported before this stage, and in local dev they should be in pwa/model/.
RUN if [ ! -f dist/model/fungitastic.onnx ] || [ ! -f dist/model/dima806.onnx ]; then \
        echo "ERROR: ONNX weights not found in dist/model/"; \
        exit 1; \
    fi

# Stage 2: Serve
FROM nginx:alpine@sha256:d565d19ef132a5834f5897f602831ad2e40a36c26c625f2f94f9b3fdf0ed292d

RUN rm /etc/nginx/conf.d/default.conf

COPY <<'NGINX' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers applied globally and repeated in every location block
    # because nginx add_header in a location replaces the parent headers.
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=self, microphone=(), geolocation=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_vary on;
    gzip_types text/css text/javascript application/javascript application/json application/wasm;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable, max-age=31536000" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=self, microphone=(), geolocation=()" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=self, microphone=(), geolocation=()" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }

    location /model/ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=self, microphone=(), geolocation=()" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }

    location /js/ {
        expires 1y;
        add_header Cache-Control "public, immutable, max-age=31536000" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=self, microphone=(), geolocation=()" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ /\. {
        deny all;
    }
}
NGINX

COPY --from=builder /app/dist/ /usr/share/nginx/html/

# Nginx writes its pid file as the configured user; /run/nginx.pid is not
# writable by the unprivileged nginx user, so move it under /tmp.
RUN sed -i 's|^pid.*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf

RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx/conf.d
USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/index.html || exit 1
