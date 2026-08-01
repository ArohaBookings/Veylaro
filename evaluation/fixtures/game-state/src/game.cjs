function createGame() {
  return { board: Array(9).fill(null), currentPlayer: "X", winner: null, moveCount: 0 };
}

function playMove(state, index) {
  state.board[index] = state.currentPlayer;
  state.currentPlayer = state.currentPlayer === "X" ? "O" : "X";
  state.moveCount += 1;
  return state;
}

module.exports = { createGame, playMove };
