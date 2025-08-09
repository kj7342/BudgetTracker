# Budget Tracker PWA (Face ID, No CloudKit)

This repo is prepped for **GitHub Pages** deployment.

## Quick Deploy
1. Create a new repo on GitHub (e.g. `budget-tracker-pwa`).  
2. Upload **all** files from this folder to the new repo (drag & drop on GitHub works),
   including the `.github/workflows` folder and the `.nojekyll` file.
3. Go to **Settings → Pages**: set **Source** to "GitHub Actions".  
4. Go to **Actions** tab → run the "Deploy static site to Pages" workflow.
5. Your site will be published at: `https://<your-username>.github.io/<repo-name>/`

## iPhone Install
Open the URL in Safari → **Share → Add to Home Screen**.

## Features
- Swipe left on an expense to delete it from the list.
- Backup all data to a JSON file and restore from a previous backup, choosing where the file is saved.
- Link credit cards to automatically pull balances and transaction history.
