# Firebase Editor Pro

Firebase Editor Pro is a lightweight desktop app (macOS and Windows, built with Tauri 2) to edit **Firestore documents as JSON** and the **Remote Config template as JSON**. The interface is bilingual (Español / English) and has light and dark themes.

- **Sign-in with `key.json` only.** You import the service account key of your Firebase project. There is no Google login.
- **Credential in the system keychain.** On the desktop app the key is stored only in the macOS Keychain or the Windows Credential Manager. It is never written to a plain file.
- **Small installers** (about 8 MB on macOS, under 15 MB on Windows).
- The app talks directly to the Google APIs (`firestore.googleapis.com` and `firebaseremoteconfig.googleapis.com`). There is no server in between.

## Install

Release builds are **not code-signed**, so each operating system shows a warning the first time you open the app.

### macOS

1. Download `Firebase Editor Pro_<version>_universal.dmg` (one build for Apple Silicon and Intel).
2. Open the `.dmg` and drag **Firebase Editor Pro** to `Applications`.
3. The first time, **do not double-click**. Right-click (or Control-click) the app and choose **Open**, then confirm **Open** in the dialog. This is how you get past Gatekeeper for an unsigned app.
4. If macOS still blocks it, go to **System Settings > Privacy & Security** and click **Open Anyway** next to the app name. You only need to do this once.

### Windows

1. Download `Firebase Editor Pro_<version>_x64-setup.exe` (NSIS installer).
2. Run it. If SmartScreen shows "Windows protected your PC", click **More info** (*Más información*) and then **Run anyway** (*Ejecutar de todas formas*).
3. The app needs **Microsoft WebView2**. It is already included in Windows 11 and in up-to-date Windows 10. If it is missing, the installer downloads it. You can also install the Evergreen runtime from Microsoft.

## Import your `key.json`

1. In the Firebase console open **Project settings > Service accounts**.
2. Click **Generate new private key** and save the JSON file.
3. Open the app and click **Import key.json**, then pick that file.
4. The app checks the key, requests a token from Google and shows the project name and its collections. The key is saved in the system keychain, so you stay connected after you restart the app.
5. **Sign out** returns to the welcome screen and keeps your saved keys in the keychain.

The service account needs IAM roles for what you want to do: for example *Cloud Datastore User* for Firestore and *Firebase Remote Config Admin* for Remote Config. The default Firebase Admin SDK account has both. If a role is missing the app explains the 403 error and what to grant.

> **Keep your key private.** Anyone with `key.json` has admin access to your project. Do not share it, and do not put it inside this repository.

## Basic use

Use the **Areas** switcher to move between Firestore and Remote Config. Language and theme are in the top bar.

### Firestore editor

- Browse collections, documents and subcollections in the tree. Use **Load more** for long collections.
- Open a document to see it as a **Table** (typed fields you can expand, edit, add and delete) or as **JSON** (a code editor with **Format** and **Repair**).
- Special Firestore types are written as tags, for example `{"__type__": "timestamp", "__value__": "2026-09-30T12:34:56Z"}`. Supported tags: `timestamp`, `geopoint`, `reference`, `bytes`, `integer`, `double`, `nan`, `infinity`, `-infinity`. Large integers (int64) keep their exact value.
- **Save** can send only the **modified fields** or the **full document**. Each save checks the document's `updateTime`. If someone else changed the document, a conflict dialog lets you **Reload** (discard your edits) or **Force save** (overwrite).
- Create documents, collections and subcollections, and delete documents or whole collections (with a count and a confirmation).
- **Export JSON / Export collection** and **Import JSON / Import collection** move data to and from files (limit 32 MiB per file).

### Remote Config editor

- The whole template (conditions, parameters, conditional values) is shown as JSON, with the current **ETag** and version.
- **Validate** checks the template locally and with Remote Config (nothing is published). **Publish** asks for an optional version description and always sends the ETag.
- If the template changed in Remote Config since you loaded it, the conflict dialog lets you **Reload** (your edits are re-applied to the new template) or **Force publish**.
- The **Versions** list shows the history, and **Rollback** restores an older version as a new one.
- **Download defaults (JSON)** saves the default values file.

## Development

Requirements: Node 24 with npm, the Rust toolchain (`rustup`), and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm install

npm run dev          # browser mode at http://127.0.0.1:1420 (localStorage + WebCrypto adapters, Google APIs through the Vite proxy)
npm run tauri dev    # native window with the real keychain and HTTP plugin

npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest unit tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests (keychain roundtrip, JWT, file commands)
```

Run all checks at once:

```bash
npm run typecheck && npm run lint && npm run test && cargo test --manifest-path src-tauri/Cargo.toml
```

### Integration tests against a real project

`tests-integration/` talks to a real Firebase project. It is skipped automatically when `dev-secrets/test-key.json` is missing. Tests only write documents and Remote Config entries whose names start with `fbep_test_`, and they clean up after themselves. Use a test project, never production data.

### Build installers

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # once, on macOS
CI=true npm run tauri build -- --target universal-apple-darwin   # macOS universal .app + .dmg
npm run tauri build -- --bundles nsis                            # Windows NSIS installer
```

On macOS, `CI=true` skips the Finder styling step of the `.dmg` bundler, which fails in headless shells. Bundles are written under `src-tauri/target/<target>/release/bundle/`.

### Release

The `release` workflow (`.github/workflows/release.yml`) runs on every tag `v*` and can also be started by hand (**Actions > release > Run workflow**). It builds the macOS universal `.dmg` and the Windows NSIS `.exe` and uploads them as run artifacts. On a tag it also creates a **draft release** with both files.

## Do not commit `dev-secrets/`

`dev-secrets/` holds local credentials (such as `test-key.json`) for the integration tests. It is listed in `.gitignore` and **must never be committed or copied elsewhere**. Before every commit, check `git status` and make sure nothing under `dev-secrets/` is staged. To audit the repository:

```bash
git ls-files | grep '^dev-secrets/'                       # must print nothing
git grep -n -e '-----BEGIN [A-Z ]*PRIVATE KEY' -e 'MII[E]'    # must print nothing
```

If a key was ever committed or shared, revoke it in the Firebase console (Service accounts > manage keys) and create a new one.

## Manual acceptance checklist

1. Install the `.dmg` (or `.exe`), open the app natively with the right-click > Open flow, and confirm the window appears and stays open.
2. Import a `key.json`. Confirm the project name and the collection list appear.
3. Quit the app completely (Cmd+Q on macOS) and open it again. Confirm it connects without asking for the key again (the credential persisted in the keychain).
4. Switch the language selector between Español and English. Confirm the whole interface changes immediately and the choice is kept after a restart.
5. Click **Disconnect** and confirm. Restart the app and confirm it shows the welcome screen again.
6. Remote Config in the native app: connect an account, open **Remote Config**, and confirm the template loads with its ETag and version visible and without the "Offline" notice.
