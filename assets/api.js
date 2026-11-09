/* Class leaderboard API (Supabase). The publishable key is meant to be
   public: browsers can only call the five orteig_* functions, never read
   or write tables directly. */
(function (root) {
  const URL_BASE = "https://rkefpbqtxjxcohlwrxna.supabase.co/rest/v1/rpc/";
  const KEY = "sb_publishable_ZLbttlLu0nOEvJ4Ol2JASw__J42q8U0";

  async function rpc(fn, args, timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || 9000);
    try {
      const res = await fetch(URL_BASE + fn, {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify(args || {}),
        signal: ctl.signal,
      });
      if (!res.ok) return { ok: false, error: "server", status: res.status };
      return await res.json();
    } catch (err) {
      return { ok: false, error: "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  root.OrteigAPI = {
    classInfo: (code) => rpc("orteig_class", { p_code: code }),
    createClass: (name) => rpc("orteig_create_class", { p_name: name }),
    board: (code) => rpc("orteig_board", { p_code: code }),
    submit: (code, pilot, build, outcomes) =>
      rpc("orteig_submit", {
        p_code: code, p_pilot: pilot,
        p_wing: build.wing, p_engine: build.engine, p_tank: build.tank, p_crew: build.crew,
        p_outcomes: outcomes,
      }),
    removePilot: (code, key, pilot) => rpc("orteig_remove_pilot", { p_code: code, p_key: key, p_pilot: pilot }),
  };

  // Shared formatting helpers
  const Fmt = {
    hours(h) {
      let hh = Math.floor(h);
      let mm = Math.round((h - hh) * 60);
      if (mm === 60) { hh += 1; mm = 0; }
      return `${hh} h ${String(mm).padStart(2, "0")} m`;
    },
    miles: (n) => Math.round(n).toLocaleString("en-US"),
    // Where along the route a plane came down.
    place(distance) {
      const d = distance;
      if (d <= 0) return { where: "on the runway at Roosevelt Field", water: false, short: "Runway" };
      if (d < 202) return { where: "near the New England coast", water: false, short: "New England" };
      if (d < 529) return { where: "in the Gulf of Maine", water: true, short: "Gulf of Maine" };
      if (d < 600) return { where: "in Nova Scotia", water: false, short: "Nova Scotia" };
      if (d < 1129) return { where: "off the coast of Newfoundland", water: true, short: "Off Newfoundland" };
      if (d < 1180) return { where: "in Newfoundland", water: false, short: "Newfoundland" };
      if (d < 3002) return { where: "in the North Atlantic", water: true, short: "North Atlantic" };
      if (d < 3200) return { where: "in Ireland", water: false, short: "Ireland" };
      if (d < 3291) return { where: "in the Celtic Sea", water: true, short: "Celtic Sea" };
      if (d < 3330) return { where: "in England", water: false, short: "England" };
      if (d < 3413) return { where: "in the English Channel", water: true, short: "English Channel" };
      if (d < 3600) return { where: "in a French farm field", water: false, short: "France" };
      return { where: "at Le Bourget, Paris", water: false, short: "Paris" };
    },
    result(row) {
      if (row.status === "paris") return "Paris · " + Fmt.hours(Number(row.hours));
      if (row.status === "crash") return "Crashed on takeoff";
      return Fmt.miles(row.distance) + " mi · " + Fmt.place(row.distance).short;
    },
    esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    },
  };
  root.OrteigFmt = Fmt;
})(window);
