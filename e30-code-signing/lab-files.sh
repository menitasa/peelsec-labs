#!/bin/bash
# E30, "How code signing works: sign your own script": the files the video calls "set up before this video".
# Run it once, in an EMPTY folder, with OpenSSL 3.2 or newer (not LibreSSL, the Mac's own openssl):
#     bash lab-files.sh
# It makes, in the current folder, with test names only (E30 Test Root CA, E30 Test TSA, web.localhost):
#   ca.key, ca.pem                 the lab CA (its private key and its certificate)
#   tsa.key, tsa.pem, tsa.cnf      the lab timestamp authority (its key, a certificate from the lab CA, its settings), tsaserial
#   web.pem, nc.pem, other.pem     three test certificates for the "who accepts" chapter: a server certificate, a code-signing
#                                  certificate whose Key Usage is not critical, and the root of another CA
# These keys are throwaway test keys for this video. Never use them for anything real.
set -e
v="$(openssl version)"
case "$v" in
  *LibreSSL*) echo "This openssl is LibreSSL ($v). Install a newer one (brew install openssl) and run this again with that one first on your PATH." >&2; exit 1 ;;
esac
set -- $(echo "$v" | sed -n 's/^OpenSSL \([0-9][0-9]*\)\.\([0-9][0-9]*\).*/\1 \2/p')
if [ -z "$1" ] || [ "$1" -lt 3 ] || { [ "$1" -eq 3 ] && [ "$2" -lt 2 ]; }; then
  echo "These commands need OpenSSL 3.2 or newer; found: $v" >&2; exit 1
fi
for f in ca.key ca.pem tsa.key tsa.pem tsa.cnf web.pem nc.pem other.pem; do
  if [ -e "$f" ]; then echo "$f is already here. Run this in an empty folder." >&2; exit 1; fi
done
EC="-algorithm EC -pkeyopt ec_paramgen_curve:P-256"
# the lab CA
openssl genpkey $EC -out ca.key
openssl req -x509 -new -key ca.key -sha256 -days 3650 -subj "/CN=E30 Test Root CA/O=PeelSec Lab" \
  -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign -out ca.pem
sign() { openssl x509 -req -in "$1" -CA ca.pem -CAkey ca.key -set_serial "$3" -days 30 -copy_extensions copy -out "$2" 2>/dev/null; }
# a server certificate: the wrong role for code
openssl genpkey $EC -out web.key
openssl req -new -key web.key -subj "/CN=web.localhost/O=PeelSec Lab" -addext keyUsage=critical,digitalSignature \
  -addext extendedKeyUsage=serverAuth -addext subjectAltName=DNS:web.localhost -out web.csr
sign web.csr web.pem 11
# a code-signing certificate whose Key Usage is not marked critical
openssl genpkey $EC -out nc.key
openssl req -new -key nc.key -subj "/CN=Meni Test Signer/O=PeelSec Lab" -addext keyUsage=digitalSignature \
  -addext extendedKeyUsage=codeSigning -out nc.csr
sign nc.csr nc.pem 12
# the root of another CA
openssl genpkey $EC -out other.key
openssl req -x509 -new -key other.key -sha256 -days 3650 -subj "/CN=Other Test Root/O=PeelSec Lab" \
  -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign -out other.pem
# the lab timestamp authority: its own key, a certificate from the lab CA (Extended Key Usage timeStamping, critical), its settings
openssl genpkey $EC -out tsa.key
openssl req -new -key tsa.key -subj "/CN=E30 Test TSA/O=PeelSec Lab" -out tsa.csr
printf '[ tsa_ext ]\nbasicConstraints = CA:FALSE\nkeyUsage = critical,digitalSignature\nextendedKeyUsage = critical,timeStamping\n' > tsa-ext.cnf
openssl x509 -req -in tsa.csr -CA ca.pem -CAkey ca.key -set_serial 13 -days 30 -extfile tsa-ext.cnf -extensions tsa_ext -out tsa.pem 2>/dev/null
echo 01 > tsaserial
cat > tsa.cnf <<'EOT'
[ tsa ]
default_tsa = tsa_config1
[ tsa_config1 ]
dir = .
serial = ./tsaserial
crypto_device = builtin
signer_cert = ./tsa.pem
certs = ./ca.pem
signer_key = ./tsa.key
signer_digest = sha256
default_policy = 1.2.3.4.1
other_policies = 1.2.3.4.5
digests = sha256
accuracy = secs:1
ordering = yes
tsa_name = yes
ess_cert_id_chain = no
ess_cert_id_alg = sha256
EOT
# tidy: the requests and the throwaway keys the video doesn't use
rm -f web.csr web.key nc.csr nc.key other.key tsa.csr tsa-ext.cnf ca.srl
echo "Done. Made: ca.key ca.pem tsa.key tsa.pem tsa.cnf tsaserial web.pem nc.pem other.pem"
