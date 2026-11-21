/* Catan board generator — draws a generated board as SVG. */
(function (G) {
  'use strict';
  const CG = G.CG;
  const { WAYS, TERRAIN, RES, PRODUCING } = CG;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = (n) => Math.round(n * 1000) / 1000;

  function hexPoints(c, r) {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 90);
      pts.push(f(c.x + r * Math.cos(a)) + ',' + f(c.y + r * Math.sin(a)));
    }
    return pts.join(' ');
  }

  function pipRow(x, y, n, red) {
    const w = WAYS[n] || 0;
    const gap = 0.075;
    let out = '';
    for (let k = 0; k < w; k++) {
      const px = x + (k - (w - 1) / 2) * gap;
      out += `<circle cx="${f(px)}" cy="${f(y)}" r="0.026" class="${red ? 'pip red' : 'pip'}"/>`;
    }
    return out;
  }

  function token(x, y, n, r, cls) {
    const red = n === 6 || n === 8;
    return `<g class="token ${cls || ''}">` +
      `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" class="token-disc"/>` +
      `<text x="${f(x)}" y="${f(y + r * 0.22)}" class="token-num${red ? ' red' : ''}" font-size="${f(r * 0.95)}">${n}</text>` +
      pipRow(x, y + r * 0.58, n, red) + '</g>';
  }

  function pawn(x, y, s, cls) {
    return `<g class="${cls}" transform="translate(${f(x)},${f(y)}) scale(${s})">` +
      '<circle cx="0" cy="-0.55" r="0.32"/><path d="M-0.42,0.62 C-0.42,0.05 -0.22,-0.28 0,-0.28 C0.22,-0.28 0.42,0.05 0.42,0.62 Z"/></g>';
  }

  CG.renderBoard = function (svg, b, view) {
    view = view || {};
    const g = b.grid;
    const xs = g.cells.map((c) => c.x), ys = g.cells.map((c) => c.y);
    const pad = 1.05;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    svg.setAttribute('viewBox', `${f(minX)} ${f(minY)} ${f(maxX - minX)} ${f(maxY - minY)}`);

    const odds = CG.landingOdds;
    const out = [];
    const isLand = (id) => !g.cells[id].outer && b.terr[id] && b.terr[id] !== 'sea';

    // Frame and sea
    for (const c of g.cells) {
      if (c.outer) out.push(`<polygon points="${hexPoints(c, 1.01)}" class="frame"/>`);
      else if (b.terr[c.id] === 'sea') out.push(`<polygon points="${hexPoints(c, 1.01)}" class="sea"/>`);
    }

    // Land hexes: shapes first, then rivers, then icons and tokens on top.
    const landCells = g.cells.filter((c) => isLand(c.id));
    for (const c of landCells) out.push(`<polygon points="${hexPoints(c, 0.965)}" fill="${TERRAIN[b.terr[c.id]].color}" class="hex-shape"/>`);
    for (const r of b.rivers || []) {
      const pts = r.cells.map((id) => g.cells[id]);
      const M = g.edges[r.mouth];
      pts.push({ x: (g.verts[M.a].x + g.verts[M.b].x) / 2, y: (g.verts[M.a].y + g.verts[M.b].y) / 2 });
      const d = pts.map((p, k) => (k ? 'L' : 'M') + f(p.x) + ',' + f(p.y)).join(' ');
      out.push(`<path d="${d}" class="river-bank"/><path d="${d}" class="river"/>`);
      for (const e of r.bridges) {
        const A = g.verts[g.edges[e].a], B = g.verts[g.edges[e].b];
        out.push(`<line x1="${f(A.x)}" y1="${f(A.y)}" x2="${f(B.x)}" y2="${f(B.y)}" class="bridge-site"><title>Bridge site</title></line>`);
      }
    }
    for (const c of landCells) {
      const t = b.terr[c.id];
      const T = TERRAIN[t];
      const n = b.num[c.id];
      const label = T.name + (n ? ' ' + n : '') + (b.extra[c.id] ? ' and ' + b.extra[c.id] : '') + (b.lakeNums[c.id] ? ' (fish on ' + b.lakeNums[c.id].join(', ') + ')' : '');
      out.push(`<g class="hex t-${t}"><title>${esc(label)}</title>`);
      if (n) {
        out.push(`<text x="${f(c.x)}" y="${f(c.y - 0.42)}" class="icon" font-size="0.36">${T.icon}</text>`);
        if (b.extra[c.id]) {
          // One hex with two numbers (e.g. the 2 also carries the 12).
          out.push(token(c.x - 0.25, c.y + 0.14, n, 0.27));
          out.push(token(c.x + 0.25, c.y + 0.14, b.extra[c.id], 0.27));
        } else out.push(token(c.x, c.y + 0.12, n, 0.34));
      } else if (t === 'lake') {
        out.push(`<text x="${f(c.x)}" y="${f(c.y - 0.12)}" class="icon" font-size="0.5">${T.icon}</text>`);
        const nums = b.lakeNums[c.id] || [];
        const w = 0.2 + nums.length * 0.26;
        out.push(`<rect x="${f(c.x - w / 2)}" y="${f(c.y + 0.16)}" width="${f(w)}" height="0.3" rx="0.15" class="lake-pill"/>`);
        out.push(`<text x="${f(c.x)}" y="${f(c.y + 0.37)}" class="lake-nums" font-size="0.19">${nums.join(' · ')}</text>`);
      } else {
        const size = t === 'castle' ? 0.72 : 0.55;
        out.push(`<text x="${f(c.x)}" y="${f(c.y + size * 0.36)}" class="icon" font-size="${size}">${T.icon}</text>`);
        if (t === 'castle') out.push(`<text x="${f(c.x)}" y="${f(c.y + 0.7)}" class="hex-label" font-size="0.17">Castle</text>`);
      }
      out.push('</g>');
    }

    // Barbarian Attack overlays: inner-area outline and landing odds on coastal hexes.
    if (b.ba && view.region !== false) {
      const innerSet = new Set(b.main.inner);
      for (const e of g.edges) {
        const [p, q] = e.cells;
        if (q === undefined) continue;
        if (innerSet.has(p) !== innerSet.has(q) && b.main.set.has(p) && b.main.set.has(q)) {
          const A = g.verts[e.a], B = g.verts[e.b];
          out.push(`<line x1="${f(A.x)}" y1="${f(A.y)}" x2="${f(B.x)}" y2="${f(B.y)}" class="inner-line"/>`);
        }
      }
    }
    if (b.ba && view.odds !== false) {
      for (const id of b.ba.coast) {
        const c = g.cells[id];
        const p = Math.round((odds[b.num[id]] + (b.extra[id] ? odds[b.extra[id]] : 0)) * 100);
        out.push(`<g class="odds"><rect x="${f(c.x - 0.3)}" y="${f(c.y + 0.53)}" width="0.6" height="0.22" rx="0.11"/>` +
          `<text x="${f(c.x)}" y="${f(c.y + 0.69)}" font-size="0.15">⚔ ${p}%</text></g>`);
      }
    }

    // Harbors
    for (const h of b.harbors) {
      const W = g.cells[h.cell], A = g.verts[h.a], B = g.verts[h.b];
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const px = mx + (W.x - mx) * 0.58, py = my + (W.y - my) * 0.58;
      const R = h.type === 'generic' ? null : RES[h.type];
      const title = R ? `2:1 ${R.name} harbor` : '3:1 harbor';
      out.push(`<g class="harbor ${R ? 'special' : 'generic'}"><title>${title}</title>` +
        `<line x1="${f(px)}" y1="${f(py)}" x2="${f(A.x)}" y2="${f(A.y)}" class="pier"/>` +
        `<line x1="${f(px)}" y1="${f(py)}" x2="${f(B.x)}" y2="${f(B.y)}" class="pier"/>` +
        `<circle cx="${f(px)}" cy="${f(py)}" r="0.3" class="harbor-disc"/>` +
        (R
          ? `<text x="${f(px)}" y="${f(py + 0.01)}" class="icon" font-size="0.22">${R.icon}</text><text x="${f(px)}" y="${f(py + 0.21)}" class="harbor-ratio" font-size="0.13">2:1</text>`
          : `<text x="${f(px)}" y="${f(py + 0.07)}" class="harbor-ratio" font-size="0.19">3:1</text>`) +
        '</g>');
    }

    // Fishing grounds
    for (const s of b.fishing) {
      const W = g.cells[s.cell];
      const [A, N, B] = s.verts.map((v) => g.verts[v]);
      const qx = N.x + (W.x - N.x) * 0.95, qy = N.y + (W.y - N.y) * 0.95;
      const tx = N.x + (W.x - N.x) * 0.55, ty = N.y + (W.y - N.y) * 0.55;
      out.push(`<g class="fishing"><title>Fishing ground ${s.number}</title>` +
        `<polygon points="${f(A.x)},${f(A.y)} ${f(N.x)},${f(N.y)} ${f(B.x)},${f(B.y)} ${f(qx)},${f(qy)}" class="fish-ground"/>` +
        token(tx, ty, s.number, 0.25, 'fish-token') + '</g>');
    }

    // A swamp that serves as the watering hole (Rivers + Caravans).
    if (b.oasis !== null && b.oasis !== undefined && b.terr[b.oasis] === 'swamp') {
      const c = g.cells[b.oasis];
      out.push(`<g><title>Watering hole (trains start here)</title><circle cx="${f(c.x + 0.38)}" cy="${f(c.y - 0.38)}" r="0.2" class="oasis-badge"/><text x="${f(c.x + 0.38)}" y="${f(c.y - 0.31)}" class="icon" font-size="0.22">🐪</text></g>`);
    }

    // Pieces: barbarians, robber, pirate
    for (const id of Object.keys(b.barb)) {
      const c = g.cells[id];
      for (let k = 0; k < b.barb[id]; k++) out.push(pawn(c.x + 0.42 + k * 0.14, c.y - 0.22, 0.2, 'barbarian'));
    }
    if (typeof b.robber === 'number') {
      const c = g.cells[b.robber];
      out.push(`<g><title>Robber starts here</title>${pawn(c.x + 0.4, c.y + 0.12, 0.26, 'robber')}</g>`);
    }
    if (typeof b.pirate === 'number') {
      const c = g.cells[b.pirate];
      out.push(`<g class="pirate"><title>Pirate starts here</title><text x="${f(c.x)}" y="${f(c.y + 0.2)}" class="icon" font-size="0.55">🏴‍☠️</text></g>`);
    }

    // Hot spots: intersections worth 11+ dots.
    if (view.hot && b.ev) {
      g.verts.forEach((v) => {
        const val = b.ev.vval[v.id];
        if (val >= 11) out.push(`<circle cx="${f(v.x)}" cy="${f(v.y)}" r="0.13" class="hot${val >= 12 ? ' very' : ''}"><title>${val} dots</title></circle>`);
      });
    }

    svg.innerHTML = out.join('');
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
