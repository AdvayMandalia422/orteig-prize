/*
 * Storm steering mini-game: crosswinds push the plane's heading off course,
 * and the player steers with ← → to keep it inside the green zone.
 * Runs in real seconds (not game hours). Returns a score in permille
 * (0–1000) of time spent on course, which is all the server ever sees.
 */
(function (root) {
  const DURATION = 5; // seconds of steering per storm
  const ZONE = 0.33; // half-width of the green zone (needle range is -1..1)
  const STEER = 1.3; // how fast holding an arrow key turns the plane (range/second)
  const RESPONSE = 9; // how quickly the plane answers the controls and the wind
  const WIND = 1.0; // wind strength
  const SUB = 1 / 120; // physics substep, so slow computers play the same
  const WING_GUST = { bi: 0.85, mono: 1.0, racer: 1.3 }; // biplanes are steadier

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(seed, wing) {
    const r = rng(seed);
    const side = r() < 0.5 ? -1 : 1;
    return {
      t: 0, x: 0, v: 0, inZone: 0, total: 0,
      amp: WING_GUST[wing] || 1,
      ph: [r() * 6.283, r() * 6.283, r() * 6.283],
      // a steady crosswind that flips once, plus one sharp gust
      cross: side * (0.32 + r() * 0.14),
      flipAt: 1.8 + r() * 1.4,
      gustAt: 0.8 + r() * 3.2,
      gustDir: r() < 0.5 ? -1 : 1,
    };
  }

  function wind(s) {
    const t = s.t;
    let w = (t < s.flipAt ? s.cross : -s.cross) +
      0.3 * Math.sin(1.3 * t + s.ph[0]) +
      0.2 * Math.sin(2.7 * t + s.ph[1]) +
      0.12 * Math.sin(4.1 * t + s.ph[2]);
    if (t >= s.gustAt && t < s.gustAt + 0.45) w += s.gustDir * 0.9;
    return w * s.amp * WIND;
  }

  // Advance by dt seconds with steering input in [-1, 1]. Returns true when the storm is over.
  function step(s, dt, input) {
    let rem = Math.max(0, dt);
    while (rem > 1e-9 && s.t < DURATION) {
      const h = Math.min(SUB, rem, DURATION - s.t);
      // the heading drifts with the wind; holding a key turns against it
      s.v += RESPONSE * (wind(s) + input * STEER - s.v) * h;
      s.x += s.v * h;
      if (s.x > 1) { s.x = 1; if (s.v > 0) s.v = 0; }
      if (s.x < -1) { s.x = -1; if (s.v < 0) s.v = 0; }
      if (Math.abs(s.x) <= ZONE) s.inZone += h;
      s.total += h;
      s.t += h;
      rem -= h;
    }
    return s.t >= DURATION - 1e-9;
  }

  function score(s) {
    return s.total > 0 ? Math.round((1000 * s.inZone) / s.total) : 0;
  }

  const api = { DURATION, ZONE, create, step, score, wind };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OrteigStorm = api;
})(typeof window !== "undefined" ? window : globalThis);
