/* Catan board generator — core helpers: seeded random numbers, hex geometry, constraint solver.
 * Plain script (no modules) so the site runs from any static host, including GitHub Pages.
 * Everything is attached to the global CG object. */
(function (G) {
  'use strict';
  const CG = G.CG || (G.CG = {});

  // ---------------------------------------------------------------- random numbers
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const next = mulberry32(seed);
    return {
      next,
      int: (n) => Math.floor(next() * n),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
    };
  }

  function randomSeed() {
    try {
      const c = G.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null);
      if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
    } catch (e) { /* fall through */ }
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }

  // Seeds are shown as short codes, e.g. "K3P9Q".
  const seedToCode = (s) => (s >>> 0).toString(36).toUpperCase();
  const codeToSeed = (c) => {
    const n = parseInt(String(c || '').trim().toLowerCase(), 36);
    return Number.isFinite(n) ? (n >>> 0) : null;
  };

  // ---------------------------------------------------------------- hex geometry
  // Pointy-top hexes with circumradius 1. Cells use "doubled" lattice coordinates (i, j):
  //   x = i * sqrt(3)/2, y = j * 1.5, and i + j is always even.
  const SQ3 = Math.sqrt(3);
  const NB = [[2, 0], [1, 1], [-1, 1], [-2, 0], [-1, -1], [1, -1]];
  // Corner k of a cell at (i, j) is at vertex lattice (i + dx, 3j + dy): x = vi*sqrt3/2, y = vj/2.
  const CORNER = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
  const key = (i, j) => i + ',' + j;
  const even = (n) => (n & 1) === 0;

  function hexDist(a, b) {
    const dq = (a.i - a.j) / 2 - (b.i - b.j) / 2;
    const dr = a.j - b.j;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  // Standard 3-4 player island: rows 3-4-5-4-3 (19 hexes).
  function shapeHex19() {
    const out = [];
    for (let j = -2; j <= 2; j++)
      for (let i = -4; i <= 4; i++)
        if (even(i + j) && Math.abs(i) <= 4 - Math.abs(j)) out.push({ i, j });
    return out;
  }

  // 5-6 player island: rows 3-4-5-6-5-4-3 (30 hexes).
  function shapeHex30() {
    const out = [];
    for (let j = -3; j <= 3; j++)
      for (let i = -6; i <= 8; i++)
        if (even(i + j) && Math.abs(i - 1) <= 5 - Math.abs(j)) out.push({ i, j });
    return out;
  }

  // Medium island (house setup): rows 4-5-6-5-4 (24 hexes) — the 5-6 board without its
  // top and bottom rows of 3.
  function shapeHex24() {
    return shapeHex30().filter((p) => Math.abs(p.j) <= 2);
  }

  const shapeFor = (size) => (size === 'big' ? shapeHex30() : size === 'medium' ? shapeHex24() : shapeHex19());

  // Rectangle of R rows x C columns (odd rows shifted right), used for Seafarers frames.
  function shapeRect(R, C) {
    const out = [];
    for (let j = 0; j < R; j++)
      for (let c = 0; c < C; c++) out.push({ i: 2 * c + (j & 1), j });
    return out;
  }

  function translate(shape, ti, tj) {
    if (!even(ti + tj)) throw new Error('translation must keep i+j even');
    return shape.map((p) => ({ i: p.i + ti, j: p.j + tj }));
  }

  // Builds cells, vertices and edges. `coords` are the cells inside the frame; one ring of
  // "outer" cells (the frame / open sea around the board) is added automatically.
  function buildGrid(coords) {
    const cells = [];
    const byKey = new Map();
    const add = (i, j, outer) => {
      const c = { id: cells.length, i, j, key: key(i, j), x: i * SQ3 / 2, y: j * 1.5, outer, nb: [], verts: [], edges: [] };
      cells.push(c);
      byKey.set(c.key, c);
      return c;
    };
    coords.forEach((p) => add(p.i, p.j, false));
    const innerCount = cells.length;
    for (let n = 0; n < innerCount; n++) {
      const c = cells[n];
      for (const [di, dj] of NB) if (!byKey.has(key(c.i + di, c.j + dj))) add(c.i + di, c.j + dj, true);
    }
    for (const c of cells)
      for (const [di, dj] of NB) {
        const n = byKey.get(key(c.i + di, c.j + dj));
        if (n) c.nb.push(n.id);
      }

    const verts = [];
    const vByKey = new Map();
    const edges = [];
    const eByKey = new Map();
    for (const c of cells) {
      c.verts = CORNER.map(([dx, dy]) => {
        const vi = c.i + dx, vj = 3 * c.j + dy, kk = key(vi, vj);
        let v = vByKey.get(kk);
        if (!v) {
          v = { id: verts.length, key: kk, x: vi * SQ3 / 2, y: vj * 0.5, cells: [], edges: [], nbv: [] };
          verts.push(v);
          vByKey.set(kk, v);
        }
        v.cells.push(c.id);
        return v.id;
      });
      for (let k = 0; k < 6; k++) {
        const a = Math.min(c.verts[k], c.verts[(k + 1) % 6]);
        const b = Math.max(c.verts[k], c.verts[(k + 1) % 6]);
        const kk = a + '-' + b;
        let e = eByKey.get(kk);
        if (!e) {
          e = { id: edges.length, key: kk, a, b, cells: [] };
          edges.push(e);
          eByKey.set(kk, e);
          verts[a].edges.push(e.id); verts[b].edges.push(e.id);
          verts[a].nbv.push(b); verts[b].nbv.push(a);
        }
        e.cells.push(c.id);
        c.edges.push(e.id);
      }
    }
    const inner = cells.filter((c) => !c.outer);
    const cx = inner.reduce((s, c) => s + c.x, 0) / inner.length;
    const cy = inner.reduce((s, c) => s + c.y, 0) / inner.length;
    return { cells, byKey, verts, edges, eByKey, inner: inner.map((c) => c.id), cx, cy };
  }

  function edgeBetween(grid, a, b) {
    const ea = grid.cells[a].edges, eb = grid.cells[b].edges;
    for (const e of ea) if (eb.indexOf(e) >= 0) return e;
    return -1;
  }

  // Cells sorted around a centre point (cyclic order for rings).
  function sortByAngle(grid, ids, cx, cy) {
    return ids.slice().sort((p, q) => {
      const a = grid.cells[p], b = grid.cells[q];
      return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
    });
  }

  // Connected components of a set of cell ids (adjacency inside the set).
  function components(grid, idSet) {
    const seen = new Set();
    const out = [];
    for (const start of idSet) {
      if (seen.has(start)) continue;
      const comp = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const c = stack.pop();
        comp.push(c);
        for (const n of grid.cells[c].nb) if (idSet.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
      out.push(comp);
    }
    return out;
  }

  // ---------------------------------------------------------------- constraint solver
  // Depth-first search with shuffled values. `poolOf(v)` returns a Map value->count shared by
  // all variables that draw from the same supply; `ok(v, value, assign)` checks the constraints.
  function solve(vars, poolOf, ok, rng, maxSteps) {
    const assign = new Map();
    let steps = 0;
    const limit = maxSteps || 4000;
    function rec(idx) {
      if (idx === vars.length) return true;
      if (++steps > limit) return false;
      const v = vars[idx];
      const pool = poolOf(v);
      const vals = [];
      for (const [val, n] of pool) if (n > 0) vals.push(val);
      rng.shuffle(vals);
      for (const val of vals) {
        if (!ok(v, val, assign)) continue;
        assign.set(v, val);
        pool.set(val, pool.get(val) - 1);
        if (rec(idx + 1)) return true;
        assign.delete(v);
        pool.set(val, pool.get(val) + 1);
        if (steps > limit) return false;
      }
      return false;
    }
    return rec(0) ? assign : null;
  }

  function countMap(arr) {
    const m = new Map();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return m;
  }

  // Order cells so that each cell comes next to already-placed ones (finds conflicts early).
  function bfsOrder(grid, ids, rng) {
    const set = new Set(ids);
    const order = [];
    const seen = new Set();
    const starts = rng.shuffle(ids.slice());
    for (const s of starts) {
      if (seen.has(s)) continue;
      const queue = [s];
      seen.add(s);
      while (queue.length) {
        const c = queue.shift();
        order.push(c);
        const nbs = rng.shuffle(grid.cells[c].nb.filter((n) => set.has(n) && !seen.has(n)));
        for (const n of nbs) { seen.add(n); queue.push(n); }
      }
    }
    return order;
  }

  Object.assign(CG, {
    makeRng, randomSeed, seedToCode, codeToSeed,
    SQ3, NB, CORNER, key, hexDist,
    shapeHex19, shapeHex24, shapeHex30, shapeFor, shapeRect, translate, buildGrid, edgeBetween, sortByAngle, components,
    solve, countMap, bfsOrder,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
