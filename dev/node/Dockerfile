# Node as `make` runs it (the checks, Storybook): node:24-alpine, openssl — the server's tests make
# their certificates with it (CI's runner has it already) — and ssh-keygen, the seed's git keys made with it.
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
RUN apk add --no-cache openssl openssh-keygen
