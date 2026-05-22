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
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

const titleScreen = document.getElementById('title-screen');
const gameScreen = document.getElementById('game-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const pauseBtn = document.getElementById('pause-btn');
const messageEl = document.getElementById('message');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const highScoreEl = document.getElementById('high-score');

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

let bag = [];

function nextType() {
  if (bag.length === 0) {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
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
  const clearedRows = [];
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (state.board[y].every(Boolean)) {
      clearedRows.push(y);
      state.board.splice(y, 1);
      state.board.unshift(Array(COLS).fill(0));
      cleared += 1;
      y += 1;
    }
  }

  if (cleared > 0) {
    state.combo += 1;
    state.lines += cleared;
    const comboBonus = state.combo >= 2 ? (state.combo - 1) * 50 * state.level : 0;
    state.score += (scoreByLines[cleared] || 0) * state.level + comboBonus;
    const nextLevel = Math.floor(state.lines / 10) + 1;
    state.level = nextLevel;
    state.dropInterval = Math.max(1000 - (state.level - 1) * 80, 120);

    const labels = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!!'];
    state.lineEffect = {
      timer: 500,
      rows: clearedRows,
      label: labels[cleared] || `${cleared} LINES`,
      combo: state.combo,
    };
    if (navigator.vibrate) navigator.vibrate(cleared === 4 ? [60, 30, 60] : [30]);
  }

  return cleared;
}

function lockAndContinue() {
  mergePiece();
  const cleared = clearLines();
  if (cleared === 0) state.combo = 0;
  state.piece = state.nextQueue.shift();
  state.nextQueue.push(spawnPiece(nextType()));

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

function holdPiece() {
  if (state.gameOver || state.paused) return;
  if (state.hold === null) {
    state.hold = state.piece.type;
    state.piece = state.nextQueue.shift();
    state.nextQueue.push(spawnPiece(nextType()));
  } else {
    const temp = state.hold;
    state.hold = state.piece.type;
    state.piece = spawnPiece(temp);
  }
  if (collides(state.board, state.piece)) {
    state.gameOver = true;
    messageEl.textContent = 'GAME OVER - Rでリスタート';
    saveHighScore();
  }
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!state.hold) return;
  const size = 24;
  const matrix = SHAPES[state.hold];
  const offsetX = Math.floor((holdCanvas.width / size - matrix[0].length) / 2);
  const offsetY = Math.floor((holdCanvas.height / size - matrix.length) / 2);
  const color = COLORS[state.hold];
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) drawCell(holdCtx, x + offsetX, y + offsetY, color, size);
    });
  });
}

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? '再開' : '一時停止';
  if (state.paused) dropCounter = 0;
}

function move(dx, dy) {
  if (state.gameOver || state.paused) return;
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
  if (state.gameOver || state.paused) return;

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
  if (state.gameOver || state.paused) return;

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
  const px = x * size;
  const py = y * size;
  const gap = 1;
  const b = Math.round(size * 0.14);
  const inner = size - gap * 2;

  ctx.fillStyle = color;
  ctx.fillRect(px + gap, py + gap, inner, inner);

  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillRect(px + gap, py + gap, inner, b);
  ctx.fillRect(px + gap, py + gap, b, inner);

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(px + gap, py + size - gap - b, inner, b);
  ctx.fillRect(px + size - gap - b, py + gap, b, inner);
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

  // ゴーストピース: 落下先を半透明の枠で表示
  const ghost = { ...state.piece, y: state.piece.y };
  while (!collides(state.board, ghost)) ghost.y += 1;
  ghost.y -= 1;

  if (ghost.y !== state.piece.y) {
    ghost.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const drawY = ghost.y + y;
        if (drawY >= 0) {
          const px = (ghost.x + x) * BLOCK;
          const py = drawY * BLOCK;
          boardCtx.globalAlpha = 0.18;
          boardCtx.fillStyle = COLORS[state.piece.type];
          boardCtx.fillRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2);
          boardCtx.globalAlpha = 0.65;
          boardCtx.strokeStyle = COLORS[state.piece.type];
          boardCtx.lineWidth = 2;
          boardCtx.strokeRect(px + 2, py + 2, BLOCK - 4, BLOCK - 4);
        }
      });
    });
    boardCtx.globalAlpha = 1;
  }

  state.piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const drawY = state.piece.y + y;
      if (drawY >= 0) {
        drawCell(boardCtx, state.piece.x + x, drawY, COLORS[state.piece.type], BLOCK);
      }
    });
  });

  if (state.lineEffect && state.lineEffect.timer > 0) {
    const progress = state.lineEffect.timer / 500;
    state.lineEffect.rows.forEach(rowY => {
      boardCtx.fillStyle = `rgba(255, 255, 255, ${progress * 0.75})`;
      boardCtx.fillRect(0, rowY * BLOCK, boardCanvas.width, BLOCK);
    });
    const fontSize = Math.round(BLOCK * 1.3);
    boardCtx.globalAlpha = Math.min(1, progress * 2);
    boardCtx.fillStyle = '#2ff3ff';
    boardCtx.shadowColor = '#2ff3ff';
    boardCtx.shadowBlur = 24;
    boardCtx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    boardCtx.textAlign = 'center';
    boardCtx.textBaseline = 'middle';
    const centerY = state.lineEffect.combo >= 2
      ? boardCanvas.height / 2 - fontSize * 0.6
      : boardCanvas.height / 2;
    boardCtx.fillText(state.lineEffect.label, boardCanvas.width / 2, centerY);
    if (state.lineEffect.combo >= 2) {
      boardCtx.fillStyle = '#ff4dff';
      boardCtx.shadowColor = '#ff4dff';
      boardCtx.font = `bold ${Math.round(fontSize * 0.75)}px "Segoe UI", sans-serif`;
      boardCtx.fillText(`COMBO x${state.lineEffect.combo}`, boardCanvas.width / 2, centerY + fontSize * 1.2);
    }
    boardCtx.shadowBlur = 0;
    boardCtx.globalAlpha = 1;
  }

  if (state.paused) {
    boardCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    boardCtx.fillStyle = '#2ff3ff';
    boardCtx.font = 'bold 48px "Segoe UI", sans-serif';
    boardCtx.textAlign = 'center';
    boardCtx.textBaseline = 'middle';
    boardCtx.fillText('PAUSED', boardCanvas.width / 2, boardCanvas.height / 2);
  }
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const size = 20;
  const sectionH = nextCanvas.height / 3;
  state.nextQueue.forEach((piece, i) => {
    const matrix = piece.shape;
    const offsetX = Math.floor((nextCanvas.width / size - matrix[0].length) / 2);
    const offsetY = Math.round((i * sectionH + (sectionH - matrix.length * size) / 2) / size);
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) drawCell(nextCtx, x + offsetX, y + offsetY, COLORS[piece.type], size);
      });
    });
  });
}

function gameLoop(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (!state.gameOver && !state.paused) {
    dropCounter += delta;
    if (dropCounter >= state.dropInterval) {
      move(0, 1);
      dropCounter = 0;
    }
  }

  if (state.lineEffect) {
    state.lineEffect.timer -= delta;
    if (state.lineEffect.timer <= 0) state.lineEffect = null;
  }

  drawBoard();
  drawHold();
  drawNext();
  updateScoreUI();

  animationId = requestAnimationFrame(gameLoop);
}

function resetGame() {
  if (animationId) cancelAnimationFrame(animationId);
  bag = [];

  state = {
    board: createBoard(),
    piece: spawnPiece(nextType()),
    nextQueue: [spawnPiece(nextType()), spawnPiece(nextType()), spawnPiece(nextType())],
    score: 0,
    level: 1,
    lines: 0,
    dropInterval: 1000,
    highScore: readHighScore(),
    gameOver: false,
    paused: false,
    hold: null,
    combo: 0,
    lineEffect: null,
  };

  pauseBtn.textContent = '一時停止';
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
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Enter', 'r', 'R', 'p', 'P', 'c', 'C'].includes(key)) {
    event.preventDefault();
  }

  // 長押しリピートで回転/ハードドロップ/ポーズ/ホールドが連続発火しないようにする
  if (event.repeat && (key === 'ArrowUp' || key === ' ' || key === 'Enter' || key.toLowerCase() === 'r' || key.toLowerCase() === 'p' || key.toLowerCase() === 'c')) {
    return;
  }

  if (key === 'ArrowLeft') move(-1, 0);
  else if (key === 'ArrowRight') move(1, 0);
  else if (key === 'ArrowDown') move(0, 1);
  else if (key === 'ArrowUp' || key === ' ') rotate();
  else if (key === 'Enter') hardDrop();
  else if (key.toLowerCase() === 'r') resetGame();
  else if (key.toLowerCase() === 'p') togglePause();
  else if (key.toLowerCase() === 'c') holdPiece();
}

// タッチジェスチャー: タップ→回転、左右スワイプ→移動、下スワイプ→ハードドロップ
let touchStart = null;
let touchLastX = 0;
let touchAccX = 0;
let touchAxis = null; // 'h'=横操作確定 / 'v'=縦操作確定

function displayBlockSize() {
  return boardCanvas.getBoundingClientRect().width / COLS;
}

function handleTouchStart(e) {
  if (!gameScreen.classList.contains('active')) return;
  if (e.target.tagName === 'BUTTON') return;
  if (e.touches.length !== 1) return;
  e.preventDefault();
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
  touchLastX = t.clientX;
  touchAccX = 0;
  touchAxis = null;
}

function handleTouchMove(e) {
  if (!touchStart) return;
  e.preventDefault();
  if (e.touches.length !== 1 || !state || state.gameOver || state.paused) return;
  const t = e.touches[0];

  // スワイプ方向が未確定なら累積距離で確定する
  if (!touchAxis) {
    const adx = Math.abs(t.clientX - touchStart.x);
    const ady = Math.abs(t.clientY - touchStart.y);
    if (adx > 8 || ady > 8) touchAxis = ady > adx ? 'v' : 'h';
  }

  // 縦スワイプ確定中は横移動しない
  if (touchAxis === 'h') {
    const blockSize = displayBlockSize();
    if (blockSize <= 0) return;
    touchAccX += t.clientX - touchLastX;
    while (touchAccX >= blockSize) { move(1, 0); touchAccX -= blockSize; }
    while (touchAccX <= -blockSize) { move(-1, 0); touchAccX += blockSize; }
  }

  touchLastX = t.clientX;
}

function handleTouchEnd(e) {
  if (!touchStart || e.changedTouches.length !== 1 || e.touches.length !== 0) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const dt = Date.now() - touchStart.time;
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) {
    rotate();
  } else if (dy > 50 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    hardDrop();
  } else if (dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    holdPiece();
  }
  touchStart = null;
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);
pauseBtn.addEventListener('click', togglePause);

document.addEventListener('keydown', handleKeyDown);

// documentに登録: iOS Safariは非インタラクティブ要素のtouchstartを発火しないため
document.addEventListener('touchstart', handleTouchStart, { passive: false });
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd);
