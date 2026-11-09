// Outcomes for the builds that can reach Paris, with different kinds of players.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const O = require("../assets/physics.js");
const players = {
  sharp: { wake: 320, storm: 950, miss: [] },
  average: { wake: 550, storm: 770, miss: [] },
  "avg + 1 nap": { wake: 550, storm: 770, miss: [3] },
  shaky: { wake: 750, storm: 500, miss: [] },
  "ignores storms": { wake: 500, storm: 370, miss: [] },
};
const builds = {
  "Lindbergh (mono/whirl/450/solo)": { wing: "mono", engine: "whirlwind", tank: "large", crew: "solo" },
  "Biplane two-crew (bi/whirl/450/duo)": { wing: "bi", engine: "whirlwind", tank: "large", crew: "duo" },
  "Biplane solo (bi/whirl/450/solo)": { wing: "bi", engine: "whirlwind", tank: "large", crew: "solo" },
};
for (const [bn, b] of Object.entries(builds)) {
  const out = [bn.padEnd(38)];
  for (const [pn, p] of Object.entries(players)) {
    const evs = O.eventsFor(b);
    let d = 0;
    const oc = evs.map((e) => (e.kind === "storm" ? p.storm : (d++, p.miss.includes(d - 1) ? -1 : p.wake)));
    const r = O.simulate(b, oc);
    out.push(`${pn}: ${r.status === "paris" ? r.hours.toFixed(1) + "h" : Math.floor(r.distance) + "mi"}`);
  }
  console.log(out.join("  "));
}
