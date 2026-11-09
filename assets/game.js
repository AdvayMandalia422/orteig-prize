/* The Orteig Prize — student game */
(function () {
  "use strict";
  const O = window.Orteig;
  const API = window.OrteigAPI;
  const F = window.OrteigFmt;
  const Art = window.OrteigArt;
  const MAP = window.ORTEIG_MAP;
  const Storm = window.OrteigStorm;
  const NEEDLE_SPAN = 46; // % of the gauge on each side of center at full deflection
  const $ = (id) => document.getElementById(id);

  // Real seconds per hour of flight. ?fast=1 speeds up playback for testing;
  // it can't change a score, which depends only on the build and wake-ups.
  const SEC_PER_HOUR = new URLSearchParams(location.search).has("fast") ? 0.12 : 0.75;
  const LINDBERGH_HOURS = 33.5;

  // ---------------------------------------------------------------- state
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const DEFAULT_BUILD = { wing: "bi", engine: "liberty", tank: "medium", crew: "duo" };
  const state = {
    code: null,
    className: "",
    pilot: "",
    build: Object.assign({}, DEFAULT_BUILD, store.get("orteig.build", {})),
    lastFlight: null,
  };
  // Drop any stored part that no longer exists.
  for (const slot of O.SLOTS) if (!O.PARTS[slot][state.build[slot]]) state.build[slot] = DEFAULT_BUILD[slot];

  function show(screen) {
    for (const id of ["join", "hangar", "flight", "result"]) $("screen-" + id).hidden = id !== screen;
    window.scrollTo(0, 0);
    if (screen === "hangar") startMiniBoard(); else stopMiniBoard();
  }

  function setChip() {
    $("pilotChip").hidden = !state.pilot;
    $("chipPilot").textContent = state.pilot;
    $("chipClass").textContent = state.code ? state.code : "PRACTICE";
  }

  // ---------------------------------------------------------------- join
  function initJoin() {
    const params = new URLSearchParams(location.search);
    const urlCode = (params.get("class") || "").trim().toUpperCase();
    const saved = store.get("orteig.pilot", null);
    $("classCode").value = urlCode || (saved && saved.code) || "";
    $("pilotName").value = (saved && saved.pilot) || "";
    $("joinArt").innerHTML = Art.planeSVG(O.LINDBERGH, { spinning: true });

    $("classCode").addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    });
    $("joinForm").addEventListener("submit", onJoin);
    $("practiceBtn").addEventListener("click", () => {
      const pilot = cleanPilot($("pilotName").value) || "Practice pilot";
      enter(null, "", pilot);
    });
    $("switchPilot").addEventListener("click", () => show("join"));

    // Returning student with the same class in the link: go straight in.
    if (saved && saved.pilot && saved.code && (!urlCode || urlCode === saved.code)) {
      enter(saved.code, saved.className || "", saved.pilot);
      verifyClassQuietly(saved.code);
    }
  }

  function cleanPilot(s) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, 20);
  }

  async function onJoin(e) {
    e.preventDefault();
    const err = $("joinError");
    const code = $("classCode").value.trim().toUpperCase();
    const pilot = cleanPilot($("pilotName").value);
    err.textContent = "";
    if (!/^[A-Z0-9]{5}$/.test(code)) { err.textContent = "Type the 5-character class code from the board."; $("classCode").focus(); return; }
    if (!pilot || !/[A-Za-z0-9]/.test(pilot)) { err.textContent = "Type a pilot name, like your first name and last initial."; $("pilotName").focus(); return; }
    if (!/^[\p{L}\p{N} .'-]+$/u.test(pilot)) { err.textContent = "Use letters, numbers, spaces, periods, apostrophes, or hyphens."; $("pilotName").focus(); return; }
    const btn = $("joinBtn");
    btn.disabled = true; btn.textContent = "Checking the code…";
    const res = await API.classInfo(code);
    btn.disabled = false; btn.textContent = "Enter the hangar";
    if (res.ok) { enter(res.code, res.name, pilot); return; }
    if (res.error === "class_not_found") err.textContent = `No class uses the code ${code}. Check the code on the board.`;
    else err.textContent = "Can't reach the class board. Check your internet, or practice without a class.";
  }

  async function verifyClassQuietly(code) {
    const res = await API.classInfo(code);
    if (res.ok) { state.className = res.name; saveIdentity(); updateMiniTitle(); }
    else if (res.error === "class_not_found") { state.code = null; setChip(); show("join"); $("joinError").textContent = "That class board was closed. Ask for the new code."; }
  }

  function enter(code, className, pilot) {
    state.code = code;
    state.className = className;
    state.pilot = pilot;
    saveIdentity();
    setChip();
    renderHangar();
    show("hangar");
  }
  function saveIdentity() {
    store.set("orteig.pilot", { code: state.code, className: state.className, pilot: state.pilot });
  }

  // ---------------------------------------------------------------- hangar
  const SLOT_TITLES = { wing: "Wings", engine: "Engine", tank: "Fuel tank", crew: "Crew" };

  function buildPartsForm() {
    const form = $("partsForm");
    let html = "";
    for (const slot of O.SLOTS) {
      html += `<fieldset class="slot"><legend>${SLOT_TITLES[slot]}</legend><div class="options">`;
      for (const [id, part] of Object.entries(O.PARTS[slot])) {
        html +=
          `<label class="opt"><input type="radio" name="${slot}" value="${id}" id="opt-${slot}-${id}">` +
          `<span class="opt-card"><span class="opt-name">${F.esc(part.name)}</span><span class="opt-blurb">${F.esc(part.blurb)}</span></span></label>`;
      }
      html += `</div><p class="fact" id="fact-${slot}"></p></fieldset>`;
    }
    form.innerHTML = html;
    form.addEventListener("change", (e) => {
      if (e.target.name && O.PARTS[e.target.name]) {
        state.build[e.target.name] = e.target.value;
        store.set("orteig.build", state.build);
        renderHangar();
      }
    });
  }

  function renderHangar() {
    const b = state.build;
    for (const slot of O.SLOTS) {
      const input = $(`opt-${slot}-${b[slot]}`);
      if (input) input.checked = true;
      $("fact-" + slot).innerHTML = `<b>1927 NOTE</b>${F.esc(O.PARTS[slot][b[slot]].fact)}`;
    }
    const title = (state.pilot || "PILOT").toUpperCase().slice(0, 14);
    $("planeArt").innerHTML = Art.planeSVG(b, { callouts: true, title });
    renderGauges();
  }

  function renderGauges() {
    const s = O.stats(state.build);
    const loadPct = Math.min(100, (s.weight / s.maxTakeoff) * 100);
    const speedPct = Math.min(100, (s.speed / 160) * 100);
    const rangeMax = 4800;
    const rangePct = Math.min(100, (s.range / rangeMax) * 100);
    const tick = (mi, label, cls) =>
      `<span class="tick ${cls || ""}" style="left:${(mi / rangeMax) * 100}%"><span>${label}</span></span>`;
    const stopMi = (id) => MAP.stops.find((x) => x.id === id).mi;

    let verdict;
    const limit = s.limitedBy === "wing"
      ? `your ${O.PARTS.wing[state.build.wing].short.toLowerCase()} wing can only lift ${F.miles(s.maxTakeoff)} lb`
      : `your ${O.PARTS.engine[state.build.engine].short} engine can only pull ${F.miles(s.maxTakeoff)} lb into the air`;
    if (!s.canTakeOff) {
      verdict = `<p class="verdict bad"><b>Too heavy to take off.</b> The plane weighs ${F.miles(s.weight)} lb, but ${limit}.</p>`;
    } else if (s.range >= O.ROUTE_MILES) {
      const spare = s.range - O.ROUTE_MILES;
      verdict = s.solo
        ? `<p class="verdict good"><b>Enough fuel for Paris,</b> with about ${F.miles(spare)} miles to spare. Every time you doze off, you burn some of that spare fuel.</p>`
        : `<p class="verdict good"><b>Enough fuel for Paris,</b> with about ${F.miles(spare)} miles to spare. Your navigator keeps you on course.</p>`;
    } else {
      const where = F.place(s.range).where;
      verdict = `<p class="verdict bad"><b>Runs out of fuel around mile ${F.miles(s.range)},</b> ${where}. Paris is 3,600 miles away.</p>`;
    }

    $("gauges").innerHTML =
      `<div class="gauge"><span class="gauge-label">Takeoff load</span>` +
      `<span class="bar${s.canTakeOff ? "" : " over"}"><i style="width:${loadPct}%"></i></span>` +
      `<span class="gauge-val">${F.miles(s.weight)} / ${F.miles(s.maxTakeoff)} lb</span></div>` +
      `<div class="gauge"><span class="gauge-label">Cruise speed</span>` +
      `<span class="bar"><i style="width:${speedPct}%"></i></span><span class="gauge-val">${Math.round(s.speed)} mph</span></div>` +
      `<div class="gauge gauge-range"><span class="gauge-label">Fuel range</span>` +
      `<span class="bar"><i style="width:${rangePct}%"></i>${tick(stopMi("newfoundland"), "Newfoundland")}${tick(stopMi("ireland"), "Ireland", "end")}${tick(O.ROUTE_MILES, "Paris", "goal start")}</span>` +
      `<span class="gauge-val">${F.miles(s.range)} mi</span></div>` +
      verdict;

    const note = $("flyNote");
    if (!s.canTakeOff) note.textContent = "You can still try. René Fonck did in 1926, and his overloaded plane crashed at the end of this runway.";
    else if (s.solo) note.textContent = "Flying solo: stay awake (click WAKE UP or press Space), and steer through 3 storms with the ← → arrow keys.";
    else note.textContent = "Two crew take turns, so nobody falls asleep. You'll still steer through 3 storms with the ← → arrow keys.";
  }

  // ---------------------------------------------------------------- mini board
  let miniTimer = null;
  function updateMiniTitle() {
    $("miniTitle").textContent = state.className ? "Class board · " + state.className : "Class board";
  }
  function startMiniBoard() {
    stopMiniBoard();
    $("miniBoard").hidden = !state.code;
    if (!state.code) return;
    updateMiniTitle();
    refreshMiniBoard();
    miniTimer = setInterval(() => { if (!document.hidden) refreshMiniBoard(); }, 15000);
  }
  function stopMiniBoard() { if (miniTimer) clearInterval(miniTimer); miniTimer = null; }
  async function refreshMiniBoard() {
    if (!state.code) return;
    const res = await API.board(state.code);
    if (!res.ok) {
      if (!$("miniList").children.length) $("miniList").innerHTML = `<li class="gap">Can't reach the class board right now.</li>`;
      return;
    }
    state.className = res.name; updateMiniTitle();
    const me = state.pilot.toLowerCase();
    const rows = res.pilots || [];
    $("miniCount").textContent = rows.length === 1 ? "1 pilot" : rows.length + " pilots";
    if (!rows.length) { $("miniList").innerHTML = `<li><p class="mini-empty">No flights yet. Be the first to try for Paris.</p></li>`; return; }
    const myIdx = rows.findIndex((r) => r.pilot.toLowerCase() === me);
    const showIdx = new Set([0, 1, 2, 3, 4]);
    if (myIdx >= 0) showIdx.add(myIdx);
    let html = "", prev = -1;
    [...showIdx].sort((a, b) => a - b).forEach((i) => {
      const r = rows[i]; if (!r) return;
      if (prev >= 0 && i > prev + 1) html += `<li class="gap">⋯</li>`;
      html += `<li class="${i === myIdx ? "me" : ""}"><span class="rank">${i + 1}</span><span class="who">${F.esc(r.pilot)}</span>` +
        `<span class="res${r.status === "paris" ? " paris" : ""}">${F.esc(F.result(r))}</span></li>`;
      prev = i;
    });
    $("miniList").innerHTML = html;
  }

  // ---------------------------------------------------------------- map
  let mapEls = null;
  function drawMap() {
    const svg = $("map");
    const pts = MAP.route.map((r) => r[1] + "," + r[2]).join(" ");
    const labelled = {
      ny: { dx: 10, dy: 22, anchor: "start" },
      newfoundland: { dx: 0, dy: -14, anchor: "middle" },
      ireland: { dx: -12, dy: 20, anchor: "end" },
      paris: { dx: -8, dy: 24, anchor: "end" },
    };
    let html = `<rect class="sea" width="${MAP.w}" height="${MAP.h}"/>`;
    html += `<path class="grat" d="${MAP.graticule}"/>`;
    html += `<path class="land" d="${MAP.land}"/>`;
    for (const l of MAP.labels) {
      html += `<text class="area${l.kind === "sea" ? " sea-label" : ""}" x="${l.x}" y="${l.y}" text-anchor="middle">${l.text}</text>`;
    }
    html += `<polyline class="route" points="${pts}"/>`;
    html += `<polyline class="trail" id="trail" points=""/>`;
    MAP.stops.forEach((s, i) => {
      html += `<circle class="stop" id="stop-${s.id}" cx="${s.x}" cy="${s.y}" r="${i === 0 || i === MAP.stops.length - 1 ? 5 : 3.5}"/>`;
      const L = labelled[s.id];
      if (L) {
        html += `<text class="stop-name" x="${s.x + L.dx}" y="${s.y + L.dy}" text-anchor="${L.anchor}">${s.name}</text>`;
        html += `<text class="stop-sub" x="${s.x + L.dx}" y="${s.y + L.dy + 14}" text-anchor="${L.anchor}">${s.sub}</text>`;
      }
    });
    html += `<g id="planeMarker"><path class="plane-shadow" transform="translate(4,6)" d="${PLANE_ICON}"/><path class="plane" d="${PLANE_ICON}"/></g>`;
    svg.innerHTML = html;
    mapEls = { trail: $("trail"), plane: $("planeMarker") };
  }
  const PLANE_ICON = "M14,0 L6,-1.6 L2,-1.6 L0,-12 L-3,-12 L-3,-1.6 L-10,-1.4 L-12,-5 L-14,-5 L-13,0 L-14,5 L-12,5 L-10,1.4 L-3,1.6 L-3,12 L0,12 L2,1.6 L6,1.6 Z";

  // Position along the route for a given mile.
  function routeAt(mi) {
    const R = MAP.route;
    if (mi <= 0) return { x: R[0][1], y: R[0][2], a: Math.atan2(R[1][2] - R[0][2], R[1][1] - R[0][1]), idx: 0 };
    for (let i = 1; i < R.length; i++) {
      if (R[i][0] >= mi) {
        const a = R[i - 1], b = R[i];
        const f = (mi - a[0]) / (b[0] - a[0] || 1);
        return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, a: Math.atan2(b[2] - a[2], b[1] - a[1]), idx: i };
      }
    }
    const n = R.length - 1;
    return { x: R[n][1], y: R[n][2], a: Math.atan2(R[n][2] - R[n - 1][2], R[n][1] - R[n - 1][1]), idx: n + 1 };
  }

  function placePlane(mi, wobble, lateral) {
    const pos = routeAt(mi);
    let x = pos.x, y = pos.y, ang = pos.a;
    if (lateral) {
      // blown sideways in a storm
      x += -Math.sin(pos.a) * lateral * 16;
      y += Math.cos(pos.a) * lateral * 16;
      ang += lateral * 0.5;
    }
    if (wobble) {
      // wander off course, perpendicular to the route
      const off = Math.sin(wobble * 2.2) * 14;
      x += -Math.sin(pos.a) * off;
      y += Math.cos(pos.a) * off;
      ang += Math.cos(wobble * 2.2) * 0.6;
    }
    mapEls.plane.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(ang * 180 / Math.PI).toFixed(1)}) scale(1.25)`);
    // trail
    const R = MAP.route;
    let pts = "";
    for (let i = 0; i < R.length && R[i][0] <= mi; i++) pts += R[i][1] + "," + R[i][2] + " ";
    pts += pos.x.toFixed(1) + "," + pos.y.toFixed(1);
    mapEls.trail.setAttribute("points", pts);
  }

  // ---------------------------------------------------------------- flight
  const STOP_LOG = {
    capecod: "Over Cape Cod. Heading out across the Gulf of Maine.",
    novascotia: "Crossing Nova Scotia.",
    newfoundland: "St. John's, Newfoundland. The last land for about 1,900 miles.",
    ireland: "Land! Dingle Bay, Ireland.",
    england: "Over Plymouth, England.",
    cherbourg: "Crossing the French coast at Cherbourg.",
    paris: "Le Bourget field, Paris. A crowd of about 100,000 people runs toward the plane.",
  };
  const MID_LOG = [
    { mi: 1700, text: "Fog and sleet over the ocean. Ice forms on the wings, so you climb above the storm." },
    { mi: 2450, text: "Halfway across the open Atlantic. Nothing but water in every direction." },
  ];

  let F_ = null; // the flight in progress
  let raf = 0;

  function log(text, kind) {
    const li = document.createElement("li");
    if (kind) li.className = kind;
    const t = F_ ? F_.t : 0;
    li.innerHTML = `<span class="t">${t ? "Hr " + t.toFixed(1) : "Hr 0"}</span><span>${F.esc(text)}</span>`;
    const list = $("flightLog");
    list.prepend(li);
    while (list.children.length > 5) list.lastChild.remove();
  }

  function banner(text, kind) {
    const b = $("mapBanner");
    b.textContent = text;
    b.className = "map-banner" + (kind ? " " + kind : "");
    b.hidden = !text;
  }

  function startFlight() {
    cancelAnimationFrame(raf);
    const build = Object.assign({}, state.build);
    const s = O.stats(build);
    F_ = {
      build, s, t: 0, p: 0, i: 0, outcomes: [], phase: "takeoff", last: 0,
      events: O.eventsFor(build),
      nextStop: 1, midIdx: 0, wanderStart: 0, wanderEnd: 0, drowsy: null, storm: null, done: false,
    };
    if (!mapEls) drawMap();
    $("flightLog").innerHTML = "";
    banner("");
    hideDrowsy();
    hideStorm();
    MAP.stops.forEach((st, i) => $("stop-" + st.id).classList.toggle("passed", i === 0));
    placePlane(0);
    updateHud();
    $("flightHint").textContent = s.solo
      ? "Solo: when WAKE UP appears, click it or press Space fast (not early). In storms, hold ← → to keep your heading in the green."
      : "Your navigator keeps you awake. In storms, hold ← → to keep your heading in the green.";
    show("flight");

    if (!s.canTakeOff) {
      log("Engine at full throttle. The plane rolls down the runway, heavy and slow…");
      F_.phase = "crash";
      const t0 = performance.now();
      const shake = (ts) => {
        const k = (ts - t0) / 1000;
        if (k < 2.2) {
          const pos = routeAt(Math.min(18, k * 8));
          mapEls.plane.setAttribute("transform", `translate(${(pos.x + Math.sin(k * 40) * 1.5).toFixed(1)},${pos.y.toFixed(1)}) rotate(${(pos.a * 180 / Math.PI).toFixed(1)}) scale(1.25)`);
          raf = requestAnimationFrame(shake);
        } else {
          banner("Too heavy! The plane never leaves the ground.", "bad");
          log("Crashed at the end of the runway. Everyone climbs out alive.", "bad");
          setTimeout(() => finish(), 1800);
        }
      };
      raf = requestAnimationFrame(shake);
      return;
    }

    const heavy = s.weight / s.maxTakeoff > 0.95;
    log(heavy
      ? "Wheels up from Roosevelt Field. The overloaded plane barely clears the telephone wires."
      : "Wheels up from Roosevelt Field, Long Island.");
    setTimeout(() => {
      if (!F_ || F_.done) return;
      F_.phase = "cruise";
      F_.last = performance.now();
      raf = requestAnimationFrame(tick);
    }, 700);
  }

  function updateHud() {
    const f = F_;
    const s = f.s;
    $("hudHour").textContent = f.t.toFixed(1);
    $("hudLeft").textContent = F.miles(Math.max(0, O.ROUTE_MILES - f.p)) + " mi";
    const gal = O.PARTS.tank[f.build.tank].gallons;
    const left = s.canTakeOff ? Math.max(0, gal * (1 - f.t / s.endurance)) : gal;
    $("hudFuel").textContent = Math.round(left) + " gal";
    $("fuelFill").style.width = (left / gal) * 100 + "%";
    $("fuelFill").parentElement.classList.toggle("low", left / gal < 0.15);
    $("hudSpeed").textContent = (s.canTakeOff ? Math.round(s.speed) : 0) + " mph";
  }

  function checkLandmarks() {
    const f = F_;
    while (f.nextStop < MAP.stops.length && f.p >= MAP.stops[f.nextStop].mi - 0.01) {
      const st = MAP.stops[f.nextStop];
      $("stop-" + st.id).classList.add("passed");
      if (st.id !== "paris") log(STOP_LOG[st.id] || st.name);
      f.nextStop++;
    }
    while (f.midIdx < MID_LOG.length && f.p >= MID_LOG[f.midIdx].mi) {
      log(MID_LOG[f.midIdx].text);
      f.midIdx++;
    }
  }

  function tick(ts) {
    const f = F_;
    if (!f || f.done) return;
    const dtReal = Math.min(0.5, Math.max(0, (ts - f.last) / 1000));
    f.last = ts;
    const dt = dtReal / SEC_PER_HOUR;
    const v = f.s.speed, E = f.s.endurance;

    if (f.phase === "cruise") {
      const nextE = f.i < f.events.length ? f.events[f.i].t : Infinity;
      const T = f.t + (O.ROUTE_MILES - f.p) / v;
      // Same order of checks as Orteig.simulate and the server.
      const arrivingFirst = T <= nextE;
      const boundary = arrivingFirst ? Math.min(T, E) : Math.min(nextE, E);
      const target = f.t + dt;
      if (target >= boundary) {
        f.p = Math.min(O.ROUTE_MILES, f.p + v * (boundary - f.t));
        f.t = boundary;
        checkLandmarks();
        placePlane(f.p);
        updateHud();
        if (arrivingFirst) return T <= E ? finish("paris") : finish("fuel");
        if (nextE >= E) return finish("fuel");
        const ev = f.events[f.i];
        return ev.kind === "storm" ? beginStorm(ev) : beginDrowsy(ev);
      }
      f.p += v * dt;
      f.t = target;
      checkLandmarks();
      placePlane(f.p);
      updateHud();
    } else if (f.phase === "wander") {
      f.t = Math.min(f.t + dt, f.wanderEnd, E);
      placePlane(f.p, f.t - f.wanderStart);
      updateHud();
      if (f.wanderEnd >= E && f.t >= E) return finish("fuel");
      if (f.t >= f.wanderEnd) {
        f.t = f.wanderEnd;
        f.phase = "cruise";
        placePlane(f.p);
      }
    }
    raf = requestAnimationFrame(tick);
  }

  // ---- stay-awake moments
  function beginDrowsy(ev) {
    const f = F_;
    f.phase = "drowsy";
    const win = O.windowMs(ev.n);
    const d = { ev, win, shownAt: 0, resolved: false, timer: 0 };
    f.drowsy = d;
    const box = $("drowsy");
    box.hidden = false;
    // restart the eyelid animation
    const veil = box.querySelector(".drowsy-veil");
    veil.style.animation = "none"; void veil.offsetWidth; veil.style.animation = "";
    $("drowsyMsg").textContent = "Your eyes are getting heavy…";
    $("wakeBtn").hidden = true;
    const delay = 350 + Math.random() * 900;
    d.timer = setTimeout(() => showWake(d), delay);
  }

  function showWake(d) {
    if (d.resolved) return;
    const wrap = $("mapWrap").getBoundingClientRect();
    const btn = $("wakeBtn");
    const r = wrap.width < 560 ? 60 : 72;
    const x = r + Math.random() * Math.max(1, wrap.width - 2 * r);
    const y = r + 30 + Math.random() * Math.max(1, wrap.height - 2 * r - 30);
    btn.style.left = x + "px";
    btn.style.top = y + "px";
    const ring = $("wakeRing");
    ring.style.transition = "none";
    ring.style.strokeDashoffset = "0";
    btn.hidden = false;
    void ring.getBoundingClientRect();
    ring.style.transition = `stroke-dashoffset ${d.win}ms linear`;
    ring.style.strokeDashoffset = "289";
    $("drowsyMsg").textContent = "Wake up!";
    d.shownAt = performance.now();
    d.timer = setTimeout(() => resolveDrowsy(d, -1), d.win);
  }

  function onWakeInput(e) {
    const f = F_;
    if (!f || f.phase !== "drowsy" || !f.drowsy || f.drowsy.resolved) return;
    if (e.type === "keydown") {
      if (e.code !== "Space" && e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (e.repeat) return;
    }
    const d = f.drowsy;
    if (!d.shownAt) {
      // pressed before the button appeared: counts as the slowest possible wake-up
      clearTimeout(d.timer);
      resolveDrowsy(d, d.win, "early");
      return;
    }
    const ms = Math.round(performance.now() - d.shownAt);
    clearTimeout(d.timer);
    resolveDrowsy(d, ms > d.win ? -1 : ms);
  }

  function resolveDrowsy(d, outcome, why) {
    if (d.resolved) return;
    d.resolved = true;
    const f = F_;
    f.outcomes[f.i] = outcome;
    const res = O.driftFor(d.ev, outcome);
    if (res.missed) {
      log("You fell asleep! The plane wandered off course for an hour and a half.", "bad");
    } else if (why === "early") {
      log("You jerked awake too early and lost your bearings for a while.", "bad");
    } else {
      const mins = Math.round(res.hours * 60);
      log(`Woke up in ${(Math.max(O.MIN_REACTION_MS, outcome) / 1000).toFixed(2)} s. Drifted off course for ${mins} min.`, outcome < 450 ? "good" : "");
    }
    hideDrowsy();
    startWander(res.hours);
  }

  function startWander(hours) {
    const f = F_;
    f.i++;
    f.phase = "wander";
    f.wanderStart = f.t;
    f.wanderEnd = f.t + hours;
    f.last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // ---- storms: hold your heading
  const steer = { left: false, right: false, btnL: false, btnR: false };
  function steerInput() {
    return ((steer.right || steer.btnR) ? 1 : 0) - ((steer.left || steer.btnL) ? 1 : 0);
  }

  function buildHeadingTicks() {
    let html = "";
    for (let k = -10; k <= 10; k++) {
      const left = 50 + (k / 10) * NEEDLE_SPAN;
      html += `<i class="${k % 5 === 0 ? "major" : ""}" style="left:${left}%"></i>`;
    }
    $("headingTicks").innerHTML = html;
    const half = Storm.ZONE * NEEDLE_SPAN;
    $("headingZone").style.left = 50 - half + "%";
    $("headingZone").style.width = 2 * half + "%";
  }

  function beginStorm(ev) {
    const f = F_;
    f.phase = "storm";
    const info = O.STORMS[ev.n] || O.STORMS[0];
    const st = {
      ev,
      sim: Storm.create(Math.floor(Math.random() * 2147483647), f.build.wing),
      started: false, last: 0, resolved: false,
    };
    f.storm = st;
    log(info.title + ". Crosswinds!");
    $("stormTitle").textContent = info.title;
    $("stormSub").textContent = "Get ready to steer…";
    $("stormPct").textContent = "On course 100%";
    $("stormClock").style.transform = "scaleX(1)";
    drawNeedle(0, 0);
    $("storm").hidden = false;
    setTimeout(() => {
      if (st.resolved || F_ !== f) return;
      st.started = true;
      st.last = performance.now();
      $("stormSub").textContent = "Crosswinds are pushing you off course. Keep the plane in the green.";
      raf = requestAnimationFrame(stormTick);
    }, 1000);
  }

  function drawNeedle(x, v) {
    const n = $("headingNeedle");
    n.style.left = 50 + x * NEEDLE_SPAN + "%";
    n.style.transform = `rotate(${Math.max(-30, Math.min(30, v * 22)).toFixed(1)}deg)`;
    const on = Math.abs(x) <= Storm.ZONE;
    n.classList.toggle("off", !on);
    $("headingZone").classList.toggle("on", on);
  }

  function stormTick(ts) {
    const f = F_;
    const st = f && f.storm;
    if (!st || st.resolved || f.done) return;
    const dt = Math.min(0.25, Math.max(0, (ts - st.last) / 1000));
    st.last = ts;
    const over = Storm.step(st.sim, dt, steerInput());
    drawNeedle(st.sim.x, st.sim.v);
    placePlane(f.p, 0, st.sim.x);
    $("stormPct").textContent = "On course " + Math.round(Storm.score(st.sim) / 10) + "%";
    $("stormClock").style.transform = `scaleX(${Math.max(0, 1 - st.sim.t / Storm.DURATION).toFixed(3)})`;
    if (over) return endStorm(st);
    raf = requestAnimationFrame(stormTick);
  }

  function endStorm(st) {
    st.resolved = true;
    const f = F_;
    const sc = Storm.score(st.sim);
    f.outcomes[f.i] = sc;
    const res = O.driftFor(st.ev, sc);
    const mins = Math.round(res.hours * 60);
    $("stormSub").textContent = `Through the storm. You held your heading ${Math.round(sc / 10)}% of the time.`;
    log(mins === 0
      ? `Held your heading ${Math.round(sc / 10)}% of the storm and stayed right on course.`
      : `Held your heading ${Math.round(sc / 10)}% of the storm. Blown off course for ${mins} min.`, sc >= 850 ? "good" : sc < 500 ? "bad" : "");
    setTimeout(() => {
      if (F_ !== f || f.done) return;
      hideStorm();
      placePlane(f.p);
      startWander(res.hours);
    }, 900);
  }

  function hideStorm() {
    $("storm").hidden = true;
    steer.btnL = steer.btnR = false;
    $("steerL").classList.remove("down");
    $("steerR").classList.remove("down");
  }

  function bindSteering() {
    const keyDir = (e) => (e.key === "ArrowLeft" || e.code === "KeyA" ? "left" : e.key === "ArrowRight" || e.code === "KeyD" ? "right" : null);
    document.addEventListener("keydown", (e) => {
      const d = keyDir(e);
      if (!d || $("screen-flight").hidden) return;
      e.preventDefault();
      steer[d] = true;
    });
    document.addEventListener("keyup", (e) => {
      const d = keyDir(e);
      if (d) steer[d] = false;
    });
    window.addEventListener("blur", () => { steer.left = steer.right = steer.btnL = steer.btnR = false; });
    for (const [id, key] of [["steerL", "btnL"], ["steerR", "btnR"]]) {
      const b = $(id);
      const on = (e) => { e.preventDefault(); steer[key] = true; b.classList.add("down"); try { b.setPointerCapture(e.pointerId); } catch (_) { /* old browsers */ } };
      const off = () => { steer[key] = false; b.classList.remove("down"); };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off);
      b.addEventListener("pointercancel", off);
      b.addEventListener("lostpointercapture", off);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }

  function hideDrowsy() {
    $("drowsy").hidden = true;
    $("wakeBtn").hidden = true;
  }

  function finish(kind) {
    const f = F_;
    if (!f || f.done) return;
    f.done = true;
    cancelAnimationFrame(raf);
    hideDrowsy();
    hideStorm();
    const result = O.simulate(f.build, f.outcomes);
    state.lastFlight = { build: f.build, outcomes: f.outcomes.slice(), events: f.events, result, server: null };
    if (result.status === "paris") {
      $("stop-paris").classList.add("passed");
      placePlane(O.ROUTE_MILES);
      log(STOP_LOG.paris, "good");
      banner("Le Bourget, Paris!", "good");
    } else if (result.status === "fuel") {
      placePlane(result.distance);
      const place = F.place(result.distance);
      banner(place.water ? "Out of fuel. Ditching in the sea." : "Out of fuel. Forced landing.", "bad");
      log(`The engine sputters and stops ${place.where}.`, "bad");
    }
    setTimeout(() => { showResult(); submitFlight(); }, kind ? 1900 : 0);
  }

  // ---------------------------------------------------------------- result
  function showResult() {
    const lf = state.lastFlight;
    const r = lf.result;
    const s = O.stats(lf.build);
    const P = O.PARTS;
    const name = (state.pilot || "Pilot").toUpperCase();
    // what happened at each moment that actually came up in this flight
    const met = lf.events.slice(0, r.events).map((ev, i) => ({ ev, out: lf.outcomes[i] }));
    const drowsy = met.filter((m) => m.ev.kind === "drowsy");
    const wake = drowsy.filter((m) => !O.driftFor(m.ev, m.out).missed).map((m) => Math.max(O.MIN_REACTION_MS, m.out));
    const avgMs = wake.length ? wake.reduce((a, b) => a + b, 0) / wake.length : 0;
    const storms = met.filter((m) => m.ev.kind === "storm").map((m) => O.driftFor(m.ev, m.out).score);
    const stormAvg = storms.length ? storms.reduce((a, b) => a + b, 0) / storms.length / 10 : null;
    const title = $("resultTitle");
    let cable, lesson, headline, cls;
    const place = F.place(r.distance);
    const short = O.ROUTE_MILES - Math.floor(r.distance);

    if (r.status === "paris") {
      cls = "good";
      headline = "You made it to Paris!";
      const diff = r.hours - LINDBERGH_HOURS;
      const span = (h) => {
        const m = Math.round(h * 60);
        return m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : F.hours(h);
      };
      const vs = Math.round(Math.abs(diff) * 60) === 0 ? "The same time as Lindbergh" : diff < 0 ? `${span(-diff)} faster than Lindbergh` : `${span(diff)} slower than Lindbergh`;
      cable = `PILOT ${name} LANDED LE BOURGET PARIS AFTER ${F.hours(r.hours).replace(" h ", " HRS ").replace(" m", " MIN")} NONSTOP FROM NEW YORK STOP CROWD OF 100000 STOP`;
      const Vs = vs.charAt(0).toUpperCase() + vs.slice(1);
      lesson = s.solo
        ? `${Vs}, who took 33 h 30 m. You flew solo like he did. Every second it took you to wake up, and every moment off course in a storm, cost you time.`
        : `${Vs}, who took 33 h 30 m. Your navigator kept you awake, but carrying a second person meant slower wings. Every moment off course in a storm cost you time too.`;
    } else if (r.status === "crash") {
      cls = "bad";
      headline = "Crashed on takeoff";
      cable = `PILOT ${name} CRASHED ON TAKEOFF ROOSEVELT FIELD STOP PLANE TOO HEAVY STOP CREW UNHURT STOP`;
      lesson = s.limitedBy === "engine"
        ? `Your plane weighed ${F.miles(s.weight)} lb, but a ${P.engine[lf.build.engine].hp}-horsepower ${P.engine[lf.build.engine].short} can only pull about ${F.miles(s.maxTakeoff)} lb into the air. In 1926 René Fonck's overloaded plane crashed on this same runway, and two of his crew died.`
        : `Your plane weighed ${F.miles(s.weight)} lb, but your ${P.wing[lf.build.wing].short.toLowerCase()} wing can only lift about ${F.miles(s.maxTakeoff)} lb. In 1926 René Fonck's overloaded plane crashed on this same runway, and two of his crew died.`;
    } else {
      cls = "bad";
      headline = place.water ? "Ditched at sea" : "Forced landing";
      const rescue = place.water ? "PICKED UP BY A PASSING STEAMSHIP STOP" : "PLANE IN ONE PIECE STOP";
      cable = `PILOT ${name} OUT OF FUEL ${place.where.toUpperCase()} ${F.miles(short)} MILES SHORT OF PARIS STOP ${rescue}`;
      if (s.range < O.ROUTE_MILES) {
        lesson = `Your plane could only fly about ${F.miles(s.range)} miles on a full tank. A ${P.engine[lf.build.engine].short} burns ${P.engine[lf.build.engine].burn} gallons an hour, and Paris is 3,600 miles away. Try a bigger tank, a thriftier engine, or less drag.`;
      } else {
        lesson = s.solo
          ? `Your plane had enough fuel for Paris, but dozing off and getting blown off course in the storms burned fuel you needed. Lindbergh fought to stay awake for the whole flight.`
          : `Your plane had enough fuel for Paris, but getting blown off course in the storms burned fuel you needed. Hold your heading in the green to save fuel.`;
      }
      if (place.water && r.distance > 1180 && r.distance < 3002) lesson += " Twelve days before Lindbergh took off, Nungesser and Coli disappeared trying to cross the Atlantic. They were never found.";
    }

    title.textContent = headline;
    title.className = "result-title " + cls;
    $("resultEyebrow").textContent = "Flight report · " + P.wing[lf.build.wing].short + " · " + P.engine[lf.build.engine].short + " · " + P.tank[lf.build.tank].short + " · " + P.crew[lf.build.crew].short;
    $("cableBody").textContent = cable;
    $("cableDate").textContent = r.status === "paris" ? "PARIS" : "NEW YORK";
    $("cableFoot").textContent = r.status === "paris" ? "THE ORTEIG PRIZE · $25,000" : "THE ORTEIG PRIZE · STILL UNCLAIMED";
    const stats = [
      ["Distance", F.miles(r.status === "paris" ? 3600 : Math.floor(r.distance)) + " mi"],
      ["Time in the air", r.status === "crash" ? "0 h 00 m" : F.hours(r.hours)],
    ];
    if (r.status === "crash") {
      stats.push(["Takeoff weight", F.miles(s.weight) + " lb"]);
      stats.push(["Most it could lift", F.miles(s.maxTakeoff) + " lb"]);
    } else {
      stats.push(["On course in storms", stormAvg === null ? "no storms" : Math.round(stormAvg) + "%"]);
      stats.push(s.solo
        ? ["Wake-ups", drowsy.length ? `${wake.length} of ${drowsy.length}${wake.length ? " · " + (avgMs / 1000).toFixed(2) + " s" : ""}` : "none needed"]
        : ["Cruise speed", Math.round(s.speed) + " mph"]);
    }
    $("resultStats").innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${F.esc(v)}</dd></div>`).join("");
    $("resultLesson").textContent = lesson;
    show("result");
  }

  async function submitFlight(retry) {
    const box = $("standing");
    const lf = state.lastFlight;
    if (!state.code) {
      box.hidden = false;
      box.className = "standing";
      box.innerHTML = "Practice flight, so it isn't on a class board. Join a class with its code to save your flights.";
      return;
    }
    box.hidden = false;
    box.className = "standing";
    box.textContent = "Sending your flight to the class board…";
    const outcomes = lf.outcomes.map((x) => (typeof x === "number" && isFinite(x) ? Math.round(x) : -1)).slice(0, 20);
    let res = await API.submit(state.code, state.pilot, lf.build, outcomes);
    if (!res.ok && res.error === "too_fast") {
      await new Promise((r) => setTimeout(r, 2200));
      res = await API.submit(state.code, state.pilot, lf.build, outcomes);
    }
    if (state.lastFlight !== lf) return; // a newer flight started
    if (res.ok) {
      lf.server = res;
      const best = res.best;
      box.innerHTML =
        `You're <strong>#${res.rank} of ${res.pilots}</strong> on ${F.esc(state.className || "the class board")}. ` +
        `Your best flight: <strong>${F.esc(F.result(best))}</strong>.`;
      return;
    }
    box.className = "standing err";
    const msg = {
      class_not_found: "This class board doesn't exist anymore, so the flight wasn't saved.",
      bad_pilot: "Your pilot name has characters the board can't use, so the flight wasn't saved. Change your name and fly again.",
      class_full: "The class board is full, so the flight wasn't saved.",
    }[res.error] || "Couldn't reach the class board, so this flight wasn't saved.";
    box.innerHTML = F.esc(msg) + (res.error === "network" || res.error === "server" || res.error === "too_fast" ? ` <button class="btn btn-small" type="button" id="retrySubmit">Try again</button>` : "");
    const rb = $("retrySubmit");
    if (rb) rb.addEventListener("click", () => submitFlight(true));
  }

  // ---------------------------------------------------------------- wire up
  function init() {
    buildPartsForm();
    buildHeadingTicks();
    bindSteering();
    initJoin();
    $("flyBtn").addEventListener("click", startFlight);
    $("hangarBtn").addEventListener("click", () => { renderHangar(); show("hangar"); });
    $("reflyBtn").addEventListener("click", startFlight);
    $("wakeBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); onWakeInput(e); });
    document.addEventListener("keydown", (e) => {
      if (!$("screen-flight").hidden && (e.code === "Space" || e.key === " ")) e.preventDefault();
      onWakeInput(e);
    });
    if (!$("screen-join").hidden) $("classCode").value ? $("pilotName").focus() : $("classCode").focus();
  }
  init();
})();
