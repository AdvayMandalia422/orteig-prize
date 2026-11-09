// Prints a SQL query that returns any build where the server's flight
// model disagrees with assets/physics.js. Empty result = they match.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const O = require("../assets/physics.js");
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const sets = [[], Array(14).fill(250), Array(14).fill(500), Array(14).fill(799), [500, -1, 500, -1, 400, 2000, 300]];
for (let k = 0; k < 4; k++) sets.push(Array.from({ length: 14 }, (_, i) => rand() < 0.15 ? -1 : Math.round(200 + rand() * (O.windowMs(i) + 300))));
const rows = [];
for (const wing of Object.keys(O.PARTS.wing)) for (const engine of Object.keys(O.PARTS.engine))
  for (const tank of Object.keys(O.PARTS.tank)) for (const crew of Object.keys(O.PARTS.crew))
    for (const oc of (O.stats({ wing, engine, tank, crew }).canTakeOff && crew === "solo" ? sets : [[]])) {
      const r = O.simulate({ wing, engine, tank, crew }, oc);
      rows.push(`('${wing}','${engine}','${tank}','${crew}',array[${oc.join(",")}]::int[],'${r.status}',${r.distance},${r.hours},${r.events},${r.misses})`);
    }
console.log(`select count(*) as cases, count(*) filter (where s.status <> x.st or abs(s.distance - x.di) > 1e-9 or abs(s.hours - x.hr) > 1e-9 or s.events <> x.ev or s.misses <> x.mi) as mismatches
from (values ${rows.join(",\n")}) as x(w,e,t,c,oc,st,di,hr,ev,mi)
cross join lateral orteig.simulate(x.w,x.e,x.t,x.c,x.oc) s;`);
