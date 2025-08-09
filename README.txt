# Budget Tracker PWA (Face ID, No CloudKit)

- Face ID/Touch ID gate via WebAuthn (HTTPS origin required).
- Offline, installable PWA. Data stored locally (IndexedDB).
- Envelopes, move funds, caps, CSV import/export.

## Deploy to GitHub Pages (Deploy from branch)
1) Create a public repo, upload all files to the **root**.
2) Settings → Pages → Build & deployment: **Deploy from a branch**.
   Branch: `main`, Folder: `/ (root)` → Save.
3) Wait ~1 minute. Visit `https://<user>.github.io/<repo>/`.

If you change JS, bump the cache name in `sw.js`.
