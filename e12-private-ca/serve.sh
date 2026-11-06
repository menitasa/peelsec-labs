#!/bin/bash
# E12's mini lab: the test servers, openssl s_server serving www/page.txt, on this Mac only (127.0.0.1).
#   lab/serve.sh         https://e12.localhost:9443 (TLS) and :9444 (mTLS: a client certificate from the root)
#   lab/serve.sh crl     also :9445, mTLS that checks crl/ca.crl.pem (make the list first)
#   lab/serve.sh stop
set -euo pipefail
cd "$(dirname "$0")/my-ca"
if [ "${1:-}" = stop ]; then
  [ -f serve.pids ] && kill $(cat serve.pids) 2>/dev/null || true; rm -f serve.pids; echo stopped; exit 0
fi
s(){ (cd www; nohup openssl s_server -accept "127.0.0.1:$1" -cert ../certs/e12.cert.pem -key ../private/e12.key.pem -WWW -quiet "${@:2}" </dev/null >/dev/null 2>&1 & echo $! >> ../serve.pids); }
mtls=(-CAfile ../certs/ca.cert.pem -Verify 1 -verify_return_error)
if [ "${1:-}" = crl ]; then
  s 9445 "${mtls[@]}" -CRL ../crl/ca.crl.pem -crl_check; sleep 1
  echo "https://e12.localhost:9445  mTLS, checks crl/ca.crl.pem"; exit 0
fi
s 9443; s 9444 "${mtls[@]}"; sleep 1
echo "https://e12.localhost:9443  TLS"
echo "https://e12.localhost:9444  mTLS"
