#!/bin/bash
# E28, "CSR explained: what a certificate request proves": the files the demos use.
# Run it once, in an EMPTY folder, with OpenSSL 3 or newer (not LibreSSL, the Mac's own openssl):
#     bash lab-files.sh
# It makes, in the current folder, with test names only (E28 Test Root CA, victim.localhost):
#   ca.key, ca.pem               the lab CA (its private key and its certificate)
#   ca.cnf, ca-copy.cnf          the CA's settings; ca-copy.cnf is the same with copy_extensions = copy
#   index.txt, serial, newcerts/ the files the CA keeps
#   sneaky.key, victim.key       two keys for the last demo, and victim.csr, a request made with victim.key
# These keys are throwaway test keys for this video. Never use them for anything real.
set -e
v="$(openssl version)"
case "$v" in
  *LibreSSL*) echo "This openssl is LibreSSL ($v). Install a newer one (brew install openssl) and run this again with that one first on your PATH." >&2; exit 1 ;;
esac
for f in ca.key ca.pem ca.cnf ca-copy.cnf index.txt serial newcerts sneaky.key victim.key victim.csr; do
  if [ -e "$f" ]; then echo "$f is already here. Run this in an empty folder." >&2; exit 1; fi
done
# the files the CA keeps
mkdir newcerts
: > index.txt
echo 01 > serial
# the CA's settings
cat > ca.cnf <<'EOT'
[ ca ]
default_ca = CA_default

[ CA_default ]
dir = .
database = ./index.txt
new_certs_dir = ./newcerts
serial = ./serial
certificate = ./ca.pem
private_key = ./ca.key
default_md = sha256
default_days = 30
policy = pol
unique_subject = no
copy_extensions = none

[ pol ]
commonName = supplied
organizationName = optional

[ leaf ]
basicConstraints = critical,CA:FALSE

[ leaf2 ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
EOT
sed 's/^copy_extensions = none$/copy_extensions = copy/' ca.cnf > ca-copy.cnf
EC="-algorithm EC -pkeyopt ec_paramgen_curve:P-256"
# the lab CA
openssl genpkey $EC -out ca.key
openssl req -x509 -new -key ca.key -sha256 -days 3650 -subj "/CN=E28 Test Root CA/O=PeelSec Lab" \
  -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign -out ca.pem
# the keys and the request for the last demo
openssl genpkey $EC -out sneaky.key
openssl genpkey $EC -out victim.key
openssl req -new -key victim.key -subj "/CN=victim.localhost/O=PeelSec Lab" -out victim.csr
echo "Done. Made: ca.key ca.pem ca.cnf ca-copy.cnf index.txt serial newcerts/ sneaky.key victim.key victim.csr"
