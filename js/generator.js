/* Catan board generator — builds boards for every supported setup and scores their fairness. */
(function (G) {
  'use strict';
  const CG = G.CG;
  const { WAYS, PRODUCING, TERRAIN, DATA } = CG;

  // While numbers are being placed, a hex that carries two tokens holds one combined value:
  // host * 100 + extra (302 = a 3 with the 2). Every rule below understands both kinds.
  const pair = (host, extra) => host * 100 + extra;
  const nums = (n) => (n >= 100 ? [Math.floor(n / 100), n % 100] : [n]);
  const ways = (n) => nums(n).reduce((s, x) => s + (WAYS[x] || 0), 0);
  const RED = (n) => nums(n).some((x) => x === 6 || x === 8);
  const EXTREME = (n) => nums(n).some((x) => x === 2 || x === 12);
  const sameNum = (n, m) => nums(n)[0] === nums(m)[0];
  const NONPROD = new Set(['desert', 'oasis', 'castle', 'lake', 'swamp']);

  function expand(counts) {
    const out = [];
    for (const k of Object.keys(counts)) for (let n = 0; n < counts[k]; n++) out.push(k);
    return out;
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  // Failure counters for tuning (set CG.debug = {} to collect).
  const dbg = (k) => { if (CG.debug) CG.debug[k] = (CG.debug[k] || 0) + 1; };

  const gridCache = new Map();
  function cached(k, f) {
    if (!gridCache.has(k)) gridCache.set(k, f());
    return gridCache.get(k);
  }

  function newBoard(sc, grid) {
    const n = grid.cells.length;
    return {
      sc, grid,
      terr: new Array(n).fill(null),
      num: new Array(n).fill(null),
      lakeNums: {},
      extra: {},
      oasis: null,
      rivers: [],
      barb: {},
      harbors: [],
      fishing: [],
      robber: null, pirate: null,
      main: null, ba: null, islands: null, smallIslands: null,
    };
  }

  const tokenOf = (b, id) => (b.extra[id] ? pair(b.num[id], b.extra[id]) : b.num[id]);
  const isWater = (b, id) => b.grid.cells[id].outer || b.terr[id] === 'sea';
  const isLand = (b, id) => !b.grid.cells[id].outer && b.terr[id] && b.terr[id] !== 'sea';
  const pips = (b, id) => (b.num[id] ? WAYS[b.num[id]] : 0) + (b.extra[id] ? WAYS[b.extra[id]] : 0);

  // ------------------------------------------------------------------ main island helpers
  function mainInfo(grid, ids) {
    const set = new Set(ids);
    const coast = ids.filter((id) => grid.cells[id].nb.some((n) => !set.has(n)));
    const coastSet = new Set(coast);
    const inner = ids.filter((id) => !coastSet.has(id));
    const cx = ids.reduce((s, id) => s + grid.cells[id].x, 0) / ids.length;
    const cy = ids.reduce((s, id) => s + grid.cells[id].y, 0) / ids.length;
    const ring = CG.sortByAngle(grid, coast, cx, cy);
    return { ids, set, coast, coastSet, inner, ring, cx, cy };
  }

  // Castle / desert positions for Barbarian Attack.
  // 3-4: castle and desert directly opposite each other on the coast — by default on the middle
  //      of two opposite sides (top and bottom). On a corner, the frame position facing the castle
  //      or the desert would always hold a harbor nobody can use, because harbors alternate.
  // Medium (house setup): the same rule as 3-4.
  // 5-6: two castles opposite each other, desert and oasis opposite each other, all four on side
  //      positions spaced evenly, so every stretch of coast between them has 3 hexes.
  function baSpecials(grid, info, size, castlePos) {
    const C = (id) => grid.cells[id];
    const near = (a, b) => Math.abs(a - b) < 0.01;
    const minBy = (arr, f) => arr.reduce((m, id) => (f(id) < f(m) - 1e-9 ? id : m));
    const row = (dy) => info.coast.filter((id) => near(C(id).y, info.cy + dy));
    const opposite = (id) => info.coast.find((o) => near(C(o).x, 2 * info.cx - C(id).x) && near(C(o).y, 2 * info.cy - C(id).y));
    if (size === 'big') {
      const up = row(-3), down = row(3);
      return {
        castles: [minBy(up, (id) => -C(id).x), minBy(down, (id) => C(id).x)],
        slots: [minBy(up, (id) => C(id).x), minBy(down, (id) => -C(id).x)],
      };
    }
    let castle;
    if (castlePos === 'corner') castle = minBy(row(0), (id) => C(id).x);
    else {
      const topY = Math.min(...info.coast.map((id) => C(id).y));
      castle = minBy(info.coast.filter((id) => near(C(id).y, topY)), (id) => Math.abs(C(id).x - info.cx) * 100 + C(id).x);
    }
    return { castles: [castle], slots: [opposite(castle)] };
  }

  // Resource balance repair: swap numbers between two hexes of different terrain when the swap
  // keeps every number rule and brings production per resource closer to fair.
  function resDevOf(b, ids) {
    const p = {}, n = {};
    let tp = 0, tn = 0;
    for (const id of ids) {
      const t = b.terr[id];
      if (!TERRAIN[t] || !TERRAIN[t].res || t === 'gold') continue;
      p[t] = (p[t] || 0) + ways(b.num[id]); n[t] = (n[t] || 0) + 1; tp += ways(b.num[id]); tn++;
    }
    const mean = tp / Math.max(1, tn);
    let d = 0;
    for (const t in p) d += Math.abs(p[t] - n[t] * mean);
    return d / Math.max(1, tp);
  }

  function numFits(b, v, flags) {
    const g = b.grid, n = b.num[v];
    if (flags.goldNoRed && b.terr[v] === 'gold' && RED(n)) return false;
    for (const nb of g.cells[v].nb) {
      const m = b.num[nb];
      if (!m) continue;
      if (flags.redAdj && RED(n) && RED(m)) return false;
      if (flags.extremeAdj && EXTREME(n) && EXTREME(m)) return false;
      if (flags.sameNumAdj && sameNum(n, m)) return false;
    }
    if (flags.capHotspots)
      for (const vid of g.cells[v].verts) {
        let s = 0;
        for (const c of g.verts[vid].cells) if (b.num[c]) s += ways(b.num[c]);
        if (s > HOTSPOT_CAP) return false;
      }
    return true;
  }

  function repairResources(b, ids, groupOf, flags, rng) {
    let dev = resDevOf(b, ids);
    for (let it = 0; it < 500 && dev > 0.02; it++) {
      const a = rng.pick(ids), c = rng.pick(ids);
      if (a === c || b.num[a] === b.num[c] || b.terr[a] === b.terr[c] || groupOf(a) !== groupOf(c)) continue;
      const t = b.num[a]; b.num[a] = b.num[c]; b.num[c] = t;
      let nd = Infinity;
      if (numFits(b, a, flags) && numFits(b, c, flags)) nd = resDevOf(b, ids);
      if (nd < dev) dev = nd;
      else { b.num[c] = b.num[a]; b.num[a] = t; }
    }
    return dev;
  }

  function terrainCSP(b, ids, poolOf, opts, rng) {
    const grid = b.grid;
    const ok = (v, t, assign) => {
      if (opts.allowed && !opts.allowed(v, t)) return false;
      const deserty = t === 'desert' || t === 'oasis';
      for (const n of grid.cells[v].nb) {
        const tn = assign.has(n) ? assign.get(n) : b.terr[n];
        if (!tn || tn === 'sea') continue;
        if (opts.sameTerrain && tn === t) return false;
        if (opts.spreadDeserts && deserty && (tn === 'desert' || tn === 'oasis')) return false;
        if (opts.spreadGold && t === 'gold' && tn === 'gold') return false;
      }
      return true;
    };
    const order = CG.bfsOrder(grid, ids, rng);
    const res = CG.solve(order, poolOf, ok, rng, 6000);
    if (!res) { dbg('terrain'); return false; }
    for (const [id, t] of res) b.terr[id] = t;
    return true;
  }

  const HOTSPOT_CAP = 11;
  const NUM_STEPS = 600; // give up on a token layout quickly; a fresh attempt is cheaper than deep backtracking

  function numberCSP(b, ids, poolOf, flags, rng) {
    const grid = b.grid;
    const ok = (v, n, assign) => {
      if (flags.goldNoRed && b.terr[v] === 'gold' && RED(n)) return false;
      for (const nb of grid.cells[v].nb) {
        const m = assign.has(nb) ? assign.get(nb) : b.num[nb];
        if (!m) continue;
        if (flags.redAdj && RED(n) && RED(m)) return false;
        if (flags.extremeAdj && EXTREME(n) && EXTREME(m)) return false;
        if (flags.sameNumAdj && sameNum(n, m)) return false;
      }
      if (flags.capHotspots) {
        // Partial sums only grow, so a vertex already over the cap can be rejected now.
        for (const vid of grid.cells[v].verts) {
          let s = ways(n);
          for (const c of grid.verts[vid].cells) {
            if (c === v) continue;
            const m = assign.has(c) ? assign.get(c) : b.num[c];
            if (m) s += ways(m);
          }
          if (s > HOTSPOT_CAP) return false;
        }
      }
      return true;
    };
    // Place tokens strongest first (6/8, then 5/9, ...), each on a random hex that keeps every rule.
    // Placing the hard-to-fit numbers first needs far less backtracking than going hex by hex.
    const groups = new Map();
    for (const id of ids) {
      const p = poolOf(id);
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(id);
    }
    const tokens = [];
    for (const [p, cells] of groups) for (const [val, n] of p) for (let k = 0; k < n; k++) tokens.push({ val, cells });
    rng.shuffle(tokens);
    tokens.sort((x, y) => ways(y.val) - ways(x.val));
    const placed = new Map();
    let steps = 0;
    const rec = (k) => {
      if (k === tokens.length) return true;
      if (++steps > NUM_STEPS) return false;
      const t = tokens[k];
      const cand = rng.shuffle(t.cells.filter((c) => !placed.has(c) && ok(c, t.val, placed)));
      for (const c of cand) {
        placed.set(c, t.val);
        if (rec(k + 1)) return true;
        placed.delete(c);
        if (steps > NUM_STEPS) return false;
      }
      return false;
    };
    if (!rec(0)) { dbg('numbers'); return false; }
    for (const [id, n] of placed) b.num[id] = n;
    return true;
  }

  // Splits the coastal tokens over the coast arcs so each arc gets the same share of barbarian
  // landing odds (dots = odds). The two 5s and two 9s (5-6 players) go to different arcs, and so
  // do the 2 and the 12, which each start with a barbarian.
  function splitOverArcs(arcs, tokens, maxDev, rng) {
    const total = tokens.reduce((s, n) => s + ways(n), 0);
    const ideal = total / arcs.length;
    const count = (p, n) => p.filter((x) => x === n).length;
    for (let t = 0; t < 4000; t++) {
      const s = rng.shuffle(tokens.slice());
      const parts = [];
      let k = 0;
      for (const a of arcs) { parts.push(s.slice(k, k + a.length)); k += a.length; }
      const dev = parts.reduce((d, p) => d + Math.abs(p.reduce((x, n) => x + ways(n), 0) - ideal), 0) / total;
      if (dev > maxDev + 1e-9) continue;
      if (parts.some((p) => count(p, 5) > 1 || count(p, 9) > 1 || (p.includes(2) && p.includes(12)))) continue;
      return parts;
    }
    return null;
  }

  // Rivers of Catan: each tile is a straight strip of hexes. A placement is valid when every hex
  // is on free land, the river leaves its last hex through the tile's mouth side straight into the
  // sea, and rivers do not touch each other (unless nothing else fits). `spots`: desert spots the swamps must end on, in
  // order (Barbarian Attack); a swamp with no spot left may end anywhere on the coast.
  function placeRivers(b, info, tileKeys, rng, spots) {
    const g = b.grid;
    const step = (id, d) => g.byKey.get(CG.key(g.cells[id].i + CG.NB[d][0], g.cells[id].j + CG.NB[d][1]));
    const used = new Set();
    const open = spots.slice();
    const reserved = new Set(spots);
    b.rivers = [];
    for (const key of tileKeys) {
      const tile = CG.RIVER_TILES[key];
      const target = tile.hexes[tile.hexes.length - 1] === 'swamp' && open.length ? open.shift() : null;
      // Rivers keep apart when they can; on a crowded board they may touch (never overlap, and never
      // with two equal terrains side by side).
      let options = [];
      for (const apart of [true, false]) {
        if (options.length) break;
        for (const start of info.ids)
        for (let d = 0; d < 6; d++) {
          const cells = [start];
          while (cells.length < tile.hexes.length) {
            const next = step(cells[cells.length - 1], d);
            if (!next || !info.set.has(next.id)) break;
            cells.push(next.id);
          }
          if (cells.length < tile.hexes.length) continue;
          const last = cells[cells.length - 1];
          if (target !== null && last !== target) continue;
          const clash = (id, k) => g.cells[id].nb.some((n) => used.has(n) && (apart || b.terr[n] === tile.hexes[k]));
          if (cells.some((id, k) => b.terr[id] || used.has(id) || (reserved.has(id) && id !== target) || clash(id, k))) continue;
          const out = step(last, (d + tile.mouth + 6) % 6);
          if (out && info.set.has(out.id)) continue; // must flow into the sea
          options.push({ cells, out: out.id });
        }
      }
      if (!options.length) { dbg('rivers'); return false; }
      // Prefer mouths that open onto a sea spot touching two hexes, so a harbor there can use
      // the other edge instead of the river mouth.
      const roomy = options.filter((o) => g.cells[o.out].nb.filter((n) => info.set.has(n)).length >= 2);
      const o = rng.pick(roomy.length ? roomy : options);
      o.cells.forEach((id, k) => { b.terr[id] = tile.hexes[k]; used.add(id); });
      // Bridge sites: every edge the river crosses, including the mouth.
      const crossings = o.cells.slice(1).map((id, k) => CG.edgeBetween(g, o.cells[k], id));
      const mouth = CG.edgeBetween(g, o.cells[o.cells.length - 1], o.out);
      b.rivers.push({ tile: key, cells: o.cells, bridges: [...crossings, mouth], mouth });
    }
    return true;
  }

  // Barbarian Attack with rivers has no official hex table (the official version is one printed
  // layout). Each resource gets the same share of coastal hexes as in the official table, counting
  // the river hexes that already sit on the coast; the rest goes inland.
  function coastSplit(b, info, supply, freeCoast, table, rng) {
    const types = CG.RESOURCE_TERRAINS;
    const count = (list, t) => list.filter((x) => x === t).length;
    const riverHexes = b.rivers.flatMap((r) => r.cells);
    const riverCoast = riverHexes.filter((id) => info.coastSet.has(id)).map((id) => b.terr[id]);
    const riverAll = riverHexes.map((id) => b.terr[id]);
    const want = {}, q = {};
    for (const t of types) {
      const share = (table.coast[t] || 0) / ((table.coast[t] || 0) + (table.inner[t] || 0) || 1);
      want[t] = (count(supply, t) + count(riverAll, t)) * share - count(riverCoast, t);
      q[t] = Math.min(count(supply, t), Math.max(0, Math.floor(want[t])));
    }
    let diff = freeCoast - types.reduce((n, t) => n + q[t], 0);
    const noise = {};
    types.forEach((t) => (noise[t] = rng.next() * 0.01));
    while (diff !== 0) {
      const ok = types.filter((t) => (diff > 0 ? q[t] < count(supply, t) : q[t] > 0));
      if (!ok.length) throw new Error('coast split impossible');
      const gap = (t) => (want[t] - q[t] + noise[t]) * (diff > 0 ? 1 : -1);
      const t = ok.reduce((m, x) => (gap(x) > gap(m) ? x : m));
      q[t] += diff > 0 ? 1 : -1;
      diff += diff > 0 ? -1 : 1;
    }
    const coast = types.flatMap((t) => new Array(q[t]).fill(t));
    const inner = supply.slice();
    coast.forEach((t) => inner.splice(inner.indexOf(t), 1));
    return { coast, inner };
  }

  // Builds the main island on the cells in `info` — one pipeline for every mix of scenarios.
  // The base game's desert(s) are "desert spots" that the scenarios share: Barbarian Attack fixes
  // where they are, a river's swamp can sit on one, the watering hole is one, a lake is one.
  // Every special hex takes the base hex it replaces out of the supply, so totals always match.
  function buildMain(b, info, sc, bal, rng) {
    const grid = b.grid;
    const flags = bal.flags;
    const balancing = !bal.firstValid;
    const supply = expand(DATA.island[sc.size].terrain);
    const tokens = DATA.island[sc.size].tokens.slice();
    const take = (list, x) => { const k = list.indexOf(x); if (k >= 0) list.splice(k, 1); return k >= 0; };
    const isFree = (id) => !b.terr[id];
    b.main = info;

    // 1. Barbarian Attack: castles on fixed coast spots (each replaces the hex in its table's
    //    castleTakes) and desert spots directly opposite.
    let spots = [];
    let BA = null;
    if (sc.ba) {
      BA = DATA.ba[sc.size];
      const sp = baSpecials(grid, info, sc.size, bal.castlePos);
      sp.castles.forEach((id, k) => { b.terr[id] = 'castle'; take(supply, BA.castleTakes[k]); });
      BA.removeTokens.forEach((n) => take(tokens, n));
      spots = sp.slots;
      b.ba = { castles: sp.castles, spots };
    }

    // 2. Rivers: the tiles replace the base hexes in the official table. With Barbarian Attack
    //    the swamps end on the desert spots.
    if (sc.rivers) {
      const R = DATA.rivers[sc.size];
      for (const [t, n] of Object.entries(R.remove)) for (let k = 0; k < n; k++) take(supply, t);
      if (!placeRivers(b, info, R.tiles, rng, spots)) return false;
    }
    for (const id of spots) if (isFree(id)) { if (!take(supply, 'desert')) throw new Error('no desert for a desert spot'); b.terr[id] = 'desert'; }

    // 3. Caravans: the watering hole is a desert spot — the first Barbarian Attack spot, else the
    //    swamp of the 4-hex river, else a desert moved to the centre.
    if (sc.caravans) {
      if (spots.length) b.oasis = spots[0];
      else if (sc.rivers) b.oasis = b.rivers[0].cells[b.rivers[0].cells.length - 1];
      else {
        const d = (id) => Math.hypot(grid.cells[id].x - info.cx, grid.cells[id].y - info.cy);
        const minD = Math.min(...info.ids.map(d));
        b.oasis = rng.pick(info.ids.filter((id) => d(id) < minD + 0.01));
        if (!take(supply, 'desert')) throw new Error('no desert for the watering hole');
        b.terr[b.oasis] = 'desert';
      }
      if (b.terr[b.oasis] === 'desert') b.terr[b.oasis] = 'oasis';
    }

    // 4. Fishing lakes (only without rivers and Barbarian Attack) replace deserts and stay inland.
    //    With Caravans the first lake replaces a forest next to the watering hole.
    if (sc.lake) {
      const lakes = DATA.fish[sc.size].lakes;
      for (let k = 0; k < lakes.length; k++) {
        let cand;
        if (sc.caravans && k === 0) {
          take(supply, 'forest');
          cand = grid.cells[b.oasis].nb.filter((n) => info.set.has(n) && !info.coastSet.has(n) && isFree(n));
        } else {
          if (!take(supply, 'desert')) break;
          cand = info.inner.filter((c) => isFree(c) && !(balancing && grid.cells[c].nb.some((n) => b.terr[n] === 'lake')));
        }
        if (!cand.length) return false;
        const id = rng.pick(cand);
        b.terr[id] = 'lake';
        b.lakeNums[id] = lakes[k];
      }
    }

    // 5. The rest of the supply goes on the free hexes. Barbarian Attack splits it into coast and
    //    inland hexes (official tables; with rivers, the same coastal share per resource).
    const free = info.ids.filter(isFree);
    if (free.length !== supply.length) throw new Error('terrain count mismatch');
    let terrPool;
    if (BA) {
      const freeInner = free.filter((id) => !info.coastSet.has(id)).length;
      const split = sc.rivers ? coastSplit(b, info, supply, free.length - freeInner, BA, rng) : { coast: expand(BA.coast), inner: expand(BA.inner) };
      if (split.inner.length !== freeInner) throw new Error('Barbarian Attack table does not fit');
      const tc = CG.countMap(split.coast), ti = CG.countMap(split.inner);
      terrPool = (v) => (info.coastSet.has(v) ? tc : ti);
    } else {
      const p = CG.countMap(supply);
      terrPool = () => p;
    }
    const allowed = (v, t) => {
      if (t !== 'desert' || BA) return true;
      if (bal.desertPos === 'inner') return !info.coastSet.has(v);
      if (bal.desertPos === 'coast') return info.coastSet.has(v);
      return true;
    };
    if (!terrainCSP(b, free, terrPool, { allowed, sameTerrain: flags.sameTerrain, spreadDeserts: balancing }, rng)) return false;

    // 6. Numbers.
    const numbered = info.ids.filter((id) => PRODUCING.has(b.terr[id]));
    return BA ? baNumbers(b, info, sc, bal, rng, numbered, BA) : plainNumbers(b, info, sc, bal, rng, numbered, tokens);
  }

  // Without Barbarian Attack: when there are more tokens than hexes (official Rivers / Caravans
  // rules), one extra -> the 12 shares the hex with a 2; two extra -> the 2 and the 12 each join a 3.
  function plainNumbers(b, info, sc, bal, rng, numbered, tokens) {
    const flags = bal.flags;
    const surplus = tokens.length - numbered.length;
    if (surplus < 0 || surplus > 2) throw new Error('token count mismatch');
    const host = surplus === 1 ? 2 : 3;
    for (const n of surplus === 1 ? [12] : surplus === 2 ? [2, 12] : []) {
      tokens.splice(tokens.indexOf(n), 1);
      tokens.splice(tokens.indexOf(host), 1, pair(host, n));
    }
    const np = CG.countMap(tokens);
    if (!numberCSP(b, numbered, () => np, flags, rng)) return false;
    if (flags.resourceBalance && !bal.firstValid) {
      const dev = repairResources(b, numbered, () => 0, flags, rng);
      if (bal.hardLimits && dev > 0.12) return false;
    }
    splitPairs(b, numbered);
    if (sc.robber === 'desert' || sc.robber === 'swamp') b.robber = info.ids.find((id) => b.terr[id] === sc.robber);
    else b.robber = sc.robber;
    return true;
  }

  // Barbarian Attack: every number 2-12 must be on the coast, so each barbarian roll lands on a
  // coastal hex. When rivers leave one coastal hex too few, the 2 and the 12 share a hex
  // (official Rivers + Barbarian Attack rule).
  function baNumbers(b, info, sc, bal, rng, numbered, BA) {
    const flags = bal.flags;
    const ring = info.ring;
    const coastNum = numbered.filter((id) => info.coastSet.has(id));
    const innerNum = numbered.filter((id) => !info.coastSet.has(id));
    const coastTokens = BA.coastTokens.slice();
    if (coastNum.length === coastTokens.length - 1) {
      coastTokens.splice(coastTokens.indexOf(12), 1);
      coastTokens.splice(coastTokens.indexOf(2), 1, pair(2, 12));
    }
    if (coastNum.length !== coastTokens.length || innerNum.length !== BA.innerTokens.length) throw new Error('Barbarian Attack token count mismatch');

    // Coast arcs between castles and desert spots, and ring distance to the nearest castle.
    const cut = new Set([...b.ba.castles, ...b.ba.spots]);
    const castleIdx = b.ba.castles.map((id) => ring.indexOf(id));
    const dist = {};
    ring.forEach((id, k) => { dist[id] = Math.min(...castleIdx.map((c) => Math.min(Math.abs(k - c), ring.length - Math.abs(k - c)))); });
    const arcs = [];
    let cur = [];
    const start = ring.indexOf(b.ba.castles[0]);
    for (let s = 1; s <= ring.length; s++) {
      const id = ring[(start + s) % ring.length];
      if (cut.has(id)) { if (cur.length) arcs.push(cur); cur = []; } else if (coastNum.includes(id)) cur.push(id);
    }
    const arcOf = {};
    arcs.forEach((a, k) => a.forEach((id) => (arcOf[id] = k)));

    // With "even barbarian threat" on, split the coastal tokens over the arcs first so every
    // stretch of coast gets the same landing odds, then place them inside each arc.
    const coastSet = new Set(coastNum);
    const ni = CG.countMap(BA.innerTokens);
    let coastPoolOf;
    let group = (v) => (coastSet.has(v) ? 'coast' : 'inner');
    if (flags.baThreat && !bal.firstValid) {
      const maxDev = arcs.length === 2 ? (bal.hardLimits ? 0 : 0.07) : (bal.hardLimits ? 0.06 : 0.1);
      const parts = splitOverArcs(arcs, coastTokens, maxDev, rng);
      if (!parts) { dbg('arcs'); return false; }
      const pools = parts.map((p) => CG.countMap(p));
      coastPoolOf = (v) => pools[arcOf[v]];
      group = (v) => (coastSet.has(v) ? 'arc' + arcOf[v] : 'inner');
    } else {
      const nc = CG.countMap(coastTokens);
      coastPoolOf = () => nc;
    }
    if (!numberCSP(b, numbered, (v) => (coastSet.has(v) ? coastPoolOf(v) : ni), flags, rng)) return false;
    if (flags.resourceBalance && !bal.firstValid) {
      const dev = repairResources(b, numbered, group, flags, rng);
      if (bal.hardLimits && dev > 0.12) { dbg('repair'); return false; }
    }
    for (const id of coastNum) if (EXTREME(b.num[id])) b.barb[id] = 1;
    splitPairs(b, numbered);
    Object.assign(b.ba, { arcs, dist, coast: coastNum });
    b.robber = 'none';
    return true;
  }

  function splitPairs(b, ids) {
    for (const id of ids) if (b.num[id] >= 100) { b.extra[id] = b.num[id] % 100; b.num[id] = Math.floor(b.num[id] / 100); }
  }

  // ------------------------------------------------------------------ harbors & fishing grounds
  function harborTouch(b, h) {
    const cs = new Set([...b.grid.verts[h.a].cells, ...b.grid.verts[h.b].cells]);
    return [...cs].filter((id) => isLand(b, id));
  }

  function harborPenalty(b, harbors, types) {
    let pen = 0;
    harbors.forEach((h, k) => {
      const t = types[k];
      const touch = harborTouch(b, h);
      if (!touch.some((id) => PRODUCING.has(b.terr[id]))) pen += 1.5; // harbor nobody can use well
      if (t === 'generic') return;
      for (const id of touch) {
        if (TERRAIN[b.terr[id]] && TERRAIN[b.terr[id]].res === t) {
          const p = pips(b, id);
          if (p >= 5) pen += 2; else if (p >= 4) pen += 1;
        }
      }
    });
    return pen;
  }

  function assignHarborTypes(b, harbors, counts, bal, rng) {
    const types = expand(counts);
    if (types.length !== harbors.length) throw new Error('harbor count mismatch');
    let best = null, bestPen = Infinity;
    const tries = bal.flags.fairHarbors ? 40 : 1;
    for (let t = 0; t < tries; t++) {
      const s = rng.shuffle(types.slice());
      const pen = harborPenalty(b, harbors, s);
      if (pen < bestPen) { bestPen = pen; best = s; }
      if (pen === 0) break;
    }
    harbors.forEach((h, k) => (h.type = best[k]));
    b.harbors = harbors;
  }

  function fishPenalty(b, spots) {
    let pen = 0;
    const g = b.grid;
    for (let k = 0; k < spots.length; k++) {
      const s = spots[k];
      for (const l of s.lands) if (b.num[l] === s.number) pen += 0.5;
      for (let m = k + 1; m < spots.length; m++) {
        const o = spots[m];
        const d = Math.hypot(g.cells[s.cell].x - g.cells[o.cell].x, g.cells[s.cell].y - g.cells[o.cell].y);
        if (d < 3.6 && RED(s.number) && RED(o.number)) pen += 2;
        if (d < 3.6 && WAYS[s.number] >= 4 && WAYS[o.number] >= 4) pen += 0.5;
      }
    }
    return pen;
  }

  function assignFishing(b, spots, nums, bal, rng) {
    if (spots.length !== nums.length) throw new Error('fishing count mismatch');
    let best = null, bestPen = Infinity;
    const tries = bal.firstValid ? 1 : 30;
    for (let t = 0; t < tries; t++) {
      const s = rng.shuffle(nums.slice());
      spots.forEach((sp, k) => (sp.number = s[k]));
      const pen = fishPenalty(b, spots);
      if (pen < bestPen) { bestPen = pen; best = s; }
      if (pen === 0) break;
    }
    spots.forEach((sp, k) => (sp.number = best[k]));
    b.fishing = spots;
  }

  // A fishing ground sits in a sea notch: one water cell touching two neighbouring land hexes.
  // It touches the two coastal edges and their three intersections.
  function makeSpot(b, w, l1, l2) {
    const g = b.grid;
    const e1 = CG.edgeBetween(g, w, l1), e2 = CG.edgeBetween(g, w, l2);
    if (e1 < 0 || e2 < 0) return null;
    const E1 = g.edges[e1], E2 = g.edges[e2];
    const notch = [E1.a, E1.b].find((v) => v === E2.a || v === E2.b);
    if (notch === undefined) return null;
    const o1 = E1.a === notch ? E1.b : E1.a, o2 = E2.a === notch ? E2.b : E2.a;
    return { cell: w, lands: [l1, l2], edges: [e1, e2], verts: [o1, notch, o2], notch };
  }

  // Classic frame: harbors on every second frame position, fishing grounds on the free frame
  // positions that touch two land hexes (6 on the normal board, 7 of 8 on the medium, 8 on the big).
  function frameFeatures(b, info, sc, bal, rng) {
    const g = b.grid;
    const ringIds = CG.sortByAngle(g, g.cells.filter((c) => c.outer).map((c) => c.id), g.cx, g.cy);
    // Harbors sit on every second frame position. Pick the half that keeps harbors away from
    // spots that only touch the desert or the castle (when fairness is on or a castle is in play).
    const dead = [0, 1].map((p) => ringIds.filter((id, k) => k % 2 === p && !g.cells[id].nb.some((n) => info.set.has(n) && PRODUCING.has(b.terr[n]))).length);
    // Fishing grounds go on free frame positions touching two land hexes; on the medium board
    // only one of the two harbor layouts leaves enough of them.
    const fishNums = sc.fish ? fishNumbers(sc, rng) : [];
    const freeSides = (p) => ringIds.filter((id, k) => k % 2 !== p && g.cells[id].nb.filter((n) => info.set.has(n)).length === 2).length;
    // Harbor spots whose only coast edge is a river mouth are avoided too.
    const mouths = new Set(b.rivers.map((r) => r.mouth));
    const onMouth = (p) => ringIds.filter((id, k) => k % 2 === p && g.cells[id].nb.filter((n) => info.set.has(n)).every((l) => mouths.has(CG.edgeBetween(g, id, l)))).length;
    const cost = (p) => onMouth(p) * 10 + (bal.flags.fairHarbors || sc.ba ? dead[p] : 0);
    const ok = [0, 1].filter((p) => freeSides(p) >= fishNums.length);
    let parity = ok.length === 1 ? ok[0] : rng.int(2);
    if (ok.length === 2 && cost(0) !== cost(1)) parity = cost(0) < cost(1) ? 0 : 1;
    const harbors = [];
    const fishCells = [];
    ringIds.forEach((id, k) => {
      const lands = g.cells[id].nb.filter((n) => info.set.has(n));
      if (k % 2 === parity) {
        let opts = lands.map((l) => ({ l, e: CG.edgeBetween(g, id, l) }));
        if (opts.some((o) => !mouths.has(o.e))) opts = opts.filter((o) => !mouths.has(o.e));
        if (bal.flags.fairHarbors) {
          const good = opts.filter((o) => {
            const E = g.edges[o.e];
            const touch = new Set([...g.verts[E.a].cells, ...g.verts[E.b].cells]);
            return [...touch].some((c) => PRODUCING.has(b.terr[c]));
          });
          if (good.length) opts = good;
        }
        const o = rng.pick(opts);
        const E = g.edges[o.e];
        harbors.push({ cell: id, land: o.l, edge: o.e, a: E.a, b: E.b });
      } else if (lands.length === 2) fishCells.push({ id, lands });
    });
    assignHarborTypes(b, harbors, DATA.island[sc.size].harbors, bal, rng);
    if (sc.fish) {
      // Drop surplus free spots (medium board) at random, then deal the numbers.
      const cells = rng.shuffle(fishCells.slice()).slice(0, fishNums.length);
      const spots = fishCells.filter((f) => cells.includes(f)).map((f) => makeSpot(b, f.id, f.lands[0], f.lands[1]));
      assignFishing(b, spots, fishNums, bal, rng);
    }
  }

  function fishNumbers(sc, rng) {
    const F = DATA.fish[sc.size];
    return F.fishingExtra ? [...F.fishing, rng.pick(F.fishingExtra)] : F.fishing.slice();
  }

  function coastEdges(b, islandIds) {
    const g = b.grid;
    const set = new Set(islandIds);
    const out = [];
    for (const id of islandIds)
      for (const e of g.cells[id].edges) {
        const other = g.edges[e].cells.find((c) => c !== id);
        if (other !== undefined && !set.has(other) && isWater(b, other)) out.push({ e, land: id, water: other });
      }
    return out;
  }

  // Seafarers harbors: on any edge between land and sea (or the frame), spread out, at least one
  // per island where possible. alloc = [{ids, count}]
  function placeHarborsGeneric(b, alloc, rng) {
    const g = b.grid;
    const chosen = [];
    const usedV = new Set(), usedW = new Set();
    const mid = (e) => ({ x: (g.verts[g.edges[e].a].x + g.verts[g.edges[e].b].x) / 2, y: (g.verts[g.edges[e].a].y + g.verts[g.edges[e].b].y) / 2 });
    const mouths = new Set(b.rivers.map((r) => r.mouth));
    for (const a of alloc) {
      const cands = rng.shuffle(coastEdges(b, a.ids).filter((c) => !mouths.has(c.e))).filter((c) => PRODUCING.has(b.terr[c.land]) || !a.ids.some((id) => PRODUCING.has(b.terr[id])));
      let got = 0;
      for (const minD of [2.6, 1.8, 1.2, 0]) {
        for (const c of cands) {
          if (got >= a.count) break;
          const E = g.edges[c.e];
          if (usedV.has(E.a) || usedV.has(E.b) || usedW.has(c.water)) continue;
          const m = mid(c.e);
          if (chosen.some((h) => { const n = mid(h.edge); return Math.hypot(n.x - m.x, n.y - m.y) < minD; })) continue;
          chosen.push({ cell: c.water, land: c.land, edge: c.e, a: E.a, b: E.b });
          usedV.add(E.a); usedV.add(E.b); usedW.add(c.water);
          got++;
        }
        if (got >= a.count) break;
      }
      if (got < a.count) return null;
    }
    return chosen;
  }

  // Splits `count` harbors over islands: one for every island of 2+ hexes, the rest by coastline.
  function allocateHarbors(b, islands, count) {
    const list = islands.map((ids) => ({ ids, count: 0, coast: coastEdges(b, ids).length })).sort((p, q) => q.ids.length - p.ids.length);
    let left = count;
    for (const it of list) if (left > 0 && it.ids.length >= 2) { it.count = 1; left--; }
    const total = list.reduce((s, it) => s + it.coast, 0) || 1;
    while (left > 0) {
      let best = list[0], bestGap = -Infinity;
      for (const it of list) {
        const gap = (it.coast / total) * count - it.count - (it.ids.length < 2 ? 1 : 0);
        if (gap > bestGap) { bestGap = gap; best = it; }
      }
      best.count++;
      left--;
    }
    return list.filter((it) => it.count > 0);
  }

  function fishingCandidates(b, targetSet) {
    const g = b.grid;
    const harborEdges = new Set(b.harbors.map((h) => h.edge));
    const out = [];
    const waters = new Set();
    for (const id of targetSet) for (const n of g.cells[id].nb) if (isWater(b, n)) waters.add(n);
    for (const w of waters) {
      const lands = g.cells[w].nb.filter((n) => targetSet.has(n));
      for (let x = 0; x < lands.length; x++)
        for (let y = x + 1; y < lands.length; y++) {
          if (!g.cells[lands[x]].nb.includes(lands[y])) continue;
          const s = makeSpot(b, w, lands[x], lands[y]);
          if (!s || harborEdges.has(s.edges[0]) || harborEdges.has(s.edges[1])) continue;
          const vs = s.verts.map((v) => g.verts[v]);
          s.x = (vs[0].x + vs[1].x + vs[2].x) / 3;
          s.y = (vs[0].y + vs[1].y + vs[2].y) / 3;
          out.push(s);
        }
    }
    return out;
  }

  const spotsClash = (s, o) => s.cell === o.cell || s.edges.some((e) => o.edges.includes(e));

  // Picks `count` fishing spots spread around a centre (one per angular sector), or spread as far
  // apart as possible when no centre is given.
  function chooseFishing(b, cands, count, rng, center) {
    if (cands.length < count) return null;
    const chosen = [];
    if (center) {
      const ang = (s) => Math.atan2(s.y - center.y, s.x - center.x);
      const off = rng.next() * 2 * Math.PI / count;
      for (let k = 0; k < count; k++) {
        const lo = -Math.PI + off + (k * 2 * Math.PI) / count, hi = lo + (2 * Math.PI) / count;
        const inSector = rng.shuffle(cands.filter((s) => {
          let a = ang(s);
          while (a < lo) a += 2 * Math.PI;
          return a < hi && !chosen.some((o) => spotsClash(s, o));
        }));
        if (inSector.length) chosen.push(inSector[0]);
      }
    }
    while (chosen.length < count) {
      const free = cands.filter((s) => !chosen.some((o) => spotsClash(s, o)));
      if (!free.length) return null;
      if (!chosen.length) { chosen.push(rng.pick(free)); continue; }
      let best = null, bestD = -1;
      for (const s of free) {
        const d = Math.min(...chosen.map((o) => Math.hypot(s.x - o.x, s.y - o.y))) + rng.next() * 0.8;
        if (d > bestD) { bestD = d; best = s; }
      }
      chosen.push(best);
    }
    return chosen;
  }

  // ------------------------------------------------------------------ islands (Seafarers)
  function partition(total, k, min, max, rng) {
    const sizes = new Array(k).fill(min);
    let rest = total - k * min;
    const w = sizes.map(() => 0.4 + rng.next());
    let guard = 0;
    while (rest > 0 && guard++ < 10000) {
      let r = rng.next() * w.reduce((a, c) => a + c, 0);
      let idx = 0;
      while (r > w[idx]) { r -= w[idx]; idx++; }
      if (sizes[idx] < max) { sizes[idx]++; rest--; }
    }
    return rest > 0 ? null : sizes;
  }

  // Grows k separate islands (at least one sea hex between islands) inside `avail`.
  function growIslands(grid, avail, sizes, rng, minSeedDist) {
    const availSet = new Set(avail);
    const owner = new Map();
    const islands = [];
    const first = rng.pick(avail);
    owner.set(first, 0);
    islands.push([first]);
    while (islands.length < sizes.length) {
      const scored = avail.filter((id) => !owner.has(id)).map((id) => ({
        id, d: Math.min(...islands.map((isl) => CG.hexDist(grid.cells[isl[0]], grid.cells[id]))) + rng.next() * 1.5,
      })).filter((o) => o.d >= minSeedDist).sort((p, q) => q.d - p.d);
      if (!scored.length) return null;
      const pick = scored[rng.int(Math.min(3, scored.length))].id;
      owner.set(pick, islands.length);
      islands.push([pick]);
    }
    const blocked = (id, k) => grid.cells[id].nb.some((n) => owner.has(n) && owner.get(n) !== k);
    // Cells two steps from another island are allowed but less likely, so islands keep room.
    const crowded = (id, k) => grid.cells[id].nb.some((n) => grid.cells[n].nb.some((m) => owner.has(m) && owner.get(m) !== k));
    let guard = 0;
    while (guard++ < 400) {
      const open = rng.shuffle(islands.map((_, k) => k).filter((k) => islands[k].length < sizes[k]));
      if (!open.length) return islands;
      for (const k of open) {
        const front = new Map();
        for (const id of islands[k])
          for (const n of grid.cells[id].nb)
            if (availSet.has(n) && !owner.has(n) && !blocked(n, k)) front.set(n, (front.get(n) || 0) + 1);
        if (!front.size) return null;
        const opts = [...front.entries()].map(([id, c]) => [id, c * c * (crowded(id, k) ? 0.25 : 1)]);
        let r = rng.next() * opts.reduce((s2, [, w]) => s2 + w, 0);
        let pick = opts[0][0];
        for (const [id, w] of opts) { r -= w; if (r <= 0) { pick = id; break; } }
        owner.set(pick, k);
        islands[k].push(pick);
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ builders
  function buildIsland(sc, bal, rng) {
    const grid = cached('island-' + sc.size, () => CG.buildGrid(CG.shapeFor(sc.size)));
    const b = newBoard(sc, grid);
    const info = cached('island-info-' + sc.size, () => mainInfo(grid, grid.inner));
    if (!buildMain(b, info, sc, bal, rng)) return null;
    frameFeatures(b, info, sc, bal, rng);
    b.islands = [info.ids];
    return b;
  }

  function buildNewWorld(sc, bal, rng) {
    const D = DATA.newworld[sc.size];
    const grid = cached('nw-' + sc.size, () => CG.buildGrid(CG.shapeRect(D.rows, D.cols)));
    const b = newBoard(sc, grid);
    const flags = bal.flags;
    const landTotal = sum(D.land);
    let landIds;
    if (bal.islands === 'random') {
      landIds = rng.shuffle(grid.inner.slice()).slice(0, landTotal);
    } else {
      // Try the chosen number of islands; if they do not fit, try one island fewer.
      let isl = null;
      for (let k = D.islandCount[0] + rng.int(D.islandCount[1] - D.islandCount[0] + 1); k >= D.islandCount[0] && !isl; k--)
        for (let t = 0; t < 3 && !isl; t++) {
          const sizes = partition(landTotal, k, D.minIsland, Math.ceil(landTotal * 0.42), rng);
          isl = sizes && growIslands(grid, grid.inner, sizes, rng, 3);
        }
      if (!isl) { dbg('grow'); return null; }
      landIds = isl.flat();
    }
    const landSet = new Set(landIds);
    for (const id of grid.inner) if (!landSet.has(id)) b.terr[id] = 'sea';
    const pool = CG.countMap(expand(D.land));
    if (!terrainCSP(b, landIds, () => pool, { sameTerrain: flags.sameTerrain, spreadDeserts: !bal.firstValid, spreadGold: !bal.firstValid }, rng)) return null;
    const numbered = landIds.filter((id) => PRODUCING.has(b.terr[id]));
    if (numbered.length !== D.tokens.length) throw new Error('New World token count mismatch');
    const np = CG.countMap(D.tokens);
    if (!numberCSP(b, numbered, () => np, flags, rng)) return null;
    if (flags.resourceBalance && !bal.firstValid) {
      const dev = repairResources(b, numbered, () => 0, flags, rng);
      if (bal.hardLimits && dev > 0.12) return null;
    }
    b.islands = CG.components(grid, landSet).sort((p, q) => q.length - p.length);
    const alloc = allocateHarbors(b, b.islands, sum(D.harbors));
    const harbors = placeHarborsGeneric(b, alloc, rng);
    if (!harbors) { dbg('harbors'); return null; }
    assignHarborTypes(b, harbors, D.harbors, bal, rng);
    if (sc.fish) {
      const nums = fishNumbers(sc, rng);
      const spots = chooseFishing(b, fishingCandidates(b, landSet), nums.length, rng, null);
      if (!spots) { dbg('fishing'); return null; }
      assignFishing(b, spots, nums, bal, rng);
    }
    b.robber = 'frame';
    b.pirate = 'frame';
    return b;
  }

  function buildHfns(sc, bal, rng) {
    const D = DATA.hfns[sc.size];
    const geo = cached('hfns-' + sc.size, () => {
      const rect = CG.shapeRect(D.rows, D.cols);
      const grid = CG.buildGrid(rect);
      const main = CG.translate(CG.shapeFor(sc.size), D.mainShift[0], D.mainShift[1]);
      const mainIds = main.map((p) => {
        const c = grid.byKey.get(CG.key(p.i, p.j));
        if (!c || c.outer) throw new Error('main island outside frame');
        return c.id;
      });
      const info = mainInfo(grid, mainIds);
      const avail = grid.inner.filter((id) => !info.set.has(id) && !grid.cells[id].nb.some((n) => info.set.has(n)));
      return { grid, info, avail };
    });
    const { grid, info, avail } = geo;
    const b = newBoard(sc, grid);
    if (!buildMain(b, info, sc, bal, rng)) return null;
    const smallTotal = sum(D.smallLand);
    const sizes = partition(smallTotal, D.smallIslands, 1, 3, rng);
    const isl = sizes && growIslands(grid, avail, sizes, rng, 3);
    if (!isl) { dbg('grow-small'); return null; }
    const smallIds = isl.flat();
    const smallSet = new Set(smallIds);
    for (const id of grid.inner) if (!info.set.has(id) && !smallSet.has(id)) b.terr[id] = 'sea';
    const flags = bal.flags;
    const pool = CG.countMap(expand(D.smallLand));
    if (!terrainCSP(b, smallIds, () => pool, { sameTerrain: flags.sameTerrain, spreadGold: !bal.firstValid }, rng)) return null;
    const np = CG.countMap(D.smallTokens);
    if (!numberCSP(b, smallIds, () => np, flags, rng)) return null;
    b.smallIslands = isl;
    b.islands = [info.ids, ...isl];
    const total = sum(D.harbors);
    const smallAlloc = isl.slice().sort((p, q) => q.length - p.length).slice(0, D.smallHarbors).map((ids) => ({ ids, count: 1 }));
    const harbors = placeHarborsGeneric(b, [{ ids: info.ids, count: total - smallAlloc.length }, ...smallAlloc], rng);
    if (!harbors) return null;
    assignHarborTypes(b, harbors, D.harbors, bal, rng);
    if (sc.fish) {
      const nums = fishNumbers(sc, rng);
      const spots = chooseFishing(b, fishingCandidates(b, info.set), nums.length, rng, { x: info.cx, y: info.cy });
      if (!spots) return null;
      assignFishing(b, spots, nums, bal, rng);
    }
    if (sc.pirate === 'sea') {
      const open = grid.inner.filter((id) => b.terr[id] === 'sea' && !grid.cells[id].nb.some((n) => isLand(b, n)));
      const seas = open.length ? open : grid.inner.filter((id) => b.terr[id] === 'sea');
      b.pirate = rng.pick(seas);
    } else b.pirate = sc.pirate;
    return b;
  }

  // ------------------------------------------------------------------ fairness evaluation
  function evaluate(b, bal) {
    const g = b.grid;
    const flags = bal.flags;
    const land = g.inner.filter((id) => isLand(b, id));
    const prod = land.filter((id) => PRODUCING.has(b.terr[id]) && b.num[id]);
    const m = {};

    // Production per resource vs. its share of hexes.
    const res = {};
    for (const t of CG.RESOURCE_TERRAINS) res[t] = { count: 0, pips: 0 };
    for (const id of prod) if (res[b.terr[id]]) { res[b.terr[id]].count++; res[b.terr[id]].pips += pips(b, id); }
    const rc = Object.values(res).reduce((s, r) => s + r.count, 0);
    const rp = Object.values(res).reduce((s, r) => s + r.pips, 0);
    const mean = rp / Math.max(1, rc);
    let devSum = 0;
    for (const t of CG.RESOURCE_TERRAINS) {
      res[t].expected = res[t].count * mean;
      devSum += Math.abs(res[t].pips - res[t].expected);
    }
    m.res = res;
    m.resDev = devSum / Math.max(1, rp);

    // Intersection values (dots of the touching number tokens).
    let maxV = 0, hot = 0, hotCount = 0;
    const vval = new Array(g.verts.length).fill(0);
    const fishAt = new Array(g.verts.length).fill(0);
    for (const s of b.fishing) for (const v of s.verts) fishAt[v] += WAYS[s.number];
    for (const v of g.verts) {
      let val = 0, any = false, lakeP = 0;
      for (const c of v.cells) {
        if (!isLand(b, c)) continue;
        any = true;
        val += pips(b, c);
        if (b.lakeNums[c]) lakeP += b.lakeNums[c].reduce((s, n) => s + WAYS[n], 0);
      }
      if (!any) continue;
      vval[v.id] = val;
      if (val > maxV) maxV = val;
      if (val >= 12) hotCount++;
      hot += Math.max(0, val - 10) + Math.max(0, val + 0.5 * (fishAt[v.id] + lakeP) - 13) * 0.5;
    }
    m.vval = vval;
    m.maxV = maxV;
    m.hotCount = hotCount;

    // Spread: how even the neighbourhood strength is across the land.
    const local = prod.map((id) => {
      let s = pips(b, id), n = 1;
      for (const nb of g.cells[id].nb) if (PRODUCING.has(b.terr[nb]) && b.num[nb]) { s += pips(b, nb); n++; }
      return s / n;
    });
    const lm = local.reduce((a, c) => a + c, 0) / Math.max(1, local.length);
    const lv = local.reduce((a, c) => a + (c - lm) * (c - lm), 0) / Math.max(1, local.length);
    m.spread = Math.sqrt(lv) / Math.max(0.01, lm);

    // Pair counts.
    let highAdj = 0, sameT = 0, redAdj = 0, extAdj = 0, sameN = 0;
    for (const id of land)
      for (const nb of g.cells[id].nb) {
        if (nb < id || !isLand(b, nb)) continue;
        const t1 = b.terr[id], t2 = b.terr[nb];
        if (t1 === t2 && CG.PRODUCING.has(t1) && !b.rivers.some((r) => r.cells.includes(id) && r.cells.includes(nb))) sameT++;
        const a = tokenOf(b, id), c = tokenOf(b, nb);
        if (!a || !c) continue;
        if (ways(a) >= 4 && ways(c) >= 4) highAdj++;
        if (RED(a) && RED(c)) redAdj++;
        if (EXTREME(a) && EXTREME(c)) extAdj++;
        if (sameNum(a, c)) sameN++;
      }
    Object.assign(m, { highAdj, sameT, redAdj, extAdj, sameN });

    m.harborPen = harborPenalty(b, b.harbors, b.harbors.map((h) => h.type));
    m.harborDead = b.harbors.filter((h) => !harborTouch(b, h).some((id) => PRODUCING.has(b.terr[id]))).length;
    m.harborSyn = m.harborPen - 1.5 * m.harborDead;
    m.fishPen = b.fishing.length ? fishPenalty(b, b.fishing) : 0;

    // Barbarian Attack: landing threat per coast arc.
    if (b.ba) {
      const arcs = b.ba.arcs;
      const T = arcs.map((a) => a.reduce((s, id) => s + pips(b, id), 0));
      const Dw = arcs.map((a) => a.reduce((s, id) => s + pips(b, id) * b.ba.dist[id], 0));
      const tt = T.reduce((a, c) => a + c, 0), dt = Dw.reduce((a, c) => a + c, 0);
      m.arcThreat = T;
      m.arcThreatTotal = tt;
      m.arcDev = T.reduce((s, x) => s + Math.abs(x - tt / arcs.length), 0) / tt;
      m.arcDistDev = Dw.reduce((s, x) => s + Math.abs(x - dt / arcs.length), 0) / dt;
      const arcOf = {};
      arcs.forEach((a, k) => a.forEach((id) => (arcOf[id] = k)));
      let dup = 0;
      for (const n of [5, 9]) {
        const where = b.ba.coast.filter((id) => b.num[id] === n).map((id) => arcOf[id]);
        if (where.length === 2) {
          const d = Math.abs(where[0] - where[1]);
          const cyc = Math.min(d, arcs.length - d);
          if (cyc === 0) dup += 1; else if (cyc === 1 && arcs.length > 2) dup += 0.3;
        }
      }
      const seeds = Object.keys(b.barb).map((id) => arcOf[id]);
      m.dupSameArc = dup;
      m.seedSameArc = seeds.length === 2 && seeds[0] === seeds[1] ? 1 : 0;
    }

    // Seafarers: avoid one island holding most of one resource.
    if (b.islands && b.islands.length > 1 && b.sc.layout === 'newworld') {
      let conc = 0;
      const landN = land.length;
      for (const t of CG.RESOURCE_TERRAINS) {
        const all = land.filter((id) => b.terr[id] === t).length;
        if (!all) continue;
        for (const isl of b.islands) {
          const share = isl.filter((id) => b.terr[id] === t).length / all;
          conc += Math.max(0, share - (isl.length / landN + 0.25));
        }
      }
      m.islandConc = conc;
    }

    // Hard limits.
    const fail = [];
    if (flags.redAdj && redAdj) fail.push('red');
    if (flags.capHotspots && maxV > 11) fail.push('hotspot');
    if (bal.hardLimits) {
      if (flags.resourceBalance && m.resDev > 0.12) fail.push('resources');
      if (flags.fairHarbors && m.harborSyn > 0) fail.push('harbors');
      if (b.ba && flags.baThreat && (m.arcDev > 0.1 || m.dupSameArc >= 1)) fail.push('barbarians');
    }

    let score = 0;
    if (flags.resourceBalance) score += 6 * m.resDev;
    if (flags.spread) score += 3 * m.spread + 0.12 * highAdj;
    if (flags.spread || flags.capHotspots) score += 0.4 * hot;
    if (!flags.sameTerrain && (flags.spread || flags.resourceBalance)) score += 0.15 * sameT;
    if (flags.fairHarbors) score += 0.5 * m.harborPen;
    if (b.ba && flags.baThreat) score += 8 * m.arcDev + 3 * m.arcDistDev + m.dupSameArc + 0.5 * m.seedSameArc;
    if (b.fishing.length && !bal.firstValid) score += 0.3 * m.fishPen;
    if (m.islandConc !== undefined && flags.resourceBalance) score += 2 * m.islandConc;
    m.score = score;
    m.fail = fail;
    return m;
  }

  // Chance that a number comes up in one barbarian attack (3 rolls, 7s and repeats re-rolled).
  CG.landingOdds = (function () {
    const nums = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
    const p = {};
    nums.forEach((n) => (p[n] = 0));
    for (const a of nums) for (const c of nums) for (const d of nums) {
      if (a === c || a === d || c === d) continue;
      const pr = (WAYS[a] / 30) * (WAYS[c] / (30 - WAYS[a])) * (WAYS[d] / (30 - WAYS[a] - WAYS[c]));
      p[a] += pr; p[c] += pr; p[d] += pr;
    }
    return p;
  })();

  // ------------------------------------------------------------------ public entry point
  function builderFor(sc) {
    if (sc.layout === 'newworld') return buildNewWorld;
    if (sc.layout === 'hfns') return buildHfns;
    return buildIsland;
  }

  function run(sc, bal, rng, wanted, maxAttempts) {
    const build = builderFor(sc);
    let best = null, valid = 0, attempts = 0;
    while (valid < wanted && attempts < maxAttempts) {
      attempts++;
      const b = build(sc, bal, rng);
      if (!b) continue;
      const ev = evaluate(b, bal);
      if (ev.fail.length) continue;
      valid++;
      if (!best || ev.score < best.ev.score) best = { b, ev };
    }
    return { best, valid, attempts };
  }

  CG.generate = function (options, seed) {
    const sc = CG.resolveScenario(options);
    const bal = CG.resolveBalance(options);
    const rng = CG.makeRng(seed);
    const wanted = bal.firstValid ? 1 : Math.round(bal.candidates * (sc.big ? 0.6 : sc.medium ? 0.8 : 1));
    let r = run(sc, bal, rng, wanted, Math.max(wanted * 8, 80));
    let relaxed = false;
    if (!r.best) {
      // Strict limits could not be met: keep the rules and the soft scoring, drop the hard limits.
      relaxed = true;
      const bal2 = Object.assign({}, bal, { hardLimits: false, flags: Object.assign({}, bal.flags, { capHotspots: false, sameTerrain: false }) });
      r = run(sc, bal2, rng, 40, 400);
    }
    if (!r.best) throw new Error('Could not build a board for this setup.');
    const b = r.best.b;
    b.ev = r.best.ev;
    b.meta = { seed, valid: r.valid, attempts: r.attempts, relaxed, bal };
    return b;
  };

  CG._internal = { evaluate, expand, isLand, isWater, harborTouch, buildIsland, buildNewWorld, buildHfns };
})(typeof globalThis !== 'undefined' ? globalThis : window);
