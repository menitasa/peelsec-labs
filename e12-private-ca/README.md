# E12: Create your own certificate authority with OpenSSL

The lab for the video *[Create your own certificate authority with OpenSSL](https://youtu.be/obOPUETYzvY)* (playlist [Certificates with OpenSSL](https://www.youtube.com/playlist?list=PLLS8NgEPSNY0)): a small CA in one folder, a server and a client certificate, and local test servers for TLS and mTLS.

## Run it

```bash
./setup.sh        # makes my-ca/ from nothing (run it again any time to start over)
./serve.sh        # two test servers on this computer: 9443 (TLS) and 9444 (mTLS)
./serve.sh crl    # adds 9445: mTLS that also checks the revocation list (make the list first, as the video does)
./serve.sh stop
```

Needs OpenSSL 3 or newer (not LibreSSL) and curl. On a Mac: `brew install openssl curl`, and put them first on your `PATH` (the curl macOS ships fails mTLS against a recent OpenSSL server).

Try it, from inside `my-ca/`:

```bash
curl --cacert certs/ca.cert.pem https://e12.localhost:9443/page.txt
curl --cacert certs/ca.cert.pem --cert certs/alice.cert.pem --key private/alice.key.pem https://e12.localhost:9444/page.txt
```

## What `setup.sh` makes (in `my-ca/`)

| File | What it is |
|---|---|
| `certs/ca.cert.pem`, `private/ca.key.pem` | "PeelSec Lab Root CA": RSA 4096, the key locked with the test password in `pass.txt` (`test-only`), `CA:true, pathlen:0`, and **name constraints**: it can only vouch for names under `localhost` and addresses at `example.com` |
| `certs/e12.cert.pem`, `private/e12.key.pem` | the server, `e12.localhost` (`serverAuth`) |
| `certs/alice.cert.pem`, `private/alice.key.pem` | Alice, the client, `alice@example.com` (`clientAuth`) |
| `certs/alice-self.cert.pem` | a certificate Alice made herself, outside the CA: the mTLS server refuses it |
| `csr/web.csr.pem`, `csr/sneaky.csr.pem` | two requests, not signed: one for `web.localhost`, and one that also asks to be a CA |
| `root-demo/` | an empty CA folder for running the root commands yourself, with a request for `www.google.com`: signed by that root, `openssl verify` refuses it (the name constraint at work) |
| `request-demo/`, `app.py`, `app.js`, `www/` | a folder for the request command, a stand-in app in Python and Node, and the page the servers show |

`ca.cnf` is the CA's config, copied in as `my-ca/openssl-ca.cnf`.

## Safety

- Test names only (`e12.localhost`, `alice@example.com`). The servers listen on `127.0.0.1` only.
- Nothing is added to your system's trust store: the root is trusted only where a command names it (`--cacert`, `-CAfile`).
- The test password sits in a file only so the demos can sign without a prompt. A real CA key never does that.
- Throwaway test keys. Never use them for anything real.
