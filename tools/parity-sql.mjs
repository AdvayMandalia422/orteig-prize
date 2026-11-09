// Prints a SQL query that returns any build where the server's flight
// model disagrees with assets/physics.js. Empty result = they match.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const O = require("../assets/physics.js");
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const sets = [[], Array(17).fill(250), Array(17).fill(800), [500, -1, 950, -1, 400, 2000, 300, 640]];
for (let k = 0; k < 2; k++) sets.push(Array.from({ length: 17 }, (_, i) => rand() < 0.15 ? -1 : Math.round(200 + rand() * (O.windowMs(i) + 300))));
const rows = [];
for (const wing of Object.keys(O.PARTS.wing)) for (const engine of Object.keys(O.PARTS.engine))
  for (const tank of Object.keys(O.PARTS.tank)) for (const crew of Object.keys(O.PARTS.crew))
    for (const k of (O.stats({ wing, engine, tank, crew }).canTakeOff ? sets.map((_, i) => i) : [0])) {
      const r = O.simulate({ wing, engine, tank, crew }, sets[k]);
      rows.push(`('${wing}','${engine}','${tank}','${crew}',${k},'${r.status}',${r.distance},${r.hours},${r.events},${r.misses})`);
    }
console.log(`select count(*) as cases, count(*) filter (where s.status <> x.st or abs(s.distance - x.di) > 1e-9 or abs(s.hours - x.hr) > 1e-9 or s.events <> x.ev or s.misses <> x.mi) as mismatches
from (values ${rows.join(",")}) as x(w,e,t,c,k,st,di,hr,ev,mi)
join (values ${sets.map((oc, i) => `(${i},array[${oc.join(",")}]::int[])`).join(",")}) as sets(k, oc) using (k)
cross join lateral orteig.simulate(x.w,x.e,x.t,x.c,sets.oc) s;`);
