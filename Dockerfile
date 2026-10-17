# syntax=docker/dockerfile:1.10
#
# overkube's image: its server (one file) and its page, on Node — built as CI builds it for a tag:
#
#   docker build --build-arg VERSION=0.1.0 --build-arg REVISION=$(git rev-parse HEAD) -t overkube:0.1.0 .
#
# Run with OVERKUBE_AUTH (token or oidc) and OVERKUBE_HOSTS; HTTPS on 8443, by a certificate of its
# own unless one is given (docker/entrypoint.sh). The rest as apps/server/src/config.ts says.

# Node's Alpine and the image's the same release: its node runs there as built.
FROM node:24-alpine3.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --ignore-scripts
RUN npm run build -w @overkube/web && npm run build -w @overkube/server

# Node alone (its binary and the libraries it needs): no npm, no yarn in the image.
FROM alpine:3.24
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="overkube" \
      org.opencontainers.image.description="A dashboard for Kubernetes clusters" \
      org.opencontainers.image.source="https://github.com/overweave/overkube" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION"
RUN apk add --no-cache libstdc++ openssl \
 && addgroup -g 1000 node && adduser -u 1000 -G node -D -H node \
 && mkdir -p /var/lib/overkube/tls && chown node:node /var/lib/overkube/tls
COPY --from=build /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    OVERKUBE_VERSION=$VERSION \
    OVERKUBE_HOST=0.0.0.0 \
    OVERKUBE_PORT=8443 \
    OVERKUBE_UI=/app/ui
WORKDIR /app
COPY --from=build /src/apps/server/dist/overkube.mjs /src/apps/server/dist/overkube.mjs.map ./
COPY --from=build /src/apps/web/dist ./ui
COPY docker/entrypoint.sh /usr/local/bin/overkube
USER node
EXPOSE 8443
# Plain HTTP answers health on the same port, by any name.
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null "http://127.0.0.1:$OVERKUBE_PORT/healthz" || exit 1
ENTRYPOINT ["overkube"]
