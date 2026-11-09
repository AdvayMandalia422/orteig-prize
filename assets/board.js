/* The Orteig Prize — class board (for the projector) */
(function () {
  "use strict";
  const O = window.Orteig;
  const API = window.OrteigAPI;
  const F = window.OrteigFmt;
  const Art = window.OrteigArt;
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 3000;

  const store = {
    boards() { try { return JSON.parse(localStorage.getItem("orteig.boards") || "{}") || {}; } catch (e) { return {}; } },
    saveBoard(code, info) {
      try {
        const all = store.boards();
        all[code] = Object.assign({}, all[code] || {}, info);
        localStorage.setItem("orteig.boards", JSON.stringify(all));
      } catch (e) { /* storage blocked */ }
    },
  };

  const params = new URLSearchParams(location.search);
  const code = (params.get("class") || "").trim().toUpperCase();

  // A teacher link carries the key in the hash: board.html?class=ABCDE#key=...
  if (code && location.hash.startsWith("#key=")) {
    store.saveBoard(code, { key: decodeURIComponent(location.hash.slice(5)) });
    history.replaceState(null, "", location.pathname + location.search);
  }

  function gameLink(c) {
    const u = new URL("./", location.href);
    u.search = "?class=" + c;
    u.hash = "";
    return u.href;
  }

  // ---------------------------------------------------------------- setup
  function showSetup() {
    $("setup").hidden = false;
    const all = store.boards();
    const codes = Object.keys(all).sort((a, b) => (all[b].created || 0) - (all[a].created || 0));
    if (codes.length) {
      $("savedBoards").hidden = false;
      $("savedList").innerHTML = codes.map((c) =>
        `<li><a href="board.html?class=${encodeURIComponent(c)}"><span>${F.esc(all[c].name || "Class board")}</span><span class="num">${F.esc(c)}</span></a></li>`
      ).join("");
    }
    $("createForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("className").value.replace(/\s+/g, " ").trim();
      const err = $("createError");
      err.textContent = "";
      if (!name) { err.textContent = "Give the board a name, like the class period."; $("className").focus(); return; }
      const btn = $("createBtn");
      btn.disabled = true; btn.textContent = "Making the board…";
      const res = await API.createClass(name);
      btn.disabled = false; btn.textContent = "Make a class board";
      if (!res.ok) {
        err.textContent = res.error === "busy"
          ? "Too many boards were made in the last hour. Try again in a few minutes."
          : "Couldn't reach the leaderboard server. Check your internet and try again.";
        return;
      }
      store.saveBoard(res.code, { name: res.name, key: res.key, created: Date.now() });
      location.href = "board.html?class=" + encodeURIComponent(res.code);
    });
    $("className").focus();
  }

  // ---------------------------------------------------------------- board
  let lastBest = new Map();
  let first = true;
  let failures = 0;
  let timer = 0;
  let latest = null;

  function teacherKey() {
    const b = store.boards()[code];
    return b && b.key ? b.key : null;
  }

  function setupBoard() {
    $("board").hidden = false;
    $("codeBig").textContent = code;
    const link = gameLink(code);
    $("joinLink").textContent = link.replace(/^https?:\/\//, "");
    drawQR(link);
    $("debriefArt").innerHTML = Art.planeSVG(O.LINDBERGH, { callouts: true, title: "RYAN NYP · 1927" });

    $("debriefBtn").addEventListener("click", openDebrief);
    $("closeDebrief").addEventListener("click", () => $("debrief").close());
    $("debrief").addEventListener("click", (e) => { if (e.target === $("debrief")) $("debrief").close(); });
    $("toolsBtn").addEventListener("click", () => {
      const open = $("tools").hidden;
      $("tools").hidden = !open;
      $("toolsBtn").setAttribute("aria-expanded", String(open));
    });
    const key = teacherKey();
    if (key) {
      $("toolsKeyNote").textContent = "This computer can remove pilots from this board, for example a name that shouldn't be there.";
      $("teacherLinkBox").hidden = false;
      const tl = new URL(location.href);
      tl.hash = "key=" + encodeURIComponent(key);
      $("teacherLink").value = tl.href;
      $("copyTeacher").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText($("teacherLink").value); $("copyTeacher").textContent = "Copied"; }
        catch (e) { $("teacherLink").select(); $("copyTeacher").textContent = "Press Ctrl+C"; }
        setTimeout(() => ($("copyTeacher").textContent = "Copy"), 2000);
      });
    } else {
      $("toolsKeyNote").textContent = "This computer can only view the board. To remove pilots, open the teacher link from the computer that made the board.";
    }
    $("lbBody").addEventListener("click", onRemove);

    poll();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  }

  function drawQR(text) {
    const box = $("qr");
    try {
      if (typeof window.qrcode !== "function") throw new Error("no qr lib");
      const qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      box.classList.add("none");
      box.parentElement.classList.add("noqr");
    }
  }

  async function poll() {
    clearTimeout(timer);
    const res = await API.board(code);
    if (res.ok) {
      failures = 0;
      latest = res;
      render(res);
      setLive(true);
    } else if (res.error === "class_not_found") {
      $("board").hidden = true;
      $("missing").hidden = false;
      $("live").hidden = true;
      return;
    } else {
      failures++;
      setLive(false);
    }
    timer = setTimeout(() => { if (!document.hidden) poll(); }, failures ? Math.min(15000, POLL_MS * (failures + 1)) : POLL_MS);
  }

  function setLive(ok) {
    $("live").hidden = false;
    $("live").classList.toggle("stale", !ok);
    $("liveText").textContent = ok ? "Live" : "Reconnecting…";
  }

  function render(d) {
    document.title = d.name + " · Orteig Prize Board";
    $("boardName").textContent = d.name;
    store.saveBoard(code, { name: d.name });
    const pilots = d.pilots || [];
    const paris = pilots.filter((p) => p.status === "paris").length;
    $("tPilots").textContent = pilots.length;
    $("tFlights").textContent = d.flights;
    $("tParis").textContent = paris;

    const prize = $("prize");
    if (d.first) {
      prize.classList.add("won");
      const at = new Date(d.first.at);
      const when = isNaN(at) ? "" : " at " + at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      $("prizeText").innerHTML = `<b>${F.esc(d.first.pilot)}</b> won it${F.esc(when)}, landing in ${F.esc(F.hours(Number(d.first.hours)))}.`;
    } else {
      prize.classList.remove("won");
      $("prizeText").textContent = "Nobody has made it yet.";
    }

    const canRemove = !!teacherKey();
    const nextBest = new Map();
    let rows = "";
    pilots.forEach((p, i) => {
      const k = p.pilot.toLowerCase();
      const sig = p.status + ":" + p.distance + ":" + p.hours;
      nextBest.set(k, sig);
      const fresh = !first && lastBest.get(k) !== sig;
      const cls = [i < 3 ? "top" + (i + 1) : "", fresh ? "fresh" : ""].join(" ").trim();
      const build = { wing: p.wing, engine: p.engine, tank: p.tank, crew: p.crew };
      let art = "";
      try { art = Art.planeSVG(build); } catch (e) { art = ""; }
      rows +=
        `<tr class="${cls}">` +
        `<td class="rank">${i + 1}</td>` +
        `<td class="pilot">${F.esc(p.pilot)}</td>` +
        `<td class="plane" title="${F.esc(safeDescribe(build))}">${art}</td>` +
        `<td class="res ${F.esc(p.status)}">${F.esc(F.result(p))}</td>` +
        `<td class="n">${p.flights}</td>` +
        `<td>${canRemove ? `<button class="x" type="button" data-pilot="${F.esc(p.pilot)}" aria-label="Remove ${F.esc(p.pilot)}" title="Remove ${F.esc(p.pilot)}">×</button>` : ""}</td>` +
        `</tr>`;
    });
    $("lbBody").innerHTML = rows;
    $("lbEmpty").hidden = pilots.length > 0;
    lastBest = nextBest;
    first = false;

    const recent = d.recent || [];
    $("recent").innerHTML = recent.length
      ? recent.map((r) => `<li><span class="who">${F.esc(r.pilot)}</span><span class="what ${r.status === "paris" ? "paris" : ""}">${F.esc(F.result(r))}</span></li>`).join("")
      : `<li><span class="none">No flights yet.</span></li>`;

    if ($("debrief").open) renderBuilds(d);
  }

  function safeDescribe(build) {
    try { return Art.describe(build); } catch (e) { return ""; }
  }

  async function onRemove(e) {
    const btn = e.target.closest("button.x");
    if (!btn) return;
    const pilot = btn.getAttribute("data-pilot");
    if (!window.confirm(`Remove ${pilot} and all of their flights from this board?`)) return;
    btn.disabled = true;
    const res = await API.removePilot(code, teacherKey(), pilot);
    if (!res.ok) {
      btn.disabled = false;
      window.alert(res.error === "not_teacher"
        ? "This computer's teacher key doesn't match this board, so nothing was removed."
        : "Couldn't reach the server, so nothing was removed. Try again.");
      return;
    }
    poll();
  }

  // ---------------------------------------------------------------- debrief
  function openDebrief() {
    if (latest) renderBuilds(latest);
    $("debrief").showModal();
  }

  function renderBuilds(d) {
    const P = O.PARTS;
    const builds = d.builds || [];
    if (!builds.length) {
      $("builds").innerHTML = `<li><span class="none">No flights yet.</span></li>`;
      return;
    }
    $("builds").innerHTML = builds.slice(0, 6).map((b) => {
      const build = { wing: b.wing, engine: b.engine, tank: b.tank, crew: b.crew };
      const isL = O.SLOTS.every((s) => build[s] === O.LINDBERGH[s]);
      let art = "";
      try { art = Art.planeSVG(build); } catch (e) { art = ""; }
      const name = [P.wing[b.wing], P.engine[b.engine], P.tank[b.tank], P.crew[b.crew]].map((x) => (x ? x.short : "?")).join(" · ");
      return `<li>${art}<span class="bname">${F.esc(name)}${isL ? ` <span class="lind">LINDBERGH'S BUILD</span>` : ""}</span>` +
        `<span class="bstat">${b.flights} flight${b.flights === 1 ? "" : "s"}<br><b>${b.paris}</b> to Paris</span></li>`;
    }).join("");
  }

  // ---------------------------------------------------------------- start
  if (!code || params.get("new")) showSetup();
  else if (!/^[A-Z0-9]{5}$/.test(code)) $("missing").hidden = false;
  else setupBoard();
})();
