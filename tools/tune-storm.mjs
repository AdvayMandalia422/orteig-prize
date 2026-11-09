// Plays the storm mini-game with simulated players to tune difficulty.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const S = require("../assets/storm.js");

function play(seed, wing, bot) {
  const s = S.create(seed, wing);
  const hist = [];
  let input = 0, t = 0;
  const dt = 1 / 60;
  while (!S.step(s, dt, input)) {
    t += dt;
    hist.push({ t, x: s.x, v: s.v });
    const seen = hist.find((h) => h.t >= t - bot.delay) || hist[0];
    input = bot.decide(seen, input);
  }
  return S.score(s);
}
const bots = {
  none: { delay: 0, decide: () => 0 },
  good: { delay: 0.22, decide: (h) => { const p = h.x + 0.3 * h.v; return p > 0.08 ? -1 : p < -0.08 ? 1 : 0; } },
  // watches the needle, presses when it's heading for the edge, lets go near the middle
  casual: { delay: 0.35, decide: (h, cur) => { const p = h.x + 0.2 * h.v; if (p > 0.15) return -1; if (p < -0.15) return 1; if (Math.abs(p) < 0.05) return 0; return cur; } },
  // only reacts once it's already out of the green, and lets go late
  sloppy: { delay: 0.5, decide: (h, cur) => { if (h.x > 0.3) return -1; if (h.x < -0.3) return 1; if (Math.abs(h.x) < 0.1) return 0; return cur; } },
};
for (const wing of ["mono", "bi", "racer"]) {
  const row = [wing];
  for (const [name, bot] of Object.entries(bots)) {
    const scores = [];
    for (let seed = 1; seed <= 400; seed++) scores.push(play(seed * 7919, wing, bot));
    scores.sort((a, b) => a - b);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    row.push(`${name}: avg ${(avg / 10).toFixed(0)}% (p10 ${(scores[40] / 10).toFixed(0)} p90 ${(scores[360] / 10).toFixed(0)})`);
  }
  console.log(row.join("  |  "));
}
