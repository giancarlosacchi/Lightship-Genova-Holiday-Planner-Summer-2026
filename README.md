# Holiday Planner — Lightship Genova

Winter holiday planner for **December 2026 → February 2027**.
Static HTML/CSS/JS, no build step. Bookings are shared in real time through Firebase.
Published with **GitHub Pages**.

## How it works

1. Open the page and pick your initials the first time. They are remembered on that device.
2. Click any working day to book it off. Click it again to cancel.
3. Every day shows the initials of everyone who is off. Two people from the same department on the same day show in red.
4. Use the month tabs at the top to tear the page off and go to another month.

To change person, click **Not you?** and enter the office password.

Add `?dry=1` to the address to try the page without saving anything.

## Departments & employees

| Department          | Members                    |
|---------------------|----------------------------|
| Broker — Gearless   | OPE, MPE, LDC, BEE, MCD    |
| Broker — Geared     | SDP, FGA                   |
| Back Office         | MST, GBE, CPA, GCS         |
| Sale and Purchase   | FEG, ACR                   |

## Trying it locally

Double-click **`serve.cmd`** in this folder.

## Deploying to GitHub Pages

Settings → Pages → Source: Deploy from a branch → main / (root). Live in ~30 s.
