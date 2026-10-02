# Refraction Beacon

> Last updated: 2026-10-02

Refraction Beacon is a quiet light-routing puzzle: a square board holds a light source that always emits in one direction, rotatable mirrors and splitters, beacons that must be lit, and rocks that swallow beams. There is exactly one goal — **light every beacon at the same time**. No timer, no losing, no reflexes required; take as long as you like.

> Quick start: open the Refraction Beacon page → click a mirror to rotate it → route the beam to every beacon → all lit means the level is cleared, then continue to the next level, or undo / restart and try again.

## Rules

- The board is square; grid coordinates start at 1 (row 1, column 1 is the top-left cell).
- The source emits a beam in a fixed direction; the beam travels in straight lines.
- **Mirror**: clicking toggles it between `/` and `\`, turning the beam by 90°.
- **Splitter**: it is both a mirror and a window — the beam that enters **passes straight through**, and **a second beam is reflected** along its own orientation, so one beam in gives two beams out.
- **Beacon**: lights up as soon as any beam reaches it; it never times out.
- **Rock**: absorbs any beam that enters it, ending that light path.
- A level is cleared when **all beacons are lit at once**. Move count is irrelevant to winning, and one beam may pass through several mirrors.
- **Moves** count **rotations only**: one rotation of a mirror or splitter = 1 move, undo rolls back one move, restart restores the level's initial layout.

## The page

| Area          | Where                 | Notes                                                                        |
| ------------- | --------------------- | ---------------------------------------------------------------------------- |
| Title & notes | Top of the page       | One-line premise, in-memory progress note, exclusive-control note            |
| Toolbar       | Top right             | Undo / Restart level / Refresh                                               |
| Board         | Middle left           | Beams drawn as an overlay; every cell is a real, focusable button            |
| Status card   | Middle right          | Lit / total beacons, moves / par, level best, level name and hint            |
| Cleared card  | Below the status card | Appears once you win: Next level / Play again — it never jumps automatically |
| Level picker  | Bottom of the page    | All six levels, completed ones are checked                                   |
| Legend        | Below the board       | Explains source, mirror, splitter, beacon, rock and the beam                 |

Every cell of the board is a focusable button: Tab to focus, then Enter or Space to rotate. Non-rotatable cells (beacons, rocks, empty space) are disabled but still expose a readable accessible name such as "Row 2, column 3 · unlit beacon".

## Common tasks

### Rotating and undoing

- Click (or focus and press Enter / Space) any mirror or splitter to rotate it; each rotation counts as one move.
- **Undo** rolls back the last rotation. It keeps working after you win — the board goes back to the unlit state so you can rethink the route.
- **Restart level** discards all your changes and returns to that level's initial layout with the move count back at zero.
- Buttons are temporarily disabled while a request is in flight, so rapid clicks cannot interleave.

### Refreshing and the CLI

The page reads the engine state every 1.5 seconds, so **you can also play from the terminal**: every CLI step shows up in the UI automatically, and vice versa.

### Saving and progress

- **There is no long-term save.** Best move counts are kept in memory and cleared when the app quits; nothing is written to any config file.
- Switching pages and coming back keeps the board and the best records (the engine holds the state); quitting the app clears them.
- All six levels are unlocked from the start; there is nothing to unlock.

### Exclusive control

Only one controller at a time — you, or an AI connected through MCP / Remote — may operate the game board; the note at the top of the page names that scope. Takeover while an AI holds it is handled by the shell; no setting is needed on this page.

## Command line

Every action is a registered command; the buttons and the CLI share the same logic.

Read the current state (always the first step before a change):

```
refraction.state
```

The result contains `level` (with its `pieces` layout and `par`), `moves`, `beams` (beam segments), `lit` (lit beacons), `won`, `canUndo`, `best`, `revision` and `levelCount`.

Every write command takes the `revision` of the most recent state you read; the engine uses it to reject stale writes so two controllers cannot overwrite each other:

```
refraction.rotate --x 3 --y 4 --revision 42
refraction.undo --revision 42
refraction.reset --revision 42
```

`--x` / `--y` are zero-based grid coordinates; rotation only applies to mirrors and splitters. To switch levels (1-based level number):

```
refraction.load --level 2 --revision 42
```

When a step fails the page shows a readable error message and refreshes the state immediately, so it never sits on a half-applied board.

## Levels

Six levels of increasing depth, all unlocked:

| Level | Name              | Focus                                                    |
| ----- | ----------------- | -------------------------------------------------------- |
| 1     | First Bend        | One mirror, one turn                                     |
| 2     | Mirror Corridor   | Two mirrors relaying the light                           |
| 3     | Behind the Rock   | Getting around a beam-absorbing rock                     |
| 4     | Split in Two      | The first splitter, two beacons                          |
| 5     | Three Faint Beams | Two splitters, three beacons                             |
| 6     | Refraction Finale | Five mirrors plus two splitters — the longest light path |

## Read more

- The trick of a splitter is "straight through plus reflected": picture a half-open door — the original beam walks on, and one more beam steps out to the side.
- Rocks are obstacles and signposts at once: they force the light path around, and often point straight at where the beacon is waiting.
