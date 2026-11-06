# PeelSec labs

The files and setup scripts for the [PeelSec](https://www.youtube.com/@PeelSec) videos, so you can follow each demo on your own computer.

PeelSec peels security one layer at a time: short explainers by Meni Tasa, one idea per video, every word explained.

## The labs

| Folder | Video | What you get |
|---|---|---|
| [`e12-private-ca`](e12-private-ca/) | Create your own certificate authority with OpenSSL | a small CA, a server and a client certificate, and local TLS and mTLS test servers |
| [`e28-csr-explained`](e28-csr-explained/) | CSR explained: what a certificate request proves | a small test CA, its settings, and the keys and request for the last demo |
| [`e30-code-signing`](e30-code-signing/) | How code signing works: sign your own script | a test CA, a test timestamp authority, and three test certificates |

All three videos are in the playlist [Certificates with OpenSSL](https://www.youtube.com/playlist?list=PLLS8NgEPSNY0).

## Before you run anything

- **Read the script first.** Each one is short and says at the top what it makes.
- **Run it in an empty folder.** It refuses to overwrite files that are already there.
- **Use a recent OpenSSL.** On a Mac, the built-in `openssl` is LibreSSL and some commands fail; install a newer one (`brew install openssl`) and put it first on your `PATH`.
- **Test only.** Every key these scripts make is a throwaway test key with a test name (`*.localhost`, "Test Root CA"). Never use them for anything real, and never trust a lab CA on a computer you care about.

## What this repo is not

The labs show how a defense works and where it ends, on your own machine. Nothing here is a tool for testing other people's systems.

## License

[MIT](LICENSE). Use it, change it, share it.
