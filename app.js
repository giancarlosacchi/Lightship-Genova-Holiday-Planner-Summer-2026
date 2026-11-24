/* ============================================================
   Lightship Genova — Winter Holiday Planner (Dec 2026 – Feb 2027)
   A tear-off desk calendar. Click a day, tick who's off. Saved
   for everyone in real time. No login.
   ============================================================ */

const SEASON = [[2026, 11], [2027, 0], [2027, 1]];             // [year, month0]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MON3   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY3   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const HOLIDAYS = {
  "2026-12-08": "Immacolata",
  "2026-12-25": "Christmas",
  "2026-12-26": "St Stephen",
  "2027-01-01": "New Year",
  "2027-01-06": "Epiphany",
};

const DEPARTMENTS = [
  { name: "Broker — Gearless", key: "gearless",   members: ["OPE", "MPE", "LDC", "BEE", "MCD"] },
  { name: "Broker — Geared",   key: "geared",     members: ["SDP", "FGA", "IEB"] },
  { name: "Back Office",       key: "backoffice", members: ["MST", "GBE", "CPA", "GCS"] },
  { name: "Sale and Purchase", key: "snp",        members: ["FEG", "ACR"] },
];
const PALETTE = ["#8fd3ff","#ff7eb9","#fff57a","#b8f28a","#c9a7f5","#7ae7e0","#ffb26b","#ffc6d9","#e4f772","#b3c7ff","#ffd166","#ff9e8a","#a8e6c1"];   // real Post-it shades
const EMPLOYEES = [];
// colours stay put when someone joins: newcomers get their own entry here
const OWN_COLOR = { IEB: "#f4a8ff" };
let nextColor = 0;
DEPARTMENTS.forEach(d => d.members.forEach(id => EMPLOYEES.push({ id, dept: d.key, deptName: d.name, color: OWN_COLOR[id] || PALETTE[nextColor++] })));
const EMP = Object.fromEntries(EMPLOYEES.map(e => [e.id, e]));

/* Same database as the summer planner. Dates carry the year, and every
   change is an atomic transaction on one person's list, so nothing else
   is ever touched. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDqKWZ_fYtIIXdasEHX5atCwJ995rjFMZg",
  authDomain: "lightship-holiday-planner.firebaseapp.com",
  databaseURL: "https://lightship-holiday-planner-default-rtdb.firebaseio.com",
  projectId: "lightship-holiday-planner",
  storageBucket: "lightship-holiday-planner.firebasestorage.app",
  messagingSenderId: "545676531164",
  appId: "1:545676531164:web:fcd376a877d56a89912b19"
};
const CACHE_KEY = "lightship-winter-2627-cache";
const DRY_RUN = new URLSearchParams(location.search).get("dry") === "1";   // try it without saving
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = { month: 0, sel: {}, me: null, who: null, whoPick: null, tearing: false, queued: null };
let db = null;
const $ = s => document.querySelector(s);

/* ---------------- helpers ---------------- */
const iso = (y, m, d) => { const t = new Date(y, m, d); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); };
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dow = t => (t.getDay() + 6) % 7;                          // Mon = 0
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
const toList = v => Array.isArray(v) ? v.filter(Boolean) : (v && typeof v === "object" ? Object.values(v) : []);
const has = (id, date) => !!(state.sel[id] && state.sel[id].has(date));
const offOn = date => EMPLOYEES.filter(e => has(e.id, date));
const clashOf = (date, emp) => DEPARTMENTS.find(d => d.key === emp.dept).members.some(o => o !== emp.id && has(o, date));
const longDate = s => { const t = parse(s); return DAYS[dow(t)] + " " + t.getDate() + " " + MONTHS[t.getMonth()]; };
const shortDate = s => { const t = parse(s); return DAY3[dow(t)] + " " + t.getDate() + " " + MON3[t.getMonth()]; };
const isFree = s => { const t = parse(s); return dow(t) >= 5 || !!HOLIDAYS[s]; };
const rand = (a, b) => a + Math.random() * (b - a);
// a stable little angle for a sticky note, from its person and day
const tilt = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return ((h % 900) / 100 - 4.5).toFixed(1); };

/* ---------------- Firebase ---------------- */
function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    db.ref(".info/connected").on("value", s => setSync(s.val() ? "ok" : ""));
    db.ref("selections").on("value", snap => {
      const next = {};
      for (const [id, v] of Object.entries(snap.val() || {})) if (EMP[id]) next[id] = new Set(toList(v));
      const count = o => Object.values(o).reduce((n, s) => n + s.size, 0);
      if (count(next) === 0 && count(state.sel) > 0) return;   // ignore an empty hiccup
      if (DRY_RUN) for (const [id, s] of Object.entries(state.sel)) next[id] = s; // keep local tries
      state.sel = next;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(Object.entries(next).map(([k, s]) => [k, [...s]])))); } catch (e) {}
      renderSheet();
    }, () => setSync("err"));
  } catch (e) {
    console.error(e);
    setSync("err");
  }
}

function save(id, date, on) {
  if (DRY_RUN) return;
  if (!db) { toast("Offline — not saved"); return; }
  db.ref("selections/" + id).transaction(cur => {
    const s = new Set(toList(cur));
    if (on) s.add(date); else s.delete(date);
    return [...s].sort();
  }).catch(() => {
    const s = state.sel[id];
    if (on) s.delete(date); else s.add(date);
    renderSheet();
    toast("Couldn't save — check your connection");
  });
}

function setSync(kind) {
  const el = $("#sync");
  if (!el) return;
  el.className = "sync " + kind;
  el.querySelector("span").textContent = DRY_RUN ? "Preview — not saving" : kind === "ok" ? "Live" : kind === "err" ? "Offline" : "Connecting";
}

/* ---------------- month nav ---------------- */
function renderNav() {
  const nav = $("#months");
  if (!nav.children.length) {
    nav.insertAdjacentHTML("beforeend", '<span class="slider" aria-hidden="true"></span>');
    SEASON.forEach(([y, m], i) => {
      const b = document.createElement("button");
      b.innerHTML = MONTHS[m] + "<small>" + y + "</small>";
      b.addEventListener("click", () => goMonth(i));
      nav.appendChild(b);
    });
  }
  const btns = nav.querySelectorAll("button");
  btns.forEach((b, i) => b.setAttribute("aria-current", i === state.month ? "true" : "false"));
  const a = btns[state.month], s = nav.querySelector(".slider");
  s.style.width = a.offsetWidth + "px";
  s.style.transform = "translateX(" + a.offsetLeft + "px)";
}

/* ---------------- the sheet ---------------- */
function sheetHTML(i) {
  const [Y, M] = SEASON[i];
  const first = new Date(Y, M, 1);
  const lead = dow(first);
  const dim = new Date(Y, M + 1, 0).getDate();
  const cells = Math.max(35, Math.ceil((lead + dim) / 7) * 7);
  const today = todayIso();
  let h = '<div class="s-head"><h2 class="s-title">' + MONTHS[M] + "<b>" + Y + '</b></h2><span class="s-note">Lightship Chartering Genova<br>Holiday planner</span></div>';
  h += '<div class="wd">' + DAY3.map((d, k) => '<span class="' + (k >= 5 ? "sun" : "") + '">' + d + "</span>").join("") + "</div>";
  h += '<div class="days">';
  for (let k = 0; k < cells; k++) {
    const t = new Date(Y, M, 1 - lead + k);
    const date = iso(t.getFullYear(), t.getMonth(), t.getDate());
    const w = dow(t), inM = t.getMonth() === M, hol = HOLIDAYS[date];
    const cls = ["c", w === 5 && "sat", w === 6 && "sun", hol && inM && "hol", !inM && "out", date === today && "today"].filter(Boolean).join(" ");
    const egg = inM ? EGG_DATES[date] || (date === today ? "today" : "") : "";
    const eggAttr = egg ? ' data-egg="' + egg + '"' : "";
    let inner = '<span class="n">' + t.getDate() + "</span>";
    if (hol && inM) inner += '<span class="hn">' + hol + "</span>";
    if (inM && !isFree(date)) {
      const off = offOn(date);
      if (off.length) {
        const cap = innerWidth <= 760 ? 3 : 6;
        const shown = off.length > cap ? off.slice(0, cap - 1) : off;
        inner += '<span class="chips">' + shown.map(e =>
          '<span class="chip' + (e.id === state.me ? " mine" : "") + (state.fresh === e.id + date ? " new" : "") + '" style="--c:' + e.color + ';--tilt:' + tilt(e.id + date) + 'deg"><i></i>' + e.id + "</span>").join("") +
          (off.length > shown.length ? '<span class="chip more">+' + (off.length - shown.length) + "</span>" : "") + "</span>";
      }
      const mine = state.me && has(state.me, date);
      if (state.me && !mine) inner += '<span class="ghost" aria-hidden="true" style="--c:' + EMP[state.me].color + '">+ ' + state.me + "</span>";
      const label = (mine ? "Cancel your day off on " : state.me ? "Book " : "") + longDate(date) + (off.length ? ". Off: " + off.map(e => e.id).join(", ") : ". Nobody off");
      h += '<button class="' + cls + (mine ? " is-mine" : "") + '" data-date="' + date + '"' + eggAttr + ' aria-pressed="' + !!mine + '" aria-label="' + label + '">' + inner + "</button>";
    } else {
      h += '<div class="' + cls + '" data-date="' + date + '"' + eggAttr + ">" + inner + "</div>";
    }
  }
  return h + "</div>";
}

function renderSheet() {
  $("#sheet").innerHTML = sheetHTML(state.month);
  state.fresh = null;
  if (plane.el) planeCheck();
}

/* ---------------- tearing a page off ----------------
   Like a real tear-off pad: you pinch the sheet, its bottom-right lifts
   toward you, the perforation gives way from right to left, and the
   loose page drops, fluttering, off the bottom of the screen. A ragged
   stub stays under the glue.                                            */
function raggedEdge(width, base, step) {
  const pts = [];
  let y = base;
  for (let x = 0; x <= width + step; x += step) {
    y = base + Math.max(-3.5, Math.min(4, (y - base) * .45 + rand(-2.6, 2.6)));
    pts.push([Math.min(x, width), y]);
  }
  return pts;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };   // smootherstep

function tearStrips(i) {
  state.tearing = true;
  const sheet = $("#sheet");
  const r = sheet.getBoundingClientRect();
  const W = r.width, H = r.height, TEAR_Y = 9;
  const edge = raggedEdge(W, TEAR_Y, rand(4, 6.5));
  const N = clamp(Math.round(W / 46), 9, 18);
  const sw = W / N;

  const layer = $("#tear-layer");
  layer.style.perspective = "1500px";
  layer.style.perspectiveOrigin = (r.left + W / 2) + "px " + (r.top + H * .3) + "px";

  const leaf = document.createElement("div");
  leaf.className = "leaf";
  leaf.style.cssText = "left:" + r.left + "px;top:" + r.top + "px;width:" + W + "px;height:" + H + "px";

  // the page is cut into vertical strips so it can bend like paper
  const strips = [];
  for (let k = 0; k < N; k++) {
    const s = document.createElement("div");
    s.className = "strip";
    const x0 = k * sw, w = sw + 6;      // generous overlap: no hairline gaps between strips
    s.style.cssText = "left:" + x0 + "px;width:" + w + "px;height:" + H + "px";
    const copy = sheet.cloneNode(true);
    copy.removeAttribute("id");
    copy.style.cssText = "position:absolute;left:" + (-x0) + "px;top:0;width:" + W + "px;margin:0";
    s.appendChild(copy);
    const pts = edge.filter(([x]) => x >= x0 - 7 && x <= x0 + w + 7).map(([x, y]) => (x - x0).toFixed(1) + "px " + y.toFixed(1) + "px");
    s.style.clipPath = "polygon(" + pts.join(",") + "," + w + "px " + H + "px,0 " + H + "px)";
    const sh = document.createElement("div");
    sh.className = "sh";
    s.appendChild(sh);
    leaf.appendChild(s);
    strips.push({ el: s, sh, u: (k + .5) / N });
  }

  // the ragged stub that stays under the glue
  document.querySelector(".stub")?.remove();
  const stub = document.createElement("div");
  stub.className = "stub";
  stub.style.clipPath = "polygon(0 0, 100% 0, " + edge.slice().reverse().map(([x, y]) => (x / W * 100).toFixed(2) + "% " + y.toFixed(1) + "px").join(",") + ")";
  stub.style.height = (TEAR_Y + 6) + "px";
  stub.style.opacity = "0";

  // cover the old page first, then put the new month underneath
  layer.appendChild(leaf);
  state.month = i;
  renderSheet();
  renderNav();
  const under = document.createElement("div");
  under.className = "under-shade";
  under.style.opacity = "0";
  $(".sheets").append(under, stub);

  // One continuous gesture. Every curve is a smootherstep, so nothing starts
  // or stops with a jolt, and the fall begins with the speed of the pull.
  const D = 1050;
  const fall = innerHeight - r.top + 180;
  const drift = Math.random() < .5 ? -1 : 1;
  let lastFibre = 1.1, t0 = null;

  function frame(now) {
    if (t0 === null) t0 = now;                                  // start timing after the first paint
    const p = clamp((now - t0) / D, 0, 1);
    const grab = smooth(0, .2, p);                              // fingers pinch the bottom-right corner
    const front = 1.06 - 1.18 * smooth(.06, .4, p);             // the perforation gives way, right to left
    const loose = smooth(.3, .6, p);                            // fully detached
    const f = clamp((p - .3) / .7, 0, 1);                       // falling time

    for (const s of strips) {
      const u = s.u;
      const freed = smooth(0, .35, u - front);
      // neighbouring strips only ever differ a little, so the paper never shows steps
      let rx = grab * (3 + 7 * u * u) + freed * 11;
      let ty = grab * 2 * u + freed * 10;
      rx += (12 - rx) * loose;                                  // once loose: one sheet, one curve
      ty += (10 - ty) * loose;
      s.el.style.transform = "translate3d(0," + ty.toFixed(2) + "px,0) rotateX(" + rx.toFixed(2) + "deg)";
      s.sh.style.opacity = clamp(rx / 36, 0, .85).toFixed(3);
    }

    if (front < lastFibre - .08 && front > -.04) {
      lastFibre = front;
      fibre(r.left + clamp(front, 0, 1) * W + rand(-5, 5), r.top + TEAR_Y + rand(-2, 2));
    }
    stub.style.opacity = smooth(1.06, .9, front).toFixed(2);

    // gravity with a running start, flutter that fades in, a little drift
    const amp = smooth(0, .25, f);
    const y = fall * (f * f * .82 + f * .18);
    const x = drift * (Math.sin(f * Math.PI * 1.5) * 24 + f * 40) * amp;
    const rz = drift * (Math.sin(f * Math.PI * 2) * 4 + f * 10) * amp;
    const rxF = Math.sin(f * Math.PI * 3) * 15 * amp;
    const ry = Math.sin(f * Math.PI * 2.4) * 11 * amp;
    leaf.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) rotateZ(" + rz.toFixed(2) + "deg) rotateX(" + rxF.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
    under.style.opacity = ((.32 * grab) * (1 - smooth(.35, .75, p))).toFixed(3);

    if (p < 1) requestAnimationFrame(frame);
    else {
      leaf.remove(); under.remove();
      state.tearing = false;
      if (state.queued !== null) { const q = state.queued; state.queued = null; goMonth(q); }
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(frame));    // let the copies paint once before moving
  setTimeout(() => planeHop(), D * .3);
}

function goMonth(i) {
  if (i === state.month || i < 0 || i >= SEASON.length) return;
  if (state.tearing) { state.queued = i; return; }
  tearRhythm();
  if (REDUCED) {
    state.month = i; renderSheet(); renderNav();
    $("#sheet").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    return;
  }
  tearStrips(i);
}

function fibre(x, y) {
  const b = document.createElement("span");
  b.className = "bit fibre";
  b.style.left = x + "px"; b.style.top = y + "px";
  b.style.width = rand(2, 5) + "px"; b.style.height = rand(1, 2) + "px";
  document.body.appendChild(b);
  const dx = rand(-14, 14), dy = rand(40, 90);
  b.animate([
    { transform: "translate(0,0) rotate(0)", opacity: 1 },
    { transform: "translate(" + dx + "px," + dy + "px) rotate(" + rand(-200, 200) + "deg)", opacity: 0 }
  ], { duration: rand(700, 1100), easing: "cubic-bezier(.3,0,.7,1)" }).onfinish = () => b.remove();
}

/* ---------------- who are you ----------------
   The first thing the page asks. Your choice is remembered on this
   device; changing it needs the office password, so nobody books days
   for the wrong person by mistake. (A friendly lock, not real security:
   anyone who reads the source can find it.)                            */
const ME_KEY = "lightship-winter-2627-me";
const SWITCH_PASSWORD = "Lightship1";

function loadMe() {
  try { const id = localStorage.getItem(ME_KEY); if (EMP[id]) state.me = id; } catch (e) {}
}

function renderMe() {
  const el = $("#me");
  if (!state.me) { el.hidden = true; return; }
  const e = EMP[state.me];
  el.hidden = false;
  // your initials; click them to switch person (asks for the password)
  el.innerHTML = '<button class="me-tag me-switch" type="button" style="--c:' + e.color + '" title="Switch person" aria-label="You are ' + e.id + '. Switch person"><i></i>' + e.id + '</button>';
}

let whoTimer = null;
function openWho(step) {
  clearTimeout(whoTimer);
  $("#who").classList.remove("leaving");
  state.who = step;                       // "pick" | "password"
  state.whoPick = null;
  const w = $("#who");
  const canCancel = !!state.me;
  const card = step === "password"
    ? '<form class="who-card" id="who-form" autocomplete="off">' +
        '<h2 id="who-title">Switch person</h2>' +
        '<p class="who-sub">You are booking as <b>' + state.me + '</b>. Enter the office password to change.</p>' +
        '<label class="who-field"><span>Password</span><input id="who-pw" type="password" autocomplete="off" spellcheck="false" required></label>' +
        '<p class="who-err" id="who-err" aria-live="polite"></p>' +
        '<div class="who-actions"><button type="button" class="who-ghost" data-act="cancel">Cancel</button><button type="submit" class="who-go">Continue</button></div>' +
      "</form>"
    : '<div class="who-card">' +
        '<h2 id="who-title">Who are you?</h2>' +
        '<p class="who-sub">Pick your initials. Your days off will be saved under this name.</p>' +
        DEPARTMENTS.map(d => '<div class="who-group"><h3>' + d.name + '</h3><div class="who-row">' +
          d.members.map(id => '<button type="button" class="who-pick" data-id="' + id + '" style="--c:' + EMP[id].color + '" aria-pressed="false"><i></i>' + id + "</button>").join("") +
          "</div></div>").join("") +
        '<div class="who-actions">' + (canCancel ? '<button type="button" class="who-ghost" data-act="cancel">Cancel</button>' : "<span></span>") +
          '<button type="button" class="who-go" data-act="confirm" disabled>Choose your initials</button></div>' +
      "</div>";
  w.innerHTML = card;
  w.hidden = false;
  document.body.classList.add("who-open");
  requestAnimationFrame(() => (w.querySelector("#who-pw") || w.querySelector(".who-pick"))?.focus({ preventScroll: true }));
}

function closeWho() {
  const w = $("#who");
  state.who = null;
  document.body.classList.remove("who-open");
  if (REDUCED) { w.hidden = true; return; }
  w.classList.add("leaving");
  whoTimer = setTimeout(() => { w.hidden = true; w.classList.remove("leaving"); }, 260);
}

function onWhoClick(e) {
  const pick = e.target.closest(".who-pick");
  if (pick) {
    state.whoPick = pick.dataset.id;
    $("#who").querySelectorAll(".who-pick").forEach(b => b.setAttribute("aria-pressed", b === pick));
    const go = $("#who").querySelector(".who-go");
    go.disabled = false;
    go.textContent = "I'm " + state.whoPick;
    go.style.setProperty("--c", EMP[state.whoPick].color);
    return;
  }
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "cancel") closeWho();
  if (act === "confirm" && state.whoPick) {
    state.me = state.whoPick;
    try { localStorage.setItem(ME_KEY, state.me); } catch (e) {}
    closeWho();
    renderMe();
    renderSheet();
    toast("Hi " + state.me + " — click any working day to book it.");
  }
}

function onWhoSubmit(e) {
  e.preventDefault();
  const input = $("#who-pw");
  if (input.value === SWITCH_PASSWORD) { openWho("pick"); return; }
  $("#who-err").textContent = "That's not the password.";
  input.select();
  const card = $("#who .who-card");
  card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
}

/* ---------------- booking your own day ---------------- */
function toggleMine(date) {
  if (!state.me) { openWho("pick"); return; }
  const id = state.me;
  const s = state.sel[id] || (state.sel[id] = new Set());
  const on = !s.has(date);
  if (on) s.add(date); else s.delete(date);
  state.fresh = on ? id + date : null;
  renderSheet();
  save(id, date, on);
  const others = offOn(date).filter(e => e.id !== id && e.dept === EMP[id].dept).map(e => e.id);
  toast(on ? (others.length ? "Booked " + shortDate(date) + " — " + others.join(", ") + " from your team is off too" : "Booked " + shortDate(date) + " off") : "Removed " + shortDate(date));
  if (on) afterBooking(id, date);
}

/* ---------------- the plane ----------------
   It rests on an empty square (never on anyone's name). The pointer pushes
   it softly, like the snow used to: it slides ahead of the cursor, gets
   carried along the way you move, turns its nose where it is going, and
   can never be touched. Leave it alone and it glides to the nearest free
   square. It never leaves the calendar.                                  */
const plane = { x: 0, y: 0, vx: 0, vy: 0, heading: rand(-40, 40), hv: 0, bank: 0, lift: 0, roll: null, target: null, calmSince: 0, last: 0 };
const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, t: 0, active: false };
let planeRunning = false;

function initPlane() {
  plane.el = $(".prop");
  plane.rots = plane.el.querySelectorAll(".rot");
  plane.shadow = plane.el.querySelector(".shadow");
  const pad = $("#pad");
  const move = e => {
    const r = pad.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
    if (pointer.active && pointer.t) {
      const dt = clamp((now - pointer.t) / 16.667, .5, 4);
      pointer.vx = pointer.vx * .55 + (x - pointer.x) / dt * .45;
      pointer.vy = pointer.vy * .55 + (y - pointer.y) / dt * .45;
    }
    pointer.x = x; pointer.y = y; pointer.t = now; pointer.active = true;
    wakePlane();
  };
  pad.addEventListener("pointermove", move);
  pad.addEventListener("pointerdown", move);
  pad.addEventListener("pointerleave", () => { pointer.active = false; pointer.vx = pointer.vy = 0; wakePlane(); });
  requestAnimationFrame(() => {
    const s = parkingSpots().sort((a, b) => b.weight - a.weight);
    const best = s.filter(x => x.weight === (s[0] && s[0].weight));
    const start = best.length ? best[Math.floor(Math.random() * best.length)] : { x: 200, y: 200 };
    plane.x = start.x; plane.y = start.y; plane.target = start;
    paintPlane();
    plane.el.classList.add("ready");
  });
}

// empty squares: weekends, days from other months, days nobody booked
function parkingSpots() {
  const pad = $("#pad").getBoundingClientRect();
  const out = [];
  document.querySelectorAll("#sheet .c").forEach(c => {
    if (c.querySelector(".chips")) return;
    const r = c.getBoundingClientRect();
    const weight = c.querySelector(".hn") ? .3 : c.classList.contains("out") || c.classList.contains("sat") || c.classList.contains("sun") ? 3 : 1;
    out.push({ x: r.left - pad.left + r.width * .6, y: r.top - pad.top + r.height * .6, weight, date: c.dataset.date });
  });
  return out;
}

const planeSize = () => plane.el.offsetWidth;
const pushRadius = () => planeSize() * 1.25 + 70;

function planeBounds() {
  const pad = $("#pad").getBoundingClientRect(), d = $("#sheet .days").getBoundingClientRect();
  const m = planeSize() * .5;
  return { x0: d.left - pad.left + m, x1: d.right - pad.left - m, y0: d.top - pad.top + m, y1: d.bottom - pad.top - m };
}

// nearest free square that isn't under the pointer
function chooseSpot(avoid, randomish) {
  const spots = parkingSpots();
  if (!spots.length) return null;
  const R = pushRadius() * 1.15;
  let pool = spots.filter(s => !avoid || Math.hypot(s.x - avoid.x, s.y - avoid.y) > R);
  if (!pool.length) pool = spots;
  pool.sort((a, b) => Math.hypot(a.x - plane.x, a.y - plane.y) / a.weight - Math.hypot(b.x - plane.x, b.y - plane.y) / b.weight);
  return pool[randomish ? Math.floor(Math.random() * Math.min(3, pool.length)) : 0];
}

function wakePlane() {
  if (planeRunning || REDUCED || !plane.target && !plane.el?.classList.contains("ready")) return;
  planeRunning = true;
  plane.last = performance.now();
  requestAnimationFrame(stepPlane);
}

function stepPlane(now) {
  const dt = clamp((now - plane.last) / 16.667, .25, 2.5);
  plane.last = now;
  const b = planeBounds();
  const R = pushRadius();
  const dx = plane.x - pointer.x, dy = plane.y - pointer.y;
  const d = Math.hypot(dx, dy) || .001;
  const ux = dx / d, uy = dy / d;
  let ax = 0, ay = 0;
  const near = pointer.active && d < R;

  if (near) {
    const s = 1 - d / R;
    // a soft field that gets firm close in, exactly like the snowflakes
    const f = s * s * 1.6 + Math.pow(s, 4) * 9;
    ax += ux * f; ay += uy * f;
    // and it is carried along by the way the cursor moves
    ax += pointer.vx * s * .22; ay += pointer.vy * s * .22;
    plane.target = null;
    plane.calmSince = now;
  } else if (!plane.target && now - plane.calmSince > 260) {
    plane.target = chooseSpot(pointer.active ? pointer : null);
  }

  if (plane.target) {
    // glide home on a damped spring
    ax += (plane.target.x - plane.x) * .010;
    ay += (plane.target.y - plane.y) * .010;
  }

  // soft walls: the edge of the calendar pushes back before the hard stop
  const wall = 26;
  if (plane.x < b.x0 + wall) ax += (b.x0 + wall - plane.x) * .05;
  if (plane.x > b.x1 - wall) ax -= (plane.x - (b.x1 - wall)) * .05;
  if (plane.y < b.y0 + wall) ay += (b.y0 + wall - plane.y) * .05;
  if (plane.y > b.y1 - wall) ay -= (plane.y - (b.y1 - wall)) * .05;

  const damp = Math.pow(plane.target && !near ? .86 : .9, dt);
  plane.vx = (plane.vx + ax * dt) * damp;
  plane.vy = (plane.vy + ay * dt) * damp;
  const sp = Math.hypot(plane.vx, plane.vy);
  if (sp > 16) { plane.vx *= 16 / sp; plane.vy *= 16 / sp; }
  plane.x += plane.vx * dt;
  plane.y += plane.vy * dt;

  // hard stop at the edges: slide along them instead of leaving
  if (plane.x < b.x0) { plane.x = b.x0; plane.vx = Math.abs(plane.vx) * .2; }
  if (plane.x > b.x1) { plane.x = b.x1; plane.vx = -Math.abs(plane.vx) * .2; }
  if (plane.y < b.y0) { plane.y = b.y0; plane.vy = Math.abs(plane.vy) * .2; }
  if (plane.y > b.y1) { plane.y = b.y1; plane.vy = -Math.abs(plane.vy) * .2; }

  // last resort, cornered: ease out of reach along the free side
  if (pointer.active) {
    const min = planeSize() * .6 + 20;
    const d2 = Math.hypot(plane.x - pointer.x, plane.y - pointer.y);
    if (d2 < min) {
      let best = null, bestD = Infinity;
      for (let k = 0; k < 36; k++) {
        const a = k / 36 * Math.PI * 2, x = pointer.x + Math.cos(a) * min, y = pointer.y + Math.sin(a) * min;
        if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
        const dd = Math.hypot(x - plane.x, y - plane.y);
        if (dd < bestD) { bestD = dd; best = { x, y }; }
      }
      if (best) { plane.x += (best.x - plane.x) * .65; plane.y += (best.y - plane.y) * .65; }
    }
  }

  // nose follows the direction of travel, through a damped turn
  const speed = Math.hypot(plane.vx, plane.vy);
  if (speed > .35) {
    const want = Math.atan2(plane.vx, -plane.vy) * 180 / Math.PI;
    const diff = ((want - plane.heading + 540) % 360) - 180;
    plane.hv = plane.hv * Math.pow(.7, dt) + diff * .06 * Math.min(1, speed / 2) * dt;
  } else plane.hv *= Math.pow(.7, dt);
  plane.heading += plane.hv * dt;
  plane.bank += (clamp(plane.hv * .045, -.35, .35) - plane.bank) * .2 * dt;
  plane.lift += (clamp(speed / 5, 0, 1) - plane.lift) * .12 * dt;

  paintPlane();
  const parked = plane.target && Math.hypot(plane.target.x - plane.x, plane.target.y - plane.y) < .5 && speed < .04;
  const busy = !parked || near || plane.lift > .01 || Math.abs(plane.hv) > .02 || plane.roll;
  if (busy) requestAnimationFrame(stepPlane); else planeRunning = false;
}

function paintPlane() {
  const w = planeSize();
  let sx = 1 - Math.abs(plane.bank) * .35;
  if (plane.roll) {
    const p = (performance.now() - plane.roll) / 900;
    if (p >= 1) plane.roll = null; else sx = Math.cos(p * Math.PI * 2);
  }
  plane.el.style.transform = "translate3d(" + (plane.x - w / 2).toFixed(2) + "px," + (plane.y - w / 2).toFixed(2) + "px,0) scale(" + (1 + plane.lift * .14).toFixed(3) + ")";
  const rot = "rotate(" + plane.heading.toFixed(2) + "deg) scaleX(" + sx.toFixed(3) + ")";
  plane.rots.forEach(r => r.style.transform = rot);
  plane.shadow.style.transform = "translate3d(" + (4 + plane.lift * 22).toFixed(1) + "px," + (6 + plane.lift * 30).toFixed(1) + "px,0)";
  plane.shadow.style.filter = "blur(" + (3 + plane.lift * 8).toFixed(1) + "px)";
  plane.shadow.style.opacity = (.32 - plane.lift * .14).toFixed(3);
}

// after the calendar changes, make sure the plane isn't parked on a name
function planeCheck() {
  requestAnimationFrame(() => {
    if (!plane.target) return;
    const ok = parkingSpots().find(s => s.date === plane.target.date);
    plane.target = ok || chooseSpot(pointer.active ? pointer : null);
    wakePlane();
  });
}
function planeHop() {
  if (REDUCED || !plane.el) return;
  plane.target = chooseSpot(pointer.active ? pointer : { x: plane.x, y: plane.y }, true);
  plane.vy -= 2.5;
  wakePlane();
}
function planeRoll() {
  if (REDUCED || !plane.el) return;
  plane.roll = performance.now();
  planeHop();
}

/* ---------------- easter eggs ---------------- */
const EGG_DATES = {
  "2026-12-24": "eve", "2026-12-25": "xmas", "2026-12-31": "nye", "2027-01-01": "newyear",
  "2027-01-06": "befana", "2027-02-09": "carnival", "2027-02-14": "valentine"
};

// 2. Special days come alive while the pointer rests on them, and stop when it leaves.
let egg = null;                                   // { date, stop }
const cellRect = date => document.querySelector('.c[data-date="' + date + '"]')?.getBoundingClientRect();
const NO_HOVER = matchMedia("(hover: none)").matches;

const pick = a => a[Math.floor(Math.random() * a.length)];
const randInt = (a, b) => Math.floor(rand(a, b + 1));

// run fn now and again at a random rhythm, never quite the same twice
function loop(date, [min, max], fn) {
  let id = null, alive = true;
  const tick = () => {
    if (!alive) return;
    const r = cellRect(date); if (r) fn(r);
    id = setTimeout(tick, rand(min, max));
  };
  tick();
  return () => { alive = false; clearTimeout(id); };
}
const inCell = (r, a = .12, b = .88) => [r.left + r.width * rand(a, b), r.top + r.height * rand(a, b)];

const STAR_SETS = [["#f2a93b", "#ffffff", "#e0313f"], ["#fbbc04", "#fff3a3"], ["#ffffff", "#aecbfa", "#fdd663"], ["#e0313f", "#2f9e6e", "#f2c14e"]];
const FIRE_SETS = [["#f2c14e", "#ffffff"], ["#e0313f", "#f2a93b"], ["#1677c2", "#4aa3df", "#ffffff"], ["#d7aefb", "#ffffff"], ["#a8dab5", "#fdd663"], ["#f6aea9", "#fdcfe8", "#ffffff"]];

function startEgg(cell) {
  const date = cell.dataset.date, kind = cell.dataset.egg;
  if (egg && egg.date === date) return;
  stopEgg();
  const stop = ({
    eve: () => loop(date, [320, 950], r => {
      const [x, y] = inCell(r);
      burst(x, y, randInt(6, 14), pick(STAR_SETS), "star", rand(35, 80));
    }),
    xmas: () => christmasTree(date),
    nye: () => loop(date, [350, 1100], r => {
      const x = r.left + r.width * rand(-.2, 1.2), y = r.top - rand(-10, 120);
      burst(x, y, randInt(14, 28), pick(FIRE_SETS), "dot", rand(45, 100));
    }),
    newyear: () => loop(date, [220, 750], r => {
      const shots = Math.random() < .3 ? 2 : 1;
      for (let k = 0; k < shots; k++) setTimeout(() => {
        const x = r.left + r.width * rand(-.35, 1.35), y = r.top - rand(-20, 150);
        burst(x, y, randInt(16, 34), pick(FIRE_SETS), "dot", rand(50, 120));
      }, k * rand(90, 260));
    }),
    befana: () => befanaShadow(),
    carnival: () => loop(date, [260, 900], r => confetti(r.left + r.width * rand(.1, .9), r.top + r.height * rand(0, .45), randInt(10, 34))),
    valentine: () => loop(date, [650, 1600], r => { const [x, y] = inCell(r, .2, .8); hearts(x, y, randInt(1, 3)); }),
    today: () => loop(date, [900, 1700], r => ping(r))
  })[kind]?.();
  if (!stop) return;
  egg = { date, stop };
  // keep going while the pointer is on this day (the cell may be redrawn underneath)
  egg.watch = setInterval(() => {
    if (NO_HOVER) return;
    if (!document.querySelector('.c[data-date="' + date + '"]:hover')) stopEgg();
  }, 200);
  if (NO_HOVER) egg.timer = setTimeout(stopEgg, 4000);      // phones: a tap plays it for a few seconds
}
function stopEgg() {
  if (!egg) return;
  clearInterval(egg.watch); clearTimeout(egg.timer);
  egg.stop();
  egg = null;
}
function onEggHover(e) {
  if (REDUCED) return;
  const c = e.target.closest("[data-egg]");
  if (c) startEgg(c);
}

// 25 December: a Christmas tree builds itself in the square, then its lights twinkle.
// Every time: a slightly different size, baubles in a different order, a different twinkle.
function christmasTree(date) {
  const r = cellRect(date);
  const h = Math.max(76, Math.min(118, r.height * .82)) * rand(.9, 1.06), w = h * .78;
  const pos = [[31, 34, 3], [47, 40, 3], [24, 55, 3.2], [39, 61, 3.2], [55, 53, 3.2], [18, 76, 3.4], [33, 80, 3.4], [50, 79, 3.4], [63, 73, 3.4]];
  const cols = ["#ea4335", "#4285f4", "#fbbc04", "#ffffff", "#d7aefb", "#f6aea9"];
  const balls = pos.map(([cx, cy, rr]) =>
    '<circle cx="' + (cx + rand(-1.5, 1.5)).toFixed(1) + '" cy="' + (cy + rand(-1.5, 1.5)).toFixed(1) + '" r="' + rr + '" fill="' + pick(cols) +
    '" style="--d:' + rand(0, 8).toFixed(2) + ';--tw:' + rand(.9, 2.2).toFixed(2) + 's"/>').join("");
  const el = document.createElement("div");
  el.className = "xtree";
  el.style.cssText = "left:" + (r.right - w - 8) + "px;top:" + (r.bottom - h - 6) + "px;width:" + w + "px;height:" + h + "px";
  el.innerHTML =
    '<svg viewBox="0 0 78 100" aria-hidden="true">' +
      '<ellipse class="xt-shadow" cx="39" cy="96" rx="22" ry="3.2"/>' +
      '<rect class="xt-trunk" x="34" y="80" width="10" height="15" rx="2"/>' +
      '<path class="xt-tier t3" d="M8 82 L39 46 L70 82 Q39 88 8 82 Z"/>' +
      '<path class="xt-tier t2" d="M14 62 L39 28 L64 62 Q39 68 14 62 Z"/>' +
      '<path class="xt-tier t1" d="M21 42 L39 14 L57 42 Q39 47 21 42 Z"/>' +
      '<path class="xt-garland g1" d="M24 38 Q39 45 54 36"/>' +
      '<path class="xt-garland g2" d="M17 58 Q39 67 61 56"/>' +
      '<path class="xt-garland g3" d="M11 78 Q39 87 67 75"/>' +
      '<g class="xt-balls">' + balls + "</g>" +
      '<path class="xt-star" d="M39 3 L41.9 9.6 L49 10.2 L43.6 14.8 L45.3 21.8 L39 18 L32.7 21.8 L34.4 14.8 L29 10.2 L36.1 9.6 Z"/>' +
    "</svg>";
  document.body.appendChild(el);
  const follow = setInterval(() => {                       // stay on the square if the page scrolls
    const q = cellRect(date); if (!q) return;
    el.style.left = (q.right - w - 8) + "px"; el.style.top = (q.bottom - h - 6) + "px";
  }, 100);
  return () => {
    clearInterval(follow);
    el.classList.add("out");
    setTimeout(() => el.remove(), 420);
  };
}

// 6 January: the Befana flies behind the calendar; you only see her blurred
// shadow through the paper. Each pass is different: either direction (she always
// faces the way she flies), higher or lower, nearer or farther, faster or slower.
const BEFANA =
  '<path d="M4 46 L84 34 L85 37 L5 49 Z"/>' +                                              // handle, tip in front
  '<path d="M84 31 C96 26 112 24 118 22 C113 30 108 34 116 40 C106 40 96 42 86 41 Z"/>' +     // bristles, behind
  '<path d="M62 39 C64 28 60 19 51 15 L45 16 C41 22 40 31 42 40 Z"/>' +                      // cloak, leaning forward
  '<circle cx="44" cy="12" r="5.5"/>' +                                                        // head
  '<path d="M39.5 11 L33.5 14 L39.5 15 Z"/>' +                                                 // the famous nose, pointing ahead
  '<path d="M39 9 C42 3 51 2 55 6 L65 3 L59 11 L50 10 Z"/>' +                                  // headscarf streaming back
  '<path d="M46 24 L30 39 L33 42 L49 29 Z"/>' +                                                // arm holding the handle
  '<path d="M45 40 C43 47 39 51 34 53 L35 56 C42 54 47 49 49 41 Z"/>' +                        // legs, dangling forward
  '<path d="M60 33 C57 25 61 19 68 20 C73 24 72 33 65 37 Z"/>';                                // sack of sweets on her back

function befanaShadow() {
  const host = document.createElement("div");
  host.className = "befana-shadow";
  $(".sheets").appendChild(host);
  let alive = true, wait = null, anim = null;

  function pass() {
    if (!alive) return;
    const W = host.clientWidth, H = host.clientHeight;
    const dir = Math.random() < .5 ? -1 : 1;                     // -1: right to left (as drawn), 1: left to right (mirrored)
    const size = rand(150, 400);
    const sh = size * 70 / 120;
    const y0 = rand(.02, .7) * H, y1 = rand(.02, .7) * H, arc = rand(-.28, .28) * H;
    const bobs = rand(1, 3.5), bobA = rand(4, 22);
    const x0 = dir > 0 ? -size - 20 : W + 20, x1 = dir > 0 ? W + 20 : -size - 20;
    const s0 = rand(.8, 1.15), s1 = rand(.8, 1.15);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 70");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = "<g>" + BEFANA + "</g>";
    svg.style.width = size + "px";
    svg.style.filter = "blur(" + rand(6, 12).toFixed(1) + "px)";
    svg.style.opacity = rand(.14, .27).toFixed(2);
    host.appendChild(svg);
    const frames = [];
    const N = 12;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t + arc * Math.sin(Math.PI * t) + bobA * Math.sin(Math.PI * 2 * bobs * t) - sh / 2;
      // nose follows the path: tilt from the slope
      const dy = (y1 - y0) + arc * Math.PI * Math.cos(Math.PI * t) + bobA * Math.PI * 2 * bobs * Math.cos(Math.PI * 2 * bobs * t);
      const tilt = Math.max(-18, Math.min(18, Math.atan2(dy, Math.abs(x1 - x0)) * 180 / Math.PI)) * dir * .7;
      const sc = s0 + (s1 - s0) * t;
      frames.push({ transform: "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + tilt.toFixed(1) + "deg) scale(" + (sc * -dir).toFixed(3) + "," + sc.toFixed(3) + ")" });
    }
    const dur = rand(3600, 7800) * Math.sqrt(Math.max(.6, W / 1000));
    anim = svg.animate(frames, { duration: dur, easing: pick(["linear", "ease-in-out", "cubic-bezier(.3,.1,.5,1)", "cubic-bezier(.5,0,.7,.9)"]) });
    anim.onfinish = () => { svg.remove(); if (alive) wait = setTimeout(pass, rand(150, 1500)); };
  }
  pass();
  return () => {
    alive = false;
    clearTimeout(wait);
    host.classList.add("out");
    setTimeout(() => host.remove(), 700);
  };
}

function bit(x, y, html, css) {
  const b = document.createElement("span");
  b.className = "bit";
  b.style.left = x + "px"; b.style.top = y + "px";
  if (css) Object.assign(b.style, css);
  b.innerHTML = html || "";
  document.body.appendChild(b);
  return b;
}
const STAR = c => '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 0l1.6 4.4L12 6l-4.4 1.6L6 12 4.4 7.6 0 6l4.4-1.6z" fill="' + c + '"/></svg>';
const HEART = (c, s) => '<svg width="' + (16 * s).toFixed(1) + '" height="' + (15 * s).toFixed(1) + '" viewBox="0 0 16 15"><path d="M8 14.5S0 9.6 0 4.3C0 1.9 1.9 0 4.2 0 5.8 0 7.2.9 8 2.2 8.8.9 10.2 0 11.8 0 14.1 0 16 1.9 16 4.3c0 5.3-8 10.2-8 10.2z" fill="' + c + '"/></svg>';

function burst(x, y, n, colors, kind, dist) {
  for (let i = 0; i < n; i++) {
    const c = colors[i % colors.length];
    const size = rand(4, 8);
    const b = bit(x - 6, y - 6, kind === "star" ? STAR(c) : "", kind === "star" ? { transform: "scale(" + rand(.6, 1.3) + ")" } : { width: size + "px", height: size + "px", borderRadius: "50%", background: c });
    const a = i / n * Math.PI * 2 + rand(-.35, .35), d = dist * rand(.5, 1.15);
    const fall = rand(14, 40);
    b.animate([
      { transform: "translate(0,0) scale(.4) rotate(0)", opacity: 1 },
      { transform: "translate(" + Math.cos(a) * d + "px," + Math.sin(a) * d + "px) scale(1) rotate(" + rand(60, 300) + "deg)", opacity: 1, offset: rand(.5, .7) },
      { transform: "translate(" + Math.cos(a) * d * 1.1 + "px," + (Math.sin(a) * d * 1.1 + fall) + "px) scale(.5)", opacity: 0 }
    ], { duration: rand(800, 1500), easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => b.remove();
  }
}
function fireworks(x, y, rounds) {
  for (let k = 0; k < rounds; k++) setTimeout(() => burst(x + rand(-60, 60), y - rand(20, 110), randInt(16, 30), pick(FIRE_SETS), "dot", rand(55, 105)), k * rand(250, 450));
}
function confetti(x, y, n) {
  const cols = ["#e0313f", "#1677c2", "#f2a93b", "#2f9e6e", "#7b5cd6", "#c23b8c", "#aecbfa", "#fdd663", "#a8dab5"];
  for (let i = 0; i < n; i++) {
    const b = bit(x + rand(-34, 34), y + rand(-10, 10), "", { width: rand(4, 9) + "px", height: rand(3, 7) + "px", background: pick(cols), borderRadius: Math.random() < .3 ? "50%" : "1px" });
    const dx = rand(-180, 180), up = rand(40, 180), dn = rand(160, 380);
    b.animate([
      { transform: "translate(0,0) rotate(0)", opacity: 1 },
      { transform: "translate(" + dx * .5 + "px," + -up + "px) rotate(" + rand(-360, 360) + "deg)", offset: rand(.22, .38), easing: "ease-in" },
      { transform: "translate(" + dx + "px," + dn + "px) rotate(" + rand(-720, 720) + "deg)", opacity: 0 }
    ], { duration: rand(1300, 2600) }).onfinish = () => b.remove();
  }
}
// 14 February: hearts rise slowly, swaying, in different sizes and reds
function hearts(x, y, n = 3) {
  const reds = ["#e0313f", "#f06292", "#ff8a80", "#c2185b", "#f6aea9"];
  for (let i = 0; i < n; i++) {
    const s = rand(.7, 1.45);
    const b = bit(x - 8 + rand(-26, 26), y + rand(-8, 8), HEART(pick(reds), s));
    const rise = rand(140, 240), sway = rand(10, 26) * (Math.random() < .5 ? -1 : 1), drift = rand(-30, 30);
    const kf = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      kf.push({
        transform: "translate(" + (drift * t + sway * Math.sin(t * Math.PI * 2.2)).toFixed(1) + "px," + (-rise * t).toFixed(1) + "px) rotate(" + (sway * .6 * Math.sin(t * Math.PI * 2.2 + .6)).toFixed(1) + "deg) scale(" + (t < .15 ? .4 + 4 * t : 1).toFixed(2) + ")",
        opacity: t < .12 ? t / .12 : t > .7 ? (1 - t) / .3 : 1
      });
    }
    b.animate(kf, { duration: rand(3400, 5200), delay: i * rand(150, 450), easing: "linear", fill: "backwards" }).onfinish = () => b.remove();
  }
}
function ping(r) {
  const s = rand(28, 40);
  const b = bit(r.left + 12, r.top + 10, "", { width: s + "px", height: s + "px", borderRadius: "50%", boxShadow: "0 0 0 2px #1677c2" });
  b.animate([{ transform: "scale(.6)", opacity: 1 }, { transform: "scale(" + rand(1.8, 2.6) + ")", opacity: 0 }], { duration: rand(800, 1200), easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => b.remove();
}
// 3. Booking milestones.
function afterBooking(id, date) {
  // a proper holiday: five or more working days in a row
  let run = 0, t = parse(date);
  const back = new Date(t); while (true) { back.setDate(back.getDate() - 1); const s = iso(back.getFullYear(), back.getMonth(), back.getDate()); if (isFree(s)) continue; if (has(id, s)) run++; else break; }
  const fwd = new Date(t);  while (true) { fwd.setDate(fwd.getDate() + 1);   const s = iso(fwd.getFullYear(), fwd.getMonth(), fwd.getDate());   if (isFree(s)) continue; if (has(id, s)) run++; else break; }
  if (run + 1 === 5) setTimeout(() => { toast("Bon voyage, " + id + "! A whole week off."); planeRoll(); }, 900);
  if (offOn(date).length === EMPLOYEES.length) setTimeout(() => toast("Everyone's off. Last one out switches off the lights."), 900);
}
// 4. Konami code → snow. Type "ferie" → confetti. Type "genova" → the Lanterna sweeps the room. Type "aereo"/"plane" → take-off.
const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
let keys = [], typed = "";
function onKey(e) {
  if (state.who || (e.target.closest && e.target.closest("input,textarea"))) return;
  keys = [...keys, e.key].slice(-10);
  if (keys.join() === KONAMI.join()) { keys = []; snow(); return; }
  if (e.key.length === 1) {
    typed = (typed + e.key.toLowerCase()).slice(-12);
    if (typed.endsWith("ferie")) { confetti(innerWidth / 2, innerHeight * .3, 90); planeHop(); toast("Ferie! Book them before someone else does."); }
    if (typed.endsWith("genova")) lanterna();
    if (typed.endsWith("aereo") || typed.endsWith("plane")) planeRoll();
  }
  if (!state.who && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !keys.slice(0, -1).join().includes("ArrowUp,ArrowUp")) {
    goMonth(state.month + (e.key === "ArrowRight" ? 1 : -1));
  }
}
function snow() {
  if (REDUCED) return;
  toast("Snow day.");
  const end = Date.now() + 12000;
  (function drop() {
    if (Date.now() > end) return;
    const s = rand(3, 7);
    const f = bit(rand(0, innerWidth), -10, "", { width: s + "px", height: s + "px", borderRadius: "50%", background: "#fff", boxShadow: "0 0 3px rgba(0,0,0,.18)" });
    f.animate([{ transform: "translate(0,0)" }, { transform: "translate(" + rand(-80, 80) + "px," + (innerHeight + 20) + "px)" }], { duration: rand(5000, 9000), easing: "linear" }).onfinish = () => f.remove();
    setTimeout(drop, 70);
  })();
}
function lanterna() {
  if (REDUCED) return;
  toast("Ciao Genova — the Lanterna is on.");
  const beam = bit(0, 0, "", { position: "fixed", inset: "0", width: "100vw", height: "100vh", background: "linear-gradient(100deg, transparent 35%, rgba(255,236,170,.45) 48%, rgba(255,250,225,.6) 50%, rgba(255,236,170,.45) 52%, transparent 65%)", mixBlendMode: "soft-light" });
  beam.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(100%)" }], { duration: 1800, easing: "cubic-bezier(.45,0,.55,1)" }).onfinish = () => beam.remove();
}

// 5. Little things.
let tears = [];
function tearRhythm() {
  const now = Date.now();
  tears = [...tears.filter(t => now - t < 4000), now];
  if (tears.length === 4) toast("Easy — there are only three months.");
}
const WEEKEND_LINES = ["Weekend — already yours.", "Sunday. Even the ships rest.", "Saturday: the office is a myth.", "No need to book this one."];
let weekendLine = 0;
function onSheetClick(e) {
  const cell = e.target.closest(".c");
  if (!cell) return;
  const date = cell.dataset.date;
  if (cell.tagName === "BUTTON") { toggleMine(date); return; }
  if (cell.classList.contains("out")) {
    const t = parse(date);
    const idx = SEASON.findIndex(([y, m]) => y === t.getFullYear() && m === t.getMonth());
    if (idx >= 0) goMonth(idx);
    else toast(t.getMonth() === 10 ? "November is over. Mostly." : "March? Let's get through February first.");
    return;
  }
  if (cell.dataset.egg && NO_HOVER && !REDUCED) startEgg(cell);
  if (HOLIDAYS[date]) { toast(HOLIDAYS[date] + " — a public holiday, everyone's off."); return; }
  toast(WEEKEND_LINES[weekendLine++ % WEEKEND_LINES.length]);
}

let idleT;
function resetIdle() {
  clearTimeout(idleT);
  
}

/* ---------------- toast ---------------- */
let toastT;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 2400);
}

/* ---------------- init ---------------- */
function init() {
  const now = new Date();
  const cur = SEASON.findIndex(([y, m]) => y === now.getFullYear() && m === now.getMonth());
  state.month = cur >= 0 ? cur : 0;
  try {
    for (const [id, arr] of Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"))) if (EMP[id]) state.sel[id] = new Set(arr);
  } catch (e) {}

  loadMe();
  renderSheet();
  renderNav();
  renderMe();
  initPlane();
  if (!state.me) openWho("pick");
  initFirebase();
  if (DRY_RUN) setSync("");

  $("#sheet").addEventListener("click", onSheetClick);
  $("#sheet").addEventListener("pointerover", onEggHover);
  $("#sheet").addEventListener("pointerout", e => {          // stop the moment the pointer leaves that day
    if (!egg || NO_HOVER) return;
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest(".c") : null;
    if (!to || to.dataset.date !== egg.date) stopEgg();
  });
  $("#who").addEventListener("click", onWhoClick);
  $("#who").addEventListener("submit", onWhoSubmit);
  $("#me").addEventListener("click", e => { if (e.target.closest(".me-switch")) openWho("password"); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && state.who && state.me) closeWho();
    onKey(e);
    resetIdle();
  });
  $(".glue").addEventListener("click", () => {
    const pad = $("#pad");
    pad.classList.remove("wobble"); void pad.offsetWidth; pad.classList.add("wobble");
    toast("That's the glue. Tear from the months up top.");
  });
  ["pointermove", "pointerdown", "scroll"].forEach(t => addEventListener(t, resetIdle, { passive: true }));
  addEventListener("resize", () => { renderNav(); planeCheck(); });
  document.fonts?.ready.then(renderNav);
  resetIdle();

  console.log("%c  ✈  Lightship Chartering Genova", "font: 600 14px Jost, sans-serif; color:#1677c2");
  console.log("Looking for secrets? Try typing ferie, genova or aereo. Old gamers know another code.");
}

document.addEventListener("DOMContentLoaded", init);
