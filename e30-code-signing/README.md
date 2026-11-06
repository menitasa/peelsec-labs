# E30: How code signing works: sign your own script

The files the video calls "set up before this video", for *How code signing works: sign your own script* (playlist [Certificates with OpenSSL](https://www.youtube.com/playlist?list=PLLS8NgEPSNY0)).

## Run it

```bash
mkdir e30 && cd e30
bash /path/to/lab-files.sh
```

Needs **OpenSSL 3.2 or newer** (the `codesign` check came in 3.2; not LibreSSL). Run it once, in an empty folder.

## What it makes

| File | What it is |
|---|---|
| `ca.key`, `ca.pem` | the lab CA ("E30 Test Root CA") |
| `tsa.key`, `tsa.pem`, `tsa.cnf`, `tsaserial` | the lab timestamp authority ("E30 Test TSA"): its key, its certificate from the lab CA (Extended Key Usage `timeStamping`), its settings for `openssl ts`, and its serial number |
| `web.pem` | a server certificate (`web.localhost`): the wrong role for signing code |
| `nc.pem` | a code-signing certificate whose Key Usage is not marked critical |
| `other.pem` | the root of another CA, which the checker doesn't trust |

The code-signing certificate itself, the script and its signature are made in the video, step by step.

The keys are throwaway test keys. Never use them for anything real.
