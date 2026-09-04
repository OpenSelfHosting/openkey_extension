# OpenKey Browser Extension

Open-source MV3 extension for Chrome and Firefox. It implements the same vault protocol as the official app ([spec](https://github.com/OpenSelfHosting/OpenKey/tree/main/spec)). Download the **official desktop/mobile app** from [OpenKey Releases](https://github.com/OpenSelfHosting/OpenKey/releases) — app source is not public.

MV3 extension with:

1. **Standalone vault** — unlock with master password, sync ciphertext from your self-hosted OpenKey server
2. **Native bridge** — when the desktop OpenKey app is unlocked, fill (and save) via native messaging
3. **Autofill** — field-anchored picker matching the OpenKey app (username + masked password, Suggest password, Unlock / Manage), plus overlays, context menu, and keyboard shortcut
4. **Save / update** — capture new logins from the page and store them in the vault
5. **Passkeys** — intercepts WebAuthn `create` / `get` on sites, stores ES256 credentials in the vault (extension unlocked)
6. **Cards, crypto & secrets** — browse payment cards, crypto wallets, and developer secrets (API tokens, SSH keys, `.env`); fill card forms and token fields; copy wallet address / secrets
7. **Attachments** — list and download decrypted attachments for a login (standalone mode)
8. **Shares & orgs** — list/accept/revoke shares, list organizations and shared collections, accept invites (standalone mode)

## Develop

```bash
cd openkey_extension
npm install
npm run build
```

Load `dist/` as an unpacked extension in Chrome (`chrome://extensions`) or Firefox (`about:debugging`).

**Recent UX:** Android-style field-anchored autofill (credential rows, Suggest password, Unlock OpenKey), live lock/unlock overlay sync, Material Expressive in-page UI, toolbar lock badge, clipboard auto-clear, context-menu copy/generate, and mode-aware settings when using the desktop bridge.

## Permissions (`<all_urls>`)

The MV3 manifest requests host permission and content-script matches for `<all_urls>` so autofill, save/update capture, and passkey (WebAuthn) interception work on arbitrary sites you visit — password managers cannot know the allowlist ahead of time.

What that enables (and does not):

- **Does:** inject content scripts / page scripts on http(s) pages to detect login forms, offer fill/save, and optionally intercept WebAuthn.
- **Does not:** send page content or master passwords to OpenSelfHosting or any third party. Vault unlock and crypto stay on-device (or your self-hosted API as ciphertext only).
- Native-bridge mode never needs your master password in the extension; fill goes through the unlocked desktop app.

Store reviewers: justify `<all_urls>` as required for universal autofill + WebAuthn interception; optional site-specific host permissions would break first-visit save/fill.

### Passkeys smoke test

```bash
npx tsx src/passkey/smoke.test.ts
```

Unlock the extension, then register/sign-in on a WebAuthn demo (e.g. https://webauthn.io). OpenKey shows an in-page confirm dialog; choose **Use browser** to fall back to the platform authenticator.

## Save captured logins

After a login form submit (or login button / Enter), the content script offers an in-page banner to **Save** or **Update** the password in OpenKey. Confirming writes via:

1. **Native bridge** — when the desktop app is unlocked (`createEntry` / `updateEntry`)
2. **Standalone vault** — encrypt locally and push ciphertext through `POST /sync`

Duplicates with the same host + username + password are ignored; a changed password prompts an update.

## Native messaging

Host name: `com.openselfhosting.openkey`

While the vault is unlocked, the app writes a mode-0600 `openkey-native.token` next to the Unix socket (or under `%LOCALAPPDATA%\OpenKey\` on Windows). The native host injects that token as `auth` on every request; the app rejects unauthenticated local clients.

Manifest templates live in `native-host/`. The Flutter desktop app registers the host and answers:

- `ping` → `{ ok, unlocked }`
- `listForOrigin` → decrypted entries for the tab origin (all folders)
- `listEntries` → all decrypted login entries (optional `origin` filters like Autofill)
- `listCards` → payment cards from the reserved wallets collection
- `listCrypto` → crypto wallets from the reserved crypto collection
- `listSecrets` → developer secrets (API tokens, SSH keys, `.env`) from `__dev_secrets__`
- `getEntry` → single entry
- `createEntry` → create a login from `{ title, username, password, urls, passkey? }`
- `updateEntry` → update password/username/urls/passkey for a uuid
- `deleteEntry` → soft-delete a login by uuid
- `createSecret` / `updateSecret` / `deleteSecret` → developer secrets CRUD
- `createCard` / `updateCard` / `deleteCard` → payment cards (including bank folder)
- `createCrypto` / `updateCrypto` / `deleteCrypto` → crypto wallets (including folder)
- `updatePasskeySignCount` → bump passkey signature counter after assertion

**Native-mode limits in the extension UI:** vault folders, shares, orgs, sync, and attachments stay in the desktop app. Login/card/crypto/secret fill, create, edit, and delete, plus passkeys, work through the bridge.

### Windows

The desktop app ships `openkey_native_host.exe` next to `openkey_app.exe`. Opening **Settings → Security** (Autofill toggle) registers the host in the Chrome / Edge / Firefox registries under `HKCU\Software\...\NativeMessagingHosts\com.openselfhosting.openkey`.

For Chromium browsers, write your unpacked extension ID to:

`%LOCALAPPDATA%\OpenKey\chrome_extension_id.txt`

then tap Autofill again so the native-messaging manifest is regenerated. Firefox uses `openkey@openselfhosting.local` from `manifest.json` automatically.

Keep the OpenKey vault unlocked so the app can answer fill requests over loopback TCP.

### macOS

When the vault unlocks, OpenKey installs `openkey_native_host.py` and writes host manifests under:

- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- `~/Library/Application Support/Chromium/NativeMessagingHosts/`
- `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/`
- `~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/`
- `~/Library/Application Support/Vivaldi/NativeMessagingHosts/`
- `~/Library/Application Support/Mozilla/NativeMessagingHosts/`
- `~/Library/Application Support/librewolf/NativeMessagingHosts/`

1. Load the unpacked extension and copy its ID from the extension popup or Options page.
2. In the app: **Settings → Browser extension** — paste the ID and tap **Connect extension**.
3. Keep the vault unlocked, then in the extension tap **Use desktop app**.

Requires Python 3 on `PATH` (`#!/usr/bin/env python3`).

### Linux

The desktop app ships `openkey_native_host` next to `openkey_app`. Opening **Settings → Security** (Autofill toggle) writes host manifests under:

- `~/.config/google-chrome/NativeMessagingHosts/`
- `~/.config/google-chrome-beta/NativeMessagingHosts/`
- `~/.config/chromium/NativeMessagingHosts/`
- `~/.config/microsoft-edge/NativeMessagingHosts/`
- `~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/`
- `~/.config/vivaldi/NativeMessagingHosts/`
- `~/.mozilla/native-messaging-hosts/`
- `~/.librewolf/native-messaging-hosts/`

For Chromium browsers, write your unpacked extension ID to:

`~/.local/share/OpenKey/chrome_extension_id.txt`

then tap Autofill again. Firefox uses `openkey@openselfhosting.local` automatically.

Keep the vault unlocked so the app can answer fill requests over the Unix socket (`$XDG_RUNTIME_DIR/openkey-native.sock`).

Dev builds without the packaged host binary also install the Python host via **Settings → Browser extension**.

## Link vault / register

1. Set **Self-hosted server URL** in the popup (or Options).
2. **Create account** — registers on your server with email + master password.
3. Or **Unlock** — `POST /auth/prelogin` then login for an existing account.
4. Or **Use desktop app** — after connecting via the desktop **Settings → Browser extension**.

Paste from the app (**Settings → Browser extension → Copy offline vault link**) is optional (offline/air-gapped bootstrap). After a successful login, unlock material is cached locally; nested folders sync via collection `parent_uuid`. Decrypted entry payloads include `tags`, `fields`, `fieldOrder`, and `icon` to match the app. Cards (`type: card`), crypto wallets (`type: crypto`), and developer secrets (`type: secret`) use reserved collections `__wallets__` / `__crypto_wallets__` / `__dev_secrets__`. Attachments sync via `/sync` blobs or `GET /attachments/{uuid}/content`.
# openkey_extension
