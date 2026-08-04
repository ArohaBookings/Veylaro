import test from "node:test";
import assert from "node:assert/strict";
import { checkPlayability, playabilityGaps } from "../src/engine/playabilityGate";

/** VERBATIM shape of a real Med build that passed every structural check —
    requestAnimationFrame 2, addEventListener 2, keydown 1, gameOver 2,
    collision 1, restart 3 — and rendered a blank canvas. */
const BROKEN = `
window.onload = () => {
  const gridSize = 20;
  let snake = [{x:10,y:10}]; let direction = {x:1,y:0}; let gameRunning = false;
  const update = () => {
    const head = { x: snake[0].x + direction.x * gridSize, y: snake[0].y + direction.y * gridSize };
    if (head.x < 0 || head.x >= canvas.width / gridSize) { gameOver(); return; }
  };
  const render = () => { snake.forEach(s => ctx.fillRect(s.x * gridSize, s.y * gridSize, gridSize, gridSize)); };
  const gameOver = () => { alert('Game Over! Press R to restart.'); };
  document.addEventListener('keydown', (event) => {
    if (!gameRunning) return;
    switch (event.key) { case 'ArrowUp': break; case 'r': restartGame(); break; }
  });
  requestAnimationFrame(gameLoop);
};`;

/** The same game, written so a person can actually play it. */
const PLAYABLE = `
const CELL = 20, COLS = 20, ROWS = 20, TICK_MS = 120;
let snake = [{x:10,y:10}], dir = {x:1,y:0}, running = true, acc = 0, last = 0;
function step() {
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { running = false; return; }
  snake.unshift(head); snake.pop();
}
function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  snake.forEach(s => ctx.fillRect(s.x * CELL, s.y * CELL, CELL, CELL));
  if (!running) { ctx.fillText('Game over — press R', 40, 200); }
}
function loop(t) { const dt = t - last; last = t; acc += dt;
  while (acc >= TICK_MS) { if (running) step(); acc -= TICK_MS; }
  render(); requestAnimationFrame(loop); }
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') { restart(); return; }
  if (!running) return;
  if (e.key === 'ArrowUp' && dir.y !== 1) dir = {x:0,y:-1};
});
requestAnimationFrame(loop);`;

test("catches every defect in the game that passed all structural checks", () => {
  const issues = checkPlayability(BROKEN);
  const names = issues.map((i) => i.name);
  assert.ok(names.includes("grid/pixel units mixed"), names.join(", "));
  assert.ok(names.includes("bounds checked in the wrong unit"), names.join(", "));
  assert.ok(names.includes("restart is unreachable after game over"), names.join(", "));
  assert.ok(names.includes("grid step runs every animation frame"), names.join(", "));
  assert.ok(names.includes("alert() used for game over"), names.join(", "));
});

test("a genuinely playable game passes clean", () => {
  const issues = checkPlayability(PLAYABLE);
  assert.deepEqual(issues.map((i) => i.name), [], "a correct game must not be flagged");
});

test("restart BEFORE the running guard is reachable; after it is not", () => {
  const after = `document.addEventListener('keydown', e => { if (!running) return; if (e.key==='r') restart(); });`;
  const before = `document.addEventListener('keydown', e => { if (e.key==='r') { restart(); return; } if (!running) return; });`;
  assert.ok(checkPlayability(after).some((i) => /restart is unreachable/.test(i.name)));
  assert.ok(!checkPlayability(before).some((i) => /restart is unreachable/.test(i.name)));
});

test("a throttled grid step is not flagged as too fast", () => {
  assert.ok(!checkPlayability(PLAYABLE).some((i) => /every animation frame/.test(i.name)));
});

test("the gaps tell the model what the PLAYER experiences, not just what is wrong", () => {
  const gaps = playabilityGaps(checkPlayability(BROKEN)).join("\n");
  assert.match(gaps, /not playable/);
  assert.match(gaps, /leaves the board on the first move/);
  assert.match(gaps, /FIX:/);
});
