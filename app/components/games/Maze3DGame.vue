<script setup>
/* 立體迷宮 3D Maze — first-person maze rendered with Three.js.
   Recursive-backtracker maze, grid-step movement with smooth lerp,
   torch light + fog for atmosphere, glowing exit, live minimap.
   Three.js is dynamically imported on the client only (SSG-safe). */

const accent = "#5ce0c6";
const CLEARED_KEY = "playground.maze3d.cleared";

const DIFFS = [
  { key: "easy", label: "小", w: 6, h: 6 },
  { key: "medium", label: "中", w: 8, h: 8 },
  { key: "hard", label: "大", w: 11, h: 11 },
];
const FWD = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N,E,S,W → (dCol,dRow)
const WALLKEY = ["N", "E", "S", "W"];

// constants (world units)
const CS = 3;
const T = 0.32;
const WALL_H = 2.8;
const EYE = 1.5;

// reactive UI
const canvasRef = ref(null);
const miniRef = ref(null);
const difficulty = ref("medium");
const sizeLabel = ref("8 × 8");
const steps = ref(0);
const won = ref(false);
const cleared = ref(0);

// non-reactive engine state
let THREE = null;
let renderer = null,
  scene = null,
  camera = null,
  torch = null,
  worldGroup = null,
  animId = 0,
  ready = false,
  alive = true;
let W = 8,
  H = 8,
  cells = [],
  goal = { c: 0, r: 0 };
let playerCol = 0,
  playerRow = 0,
  facing = 0;
let px = 0, pz = 0, yaw = 0, tx = 0, tz = 0, tyaw = 0;

/* ---------- maze ---------- */
function genMaze(w, h) {
  W = w;
  H = h;
  cells = [];
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) cells.push({ c, r, N: true, E: true, S: true, W: true, vis: false });
  const at = (c, r) => (c < 0 || c >= W || r < 0 || r >= H ? null : cells[r * W + c]);
  const dirs = [["N", 0, -1, "S"], ["E", 1, 0, "W"], ["S", 0, 1, "N"], ["W", -1, 0, "E"]];
  const start = at(0, 0);
  start.vis = true;
  const stack = [start];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const nbs = [];
    for (const [wall, dx, dy, opp] of dirs) {
      const nb = at(cur.c + dx, cur.r + dy);
      if (nb && !nb.vis) nbs.push([wall, nb, opp]);
    }
    if (nbs.length) {
      const [wall, nb, opp] = nbs[(Math.random() * nbs.length) | 0];
      cur[wall] = false;
      nb[opp] = false;
      nb.vis = true;
      stack.push(nb);
    } else stack.pop();
  }
}
function bfsGoal() {
  const dist = new Array(W * H).fill(-1);
  dist[0] = 0;
  let far = 0;
  const q = [0];
  const dirs = [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]];
  while (q.length) {
    const idx = q.shift();
    const c = idx % W;
    const r = (idx / W) | 0;
    for (const [wall, dx, dy] of dirs) {
      if (cells[idx][wall]) continue;
      const nc = c + dx;
      const nr = r + dy;
      if (nc < 0 || nc >= W || nr < 0 || nr >= H) continue;
      const nidx = nr * W + nc;
      if (dist[nidx] < 0) {
        dist[nidx] = dist[idx] + 1;
        if (dist[nidx] > dist[far]) far = nidx;
        q.push(nidx);
      }
    }
  }
  goal = { c: far % W, r: (far / W) | 0 };
}
const worldOf = (c, r) => ({ x: (c - (W - 1) / 2) * CS, z: (r - (H - 1) / 2) * CS });
const canMove = (c, r, f) => !cells[r * W + c][WALLKEY[f]];

/* ---------- three.js world ---------- */
function buildWorld() {
  if (worldGroup) {
    scene.remove(worldGroup);
    disposeGroup(worldGroup);
  }
  worldGroup = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2b3550, roughness: 0.85, metalness: 0.05,
    emissive: 0x0a1622, emissiveIntensity: 0.4,
  });
  const addWall = (x, z, sx, sz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_H, sz), wallMat);
    m.position.set(x, WALL_H / 2, z);
    worldGroup.add(m);
  };

  for (const cell of cells) {
    const { x, z } = worldOf(cell.c, cell.r);
    if (cell.N) addWall(x, z - CS / 2, CS + T, T);
    if (cell.W) addWall(x - CS / 2, z, T, CS + T);
    if (cell.c === W - 1 && cell.E) addWall(x + CS / 2, z, T, CS + T);
    if (cell.r === H - 1 && cell.S) addWall(x, z + CS / 2, CS + T, T);
  }

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W * CS + T, H * CS + T),
    new THREE.MeshStandardMaterial({ color: 0x12161e, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  worldGroup.add(floor);

  // glowing exit
  const g = worldOf(goal.c, goal.r);
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(CS * 0.42, WALL_H * 1.25, CS * 0.42),
    new THREE.MeshStandardMaterial({ color: 0x0a0b0f, emissive: new THREE.Color(accent), emissiveIntensity: 1.3 })
  );
  beacon.position.set(g.x, WALL_H * 0.6, g.z);
  worldGroup.add(beacon);
  const goalLight = new THREE.PointLight(new THREE.Color(accent), 14, CS * 5, 2);
  goalLight.position.set(g.x, WALL_H, g.z);
  worldGroup.add(goalLight);

  scene.add(worldGroup);
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}

async function init() {
  THREE = await import("three");
  if (!alive) return;
  const cv = canvasRef.value;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0c10);
  scene.fog = new THREE.Fog(0x0b0c10, CS * 1.2, CS * 4.6);

  camera = new THREE.PerspectiveCamera(74, cv.clientWidth / cv.clientHeight, 0.1, 120);
  camera.rotation.order = "YXZ";

  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(cv.clientWidth, cv.clientHeight, false);

  scene.add(new THREE.AmbientLight(0x46506a, 1.1));
  torch = new THREE.PointLight(0xffe6c0, 18, CS * 4.2, 1.8);
  scene.add(torch);

  startMaze(difficulty.value);
  ready = true;
  window.addEventListener("resize", resize);
  loop();
}

function startMaze(diffKey) {
  const d = DIFFS.find((x) => x.key === diffKey) || DIFFS[1];
  difficulty.value = diffKey;
  sizeLabel.value = `${d.w} × ${d.h}`;
  genMaze(d.w, d.h);
  bfsGoal();
  buildWorld();
  playerCol = 0;
  playerRow = 0;
  facing = 0;
  const w0 = worldOf(0, 0);
  px = tx = w0.x;
  pz = tz = w0.z;
  yaw = tyaw = 0;
  steps.value = 0;
  won.value = false;
  drawMinimap();
}

function settled() {
  return Math.abs(px - tx) < 0.02 && Math.abs(pz - tz) < 0.02 && Math.abs(yaw - tyaw) < 0.02;
}

function loop() {
  if (!alive) return;
  animId = requestAnimationFrame(loop);
  const k = 0.2;
  px += (tx - px) * k;
  pz += (tz - pz) * k;
  yaw += (tyaw - yaw) * k;
  camera.position.set(px, EYE, pz);
  camera.rotation.set(0, yaw, 0);
  torch.position.set(px, EYE + 0.2, pz);
  renderer.render(scene, camera);
  if (!won.value && settled() && playerCol === goal.c && playerRow === goal.r) winGame();
}

function resize() {
  const cv = canvasRef.value;
  if (!cv || !renderer) return;
  renderer.setSize(cv.clientWidth, cv.clientHeight, false);
  camera.aspect = cv.clientWidth / cv.clientHeight;
  camera.updateProjectionMatrix();
}

/* ---------- controls ---------- */
function forward(back = false) {
  if (!ready || won.value || !settled()) return;
  const f = back ? (facing + 2) % 4 : facing;
  if (!canMove(playerCol, playerRow, f)) return;
  playerCol += FWD[f][0];
  playerRow += FWD[f][1];
  const w = worldOf(playerCol, playerRow);
  tx = w.x;
  tz = w.z;
  if (!back) steps.value++;
  drawMinimap();
}
function turn(left) {
  if (!ready || won.value || !settled()) return;
  facing = left ? (facing + 3) % 4 : (facing + 1) % 4;
  tyaw += left ? Math.PI / 2 : -Math.PI / 2;
  drawMinimap();
}
function winGame() {
  won.value = true;
  cleared.value++;
  localStorage.setItem(CLEARED_KEY, String(cleared.value));
}

function onKey(e) {
  const k = e.key;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) e.preventDefault();
  if (k === "ArrowUp" || k === "w" || k === "W") forward(false);
  else if (k === "ArrowDown" || k === "s" || k === "S") forward(true);
  else if (k === "ArrowLeft" || k === "a" || k === "A") turn(true);
  else if (k === "ArrowRight" || k === "d" || k === "D") turn(false);
}

/* ---------- minimap ---------- */
function drawMinimap() {
  const cv = miniRef.value;
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const S = cv.width;
  ctx.clearRect(0, 0, S, S);
  const pad = 8;
  const cell = (S - 2 * pad) / Math.max(W, H);
  const ox = pad + (Math.max(W, H) - W) * cell * 0.5;
  const oy = pad + (Math.max(W, H) - H) * cell * 0.5;

  // goal cell fill
  ctx.fillStyle = "rgba(92,224,198,0.28)";
  ctx.fillRect(ox + goal.c * cell, oy + goal.r * cell, cell, cell);

  // walls
  ctx.strokeStyle = "rgba(180,190,215,0.55)";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const cl of cells) {
    const x = ox + cl.c * cell;
    const y = oy + cl.r * cell;
    if (cl.N) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
    if (cl.W) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
    if (cl.c === W - 1 && cl.E) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
    if (cl.r === H - 1 && cl.S) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
  }
  ctx.stroke();

  // player
  const cx = ox + (playerCol + 0.5) * cell;
  const cy = oy + (playerRow + 0.5) * cell;
  const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][facing]; // N,E,S,W in 2D
  ctx.fillStyle = "#5ce0c6";
  ctx.beginPath();
  const rr = cell * 0.34;
  ctx.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
  ctx.lineTo(cx + Math.cos(ang + 2.5) * rr, cy + Math.sin(ang + 2.5) * rr);
  ctx.lineTo(cx + Math.cos(ang - 2.5) * rr, cy + Math.sin(ang - 2.5) * rr);
  ctx.closePath();
  ctx.fill();
}

onMounted(() => {
  alive = true;
  cleared.value = +(localStorage.getItem(CLEARED_KEY) || 0);
  window.addEventListener("keydown", onKey);
  init();
});
onBeforeUnmount(() => {
  alive = false;
  ready = false;
  cancelAnimationFrame(animId);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", resize);
  if (worldGroup) disposeGroup(worldGroup);
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  renderer = scene = camera = null;
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="立體迷宮" title-en="3D Maze">
      <template #actions>
        <button class="btn btn--accent" @click="startMaze(difficulty)">新迷宮</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">Size</span>
            <span class="chip__value is-accent">{{ sizeLabel }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Steps</span>
            <span class="chip__value">{{ steps }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Cleared</span>
            <span class="chip__value">{{ cleared }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <canvas ref="canvasRef" class="maze-canvas" aria-label="3D 迷宮畫面" />
          <canvas ref="miniRef" width="150" height="150" class="maze-mini" aria-hidden="true" />
          <div class="overlay" :class="{ 'is-open': won }">
            <div class="overlay__card">
              <h2 class="overlay__title">找到出口！</h2>
              <p class="overlay__sub">迷宮 {{ sizeLabel }}　·　{{ steps }} 步走出。</p>
              <div class="overlay__actions">
                <button class="btn btn--accent" @click="startMaze(difficulty)">下一座迷宮</button>
              </div>
            </div>
          </div>
        </div>

        <div class="dpad show-touch-only">
          <button class="up" aria-label="前進" @click="forward(false)">▲</button>
          <button class="left" aria-label="左轉" @click="turn(true)">↺</button>
          <button class="right" aria-label="右轉" @click="turn(false)">↻</button>
          <button class="down" aria-label="後退" @click="forward(true)">▼</button>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">迷宮大小</span>
          <div class="seg" role="group" aria-label="迷宮大小">
            <button
              v-for="d in DIFFS"
              :key="d.key"
              :class="{ 'is-active': difficulty === d.key }"
              @click="startMaze(d.key)"
            >
              {{ d.label }}
            </button>
          </div>
          <p class="hint">找到發光的出口即過關。右上角小地圖會顯示你的位置與朝向。</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作方式</span>
          <p class="hint">
            前進：<kbd>↑</kbd> / <kbd>W</kbd>　後退：<kbd>↓</kbd> / <kbd>S</kbd><br />
            左轉：<kbd>←</kbd> / <kbd>A</kbd>　右轉：<kbd>→</kbd> / <kbd>D</kbd><br />
            行動裝置可使用畫面下方的方向鍵。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">關於</span>
          <p class="hint">以 Three.js 即時渲染的第一人稱迷宮，展示本站對 3D / WebGL 遊戲的擴充能力。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.maze-canvas {
  display: block;
  width: min(92vw, 680px);
  aspect-ratio: 4 / 3;
  border-radius: var(--r-lg);
  background: #0b0c10;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
}
.maze-mini {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 132px;
  height: 132px;
  border-radius: var(--r-sm);
  background: color-mix(in oklab, var(--ink-900) 70%, transparent);
  border: 1px solid var(--line-strong);
  backdrop-filter: blur(4px);
}
.board-wrap .overlay { border-radius: var(--r-lg); }
.dpad .left, .dpad .right { font-size: 1.5rem; }
</style>
