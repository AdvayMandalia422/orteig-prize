# The Orteig Prize

A 10-minute classroom game about 1920s aviation. Students build a plane from real 1920s parts (wings, engine, fuel tank, crew) and try to fly nonstop from New York to Paris, like Charles Lindbergh in May 1927. Their best flight goes on a live class leaderboard.

- **Game (students):** https://advaymandalia422.github.io/orteig-prize/
- **Class board (teacher/projector):** https://advaymandalia422.github.io/orteig-prize/board.html

## Running it in class

1. Before class, open the **class board** and make a board for the period (for example "Period 3 · U.S. History"). You get a 5-character code.
2. Put the board on the projector. Students scan the QR code or open the game link and type the code and their pilot name (first name and last initial).
3. Students build, fly, and rebuild. Each student's best flight appears on the board within a few seconds. The first student to reach Paris wins "the $25,000 prize".
4. Afterward, click **Debrief** on the board to compare the class's planes with the real Spirit of St. Louis and talk through the discussion questions.

Each class period should get its own board. Boards you made on a computer are listed when you open `board.html` there. To run a board from a different computer, open **Teacher tools** and copy the teacher link. Keep it private, because anyone with it can remove pilots.

## How the game works

| Part | Choices |
| --- | --- |
| Wings | Monoplane (Lindbergh's), biplane, racing wing |
| Engine | Wright Whirlwind J-5C (Lindbergh's), Liberty L-12, Curtiss OX-5 |
| Fuel tank | 100, 250 or 450 gallons (Lindbergh's) |
| Crew | Solo (Lindbergh) or pilot + navigator |

- Too heavy for the wing's lift or the engine's power, and the plane crashes on takeoff, as René Fonck's did in 1926.
- Range depends on fuel, engine thirst, and wing drag.
- **Storms (every plane):** three times on the way (a squall over Nova Scotia, fog and sleet mid-ocean, and storm clouds before Ireland), crosswinds push the plane's heading around. Students hold the **← →** arrow keys (or A/D, or the on-screen arrow buttons on tablets and phones) for about 5 seconds to keep the needle in the green. Time off course costs time and fuel. Biplanes are steadier in gusts, and racing wings get thrown around more.
- **Stay awake (solo pilots only):** click **WAKE UP** or press Space when it appears. Slow wake-ups cost time and fuel, and falling asleep costs 1½ hours off course.
- The leaderboard ranks distance first, then the fastest time to Paris.

Three builds can reach Paris. Lindbergh's lands in about 34–38 hours, depending on how well you stay awake and steer, and shaky flying can run it dry just short. A two-crew biplane with the Whirlwind and the big tank is the safe choice at about 36–38 hours. A solo biplane only makes it with excellent flying. Only a sharp player beats Lindbergh's real 33 h 30 m.

## Technical notes

- Static site on GitHub Pages: `index.html` (game), `board.html` (board), `assets/`.
- The leaderboard lives in the `orteig` schema of the Stax Supabase project. Browsers can only call five functions (`orteig_create_class`, `orteig_class`, `orteig_submit`, `orteig_board`, `orteig_remove_pilot`). Tables aren't exposed. See `supabase/migration.sql`.
- The server re-runs every flight from the parts, the wake-up times and the storm scores, so a student can't post a better result than their plane allows. The flight model exists twice, in `assets/physics.js` and `orteig.simulate` in the migration. If you change one, change the other and check them with `node tools/parity-sql.mjs`.
- `?fast=1` on the game URL speeds up playback for testing. It doesn't change scores.
- Storm difficulty is tuned in `assets/storm.js`. `node tools/tune-storm.mjs` plays it with simulated players, and `node tools/balance.mjs` shows Paris times for different skill levels.
- The map is pre-built from Natural Earth data: `cd tools && npm install && node build-map.mjs`.
