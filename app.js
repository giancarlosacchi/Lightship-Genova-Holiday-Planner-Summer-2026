/* ============================================================
   Lightship Genova — Holiday Planner 2026
   "A Lightship Summer" — editorial spreadsheet view.
   ============================================================ */

const YEAR = 2026;
const MONTHS = [6, 7, 8];

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const WEEKDAY_SHORT = ["M","T","W","T","F","S","S"];

const HOLIDAYS = {
  "2026-05-01": "Labour Day",
  "2026-06-02": "Republic Day",
  "2026-08-15": "Ferragosto"
};

const DEPARTMENTS = [
  { name: "Broker — Gearless", key: "gearless",  members: ["OPE", "MPE", "LDC", "BEE", "MCD"] },
  { name: "Broker — Geared",   key: "geared",    members: ["SDP", "FGA"] },
  { name: "Back Office",       key: "backoffice",members: ["MST", "GBE", "CPA", "GCS"] },
  { name: "Sale and Purchase", key: "snp",       members: ["FEG", "ACR"] },
];

/* Curated summer palette — saturated but not neon */
const PALETTE = [
  "#e63946", "#f4a261", "#e9c46a", "#8ab17d", "#2a9d8f",
  "#0a9396", "#0077b6", "#3a86ff", "#7b2cbf", "#9d4edd",
  "#c9184a", "#d62828", "#e76f51"
];

const EMPLOYEES = (() => {
  let i = 0; const list = [];
  for (const d of DEPARTMENTS) {
    for (const m of d.members) {
      list.push({ id: m, dept: d.key, deptName: d.name, color: PALETTE[i % PALETTE.length] });
      i++;
    }
  }
  return list;
})();
const EMP_BY_ID = Object.fromEntries(EMPLOYEES.map(e => [e.id, e]));

const URL_PARAMS = new URLSearchParams(location.search);
const ADMIN_MODE = URL_PARAMS.get("admin") === "1";
const STORAGE_KEY = "lightship-holiday-planner-v3";
const ADMIN_PASSWORD = "lightship2026"; // change this if needed

/* ============================================================
   REMOTE BACKEND (Firebase Realtime Database) — shared selections for everyone.
   Firebase provides atomic per-child writes: setting selections/GCS ONLY writes
   that node without touching anyone else's. No read-merge-write race, no wipe
   possible from a client bug. Free tier: 10GB/month bandwidth — plenty for us.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDqKWZ_fYtIIXdasEHX5atCwJ995rjFMZg",
  authDomain: "lightship-holiday-planner.firebaseapp.com",
  databaseURL: "https://lightship-holiday-planner-default-rtdb.firebaseio.com",
  projectId: "lightship-holiday-planner",
  storageBucket: "lightship-holiday-planner.firebasestorage.app",
  messagingSenderId: "545676531164",
  appId: "1:545676531164:web:fcd376a877d56a89912b19"
};
const BACKUP_KEY = "lightship-holiday-planner-v3-data";
const SNAPSHOTS_KEY = "lightship-holiday-planner-v3-snapshots";  // ring buffer — NEVER wiped by pulls
const SNAPSHOT_KEEP = 30;
const SNAPSHOT_MIN_GAP_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 60000;  // safety fallback poll (real-time listener does the real work)

let pushInProgress = false;
let pushPendingAgain = false;
let firebaseDb = null;      // firebase.database() reference
let firebaseReady = false;  // set to true when the initial value snapshot has arrived
let firebaseFailed = false; // set to true if SDK failed to load or init


// FLIP technique: animate hero-brand smoothly between centered and left positions.
function transitionBrandPosition(applyChange) {
  const brand = document.querySelector(".hero-brand");
  const heroId = document.querySelector(".hero-identity");
  if (!brand) { applyChange(); return; }
  const oldRect = brand.getBoundingClientRect();
  applyChange();
  const newRect = brand.getBoundingClientRect();
  const dx = oldRect.left - newRect.left;
  if (Math.abs(dx) > 1) {
    brand.animate(
      [
        { transform: "translateX(" + dx + "px)" },
        { transform: "translateX(0)" }
      ],
      { duration: 850, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "none" }
    );
  }
  // Identity card (top-right) slides in from the right when it becomes visible
  if (heroId && !heroId.hidden) {
    heroId.animate(
      [
        { opacity: 0, transform: "translateX(20px)" },
        { opacity: 1, transform: "translateX(0)" }
      ],
      { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)", delay: 200, fill: "both" }
    );
  }
}

function initFirebase() {
  if (firebaseDb) return firebaseDb;
  try {
    if (typeof firebase === "undefined") {
      firebaseFailed = true;
      setStatus("Firebase SDK missing — offline");
      return null;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    firebaseDb = firebase.database();
    // Real-time listener on the whole selections tree — pushed to us instantly on any change.
    firebaseDb.ref("selections").on("value", (snapshot) => {
      applyRemoteSelections(snapshot.val() || {}, "listener");
    }, (err) => {
      console.error("[HP] Firebase listener error:", err);
      setStatus("offline (listener err)");
    });
    return firebaseDb;
  } catch (e) {
    console.error("[HP] Firebase init failed:", e);
    firebaseFailed = true;
    setStatus("offline (init err) — using local");
    return null;
  }
}

// Apply remote selections into local state, with wipe protection guards.
function applyRemoteSelections(remoteSel, source) {
  if (!remoteSel || typeof remoteSel !== "object") remoteSel = {};

  // CRITICAL GUARD: if the server returned an EMPTY tree but we have non-empty
  // local data or a non-empty snapshot on file, IGNORE the empty payload.
  const remoteDays = countDays(remoteSel);
  const localDays = countDays(serializeSelections());
  const lastSnap = lastGoodSnapshot();
  const snapshotDays = lastSnap ? countDays(lastSnap.selections) : 0;
  if (remoteDays === 0 && (localDays > 0 || snapshotDays > 0)) {
    setStatus("server returned empty — keeping local (guarded)");
    console.warn("[HP] Refused empty server payload. local=" + localDays + " snap=" + snapshotDays + " source=" + source);
    return;
  }

  // Merge remote into state. Never overwrite OUR row if we have unsaved local edits.
  let mergedMine = false;
  for (const [empId, dates] of Object.entries(remoteSel)) {
    if (!EMP_BY_ID[empId]) continue;
    if (empId === state.me && hasPendingChanges()) continue;
    state.selections[empId] = new Set(Array.isArray(dates) ? dates : []);
    if (empId === state.me) mergedMine = true;
  }
  // Also drop any local employees whose entries no longer exist remotely — but ONLY
  // when the remote had at least one entry (so a temporary blip doesn't clear us).
  if (remoteDays > 0) {
    for (const empId of Object.keys(state.selections)) {
      if (!(empId in remoteSel) && empId !== state.me) {
        // keep the local value — safer than deleting.
      }
    }
  }
  if (mergedMine || !state.me) setSavedMine();
  // Persist a fresh local backup so reloads survive offline
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(serializeSelections())); } catch(e){}
  // Persistent snapshot ring (only non-empty states)
  pushSnapshot(serializeSelections(), source);
  firebaseReady = true;
  renderActiveMonth();
  renderMiniMonths();
  renderSummary();
  renderFilterList();
  renderPendingBar();
  setStatus("synced " + new Date().toLocaleTimeString());
}

// Legacy name — used by init and visibility handler as a manual "pull now" trigger.
async function pullFromBin() {
  if (!firebaseDb) initFirebase();
  if (!firebaseDb) return;
  try {
    const snap = await firebaseDb.ref("selections").once("value");
    applyRemoteSelections(snap.val() || {}, "pull");
  } catch (e) {
    setStatus("offline (pull err) — using local");
  }
}

async function pushToBin() {
  // Serialize: if a save is already running, mark that another is needed and bail
  if (pushInProgress) { pushPendingAgain = true; return; }
  pushInProgress = true;
  setStatus("saving…");
  try {
    if (!state.me) {
      // No identity picked yet — save prefs only, do NOT touch remote.
      setStatus("save skipped (no identity)");
      return;
    }
    if (!firebaseDb) initFirebase();
    if (!firebaseDb) {
      setStatus("offline — will retry");
      return;
    }
    const mine = Array.from(state.selections[state.me] || new Set()).sort();
    // Firebase atomic set on OUR node only — cannot possibly affect other employees' rows.
    await firebaseDb.ref("selections/" + state.me).set(mine);
    state.savedMineDates = mine;
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(serializeSelections())); } catch(e){}
    pushSnapshot(serializeSelections(), "push");
    setStatus("saved " + new Date().toLocaleTimeString());
  } catch (e) {
    console.error("[HP] push error:", e);
    setStatus("save failed (" + (e && e.code ? e.code : "network") + ")");
  } finally {
    pushInProgress = false;
    if (pushPendingAgain) {
      pushPendingAgain = false;
      pushToBin();
    }
  }
}

// Save now — no debounce
function schedulePush() { pushToBin(); }

/* ============================================================
   Snapshot ring — persistent, tamper-resistant local backup.
   These snapshots survive wipes, pulls, and 403s. Never cleared
   automatically. Used as last-resort recovery source.
   ============================================================ */
function getSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function countDays(selections) {
  let n = 0;
  for (const v of Object.values(selections || {})) {
    n += Array.isArray(v) ? v.length : (v && v.size) || 0;
  }
  return n;
}
function pushSnapshot(selections, reason) {
  // Only snapshot NON-EMPTY states. An empty snapshot is worthless.
  if (!selections || countDays(selections) === 0) return;
  const snaps = getSnapshots();
  const now = Date.now();
  // Rate-limit: skip if we already snapped in the last SNAPSHOT_MIN_GAP_MS
  if (snaps.length && (now - snaps[0].ts) < SNAPSHOT_MIN_GAP_MS) return;
  // Skip if identical to the most recent one
  const serialized = JSON.stringify(selections);
  if (snaps.length && JSON.stringify(snaps[0].selections) === serialized) return;
  snaps.unshift({ ts: now, iso: new Date(now).toISOString(), reason: reason || "auto", selections });
  const trimmed = snaps.slice(0, SNAPSHOT_KEEP);
  try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed)); } catch(e){}
}
function lastGoodSnapshot() {
  const snaps = getSnapshots();
  for (const snap of snaps) if (countDays(snap.selections) > 0) return snap;
  return null;
}
// Expose to console for emergency recovery
window.lhp = window.lhp || {};
window.lhp.snapshots = getSnapshots;
window.lhp.lastGood = lastGoodSnapshot;
window.lhp.exportSnapshot = function(index) {
  const snap = getSnapshots()[index || 0];
  if (!snap) { console.log("no snapshot at index", index); return; }
  const payload = { app:"lightship-holiday-planner", version:3, year:2026, exportedBy:"snapshot-recovery", exportedAt:snap.iso, selections:snap.selections };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "recovery-" + snap.iso.replace(/[:.]/g,"-") + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return "downloaded snapshot from " + snap.iso;
};

const state = {
  me: null,
  activeMonth: MONTHS[0],
  selections: {},
  visible: new Set(EMPLOYEES.map(e => e.id)),
  savedMineDates: [],   // last confirmed dates for "me"
};

// Helpers for pending-changes flow
function snapshotMine() {
  if (!state.me) return [];
  return Array.from(state.selections[state.me] || new Set()).sort();
}
function setSavedMine() { state.savedMineDates = snapshotMine(); }
function hasPendingChanges() {
  return JSON.stringify(snapshotMine()) !== JSON.stringify(state.savedMineDates.slice().sort());
}
function discardPending() {
  if (!state.me) return;
  state.selections[state.me] = new Set(state.savedMineDates);
  renderActiveMonth();
  renderSummary();
  renderPendingBar();
  showToast("Changes discarded");
}

/* ============================================================
   Persistence
   ============================================================ */
function loadState() {
  if (location.hash.startsWith("#data=")) {
    try {
      const json = atob(decodeURIComponent(location.hash.slice(6)));
      const obj = JSON.parse(json);
      if (obj && obj.selections) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const local = JSON.parse(raw);
          if (local.me && EMP_BY_ID[local.me]) state.me = local.me;
          if (local.selections) applySerializedSelections(local.selections);
          if (Array.isArray(local.visible)) state.visible = new Set(local.visible.filter(x => EMP_BY_ID[x]));
          if (typeof local.activeMonth === "number" && MONTHS.includes(local.activeMonth)) state.activeMonth = local.activeMonth;
        }
        const empIds = Object.keys(obj.selections).filter(id => EMP_BY_ID[id]);
        if (empIds.length && confirm("Import holidays for: " + empIds.join(", ") + "?\nThis replaces any existing entries for them.")) {
          for (const empId of empIds) state.selections[empId] = new Set(obj.selections[empId]);
          saveState();
          showToast("Imported " + empIds.join(", "));
        }
        history.replaceState(null, "", location.pathname + location.search);
        return;
      }
    } catch (e) { console.warn("Bad share link", e); }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && obj.me && EMP_BY_ID[obj.me]) state.me = obj.me;
      if (obj && Array.isArray(obj.visible)) state.visible = new Set(obj.visible.filter(id => EMP_BY_ID[id]));
      if (obj && typeof obj.activeMonth === "number" && MONTHS.includes(obj.activeMonth)) state.activeMonth = obj.activeMonth;
    }
    // Full data backup — restore selections so the screen isn't blank if pull fails
    const backup = localStorage.getItem(BACKUP_KEY);
    if (backup) {
      const sel = JSON.parse(backup);
      applySerializedSelections(sel);
    }
    // Fallback: if regular backup is empty (or missing), pull from the snapshot ring
    if (countDays(serializeSelections()) === 0) {
      const snap = lastGoodSnapshot();
      if (snap) {
        console.warn("[HP] Regular backup empty — restoring from snapshot", snap.iso);
        applySerializedSelections(snap.selections);
      }
    }
  } catch (e) { console.warn("Could not load state", e); }
}

function applySerializedSelections(serialized) {
  state.selections = {};
  for (const [empId, dates] of Object.entries(serialized)) {
    if (!EMP_BY_ID[empId]) continue;
    state.selections[empId] = new Set(dates);
  }
}
function serializeSelections() {
  const out = {};
  for (const [empId, set] of Object.entries(state.selections)) {
    out[empId] = Array.from(set).sort();
  }
  return out;
}
function saveState() {
  // Personal preferences
  const local = {
    me: state.me, activeMonth: state.activeMonth,
    visible: Array.from(state.visible),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    // Full data backup (used if remote pull fails or before first sync)
    localStorage.setItem(BACKUP_KEY, JSON.stringify(serializeSelections()));
  } catch (e) { /* ignore */ }
  // Auto-save to shared backend (debounced ~250ms)
  schedulePush();
}

/* ============================================================
   Date helpers
   ============================================================ */
function isoDate(y, m0, d) { return y + "-" + String(m0+1).padStart(2,"0") + "-" + String(d).padStart(2,"0"); }
function daysInMonth(y, m0) { return new Date(y, m0+1, 0).getDate(); }
function weekdayMon0(y, m0, d) { return (new Date(y, m0, d).getDay() + 6) % 7; }
function todayIso() { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function ensureSet(empId) { if (!state.selections[empId]) state.selections[empId] = new Set(); return state.selections[empId]; }
function toggleDay(empId, dateStr) {
  const set = ensureSet(empId);
  if (set.has(dateStr)) set.delete(dateStr); else set.add(dateStr);
  saveState();
}

/* ============================================================
   Identity bar
   ============================================================ */
function renderIdentityBar() {
  const container = document.getElementById("dept-list");
  const heroSlot  = document.getElementById("hero-identity");
  const identityBar = document.querySelector(".identity-bar");
  container.innerHTML = "";
  if (heroSlot) heroSlot.innerHTML = "";

  if (!state.me) {
    // No identity yet — show only the picker (rest of the page is hidden via body class)
    document.body.classList.add("no-identity");
    if (heroSlot) heroSlot.hidden = true;
    if (identityBar) identityBar.hidden = false;

    const wrap = document.createElement("div");
    wrap.className = "pick-identity";

    const prompt = document.createElement("p");
    prompt.className = "pick-prompt";
    prompt.textContent = "Select who you are";
    wrap.appendChild(prompt);

    for (const dept of DEPARTMENTS) {
      const row = document.createElement("div");
      row.className = "pick-row";
      const lbl = document.createElement("div");
      lbl.className = "pick-dept-label";
      lbl.textContent = dept.name;
      row.appendChild(lbl);

      for (const memberId of dept.members) {
        const emp = EMP_BY_ID[memberId];
        const chip = document.createElement("button");
        chip.className = "emp-chip";
        chip.innerHTML = '<span class="swatch" style="background:' + emp.color + '"></span>' + emp.id;
        chip.addEventListener("click", () => {
          transitionBrandPosition(() => {
            state.me = emp.id;
            state.visible.add(emp.id);
            saveState();
            renderAll();
            showToast("Welcome, " + emp.id);
          });
        });
        row.appendChild(chip);
      }
      wrap.appendChild(row);
    }
    container.appendChild(wrap);
    return;
  }

  // Identity locked — hide the big bar, show compact card in the hero top-right
  document.body.classList.remove("no-identity");
  if (identityBar) identityBar.hidden = true;

  const me = EMP_BY_ID[state.me];
  if (heroSlot) {
    heroSlot.hidden = false;
    heroSlot.innerHTML =
      '<div class="hero-id-block" style="--me-color:' + me.color + '">' +
        '<span class="identity-swatch" style="background:' + me.color + '"></span>' +
        '<div class="hero-id-text">' +
          '<span class="identity-name">You<strong>' + me.id + '</strong></span>' +
          '<div class="identity-dept">' + me.deptName + '</div>' +
        '</div>' +
        '<button id="btn-switch-user" class="chip-btn hero-id-btn" title="Switch user (admin password required)">Switch</button>' +
      '</div>';

    document.getElementById("btn-switch-user")?.addEventListener("click", () => {
      const pwd = prompt("Admin password to switch user:");
      if (pwd === null) return;
      if (pwd !== ADMIN_PASSWORD) { alert("Wrong password."); return; }
      if (!confirm("Switch user? Your holidays stay saved in this browser.")) return;
      transitionBrandPosition(() => { state.me = null; saveState(); renderAll(); });
    });
  }
}

/* ============================================================
   Month nav
   ============================================================ */
function renderMonthNav() {
  const m = state.activeMonth;
  document.getElementById("active-month-name").textContent = MONTH_NAMES[m];
  document.getElementById("active-month-year").textContent = YEAR;

  const tabs = document.getElementById("month-tabs");
  tabs.innerHTML = "";
  for (const mi of MONTHS) {
    const btn = document.createElement("button");
    btn.className = "month-tab" + (mi === state.activeMonth ? " active" : "");
    btn.textContent = MONTH_SHORT[mi];
    btn.addEventListener("click", () => {
      state.activeMonth = mi;
      saveState();
      renderActiveMonth();
      renderMonthNav();
      renderMiniMonths();
    });
    tabs.appendChild(btn);
  }

  const i = MONTHS.indexOf(state.activeMonth);
  document.getElementById("month-prev").disabled = i <= 0;
  document.getElementById("month-next").disabled = i >= MONTHS.length - 1;
}

function stepMonth(delta) {
  const i = MONTHS.indexOf(state.activeMonth);
  const ni = Math.min(MONTHS.length - 1, Math.max(0, i + delta));
  if (ni === i) return;
  state.activeMonth = MONTHS[ni];
  saveState();
  renderActiveMonth();
  renderMonthNav();
  renderMiniMonths();
}

/* ============================================================
   THE GRID
   ============================================================ */
function renderActiveMonth() {
  const container = document.getElementById("month-view");
  container.innerHTML = "";

  const m = state.activeMonth;
  const dim = daysInMonth(YEAR, m);
  const today = todayIso();

  const scroll = document.createElement("div");
  scroll.className = "grid-scroll";
  container.appendChild(scroll);

  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.gridTemplateColumns = "minmax(95px, 110px) repeat(" + dim + ", 1fr)";
  scroll.appendChild(grid);

  // Top-left corner — italic month abbreviation
  const corner = document.createElement("div");
  corner.className = "g-corner";
  corner.textContent = MONTH_SHORT[m];
  grid.appendChild(corner);

  // Day headers (top row)
  for (let d = 1; d <= dim; d++) {
    const dateStr = isoDate(YEAR, m, d);
    const w = weekdayMon0(YEAR, m, d);
    const isWE = w >= 5;
    const isHoliday = !!HOLIDAYS[dateStr];
    const isToday = dateStr === today;

    const head = document.createElement("div");
    head.className = "g-day-h";
    if (isWE) head.classList.add("weekend");
    if (isHoliday) head.classList.add("holiday");
    if (isToday) head.classList.add("today");
    head.title = WEEKDAY_LABELS[w] + " " + d + (isHoliday ? " — " + HOLIDAYS[dateStr] : "");
    head.innerHTML = '<span class="wd">' + WEEKDAY_SHORT[w] + '</span><span class="num">' + d + '</span>';
    grid.appendChild(head);
  }

  // Body rows
  for (const dept of DEPARTMENTS) {
    const visibleMembers = dept.members.filter(id => state.visible.has(id));
    if (!visibleMembers.length) continue;

    const divider = document.createElement("div");
    divider.className = "g-divider";
    divider.textContent = dept.name;
    grid.appendChild(divider);

    for (const memberId of visibleMembers) {
      const emp = EMP_BY_ID[memberId];
      const isMe = emp.id === state.me;

      const name = document.createElement("div");
      name.className = "g-name" + (isMe ? " is-me" : "");
      if (isMe) name.style.setProperty("--me-color", emp.color);
      name.innerHTML = '<span class="swatch" style="background:' + emp.color + '"></span>' + emp.id;
      grid.appendChild(name);

      for (let d = 1; d <= dim; d++) {
        const dateStr = isoDate(YEAR, m, d);
        const w = weekdayMon0(YEAR, m, d);
        const isWE = w >= 5;
        const isHoliday = !!HOLIDAYS[dateStr];

        const cell = document.createElement("div");
        cell.className = "g-cell";
        if (isWE) cell.classList.add("weekend");
        if (isHoliday) cell.classList.add("holiday");
        if (isMe) {
          cell.classList.add("is-me-cell");
          cell.style.setProperty("--me-color", emp.color);
        }

        const off = (state.selections[emp.id] || new Set()).has(dateStr);
        if (off) {
          cell.classList.add("off");
          cell.style.setProperty("--off-color", emp.color);

          for (const other of dept.members) {
            if (other === emp.id) continue;
            if (!state.visible.has(other)) continue;
            if ((state.selections[other] || new Set()).has(dateStr)) {
              cell.classList.add("conflict");
              break;
            }
          }
        }

        if (isMe && !isWE && !isHoliday) {
          cell.classList.add("editable");
          cell.title = "Toggle holiday on " + dateStr;
          cell.addEventListener("click", () => {
            toggleDay(state.me, dateStr);
            renderActiveMonth();
            renderSummary();
          });
        } else {
          cell.title = emp.id + " — " + dateStr + (off ? " — off" : "");
        }

        grid.appendChild(cell);
      }
    }
  }
}

/* ============================================================
   Side panel
   ============================================================ */
function renderFilterList() {
  const container = document.getElementById("filter-list");
  container.innerHTML = "";

  for (const dept of DEPARTMENTS) {
    const block = document.createElement("div");
    block.className = "filter-dept-block";

    // department header — click to toggle whole dept
    const allOn = dept.members.every(id => state.visible.has(id));
    const anyOn = dept.members.some(id => state.visible.has(id));
    const head = document.createElement("button");
    head.className = "filter-dept-head" + (allOn ? " all-on" : (anyOn ? " some-on" : " all-off"));
    head.title = allOn ? "Hide whole department" : "Show whole department";
    head.innerHTML = '<span class="filter-dept-name">' + dept.name + '</span>'
                   + '<span class="filter-dept-toggle">' + (allOn ? "all" : (anyOn ? "some" : "none")) + '</span>';
    head.addEventListener("click", () => {
      if (allOn) {
        for (const id of dept.members) state.visible.delete(id);
      } else {
        for (const id of dept.members) state.visible.add(id);
      }
      saveState();
      renderActiveMonth();
      renderFilterList();
    });
    block.appendChild(head);

    // employee chips for the dept
    const row = document.createElement("div");
    row.className = "filter-row";
    for (const id of dept.members) {
      const emp = EMP_BY_ID[id];
      const chip = document.createElement("button");
      const on = state.visible.has(id);
      const isMe = id === state.me;
      chip.className = "filter-chip" + (on ? "" : " off") + (isMe ? " is-me" : "");
      chip.title = on ? "Hide on calendar" : "Show on calendar";
      chip.innerHTML = '<span class="swatch" style="background:' + emp.color + '"></span>' + emp.id + (isMe ? " · you" : "");
      chip.addEventListener("click", () => {
        if (on) state.visible.delete(id); else state.visible.add(id);
        saveState();
        renderActiveMonth();
        renderFilterList();
      });
      row.appendChild(chip);
    }
    block.appendChild(row);
    container.appendChild(block);
  }
}

function renderSummary() {
  const container = document.getElementById("summary");
  container.innerHTML = "";
  const employeesSorted = [...EMPLOYEES].sort((a,b) => a.id.localeCompare(b.id));
  let total = 0;
  let any = false;
  for (const emp of employeesSorted) {
    const count = (state.selections[emp.id] || new Set()).size;
    total += count;
    if (count === 0) continue;
    any = true;
    const isMe = emp.id === state.me;
    const row = document.createElement("div");
    row.className = "summary-row";
    row.innerHTML =
      '<span class="label">' +
        '<span class="swatch" style="background:' + emp.color + '"></span>' + emp.id +
        (isMe ? ' <span style="color:#8a8475;font-weight:400;font-size:11px">· you</span>' : '') +
      '</span>' +
      '<span class="count">' + count + ' d</span>';
    container.appendChild(row);
  }
  if (!any) {
    container.innerHTML = '<p class="summary-empty">— no holidays planned yet.</p>';
  } else {
    const totalRow = document.createElement("div");
    totalRow.className = "summary-row";
    totalRow.style.marginTop = "6px";
    totalRow.style.borderTop = "1px solid rgba(15,20,25,0.06)";
    totalRow.style.paddingTop = "8px";
    totalRow.style.fontWeight = "600";
    totalRow.innerHTML = '<span class="label">Total</span><span class="count">' + total + ' d</span>';
    container.appendChild(totalRow);
  }
}

/* ============================================================
   Render all
   ============================================================ */


function renderMiniMonths() {
  const container = document.getElementById("mini-months");
  if (!container) return;
  container.innerHTML = "";
  const today = todayIso();

  for (const m of MONTHS) {
    // Show all months, including the active one, so you always see the 3-month strip.

    const card = document.createElement("button");
    card.className = "mini-month" + (m === state.activeMonth ? " active" : "");
    card.title = m === state.activeMonth ? MONTH_NAMES[m] + " (currently open)" : "Open " + MONTH_NAMES[m];
    card.addEventListener("click", () => {
      state.activeMonth = m;
      saveState();
      renderActiveMonth();
      renderMonthNav();
      renderMiniMonths();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const head = document.createElement("div");
    head.className = "mini-month-head";
    head.innerHTML = '<span class="mini-month-name">' + MONTH_NAMES[m] + '</span>'
                   + '<span class="mini-month-year">' + YEAR + '</span>';
    card.appendChild(head);

    const wd = document.createElement("div");
    wd.className = "mini-weekdays";
    for (const lbl of WEEKDAY_SHORT) {
      const c = document.createElement("div");
      c.textContent = lbl;
      wd.appendChild(c);
    }
    card.appendChild(wd);

    const grid = document.createElement("div");
    grid.className = "mini-days";

    const lead = weekdayMon0(YEAR, m, 1);
    for (let i = 0; i < lead; i++) {
      const empty = document.createElement("div");
      empty.className = "mini-day empty";
      grid.appendChild(empty);
    }

    const dim = daysInMonth(YEAR, m);
    for (let d = 1; d <= dim; d++) {
      const dateStr = isoDate(YEAR, m, d);
      const w = weekdayMon0(YEAR, m, d);
      const isWE = w >= 5;
      const isHoliday = !!HOLIDAYS[dateStr];

      const cell = document.createElement("div");
      cell.className = "mini-day";
      if (isWE) cell.classList.add("weekend");
      if (isHoliday) cell.classList.add("holiday");
      if (dateStr === today) cell.classList.add("today");

      const here = [];
      for (const emp of EMPLOYEES) {
        if (!state.visible.has(emp.id)) continue;
        if ((state.selections[emp.id] || new Set()).has(dateStr)) here.push(emp);
      }
      const byDept = {};
      for (const emp of here) byDept[emp.dept] = (byDept[emp.dept] || 0) + 1;
      if (Object.values(byDept).some(n => n >= 2)) cell.classList.add("conflict");

      if (here.length > 0) {
        cell.classList.add("has-people");
        // Heat-map by headcount: 1 = green, 2 = yellow, 3 = orange, 4+ = red
        cell.classList.add("heat-" + Math.min(here.length, 4));
      }

      cell.textContent = d;
      grid.appendChild(cell);
    }
    card.appendChild(grid);
    container.appendChild(card);
  }
}

function renderAll() {
  renderIdentityBar();
  renderMonthNav();
  renderActiveMonth();
  renderMiniMonths();
  renderFilterList();
  renderSummary();
  renderPendingBar();
  const adm = document.getElementById("admin-badge");
  if (adm) adm.hidden = !ADMIN_MODE;
}

function renderPendingBar() {
  const bar = document.getElementById("pending-bar");
  if (bar) bar.hidden = true; // auto-save mode — bar disabled
}

/* ============================================================
   Status / toast
   ============================================================ */
let statusTimer = null;
function setStatus(msg) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ""; }, 4000);
}
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ============================================================
   Top-bar actions
   ============================================================ */
function exportMine() {
  if (!state.me) { showToast("Choose who you are first"); return; }
  const sel = {};
  sel[state.me] = Array.from(state.selections[state.me] || new Set()).sort();
  downloadJson({ app:"lightship-holiday-planner", version:3, year:YEAR, exportedBy:state.me, exportedAt:new Date().toISOString(), selections:sel },
    "holidays-" + state.me + "-" + YEAR + ".json");
}
function exportAll() {
  downloadJson({ app:"lightship-holiday-planner", version:3, year:YEAR, exportedBy:state.me||"admin", exportedAt:new Date().toISOString(), selections:serializeSelections() },
    "holiday-plan-master-" + YEAR + ".json");
}
function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast("Exported " + filename);
}
function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj || !obj.selections) throw new Error("Missing selections");
      const empIds = Object.keys(obj.selections).filter(id => EMP_BY_ID[id]);
      if (!empIds.length) { alert("No known employees in that file."); return; }
      const msg = "Import holidays for: " + empIds.join(", ") + "?\nThis will replace any existing entries for them. Other people are kept as-is.";
      if (!confirm(msg)) return;
      for (const empId of empIds) state.selections[empId] = new Set(obj.selections[empId]);
      saveState();
      renderAll();
      showToast("Imported " + empIds.join(", "));
    } catch (e) {
      alert("Could not import file: " + e.message);
    }
  };
  reader.readAsText(file);
}
function shareMyLink() {
  if (!state.me) { showToast("Choose who you are first"); return; }
  const sel = {};
  sel[state.me] = Array.from(state.selections[state.me] || new Set()).sort();
  const json = JSON.stringify({ selections: sel });
  const b64 = btoa(json);
  const url = location.origin + location.pathname + "#data=" + encodeURIComponent(b64);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => showToast("Your share link is in the clipboard"),
      () => prompt("Copy this link:", url)
    );
  } else {
    prompt("Copy this link:", url);
  }
}

/* ============================================================
   Init
   ============================================================ */
function init() {
  loadState();
  // Snapshot current as "saved" to avoid false-positive pending bar at startup
  setSavedMine();
  renderAll();

  // Start Firebase — this attaches a real-time listener that will keep everyone
  // in sync automatically. No polling needed for correctness; the interval below
  // is just a safety net in case the socket drops.
  initFirebase();
  setInterval(() => {
    if (document.hidden) return;
    if (!firebaseDb || !firebaseReady) pullFromBin();
  }, POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (!firebaseDb || !firebaseReady)) pullFromBin();
  });

  document.getElementById("btn-export")?.addEventListener("click", exportMine);
  document.getElementById("btn-export-all")?.addEventListener("click", exportAll);
  document.getElementById("btn-import")?.addEventListener("click", () => {
    document.getElementById("file-import")?.click();
  });
  document.getElementById("file-import")?.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJson(f);
    e.target.value = "";
  });
  document.getElementById("btn-share")?.addEventListener("click", shareMyLink);
  document.getElementById("btn-reset")?.addEventListener("click", () => {
    if (!confirm("Clear ALL holidays for EVERYONE in this browser? This is admin-level.")) return;
    state.selections = {};
    saveState();
    renderAll();
    showToast("Everything cleared");
  });

  document.getElementById("month-prev").addEventListener("click", () => stepMonth(-1));
  document.getElementById("month-next").addEventListener("click", () => stepMonth(1));

  document.getElementById("filter-all").addEventListener("click", () => {
    state.visible = new Set(EMPLOYEES.map(e => e.id));
    saveState(); renderActiveMonth(); renderFilterList();
  });
  document.getElementById("filter-none").addEventListener("click", () => {
    state.visible = new Set();
    saveState(); renderActiveMonth(); renderFilterList();
  });
  document.getElementById("btn-confirm")?.addEventListener("click", () => {
    if (!state.me) { showToast("Pick your initials first"); return; }
    if (!hasPendingChanges()) return;
    pushToBin();
  });
  document.getElementById("btn-discard")?.addEventListener("click", () => {
    if (!hasPendingChanges()) return;
    if (!confirm("Discard unsaved changes?")) return;
    discardPending();
  });

  document.getElementById("filter-mine").addEventListener("click", () => {
    if (state.me) state.visible = new Set([state.me]);
    else showToast("Choose who you are first");
    saveState(); renderActiveMonth(); renderFilterList();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowLeft") stepMonth(-1);
    else if (e.key === "ArrowRight") stepMonth(1);
  });

  // If user closes/reloads tab while a push is pending, fire it synchronously
  window.addEventListener("beforeunload", () => {
    if (!pushTimer) return;
    clearTimeout(pushTimer); pushTimer = null;
    try {
      const merged = serializeSelections();
      const payload = JSON.stringify({ selections: merged, updatedAt: new Date().toISOString() });
      const blob = new Blob([payload], { type: "application/json" });
      // sendBeacon doesn't allow custom headers; use keepalive fetch instead
      fetch(BIN_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Master-Key": MASTER_KEY },
        body: payload,
        keepalive: true
      });
    } catch (e) { /* best effort */ }
  });

  document.querySelectorAll("[data-admin]").forEach(el => { el.hidden = !ADMIN_MODE; });
  setStatus("ready");
}

document.addEventListener("DOMContentLoaded", init);
