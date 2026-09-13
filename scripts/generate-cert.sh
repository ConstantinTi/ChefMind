#!/usr/bin/env bash
#
# Erzeugt eine lokale CA und ein Serverzertifikat für ChefMind.
#
# Kein Let's Encrypt: der Server steht im privaten Netz und ist von außen gar
# nicht erreichbar, also kann keine öffentliche CA ihn validieren. Ein selbst
# signiertes Zertifikat reicht — gebraucht wird es trotzdem, weil Claude Desktop
# MCP-Server nur über HTTPS anspricht und Service Worker (die PWA) außerhalb von
# localhost ebenfalls einen sicheren Kontext verlangen.
#
# Eigene CA statt eines nackten selbstsignierten Zertifikats, damit du sie genau
# einmal vertraust: neue Adressen später ändern nur das Serverzertifikat, die CA
# bleibt gültig.
#
#   ./scripts/generate-cert.sh            # anlegen, falls nicht vorhanden
#   ./scripts/generate-cert.sh --force    # neu ausstellen
#
# Zusätzliche Namen/Adressen über CHEFMIND_TLS_HOSTS (kommagetrennt).
set -euo pipefail

TLS_DIR="${CHEFMIND_TLS_DIR:-./data/tls}"
CA_DAYS=3650
# 825 Tage ist das Maximum, das Apple-Plattformen für Serverzertifikate
# akzeptieren. Alles darüber wird von Safari und iOS kommentarlos abgelehnt.
LEAF_DAYS=825
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

if ! command -v openssl >/dev/null 2>&1; then
  echo "FEHLER: openssl wird gebraucht, ist aber nicht installiert." >&2
  exit 1
fi

mkdir -p "$TLS_DIR"

names=()
add_name() {
  for n in "$@"; do
    n="$(printf '%s' "$n" | tr -d '[:space:]')"
    [ -z "$n" ] && continue
    for existing in ${names[@]+"${names[@]}"}; do
      [ "$existing" = "$n" ] && continue 2
    done
    names+=("$n")
  done
}

add_name localhost 127.0.0.1 ::1
host_short="$(hostname 2>/dev/null || true)"
[ -n "$host_short" ] && add_name "$host_short" "${host_short}.local" "$(printf '%s' "$host_short" | tr '[:upper:]' '[:lower:]')"

# Jede private Adresse dieser Maschine, inklusive Tailscale.
if command -v ip >/dev/null 2>&1; then
  while read -r addr; do add_name "$addr"; done < <(
    ip -4 -o addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | grep -vE '^127\.' || true
  )
  while read -r addr; do add_name "$addr"; done < <(
    ip -6 -o addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1 \
      | grep -iE '^(fd|fc|fe80)' || true
  )
fi

if [ -n "${CHEFMIND_TLS_HOSTS:-}" ]; then
  IFS=',' read -ra extra <<< "$CHEFMIND_TLS_HOSTS"
  add_name ${extra[@]+"${extra[@]}"}
fi

# DNS: für Namen, IP: für Adressen — openssl unterscheidet die beiden strikt,
# und ein Name im IP-Feld macht das Zertifikat stillschweigend unbrauchbar.
san=""
for n in "${names[@]}"; do
  if printf '%s' "$n" | grep -qE '^[0-9]+(\.[0-9]+){3}$' || printf '%s' "$n" | grep -q ':'; then
    san="${san}${san:+,}IP:${n}"
  else
    san="${san}${san:+,}DNS:${n}"
  fi
done

if [ -f "$TLS_DIR/server.crt" ] && [ "$FORCE" -eq 0 ]; then
  echo "Zertifikat vorhanden: $TLS_DIR/server.crt"
  echo "Gültig bis: $(openssl x509 -enddate -noout -in "$TLS_DIR/server.crt" | cut -d= -f2)"
  echo "Namen:"
  openssl x509 -noout -ext subjectAltName -in "$TLS_DIR/server.crt" | tail -n +2 | sed 's/^/  /'
  echo
  echo "Neu ausstellen (z. B. nach einem Adresswechsel): $0 --force"
  exit 0
fi

if [ ! -f "$TLS_DIR/ca.crt" ] || [ "$FORCE" -eq 1 ]; then
  echo "Lege lokale CA an…"
  openssl req -x509 -newkey rsa:4096 -sha256 -days "$CA_DAYS" -nodes \
    -keyout "$TLS_DIR/ca.key" -out "$TLS_DIR/ca.crt" \
    -subj "/CN=ChefMind lokale CA/O=ChefMind" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
fi

echo "Stelle Serverzertifikat aus für:"
printf '  %s\n' "${names[@]}"

openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout "$TLS_DIR/server.key" -out "$TLS_DIR/server.csr" \
  -subj "/CN=${host_short:-chefmind}/O=ChefMind" 2>/dev/null

openssl x509 -req -in "$TLS_DIR/server.csr" \
  -CA "$TLS_DIR/ca.crt" -CAkey "$TLS_DIR/ca.key" -CAcreateserial \
  -out "$TLS_DIR/server.crt" -days "$LEAF_DAYS" -sha256 \
  -extfile <(printf '%s\n' \
    "basicConstraints=CA:FALSE" \
    "keyUsage=critical,digitalSignature,keyEncipherment" \
    "extendedKeyUsage=serverAuth" \
    "subjectAltName=${san}") 2>/dev/null

rm -f "$TLS_DIR/server.csr"
# Der Container liest die Dateien als unprivilegierter Benutzer; der Key bleibt
# trotzdem so eng wie möglich.
chmod 600 "$TLS_DIR/ca.key" "$TLS_DIR/server.key"
chmod 644 "$TLS_DIR/ca.crt" "$TLS_DIR/server.crt"

echo
echo "Fertig. Gültig bis $(openssl x509 -enddate -noout -in "$TLS_DIR/server.crt" | cut -d= -f2)"
echo
echo "Diese Datei muss der Client kennen, damit er nicht meckert:"
echo "  $(cd "$TLS_DIR" && pwd)/ca.crt"
