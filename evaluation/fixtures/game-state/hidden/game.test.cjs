const test = require("node:test");
const assert = require("node:assert/strict");
const loadSubmission = require("./load-submission.cjs");

const { createGame, playMove } = loadSubmission("src/game.cjs");

test("creates a valid game and applies immutable moves", () => {
  const initial = createGame();
  assert.deepEqual(JSON.parse(JSON.stringify(initial)), { board: Array(9).fill(null), currentPlayer: "X", winner: null, moveCount: 0 });
  const next = playMove(initial, 4);
  assert.equal(initial.board[4], null);
  assert.notStrictEqual(next, initial);
  assert.notStrictEqual(next.board, initial.board);
  assert.equal(next.board[4], "X");
  assert.equal(next.currentPlayer, "O");
  assert.equal(next.moveCount, 1);
});

test("rejects illegal moves and malformed states", () => {
  const state = playMove(createGame(), 0);
  for (const index of [-1, 9, 1.5, "1"]) assert.throws(() => playMove(state, index), /Invalid move/);
  assert.throws(() => playMove(state, 0), /Cell occupied/);
  assert.throws(() => playMove({ board: [], currentPlayer: "X", winner: null, moveCount: 0 }, 0), /Invalid state/);
});

test("detects every win orientation and freezes finished games", () => {
  const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
  for (const line of lines) {
    const board = Array(9).fill(null);
    for (const cell of line) board[cell] = "X";
    const state = { board, currentPlayer: "O", winner: null, moveCount: 5 };
    const empty = board.findIndex((value) => value === null);
    const preWin = { ...state, board: [...board] };
    preWin.board[line[2]] = null;
    preWin.moveCount = 4;
    preWin.currentPlayer = "X";
    const won = playMove(preWin, line[2]);
    assert.equal(won.winner, "X");
    assert.throws(() => playMove(won, empty), /Game finished/);
  }
});

test("marks a draw only on a full non-winning board", () => {
  const state = { board: ["X","O","X","X","O","O","O","X",null], currentPlayer: "X", winner: null, moveCount: 8 };
  const draw = playMove(state, 8);
  assert.equal(draw.winner, "draw");
  assert.equal(draw.currentPlayer, "X");
  assert.throws(() => playMove(draw, 0), /Game finished/);
});
