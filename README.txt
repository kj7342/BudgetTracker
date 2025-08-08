# Budget Tracker (PWA) — Face ID + iCloud (CloudKit) scaffold

This is a Progressive Web App you can **install on your iPhone** (Add to Home Screen). It works offline and includes a **Face ID/PIN lock** and an optional **CloudKit** sync scaffold.

## Features
- Transactions, categories (monthly caps), **envelopes** (allocation + carry − spend)
- **Move Funds**, **overspend hard block**, **auto-replenish** + **rollover**
- CSV **import/export**
- **Face ID / Touch ID** lock via **WebAuthn passkeys** (PIN fallback)
- Optional **iCloud sync** via **CloudKit JS** (requires Apple Developer setup; scaffold included)

## Install on iPhone
1. Host these files on HTTPS (Netlify, GitHub Pages, Cloudflare Pages, etc.).
2. Open the URL in **Safari** → **Share** → **Add to Home Screen** → **Add**.
3. Launch from your Home Screen. It caches for **offline** use.

## Face ID / PIN lock
- Go to **Settings → Security**.
- Tap **Set up / Update Face ID** to register a **passkey** (uses Face ID/Touch ID on this device).
- Set a **PIN** as fallback. This is a **gate**, not end-to-end encryption of data.

## iCloud (CloudKit) — optional
- Edit `cloudkit-sync.js` and fill:
  - `containerIdentifier` (e.g., `iCloud.com.your.BudgetTracker`)
  - `apiToken` (CloudKit Web token from CloudKit Dashboard)
  - `environment`: `development` or `production`
- In CloudKit Dashboard, add your **website domain** to Web Services and enable the record types you plan to use.
- In **Settings → iCloud**, enable the toggle and tap **Sync Now**. The provided code is a **scaffold**—you can extend `syncAll()` to push/pull your data.

> iCloud integration requires the **paid Apple Developer Program**. Without it, the app keeps working locally (IndexedDB).

## Dev notes
- Data is stored in **IndexedDB** (`budget-db`). Remove via Safari → Settings → Advanced → Website Data.
- Recurring transactions run **when the app opens** (PWAs don’t have reliable background tasks on iOS).

This build removes CloudKit/iCloud sync so it works without a developer account.
