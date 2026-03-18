const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const images = {
  background: loadImage("img/background.png"),
  handsIdle: loadImage("img/hands_rod_idle.png"),
  float: loadImage("img/float.png"),
  fishes: [
    loadImage("img/fish_1.png"),
    loadImage("img/fish_2.png"),
    loadImage("img/fish_3.png"),
    loadImage("img/fish_4.png"),
    loadImage("img/fish_5.png"),
    loadImage("img/fish_6.png"),
    loadImage("img/fish_7.png"),
    loadImage("img/fish_8.png"),
  ],
};

let W, H, HOLE_CX, HOLE_CY, HOLE_RX, HOLE_RY;
let backgroundRect = { x: 0, y: 0, w: 0, h: 0 };

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  HOLE_CX = W / 2;
  HOLE_CY = H * 0.52;
  HOLE_RX = Math.min(W, H) * 0.09;
  HOLE_RY = HOLE_RX * 0.52;
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const GAME_TIME = 60;

const PHASE_WAITING  = 0;
const PHASE_NIBBLE   = 1;
const PHASE_BITE     = 2;
const PHASE_HOOKING  = 3;
const PHASE_PULLING  = 4;
const PHASE_CAUGHT   = 5;
const PHASE_MISSED   = 6;
const PHASE_GAMEOVER = 7;
const PHASE_START    = 8;

const state = {
  running: false,
  timeLeft: GAME_TIME,
  score: 0,
  lastTime: 0,
  phase: PHASE_START,

  waitTimer: 0,
  waitDuration: 0,

  nibbleTimer: 0,
  nibbleDuration: 0,
  nibbleCount: 0,
  nibbleMax: 0,

  biteTimer: 0,
  biteDuration: 0,

  pullProgress: 0,

  caughtTimer: 0,
  caughtY: 0,
  caughtScale: 0,

  missedTimer: 0,

  currentFishType: 0,
  currentFishValue: 0,
  currentFishName: "",

  bobberDip: 0,
  bobberWobble: 0,

  catchCount: 0,
};

const fishTypes = [
  { name: "Сом",               value: 25, img: 0 },
  { name: "Окунь",             value: 10, img: 1 },
  { name: "Большеротый окунь", value: 15, img: 2 },
  { name: "Судак",             value: 15, img: 3 },
  { name: "Щука",              value: 20, img: 4 },
  { name: "Карась",            value: 5,  img: 5 },
  { name: "Краснопёрка",       value: 5,  img: 6 },
  { name: "Хариус",            value: 12, img: 7 },
];

let floatingFishes = [];
let particles = [];
let spacePressed = false;
let prevSpacePressed = false;

let caughtFishLog = [];
let showInventory = false;
let inventoryScroll = 0;

let catchBtnRect = { x: 0, y: 0, w: 0, h: 0 };

const TOTAL_SCORE_KEY = "winterFishingTotalScore";
let totalScore = 0;
try {
  const saved = localStorage.getItem(TOTAL_SCORE_KEY);
  if (saved != null) totalScore = parseInt(saved, 10) || 0;
} catch (e) {}

function resetGame() {
  state.running = true;
  state.timeLeft = GAME_TIME;
  state.score = 0;
  state.lastTime = performance.now();
  state.catchCount = 0;
  floatingFishes = [];
  particles = [];
  caughtFishLog = [];
  showInventory = false;
  inventoryScroll = 0;
  startWaiting();
}

function startWaiting() {
  state.phase = PHASE_WAITING;
  state.waitTimer = 0;
  state.waitDuration = 2 + Math.random() * 4;
  state.bobberDip = 0;
  spawnUnderwaterFish();
}

function startNibble() {
  state.phase = PHASE_NIBBLE;
  state.nibbleTimer = 0;
  state.nibbleDuration = 0.3 + Math.random() * 0.3;
  state.nibbleCount = 0;
  state.nibbleMax = 1 + Math.floor(Math.random() * 3);
}

function startBite() {
  state.phase = PHASE_BITE;
  state.biteTimer = 0;
  state.biteDuration = 0.8 + Math.random() * 0.7;

  const ft = fishTypes[Math.floor(Math.random() * fishTypes.length)];
  state.currentFishType = ft.img;
  state.currentFishValue = ft.value;
  state.currentFishName = ft.name;
}

function startPulling() {
  state.phase = PHASE_PULLING;
  state.pullProgress = 0;
}

function startCaught() {
  state.phase = PHASE_CAUGHT;
  state.caughtTimer = 0;
  state.caughtY = HOLE_CY;
  state.caughtScale = 0.3;
  state.score += state.currentFishValue;
  state.catchCount++;

  caughtFishLog.push({
    name: state.currentFishName,
    value: state.currentFishValue,
    imgIndex: state.currentFishType,
  });

  for (let i = 0; i < 12; i++) {
    particles.push({
      x: HOLE_CX,
      y: HOLE_CY,
      vx: (Math.random() - 0.5) * 200,
      vy: -Math.random() * 150 - 50,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 0.6 + Math.random() * 0.4,
      size: 3 + Math.random() * 4,
      color: `hsl(${190 + Math.random() * 30}, 80%, ${60 + Math.random() * 30}%)`,
    });
  }
}

function startMissed() {
  state.phase = PHASE_MISSED;
  state.missedTimer = 0;
}

function spawnUnderwaterFish() {
  if (floatingFishes.length >= 4) return;
  const count = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 30;
    floatingFishes.push({
      cx: HOLE_CX + Math.cos(angle) * dist,
      cy: HOLE_CY + Math.sin(angle) * dist * 0.5,
      angle: Math.random() * Math.PI * 2,
      speed: 15 + Math.random() * 20,
      radius: 20 + Math.random() * 15,
      size: 0.4 + Math.random() * 0.4,
      typeIndex: Math.floor(Math.random() * images.fishes.length),
      time: Math.random() * 100,
    });
  }
}

function update(dt) {
  if (showInventory) return;
  if (!state.running) return;

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.running = false;
    state.phase = PHASE_GAMEOVER;
    totalScore += state.score;
    try { localStorage.setItem(TOTAL_SCORE_KEY, String(totalScore)); } catch (e) {}
    return;
  }

  const spaceJustPressed = spacePressed && !prevSpacePressed;

  for (const ff of floatingFishes) {
    ff.time += dt;
    ff.cx = HOLE_CX + Math.cos(ff.time * 0.5 + ff.angle) * ff.radius;
    ff.cy = HOLE_CY + Math.sin(ff.time * 0.7 + ff.angle) * ff.radius * 0.45;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
  }

  state.bobberWobble += dt * 12;

  switch (state.phase) {
    case PHASE_WAITING:
      state.waitTimer += dt;
      state.bobberDip *= 0.92;
      if (state.waitTimer >= state.waitDuration) startNibble();
      break;

    case PHASE_NIBBLE:
      state.nibbleTimer += dt;
      state.bobberDip = Math.sin(state.bobberWobble * 3) * 4;
      if (state.nibbleTimer >= state.nibbleDuration) {
        state.nibbleCount++;
        if (state.nibbleCount >= state.nibbleMax) {
          startBite();
        } else {
          state.nibbleTimer = 0;
          state.nibbleDuration = 0.2 + Math.random() * 0.4;
        }
      }
      if (spaceJustPressed) startMissed();
      break;

    case PHASE_BITE:
      state.biteTimer += dt;
      state.bobberDip = 10 + Math.sin(state.bobberWobble * 5) * 3;
      if (spaceJustPressed) { startPulling(); break; }
      if (state.biteTimer >= state.biteDuration) startMissed();
      break;

    case PHASE_PULLING:
      state.pullProgress += dt * 0.7;
      state.bobberDip *= 0.9;
      if (state.pullProgress >= 1) { state.pullProgress = 1; startCaught(); }
      break;

    case PHASE_CAUGHT:
      state.caughtTimer += dt;
      state.caughtY -= dt * 180;
      state.caughtScale = Math.min(1.2, state.caughtScale + dt * 1.8);
      if (state.caughtTimer >= 1.8) startWaiting();
      break;

    case PHASE_MISSED:
      state.missedTimer += dt;
      state.bobberDip *= 0.9;
      if (state.missedTimer >= 1.2) startWaiting();
      break;
  }

  prevSpacePressed = spacePressed;
}

// ─── DRAWING ───

function drawBackground() {
  const bg = images.background;
  if (bg && bg.complete) {
    const imgRatio = bg.width / bg.height;
    const canvasRatio = W / H;
    let dw, dh;
    if (canvasRatio > imgRatio) {
      dw = W;
      dh = W / imgRatio;
    } else {
      dh = H;
      dw = H * imgRatio;
    }
    const zoom = 0.72;
    dw *= zoom;
    dh *= zoom;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    backgroundRect = { x: dx, y: dy, w: dw, h: dh };
    ctx.fillStyle = "#0a1520";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(bg, dx, dy, dw, dh);
  } else {
    backgroundRect = { x: 0, y: 0, w: W, h: H };
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#87CEEB");
    grad.addColorStop(0.35, "#B0D4E8");
    grad.addColorStop(0.4, "#E8F0F6");
    grad.addColorStop(1, "#F0F6FA");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

// Лунку и \"рыбу в лунке\" не рисуем — это уже есть на вашем фоне.

function drawBobber() {
  const bobX = HOLE_CX;
  const bobBaseY = HOLE_CY - 2;
  const bobY = bobBaseY + state.bobberDip;

  ctx.save();
  // леска
  ctx.strokeStyle = "rgba(20,20,20,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bobX, bobY - 6);
  ctx.lineTo(bobX, bobY - 30 - (state.phase === PHASE_PULLING ? state.pullProgress * 40 : 0));
  ctx.stroke();

  // поплавок-спрайт
  const img = images.float;
  if (img && img.complete) {
    const base = Math.min(W, H);
    const targetH = base * (0.085 / 3);
    const scale = targetH / img.height;
    const w = img.width * scale;
    const h = img.height * scale;

    const wobble = Math.sin(state.bobberWobble * 2.2) * base * 0.0025;
    const x = bobX - w / 2 + wobble;
    const y = bobY - h * 0.8 + 80;

    ctx.drawImage(img, x, y, w, h);

    if (state.phase === PHASE_BITE) {
      ctx.beginPath();
      ctx.arc(bobX, y + h * 0.25, base * 0.02, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 80, 80, ${0.25 + Math.sin(state.bobberWobble * 6) * 0.15})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawFishBeingPulled() {
  if (state.phase !== PHASE_PULLING) return;
  const img = images.fishes[state.currentFishType] || images.fishes[0];
  if (!img || !img.complete) return;

  const progress = state.pullProgress;
  const startY = HOLE_CY + 20;
  const endY = HOLE_CY - H * 0.14;
  const y = startY + (endY - startY) * progress;
  const scale = 0.08 + progress * 0.18;
  const w = img.width * scale;
  const h = img.height * scale;

  ctx.save();
  ctx.globalAlpha = 0.5 + progress * 0.5;
  ctx.translate(HOLE_CX, y);
  ctx.translate(Math.sin(progress * 15) * 8 * (1 - progress), 0);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawCaughtFish() {
  if (state.phase !== PHASE_CAUGHT) return;
  const img = images.fishes[state.currentFishType] || images.fishes[0];
  if (!img || !img.complete) return;

  const scale = state.caughtScale * 0.2;
  const w = img.width * scale;
  const h = img.height * scale;
  const swing = Math.sin(state.caughtTimer * 8) * 15 * Math.max(0, 1 - state.caughtTimer);

  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - (state.caughtTimer / 1.8));
  ctx.translate(HOLE_CX + swing, state.caughtY);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  const fontSize = Math.round(Math.min(W, H) * 0.035);
  ctx.save();
  ctx.font = `bold ${fontSize}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFD700";
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 3;
  const textY = state.caughtY - h / 2 - 15;
  ctx.strokeText(`${state.currentFishName} +${state.currentFishValue}`, HOLE_CX, textY);
  ctx.fillText(`${state.currentFishName} +${state.currentFishValue}`, HOLE_CX, textY);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawHands() {
  const img = images.handsIdle;
  if (!img || !img.complete) return;

  const targetW = W * 0.45;
  const scale = targetW / img.width;
  const w = img.width * scale;
  const h = img.height * scale;

  let offsetY = 0;
  if (state.phase === PHASE_PULLING) {
    offsetY = -state.pullProgress * 30;
  } else if (state.phase === PHASE_CAUGHT) {
    offsetY = -30 + Math.min(state.caughtTimer * 20, 30);
  }

  // Кончик удочки в спрайте ~28% от левого края — совмещаем с поплавком (HOLE_CX)
  const rodTipInSprite = 0.28;
  const base = Math.min(W, H);
  const isNibbleOrBite = state.phase === PHASE_NIBBLE || state.phase === PHASE_BITE;
  const wobbleX = isNibbleOrBite ? Math.sin(state.bobberWobble * 2.2) * base * 0.004 : 0;
  const wobbleY = isNibbleOrBite ? Math.sin(state.bobberWobble * 1.8 + 0.5) * 3 : 0;
  const x = HOLE_CX - w * rodTipInSprite + 15 + wobbleX;
  const y = H - h + 10 + offsetY + 230 + wobbleY;

  ctx.save();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

function drawHUD() {
  const pad = Math.round(W * 0.02);
  const fontSize = Math.round(Math.min(W, H) * 0.028);
  const smallFont = Math.round(fontSize * 0.75);

  ctx.save();

  ctx.font = `bold ${fontSize}px system-ui`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const scoreText = `Очки: ${state.score}`;
  const totalText = `Всего: ${totalScore}`;
  const sm = ctx.measureText(scoreText);
  ctx.font = `${smallFont}px system-ui`;
  const tmTotal = ctx.measureText(totalText);
  ctx.font = `bold ${fontSize}px system-ui`;
  const boxW = Math.max(sm.width, tmTotal.width) + 24;
  const boxH = fontSize + smallFont + 20;

  const scoreX = pad + 210;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  roundRect(ctx, scoreX, pad, boxW, boxH, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  roundRect(ctx, scoreX, pad, boxW, boxH, 10);
  ctx.stroke();

  ctx.fillStyle = "#FFD700";
  ctx.fillText(scoreText, scoreX + 12, pad + 7);

  ctx.font = `${smallFont}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(totalText, scoreX + 12, pad + 7 + fontSize + 6);
  ctx.font = `bold ${fontSize}px system-ui`;

  const timeText = `Время: ${Math.max(0, Math.ceil(state.timeLeft))}`;
  const tm = ctx.measureText(timeText);

  const timeX = W - pad - tm.width - 24 - 210;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  roundRect(ctx, timeX, pad, tm.width + 24, boxH, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  roundRect(ctx, timeX, pad, tm.width + 24, boxH, 10);
  ctx.stroke();

  const timeColor = state.timeLeft <= 10 ? "#FF4444" : "#FFFFFF";
  ctx.fillStyle = timeColor;
  ctx.textAlign = "right";
  ctx.fillText(timeText, timeX + tm.width + 12, pad + 7);

  if (state.catchCount > 0) {
    ctx.font = `bold ${smallFont}px system-ui`;
    ctx.textAlign = "left";

    const catchText = `🐟 Поймано: ${state.catchCount}`;
    const cm = ctx.measureText(catchText);
    const cbW = cm.width + 24;
    const cbH = smallFont + 12;
    const cbX = W / 2 - cbW / 2;
    const cbY = pad;

    catchBtnRect = { x: cbX, y: cbY, w: cbW, h: cbH };

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(ctx, cbX, cbY, cbW, cbH, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,207,51,0.5)";
    ctx.lineWidth = 1;
    roundRect(ctx, cbX, cbY, cbW, cbH, 8);
    ctx.stroke();

    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(catchText, cbX + cbW / 2, cbY + cbH / 2);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
  }

  ctx.restore();
}


function drawControlsHint() {
  const fontSize = Math.round(Math.min(W, H) * 0.018);
  ctx.save();
  ctx.font = `${fontSize}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const text = "[ Space ]  или  [ Клик ] — подсечка";
  const tw = ctx.measureText(text).width;
  const bw = tw + 32;
  const bh = fontSize + 14;
  const bx = W / 2 - bw / 2;
  const by = H - 12 - bh;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(200,220,240,0.55)";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, by + bh / 2);

  ctx.restore();
}

function drawStatusText() {
  let text = "";
  let color = "rgba(255,255,255,0.7)";

  switch (state.phase) {
    case PHASE_WAITING:
      text = "Ждём поклёвку...";
      color = "rgba(200,220,240,0.6)";
      break;
    case PHASE_NIBBLE:
      text = "Что-то клюёт...";
      color = "#FFD080";
      break;
    case PHASE_BITE:
      text = "КЛЮЁТ! Жми ПРОБЕЛ!";
      color = "#FF4444";
      break;
    case PHASE_PULLING:
      text = "Тянем!";
      color = "#66DD66";
      break;
    case PHASE_MISSED:
      text = "Сорвалась...";
      color = "#FF8888";
      break;
  }

  if (!text) return;

  const fontSize = Math.round(Math.min(W, H) * 0.03);
  ctx.save();
  ctx.font = `bold ${fontSize}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const tw = ctx.measureText(text).width;
  const bx = W / 2 - tw / 2 - 16;
  const by = H * 0.14 - fontSize / 2 - 8;
  const bw = tw + 32;
  const bh = fontSize + 16;

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, H * 0.14);
  ctx.restore();
}

function drawInventory() {
  if (!showInventory) return;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, W, H);

  const panelW = Math.min(W * 0.7, 520);
  const panelH = Math.min(H * 0.75, 500);
  const panelX = W / 2 - panelW / 2;
  const panelY = H / 2 - panelH / 2;

  ctx.fillStyle = "rgba(6, 21, 34, 0.95)";
  ctx.strokeStyle = "rgba(163, 210, 255, 0.5)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, panelX, panelY, panelW, panelH, 20);
  ctx.fill();
  ctx.stroke();

  const titleSize = Math.round(Math.min(W, H) * 0.035);
  const itemFont = Math.round(Math.min(W, H) * 0.022);

  ctx.font = `bold ${titleSize}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFD700";
  ctx.fillText("Ваш улов", W / 2, panelY + 34);

  const closeBtnSize = 30;
  const closeX = panelX + panelW - 20 - closeBtnSize;
  const closeY = panelY + 14;

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundRect(ctx, closeX, closeY, closeBtnSize, closeBtnSize, 8);
  ctx.fill();
  ctx.font = `bold ${Math.round(closeBtnSize * 0.6)}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("✕", closeX + closeBtnSize / 2, closeY + closeBtnSize / 2);

  if (caughtFishLog.length === 0) {
    ctx.font = `${itemFont}px system-ui`;
    ctx.fillStyle = "rgba(200,220,240,0.5)";
    ctx.fillText("Пока ничего не поймано", W / 2, H / 2);
    ctx.restore();
    return;
  }

  const contentTop = panelY + 65;
  const contentBottom = panelY + panelH - 20;
  const contentH = contentBottom - contentTop;

  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX + 10, contentTop, panelW - 20, contentH);
  ctx.clip();

  const cols = Math.max(1, Math.floor((panelW - 40) / 130));
  const cellW = (panelW - 40) / cols;
  const cellH = 140;
  const startX = panelX + 20;

  for (let i = 0; i < caughtFishLog.length; i++) {
    const fish = caughtFishLog[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = startX + col * cellW + cellW / 2;
    const cy = contentTop + row * cellH + cellH / 2 - inventoryScroll;

    if (cy + cellH / 2 < contentTop || cy - cellH / 2 > contentBottom) continue;

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, cx - cellW / 2 + 4, cy - cellH / 2 + 4, cellW - 8, cellH - 8, 12);
    ctx.fill();

    const img = images.fishes[fish.imgIndex];
    if (img && img.complete) {
      const maxImgH = cellH * 0.55;
      const maxImgW = cellW * 0.7;
      const imgScale = Math.min(maxImgW / img.width, maxImgH / img.height);
      const iw = img.width * imgScale;
      const ih = img.height * imgScale;
      ctx.drawImage(img, cx - iw / 2, cy - cellH / 2 + 12, iw, ih);
    }

    ctx.font = `bold ${Math.round(itemFont * 0.9)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(fish.name, cx, cy + cellH / 2 - 20);

    ctx.font = `${Math.round(itemFont * 0.75)}px system-ui`;
    ctx.fillStyle = "#FFD700";
    ctx.fillText(`+${fish.value} очков`, cx, cy + cellH / 2 - 4);
  }

  ctx.restore();

  const totalRows = Math.ceil(caughtFishLog.length / cols);
  const totalH = totalRows * cellH;
  if (totalH > contentH) {
    const scrollBarH = Math.max(30, contentH * (contentH / totalH));
    const scrollBarY = contentTop + (inventoryScroll / (totalH - contentH)) * (contentH - scrollBarH);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    roundRect(ctx, panelX + panelW - 14, scrollBarY, 6, scrollBarH, 3);
    ctx.fill();
  }

  ctx.restore();
}

function drawStartScreen() {
  drawBackground();
  drawBobber();

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);

  const titleSize = Math.round(Math.min(W, H) * 0.06);
  const subSize = Math.round(Math.min(W, H) * 0.025);
  const btnSize = Math.round(Math.min(W, H) * 0.03);

  ctx.font = `bold ${titleSize}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFD700";
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 4;
  ctx.strokeText("Зимняя рыбалка", W / 2, H * 0.3);
  ctx.fillText("Зимняя рыбалка", W / 2, H * 0.3);

  ctx.font = `${subSize}px system-ui`;
  ctx.fillStyle = "rgba(220,235,250,0.7)";
  ctx.fillText("Жди поклёвку — подсекай вовремя!", W / 2, H * 0.42);

  const btnW = Math.min(W * 0.35, 260);
  const btnH = btnSize + 24;
  const btnX = W / 2 - btnW / 2;
  const btnY = H * 0.55;

  ctx.fillStyle = "#FFD700";
  roundRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
  ctx.fill();

  ctx.fillStyle = "#221200";
  ctx.font = `bold ${btnSize}px system-ui`;
  ctx.fillText("Начать игру", W / 2, btnY + btnH / 2);

  ctx.font = `${Math.round(subSize * 0.85)}px system-ui`;
  ctx.fillStyle = "rgba(200,220,240,0.5)";
  ctx.fillText("Space / Клик — подсечка", W / 2, H * 0.72);

  ctx.restore();
}

function drawGameOverScreen() {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, W, H);

  const titleSize = Math.round(Math.min(W, H) * 0.05);
  const scoreSize = Math.round(Math.min(W, H) * 0.035);
  const btnSize = Math.round(Math.min(W, H) * 0.028);

  const panelW = Math.min(W * 0.55, 400);
  const panelH = Math.min(H * 0.5, 300);
  const panelX = W / 2 - panelW / 2;
  const panelY = H / 2 - panelH / 2;

  ctx.fillStyle = "rgba(6, 21, 34, 0.92)";
  ctx.strokeStyle = "rgba(163, 210, 255, 0.45)";
  ctx.lineWidth = 1;
  roundRect(ctx, panelX, panelY, panelW, panelH, 20);
  ctx.fill();
  ctx.stroke();

  ctx.font = `bold ${titleSize}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("Игра окончена", W / 2, panelY + panelH * 0.17);

  ctx.font = `${scoreSize}px system-ui`;
  ctx.fillStyle = "#FFD700";
  ctx.fillText(`${state.score} очков`, W / 2, panelY + panelH * 0.35);

  ctx.font = `${Math.round(scoreSize * 0.7)}px system-ui`;
  ctx.fillStyle = "rgba(200,220,240,0.6)";
  ctx.fillText(`Поймано рыб: ${state.catchCount}`, W / 2, panelY + panelH * 0.48);

  const fishBtnW = Math.min(panelW * 0.55, 190);
  const fishBtnH = btnSize + 16;
  const fishBtnX = W / 2 - fishBtnW / 2;
  const fishBtnY = panelY + panelH * 0.58;

  ctx.fillStyle = "rgba(255,207,51,0.15)";
  ctx.strokeStyle = "rgba(255,207,51,0.5)";
  ctx.lineWidth = 1;
  roundRect(ctx, fishBtnX, fishBtnY, fishBtnW, fishBtnH, fishBtnH / 2);
  ctx.fill();
  ctx.stroke();

  ctx.font = `bold ${Math.round(btnSize * 0.85)}px system-ui`;
  ctx.fillStyle = "#FFD700";
  ctx.fillText("Посмотреть улов", W / 2, fishBtnY + fishBtnH / 2);

  const btnW = Math.min(panelW * 0.55, 190);
  const btnH = btnSize + 20;
  const btnX = W / 2 - btnW / 2;
  const btnY = panelY + panelH * 0.78;

  ctx.fillStyle = "#FFD700";
  roundRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
  ctx.fill();

  ctx.fillStyle = "#221200";
  ctx.font = `bold ${btnSize}px system-ui`;
  ctx.fillText("Играть ещё", W / 2, btnY + btnH / 2);

  ctx.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function render() {
  ctx.clearRect(0, 0, W, H);

  if (state.phase === PHASE_START) {
    drawStartScreen();
    return;
  }

  drawBackground();
  drawBobber();
  drawFishBeingPulled();
  drawParticles();
  drawCaughtFish();
  drawHands();
  drawHUD();
  drawStatusText();
  drawControlsHint();

  if (state.phase === PHASE_GAMEOVER) {
    drawGameOverScreen();
  }

  if (showInventory) {
    drawInventory();
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.1);
  state.lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function getClickPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left),
    y: (e.clientY - rect.top),
  };
}

function isInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function handleClick(e) {
  const pos = getClickPos(e);

  if (showInventory) {
    const panelW = Math.min(W * 0.7, 520);
    const panelH = Math.min(H * 0.75, 500);
    const panelX = W / 2 - panelW / 2;
    const panelY = H / 2 - panelH / 2;
    const closeBtnSize = 30;
    const closeX = panelX + panelW - 20 - closeBtnSize;
    const closeY = panelY + 14;

    if (pos.x >= closeX && pos.x <= closeX + closeBtnSize &&
        pos.y >= closeY && pos.y <= closeY + closeBtnSize) {
      showInventory = false;
      return;
    }
    if (pos.x < panelX || pos.x > panelX + panelW ||
        pos.y < panelY || pos.y > panelY + panelH) {
      showInventory = false;
    }
    return;
  }

  if (state.phase === PHASE_START) {
    resetGame();
    return;
  }

  if (state.phase === PHASE_GAMEOVER) {
    const btnSize = Math.round(Math.min(W, H) * 0.028);
    const panelW = Math.min(W * 0.55, 400);
    const panelH = Math.min(H * 0.5, 300);
    const panelY = H / 2 - panelH / 2;

    const fishBtnW = Math.min(panelW * 0.55, 190);
    const fishBtnH = btnSize + 16;
    const fishBtnX = W / 2 - fishBtnW / 2;
    const fishBtnY = panelY + panelH * 0.58;

    if (pos.x >= fishBtnX && pos.x <= fishBtnX + fishBtnW &&
        pos.y >= fishBtnY && pos.y <= fishBtnY + fishBtnH) {
      showInventory = true;
      inventoryScroll = 0;
      return;
    }

    const btnW = Math.min(panelW * 0.55, 190);
    const btnH = btnSize + 20;
    const btnX = W / 2 - btnW / 2;
    const btnY = panelY + panelH * 0.78;

    if (pos.x >= btnX && pos.x <= btnX + btnW &&
        pos.y >= btnY && pos.y <= btnY + btnH) {
      resetGame();
      return;
    }
    return;
  }

  if (state.running && state.catchCount > 0 && isInRect(pos.x, pos.y, catchBtnRect)) {
    showInventory = true;
    inventoryScroll = 0;
    return;
  }

  spacePressed = true;
}

canvas.addEventListener("wheel", (e) => {
  if (!showInventory) return;
  e.preventDefault();

  const panelW = Math.min(W * 0.7, 520);
  const panelH = Math.min(H * 0.75, 500);
  const contentH = panelH - 85;
  const cols = Math.max(1, Math.floor((panelW - 40) / 130));
  const totalRows = Math.ceil(caughtFishLog.length / cols);
  const totalH = totalRows * 140;
  const maxScroll = Math.max(0, totalH - contentH);

  inventoryScroll = Math.max(0, Math.min(maxScroll, inventoryScroll + e.deltaY * 0.5));
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (showInventory) { showInventory = false; return; }
    if (state.phase === PHASE_START || state.phase === PHASE_GAMEOVER) {
      resetGame();
      return;
    }
    spacePressed = true;
  }
  if (e.code === "Escape" && showInventory) {
    showInventory = false;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spacePressed = false;
});

canvas.addEventListener("pointerdown", handleClick);
canvas.addEventListener("pointerup", () => { spacePressed = false; });

state.lastTime = performance.now();
requestAnimationFrame(loop);
