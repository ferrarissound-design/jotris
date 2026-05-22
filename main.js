// ジョトリス: シンプルなテトリス風実装
// 後で拡張しやすいように、状態管理と描画を関数分離しています。

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#2040f0',
  L: '#f08a00',
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

const scoreByLines = [0, 100, 300, 500, 800];

const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

const titleScreen = document.getElementById('title-screen');
const gameScreen = document.getElementById('game-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const messageEl = document.getElementById('message');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const highScoreEl = document.getElementById('high-score');

const controls = document.querySelector('.controls');

let state;
let lastTime = 0;
let dropCounter = 0;
let animationId = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function randomType() {
  const types = Object.keys(SHAPES);
  return types[Math.floor(Math.random() * types.length)];
}

function spawnPiece(type) {
  const shape = cloneMatrix(SHAPES[type]);
  return {
    type,
    shape,
    x: Math.floor((COLS - shape[0].length) / 2),
    y: -1,
  };
}

function collides(board, piece) {
  for (let y = 0; y < piece.shape.length; y += 1) {
    for (let x = 0; x < piece.shape[y].length; x += 1) {
      if (!piece.shape[y][x]) continue;
      const newX = piece.x + x;
      const newY = piece.y + y;
      if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
      if (newY >= 0 && board[newY][newX]) return true;
    }
  }
  return false;
}

function mergePiece() {
  const { piece, board } = state;
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const by = piece.y + y;
      if (by >= 0) {
        board[by][piece.x + x] = piece.type;
      }
    });
  });
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (state.board[y].every(Boolean)) {
      state.board.splice(y, 1);
      state.board.unshift(Array(COLS).fill(0));
      cleared += 1;
      y += 1;
    }
  }

  if (cleared > 0) {
    state.lines += cleared;
    state.score += (scoreByLines[cleared] || 0) * state.level;
    const nextLevel = Math.floor(state.lines / 10) + 1;
    state.level = nextLevel;
    state.dropInterval = Math.max(1000 - (state.level - 1) * 80, 120);
  }
}

function lockAndContinue() {
  mergePiece();
  clearLines();
  state.piece = state.next;
  state.next = spawnPiece(randomType());

  if (collides(state.board, state.piece)) {
    state.gameOver = true;
    messageEl.textContent = 'GAME OVER - Rでリスタート';
    saveHighScore();
  }
}

function updateScoreUI() {
  scoreEl.textContent = String(state.score);
  levelEl.textContent = String(state.level);
  linesEl.textContent = String(state.lines);
  highScoreEl.textContent = String(state.highScore);
}

function move(dx, dy) {
  if (state.gameOver) return;
  state.piece.x += dx;
  state.piece.y += dy;
  if (collides(state.board, state.piece)) {
    state.piece.x -= dx;
    state.piece.y -= dy;
    if (dy === 1) {
      lockAndContinue();
    }
  }
}

function rotate() {
  if (state.gameOver) return;

  const originalShape = state.piece.shape;
  const originalX = state.piece.x;
  const originalY = state.piece.y;
  state.piece.shape = rotateMatrix(originalShape);

  // 壁・床付近でも回転しやすいように簡易キックを試す
  const kicks = [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: -1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 0, y: -2 },
  ];

  for (const kick of kicks) {
    state.piece.x = originalX + kick.x;
    state.piece.y = originalY + kick.y;
    if (!collides(state.board, state.piece)) {
      return;
    }
  }

  state.piece.shape = originalShape;
  state.piece.x = originalX;
  state.piece.y = originalY;
}

function hardDrop() {
  if (state.gameOver) return;

  let droppedRows = 0;
  while (!collides(state.board, state.piece)) {
    state.piece.y += 1;
    droppedRows += 1;
  }

  // 最後の1歩は衝突しているので戻す
  state.piece.y -= 1;
  droppedRows = Math.max(0, droppedRows - 1);

  // ハードドロップの落下距離に応じたボーナス
  state.score += droppedRows * 2;

  lockAndContinue();
}

function readHighScore() {
  try {
    return Number(localStorage.getItem('jotris_high_score') || 0);
  } catch (_) {
    return 0;
  }
}

function saveHighScore() {
  if (state.score > state.highScore) {
    state.highScore = state.score;
    try {
      localStorage.setItem('jotris_high_score', String(state.highScore));
    } catch (_) {
      // ストレージが無効な環境でもゲーム進行を止めない
    }
    updateScoreUI();
  }
}

function drawCell(ctx, x, y, color, size) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(x * size, y * size, size, size);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.fillStyle = '#060c1e';
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  state.board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) drawCell(boardCtx, x, y, COLORS[cell], BLOCK);
    });
  });

  state.piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const drawY = state.piece.y + y;
      if (drawY >= 0) {
        drawCell(boardCtx, state.piece.x + x, drawY, COLORS[state.piece.type], BLOCK);
      }
    });
  });
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const size = 24;
  const matrix = state.next.shape;
  const offsetX = Math.floor((nextCanvas.width / size - matrix[0].length) / 2);
  const offsetY = Math.floor((nextCanvas.height / size - matrix.length) / 2);

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) drawCell(nextCtx, x + offsetX, y + offsetY, COLORS[state.next.type], size);
    });
  });
}

function gameLoop(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (!state.gameOver) {
    dropCounter += delta;
    if (dropCounter >= state.dropInterval) {
      move(0, 1);
      dropCounter = 0;
    }
  }

  drawBoard();
  drawNext();
  updateScoreUI();

  animationId = requestAnimationFrame(gameLoop);
}

function resetGame() {
  if (animationId) cancelAnimationFrame(animationId);

  state = {
    board: createBoard(),
    piece: spawnPiece(randomType()),
    next: spawnPiece(randomType()),
    score: 0,
    level: 1,
    lines: 0,
    dropInterval: 1000,
    highScore: readHighScore(),
    gameOver: false,
  };

  messageEl.textContent = '';
  dropCounter = 0;
  lastTime = 0;
  updateScoreUI();
  gameLoop();
}

function startGame() {
  titleScreen.classList.remove('active');
  gameScreen.classList.add('active');
  resetGame();
}

function handleKeyDown(event) {
  if (!gameScreen.classList.contains('active')) return;

  const key = event.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Enter', 'r', 'R'].includes(key)) {
    event.preventDefault();
  }

  // 長押しリピートで回転/ハードドロップが連続発火しないようにする
  if (event.repeat && (key === 'ArrowUp' || key === ' ' || key === 'Enter' || key.toLowerCase() === 'r')) {
    return;
  }

  if (key === 'ArrowLeft') move(-1, 0);
  else if (key === 'ArrowRight') move(1, 0);
  else if (key === 'ArrowDown') move(0, 1);
  else if (key === 'ArrowUp' || key === ' ') rotate();
  else if (key === 'Enter') hardDrop();
  else if (key.toLowerCase() === 'r') resetGame();
}

function handleControl(action) {
  if (!state) return;
  if (action === 'left') move(-1, 0);
  if (action === 'right') move(1, 0);
  if (action === 'down') move(0, 1);
  if (action === 'rotate') rotate();
  if (action === 'drop') hardDrop();
}

function handleButtonPress(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  event.preventDefault();
  handleControl(btn.dataset.action);
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);

document.addEventListener('keydown', handleKeyDown);
controls.addEventListener('click', handleButtonPress);

// タッチ端末向け: 操作ボタン周辺のスクロールやズームの誤作動を抑制
['touchmove'].forEach((evt) => {
  controls.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
});
