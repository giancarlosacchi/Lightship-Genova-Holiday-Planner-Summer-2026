/* ============================================================
   Lightship Genova — Holiday Planner 2026
   "A Lightship Summer" — editorial spreadsheet view.
   ============================================================ */

const YEAR = 2026;
const MONTHS = [4, 5, 6, 7, 8];

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

const state = {
  me: null,
  activeMonth: MONTHS[0],
  selections: {},
  visible: new Set(EMPLOYEES.map(e => e.id)),
};

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
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && obj.me && EMP_BY_ID[obj.me]) state.me = obj.me;
    if (obj && obj.selections) applySerializedSelections(obj.selections);
    if (obj && Array.isArray(obj.visible)) state.visible = new Set(obj.visible.filter(id => EMP_BY_ID[id]));
    if (obj && typeof obj.activeMonth === "number" && MONTHS.includes(obj.activeMonth)) state.activeMonth = obj.activeMonth;
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
  const payload = {
    me: state.me, activeMonth: state.activeMonth,
    selections: serializeSelections(),
    visible: Array.from(state.visible),
    savedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setStatus("saved at " + new Date().toLocaleTimeString());
  } catch (e) {
    setStatus("could not save (storage full?)");
  }
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
  container.innerHTML = "";

  if (!state.me) {
    const wrap = document.createElement("div");
    wrap.className = "pick-identity";

    const prompt = document.createElement("p");
    prompt.className = "pick-prompt";
    prompt.textContent = "Welcome aboard. Who's planning today?";
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
          state.me = emp.id;
          state.visible.add(emp.id);
          saveState();
          renderAll();
          showToast("Welcome, " + emp.id);
        });
        row.appendChild(chip);
      }
      wrap.appendChild(row);
    }
    container.appendChild(wrap);
    return;
  }

  const me = EMP_BY_ID[state.me];
  const wrap = document.createElement("div");
  wrap.className = "identity-locked";
  wrap.innerHTML =
    '<div class="id-block" style="--me-color:' + me.color + '">' +
      '<span class="identity-swatch" style="background:' + me.color + '"></span>' +
      '<div>' +
        '<span class="identity-name">You<strong>' + me.id + '</strong></span>' +
        '<div class="identity-dept">' + me.deptName + '</div>' +
      '</div>' +
    '</div>' +
    '<p class="identity-tip">Click a cell on your row to mark it as a holiday.</p>' +
    '<div class="identity-actions">' +
      '<button id="btn-switch-user" class="chip-btn">Switch user</button>' +
      '<button id="btn-clear-mine" class="chip-btn" style="color:#c1422d;border-color:rgba(193,66,45,0.32)">Clear my holidays</button>' +
    '</div>';
  container.appendChild(wrap);

  document.getElementById("btn-switch-user").addEventListener("click", () => {
    if (!confirm("Switch user? Your holidays stay saved in this browser.")) return;
    state.me = null;
    saveState();
    renderAll();
  });
  document.getElementById("btn-clear-mine").addEventListener("click", () => {
    if (!confirm("Clear all of " + me.id + "'s holidays?")) return;
    state.selections[me.id] = new Set();
    saveState();
    renderAll();
    showToast("Your holidays cleared");
  });
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
  for (const emp of EMPLOYEES) {
    const chip = document.createElement("button");
    const on = state.visible.has(emp.id);
    const isMe = emp.id === state.me;
    chip.className = "filter-chip" + (on ? "" : " off") + (isMe ? " is-me" : "");
    chip.title = on ? "Hide on calendar" : "Show on calendar";
    chip.innerHTML = '<span class="swatch" style="background:' + emp.color + '"></span>' + emp.id + (isMe ? " · you" : "");
    chip.addEventListener("click", () => {
      if (on) state.visible.delete(emp.id); else state.visible.add(emp.id);
      saveState();
      renderActiveMonth();
      renderFilterList();
    });
    container.appendChild(chip);
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
function renderAll() {
  renderIdentityBar();
  renderMonthNav();
  renderActiveMonth();
  renderFilterList();
  renderSummary();
  const adm = document.getElementById("admin-badge");
  if (adm) adm.hidden = !ADMIN_MODE;
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
  renderAll();

  document.getElementById("btn-export").addEventListener("click", exportMine);
  document.getElementById("btn-export-all").addEventListener("click", exportAll);
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("file-import").click();
  });
  document.getElementById("file-import").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJson(f);
    e.target.value = "";
  });
  document.getElementById("btn-share").addEventListener("click", shareMyLink);
  document.getElementById("btn-reset").addEventListener("click", () => {
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

  document.querySelectorAll("[data-admin]").forEach(el => { el.hidden = !ADMIN_MODE; });
  setStatus("ready");
}

document.addEventListener("DOMContentLoaded", init);
