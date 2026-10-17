# The dev cluster: KubeSolo (a single-node Kubernetes) on Alpine, as its musl
# build expects; kubectl beside it (make dev-kubectl).
FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8

ARG KUBESOLO_VERSION=v1.2.1
ARG KUBECTL_VERSION=v1.35.0
ARG TARGETARCH

RUN apk add --no-cache ca-certificates curl iptables ip6tables nftables \
 && curl -fsSL "https://github.com/portainer/kubesolo/releases/download/${KUBESOLO_VERSION}/kubesolo-${KUBESOLO_VERSION}-linux-${TARGETARCH}-musl.tar.gz" \
    | tar -xz -C /usr/local/bin kubesolo \
 && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
 && chmod +x /usr/local/bin/kubectl

ENV KUBECONFIG=/var/lib/kubesolo/pki/admin/admin.kubeconfig

COPY --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
