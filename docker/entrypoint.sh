#!/bin/sh
# overkube's image: its certificate, when none is given (OVERKUBE_TLS_CERT and OVERKUBE_TLS_KEY) and
# no proxy ends TLS (OVERKUBE_TLS=off) — self-signed by openssl for the names it is reached by
# (OVERKUBE_HOSTS), kept in OVERKUBE_TLS_DIR (a volume there: the same one after a restart; made
# anew when those names change) — then the server, in this process's place (its signals its own).
set -eu

if [ -z "${OVERKUBE_TLS_CERT:-}${OVERKUBE_TLS_KEY:-}" ] && [ "${OVERKUBE_TLS:-}" != off ] && [ -n "${OVERKUBE_HOSTS:-}" ]; then
  dir="${OVERKUBE_TLS_DIR:-/var/lib/overkube/tls}"
  names=""
  for name in $(echo "$OVERKUBE_HOSTS" | tr ',' ' '); do
    # A name's port dropped (dash.example.org:8443, [::1]:8443); an address an IP, any other a DNS name.
    case "$name" in
      \[*) name="${name#[}"; name="${name%%]*}" ;;
      *:*:*) ;;
      *) name="${name%%:*}" ;;
    esac
    case "$name" in
      *:*) names="${names:+$names,}IP:$name" ;;
      *[!0-9.]*) names="${names:+$names,}DNS:$name" ;;
      *) names="${names:+$names,}IP:$name" ;;
    esac
  done
  if [ ! -s "$dir/tls.crt" ] || [ "$(cat "$dir/names" 2>/dev/null)" != "$names" ]; then
    mkdir -p "$dir"
    first="$(echo "$names" | cut -d, -f1 | cut -d: -f2-)"
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 825 \
      -subj "/CN=$first" -addext "subjectAltName=$names" \
      -keyout "$dir/tls.key" -out "$dir/tls.crt" 2>/dev/null
    echo "$names" >"$dir/names"
    echo "[overkube] a self-signed certificate made for $names ($dir)"
  fi
  export OVERKUBE_TLS_CERT="$dir/tls.crt" OVERKUBE_TLS_KEY="$dir/tls.key"
fi

exec node --enable-source-maps /app/overkube.mjs "$@"
