# Holiday Planner — Lightship Genova

Interactive vacation planner for **July → September 2026**.
Static HTML/CSS/JS, no build step, no backend. Ready to publish on **GitHub Pages**.

## How it works

Each browser is **locked to one person**. That person can only edit their own holidays. Everyone else's days are visible read-only with their own colored marker.

1. Open the page (locally: double-click `serve.cmd`, or just `index.html`).
2. Pick your initials once — they get saved to this browser.
3. Click any weekday to toggle a holiday for yourself.
4. Click again to remove.
5. The plan auto-saves in `localStorage`.

To change identity later, click **Switch user** in the identity card.

## Departments & employees

| Department          | Members                    |
|---------------------|----------------------------|
| Broker — Gearless   | OPE, MPE, LDC, BEE, MCD    |
| Broker — Geared     | SDP, FGA                   |
| Back Office         | MST, GBE, CPA, GCS         |
| Sale and Purchase   | FEG, ACR                   |

## Trying it locally

Double-click **`serve.cmd`** in this folder. It auto-detects Python or Node and launches a server on `http://localhost:8765`, then opens the page in your default browser.

## Sharing the plan across the team

- **Share my link** — copies a URL containing only your own holidays in the hash.
- **Export mine** — JSON with only your holidays.
- **Import** — loads a JSON snapshot, merging by person.

Admin mode (`?admin=1`) unlocks **Export all** and **Reset all**.

## Deploying to GitHub Pages

Settings → Pages → Source: Deploy from a branch → main / (root). Live in ~30 s.
