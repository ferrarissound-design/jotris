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
// T-スピン系の加点（消去ライン数 0/1/2/3 に対応、レベル倍率を掛ける）
const tspinScores = [400, 800, 1200, 1600];
const miniTspinScores = [100, 200];
// パーフェクトクリア（全消し）ボーナス（消去ライン数 1/2/3/4 に対応）
const perfectClearScores = [0, 800, 1200, 1800, 2000];

const LOCK_DELAY = 500;
const LOCK_MAX_RESETS = 15;

const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

const titleScreen = document.getElementById('title-screen');
const gameScreen = document.getElementById('game-screen');
const restartBtn = document.getElementById('restart-btn');
const pauseBtn = document.getElementById('pause-btn');
const titleBtn = document.getElementById('title-btn');
const helpBtn = document.getElementById('help-btn');
const helpOverlay = document.getElementById('help-overlay');
const helpCloseBtn = document.getElementById('help-close-btn');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseTitleBtn = document.getElementById('pause-title-btn');
const messageEl = document.getElementById('message');
const bgm = document.getElementById('bgm');
const seLines = [document.getElementById('se-line-1'), document.getElementById('se-line-2')];

function bgmPlay() { if (bgm) bgm.play().catch(() => {}); }
function bgmPause() { if (bgm) bgm.pause(); }
function bgmStop() { if (bgm) { bgm.pause(); bgm.currentTime = 0; } }

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const highScoreEl = document.getElementById('high-score');

let state;
let lastTime = 0;
let dropCounter = 0;
let animationId = null;

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function unlockAudio() {
  try {
    const ctx = getAudioCtx();
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (_) {}
}

function playMoveSound() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.04);
  } catch (_) {}
}

function playLineClearSound() {
  try {
    const se = seLines[Math.floor(Math.random() * seLines.length)];
    if (se) { se.currentTime = 0; se.play().catch(() => {}); }
  } catch (_) {}
}

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
    rotation: 0,
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

// 盤面のマス（bx, by）がブロック or 壁 or 床で塞がっているか
function isCellBlocked(bx, by) {
  if (bx < 0 || bx >= COLS || by >= ROWS) return true;
  if (by < 0) return false; // 盤面上端より上は空きとみなす
  return Boolean(state.board[by][bx]);
}

// T-スピン判定: 直前の操作が回転で、T字の3隅以上が塞がっていれば成立。
// 正面2隅が両方塞がっている、または大きな壁蹴り（キック）で入った場合は「本T-スピン」、
// それ以外は「ミニT-スピン」。戻り値は 'tspin' / 'mini' / 'none'。
function detectTSpin() {
  const p = state.piece;
  if (!p || p.type !== 'T' || !state.lastMoveWasRotation) return 'none';

  // T字は常に3x3行列。中心を挟む四隅を盤面座標で判定する。
  const cornerOffsets = [[0, 0], [2, 0], [0, 2], [2, 2]];
  const blocked = cornerOffsets.map(([ox, oy]) => isCellBlocked(p.x + ox, p.y + oy));
  const total = blocked.filter(Boolean).length;
  if (total < 3) return 'none';

  // 向き（rotation 0=上/1=右/2=下/3=左）ごとの「正面2隅」のインデックス
  const frontByRot = { 0: [0, 1], 1: [1, 3], 2: [2, 3], 3: [0, 2] };
  const [fa, fb] = frontByRot[p.rotation % 4] || [0, 1];
  const frontBoth = blocked[fa] && blocked[fb];
  const farKick = state.lastKick && (Math.abs(state.lastKick.x) >= 2 || state.lastKick.y <= -2);
  return (frontBoth || farKick) ? 'tspin' : 'mini';
}

function isBoardEmpty() {
  return state.board.every((row) => row.every((cell) => !cell));
}

function clearLines(tspin) {
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

  const isTspin = tspin === 'tspin';
  const isMini = tspin === 'mini';

  // 何も起きていない（ライン消去なし かつ T-スピンでもない）なら加点なし
  if (cleared === 0 && !isTspin && !isMini) {
    return cleared;
  }

  if (cleared > 0) {
    playLineClearSound();
    state.combo += 1;
    state.lines += cleared;
    const nextLevel = Math.floor(state.lines / 10) + 1;
    state.level = nextLevel;
    state.dropInterval = Math.max(1000 - (state.level - 1) * 80, 120);
  }

  // Back-to-Back: 難しい消去（テトリス、またはライン消去付きT-スピン）が
  // 通常消去を挟まず連続したときにボーナス。
  const difficult = cleared === 4 || ((isTspin || isMini) && cleared >= 1);
  let b2bActive = false;
  if (cleared > 0) {
    if (difficult) {
      if (state.b2b) b2bActive = true;
      state.b2b = true;
    } else {
      state.b2b = false; // 通常の1〜3ライン消去はB2Bを途切れさせる
    }
  }

  // 消去点数の算出（T-スピン > ミニT-スピン > 通常 の順で参照）
  let baseScore;
  if (isTspin) baseScore = tspinScores[cleared] ?? 0;
  else if (isMini) baseScore = miniTspinScores[cleared] ?? tspinScores[cleared] ?? 0;
  else baseScore = scoreByLines[cleared] || 0;

  let lineScore = baseScore * state.level;
  if (b2bActive) lineScore = Math.round(lineScore * 1.5);

  const comboBonus = state.combo >= 2 ? (state.combo - 1) * 50 * state.level : 0;

  // パーフェクトクリア（全消し）
  const perfect = cleared > 0 && isBoardEmpty();
  const pcBonus = perfect ? (perfectClearScores[cleared] || 2000) * state.level : 0;

  state.score += lineScore + comboBonus + pcBonus;

  // 表示ラベルの組み立て
  const normalLabels = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!!'];
  const tspinLabels = ['T-SPIN', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'];
  let label;
  if (perfect) {
    label = 'PERFECT CLEAR';
  } else if (isTspin) {
    label = tspinLabels[cleared] || `T-SPIN ${cleared}`;
  } else if (isMini) {
    label = cleared >= 1 ? 'MINI T-SPIN ' + (normalLabels[cleared] || cleared) : 'MINI T-SPIN';
  } else {
    label = normalLabels[cleared] || `${cleared} LINES`;
  }
  if (b2bActive && !perfect) label = 'B2B ' + label;

  state.lineEffect = {
    timer: 500,
    rows: clearedRows,
    label,
    combo: cleared > 0 ? state.combo : 0,
  };

  if (navigator.vibrate) {
    if (perfect || isTspin) navigator.vibrate([50, 30, 50, 30, 50]);
    else navigator.vibrate(cleared === 4 ? [60, 30, 60] : [30]);
  }

  return cleared;
}

function lockAndContinue() {
  const tspin = detectTSpin();
  mergePiece();
  const cleared = clearLines(tspin);
  if (cleared === 0) state.combo = 0;
  state.piece = state.nextQueue.shift();
  state.nextQueue.push(spawnPiece(nextType()));
  state.lastMoveWasRotation = false;
  state.lastKick = null;

  if (collides(state.board, state.piece)) {
    state.gameOver = true;
    messageEl.textContent = 'GAME OVER - Rでリスタート';
    saveHighScore();
    bgmStop();
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
  state.lockDelay = { active: false, timer: 0, resets: 0 };
  state.lastMoveWasRotation = false;
  state.lastKick = null;
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
  pauseOverlay.hidden = !state.paused;
  if (state.paused) { dropCounter = 0; bgmPause(); } else { bgmPlay(); }
}

function isOnGround() {
  return collides(state.board, { ...state.piece, y: state.piece.y + 1 });
}

function move(dx, dy) {
  if (state.gameOver || state.paused) return;
  state.piece.x += dx;
  state.piece.y += dy;
  if (collides(state.board, state.piece)) {
    state.piece.x -= dx;
    state.piece.y -= dy;
    if (dy === 1 && !state.lockDelay.active) {
      state.lockDelay = { active: true, timer: LOCK_DELAY, resets: 0 };
      dropCounter = 0;
    }
  } else {
    // 平行移動が成立したのでT-スピン成立フラグを解除（直前の操作が回転でなくなる）
    state.lastMoveWasRotation = false;
    if (dx !== 0) playMoveSound();
    if (state.lockDelay.active) {
      if (isOnGround()) {
        if (state.lockDelay.resets < LOCK_MAX_RESETS) {
          state.lockDelay.timer = LOCK_DELAY;
          state.lockDelay.resets++;
        }
      } else {
        state.lockDelay = { active: false, timer: 0, resets: 0 };
      }
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

  let rotated = false;
  for (const kick of kicks) {
    state.piece.x = originalX + kick.x;
    state.piece.y = originalY + kick.y;
    if (!collides(state.board, state.piece)) {
      rotated = true;
      state.lastKick = kick;
      break;
    }
  }

  if (!rotated) {
    state.piece.shape = originalShape;
    state.piece.x = originalX;
    state.piece.y = originalY;
    return;
  }

  // 回転成立: T-スピン判定用に「直前の操作は回転」と向きを記録
  state.piece.rotation = (state.piece.rotation + 1) % 4;
  state.lastMoveWasRotation = true;

  if (state.lockDelay.active) {
    if (isOnGround()) {
      if (state.lockDelay.resets < LOCK_MAX_RESETS) {
        state.lockDelay.timer = LOCK_DELAY;
        state.lockDelay.resets++;
      }
    } else {
      state.lockDelay = { active: false, timer: 0, resets: 0 };
    }
  }
}

function softDrop() {
  if (state.gameOver || state.paused) return;
  const prevY = state.piece.y;
  move(0, 1);
  if (state.piece.y > prevY) state.score += 1;
}

function hardDrop() {
  if (state.gameOver || state.paused) return;
  state.lockDelay = { active: false, timer: 0, resets: 0 };

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

  // 実際に落下した場合は「直前の操作＝回転」ではなくなるのでT-スピン成立を解除。
  // 回転で隙間に収まりそのまま落下距離0でドロップした場合のみT-スピン成立を維持する。
  if (droppedRows > 0) state.lastMoveWasRotation = false;

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
    state.newRecord = true;
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

  if (state.lockDelay.active) {
    const ratio = state.lockDelay.timer / LOCK_DELAY;
    boardCtx.globalAlpha = 0.45 + 0.55 * ratio;
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
  boardCtx.globalAlpha = 1;

  if (!state.gameOver && state.lineEffect && state.lineEffect.timer > 0) {
    const progress = state.lineEffect.timer / 500;
    state.lineEffect.rows.forEach(rowY => {
      boardCtx.fillStyle = `rgba(255, 255, 255, ${progress * 0.75})`;
      boardCtx.fillRect(0, rowY * BLOCK, boardCanvas.width, BLOCK);
    });
    // ラベルが長い場合（B2B / T-SPIN / PERFECT CLEAR 等）は盤面幅に収まるよう縮小
    let fontSize = Math.round(BLOCK * 1.3);
    const maxWidth = boardCanvas.width - 16;
    boardCtx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    while (fontSize > 12 && boardCtx.measureText(state.lineEffect.label).width > maxWidth) {
      fontSize -= 2;
      boardCtx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    }
    boardCtx.globalAlpha = Math.min(1, progress * 2);
    boardCtx.fillStyle = '#2ff3ff';
    boardCtx.shadowColor = '#2ff3ff';
    boardCtx.shadowBlur = 24;
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

  if (state.gameOver) {
    const cx = boardCanvas.width / 2;
    boardCtx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    boardCtx.textAlign = 'center';
    boardCtx.textBaseline = 'middle';

    boardCtx.fillStyle = '#ff6a8a';
    boardCtx.shadowColor = '#ff6a8a';
    boardCtx.shadowBlur = 22;
    boardCtx.font = 'bold 44px "Segoe UI", sans-serif';
    boardCtx.fillText('GAME OVER', cx, 145);
    boardCtx.shadowBlur = 0;

    boardCtx.fillStyle = '#a7dfff';
    boardCtx.font = '15px "Segoe UI", sans-serif';
    boardCtx.fillText('SCORE', cx, 215);
    boardCtx.fillStyle = '#d8f7ff';
    boardCtx.font = 'bold 38px "Segoe UI", sans-serif';
    boardCtx.fillText(String(state.score), cx, 252);

    boardCtx.fillStyle = '#a7dfff';
    boardCtx.font = '15px "Segoe UI", sans-serif';
    boardCtx.fillText('HI-SCORE', cx, 305);
    boardCtx.fillStyle = '#d8f7ff';
    boardCtx.font = 'bold 32px "Segoe UI", sans-serif';
    boardCtx.fillText(String(state.highScore), cx, 338);

    if (state.newRecord) {
      boardCtx.fillStyle = '#f0f000';
      boardCtx.shadowColor = '#f0f000';
      boardCtx.shadowBlur = 16;
      boardCtx.font = 'bold 20px "Segoe UI", sans-serif';
      boardCtx.fillText('★ NEW RECORD! ★', cx, 378);
      boardCtx.shadowBlur = 0;
    }

    if (Math.floor(Date.now() / 600) % 2 === 0) {
      boardCtx.fillStyle = '#a7dfff';
      boardCtx.font = '14px "Segoe UI", sans-serif';
      boardCtx.fillText('タップ/R リスタート・T タイトルへ', cx, 530);
    }
  } else if (state.paused) {
    // 一時停止中は盤面を隠す（覗き見防止）。メニューはHTMLオーバーレイで表示
    boardCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
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
    if (state.lockDelay.active) {
      state.lockDelay.timer -= delta;
      if (state.lockDelay.timer <= 0) {
        state.lockDelay = { active: false, timer: 0, resets: 0 };
        lockAndContinue();
      }
    } else {
      dropCounter += delta;
      if (dropCounter >= state.dropInterval) {
        move(0, 1);
        dropCounter = 0;
      }
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
  unlockAudio();
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
    newRecord: false,
    lockDelay: { active: false, timer: 0, resets: 0 },
    b2b: false,
    lastMoveWasRotation: false,
    lastKick: null,
  };

  pauseBtn.textContent = '一時停止';
  pauseOverlay.hidden = true;
  messageEl.textContent = '';
  dropCounter = 0;
  lastTime = 0;
  updateScoreUI();
  bgmStop();
  bgmPlay();
  gameLoop();
}

function startGame() {
  unlockAudio();
  titleScreen.classList.remove('active');
  gameScreen.classList.add('active');
  resetGame();
}

function goToTitle() {
  if (state && !state.gameOver) saveHighScore();
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  bgmStop();
  pauseOverlay.hidden = true;
  messageEl.textContent = '';
  gameScreen.classList.remove('active');
  titleScreen.classList.add('active');
}

function handleKeyDown(event) {
  if (!gameScreen.classList.contains('active')) return;

  const key = event.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Enter', 'r', 'R', 'p', 'P', 'c', 'C', 't', 'T'].includes(key)) {
    event.preventDefault();
  }

  // 長押しリピートで回転/ハードドロップ/ポーズ/ホールドが連続発火しないようにする
  if (event.repeat && (key === 'ArrowUp' || key === ' ' || key === 'Enter' || key.toLowerCase() === 'r' || key.toLowerCase() === 'p' || key.toLowerCase() === 'c' || key.toLowerCase() === 't')) {
    return;
  }

  if (key === 'ArrowLeft') move(-1, 0);
  else if (key === 'ArrowRight') move(1, 0);
  else if (key === 'ArrowDown') softDrop();
  else if (key === 'ArrowUp' || key === ' ') rotate();
  else if (key === 'Enter') hardDrop();
  else if (key.toLowerCase() === 'r') resetGame();
  else if (key.toLowerCase() === 'p') togglePause();
  else if (key.toLowerCase() === 'c') holdPiece();
  else if (key.toLowerCase() === 't') goToTitle();
}

// タッチジェスチャー: タップ→回転、左右スワイプ→移動、下ドラッグ→ソフトドロップ、下フリック→ハードドロップ
let touchStart = null;
let touchLastX = 0;
let touchLastY = 0;
let touchAccX = 0;
let touchAccY = 0;
let touchAxis = null; // 'h'=横操作確定 / 'v'=縦操作確定

const FLICK_VY = 0.35; // px/ms 以上でハードドロップと判定

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
  touchLastY = t.clientY;
  touchAccX = 0;
  touchAccY = 0;
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

  const blockSize = displayBlockSize();
  if (blockSize <= 0) return;

  if (touchAxis === 'h') {
    // 横移動: ブロック1個分ドラッグで1マス移動
    touchAccX += t.clientX - touchLastX;
    while (touchAccX >= blockSize) { move(1, 0); touchAccX -= blockSize; }
    while (touchAccX <= -blockSize) { move(-1, 0); touchAccX += blockSize; }
  } else if (touchAxis === 'v') {
    // 下ドラッグ: ブロック1個分ドラッグで1マス落下（ソフトドロップ）
    const moveY = t.clientY - touchLastY;
    if (moveY > 0) {
      touchAccY += moveY;
      while (touchAccY >= blockSize) { softDrop(); touchAccY -= blockSize; }
    }
  }

  touchLastX = t.clientX;
  touchLastY = t.clientY;
}

function handleTouchEnd(e) {
  if (!touchStart || e.changedTouches.length !== 1 || e.touches.length !== 0) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const dt = Date.now() - touchStart.time;
  if (state.gameOver) {
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) resetGame();
    touchStart = null;
    return;
  }
  const vy = dt > 0 ? dy / dt : 0;
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) {
    rotate();
  } else if (dy > 0 && vy >= FLICK_VY && Math.abs(dy) > Math.abs(dx) * 1.2) {
    // 素早い下フリック（縦方向優位）→ ハードドロップ
    hardDrop();
  } else if (dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    holdPiece();
  }
  touchStart = null;
  touchAccY = 0;
}

restartBtn.addEventListener('click', resetGame);
pauseBtn.addEventListener('click', togglePause);
titleBtn.addEventListener('click', goToTitle);

// 一時停止メニュー
resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', resetGame);
pauseTitleBtn.addEventListener('click', goToTitle);

// 遊び方オーバーレイ（背景タップでも閉じられる）
helpBtn.addEventListener('click', () => { helpOverlay.hidden = false; });
helpCloseBtn.addEventListener('click', () => { helpOverlay.hidden = true; });
helpOverlay.addEventListener('click', (e) => {
  if (e.target === helpOverlay) helpOverlay.hidden = true;
});

document.addEventListener('keydown', handleKeyDown);

// タイトル画面: タッチ・クリックいずれでもゲーム開始（遊び方ボタンは除く）
titleScreen.addEventListener('touchstart', (e) => {
  if (e.target.closest('#help-btn')) return;
  e.preventDefault();
  startGame();
}, { passive: false });
titleScreen.addEventListener('click', (e) => {
  if (e.target.closest('#help-btn')) return;
  startGame();
});

// documentに登録: iOS Safariは非インタラクティブ要素のtouchstartを発火しないため
document.addEventListener('touchstart', handleTouchStart, { passive: false });
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd);

// PWA: service workerを登録してオフラインでも遊べるようにする
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
