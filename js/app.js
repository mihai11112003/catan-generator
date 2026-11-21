/* Catan board generator — page controls, share links and the setup / fairness report. */
(function () {
  'use strict';
  const CG = window.CG;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const DEFAULT = { size: 'normal', seafarers: false, seaScenario: 'newworld', fish: false, rivers: false, caravans: false, ba: false, balance: 'balanced', flags: null, desertPos: 'any', castlePos: 'side', islands: '' };
  const VIEW_DEFAULT = { odds: true, region: true, hot: false };
  let state = Object.assign({}, DEFAULT);
  let view = Object.assign({}, VIEW_DEFAULT);
  let seed = CG.randomSeed();
  let board = null;

  // ------------------------------------------------------------ state <-> URL
  const FLAG_KEYS = CG.BALANCE_FLAGS.map((f) => f.key);
  const flagsToBits = (fl) => FLAG_KEYS.reduce((n, k, i) => n | (fl[k] ? 1 << i : 0), 0).toString(36);
  const bitsToFlags = (s) => { const n = parseInt(s, 36) || 0; const o = {}; FLAG_KEYS.forEach((k, i) => (o[k] = !!(n & (1 << i)))); return o; };

  function encode() {
    const p = new URLSearchParams();
    p.set('size', state.size);
    if (state.seafarers) { p.set('sea', state.seaScenario); if (state.islands) p.set('is', state.islands); }
    if (state.fish) p.set('fish', '1');
    if (state.rivers) p.set('riv', '1');
    if (state.caravans) p.set('car', '1');
    if (state.ba) { p.set('ba', '1'); p.set('castle', state.castlePos); }
    p.set('bal', state.balance);
    if (state.balance === 'custom') p.set('f', flagsToBits(state.flags));
    if (state.desertPos !== 'any') p.set('desert', state.desertPos);
    p.set('code', CG.seedToCode(seed));
    return '#' + p.toString();
  }

  function decode(hash) {
    const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    if (!p.has('size') && !p.has('p')) return null;
    const s = Object.assign({}, DEFAULT);
    s.size = CG.SIZES[p.get('size')] ? p.get('size') : (parseInt(p.get('p'), 10) >= 5 ? 'big' : 'normal');
    if (p.has('sea')) { s.seafarers = true; s.seaScenario = p.get('sea') === 'hfns' ? 'hfns' : 'newworld'; s.islands = ['balanced', 'random'].includes(p.get('is')) ? p.get('is') : ''; }
    s.fish = p.get('fish') === '1';
    s.rivers = p.get('riv') === '1';
    s.caravans = p.get('car') === '1';
    s.ba = p.get('ba') === '1';
    s.castlePos = p.get('castle') === 'corner' ? 'corner' : 'side';
    s.balance = ['official', 'balanced', 'strict', 'custom'].includes(p.get('bal')) ? p.get('bal') : 'balanced';
    if (s.balance === 'custom') s.flags = bitsToFlags(p.get('f'));
    s.desertPos = ['inner', 'coast'].includes(p.get('desert')) ? p.get('desert') : 'any';
    const code = CG.codeToSeed(p.get('code'));
    return { state: s, seed: code };
  }

  function options() {
    return {
      size: state.size, seafarers: state.seafarers, seaScenario: state.seaScenario, fish: state.fish, rivers: state.rivers, caravans: state.caravans, ba: state.ba,
      balance: state.balance, flags: state.balance === 'custom' ? state.flags : null,
      desertPos: state.desertPos, castlePos: state.castlePos, islands: state.islands || undefined,
    };
  }

  const store = {
    load() { try { return JSON.parse(localStorage.getItem('catan-gen') || 'null'); } catch (e) { return null; } },
    save() { try { localStorage.setItem('catan-gen', JSON.stringify({ state, view })); } catch (e) { /* storage unavailable */ } },
  };

  // ------------------------------------------------------------ controls
  function syncControls() {
    document.querySelectorAll('input[name="size"]').forEach((r) => (r.checked = r.value === state.size));
    $('#size-desc').textContent = CG.SIZES[state.size].desc;
    document.querySelectorAll('input[name="balance"]').forEach((r) => (r.checked = r.value === state.balance));
    $('#opt-seafarers').checked = state.seafarers;
    $('#opt-sea-scenario').value = state.seaScenario;
    $('#opt-islands').value = state.islands;
    $('#opt-fish').checked = state.fish;
    $('#opt-caravans').checked = state.caravans;
    $('#opt-rivers').checked = state.rivers;
    $('#opt-castle').value = state.castlePos;
    $('#opt-desert').value = state.desertPos;
    $('#view-odds').checked = view.odds;
    $('#view-region').checked = view.region;
    $('#view-hot').checked = view.hot;

    const sc = CG.resolveScenario(options());
    $('#sea-sub').hidden = !state.seafarers;
    const needsIsland = state.ba || state.rivers || state.caravans;
    $('#opt-sea-scenario').disabled = needsIsland;
    $('#opt-sea-scenario').title = needsIsland ? 'Barbarian Attack, Rivers and Caravans need the main island of Heading for New Shores.' : '';
    $('#islands-field').hidden = sc.layout !== 'newworld';
    $('#ba-sub').hidden = !(state.ba && !sc.big);
    $('#desert-field').hidden = state.ba || sc.lake || sc.caravans || sc.rivers || sc.layout === 'newworld';
    $('#view-odds-wrap').hidden = !state.ba;
    $('#view-region-wrap').hidden = !state.ba;

    const preset = CG.BALANCE_PRESETS[state.balance];
    $('#balance-desc').textContent = preset ? preset.desc : 'Your own mix of checks.';
    const flags = CG.resolveBalance(options()).flags;
    $('#flags').innerHTML = CG.BALANCE_FLAGS.filter((f) => !f.only || (f.only === 'seafarers' ? state.seafarers : state.ba)).map((f) =>
      `<label class="mini" title="${esc(f.hint || '')}"><input type="checkbox" data-flag="${f.key}"${flags[f.key] ? ' checked' : ''}> ${esc(f.label)}</label>`).join('');
    $('#code').value = CG.seedToCode(seed);
  }

  function bind() {
    document.querySelectorAll('input[name="size"]').forEach((r) => r.addEventListener('change', () => { state.size = r.value; rebuild(true); }));
    document.querySelectorAll('input[name="balance"]').forEach((r) => r.addEventListener('change', () => { state.balance = r.value; state.flags = null; rebuild(true); }));
    $('#opt-seafarers').addEventListener('change', (e) => { state.seafarers = e.target.checked; rebuild(true); });
    $('#opt-sea-scenario').addEventListener('change', (e) => { state.seaScenario = e.target.value; rebuild(true); });
    $('#opt-islands').addEventListener('change', (e) => { state.islands = e.target.value; rebuild(true); });
    $('#opt-fish').addEventListener('change', (e) => { state.fish = e.target.checked; rebuild(true); });
    $('#opt-caravans').addEventListener('change', (e) => { state.caravans = e.target.checked; rebuild(true); });
    $('#opt-rivers').addEventListener('change', (e) => { state.rivers = e.target.checked; rebuild(true); });
    $('#opt-ba').addEventListener('change', (e) => { state.ba = e.target.checked; rebuild(true); });
    $('#opt-castle').addEventListener('change', (e) => { state.castlePos = e.target.value; rebuild(true); });
    $('#opt-desert').addEventListener('change', (e) => { state.desertPos = e.target.value; rebuild(true); });
    $('#flags').addEventListener('change', (e) => {
      const key = e.target.dataset.flag;
      if (!key) return;
      const fl = Object.assign({}, CG.resolveBalance(options()).flags, { [key]: e.target.checked });
      state.flags = fl;
      state.balance = 'custom';
      rebuild(true);
    });
    for (const k of ['odds', 'region', 'hot'])
      $('#view-' + k).addEventListener('change', (e) => { view[k] = e.target.checked; store.save(); draw(); });
    $('#btn-new').addEventListener('click', () => rebuild(true));
    $('#btn-print').addEventListener('click', () => { try { window.print(); } catch (e) { /* printing blocked in embedded viewers */ } });
    $('#btn-copy').addEventListener('click', async () => {
      const btn = $('#btn-copy');
      try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
      catch (e) { btn.textContent = 'Copy failed — use the address bar'; }
      setTimeout(() => (btn.textContent = 'Copy link'), 1800);
    });
    $('#code-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const s = CG.codeToSeed($('#code').value);
      if (s === null) { $('#code').setCustomValidity('Use the letters and digits of a board code.'); $('#code').reportValidity(); return; }
      $('#code').setCustomValidity('');
      seed = s;
      rebuild(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox' && document.activeElement.type !== 'radio') return;
      rebuild(true);
    });
    window.addEventListener('hashchange', () => {
      const d = decode(location.hash);
      if (!d || location.hash === encode()) return;
      state = d.state;
      if (d.seed !== null) seed = d.seed;
      rebuild(false);
    });
  }

  // ------------------------------------------------------------ build + draw
  function rebuild(newSeed) {
    if (newSeed) seed = CG.randomSeed();
    syncControls();
    const btn = $('#btn-new');
    btn.disabled = true;
    btn.textContent = 'Shuffling…';
    document.body.classList.add('busy');
    setTimeout(() => {
      try {
        board = CG.generate(options(), seed);
        draw();
        $('#report').innerHTML = report(board);
        try { history.replaceState(null, '', encode()); } catch (e) { /* embedded viewers may block URL changes */ }
        store.save();
      } catch (err) {
        $('#report').innerHTML = `<div class="warn"><p>This board could not be built: ${esc(err.message)} Try “New board” or loosen the balance checks.</p></div>`;
      }
      btn.disabled = false;
      btn.textContent = 'New board';
      document.body.classList.remove('busy');
    }, 20);
  }

  function draw() {
    if (!board) return;
    CG.renderBoard($('#board'), board, view);
    const sc = board.sc;
    $('#board-title').textContent = sc.title;
    $('#board-sub').textContent = `${CG.SIZES[sc.sizeName].label} board. Play to ${sc.vp} victory points${sc.bootVp ? ` (${sc.bootVp} if you hold the old boot)` : ''}. Board code ${CG.seedToCode(board.meta.seed)}.`;
    $('#warnings').innerHTML = sc.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('') +
      (board.meta.relaxed ? '<p class="warn">The strict checks could not all be met for this setup, so this board keeps the rules and is as fair as possible. Try another board for a stricter fit.</p>' : '');
  }

  // ------------------------------------------------------------ report
  const T = CG.TERRAIN;
  const icon = (t) => `<span class="ico" aria-hidden="true">${T[t].icon}</span>`;
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b || a + 's');

  function compass(ang) {
    const names = ['East', 'South-east', 'South', 'South-west', 'West', 'North-west', 'North', 'North-east'];
    const k = Math.round(((ang * 180) / Math.PI + 360) % 360 / 45) % 8;
    return names[k];
  }

  function tokenList(nums) {
    const t = {};
    nums.forEach((n) => (t[n] = (t[n] || 0) + 1));
    return Object.keys(t).map(Number).sort((a, b) => a - b).map((n) => `<span class="chip${n === 6 || n === 8 ? ' red' : ''}">${n}${t[n] > 1 ? '<small>×' + t[n] + '</small>' : ''}</span>`).join('');
  }

  function terrainTable(b, ids) {
    const counts = {};
    ids.forEach((id) => { const t = b.terr[id]; counts[t] = (counts[t] || 0) + 1; });
    const order = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'gold', 'desert', 'swamp', 'oasis', 'lake', 'castle'];
    return '<ul class="terrain">' + order.filter((t) => counts[t]).map((t) => `<li>${icon(t)}<span>${T[t].name}</span><b>${counts[t]}</b></li>`).join('') + '</ul>';
  }

  function setupSection(b) {
    const sc = b.sc, g = b.grid, D = CG.DATA;
    const land = g.inner.filter((id) => b.terr[id] && b.terr[id] !== 'sea');
    const items = [];
    if (sc.layout === 'hfns') {
      const small = b.smallIslands.flat();
      items.push(`<h4>Main island</h4>${terrainTable(b, b.main.ids)}`);
      items.push(`<h4>${b.smallIslands.length} small islands</h4>${terrainTable(b, small)}`);
    } else items.push(terrainTable(b, land));
    const sea = g.inner.filter((id) => b.terr[id] === 'sea').length;
    if (sea) items.push(`<p>${plural(sea, 'sea hex', 'sea hexes')} inside the frame (shown in blue).</p>`);

    const nums = land.filter((id) => b.num[id]).map((id) => b.num[id]).concat(Object.values(b.extra));
    let tokNote = '';
    if (sc.ba) tokNote = `Set aside ${D.ba[sc.size].unusedTokens} and ${D.ba[sc.size].unusedHexes}.`;
    else if (sc.layout === 'island') tokNote = sc.big ? 'Use only the 28 tokens of the 5–6 extension.' : sc.medium ? 'The 18 base tokens plus 4, 5, 9, 10 and 11 from the 5–6 extension.' : 'All 18 tokens of the base game.';
    const shared = Object.entries(b.extra).map(([id, n]) => `the ${n} on the ${b.num[id]}`);
    if (shared.length) tokNote += ` Two tokens share a hex: ${shared.join(' and ')} (it produces on both).`;
    items.push(`<h4>Number tokens (${nums.length})</h4><p class="chips">${tokenList(nums)}</p>${tokNote ? `<p>${tokNote}</p>` : ''}`);

    const generic = b.harbors.filter((h) => h.type === 'generic').length;
    const special = b.harbors.length - generic;
    items.push(`<h4>Harbors (${b.harbors.length})</h4><p>${generic} × 3:1 and ${special} × 2:1${special > 5 ? ' (wool twice)' : ' (one per resource)'}.${sc.layout === 'island' ? ' Harbors sit on every second frame position.' : ''}</p>`);
    if (b.fishing.length) items.push(`<h4>Fishing grounds (${b.fishing.length})</h4><p class="chips">${tokenList(b.fishing.map((f) => f.number))}</p>`);
    if (b.rivers.length) {
      const R = CG.RIVER_TILES, D2 = CG.DATA.rivers[sc.size];
      const gone = Object.entries(D2.remove).map(([t, n]) => `${n} ${T[t].name.toLowerCase()}`).join(', ');
      items.push(`<h4>Rivers (${b.rivers.length} tiles)</h4><p>${b.rivers.map((r) => R[r.tile].name).join(', ')}. They replace ${gone}. Dashed edges are bridge sites.</p>`);
    }
    if (sc.caravans) {
      const where = b.terr[b.oasis] === 'swamp' ? 'the swamp marked 🐪 (no watering hole tile needed)' : sc.ba ? 'the desert spot opposite the castle' : 'the centre hex';
      items.push(`<h4>Caravans</h4><p>Watering hole: ${where}. Keep the 22 wagons (camels) beside the board.</p>`);
    }
    if (sc.ba) items.push(`<h4>Barbarians</h4><p>Place 1 barbarian on the coastal hex with the 2 and 1 on the coastal hex with the 12. Keep the rest next to the board. Each player takes 6 knights.</p>`);
    const start = [];
    if (b.robber === 'none') start.push('No robber' + (sc.layout !== 'island' ? ' or pirate' : '') + ' in this game.');
    else if (b.robber === 'beside') start.push('Robber starts beside the board.');
    else if (b.robber === 'frame') start.push('Robber and pirate start on the frame.');
    else if (typeof b.robber === 'number') start.push(`Robber starts on the ${b.terr[b.robber]}.`);
    if (typeof b.pirate === 'number') start.push('Pirate starts on the sea hex marked 🏴‍☠️.');
    if (start.length) items.push(`<h4>Robber and pirate</h4><p>${start.join(' ')}</p>`);
    return `<section><h3>Set up</h3>${items.join('')}</section>`;
  }

  function fairnessSection(b) {
    const ev = b.ev, flags = b.meta.relaxed ? Object.assign({}, b.meta.bal.flags, { capHotspots: false, sameTerrain: false }) : b.meta.bal.flags;
    const rows = [];
    const row = (on, ok, label, detail) => rows.push(`<li class="${ok ? 'ok' : on ? 'bad' : 'off'}"><span class="mark" aria-hidden="true">${ok ? '✓' : on ? '✗' : '·'}</span><span>${esc(label)}${detail ? `<small>${esc(detail)}</small>` : ''}</span></li>`);
    row(flags.redAdj, ev.redAdj === 0, '6 and 8 never touch', ev.redAdj ? `${ev.redAdj} pairs touch` : '');
    row(flags.extremeAdj, ev.extAdj === 0, '2 and 12 never touch', ev.extAdj ? `${ev.extAdj} pairs touch` : '');
    row(flags.sameNumAdj, ev.sameN === 0, 'Equal numbers never touch', ev.sameN ? `${ev.sameN} pairs touch` : '');
    row(flags.sameTerrain, ev.sameT === 0, 'Equal terrain never touches', ev.sameT ? `${ev.sameT} pairs touch` : '');
    row(flags.capHotspots, ev.maxV <= 11, 'No intersection above 11 dots', `Best intersection: ${ev.maxV} dots`);
    row(flags.fairHarbors, ev.harborSyn === 0, 'No 2:1 harbor on its own strong hex', ev.harborSyn ? 'At least one 2:1 harbor touches a strong hex of its resource' : '');
    if (b.sc.layout !== 'island' && b.grid.inner.some((id) => b.terr[id] === 'gold')) {
      const bad = b.grid.inner.filter((id) => b.terr[id] === 'gold' && (b.num[id] === 6 || b.num[id] === 8)).length;
      row(flags.goldNoRed, bad === 0, 'Gold fields never get 6 or 8');
    }

    // Production per resource
    const res = ev.res;
    const max = Math.max(...Object.values(res).map((r) => Math.max(r.pips, r.expected)), 1);
    const bars = CG.RESOURCE_TERRAINS.map((t) => {
      const r = res[t];
      if (!r.count) return '';
      const R = CG.RES[T[t].res];
      const diff = r.pips - r.expected;
      return `<li><span class="bar-label">${R.icon} ${R.name}</span>` +
        `<span class="bar"><span class="fill" style="width:${(r.pips / max) * 100}%"></span><span class="target" style="left:${(r.expected / max) * 100}%" title="Fair share"></span></span>` +
        `<span class="bar-val">${r.pips}<small>${diff >= 0.5 ? '+' : ''}${Math.abs(diff) < 0.5 ? '±0' : Math.round(diff)}</small></span></li>`;
    }).join('');

    let ba = '';
    if (b.ba) {
      const c = b.main;
      const total = ev.arcThreatTotal;
      const odds = CG.landingOdds;
      const arcs = b.ba.arcs.map((a, k) => {
        const x = a.reduce((s, id) => s + b.grid.cells[id].x, 0) / a.length - c.cx;
        const y = a.reduce((s, id) => s + b.grid.cells[id].y, 0) / a.length - c.cy;
        const share = ev.arcThreat[k] / total;
        const nums = a.map((id) => b.num[id]).sort((p, q) => p - q);
        return `<li><span class="bar-label">${compass(Math.atan2(y, x))} coast</span>` +
          `<span class="bar threat"><span class="fill" style="width:${Math.min(100, share * 100 * b.ba.arcs.length / 1.6)}%"></span><span class="target" style="left:${100 / 1.6}%" title="Even share"></span></span>` +
          `<span class="bar-val">${Math.round(share * 100)}%<small>${nums.join(' ')}</small></span></li>`;
      }).join('');
      const top = b.ba.coast.slice().sort((p, q) => odds[b.num[q]] - odds[b.num[p]]).slice(0, 2).map((id) => `${T[b.terr[id]].name.toLowerCase()} ${b.num[id]} (${Math.round(odds[b.num[id]] * 100)}%)`);
      ba = `<h4>Barbarian threat by coast</h4><p>Share of barbarian landings each stretch of coast gets. The line marks an even share.</p><ul class="bars">${arcs}</ul>` +
        `<p>Most exposed: ${top.join(' and ')} chance per attack. Hexes inland are never attacked directly.</p>`;
    }

    return `<section><h3>How fair is it</h3><ul class="checks">${rows.join('')}</ul>` +
      `<h4>Production per resource</h4><p>Dots on the number tokens for each resource. The line marks a fair share for its number of hexes.</p><ul class="bars">${bars}</ul>${ba}` +
      `<p class="small">Chosen as the fairest of ${b.meta.valid} boards that passed the checks.</p></section>`;
  }

  function rulesSection(b) {
    const sc = b.sc;
    const list = [...sc.notes, ...sc.rules];
    if (!list.length) return '';
    return `<section><h3>Rules for this setup</h3><ul class="rules">${list.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>`;
  }

  function report(b) {
    return setupSection(b) + fairnessSection(b) + rulesSection(b);
  }

  // ------------------------------------------------------------ start
  function start() {
    const d = decode(location.hash);
    const saved = store.load();
    if (saved && saved.view) view = Object.assign({}, VIEW_DEFAULT, saved.view);
    if (d) { state = d.state; if (d.seed !== null) seed = d.seed; }
    else if (saved && saved.state) state = Object.assign({}, DEFAULT, saved.state);
    bind();
    rebuild(!d || d.seed === null);
  }
  start();
})();
