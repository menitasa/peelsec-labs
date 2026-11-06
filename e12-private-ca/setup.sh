#!/bin/bash
# E12's mini lab: builds my-ca/ again from nothing (not in git), with the commands and config from explain.md.
# Test names only (e12.localhost, alice@example.com); nothing leaves this Mac; nothing is added to the Keychain.
set -euo pipefail
exec < /dev/null   # OpenSSL 4.1 asks the console for the key password when stdin is a pipe, even with -passin
cd "$(dirname "$0")"
[ -f my-ca/serve.pids ] && ./serve.sh stop >/dev/null || true
rm -rf my-ca && mkdir my-ca && cd my-ca
mkdir certs private csr newcerts crl
chmod 700 private
touch index.txt
echo 1000 > serial
echo 1000 > crlnumber
cp ../ca.cnf openssl-ca.cnf
# The root key's password, a test value in a file, so the recordings can sign with no prompt (-passin file:pass.txt).
echo test-only > pass.txt
P=(-passin file:pass.txt)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -aes256 -pass file:pass.txt -out private/ca.key.pem
chmod 400 private/ca.key.pem
openssl req -config openssl-ca.cnf -new -x509 -key private/ca.key.pem "${P[@]}" -days 3650 -extensions v3_ca -out certs/ca.cert.pem
chmod 444 certs/ca.cert.pem
ec=(-newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc)
# The server, e12.localhost (chapter 2), and Alice, the client (chapter 4).
openssl req -new "${ec[@]}" -keyout private/e12.key.pem -out csr/e12.csr.pem -subj "/CN=e12.localhost" -addext "subjectAltName=DNS:e12.localhost" 2>/dev/null
openssl ca -config openssl-ca.cnf "${P[@]}" -batch -extensions server_cert -notext -in csr/e12.csr.pem -out certs/e12.cert.pem 2>/dev/null
openssl req -new "${ec[@]}" -keyout private/alice.key.pem -out csr/alice.csr.pem -subj "/CN=alice/emailAddress=alice@example.com" -addext "subjectAltName=email:alice@example.com" 2>/dev/null
openssl ca -config openssl-ca.cnf "${P[@]}" -batch -extensions client_cert -notext -in csr/alice.csr.pem -out certs/alice.cert.pem 2>/dev/null
# A certificate Alice made herself, outside the CA (chapter 4, mtls): her name, her email and client auth, self-signed.
# The mTLS server refuses it ("unknown ca"): only the root's signature counts.
openssl req -x509 "${ec[@]}" -keyout private/alice-self.key.pem -out certs/alice-self.cert.pem -days 30 -subj "/CN=alice/emailAddress=alice@example.com" -addext "subjectAltName=email:alice@example.com" -addext "extendedKeyUsage=clientAuth" 2>/dev/null
# Two requests for the SAN demo (chapter 2), not signed yet: web asks for a SAN; sneaky also asks to be a CA.
openssl req -new "${ec[@]}" -keyout private/web.key.pem -out csr/web.csr.pem -subj "/CN=web.localhost" -addext "subjectAltName=DNS:web.localhost" 2>/dev/null
openssl req -new "${ec[@]}" -keyout private/sneaky.key.pem -out csr/sneaky.csr.pem -subj "/CN=sneaky.localhost" -addext "subjectAltName=DNS:sneaky.localhost" -addext "basicConstraints=critical,CA:TRUE" 2>/dev/null
# The capture tool runs commands with HOME here and their output into a pipe, where curl would draw its progress
# meter; in a real terminal it doesn't. This makes the recording look like the terminal.
printf 'silent\nshow-error\n' > .curlrc
# The page the servers show.
mkdir www && echo "Hello from e12.localhost" > www/page.txt
# Two empty folders where demos run the slides' commands for real (root-check: slide 6's two root commands; request:
# slide 8's request), so they never write over the lab's own root and server files.
mkdir -p root-demo/private root-demo/certs root-demo/csr && chmod 700 root-demo/private && cp openssl-ca.cnf pass.txt root-demo/
# The name constraints test (chapter 1, root-check): a request for www.google.com, which the root made on camera signs
# (x509 -req, in root-demo, so the lab's index.txt and serials stay as they were); openssl verify refuses it
# ("permitted subtree violation").
openssl req -new "${ec[@]}" -keyout root-demo/private/google.key.pem -out root-demo/csr/google.csr.pem -subj "/CN=www.google.com" -addext "subjectAltName=DNS:www.google.com" 2>/dev/null
mkdir -p request-demo/private request-demo/csr && chmod 700 request-demo/private
# The bundle demo (chapter 3): a stand-in app in Python and in Node. Each fetches one address and prints the status,
# and the page itself when it is the lab's text page.
cat > app.py <<'PY'
import sys, urllib.request, urllib.error
try:
    with urllib.request.urlopen(sys.argv[1], timeout=10) as r:
        text = r.read().decode(errors="replace").strip() if r.headers.get_content_type() == "text/plain" else ""
        print(r.status, text)
except urllib.error.URLError as e:
    print("error:", e.reason)
PY
cat > app.js <<'JS'
fetch(process.argv[2]).then(async r => {
  const text = (r.headers.get("content-type") || "").startsWith("text/plain") ? (await r.text()).trim() : "";
  console.log(r.status, text);
}).catch(e => console.log("error:", (e.cause && e.cause.code) || e.message));
JS
echo "my-ca/ ready: root, e12.localhost, alice (and her self-made one); requests web and sneaky; root-demo/ (with the google request), request-demo/, app.py, app.js"
