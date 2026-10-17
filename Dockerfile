# syntax=docker/dockerfile:1.10
#
# overkube's image: its server (one file) and its page, on Node — built as CI builds it for a tag:
#
#   docker build --build-arg VERSION=0.1.1 --build-arg REVISION=$(git rev-parse HEAD) -t overkube:0.1.1 .
#
# Run with OVERKUBE_AUTH (token or oidc; loopback with OVERKUBE_LOCAL_NETWORK, published on 127.0.0.1)
# and OVERKUBE_HOSTS; HTTPS on 8443, by a certificate of its own unless one is given
# (docker/entrypoint.sh). The rest as apps/server/src/config.ts says.

# Each base by its digest as well as its tag (what is pulled is what was checked; Dependabot moves both).
# The server and the page built where the build runs (what is built is JavaScript, any platform's);
# Node itself the image's platform's — its Alpine the image's release, so its node runs there as built.
FROM --platform=$BUILDPLATFORM node:24-alpine3.24@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --ignore-scripts
RUN npm run build -w @overkube/web && npm run build -w @overkube/server

FROM node:24-alpine3.24@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS node

# Node alone (its binary and the libraries it needs): no npm, no yarn in the image.
FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
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
COPY --from=node /usr/local/bin/node /usr/local/bin/node
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
