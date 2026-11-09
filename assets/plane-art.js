/* Side-view line drawing of a plane built from parts. Used by the hangar
   (big, with callouts) and the class board (small thumbnails). */
(function (root) {
  const HUB_Y = 144;
  const FUSE = "M470,117 L300,111 Q190,116 96,133 L96,141 Q190,158 300,172 L470,171 Z";

  // Side view of a wing: rounded leading edge at the front (right).
  function airfoil(x1, x2, y, thick) {
    const c = x2 - x1;
    return (
      `M${x1},${y} ` +
      `C${x1 + c * 0.4},${y - thick * 0.9} ${x2 - c * 0.35},${y - thick * 1.2} ${x2 - c * 0.06},${y - thick * 0.78} ` +
      `C${x2 + 1},${y - thick * 0.45} ${x2 + 1},${y + thick * 0.25} ${x2 - c * 0.06},${y + thick * 0.32} ` +
      `C${x2 - c * 0.4},${y + thick * 0.45} ${x1 + c * 0.3},${y + thick * 0.1} ${x1},${y} Z`
    );
  }

  function wingArt(kind) {
    if (kind === "bi") {
      return {
        back:
          `<path class="ln-thin" d="M332,84 L338,172 M412,86 L404,172 M332,84 L404,172 M412,86 L338,172"/>` +
          `<path class="ln" d="M348,84 L356,112 M396,86 L392,112"/>` +
          `<path class="fill" d="${airfoil(306, 432, 172, 11)}"/>`,
        front: `<path class="fill" d="${airfoil(296, 440, 82, 12)}"/>`,
        labelAt: [370, 72],
      };
    }
    if (kind === "racer") {
      return {
        back: "",
        front: `<path class="fill" d="${airfoil(330, 410, 166, 8)}"/>`,
        labelAt: [372, 158],
      };
    }
    return {
      back: `<path class="ln" d="M340,101 L372,170 M404,101 L380,170"/>`,
      front: `<path class="fill" d="${airfoil(282, 436, 98, 13)}"/>`,
      labelAt: [360, 86],
    };
  }

  function engineArt(kind) {
    if (kind === "liberty") {
      let s = `<path class="fill" d="M466,115 L538,120 Q548,121 548,130 L548,160 Q548,168 538,169 L466,173 Z"/>`;
      for (let x = 476; x <= 536; x += 12) s += `<rect class="fill-dark" x="${x}" y="109" width="6" height="9" rx="1.5"/>`;
      s += `<rect class="fill-dark" x="548" y="124" width="11" height="42" rx="2"/>`;
      for (let y = 130; y <= 160; y += 6) s += `<path class="ln-thin" d="M549,${y} L558,${y}"/>`;
      return { svg: s, hubX: 567, labelAt: [505, 112] };
    }
    if (kind === "ox5") {
      let s = `<path class="fill" d="M466,117 L505,120 Q512,121 512,128 L512,162 Q512,168 505,169 L466,171 Z"/>`;
      for (let x = 474; x <= 500; x += 9) s += `<rect class="fill-dark" x="${x}" y="112" width="5" height="7" rx="1.5"/>`;
      s += `<rect class="fill-dark" x="512" y="127" width="8" height="36" rx="2"/>`;
      return { svg: s, hubX: 528, labelAt: [490, 114] };
    }
    // Wright Whirlwind: air-cooled radial, cylinders stick out all round.
    let s = `<rect class="fill" x="466" y="110" width="22" height="68" rx="6"/>`;
    [103, 120, 137, 154, 171].forEach((y) => {
      s += `<rect class="fill" x="486" y="${y - 2}" width="17" height="13" rx="3"/>`;
      s += `<path class="ln-thin" d="M490,${y + 1} L499,${y + 1} M490,${y + 5} L499,${y + 5}"/>`;
    });
    s += `<circle class="fill" cx="505" cy="${HUB_Y}" r="9"/>`;
    return { svg: s, hubX: 515, labelAt: [490, 100] };
  }

  function propArt(hubX, spinning) {
    if (spinning) {
      return (
        `<ellipse class="prop-blur" cx="${hubX}" cy="${HUB_Y}" rx="5" ry="74"/>` +
        `<path class="fill" d="M${hubX - 6},${HUB_Y - 10} Q${hubX + 12},${HUB_Y} ${hubX - 6},${HUB_Y + 10} Z"/>`
      );
    }
    return (
      `<path class="fill" d="M${hubX - 2},${HUB_Y} L${hubX - 6},${HUB_Y - 66} Q${hubX - 1},${HUB_Y - 76} ${hubX + 3},${HUB_Y - 66} L${hubX + 2},${HUB_Y} Z"/>` +
      `<path class="fill" d="M${hubX - 2},${HUB_Y} L${hubX - 6},${HUB_Y + 66} Q${hubX - 1},${HUB_Y + 76} ${hubX + 3},${HUB_Y + 66} L${hubX + 2},${HUB_Y} Z"/>` +
      `<path class="fill" d="M${hubX - 6},${HUB_Y - 10} Q${hubX + 12},${HUB_Y} ${hubX - 6},${HUB_Y + 10} Z"/>`
    );
  }

  function tankArt(kind, gallons) {
    const x1 = kind === "large" ? 286 : kind === "medium" ? 370 : 416;
    const x2 = 462;
    const label = gallons + " GAL";
    return {
      svg:
        `<rect class="hatch" x="${x1}" y="122" width="${x2 - x1}" height="40" rx="3"/>` +
        (x2 - x1 > 70 ? `<text class="txt" x="${(x1 + x2) / 2}" y="146" text-anchor="middle">${label}</text>` : ""),
      center: [(x1 + x2) / 2, 162],
    };
  }

  function crewArt(kind) {
    let s =
      `<rect class="fill-dark" x="244" y="121" width="28" height="15" rx="2"/>` +
      `<circle class="fill" cx="262" cy="106" r="7"/><path class="ln" d="M256,104 L268,104"/>`;
    if (kind === "duo") {
      s += `<rect class="fill-dark" x="198" y="124" width="24" height="13" rx="2"/>`;
      s += `<circle class="fill" cx="214" cy="110" r="7"/><path class="ln" d="M208,108 L220,108"/>`;
    }
    return { svg: s, labelAt: [kind === "duo" ? 214 : 262, 96] };
  }

  /*
   * planeSVG(build, opts)
   *   opts.callouts  big hangar drawing with labels
   *   opts.spinning  blurred propeller
   *   opts.title     text for the title block
   */
  function planeSVG(build, opts) {
    opts = opts || {};
    const O = root.Orteig;
    const P = O.PARTS;
    const w = wingArt(build.wing);
    const e = engineArt(build.engine);
    const t = tankArt(build.tank, P.tank[build.tank].gallons);
    const c = crewArt(build.crew);
    const st = O.stats(build);
    const big = !!opts.callouts;
    const vb = big ? "0 0 640 300" : "70 52 520 210";

    let s = `<svg class="pa" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeAttr(describe(build))}">`;
    s += `<defs><pattern id="pa-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0 L0,6" style="stroke:var(--line-3);stroke-width:2"/></pattern></defs>`;
    if (big) s += `<path class="ln-dash" d="M40,251 L600,251"/>`;
    // tail
    s += `<path class="fill" d="M112,130 L94,82 L124,80 Q138,84 150,124 Z"/>`;
    s += `<path class="fill" d="M78,136 Q80,131 92,131 L150,134 L150,139 L92,140 Q80,140 78,136 Z"/>`;
    s += `<path class="ln" d="M118,148 L106,170"/>`;
    // things behind the fuselage
    s += w.back;
    s += `<path class="ln" d="M418,170 L405,232 M384,172 L405,232"/>`;
    // fuselage, tank cutaway, crew
    s += `<path class="fill" d="${FUSE}"/>`;
    s += `<path class="ln-thin" d="M150,126 L150,149 M200,118 L200,156 M300,112 L300,171 M380,113 L380,171"/>`;
    s += t.svg;
    s += c.svg;
    // engine, propeller, wing in front
    s += e.svg;
    s += propArt(e.hubX, opts.spinning);
    s += w.front;
    // wheel
    s += `<circle class="fill" cx="405" cy="233" r="17"/><circle class="fill-dark" cx="405" cy="233" r="5"/>`;

    if (big) {
      const callout = (x1, y1, x2, y2, text, anchor) =>
        `<path class="ln-thin" d="M${x1},${y1} L${x2},${y2}"/><circle cx="${x1}" cy="${y1}" r="2.5" style="fill:var(--amber)"/>` +
        `<text class="txt" x="${x2 + (anchor === "end" ? -4 : 4)}" y="${y2 - 4}" text-anchor="${anchor || "start"}">${text}</text>`;
      s += callout(w.labelAt[0], w.labelAt[1], 300, 30, "WING · " + P.wing[build.wing].short.toUpperCase());
      s += callout(e.labelAt[0], e.labelAt[1], 632, 52, "ENGINE · " + P.engine[build.engine].short.toUpperCase() + " · " + P.engine[build.engine].hp + " HP", "end");
      s += callout(c.labelAt[0], c.labelAt[1], 40, 52, "CREW · " + (build.crew === "duo" ? "2" : "1"));
      s += callout(t.center[0], t.center[1], 470, 282, "FUEL · " + P.tank[build.tank].gallons + " GAL");
      // title block
      s += `<g transform="translate(40,262)"><rect class="ln-thin" x="0" y="0" width="236" height="30"/>`;
      s += `<path class="ln-thin" d="M120,0 L120,30"/>`;
      s += `<text class="txt-dim" x="8" y="12">TAKEOFF WEIGHT</text><text class="txt" x="8" y="25">${st.weight.toLocaleString("en-US")} LB</text>`;
      s += `<text class="txt-dim" x="128" y="12">DRAWING</text><text class="txt" x="128" y="25">${escapeText(opts.title || "NYP · 1927")}</text></g>`;
      if (!st.canTakeOff) {
        s += `<g class="stamp" transform="translate(470,214) rotate(-8)"><rect x="-96" y="-26" width="192" height="40" rx="3"/><text x="0" y="5" text-anchor="middle">TOO HEAVY</text></g>`;
      }
    }
    s += `</svg>`;
    return s;
  }

  function describe(build) {
    const P = root.Orteig.PARTS;
    return `${P.wing[build.wing].name}, ${P.engine[build.engine].name}, ${P.tank[build.tank].name}, ${P.crew[build.crew].name}`;
  }
  function escapeText(s) {
    return String(s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
  }
  function escapeAttr(s) {
    return escapeText(s).replace(/"/g, "&quot;");
  }

  root.OrteigArt = { planeSVG, describe };
})(window);
