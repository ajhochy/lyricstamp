# Release: macOS Signing & Notarization

## Overview

Signing and notarization happen in CI (GitHub Actions) only. Local `npm run electron:dist` builds are signed (if `CSC_*` env vars are set) but intentionally skip notarization — `scripts/notarize.cjs` logs `[notarize] no credentials in env — skipping notarization (local build)` and exits cleanly.

Notarization uses the **App Store Connect API key** path (preferred over Apple ID + app-specific password). The key never expires and does not require 2FA interactivity.

---

## GitHub Secrets required

The release workflow (`release-electron.yml`) reads the following 5 secrets. All must be set in **Settings → Secrets and variables → Actions** of the `ableset-lyrics-sync` repository before pushing a release tag.

| Secret name | What it contains |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded Developer ID Application certificate `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_NOTARY_KEY_CONTENT` | Raw text content of the App Store Connect API private key `.p8` |
| `APPLE_NOTARY_KEY_ID` | Key ID shown on App Store Connect (e.g. `T9GPZ92M7K`) |
| `APPLE_NOTARY_KEY_ISSUER` | Issuer UUID from App Store Connect (e.g. `c055ca8c-e5a8-4836-b61d-aa5794eeb3f4`) |

### How to obtain each

**`APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD`**

1. Open **Keychain Access** on your Mac.
2. Find your **Developer ID Application** certificate (it will show "Apple Development" or "Developer ID Application" as the type).
3. Right-click → **Export** → choose `.p12` format → set an export password (record it — this becomes `APPLE_CERTIFICATE_PASSWORD`).
4. Base64-encode it and copy to clipboard:
   ```bash
   base64 -i /path/to/cert.p12 | pbcopy
   ```
5. Paste the clipboard value as the `APPLE_CERTIFICATE` secret.

**`APPLE_NOTARY_KEY_CONTENT` + `APPLE_NOTARY_KEY_ID` + `APPLE_NOTARY_KEY_ISSUER`**

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com).
2. Navigate to **Users and Access → Integrations → App Store Connect API**.
3. Create a new key (or use an existing one) with the **Developer** role.
4. Download the `.p8` file (it can only be downloaded once — store it securely).
5. Record the **Key ID** (shown in the table, e.g. `T9GPZ92M7K`) → `APPLE_NOTARY_KEY_ID`.
6. Record the **Issuer ID** (UUID at the top of the Keys page) → `APPLE_NOTARY_KEY_ISSUER`.
7. The raw contents of the downloaded `.p8` file → `APPLE_NOTARY_KEY_CONTENT`.

### Setting secrets with `gh`

```bash
# Certificate (pipe the base64 string)
base64 -i ~/Downloads/DeveloperIDApplication.p12 | gh secret set APPLE_CERTIFICATE --repo ajhochy/ableset-lyrics-sync

# Certificate password (interactive prompt)
gh secret set APPLE_CERTIFICATE_PASSWORD --repo ajhochy/ableset-lyrics-sync

# Notary key content (pipe the .p8 file directly)
gh secret set APPLE_NOTARY_KEY_CONTENT --repo ajhochy/ableset-lyrics-sync < ~/Downloads/AuthKey_T9GPZ92M7K.p8

# Key ID and Issuer (short strings — paste inline)
gh secret set APPLE_NOTARY_KEY_ID     --repo ajhochy/ableset-lyrics-sync
gh secret set APPLE_NOTARY_KEY_ISSUER --repo ajhochy/ableset-lyrics-sync
```

---

## How to trigger a release

```bash
git tag v0.2.0
git push origin v0.2.0
```

This triggers `release-electron.yml`, which:

1. Imports the Developer ID cert into a temp keychain (no ambiguous-cert errors).
2. Writes the `.p8` to a temp file and exports `APPLE_API_KEY` (path), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
3. Runs `npm run electron:dist` → electron-vite builds → electron-builder signs → `scripts/notarize.cjs` (the `afterSign` hook) detects credentials, submits the `.app` to Apple's notary service, and staples the ticket.
4. Uploads the signed+notarized DMG and ZIP as artifacts and creates a **draft GitHub Release**.

Watch the run:
```bash
gh run watch --repo ajhochy/ableset-lyrics-sync
```

The draft release must be **manually published** (go to GitHub Releases, inspect the DMG, then click "Publish release").

---

## Local build behaviour (expected)

Running `npm run electron:dist` locally without Apple credentials produces:

```
[notarize] no credentials in env — skipping notarization (local build)
```

This is correct and intentional — local builds are not notarized. Notarization requires a Developer ID cert and an Apple notary service submission, both of which only make sense for distribution artifacts created in CI.

---

## Architecture notes

- `scripts/sign.cjs` — custom `mac.sign` hook; signs with a specific SHA-1 fingerprint to avoid ambiguous-cert errors in the login keychain.
- `scripts/notarize.cjs` — custom `afterSign` hook; notarizes only when credentials are present (CI). Uses `@electron/notarize` v2.5.0 notarytool path (API-key strategy preferred; Apple-ID fallback).
- `"mac": { "notarize": false }` in `package.json` disables electron-builder 26's **built-in** notarization path (`notarizeIfProvided`) so that only the `afterSign` hook runs. Without this, both would run and double-submit the same binary to Apple's notary service.
- See `docs/ai/decisions.md` (2026-06-05 entry "afterSign notarization hook") for the rationale.

## Troubleshooting: 401 Unauthenticated from notarytool

Notarization needs a **Team Key** (App Store Connect → Users and Access → Integrations →
**Team Keys**) with at least **Developer** role. An **Individual Key** 401s against the
team Issuer ID. Verify any key in one line (prints "Successfully received submission
history" when valid):

```
xcrun notarytool history --key AuthKey_<KEYID>.p8 --key-id <KEYID> \
  --issuer <ISSUER_ID>
```

Verified working (2026-06-05): Key ID `9XHDX3ZN44`, Issuer `0ec65016-…` →
`spctl -a` reports `accepted · source=Notarized Developer ID`. (Individual key
`R9WYMTP5I5DS` does NOT work — do not use it.)
