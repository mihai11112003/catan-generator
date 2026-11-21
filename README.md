# Catan board generator

A static web page that makes fair, rule-checked Catan boards in three sizes (normal, medium,
big), with **Seafarers** and the **Traders & Barbarians** scenarios *Fishing on Catan*,
*Rivers of Catan*, *Caravans* and *Barbarian Attack*. Every board has a short code, and the page link rebuilds the exact
same board, so you can share it.

No build step, no server, no dependencies: plain HTML, CSS and JavaScript.

## Put it on GitHub Pages

1. Create a new repository on GitHub (for example `catan-board-generator`).
2. Upload all files from this folder to the root of the repository
   (`index.html`, `.nojekyll`, `css/`, `js/`, `tests/`, `README.md`).
   On the repository page: **Add file → Upload files**, drag the folder contents in, then **Commit**.
3. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to
   *Deploy from a branch*, choose the `main` branch and the `/ (root)` folder, and click **Save**.
4. After a minute the site is live at `https://<your-user-name>.github.io/<repository-name>/`.

To try it on your computer first, open `index.html` in a browser (double-click works).

## What it supports

| Board size | Hexes | Made from |
|---|---|---|
| Normal | 19 (rows 3-4-5-4-3) | base game, 18 tokens, 9 harbors |
| Medium (house setup) | 24 (rows 4-5-6-5-4) | base game + 1 hex of each resource, tokens 4, 5, 9, 10, 11 and a second 2:1 wool harbor from the 5–6 extension; 10 harbors |
| Big | 30 (rows 3-4-5-6-5-4-3) | 5–6 extension board, its own 28 tokens, 11 harbors |

The medium board is the big board without its top and bottom rows. It has no official rules,
so every scenario on it is a house setup that sits between the official 3–4 and 5–6 tables.

| Expansion | Normal | Medium | Big |
|---|---|---|---|
| Fishing on Catan | 1 lake, 6 fishing grounds | 1 lake, 7 fishing grounds (base 6 + a 5 or a 9) | 2 lakes, 8 fishing grounds |
| Rivers of Catan | 4-hex river + 3-hex river from the 5–6 box (one swamp) | same as normal | all 3 rivers |
| Caravans | 1 watering hole | 1 watering hole | 1 watering hole (house setup; the 5–6 rules use two) |
| Barbarian Attack | castle, desert spot opposite | castle, desert spot opposite; 5 and 9 twice on the coast | 2 castles, 2 desert spots |

All four Traders & Barbarians scenarios can be switched on together, on every board size, and with
Seafarers (Heading for New Shores).

### How the island is built: desert spots

The base game's desert(s) are **desert spots** that the scenarios share. Every special hex takes
the base hex it replaces out of the supply, so the totals always match the box:

1. **Barbarian Attack** puts the castle(s) on fixed coast spots (each replaces a forest; the second
   castle on the big board replaces a fields hex) and fixes the desert spot(s) directly opposite.
2. **Rivers** replace the base hexes in the official table. With Barbarian Attack, the 4-hex river
   ends on the desert spot (on the big board the 3-hex river ends on the second one), so its swamp
   *is* the desert.
3. **Caravans**: the watering hole is a desert spot — with Barbarian Attack the spot opposite the
   castle (official sheet); with Rivers the swamp at the end of the 4-hex river (house rule, so
   no extra hex is lost); otherwise a desert in the centre.
4. **Fishing**: lakes replace deserts and stay inland — only without Rivers and Barbarian Attack
   (official sheets: no lake there). With Caravans the lake replaces a forest next to the watering hole.
5. The rest of the supply is shuffled onto the free hexes. Barbarian Attack splits it into coast and
   inland: the official tables without rivers; with rivers, each resource gets the same share of
   coastal hexes as in the official table (counting river hexes already on the coast).
6. Numbers. Barbarian Attack puts every number 2–12 on the coast. When a coastal hex is short
   the 2 and the 12 share a hex — the official Rivers + Barbarian Attack rule
   (with the current river choice this no longer happens). Without Barbarian Attack, extra tokens share hexes as in the official Rivers and
   Caravans rules (the 12 with a 2, or the 2 and the 12 each with a 3).

A river's swamp is always on the coast (rivers flow into the sea), so a watering hole that is a
swamp is on the coast too. Like the official Caravans + Barbarian Attack version, trains then have
2 start points instead of 3.

### Rivers

The river tiles are straight strips (from the source to the mouth):

| Tile | Hexes | Mouth |
|---|---|---|
| 4-hex river | mountains, hills, pasture, swamp | straight on |
| 3-hex river | mountains, hills, swamp | 60° to the left |
| 3-hex river (5–6 box) | mountains, pasture, pasture | 60° to the left |

Placement rules: all hexes on land, the mouth flowing into the sea, rivers apart (on a crowded big
board they may touch, but never with equal terrain side by side), and mouths not facing a harbor.

### Seafarers

Barbarian Attack, Rivers and Caravans need one big island, so with Seafarers they use Heading for
New Shores and go on the main island. New World has no main island (and the official sheet says
Barbarian Attack with New World is not playable). Caravans on Seafarers: +2 VP to win (combination sheet).

### Official combination sheets used

- Fishing + Barbarian Attack: no lake.
- Fishing + Rivers: no lake; 6 fish buy a bridge.
- Fishing + Caravans: the lake replaces a forest next to the watering hole.
- Rivers + Barbarian Attack: the 2 and the 12 share a hex; no −2 VP for the poorest player.
- Rivers + Caravans: wagons may use bridge sites. (The sheet puts the watering hole in the centre
  and removes a fields hex; this generator uses the river's swamp instead, see above.)
- Caravans + Barbarian Attack: the watering hole replaces the desert on the coast.
- Seafarers + Barbarian Attack / Caravans: see Seafarers above.

## Adding a scenario

1. Add its component table to `CG.DATA` in `js/rules.js`, and its rules lines in `CG.resolveScenario`.
2. Add one numbered step to `buildMain` (`js/generator.js`). Each step takes the hexes it replaces
   out of the supply list, and may claim a desert spot.
3. Add its checks to `checkMain` in `tests/run-tests.js` and run `node tests/run-tests.js 10`.

## Resource mix

Every board keeps the original mix (normal 4 forest, 4 pasture, 4 fields, 3 hills, 3 mountains;
big 6/6/6/5/5; medium 5/5/5/4/4). The only changes are the official replacements: a castle replaces
a forest (big board: a forest and a fields hex, so pasture keeps 6 hexes for its two 2:1 wool harbors; the 5–6 rules use a pasture), river tiles replace the terrain they show (normal
board: none lost), and with Fishing + Caravans the lake replaces a forest.

## On a phone

The page works on phones: the board comes first, and a "New board" bar stays at the bottom of the
screen. Pinch to zoom into the board.

## Balance settings

- **Rules only** — shuffles like the rulebook. The only check is the official one: 6 and 8 never touch.
- **Balanced** (default) — builds up to 100 boards that pass the checks below and keeps the fairest.
- **Strict** — every check is a hard rule.

Under *Fine-tune the checks* you can switch each one on or off:

| Check | What it does |
|---|---|
| 6 and 8 never touch | Official rule for random setups. |
| 2 and 12 never touch | Keeps the weakest numbers apart. |
| Equal numbers never touch | No two 9s side by side, and so on. |
| Equal terrain never touches | No two forests side by side, and so on. |
| No intersection above 11 dots | Caps the best starting spot (dots = dice combinations). |
| Fair production for each resource | Each resource gets dots in proportion to its number of hexes. |
| Spread strong numbers over the board | Avoids rich and poor corners. |
| No 2:1 harbor on its own strong hex | E.g. no 2:1 ore harbor on a mountain 6; also keeps harbors off desert-only spots. |
| Gold fields never get 6 or 8 | Seafarers. |
| Even barbarian threat on all coasts | Barbarian Attack (see below). |

## Barbarian Attack: what the generator does

Rules it follows (Traders & Barbarians rulebook, 3–4 and 5–6):

- **3–4 players:** castle and desert directly opposite each other on the coast.
  Coast: 2 hills, 2 forest, 3 pasture, 2 fields, 1 mountains. Inland: 1 hills, 1 forest,
  1 pasture, 2 fields, 2 mountains. One forest hex and one 11 token are not used.
  Every coastal hex has a **different** number (2, 3, 4, 5, 6, 8, 9, 10, 11, 12), so each barbarian
  roll lands on exactly one hex. Inland: 3, 4, 5, 6, 8, 9, 10.
- **5–6 players:** two castles, one desert and the oasis on the coast. Coast: 3 forest, 3 hills,
  2 pasture, 2 mountains, 2 fields; inland: 2 forest, 2 hills, 3 pasture, 3 mountains, 4 fields.
  One forest, one pasture, one 2 and one 12 are not used. The coast has every number once plus a
  second 5 and a second 9, as the rulebook requires.
- One barbarian starts on the coastal 2 and one on the coastal 12. No robber, no Largest Army.

Fairness on top of the rules:

- Barbarians land by dice roll, so a coastal hex's number is also its chance of being attacked.
  The coast is split into stretches between the castle(s) and the desert. *Even barbarian threat*
  first divides the coastal tokens so that every stretch gets the same share of landings, then
  places them. In Strict mode with 3–4 players both coasts get exactly 50%.
- Threat is also weighted by distance from the castle, because knights reach nearby hexes sooner.
- In 5–6, the two 5s and the two 9s go to different stretches; the 2 and the 12 (which start with
  a barbarian) never share a stretch.
- The board shows each coastal hex's chance of getting a barbarian per attack (3 rolls, 7s and
  repeats re-rolled), and the report shows the share per coast.

### Where the rulebook only gives a picture

The printed rules place the castle, the desert and the number tokens “as shown” in a diagram.
The written rules fix everything else, and the generator follows them; for the diagram parts it
makes these choices:

- **Number tokens:** the rulebook prints one fixed pattern. The generator makes new patterns with
  the same structure (same tokens on the coast and inland, all coastal numbers different).
- **Castle position (3–4):** opposite the desert, by default in the middle of a side. On a corner,
  harbors (which sit on every second frame position) would always face the castle or the desert
  with a harbor nobody can use. You can switch to the corner in the options.
- **5–6 castles:** the two castles opposite each other, desert and oasis opposite each other, all
  four evenly spaced, so each stretch of coast has 3 hexes.

## Other notes

- Harbors on the normal island sit on every second frame position (as on the printed frame);
  fishing grounds take the free frame spots that touch two land hexes — exactly 6 (8 for 5–6).
- Seafarers frames are drawn as rectangles; New World 3–4 uses 42 hexes (19 sea), 5–6 uses 63
  (21 sea). Seafarers harbors may sit on any edge between land and sea or frame.
- Heading for New Shores small islands use the Seafarers hexes (2 gold, 2 mountains, 1 each of the
  rest for 3–4) and are generated; the main island follows the normal setup.
- New World 5–6: the extension's token table is hard to read in available copies; this tool uses
  2×2, 3×3, 4×4, 5×5, 6×5, 8×5, 9×5, 10×4, 11×4, 12×2 (39 tokens for 39 numbered hexes).

## Tests

`node tests/run-tests.js 20` builds 20 boards for each of 225 configurations and checks hex and
token counts, every number rule, harbor and fishing-ground placement, Barbarian Attack layout
(castle/desert opposite, coastal numbers, starting barbarians), island separation, and that the
same code always gives the same board.

## Files

```
index.html        page
css/style.css     styles (screen and print)
js/core.js        random numbers, hex geometry, solver
js/rules.js       component tables, scenario rules, balance presets
js/generator.js   board building and fairness scoring
js/render.js      SVG drawing
js/app.js         controls, share links, setup and fairness report
tests/run-tests.js
```

## Rule sources

- Traders & Barbarians rules (3–4): https://fgbradleys.com/wp-content/uploads/rules/TradersAndBarbarians.pdf
- Traders & Barbarians 5–6 rules: https://www.catan.com/sites/default/files/2021-08/catan_t_b_5-6_2020_rules_200820.pdf
- Traders & Barbarians (current edition) summary: https://rulespal.com/catan-traders-barbarians/rulebook
- Rivers of Catan + Merchant Trains (Caravans): https://www.catan.com/sites/default/files/2025-07/Rivers%20of%20Catan%20w%20Merchant%20Trains.pdf
- Fishing on Catan + Rivers of Catan: https://www.catan.com/sites/default/files/2025-07/Fishing%20on%20Catan%20w%20Rivers%20of%20Catan.pdf
- Rivers of Catan + Barbarian Attack: https://www.catan.com/sites/default/files/2025-07/RiversOfCatan%20w%20BarbarianAttack.pdf
- Fishing on Catan + Merchant Trains (Caravans): https://www.catan.com/sites/default/files/2025-07/Fishing%20on%20Catan%20w%20Merchant%20Trains.pdf
- Merchant Trains (Caravans) + Barbarian Attack: https://www.catan.com/sites/default/files/2025-07/Merchant%20Trains%20w%20Barbarian%20Attack.pdf
- Fishing on Catan + Barbarian Attack: https://www.catan.com/sites/default/files/2025-07/Fishing%20on%20Catan%20w%20Barbarian%20Attack.pdf
- Fishing on Catan + Seafarers: https://www.catan.com/sites/default/files/2025-07/Fishing%20on%20Catan%20w%20SEA.pdf
- Barbarian Attack + Seafarers: https://cdn.shopify.com/s/files/1/0635/0569/4940/files/Barbarian_Attack_-_Seafarers.pdf
- Seafarers rules (5th ed.): https://world-of-board-games.com.sg/docs/Catan-Seafarers-5ed.pdf
- Seafarers 5–6 rules: https://world-of-board-games.com.sg/docs/Catan-Seafarers-56-Players.pdf

Fan-made. CATAN is a trademark of CATAN GmbH; this project is not affiliated with it.
