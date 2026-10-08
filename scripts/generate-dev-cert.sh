#!/bin/sh
set -eu

cert_dir=".certs"
ca_key="$cert_dir/matcha-local-ca.key"
ca_cert="$cert_dir/matcha-local-ca.pem"
server_key="$cert_dir/dev-key.pem"
server_cert="$cert_dir/dev-cert.pem"
server_csr="$cert_dir/dev-cert.csr"
extensions="$cert_dir/dev-cert.ext"

find_lan_ip() {
  if [ -n "${MATCHA_LAN_IP:-}" ]; then
    printf '%s\n' "$MATCHA_LAN_IP"
    return
  fi

  if command -v ipconfig >/dev/null 2>&1 && command -v route >/dev/null 2>&1; then
    interface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
    if [ -n "${interface:-}" ]; then
      ipconfig getifaddr "$interface" 2>/dev/null && return
    fi
  fi

  if command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "${ip:-}" ]; then
      printf '%s\n' "$ip"
      return
    fi
  fi

  if command -v ifconfig >/dev/null 2>&1; then
    ip=$(ifconfig 2>/dev/null |
      awk '/inet / && $2 !~ /^127\./ && $2 !~ /^169\.254\./ { print $2; exit }')
    if [ -n "${ip:-}" ]; then
      printf '%s\n' "$ip"
      return
    fi
  fi

  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null |
      awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}'
  fi
}

command -v openssl >/dev/null 2>&1 || {
  echo "OpenSSL is required to generate the local HTTPS certificate." >&2
  exit 1
}

lan_ip=$(find_lan_ip || true)
if [ -z "$lan_ip" ]; then
  echo "Could not determine the LAN IP. Connect to a network and try again." >&2
  exit 1
fi

mkdir -p "$cert_dir"
chmod 700 "$cert_dir"

if [ ! -f "$ca_key" ] || [ ! -f "$ca_cert" ]; then
  echo "Creating the Matcha local development certificate authority..."
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
    -keyout "$ca_key" \
    -out "$ca_cert" \
    -days 3650 \
    -subj "/CN=Matcha Local Development CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" >/dev/null 2>&1
  chmod 600 "$ca_key"
  chmod 644 "$ca_cert"
fi

needs_certificate=true
if [ -f "$server_key" ] && [ -f "$server_cert" ] && \
   openssl x509 -in "$server_cert" -noout -checkend 86400 >/dev/null 2>&1 && \
   openssl x509 -in "$server_cert" -noout -ext subjectAltName 2>/dev/null | grep -Fq "IP Address:$lan_ip"; then
  needs_certificate=false
fi

if [ "$needs_certificate" = true ]; then
  echo "Issuing an HTTPS certificate for localhost and $lan_ip..."
  openssl req -newkey rsa:2048 -sha256 -nodes \
    -keyout "$server_key" \
    -out "$server_csr" \
    -subj "/CN=Matcha Local Development" >/dev/null 2>&1

  printf '%s\n' \
    "basicConstraints=critical,CA:FALSE" \
    "keyUsage=critical,digitalSignature,keyEncipherment" \
    "extendedKeyUsage=serverAuth" \
    "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$lan_ip" > "$extensions"

  openssl x509 -req -sha256 \
    -in "$server_csr" \
    -CA "$ca_cert" \
    -CAkey "$ca_key" \
    -CAcreateserial \
    -out "$server_cert" \
    -days 825 \
    -extfile "$extensions" >/dev/null 2>&1

  chmod 600 "$server_key"
  chmod 644 "$server_cert"
  rm -f "$server_csr" "$extensions" "$cert_dir/matcha-local-ca.srl"
fi

echo "HTTPS certificate ready for $lan_ip."
