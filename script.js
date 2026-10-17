(() => {
  "use strict";

  const SIZE = 8;
  const RED = "red";
  const BLACK = "black";
  const boardEl = document.getElementById("board");
  const modeSelect = document.getElementById("modeSelect");
  const difficultySelect = document.getElementById("difficultySelect");
  const difficultyGroup = document.getElementById("difficultyGroup");
  const statusTitle = document.getElementById("statusTitle");
  const turnPill = document.getElementById("turnPill");
  const boardHint = document.getElementById("boardHint");
  const redCountEl = document.getElementById("redCount");
  const blackCountEl = document.getElementById("blackCount");
  const moveCountEl = document.getElementById("moveCount");
  const captureCountEl = document.getElementById("captureCount");
  const redRole = document.getElementById("redRole");
  const blackRole = document.getElementById("blackRole");
  const modal = document.getElementById("resultModal");
  const resultTitle = document.getElementById("resultTitle");
  const resultText = document.getElementById("resultText");
  const liveMessage = document.getElementById("liveMessage");

  let state;
  let selected = null;
  let legalMoves = [];
  let history = [];
  let flipped = false;
  let gameOver = false;
  let aiThinking = false;
  let aiTimer = null;
  let forcedPiece = null;

  function makeInitialBoard() {
    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 === 1) board[r][c] = { color: BLACK, king: false };
      }
    }
    for (let r = 5; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 === 1) board[r][c] = { color: RED, king: false };
      }
    }
    return board;
  }

  function freshState() {
    return { board: makeInitialBoard(), turn: RED, moves: 0, captures: 0 };
  }

  function cloneState(s) {
    return {
      board: s.board.map(row => row.map(piece => piece ? { ...piece } : null)),
      turn: s.turn, moves: s.moves, captures: s.captures
    };
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function other(color) { return color === RED ? BLACK : RED; }

  function directions(piece) {
    if (piece.king) return [-1, 1];
    return piece.color === RED ? [-1] : [1];
  }

  function movesForPiece(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const moves = [];
    for (const dr of directions(piece)) {
      for (const dc of [-1, 1]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (!board[nr][nc]) {
          moves.push({ from: [r, c], to: [nr, nc], capture: null });
        } else if (board[nr][nc].color !== piece.color) {
          const jr = r + dr * 2, jc = c + dc * 2;
          if (inBounds(jr, jc) && !board[jr][jc]) {
            moves.push({ from: [r, c], to: [jr, jc], capture: [nr, nc] });
          }
        }
      }
    }
    return moves;
  }

  function allLegalMoves(s, color = s.turn) {
    const normal = [], captures = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = s.board[r][c];
        if (!p || p.color !== color) continue;
        for (const move of movesForPiece(s.board, r, c)) {
          (move.capture ? captures : normal).push(move);
        }
      }
    }
    return captures.length ? captures : normal;
  }

  function movesForSelected(r, c) {
    return legalMoves.filter(m => m.from[0] === r && m.from[1] === c);
  }

  function saveHistory() {
    history.push(cloneState(state));
    if (history.length > 100) history.shift();
  }

  function startNewGame() {
    if (aiTimer) clearTimeout(aiTimer);
    state = freshState();
    selected = null;
    legalMoves = [];
    history = [];
    gameOver = false;
    aiThinking = false;
    forcedPiece = null;
    modal.hidden = true;
    render();
    updateStatus("Red's turn", "Select a red piece to see its legal moves.");
  }

  function updateStatus(title, hint) {
    statusTitle.textContent = title;
    boardHint.textContent = hint;
    turnPill.textContent = gameOver ? "GAME OVER" : `${state.turn.toUpperCase()} TURN`;
    turnPill.className = `turn-pill ${state.turn === RED ? "red-pill" : "black-pill"}`;
    liveMessage.textContent = `${title}. ${hint}`;
  }

  function isComputerTurn() {
    return modeSelect.value === "computer" && state.turn === BLACK && !gameOver;
  }

  function render() {
    boardEl.innerHTML = "";
    for (let viewR = 0; viewR < SIZE; viewR++) {
      for (let viewC = 0; viewC < SIZE; viewC++) {
        const r = flipped ? SIZE - 1 - viewR : viewR;
        const c = flipped ? SIZE - 1 - viewC : viewC;
        const square = document.createElement("button");
        square.type = "button";
        square.className = `square ${(r + c) % 2 === 1 ? "dark" : "light"}`;
        square.setAttribute("role", "gridcell");
        square.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);
        square.dataset.r = r;
        square.dataset.c = c;

        if (selected && selected[0] === r && selected[1] === c) square.classList.add("selected");
        const targetMove = legalMoves.find(m => m.to[0] === r && m.to[1] === c);
        if (targetMove) square.classList.add(targetMove.capture ? "capture-target" : "legal");

        const piece = state.board[r][c];
        if (piece) {
          const pieceEl = document.createElement("span");
          pieceEl.className = `piece ${piece.color}${piece.king ? " king" : ""}`;
          square.appendChild(pieceEl);
          square.setAttribute("aria-label", `${piece.color}${piece.king ? " king" : ""} piece, row ${r + 1}, column ${c + 1}`);
        }
        square.addEventListener("click", () => handleSquareClick(r, c));
        boardEl.appendChild(square);
      }
    }

    const redPieces = state.board.flat().filter(p => p && p.color === RED).length;
    const blackPieces = state.board.flat().filter(p => p && p.color === BLACK).length;
    redCountEl.textContent = redPieces;
    blackCountEl.textContent = blackPieces;
    moveCountEl.textContent = state.moves;
    captureCountEl.textContent = state.captures;
    difficultyGroup.hidden = modeSelect.value !== "computer";
    redRole.textContent = "Player 1";
    blackRole.textContent = modeSelect.value === "computer" ? "Computer" : "Player 2";
  }

  function handleSquareClick(r, c) {
    if (gameOver || aiThinking || isComputerTurn() || (r + c) % 2 === 0) return;
    const piece = state.board[r][c];

    if (selected) {
      const move = movesForSelected(...selected).find(m => m.to[0] === r && m.to[1] === c);
      if (move) {
        performMove(move);
        return;
      }
    }

    if (forcedPiece) {
      updateStatus("Continue the capture", "You must continue jumping with the same piece.");
      return;
    }

    if (piece && piece.color === state.turn) {
      const available = movesForSelected(r, c);
      if (!available.length) {
        updateStatus(`${state.turn === RED ? "Red" : "Black"}'s turn`, "That piece has no legal move. Choose another piece.");
        return;
      }
      selected = [r, c];
      render();
      updateStatus(`${state.turn === RED ? "Red" : "Black"} selected`, available.some(m => m.capture)
        ? "Capture is mandatory. Choose a highlighted capture square."
        : "Choose a highlighted square to move.");
    } else {
      selected = null;
      render();
      updateStatus(`${state.turn === RED ? "Red" : "Black"}'s turn`, "Select one of your pieces.");
    }
  }

  function performMove(move, fromAI = false) {
    saveHistory();
    const [r, c] = move.from;
    const [nr, nc] = move.to;
    const piece = state.board[r][c];
    state.board[nr][nc] = piece;
    state.board[r][c] = null;
    if (move.capture) {
      state.board[move.capture[0]][move.capture[1]] = null;
      state.captures++;
    }
    if ((piece.color === RED && nr === 0) || (piece.color === BLACK && nr === 7)) {
      piece.king = true;
    }
    state.moves++;
    selected = null;
    legalMoves = [];
    const movingColor = state.turn;

    // A multi-jump must continue with the same piece while another capture is available.
    if (move.capture) {
      const followUps = movesForPiece(state.board, nr, nc).filter(m => m.capture);
      if (followUps.length) {
        selected = [nr, nc];
        forcedPiece = [nr, nc];
        legalMoves = followUps;
        render();
        updateStatus(`${movingColor === RED ? "Red" : "Black"} must continue capturing`,
          "Choose another highlighted jump with the same piece.");
        if (fromAI) {
          aiThinking = true;
          aiTimer = setTimeout(() => {
            aiThinking = false;
            const followUp = followUps[Math.floor(Math.random() * followUps.length)];
            performMove(followUp, true);
          }, 250);
        }
        return;
      }
    }

    forcedPiece = null;
    state.turn = other(state.turn);
    legalMoves = allLegalMoves(state);
    render();
    if (checkWinner()) return;

    updateStatus(`${state.turn === RED ? "Red" : "Black"}'s turn`,
      state.turn === RED ? "Select a red piece to move." : "Select a black piece to move.");

    if (isComputerTurn() && !fromAI) scheduleComputerMove();
  }

  function checkWinner() {
    const red = state.board.flat().filter(p => p && p.color === RED).length;
    const black = state.board.flat().filter(p => p && p.color === BLACK).length;
    const available = allLegalMoves(state, state.turn);
    if (red === 0 || black === 0 || available.length === 0) {
      gameOver = true;
      const winner = red === 0 ? BLACK : black === 0 ? RED : other(state.turn);
      render();
      updateStatus(`${winner === RED ? "Red" : "Black"} wins!`, "The match is complete.");
      resultTitle.textContent = `${winner === RED ? "Red" : "Black"} wins!`;
      resultText.textContent = available.length === 0 && red > 0 && black > 0
        ? "The other player has no legal moves."
        : "All opposing pieces have been captured.";
      modal.hidden = false;
      document.getElementById("playAgainButton").focus();
      return true;
    }
    return false;
  }

  function scheduleComputerMove() {
    aiThinking = true;
    updateStatus("Computer is thinking…", "The computer is choosing a legal move.");
    aiTimer = setTimeout(() => {
      const depth = Number(difficultySelect.value);
      const move = chooseComputerMove(state, depth);
      aiThinking = false;
      if (move && !gameOver && state.turn === BLACK) performMove(move, true);
    }, 300);
  }

  function applyMoveToState(s, move) {
    const next = cloneState(s);
    const [r, c] = move.from, [nr, nc] = move.to;
    const piece = next.board[r][c];
    next.board[nr][nc] = piece;
    next.board[r][c] = null;
    if (move.capture) next.board[move.capture[0]][move.capture[1]] = null;
    if ((piece.color === RED && nr === 0) || (piece.color === BLACK && nr === 7)) piece.king = true;
    next.turn = other(s.turn);
    next.moves++;
    if (move.capture) next.captures++;
    return next;
  }

  function evaluate(s) {
    let score = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = s.board[r][c];
        if (!p) continue;
        const value = p.king ? 5 : 3;
        const advancement = p.color === BLACK ? r * 0.08 : (7 - r) * 0.08;
        score += (p.color === BLACK ? 1 : -1) * (value + advancement);
      }
    }
    return score;
  }

  function minimax(s, depth, alpha, beta, maximizing) {
    const moves = allLegalMoves(s, s.turn);
    const red = s.board.flat().filter(p => p && p.color === RED).length;
    const black = s.board.flat().filter(p => p && p.color === BLACK).length;
    if (depth === 0 || red === 0 || black === 0 || moves.length === 0) {
      if (black === 0 || (moves.length === 0 && s.turn === BLACK)) return -1000 - depth;
      if (red === 0 || (moves.length === 0 && s.turn === RED)) return 1000 + depth;
      return evaluate(s);
    }
    if (maximizing) {
      let best = -Infinity;
      for (const move of moves) {
        const value = minimax(applyMoveToState(s, move), depth - 1, alpha, beta, false);
        best = Math.max(best, value);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const move of moves) {
        const value = minimax(applyMoveToState(s, move), depth - 1, alpha, beta, true);
        best = Math.min(best, value);
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  function chooseComputerMove(s, difficulty) {
    const moves = allLegalMoves(s, BLACK);
    if (!moves.length) return null;
    if (difficulty === 1) return moves[Math.floor(Math.random() * moves.length)];

    const depth = difficulty === 2 ? 3 : 5;
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const move of moves) {
      const score = minimax(applyMoveToState(s, move), depth - 1, -Infinity, Infinity, false);
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) bestMoves.push(move);
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function undoMove() {
    if (!history.length || aiThinking) return;
    if (aiTimer) clearTimeout(aiTimer);
    aiThinking = false;
    // In computer mode, undo both the computer's move and the player's preceding move when possible.
    state = history.pop();
    if (modeSelect.value === "computer" && state.turn === BLACK && history.length) {
      state = history.pop();
    }
    selected = null;
    forcedPiece = null;
    legalMoves = allLegalMoves(state);
    gameOver = false;
    modal.hidden = true;
    render();
    updateStatus(`${state.turn === RED ? "Red" : "Black"}'s turn`, "Last move undone.");
  }

  function showLegalMoves() {
    if (gameOver || aiThinking || isComputerTurn()) return;
    selected = null;
    legalMoves = allLegalMoves(state);
    render();
    updateStatus("Legal moves highlighted", legalMoves.some(m => m.capture)
      ? "Captures are mandatory. Yellow rings mark capture destinations."
      : "Green dots mark legal destinations.");
  }

  document.getElementById("newGame").addEventListener("click", startNewGame);
  document.getElementById("newGameTop").addEventListener("click", startNewGame);
  document.getElementById("playAgainButton").addEventListener("click", startNewGame);
  document.getElementById("undoButton").addEventListener("click", undoMove);
  document.getElementById("hintButton").addEventListener("click", showLegalMoves);
  document.getElementById("flipButton").addEventListener("click", () => {
    flipped = !flipped;
    render();
  });
  modeSelect.addEventListener("change", startNewGame);
  difficultySelect.addEventListener("change", () => {
    if (modeSelect.value === "computer" && state.turn === BLACK && !gameOver) {
      scheduleComputerMove();
    }
  });

  state = freshState();
  legalMoves = allLegalMoves(state);
  render();
  updateStatus("Red's turn", "Select a red piece to see its legal moves.");
})();
