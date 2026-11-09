/*
 * The Orteig Prize — flight model.
 *
 * Simplified on purpose. This exact model also runs on the server
 * (supabase/migration.sql, orteig.simulate), and the server's result is
 * what goes on the class board. If you change a number here, change it
 * there too, then run `node tools/test-physics.mjs`.
 */
(function (root) {
  const ROUTE_MILES = 3600;
  const AIRFRAME_LB = 1200; // fuselage, tail, landing gear, instruments
  const FUEL_LB_PER_GAL = 6;
  const PULL_LB_PER_HP = 30; // the most weight each horsepower can drag into the air

  const PARTS = {
    wing: {
      mono: {
        name: "Monoplane wing",
        short: "Monoplane",
        blurb: "One long wing. Less drag, so it goes farther on each gallon.",
        fact: "The Spirit of St. Louis used a single 46-foot wing built by Ryan Airlines in San Diego.",
        weight: 400, lift: 5200, drag: 1.0,
      },
      bi: {
        name: "Biplane wings",
        short: "Biplane",
        blurb: "Two stacked wings. Lifts the heaviest loads, but all those struts and wires add drag.",
        fact: "Most World War I fighters and mail planes were biplanes. Pilots trusted them, but they were slow.",
        weight: 550, lift: 6000, drag: 1.3,
      },
      racer: {
        name: "Racing wing",
        short: "Racing",
        blurb: "A short, slick wing. Very fast, but it can't lift much fuel.",
        fact: "Racers in 1920s air races like the Schneider Trophy used tiny wings to go over 200 mph.",
        weight: 250, lift: 3200, drag: 0.8,
      },
    },
    engine: {
      whirlwind: {
        name: "Wright Whirlwind J-5C",
        short: "Whirlwind",
        blurb: "223 horsepower, air-cooled. Reliable and easy on fuel.",
        fact: "Lindbergh's engine. It ran for 33½ hours straight without a single problem.",
        weight: 510, hp: 223, speed: 115, burn: 11.5,
      },
      liberty: {
        name: "Liberty L-12",
        short: "Liberty",
        blurb: "400 horsepower World War I engine. Powerful, heavy, and very thirsty.",
        fact: "Liberty engines powered the U.S. Air Mail's DH-4 planes in the early 1920s.",
        weight: 850, hp: 400, speed: 135, burn: 24,
      },
      ox5: {
        name: "Curtiss OX-5",
        short: "OX-5",
        blurb: "90 horsepower. Light and cheap, but weak.",
        fact: "The OX-5 powered the Curtiss Jenny. Lindbergh's first plane, bought in 1923 for $500, was a Jenny.",
        weight: 390, hp: 90, speed: 75, burn: 6,
      },
    },
    tank: {
      small: {
        name: "100-gallon tank",
        short: "100 gal",
        blurb: "Light. Enough for a long day of barnstorming, not an ocean.",
        fact: "Barnstormers flew short hops from farm to farm, selling airplane rides for a few dollars.",
        gallons: 100, weight: 30,
      },
      medium: {
        name: "250-gallon tank",
        short: "250 gal",
        blurb: "A big load for 1927. Gets you well out over the ocean.",
        fact: "Gasoline weighs about 6 pounds a gallon, so 250 gallons is 1,500 pounds of fuel.",
        gallons: 250, weight: 60,
      },
      large: {
        name: "450-gallon tank",
        short: "450 gal",
        blurb: "Huge and heavy. The tank sits right in front of the pilot.",
        fact: "The Spirit's main tank blocked the front window. Lindbergh used a periscope to see ahead.",
        gallons: 450, weight: 100,
      },
    },
    crew: {
      solo: {
        name: "Fly solo",
        short: "Solo",
        blurb: "Saves 170 pounds. But nobody can take over while you rest, so you have to stay awake the whole way.",
        fact: "Lindbergh flew alone and skipped the radio and parachute to save weight. He hadn't slept the night before.",
        weight: 170, pilots: 1,
      },
      duo: {
        name: "Pilot + navigator",
        short: "Two crew",
        blurb: "Take turns flying, so nobody dozes off. Costs 170 extra pounds.",
        fact: "Two weeks after Lindbergh, Clarence Chamberlin flew a passenger nonstop from New York to Germany.",
        weight: 340, pilots: 2,
      },
    },
  };

  const SLOTS = ["wing", "engine", "tank", "crew"];
  const LINDBERGH = { wing: "mono", engine: "whirlwind", tank: "large", crew: "solo" };

  // Moments in the flight, at fixed hours after takeoff so the server can
  // check a flight. Solo pilots get drowsy; every plane flies through storms.
  const DROWSY_HOURS = [5, 9, 13, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44, 47];
  const STORM_HOURS = [7, 15, 24.5];
  const STORMS = [
    { title: "Rain squall over Nova Scotia", short: "Nova Scotia squall" },
    { title: "Fog and sleet over the open ocean", short: "Mid-ocean fog" },
    { title: "Storm clouds ahead of Ireland", short: "Storm near Ireland" },
  ];
  const MISS_HOURS = 1.5; // asleep: wandered off course this long
  const DRIFT_HOURS_PER_SECOND = 0.8; // each second it takes you to wake up
  const MIN_REACTION_MS = 250;
  const STORM_MAX_HOURS = 1.5; // blown off course for the whole storm

  // Every moment this build could meet, in time order.
  function eventsFor(build) {
    const ev = [];
    if (PARTS.crew[build.crew].pilots === 1) DROWSY_HOURS.forEach((t, n) => ev.push({ t, kind: "drowsy", n }));
    STORM_HOURS.forEach((t, n) => ev.push({ t, kind: "storm", n }));
    ev.sort((a, b) => a.t - b.t);
    return ev;
  }

  function windowMs(i) {
    return Math.max(800, 1600 - 100 * i);
  }

  function stats(build) {
    const w = PARTS.wing[build.wing];
    const e = PARTS.engine[build.engine];
    const t = PARTS.tank[build.tank];
    const c = PARTS.crew[build.crew];
    if (!w || !e || !t || !c) throw new Error("Unknown part in build");
    const weight = AIRFRAME_LB + w.weight + e.weight + t.weight + t.gallons * FUEL_LB_PER_GAL + c.weight;
    const pull = e.hp * PULL_LB_PER_HP;
    const maxTakeoff = Math.min(w.lift, pull);
    const speed = e.speed / Math.sqrt(w.drag);
    const endurance = t.gallons / e.burn;
    return {
      weight,
      maxTakeoff,
      limitedBy: w.lift <= pull ? "wing" : "engine",
      canTakeOff: weight <= maxTakeoff,
      speed,
      endurance,
      range: speed * endurance,
      solo: c.pilots === 1,
    };
  }

  // Drift (hours) caused by one moment.
  //   drowsy: outcome = reaction time in ms; -1 or past the window = fell asleep
  //   storm:  outcome = permille of the storm spent on course (0–1000)
  function driftFor(ev, outcome) {
    if (ev.kind === "storm") {
      const sc = typeof outcome === "number" && isFinite(outcome) ? Math.min(1000, Math.max(0, Math.round(outcome))) : 0;
      return { hours: (1 - sc / 1000) * STORM_MAX_HOURS, missed: false, score: sc };
    }
    const win = windowMs(ev.n);
    if (typeof outcome !== "number" || !isFinite(outcome) || outcome < 0 || outcome > win) {
      return { hours: MISS_HOURS, missed: true };
    }
    const r = Math.max(MIN_REACTION_MS, Math.round(outcome));
    return { hours: (r / 1000) * DRIFT_HOURS_PER_SECOND, missed: false };
  }

  /*
   * Fly the whole route.
   * outcomes[i] is the result of the i-th moment from eventsFor(build)
   * (see driftFor). A missing outcome counts as the worst result.
   * Returns { status: "paris" | "fuel" | "crash", distance, hours, events, misses }.
   */
  function simulate(build, outcomes) {
    const s = stats(build);
    if (!s.canTakeOff) return { status: "crash", distance: 0, hours: 0, events: 0, misses: 0 };
    outcomes = outcomes || [];
    const v = s.speed;
    const E = s.endurance;
    const evs = eventsFor(build);
    let t = 0;
    let p = 0;
    let events = 0;
    let misses = 0;

    for (let i = 0; i < evs.length; i++) {
      const e = evs[i].t;
      if (p + v * (e - t) >= ROUTE_MILES) break; // arrive before this moment
      if (e >= E) break; // fuel runs out before this moment
      p += v * (e - t);
      t = e;
      const d = driftFor(evs[i], outcomes[i]);
      events++;
      if (d.missed) misses++;
      if (t + d.hours >= E) {
        // fuel runs out while wandering off course
        return { status: "fuel", distance: p, hours: E, events, misses };
      }
      t += d.hours;
    }

    const arrive = t + (ROUTE_MILES - p) / v;
    if (arrive <= E) return { status: "paris", distance: ROUTE_MILES, hours: arrive, events, misses };
    return { status: "fuel", distance: p + v * (E - t), hours: E, events, misses };
  }

  const api = {
    ROUTE_MILES, PARTS, SLOTS, LINDBERGH, DROWSY_HOURS, STORM_HOURS, STORMS, MISS_HOURS,
    DRIFT_HOURS_PER_SECOND, MIN_REACTION_MS, STORM_MAX_HOURS, windowMs, eventsFor, stats, driftFor, simulate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Orteig = api;
})(typeof window !== "undefined" ? window : globalThis);
