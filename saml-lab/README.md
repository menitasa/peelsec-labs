# SAML lab

The lab from PeelSec's SAML videos: SAML single sign-on the way it works at work, on your own computer.

- **Example Corp** (`idp.localhost`): a small identity provider (IdP), like Okta or Microsoft Entra ID. Employees sign in and open their apps; an admin sets up each app's single sign-on in **Applications**.
- **Expenses** (`app.localhost`): an app the company uses for expense reports, the service provider (SP). Its admin sets up single sign-on in its **Single sign-on** settings.

Test user: John Doe, **`j.doe@example.com`**, password **`lab-password`**. Expenses' own account for him: **`jdoe`**, password **`expenses-password`**. Test data only.

> [!WARNING]
> **For learning only. Never deploy this, and never copy its code into a real app.**
> To show why each SAML check matters, the lab has switches that turn checks off on purpose: send the answer unsigned, let an assertion expire in 10 seconds, accept answers nobody asked for, send the same response again, set the Audience, Issuer or reply address wrong. A real app must never have them. The lab listens only on your own computer (127.0.0.1 and ::1), reads metadata only from `*.localhost` addresses, and its keys are throwaway test keys made on your computer.

## Start

You need Node.js 24 or newer (it runs the TypeScript directly, no build step) and `openssl` on your PATH. Get this folder (clone the repo, or download it as a ZIP from GitHub), then:

```sh
cd saml-lab
npm install        # once
npm start
```

Open the lab home, **https://localhost** (port 443 when it's free, else 8443: the start line prints the addresses). `PORT=9443 npm start` picks another port. Plain http only sends the browser on to https. Chrome, Edge and Firefox send any `*.localhost` address to your own computer by themselves, so there is no hosts file to edit. (Safari may not: use Chrome.)

The first start makes the lab's keys in `keys/` (not in git). Delete that folder to start fresh with new keys.

## The certificate warning

The lab runs on https with its own certificate authority (CA), made on your computer at the first start. Your browser doesn't know it, so it warns on each lab address. You have two choices:

1. **Click through the warning** (Advanced, then Proceed to localhost). Nothing changes on your computer. This is the safe default.
2. **Trust the lab's CA**, so the browser shows the lab with no warning. On a Mac (it asks for your password):

   ```sh
   security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db keys/lab-ca.crt
   ```

   **What this changes:** your computer now trusts any certificate this CA signs. The CA is limited by name constraints to `localhost` and names under it, so even someone with a copy of its key can't make a certificate your browser would accept for a real website. Its key is in `keys/` on your computer only: keep it there.

   **To undo it:** Keychain Access, login keychain, Certificates, delete "PeelSec SAML lab CA v2 (test only, localhost only)". Or in the terminal: `security delete-certificate -c "PeelSec SAML lab CA v2 (test only, localhost only)"`. Do it when you're done with the lab, or if you delete `keys/` (a new start makes a new CA).

On Windows or Linux, use choice 1, or add `keys/lab-ca.crt` to your browser's own certificate settings and remove it the same way afterwards.

## Two starting points

The lab home has two resets (both sign everyone out and clear what arrived):

- **Reset: everything set up**: Expenses is an application in Example Corp, and Expenses trusts Example Corp. This is how the lab starts.
- **Reset: start empty**: Example Corp has no applications, and Expenses trusts no identity provider. To do the setup yourself, from the start.

From the terminal, in this folder: `curl -s --cacert keys/lab-ca.crt 'https://localhost:8443/reset?to=empty'` (or `to=ready`; use the port the start line printed).

## Setting up single sign-on from zero

The same steps as with Okta or Entra ID and a real app:

1. **In Expenses**, Single sign-on, step 1: its details for the identity provider. The metadata URL holds them all (`https://app.localhost/metadata.xml`, with the port if there is one); or the identifier (entity ID) and the reply URL (ACS URL).
2. **In Example Corp**, Applications, Add a SAML application: a name, and Expenses' metadata URL (or paste the XML, or type the identifier and the reply URL).
3. **On the application's page**: the Name ID, the attributes, what to sign, and encryption. Section 6 shows Example Corp's details for the app: its identifier, login URL, metadata URL and signing certificate.
4. **In Expenses**, Single sign-on, step 2: Example Corp's metadata URL (or its identifier, login URL and certificate), turn "Sign in with SSO" on, and save.
5. **Expenses' home**: Sign in with Example Corp, as `j.doe@example.com`. "See what arrived" shows the assertion and every check.

A metadata URL must be a lab address (`localhost` or a name ending in `.localhost`). For anything else the lab says so: paste the XML instead.

## The pages

| Address | What it shows |
|---|---|
| `localhost/` | The lab home: both sides, what's set up now, and the two resets |
| `idp.localhost/` | Sign in, then **My apps**: a tile per application, which starts the sign-in at Example Corp (IdP-initiated) |
| `idp.localhost/admin/apps` | **Applications**: the apps, and **Add a SAML application** |
| `idp.localhost/admin/apps/<app>` | One application's single sign-on: the seven sections below |
| `idp.localhost/sso/<app>` | The app's own sign-in address, as Okta and Google give each app |
| `idp.localhost/admin/users` | **Users**: John's profile (sign-in name, email, employee ID, Example Corp's own user ID), **Change John's email**, and his four groups |
| `idp.localhost/request` | The last request from an app, decoded |
| `idp.localhost/metadata` | Example Corp's metadata, laid out; `/metadata.xml` is the file, `/certificate.crt` the signing certificate |
| `app.localhost/` | Expenses: "Single sign-on isn't set up yet", **Sign in with Example Corp**, or, signed in, what Expenses knows about John and his expense reports (and, with the Approvers rule on, a colleague's report to approve) |
| `app.localhost/login`, `/acs`, `/acs/2` | The request to the identity provider (HTTP Redirect binding), and the answer (HTTP POST binding), with Expenses' checks |
| `app.localhost/arrived` | **What arrived**: what the browser carried (base64), the encrypted assertion and how it was opened, the assertion with each part labeled, Expenses' checks, and **Send the same response again** |
| `app.localhost/admin/sso` | **Single sign-on**: its details for the identity provider, the identity provider it trusts, and its switches |
| `app.localhost/admin/users` | **Users**: Expenses' accounts and its links (which Name ID from which identity provider opens which account) |
| `app.localhost/link` | A name Expenses doesn't know: sign in once with the Expenses account (`jdoe`, `expenses-password`), and the name is linked to it |
| `app.localhost/metadata` | Expenses' metadata, laid out; `/metadata.xml` is the file, `/encryption.crt` its encryption certificate |

## An application in Example Corp

Each setting is named by what it does in SAML, and a "Called:" line under it gives its label on Okta, Microsoft Entra ID and Google Workspace (from each vendor's own docs, checked 2026-10-29).

| Section | What it sets |
|---|---|
| 1. Where the answer goes | The reply address (Assertion Consumer Service URL); Recipient and Destination; more reply addresses by number; Default RelayState |
| 2. Who is who | The app's name (entity ID), which goes into every answer as its Audience; Example Corp's own name (the Issuer) |
| 3. Who the user is | The Name ID (which of John's fields, and the format: Unspecified, Email address, Persistent, Transient), the attributes and their names, and a group attribute with a filter |
| 4. How it's protected | What to sign (the assertion, the whole response, both); encrypt the assertion with the app's certificate; check the app's signed requests |
| 5. The sign-in | Obey the app's "sign in again" (ForceAuthn); the authentication context class |
| 6. Set up the app | Example Corp's identifier, login URL, metadata URL and signing certificate, with Copy buttons |
| 7. Lab options, test only | 10 minutes, 1 minute or 10 seconds to use an assertion; send it unsigned; stop on the form, to show what the browser carries |

**Expenses' side** (its Single sign-on settings): sign every request; ask for a fresh sign-in every time; ask for the answer at reply address number 1; accept answers nobody asked for (a sign-in started at the identity provider, on by default); **What must be signed** (either one, the whole response, the assertion, or both); **A name Expenses has no account for** (link it after one sign-in with the Expenses password, make a new account, or refuse); **Approvers** (an attribute and a value that show the Approve button; the button does nothing when clicked).

## Errors to show, as at work

- **"This app isn't set up in Example Corp"**: an app sends a request, and no application in Example Corp has its identifier.
- **"The reply URL doesn't match"**: the app asks for the answer at one address, and Example Corp has another for it.
- **"This request must be signed"** and **"The request's signature doesn't match"**.
- **"No reply address number N"**.
- **A wrong Audience, Issuer, Recipient or Destination**: set one wrong in Example Corp, and Expenses turns the answer away with that check.
- **"The response isn't signed"** and **"The assertion isn't signed"**: Expenses requires one, and Example Corp signs the other.
- **"No account for this name"**, or **a second, empty account** after John's email changes.
- **"An answer to our own request"**: Expenses takes only answers to its own requests, and the sign-in started at Example Corp's tile.
- **Expenses turns an answer away** with the check that failed: a copy sent twice, an expired one (10 seconds), an unsigned one, or a signature that doesn't match the certificate in Expenses' settings.

## Expenses' checks

In this order, on what arrives at `/acs`: the encrypted assertion opens with Expenses' private key; it is **signed by the identity provider** (checked with the certificate in Expenses' settings, never with a certificate inside the message); **made by** it (Issuer); it **says the sign-in worked** (Status); **meant for this app** (Audience); **inside its time window** (Conditions, and the confirmation's NotOnOrAfter); **sent to this address** (Recipient and Destination); **an answer to our own request** (InResponseTo), or started at the identity provider when there is none; **not used before** (the assertion's ID). When the signature or the opening fails, the checks after it say "Not checked".

After a signature checks out, Expenses reads only what that signature covers (`getSignedReferences()` in xml-crypto 6), not the rest of the message, and it takes exactly one assertion. That is its defense against XML signature wrapping, and it has no switch to turn it off.

## Where the lab is its own, not SAML's

- **A request takes one answer only.** Expenses forgets a request once it is answered, so a copy also fails "An answer to our own request". The standard asks only that InResponseTo match the app's own request; its rule against copies is the used IDs.
- **What an app does with a name it doesn't know**, and **what must be signed**, are each app's own choice; SAML names no such settings. The error words are the lab's.
- **Groups** follow Okta's filter idea, because it's the plainest, and send group names (Entra ID sends an object ID by default).
- **No MFA.** John signs in with a password only, so the assertion says `PasswordProtectedTransport`.
- **No `validUntil` or `cacheDuration` in the metadata**, which the metadata standard asks for; real metadata has one.
- **Encryption** is XML Encryption: the assertion with a new AES-256-GCM key, that key with the app's public key (RSA-OAEP).
- Signatures are RSA-SHA256 with exclusive canonicalization. The entity IDs are the sites' own addresses.

## Files

| File | What it is |
|---|---|
| `src/lab.ts` | The start: one server for the three addresses, the lab home and its resets |
| `src/idp.ts` | Example Corp: sign-in, My apps, the response page, Applications, Users, the last request, metadata |
| `src/app.ts` | Expenses: the request, `/acs` and the account it opens, the link page, Users, What arrived, Single sign-on settings, metadata |
| `src/saml.ts` | The SAML: the request, the response, signing, encryption, the app's checks, metadata |
| `src/fetchmeta.ts` | Reads metadata from a lab address an admin typed (`*.localhost` only) |
| `src/xmlview.ts` | XML laid out for the screen, with an assertion's parts labeled |
| `src/ui.ts` | The look: both brands, the icons, the page layout |
| `src/config.ts`, `src/state.ts`, `src/keys.ts` | The names, John, and the settings; what the lab remembers while it runs, and the resets; the keys |
| `keys/` | Made on the first start with openssl: the SAML keys, the lab's CA and its https certificate, and the secret for persistent names. Not in git |

Packages, at fixed versions: hono 4.13.13, @hono/node-server 2.1.5, xml-crypto 6.4.0, @xmldom/xmldom 0.9.12; for `npm run check` (the type check), typescript 7.0.2 and @types/node 26.6.5.

Everything the lab knows lives in memory while it runs; stop it (Ctrl+C) and it's gone, except `keys/`.
