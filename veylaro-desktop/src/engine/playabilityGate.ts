/* ============================================================
   PLAYABILITY GATE — a game is proven by playing it, not by grepping it.

   MEASURED. Asked for a playable snake game, Med produced exactly the structure
   the brief demanded, and every structural check passed:

       requestAnimationFrame  2      gameOver     2
       addEventListener       2      collision    1
       keydown                1      restart      3

   update(dt) and render() separated, a real rAF loop with delta time, a keydown
   map, a restart path. On paper: perfect. On screen: a blank canvas, zero pixels
   drawn, game over before the first frame rendered.

   Four genuine defects that no token check can see:

   1. MIXED UNITS. snake starts at {x:10,y:10} in GRID cells, but the head is
      computed as `snake[0].x + direction.x * gridSize` — adding 20 PIXELS to a
      grid coordinate. The head lands at grid 30 on a 20-cell board.
   2. The bounds test compares that pixel-shifted value against
      `canvas.width / gridSize` (20). Instant, guaranteed game over on frame one.
   3. render() multiplies by gridSize AGAIN, so it disagrees with update() about
      what the numbers mean.
   4. RESTART IS UNREACHABLE. The 'r' handler sits inside `if (!gameRunning)
      return;`, so once you have lost you can never restart — the exact thing the
      brief asked for, defeated by one guard clause.

   This is the same lesson as the design grader scoring a purple rectangle 86:
   presence of the right tokens is not evidence of the right result. The only
   honest test of a game is to run it and see whether state moves.

   These checks are STATIC but semantic — they model what the code will do rather
   than whether a keyword appears. Each one is derived from a defect that actually
   shipped.
   ============================================================ */

export interface PlayabilityIssue {
  /** Short name for the run log. */
  name: string;
  /** What the player would experience. */
  effect: string;
  /** What to change. */
  fix: string;
}

/** Strip comments and strings so keyword scans can't be fooled by prose. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`[^`]*`/g, "``")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/'[^'\n]*'/g, "''");
}

/**
 * A grid game that adds a PIXEL step to a GRID coordinate.
 *
 * The tell: a movement expression multiplies the direction by a cell-size
 * variable, while rendering ALSO multiplies the same coordinate by it. Both
 * cannot be right — the position is either in cells or in pixels, never both.
 */
function mixedGridAndPixelUnits(src: string): boolean {
  const c = code(src);
  const cellVar = /\b(gridSize|cellSize|tileSize|CELL|GRID|blockSize)\b/.exec(c)?.[1];
  if (!cellVar) return false;
  // movement scales by the cell size…
  const movesByCell = new RegExp(`(?:x|y)\\s*[+\\-]\\s*[\\w.]*\\s*\\*\\s*${cellVar}\\b`).test(c)
    || new RegExp(`\\bdi?r(?:ection)?\\.[xy]\\s*\\*\\s*${cellVar}\\b`).test(c);
  // …and drawing ALSO scales the same coordinate by it.
  const drawsByCell = new RegExp(`\\.[xy]\\s*\\*\\s*${cellVar}\\b`).test(c);
  return movesByCell && drawsByCell;
}

/** Bounds compared against a cell COUNT while positions are in pixels (or vice versa). */
function boundsUnitMismatch(src: string): boolean {
  const c = code(src);
  const cellVar = /\b(gridSize|cellSize|tileSize|CELL|GRID|blockSize)\b/.exec(c)?.[1];
  if (!cellVar) return false;
  // `head.x >= canvas.width / gridSize` is a CELL COUNT bound.
  const boundsInCells = new RegExp(`[<>]=?\\s*[\\w.]*(?:width|height)\\s*\\/\\s*${cellVar}\\b`).test(c);
  return boundsInCells && mixedGridAndPixelUnits(src);
}

/**
 * A restart key handled inside a guard that is false precisely when you need it.
 *
 * `if (!running) return;` at the top of the keydown handler makes every key —
 * including restart — dead after game over.
 */
function restartUnreachableAfterLoss(src: string): boolean {
  // Locate the keydown listener in the RAW source — code() strips string
  // literals, which erases the very 'keydown' argument we need to find, and the
  // first surviving addEventListener may be an unrelated resize handler.
  const at = src.search(/addEventListener\s*\(\s*['"`]keydown['"`]|onkeydown/i);
  if (at < 0) return false;
  // A generous window rather than brace matching, which is fragile against the
  // nested switch real handlers use.
  const region = code(src.slice(at, at + 1800));
  const guardIdx = region.search(/if\s*\(\s*!\s*\w*(?:running|started|active|playing|alive|over)\w*\s*\)\s*(?:\{\s*)?return/i);
  if (guardIdx < 0) return false;
  const restartIdx = region.search(/\brestart|\breset/i);
  // Unreachable only when the restart path sits AFTER the guard that blocks it.
  return restartIdx > guardIdx;
}

/** A grid game stepping every animation frame moves ~60 cells a second. */
function noTickThrottle(src: string): boolean {
  const c = code(src);
  if (!/requestAnimationFrame/.test(c)) return false;
  const isGridStep = /\b(gridSize|cellSize|tileSize|blockSize)\b/.test(c);
  if (!isGridStep) return false;
  // Any accumulator, interval or step gate counts as throttling.
  const throttled = /\b(accumulator|elapsed|sinceLast|stepTime|tickRate|interval|MS_PER|frameTime|speed)\b/i.test(c)
    || /if\s*\([\w.]*\s*[<>]=?\s*[\w.]*(?:interval|step|tick|delay|speed)/i.test(c);
  return !throttled;
}

/** alert() blocks the loop and cannot be dismissed programmatically. */
function blockingAlertInGame(src: string): boolean {
  return /\balert\s*\(/.test(code(src));
}

/** Nothing is ever drawn because the loop never starts. */
function loopNeverStarts(src: string): boolean {
  const c = code(src);
  if (!/requestAnimationFrame/.test(c)) return true;
  // The loop function must be kicked off at least once outside its own body.
  const kicks = (c.match(/requestAnimationFrame\s*\(/g) || []).length;
  return kicks < 2; // one recursive call inside + one initial kick
}

export function checkPlayability(src: string): PlayabilityIssue[] {
  const issues: PlayabilityIssue[] = [];

  if (mixedGridAndPixelUnits(src)) {
    issues.push({
      name: "grid/pixel units mixed",
      effect: "The player's position is stored in grid cells but moved by a pixel step, so it leaves the board on the first move and the game ends before anything is drawn.",
      fix: "Pick ONE unit. Keep positions in grid cells, move by ±1 cell, and multiply by the cell size ONLY when drawing: ctx.fillRect(x * cell, y * cell, cell, cell).",
    });
  }
  if (boundsUnitMismatch(src)) {
    issues.push({
      name: "bounds checked in the wrong unit",
      effect: "The wall test compares a pixel position against a cell count, so it triggers immediately and every game is over on frame one.",
      fix: "If positions are in cells, the bound is the cell count (canvas.width / cell). If they are in pixels, the bound is canvas.width. Do not mix them.",
    });
  }
  if (restartUnreachableAfterLoss(src)) {
    issues.push({
      name: "restart is unreachable after game over",
      effect: "The restart key is handled inside a guard that returns when the game is not running — which is exactly the state you are in when you want to restart. The player must reload the page.",
      fix: "Handle the restart key BEFORE the running guard, so it works precisely when the game has ended.",
    });
  }
  if (noTickThrottle(src)) {
    issues.push({
      name: "grid step runs every animation frame",
      effect: "The player moves a whole cell 60 times a second, which is far too fast to control.",
      fix: "Accumulate delta time and only step the grid when the accumulator passes a tick interval (e.g. 120ms), then subtract it.",
    });
  }
  if (blockingAlertInGame(src)) {
    issues.push({
      name: "alert() used for game over",
      effect: "alert blocks the animation loop and the whole tab until it is dismissed by hand, so the game freezes rather than ending.",
      fix: "Draw the game-over state onto the canvas or into a DOM overlay, and keep the loop running so restart still works.",
    });
  }
  if (loopNeverStarts(src)) {
    issues.push({
      name: "the game loop is never started",
      effect: "Nothing is ever drawn — the canvas stays blank.",
      fix: "Call requestAnimationFrame(loop) once after setup, in addition to the recursive call inside the loop.",
    });
  }
  return issues;
}

/** The gap list handed back to the model. */
export function playabilityGaps(issues: readonly PlayabilityIssue[]): string[] {
  if (!issues.length) return [];
  return [
    "This game is not playable. Structure alone is not the job — these are the specific reasons a person could not play it:",
    ...issues.map((i) => `- ${i.name}: ${i.effect}\n  FIX: ${i.fix}`),
  ];
}
