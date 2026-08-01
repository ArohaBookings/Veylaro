const WIN_LINES = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];

function createGame() {
  return { board: Array(9).fill(null), currentPlayer: "X", winner: null, moveCount: 0 };
}

function validState(state) {
  return state && Array.isArray(state.board) && state.board.length === 9 &&
    state.board.every((cell) => cell === null || cell === "X" || cell === "O") &&
    (state.currentPlayer === "X" || state.currentPlayer === "O") &&
    (state.winner === null || state.winner === "X" || state.winner === "O" || state.winner === "draw") &&
    Number.isInteger(state.moveCount) && state.moveCount >= 0 && state.moveCount <= 9;
}

function playMove(state, index) {
  if (!validState(state)) throw new Error("Invalid state");
  if (state.winner !== null) throw new Error("Game finished");
  if (!Number.isInteger(index) || index < 0 || index > 8) throw new Error("Invalid move");
  if (state.board[index] !== null) throw new Error("Cell occupied");
  const board = [...state.board];
  board[index] = state.currentPlayer;
  const moveCount = state.moveCount + 1;
  const won = WIN_LINES.some((line) => line.every((cell) => board[cell] === state.currentPlayer));
  const winner = won ? state.currentPlayer : moveCount === 9 ? "draw" : null;
  return { board, currentPlayer: winner === null ? (state.currentPlayer === "X" ? "O" : "X") : state.currentPlayer, winner, moveCount };
}

module.exports = { createGame, playMove };
