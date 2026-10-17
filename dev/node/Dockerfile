# Node as `make` runs it (the checks, Storybook): node:24-alpine, and openssl — the server's tests make
# their certificates with it (CI's runner has it already).
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
RUN apk add --no-cache openssl
