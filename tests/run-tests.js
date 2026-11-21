/* Rule checks for every supported setup. Run: node tests/run-tests.js [boardsPerConfig]
 * Loads the browser scripts into a sandbox, generates many boards per configuration and
 * verifies component counts and every rule the generator claims to follow. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console, Math, Date, Error, Map, Set, Uint32Array, require };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['core.js', 'rules.js', 'generator.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), sandbox, { filename: f });
const CG = sandbox.CG;

const N = parseInt(process.argv[2] || '60', 10);
const SHARDS = parseInt(process.argv[3] || '1', 10), SHARD = parseInt(process.argv[4] || '0', 10);
const FILTER = process.argv[5] || '';
const WAYS = CG.WAYS;
const RED = (n) => n === 6 || n === 8;
const EXT = (n) => n === 2 || n === 12;
let failures = 0;
const fail = (cfg, msg) => { failures++; if (failures < 40) console.log('  FAIL [' + cfg + '] ' + msg); };

const tally = (arr) => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
const same = (a, b) => JSON.stringify(Object.entries(a).filter(([, v]) => v).sort()) === JSON.stringify(Object.entries(b).filter(([, v]) => v).sort());
const sortNum = (a) => a.slice().sort((x, y) => x - y);

function check(opts, b, label) {
  const sc = b.sc, g = b.grid, D = CG.DATA;
  const bal = b.meta.bal;
  const land = g.inner.filter((id) => b.terr[id] && b.terr[id] !== 'sea');
  const isLand = (id) => !g.cells[id].outer && b.terr[id] && b.terr[id] !== 'sea';

  // --- universal number rules
  for (const id of land) for (const n of g.cells[id].nb) {
    if (!isLand(n) || n < id) continue;
    const a = b.num[id], c = b.num[n];
    if (!a || !c) continue;
    if (bal.flags.redAdj && RED(a) && RED(c)) fail(label, '6/8 adjacent');
    if (!b.meta.relaxed && bal.flags.extremeAdj && EXT(a) && EXT(c)) fail(label, '2/12 adjacent');
    if (!b.meta.relaxed && bal.flags.sameNumAdj && a === c) fail(label, 'same numbers adjacent');
    if (!b.meta.relaxed && bal.flags.sameTerrain && b.terr[id] === b.terr[n] && !(b.rivers || []).some((r) => r.cells.includes(id) && r.cells.includes(n))) fail(label, 'same terrain adjacent');
  }
  for (const id of land) {
    const t = b.terr[id];
    const shouldNum = CG.PRODUCING.has(t);
    if (shouldNum && !b.num[id]) fail(label, 'producing hex without number ' + t);
    if (!shouldNum && b.num[id]) fail(label, 'non-producing hex with number ' + t);
    if (bal.flags.goldNoRed && t === 'gold' && RED(b.num[id])) fail(label, 'gold with 6/8');
  }
  if (!b.meta.relaxed && bal.flags.capHotspots && b.ev.maxV > 11) fail(label, 'hotspot ' + b.ev.maxV);

  // --- harbors: on a land/water edge, no shared corners, right mix
  const hv = new Set();
  for (const h of b.harbors) {
    const e = g.edges[h.edge];
    const cs = e.cells;
    if (!cs.includes(h.cell) || !cs.includes(h.land)) fail(label, 'harbor edge mismatch');
    if (!isLand(h.land)) fail(label, 'harbor not on land');
    if (isLand(h.cell)) fail(label, 'harbor water cell is land');
    for (const v of [e.a, e.b]) { if (hv.has(v)) fail(label, 'harbors share an intersection'); hv.add(v); }
  }
  const hcount = sc.layout === 'island' ? D.island[sc.size].harbors : sc.layout === 'newworld' ? D.newworld[sc.size].harbors : D.hfns[sc.size].harbors;
  if (!same(tally(b.harbors.map((h) => h.type)), hcount)) fail(label, 'harbor mix ' + JSON.stringify(tally(b.harbors.map((h) => h.type))));

  // --- fishing grounds
  if (sc.fish) {
    const F = D.fish[sc.size];
    const got = JSON.stringify(sortNum(b.fishing.map((f) => f.number)));
    const options = F.fishingExtra ? F.fishingExtra.map((x) => JSON.stringify(sortNum([...F.fishing, x]))) : [JSON.stringify(sortNum(F.fishing))];
    if (!options.includes(got)) fail(label, 'fishing numbers ' + got);
    const hedges = new Set(b.harbors.map((h) => h.edge));
    for (const f of b.fishing) {
      if (isLand(f.cell)) fail(label, 'fishing on land');
      if (f.lands.some((l) => !isLand(l))) fail(label, 'fishing not touching land');
      if (f.edges.some((e) => hedges.has(e))) fail(label, 'fishing on a harbor edge');
    }
    const lakes = land.filter((id) => b.terr[id] === 'lake');
    if (sc.lake && lakes.length !== D.fish[sc.size].lakes.length) fail(label, 'lake count');
    if (!sc.lake && lakes.length) fail(label, 'lake present but not allowed');
    if (sc.robber === 'beside' && b.robber !== 'beside') fail(label, 'robber should be beside the board');
  } else if (b.fishing.length) fail(label, 'fishing without Fishermen');

  // --- main island (normal boards and the Heading for New Shores main island)
  if (sc.layout === 'island' || sc.layout === 'hfns') checkMain(b, label, land);
  if (sc.layout === 'island') {
    const ring = g.cells.filter((c) => c.outer).length;
    if (ring !== ({ small: 18, medium: 20, big: 22 })[sc.size]) fail(label, 'frame ring ' + ring);
  }
  if (sc.layout === 'newworld') {
    const N = D.newworld[sc.size];
    if (!same(tally(land.map((id) => b.terr[id])), N.land)) fail(label, 'NW land mix');
    if (JSON.stringify(sortNum(land.filter((id) => b.num[id]).map((id) => b.num[id]))) !== JSON.stringify(sortNum(N.tokens))) fail(label, 'NW tokens');
    const sea = g.inner.filter((id) => b.terr[id] === 'sea').length;
    if (sea + land.length !== N.rows * N.cols) fail(label, 'NW frame size');
    if (bal.islands === 'balanced') {
      if (b.islands.length < N.islandCount[0] || b.islands.length > N.islandCount[1]) fail(label, 'NW island count ' + b.islands.length);
      if (Math.min(...b.islands.map((i) => i.length)) < N.minIsland) fail(label, 'NW tiny island');
    }
  }
  if (sc.layout === 'hfns') {
    const H = D.hfns[sc.size];
    const small = b.smallIslands.flat();
    if (!same(tally(small.map((id) => b.terr[id])), H.smallLand)) fail(label, 'HfNS small land');
    if (JSON.stringify(sortNum(small.map((id) => b.num[id]))) !== JSON.stringify(sortNum(H.smallTokens))) fail(label, 'HfNS small tokens');
    if (b.smallIslands.length !== H.smallIslands) fail(label, 'HfNS small island count');
    for (const id of small) if (g.cells[id].nb.some((n) => b.main.set.has(n))) fail(label, 'small island touches main');
    const comps = CG.components(g, new Set(land));
    if (comps.length !== 1 + H.smallIslands) fail(label, 'HfNS islands merged');
  }
}

// Independent expectations for the main island, written from the rules (not from the generator).
function checkMain(b, label, land) {
  const sc = b.sc, g = b.grid, D = CG.DATA, bal = b.meta.bal;
  const ids = b.main.ids, info = b.main;
  const terr = tally(ids.map((id) => b.terr[id]));
  const BA = sc.ba ? D.ba[sc.size] : null;

  // 1. Hex mix: every special hex replaces exactly one base hex.
  const want = Object.assign({}, D.island[sc.size].terrain);
  const add = (t, n) => { want[t] = (want[t] || 0) + n; if (!want[t]) delete want[t]; };
  if (BA) for (const t of BA.castleTakes) { add(t, -1); add('castle', 1); }
  if (sc.rivers) {
    for (const [t, n] of Object.entries(D.rivers[sc.size].remove)) add(t, -n);
    for (const k of D.rivers[sc.size].tiles) for (const t of CG.RIVER_TILES[k].hexes) add(t, 1);
  }
  if (sc.caravans && !sc.rivers) { add('desert', -1); add('oasis', 1); } // with rivers a swamp is the watering hole
  if (sc.lake) {
    const L = D.fish[sc.size].lakes.length;
    if (sc.caravans) { add('forest', -1); add('lake', 1); if (L > 1) { add('desert', -1); add('lake', 1); } }
    else { add('desert', -L); add('lake', L); }
  }
  if (!same(terr, want)) fail(label, 'main hexes ' + JSON.stringify(terr) + ' want ' + JSON.stringify(want));

  // 2. Tokens: the size's set (minus the ones Barbarian Attack sets aside), counting shared hexes.
  const tokens = D.island[sc.size].tokens.slice();
  if (BA) for (const n of BA.removeTokens) tokens.splice(tokens.indexOf(n), 1);
  const placed = ids.filter((id) => b.num[id]).map((id) => b.num[id]).concat(ids.filter((id) => b.extra[id]).map((id) => b.extra[id]));
  if (JSON.stringify(sortNum(placed)) !== JSON.stringify(sortNum(tokens))) fail(label, 'main tokens ' + sortNum(placed));
  const producing = ids.filter((id) => CG.PRODUCING.has(b.terr[id])).length;
  const shared = Object.keys(b.extra).map(Number).filter((id) => info.set.has(id));
  if (shared.length !== tokens.length - producing) fail(label, 'shared tokens ' + shared.length);
  for (const id of shared) {
    const pairOk = (b.num[id] === 2 && b.extra[id] === 12) || (b.num[id] === 3 && (b.extra[id] === 2 || b.extra[id] === 12));
    if (!pairOk) fail(label, 'shared token pair ' + b.num[id] + '+' + b.extra[id]);
    if (!b.meta.relaxed && bal.flags.extremeAdj && g.cells[id].nb.some((m) => EXT(b.num[m]) || EXT(b.extra[m]))) fail(label, 'shared 2/12 touches a 2/12');
  }

  // 3. Barbarian Attack
  if (BA) {
    const castles = ids.filter((id) => b.terr[id] === 'castle');
    if (castles.length !== (sc.big ? 2 : 1) || castles.some((id) => !info.coastSet.has(id))) fail(label, 'castles');
    const spots = b.ba.spots;
    if (spots.length !== (sc.big ? 2 : 1) || spots.some((id) => !info.coastSet.has(id) || !['desert', 'oasis', 'swamp'].includes(b.terr[id]))) fail(label, 'desert spots');
    if (!sc.big) {
      const c = g.cells[castles[0]], d = g.cells[spots[0]];
      if (Math.abs(c.x + d.x - 2 * info.cx) > 0.01 || Math.abs(c.y + d.y - 2 * info.cy) > 0.01) fail(label, 'castle/desert spot not opposite');
    }
    // every number on the coast: the coast tokens are exactly the official coast list
    const coastNum = ids.filter((id) => info.coastSet.has(id) && b.num[id]);
    const coastVals = coastNum.flatMap((id) => (b.extra[id] ? [b.num[id], b.extra[id]] : [b.num[id]]));
    if (JSON.stringify(sortNum(coastVals)) !== JSON.stringify(sortNum(BA.coastTokens))) fail(label, 'BA coast numbers ' + sortNum(coastVals));
    const innerVals = ids.filter((id) => !info.coastSet.has(id) && b.num[id]).map((id) => b.num[id]);
    if (JSON.stringify(sortNum(innerVals)) !== JSON.stringify(sortNum(BA.innerTokens))) fail(label, 'BA inland numbers');
    if (ids.some((id) => !info.coastSet.has(id) && b.extra[id])) fail(label, 'shared token inland with BA');
    const ct = tally(coastNum.map((id) => b.terr[id])), it = tally(ids.filter((id) => !info.coastSet.has(id)).map((id) => b.terr[id]));
    if (!sc.rivers && (!same(ct, BA.coast) || !same(it, BA.inner))) fail(label, 'BA official coast/inland hexes');
    // with rivers: each resource within one hex of the official coastal count
    if (sc.rivers) for (const t of CG.RESOURCE_TERRAINS) if ((ct[t] || 0) > (BA.coast[t] || 0) + 1) fail(label, 'too many ' + t + ' on the BA coast: ' + ct[t]);
    const barbs = Object.keys(b.barb).map(Number);
    if (barbs.length !== (shared.length ? 1 : 2) || !barbs.every((id) => info.coastSet.has(id) && (EXT(b.num[id]) || EXT(b.extra[id])))) fail(label, 'starting barbarians');
    if (b.robber !== 'none') fail(label, 'BA must not use robber');
    if (b.ba.arcs.reduce((s2, a) => s2 + a.length, 0) !== coastNum.length) fail(label, 'arcs do not cover coast');
    if (bal.hardLimits && !b.meta.relaxed && b.ev.arcDev > 0.1) fail(label, 'strict arc balance');
  }

  // 4. Rivers
  if (sc.rivers) {
    const R = D.rivers[sc.size];
    if (b.rivers.map((r) => r.tile).join() !== R.tiles.join()) fail(label, 'river tiles');
    const seen = new Set();
    for (const r of b.rivers) {
      if (r.cells.map((id) => b.terr[id]).join() !== CG.RIVER_TILES[r.tile].hexes.join()) fail(label, 'river terrain order');
      const di = g.cells[r.cells[1]].i - g.cells[r.cells[0]].i, dj = g.cells[r.cells[1]].j - g.cells[r.cells[0]].j;
      for (let k = 1; k < r.cells.length; k++)
        if (g.cells[r.cells[k]].i - g.cells[r.cells[k - 1]].i !== di || g.cells[r.cells[k]].j - g.cells[r.cells[k - 1]].j !== dj) fail(label, 'river not straight');
      const last = r.cells[r.cells.length - 1];
      const out = g.edges[r.mouth].cells.find((c) => c !== last);
      if (!g.edges[r.mouth].cells.includes(last) || info.set.has(out)) fail(label, 'river mouth not into the sea');
      if (r.bridges.length !== r.cells.length) fail(label, 'bridge sites');
      for (const id of r.cells) { if (seen.has(id)) fail(label, 'rivers overlap'); seen.add(id); }
    }
    if (BA) b.ba.spots.forEach((spot, k) => {
      const swampRivers = b.rivers.filter((r) => CG.RIVER_TILES[r.tile].hexes.slice(-1)[0] === 'swamp');
      if (swampRivers[k] && swampRivers[k].cells.slice(-1)[0] !== spot) fail(label, 'swamp not on desert spot');
    });
    for (const h of b.harbors) if (b.rivers.some((r) => r.mouth === h.edge) && g.cells[h.cell].nb.filter((n) => info.set.has(n)).length > 1) fail(label, 'harbor on a river mouth');
    if (!sc.caravans && !BA && b.terr[b.robber] !== 'swamp') fail(label, 'robber not on swamp');
  } else if (b.rivers.length) fail(label, 'rivers without Rivers');

  // 5. Caravans: exactly one watering hole
  if (sc.caravans) {
    const wh = b.oasis;
    if (wh === null || wh === undefined || !info.set.has(wh)) fail(label, 'no watering hole');
    else if (BA) { if (wh !== b.ba.spots[0]) fail(label, 'watering hole not on the desert spot'); }
    else if (sc.rivers) { if (wh !== b.rivers[0].cells.slice(-1)[0] || b.terr[wh] !== 'swamp') fail(label, 'watering hole not the river swamp'); }
    else {
      const dist = (id) => Math.hypot(g.cells[id].x - info.cx, g.cells[id].y - info.cy);
      if (dist(wh) > Math.min(...ids.map(dist)) + 0.01 || b.terr[wh] !== 'oasis') fail(label, 'watering hole not central');
    }
    if (ids.filter((id) => b.terr[id] === 'oasis').length > 1) fail(label, 'more than one watering hole');
    if (sc.lake && !ids.some((id) => b.terr[id] === 'lake' && g.cells[id].nb.includes(wh))) fail(label, 'no lake next to watering hole');
    if (!BA && b.robber !== 'beside') fail(label, 'caravans robber');
  } else if (b.oasis !== null && b.oasis !== undefined) fail(label, 'watering hole without Caravans');

  // 6. Lakes stay inland; plain boards: robber on the desert, desert position option
  for (const id of ids) if (b.terr[id] === 'lake' && g.cells[id].nb.some((n) => !info.set.has(n))) fail(label, 'lake on the coast');
  if (sc.robber === 'desert' && b.terr[b.robber] !== 'desert') fail(label, 'robber not on desert');
  if (!BA && bal.desertPos === 'inner' && ids.some((id) => b.terr[id] === 'desert' && info.coastSet.has(id))) fail(label, 'desert on coast');
  if (!BA && bal.desertPos === 'coast' && ids.some((id) => b.terr[id] === 'desert' && !info.coastSet.has(id))) fail(label, 'desert inland');
}

const configs = [];
const bools = [false, true];
for (const size of ['normal', 'medium', 'big'])
  for (const fish of bools) for (const rivers of bools) for (const caravans of bools) for (const ba of bools)
    for (const balance of ['official', 'balanced', 'strict'])
      configs.push({ size, fish, rivers, caravans, ba, balance });
for (const size of ['normal', 'medium', 'big'])
  for (const fish of bools) for (const rivers of bools) for (const caravans of bools) for (const ba of bools)
    configs.push({ size, seafarers: true, seaScenario: 'newworld', fish, rivers, caravans, ba, balance: 'balanced' });
for (const size of ['normal', 'medium', 'big']) for (const fish of bools) for (const balance of ['official', 'strict'])
  configs.push({ size, seafarers: true, seaScenario: 'newworld', fish, balance }, { size, seafarers: true, seaScenario: 'hfns', fish, balance });
for (const desertPos of ['inner', 'coast']) configs.push({ size: 'normal', balance: 'balanced', desertPos }, { size: 'medium', balance: 'strict', desertPos }, { size: 'big', balance: 'strict', desertPos });
configs.push({ size: 'normal', ba: true, balance: 'strict', castlePos: 'corner' }, { size: 'medium', ba: true, rivers: true, fish: true, balance: 'balanced', castlePos: 'corner' });
configs.push({ players: 5, balance: 'balanced' });

const t0 = Date.now();
const summary = [];
for (const [ci, cfg] of configs.entries()) {
  if (ci % SHARDS !== SHARD) continue;
  const label = JSON.stringify(cfg).replace(/["{}]/g, '');
  if (FILTER && !label.includes(FILTER)) continue;
  let worst = 0, relaxed = 0, totalMs = 0;
  const metric = { resDev: 0, spread: 0, maxV: 0, arcDev: 0 };
  for (let k = 0; k < N; k++) {
    const seed = (k * 2654435761 + 12345) >>> 0;
    const s = Date.now();
    let b;
    try { b = CG.generate(cfg, seed); } catch (e) { fail(label, 'threw: ' + e.message); continue; }
    const ms = Date.now() - s;
    totalMs += ms; worst = Math.max(worst, ms);
    if (b.meta.relaxed) relaxed++;
    check(cfg, b, label);
    metric.resDev += b.ev.resDev; metric.spread += b.ev.spread; metric.maxV += b.ev.maxV; metric.arcDev += b.ev.arcDev || 0;
    // determinism
    if (k < 3) {
      const b2 = CG.generate(cfg, seed);
      if (JSON.stringify(b2.terr) !== JSON.stringify(b.terr) || JSON.stringify(b2.num) !== JSON.stringify(b.num)) fail(label, 'not deterministic');
    }
  }
  summary.push({ label, avgMs: (totalMs / N).toFixed(0), worstMs: worst, relaxed, resDev: (metric.resDev / N).toFixed(3), spread: (metric.spread / N).toFixed(3), maxV: (metric.maxV / N).toFixed(1), arcDev: (metric.arcDev / N).toFixed(3) });
}
console.table(summary);
console.log('configs:', summary.length, 'boards each:', N, 'time:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log(failures ? failures + ' FAILURES' : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
