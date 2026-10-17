# Node as `make` runs it (the checks, Storybook): node:24-alpine, and openssl — the server's tests make
# their certificates with it (CI's runner has it already).
FROM node:24-alpine
RUN apk add --no-cache openssl
