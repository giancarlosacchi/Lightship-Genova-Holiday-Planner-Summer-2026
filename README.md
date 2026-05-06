# Pianificatore Ferie — Lightship Genova

Pianificatore vacanze interattivo per **Maggio → Settembre 2026**.
HTML/CSS/JS statico, nessun build, nessun backend. Pronto per la pubblicazione su **GitHub Pages**.

## Come funziona

Ogni browser è **bloccato su una persona**. Quella persona può modificare solo le proprie ferie. Tutti gli altri sono visibili in sola lettura, con il loro pallino colorato.

1. Apri la pagina (in locale: doppio click su `serve.cmd`, oppure su `index.html`).
2. Scegli le tue iniziali una volta sola — restano salvate in questo browser.
3. Clicca una cella sulla tua riga per inserire o rimuovere un giorno di ferie.
4. Clicca di nuovo per rimuoverlo.
5. Il piano viene salvato automaticamente in `localStorage`.

Per cambiare identità in seguito, clicca **Cambia utente** sulla card identità.

## Reparti e dipendenti

| Reparto             | Membri                     |
|---------------------|----------------------------|
| Broker — Gearless   | OPE, MPE, LDC, BEE, MCD    |
| Broker — Geared     | SDP, FGA                   |
| Back Office         | MST, GBE, CPA, GCS         |
| Sale and Purchase   | FEG, ACR                   |

## Provarlo in locale

Doppio click su **`serve.cmd`** in questa cartella. Rileva automaticamente Python o Node, avvia un server su `http://localhost:8765` e apre la pagina nel browser. Premi Ctrl+C nel terminale per fermarlo.

Se preferisci aprire direttamente il file: doppio click su `index.html`. Funziona tutto tranne il pulsante *Condividi link*, che richiede un'origine http(s) reale.

## Condividere il piano con il team

Non c'è un backend condiviso, quindi ognuno modifica nel proprio browser. Per assemblare una vista master:

- **Condividi link** — copia un URL che contiene *solo le tue ferie* nell'hash. Mandalo all'admin del piano.
- **Esporta le mie** — scarica un file JSON con solo le tue ferie.
- **Importa** — carica un file JSON. Vengono unite solo le persone elencate; le altre restano invariate.

Workflow consigliato:

1. Ogni persona sceglie le proprie iniziali, segna le ferie e clicca **Condividi link** (o **Esporta le mie**).
2. Manda il link/file all'admin.
3. L'admin apre il pianificatore con `?admin=1` nell'URL (es. `…/index.html?admin=1`). Sblocca **Esporta tutto** e **Reset totale**.
4. L'admin importa i file di ognuno → ottiene il JSON master.
5. Opzionalmente fa il commit di `holiday-plan-master-2026.json` nel repo come fonte di verità.

## Caratteristiche

- Calendario di 5 mesi (Maggio → Settembre 2026).
- Un colore per ogni dipendente, pallino sulla cella per ogni giorno di ferie.
- Festività italiane evidenziate (1 Maggio, 2 Giugno, 15 Agosto).
- Weekend in evidenza, non cliccabili.
- Avviso conflitto: quando 2+ persone dello stesso reparto sono in ferie lo stesso giorno, la cella ha un triangolo rosso.
- Chip filtro: mostra/nascondi persone sulla griglia.
- Riepilogo live dei giorni pianificati per persona.
- Modalità admin (`?admin=1`) sblocca **Esporta tutto** e **Reset totale**.

## Pubblicare su GitHub Pages

Aprire **Settings → Pages → Source: Deploy from a branch → main / (root)**. Dopo ~30 secondi il sito è online all'URL che GitHub fornisce.

## File

```
holiday-planner/
├── index.html     # markup
├── styles.css     # design
├── app.js         # logica
├── serve.cmd      # avvio server locale (Windows)
├── publish.cmd    # pubblicazione automatica su GitHub
└── README.md      # questo file
```

## Note

- I dati sono **per browser**. Se cancelli i dati del sito, il piano è perso — tieni un export JSON come backup.
- L'anno è fisso al 2026 (in alto in `app.js`, costante `YEAR`).
- Le festività sono in `app.js` (oggetto `HOLIDAYS`).
- Per la sincronizzazione multi-utente in tempo reale serve un backend (Cloudflare Worker + KV, Firebase, Supabase, o un Gist GitHub condiviso). Posso configurarne uno quando vuoi.
