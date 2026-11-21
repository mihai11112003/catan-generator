/* Catan board generator — component tables, scenario rules and balance presets.
 * Sources: CATAN, 5-6 Player Extension, Traders & Barbarians (+5-6), Seafarers (+5-6) rulebooks,
 * and the official "possible combinations" sheets on catan.com. See README.md. */
(function (G) {
  'use strict';
  const CG = G.CG || (G.CG = {});

  CG.TERRAIN = {
    forest:    { name: 'Forest',     res: 'lumber', color: '#3d7a3a', icon: '🌲' },
    hills:     { name: 'Hills',      res: 'brick',  color: '#c46a3b', icon: '🧱' },
    pasture:   { name: 'Pasture',    res: 'wool',   color: '#97c15a', icon: '🐑' },
    fields:    { name: 'Fields',     res: 'grain',  color: '#e6bd45', icon: '🌾' },
    mountains: { name: 'Mountains',  res: 'ore',    color: '#8b97a3', icon: '⛰️' },
    gold:      { name: 'Gold field', res: 'any',    color: '#d6a21e', icon: '💰' },
    desert:    { name: 'Desert',                    color: '#e2cd96', icon: '🏜️' },
    oasis:     { name: 'Watering hole',             color: '#d8c483', icon: '🌴' },
    swamp:     { name: 'Swamp',                     color: '#8c9460', icon: '🌿' },
    lake:      { name: 'Lake',                      color: '#5ba8c9', icon: '🐟' },
    castle:    { name: 'Castle',                    color: '#a9a49a', icon: '🏰' },
    sea:       { name: 'Sea',                       color: '#3f8fb0', icon: '' },
  };
  CG.RESOURCE_TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains'];
  CG.PRODUCING = new Set(['forest', 'hills', 'pasture', 'fields', 'mountains', 'gold']);
  CG.RES = {
    lumber: { name: 'Lumber', icon: '🪵', terrain: 'forest' },
    brick:  { name: 'Brick',  icon: '🧱', terrain: 'hills' },
    wool:   { name: 'Wool',   icon: '🐑', terrain: 'pasture' },
    grain:  { name: 'Grain',  icon: '🌾', terrain: 'fields' },
    ore:    { name: 'Ore',    icon: '🪨', terrain: 'mountains' },
  };
  // Number of dice combinations ("pips" / dots on the token) for each number.
  CG.WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

  const BASE_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const BIG_TOKENS = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12];
  const HARBORS_SMALL = { generic: 4, lumber: 1, brick: 1, wool: 1, grain: 1, ore: 1 };
  const HARBORS_BIG = { generic: 5, lumber: 1, brick: 1, wool: 2, grain: 1, ore: 1 };
  // Medium board (house setup): the base game plus half of what the 5-6 extension adds —
  // one hex of each resource, five tokens (4, 5, 9, 10, 11) and one 3:1 harbor.
  const MEDIUM_TOKENS = [2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12];
  // 10th harbor: a second 2:1 wool, as in the 5-6 extension (wool is as common as lumber and grain).
  const HARBORS_MEDIUM = { generic: 4, lumber: 1, brick: 1, wool: 2, grain: 1, ore: 1 };
  CG.SIZES = {
    normal: { key: 'small',  label: 'Normal', desc: '19 hexes, the base game board (3–4 players).' },
    medium: { key: 'medium', label: 'Medium', desc: '24 hexes: base game plus 5 hexes from the 5–6 extension (house setup).' },
    big:    { key: 'big',    label: 'Big',    desc: '30 hexes, the 5–6 extension board.' },
  };

  // Rivers of Catan tiles: straight strips, listed from the source (mountains) to the mouth.
  // mouth: side the river leaves the last hex, relative to the flow (0 = straight on, -1 = 60° left).
  CG.RIVER_TILES = {
    long:  { name: '4-hex river', hexes: ['mountains', 'hills', 'pasture', 'swamp'], mouth: 0 },
    short: { name: '3-hex river', hexes: ['mountains', 'hills', 'swamp'], mouth: -1 },
    extra: { name: '3-hex river from the 5–6 box', hexes: ['mountains', 'pasture', 'pasture'], mouth: -1 },
  };

  CG.DATA = {
    // CATAN base game (3-4) and 5-6 Player Extension.
    island: {
      small: { terrain: { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 }, tokens: BASE_TOKENS, harbors: HARBORS_SMALL },
      medium: { terrain: { forest: 5, pasture: 5, fields: 5, hills: 4, mountains: 4, desert: 1 }, tokens: MEDIUM_TOKENS, harbors: HARBORS_MEDIUM },
      big:   { terrain: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 }, tokens: BIG_TOKENS, harbors: HARBORS_BIG },
    },
    // Traders & Barbarians — Fishing on Catan (Fishermen of Catan).
    // The lake replaces the desert and may not touch the coast. 3-4: 6 fishing grounds (4,5,6,8,9,10),
    // lake 2/3/11/12. 5-6: both deserts become lakes (2/3/11/12 and 4/10) and 2 more fishing grounds (5, 9).
    fish: {
      small: { lakes: [[2, 3, 11, 12]], fishing: [4, 5, 6, 8, 9, 10] },
      // Medium: the 6 base fishing grounds plus one of the two 5-6 extras (5 or 9), picked per board.
      medium: { lakes: [[2, 3, 11, 12]], fishing: [4, 5, 6, 8, 9, 10], fishingExtra: [5, 9] },
      big:   { lakes: [[2, 3, 11, 12], [4, 10]], fishing: [4, 5, 5, 6, 8, 9, 9, 10] },
    },
    // Traders & Barbarians — Rivers of Catan. `remove`: base hexes returned to the box
    // (official table for 5-6; normal and medium remove exactly what their two tiles show).
    rivers: {
      // Normal board (house choice): one swamp river plus the 5-6 box river, so there is a single
      // swamp and no hex is lost. (The official 3-4 setup uses the two swamp rivers.)
      small:  { tiles: ['long', 'extra'], remove: { mountains: 2, hills: 1, pasture: 3, desert: 1 } },
      medium: { tiles: ['long', 'extra'], remove: { mountains: 2, hills: 1, pasture: 3, desert: 1 } },
      big:    { tiles: ['long', 'short', 'extra'], remove: { mountains: 3, hills: 2, pasture: 3, desert: 2 } },
    },
    // Traders & Barbarians — Barbarian Attack.
    ba: {
      small: {
        coast: { hills: 2, forest: 2, pasture: 3, fields: 2, mountains: 1 },
        inner: { hills: 1, forest: 1, pasture: 1, fields: 2, mountains: 2 },
        coastTokens: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12],
        innerTokens: [3, 4, 5, 6, 8, 9, 10],
        unusedHexes: '1 forest hex',
        unusedTokens: 'one 11 token',
        removeTokens: [11],
        castleTakes: ['forest'],
      },
      // Medium (house setup, between the official 3-4 and 5-6 tables): ore and grain stay inland.
      medium: {
        coast: { forest: 3, hills: 3, pasture: 3, fields: 2, mountains: 1 },
        inner: { forest: 1, hills: 1, pasture: 2, fields: 3, mountains: 3 },
        coastTokens: [2, 3, 4, 5, 5, 6, 8, 9, 9, 10, 11, 12],
        innerTokens: [3, 4, 4, 5, 6, 8, 9, 10, 10, 11],
        unusedHexes: '1 forest hex',
        unusedTokens: 'one 11 token',
        removeTokens: [11],
        castleTakes: ['forest'],
      },
      // Big: the second castle replaces a fields hex (the 5-6 rules use a pasture), so pasture keeps
      // its 6 hexes to match the two 2:1 wool harbors. Grain stays at 2 on the coast.
      big: {
        coast: { forest: 3, hills: 3, pasture: 2, mountains: 2, fields: 2 },
        inner: { forest: 2, hills: 2, pasture: 4, mountains: 3, fields: 3 },
        coastTokens: [2, 3, 4, 5, 5, 6, 8, 9, 9, 10, 11, 12],
        innerTokens: [3, 3, 4, 4, 5, 6, 6, 8, 8, 9, 10, 10, 11, 11],
        unusedHexes: '1 forest and 1 fields hex',
        unusedTokens: 'one 2 and one 12 token',
        removeTokens: [2, 12],
        castleTakes: ['forest', 'fields'],
      },
    },
    // Seafarers — Scenario 9 "New World" (random islands).
    newworld: {
      small: {
        rows: 6, cols: 7,
        land: { fields: 5, hills: 4, mountains: 4, pasture: 5, forest: 5 },
        tokens: [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12],
        harbors: HARBORS_SMALL,
        islandCount: [3, 4], minIsland: 3,
      },
      medium: {
        rows: 7, cols: 7,
        land: { fields: 6, hills: 5, mountains: 5, pasture: 6, forest: 6, gold: 2 },
        tokens: [2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
        harbors: HARBORS_MEDIUM,
        islandCount: [3, 4], minIsland: 3,
      },
      big: {
        rows: 7, cols: 9,
        land: { desert: 3, gold: 4, fields: 7, hills: 7, mountains: 7, pasture: 7, forest: 7 },
        tokens: [2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12],
        harbors: HARBORS_BIG,
        islandCount: [3, 4], minIsland: 4,
      },
    },
    // Seafarers — Scenario 1 "Heading for New Shores": main island + small islands.
    hfns: {
      small: {
        rows: 7, cols: 8, mainShift: [7, 3],
        smallLand: { gold: 2, mountains: 2, fields: 1, hills: 1, pasture: 1, forest: 1 },
        smallTokens: [2, 3, 4, 5, 8, 9, 10, 11],
        smallIslands: 4,
        harbors: HARBORS_SMALL, smallHarbors: 3,
      },
      medium: {
        rows: 7, cols: 10, mainShift: [7, 3],
        smallLand: { gold: 2, mountains: 2, fields: 1, hills: 1, pasture: 1, forest: 1 },
        smallTokens: [2, 3, 4, 5, 8, 9, 10, 11],
        smallIslands: 4,
        harbors: HARBORS_MEDIUM, smallHarbors: 3,
      },
      big: {
        rows: 9, cols: 10, mainShift: [6, 4],
        smallLand: { gold: 3, mountains: 2, hills: 2, fields: 1, pasture: 1, forest: 1 },
        smallTokens: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12],
        smallIslands: 4,
        harbors: HARBORS_BIG, smallHarbors: 3,
      },
    },
  };

  // ---------------------------------------------------------------- scenario resolution
  // o = { size: 'normal'|'medium'|'big', seafarers, seaScenario: 'newworld'|'hfns', fish, rivers, caravans, ba }
  function sizeOf(o) {
    if (CG.SIZES[o.size]) return o.size;
    return (o.players | 0) >= 5 ? 'big' : 'normal'; // old links used a player count
  }

  CG.resolveScenario = function (o) {
    const sizeName = sizeOf(o);
    const size = CG.SIZES[sizeName].key;
    const big = size === 'big', medium = size === 'medium';
    const ba = !!o.ba, fish = !!o.fish, rivers = !!o.rivers, caravans = !!o.caravans;
    const warnings = [];

    // Barbarian Attack, Rivers and Caravans need one big island, so with Seafarers they use
    // Heading for New Shores (main island + small islands). New World has no main island.
    let layout = 'island';
    if (o.seafarers) {
      const needsIsland = ba || rivers || caravans;
      layout = needsIsland || o.seaScenario === 'hfns' ? 'hfns' : 'newworld';
      if (needsIsland && o.seaScenario !== 'hfns')
        warnings.push('New World has no main island, so this board uses Heading for New Shores: ' + [ba && 'Barbarian Attack', rivers && 'Rivers', caravans && 'Caravans'].filter(Boolean).join(', ') + ' go on the main island.' + (ba ? ' (The official sheet says Barbarian Attack with New World is not playable.)' : ''));
    }
    // Fishing: the lake is left out with Barbarian Attack, Rivers or New World (official sheets).
    const lake = fish && !ba && !rivers && layout !== 'newworld';

    let vp;
    const parts = [];
    if (layout === 'newworld') { vp = 12; parts.push('Seafarers: New World'); }
    else if (layout === 'hfns') { vp = 13 + (caravans ? 2 : 0); parts.push('Seafarers: Heading for New Shores'); }
    else { vp = ba || caravans ? 12 : 10; parts.push(big ? 'CATAN 5–6' : medium ? 'CATAN, medium board' : 'CATAN'); }
    if (layout !== 'island' && big) parts[0] += ' (5–6)';
    if (layout !== 'island' && medium) parts[0] += ' (medium)';
    if (fish) parts.push('Fishing on Catan');
    if (rivers) parts.push('Rivers');
    if (caravans) parts.push('Caravans');
    if (ba) parts.push('Barbarian Attack');
    const title = parts.join(' + ');

    let robber, pirate = null;
    if (ba) { robber = 'none'; pirate = layout === 'island' ? null : 'none'; }
    else if (layout === 'newworld') { robber = 'frame'; pirate = 'frame'; }
    else if (lake || caravans) robber = 'beside';
    else if (rivers) robber = 'swamp';
    else robber = 'desert';
    if (layout === 'hfns' && !ba) pirate = 'sea';

    const notes = [];
    const rules = [];
    if (medium) notes.push('Medium board (house setup): the base game plus 1 hex of each resource, tokens 4, 5, 9, 10 and 11, and a second 2:1 wool harbor from the 5–6 extension.');
    if (big) notes.push('With 5–6 players, use the special building phase between turns.');

    if (layout === 'island' && !ba && !fish && !caravans && !rivers) rules.push('Robber starts on the desert.');
    if (fish) {
      if (lake && caravans) rules.push('The lake replaces a forest next to the watering hole. It produces fish on 2, 3, 11 and 12.');
      else if (lake) rules.push(big
        ? 'Both deserts are replaced by lakes (2·3·11·12 and 4·10). Lakes never touch the coast. You may put the robber on a lake.'
        : 'The lake replaces the desert and never touches the coast. It produces fish on 2, 3, 11 and 12. You may put the robber on the lake.');
      else rules.push('No lake in this combination.');
      rules.push('Fishing grounds produce fish on their number for the 3 intersections they touch. The robber may not go on a fishing ground.');
      rules.push('A second starting settlement next to a fishing ground' + (lake ? ' or a lake' : '') + ' also takes 1 fish token.');
      if (!ba && !caravans) rules.push('Robber starts beside the board' + (layout === 'newworld' ? ' (with the pirate on the frame)' : '') + '.');
      rules.push('Whoever holds the old boot needs 1 extra VP to win.');
    }
    if (rivers) {
      rules.push('River hexes replace the same terrain; swamps are deserts and produce nothing.' + (robber === 'swamp' ? ' Robber starts on a swamp.' : ''));
      if (ba) rules.push('The 4-hex river ends on the desert spot opposite the castle' + (big ? ', the 3-hex river on the second desert spot' : '') + '.');
      rules.push('Dashed edges are bridge sites: no roads there. A bridge costs 2 brick + 1 lumber; each player has 3.');
      rules.push('Gold: +1 for each settlement or road next to a river (also at setup), +3 per bridge. Pay 2 gold for 1 resource, twice per turn.');
      rules.push('Most gold: +1 VP. Least gold (ties too): ' + (ba ? 'no penalty with Barbarian Attack.' : '−2 VP.'));
      if (fish) rules.push('With fish: pay 6 fish to build a bridge for free.');
      if (caravans) rules.push('With Caravans: wagons may use bridge sites; bridges count as roads for wagons.');
    }
    if (caravans) {
      if (ba) rules.push('The watering hole is the desert spot opposite the castle' + (rivers ? ' (the swamp there)' : '') + '. On the coast, trains have only 2 start points. Barbarians do not block wagons.');
      else if (rivers) rules.push('The swamp at the end of the 4-hex river is the watering hole (house rule, so no extra hex is lost). On the coast, trains have only 2 start points.');
      else rules.push('The watering hole replaces the desert in the centre.' + (big ? ' Big board: one watering hole (house setup; the 5–6 rules use two).' : ''));
      if (!ba) rules.push('Robber starts beside the board and enters on the first 7 or Knight.');
      rules.push('Each turn you build, 1 wagon (camel) is placed at the end of the turn. Everyone may bid wool and grain: 1 card = 1 vote, and all bids are paid.');
      rules.push('Trains start at the watering hole, run along paths, never branch, and never share an edge.');
      rules.push('A settlement or city between 2 wagons is worth +1 VP. A wagon next to your road makes it count double for Longest Road.');
      if (layout === 'hfns') rules.push('Caravans on Seafarers: wagons may also run next to ships; +2 VP to win (combination sheet).');
    }
    if (ba) {
      rules.push('No robber' + (layout !== 'island' ? ' and no pirate' : '') + ', no Largest Army, and no CATAN development cards: use the Barbarian Attack cards. On a 7, nothing is produced, players discard as normal, and you steal 1 card from a player of your choice.');
      rules.push('Your second starting building is a city.');
      rules.push('One barbarian starts on the coastal hex with the 2 and one on the coastal hex with the 12.');
      rules.push('Each time a settlement or city is built: roll 3 times (re-roll 7s and repeats). Add a barbarian to the coastal hex with each number' + (big || medium ? ' — the 5 and the 9 are on two coastal hexes each, so both get one' : '') + '. 3 barbarians conquer a hex.');
      rules.push('Knights start on the paths of the castle and move along paths to fight barbarians.');
      if (big) rules.push('Big board: the second desert spot is where the 5–6 rules put the oasis tile.');
      if (layout === 'hfns') rules.push('Barbarians land only on the main island. The small islands can be settled as normal.');
      if (fish) rules.push('With fish: pay 2 fish to move a knight up to 5 edges. Conquered buildings get no fish.');
    }
    if (layout === 'newworld') {
      rules.push('Starting settlements may go on any island (one or two islands). Your first settlement on any other island earns 1 special VP (Catan chit) — once per player.');
      rules.push('Robber and pirate start on the frame and enter play the first time they move.');
    }
    if (layout === 'hfns') {
      rules.push('Starting settlements go on the main island. Your first settlement on a small island earns 1 special VP (Catan chit) — once per player.');
      if (robber === 'desert' || robber === 'swamp') rules.push(`Robber starts on the ${robber}; the pirate starts on the marked sea hex.`);
      else if (!ba) rules.push('The pirate starts on the marked sea hex.');
    }

    return {
      sizeName, big, medium, size, layout, ba, fish, lake, caravans, rivers, vp, bootVp: fish ? vp + 1 : null,
      title, robber, pirate, warnings, notes, rules,
      seaScenario: layout === 'island' ? null : layout,
    };
  };

  // ---------------------------------------------------------------- balance
  CG.BALANCE_FLAGS = [
    { key: 'redAdj',          label: '6 and 8 never touch',                 hint: 'Official rule for random setups.' },
    { key: 'extremeAdj',      label: '2 and 12 never touch' },
    { key: 'sameNumAdj',      label: 'Equal numbers never touch' },
    { key: 'sameTerrain',     label: 'Equal terrain never touches' },
    { key: 'capHotspots',     label: 'No intersection above 11 dots',        hint: 'Dots on the 3 touching number tokens.' },
    { key: 'resourceBalance', label: 'Fair production for each resource' },
    { key: 'spread',          label: 'Spread strong numbers over the board' },
    { key: 'fairHarbors',     label: 'No 2:1 harbor on its own strong hex',  hint: 'Also keeps harbors off desert-only spots.' },
    { key: 'goldNoRed',       label: 'Gold fields never get 6 or 8',         only: 'seafarers' },
    { key: 'baThreat',        label: 'Even barbarian threat on all coasts',  only: 'ba', hint: 'Balances landing odds on both sides of the castle.' },
  ];

  CG.BALANCE_PRESETS = {
    official: {
      label: 'Rules only',
      desc: 'Shuffle like the rulebook: only the official 6/8 rule.',
      flags: { redAdj: true, extremeAdj: false, sameNumAdj: false, sameTerrain: false, capHotspots: false, resourceBalance: false, spread: false, fairHarbors: false, goldNoRed: false, baThreat: false },
      islands: 'random', candidates: 1,
    },
    balanced: {
      label: 'Balanced',
      desc: 'Rules plus the common fairness checks. Picks the fairest of many boards.',
      flags: { redAdj: true, extremeAdj: true, sameNumAdj: true, sameTerrain: false, capHotspots: false, resourceBalance: true, spread: true, fairHarbors: true, goldNoRed: true, baThreat: true },
      islands: 'balanced', candidates: 100,
    },
    strict: {
      label: 'Strict',
      desc: 'Every check is a hard rule. Boards are very even.',
      flags: { redAdj: true, extremeAdj: true, sameNumAdj: true, sameTerrain: true, capHotspots: true, resourceBalance: true, spread: true, fairHarbors: true, goldNoRed: true, baThreat: true },
      islands: 'balanced', candidates: 60,
    },
  };

  CG.resolveBalance = function (o) {
    const preset = CG.BALANCE_PRESETS[o.balance] || null;
    const flags = Object.assign({}, CG.BALANCE_PRESETS.balanced.flags, preset ? preset.flags : {}, o.flags || {});
    const strictish = o.balance === 'strict' || (!preset && flags.sameTerrain && flags.capHotspots);
    return {
      flags,
      hardLimits: strictish,
      islands: o.islands || (preset ? preset.islands : 'balanced'),
      candidates: preset ? preset.candidates : 160,
      firstValid: o.balance === 'official',
      desertPos: o.desertPos || 'any',
      castlePos: o.castlePos || 'side',
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
