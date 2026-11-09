import { createRequire } from "module";
const require = createRequire(import.meta.url);
const O = require("../assets/physics.js");
const rows = [];
for (const wing of Object.keys(O.PARTS.wing))
  for (const engine of Object.keys(O.PARTS.engine))
    for (const tank of Object.keys(O.PARTS.tank))
      for (const crew of Object.keys(O.PARTS.crew)) {
        const b = { wing, engine, tank, crew };
        const s = O.stats(b);
        const fmt = (r) => r.status === "paris" ? `PARIS ${r.hours.toFixed(1)}h ev${r.events}` : r.status === "crash" ? "crash" : `${Math.round(r.distance)}mi`;
        const perfect = O.simulate(b, Array(20).fill(250));
        const avg = O.simulate(b, Array(20).fill(500));
        const slow = O.simulate(b, Array(20).fill(750));
        const oneMiss = O.simulate(b, [500, -1, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
        const twoMiss = O.simulate(b, [500, -1, 500, -1, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
        rows.push([`${wing}/${engine}/${tank}/${crew}`, `${s.weight}/${s.maxTakeoff}`, s.speed.toFixed(0), Math.round(s.range), fmt(perfect), fmt(avg), fmt(slow), fmt(oneMiss), fmt(twoMiss)]);
      }
console.log(["build", "wt/max", "mph", "range", "perfect", "avg0.5s", "slow0.75s", "1miss", "2miss"].join("\t"));
for (const r of rows) console.log(r.join("\t"));
