# PeelSec labs

The files and setup scripts for the [PeelSec](https://www.youtube.com/@PeelSec) videos, so you can follow each demo on your own computer.

PeelSec peels security one layer at a time: short explainers by Meni Tasa, one idea per video, every word explained.

## The labs

| Folder | Video | What you get |
|---|---|---|
| [`e12-private-ca`](e12-private-ca/) | Create your own certificate authority with OpenSSL | a small CA, a server and a client certificate, and local TLS and mTLS test servers |
| [`e28-csr-explained`](e28-csr-explained/) | CSR explained: what a certificate request proves | a small test CA, its settings, and the keys and request for the last demo |
| [`e30-code-signing`](e30-code-signing/) | How code signing works: sign your own script | a test CA, a test timestamp authority, and three test certificates |
| [`saml-lab`](saml-lab/) | The SAML videos | a small identity provider (Example Corp) and an app (Expenses) on your own computer, with every SAML setting and the checks you can switch off to see why they matter (Node.js) |

E12, E28 and E30 are in the playlist [Certificates with OpenSSL](https://www.youtube.com/playlist?list=PLLS8NgEPSNY0).

## Before you run anything

- **Read the script first.** Each one is short and says at the top what it makes. A bigger lab (`saml-lab`) has its own README: read it first.
- **Run it in an empty folder.** It refuses to overwrite files that are already there.
- **Use a recent OpenSSL.** On a Mac, the built-in `openssl` is LibreSSL and some commands fail; install a newer one (`brew install openssl`) and put it first on your `PATH`.
- **Test only.** Every key these scripts make is a throwaway test key with a test name (`*.localhost`, "Test Root CA"). Never use them for anything real. Trust a lab CA in your system only where its README says how it is limited and how to remove it, and remove it when you're done.

## What this repo is not

The labs show how a defense works and where it ends, on your own machine. Nothing here is a tool for testing other people's systems.

## License

[MIT](LICENSE). Use it, change it, share it.
