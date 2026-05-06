# Holiday Planner — Lightship Genova

Interactive vacation planner for **May → September 2026**.
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

Double-click **`serve.cmd`** in this folder. It auto-detects Python or Node and launches a server on `http://localhost:8765`, then opens the page in your default browser. Press Ctrl+C in the terminal to stop.

If you'd rather just open the file: double-click `index.html`. Everything works except the *Share my link* button, which needs a real http(s) origin.

## Sharing the plan across the team

There is no shared backend, so each person edits in their own browser. To assemble a master view:

- **Share my link** — copies a URL that contains *only your own* holidays in the hash. Send it to the planner admin.
- **Export mine** — downloads a JSON file with just your holidays.
- **Import** — loads a JSON file. Only the people listed in that file are merged in; everyone else is preserved.

Suggested workflow:

1. Each person picks their identity, marks their holidays, and clicks **Share my link** (or **Export mine**).
2. They send the link/file to the admin.
3. The admin opens the planner with `?admin=1` in the URL (e.g. `…/index.html?admin=1`). This unlocks **Export all** and **Reset all**.
4. The admin imports each person's file → ends up with a master JSON.
5. Optionally commit `holiday-plan-master-2026.json` to the repo as the source of truth.

## Features

- 5-month calendar (May → September 2026).
- One color per employee, marker stamped on each day they're off.
- Italian public holidays highlighted (May 1, June 2, August 15).
- Weekends muted and not clickable.
- Conflict warning: when 2+ people from the same department are off the same day, the cell is outlined red.
- Filter chips: show/hide individuals on the calendar.
- Live summary of days planned per person.
- Admin mode (`?admin=1`) unlocks **Export all** and **Reset all**.

## Deploying to GitHub Pages

```bash
cd holiday-planner
git init
git add .
git commit -m "Initial holiday planner"
git branch -M main
git remote add origin git@github.com:<your-org>/holiday-planner.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Deploy from branch → main / (root)**. Wait ~30 seconds and open the URL GitHub gives you.

## Files

```
holiday-planner/
├── index.html     # markup
├── styles.css     # design
├── app.js         # logic
├── serve.cmd      # local server launcher (Windows)
└── README.md      # this file
```

## Notes

- Storage is **per browser**. If you clear site data, your plan is gone — keep an exported JSON as backup.
- Year is fixed at 2026 (top of `app.js`, constant `YEAR`).
- Public holidays are in `app.js` (`HOLIDAYS` object).
- For real-time multi-user sync you'd need a backend (Cloudflare Worker + KV, Firebase, Supabase, or a shared GitHub Gist). Happy to wire one up when you want.
