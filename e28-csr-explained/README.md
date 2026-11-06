# E28: CSR explained: what a certificate request proves

The files for the demos in the video *CSR explained: what a certificate request proves* (playlist [Certificates with OpenSSL](https://www.youtube.com/playlist?list=PLLS8NgEPSNY0)).

## Run it

```bash
mkdir e28 && cd e28
bash /path/to/lab-files.sh
```

Needs OpenSSL 3 or newer (not LibreSSL). Run it once, in an empty folder.

## What it makes

| File | What it is |
|---|---|
| `ca.key`, `ca.pem` | the lab CA: its private key and its certificate ("E28 Test Root CA") |
| `ca.cnf` | the CA's settings for `openssl ca`, with `copy_extensions = none` |
| `ca-copy.cnf` | the same settings with `copy_extensions = copy`, for the chapter on what a CA copies from a request |
| `index.txt`, `serial`, `newcerts/` | the files the CA keeps: its list of signed certificates, the next serial number, and a copy of each certificate |
| `sneaky.key`, `victim.key`, `victim.csr` | two keys and a request for the last demo |

The other commands (making a key, a request, reading it, signing it) are typed in the video, step by step.

The keys are throwaway test keys. Never use them for anything real.
