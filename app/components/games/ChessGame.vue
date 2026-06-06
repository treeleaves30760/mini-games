<script setup>
import {
  CHESS_PIECES,
  chooseChessAIMove,
  createChessGame,
  getChessCells,
  getChessDifficultyDepth,
  getChessLegalMoves,
  getChessStatus,
  oppositeChessSide,
  toChessMoveInput,
} from "~/games/chess";

const accent = "#f2c94c";
const SAVE_KEY = "playground.chess.stats";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const game = shallowRef(createChessGame());
const positionKey = ref(game.value.fen());
const selectedSquare = ref(null);
const lastMove = ref(null);
const promotionPrompt = ref(null);
const aiThinking = ref(false);
const humanColor = ref("w");
const difficulty = ref("normal");
const moveLog = ref([]);
const stats = reactive({ wins: 0, draws: 0, losses: 0 });
const overlay = reactive({ open: false, title: "", sub: "" });

let rng = makeRng(props.seed);
let aiTimer = null;

const aiColor = computed(() => oppositeChessSide(humanColor.value));
const boardCells = computed(() => {
  positionKey.value;
  return getChessCells(game.value, humanColor.value);
});

const legalMoves = computed(() => {
  positionKey.value;
  if (!selectedSquare.value || game.value.turn() !== humanColor.value || aiThinking.value) return [];
  return getChessLegalMoves(game.value, selectedSquare.value).filter((move) => move.color === humanColor.value);
});

const legalTargetSet = computed(() => new Set(legalMoves.value.map((move) => move.to)));
const canUndo = computed(() => positionKey.value && !aiThinking.value && game.value.history().length > 0);

const statusText = computed(() => {
  positionKey.value;
  if (game.value.isGameOver()) return getChessStatus(game.value);
  if (aiThinking.value) return "AI 思考中";
  if (game.value.turn() !== humanColor.value) return "等待 AI";
  return game.value.isCheck() ? "你被將軍，請解危" : "輪到你走";
});

const engineText = computed(() => {
  const depth = getChessDifficultyDepth(difficulty.value);
  return `Alpha-beta ${depth} 層 · 手工評估`;
});

watch(
  () => props.seed,
  () => {
    rng = makeRng(props.seed);
    restart();
  }
);

function syncPosition() {
  positionKey.value = game.value.fen();
}

function pieceGlyph(piece) {
  return piece ? CHESS_PIECES[piece.color][piece.type] : "";
}

function isSelected(square) {
  return selectedSquare.value === square;
}

function isLegalTarget(square) {
  return legalTargetSet.value.has(square);
}

function isLastMove(square) {
  return lastMove.value && (lastMove.value.from === square || lastMove.value.to === square);
}

function cellAria(cell) {
  const piece = cell.piece ? `${cell.piece.color === "w" ? "白" : "黑"}${cell.piece.type}` : "空格";
  return `${cell.square}: ${piece}`;
}

function selectCell(cell) {
  if (aiThinking.value || game.value.isGameOver() || promotionPrompt.value) return;
  if (game.value.turn() !== humanColor.value) return;

  if (selectedSquare.value && isLegalTarget(cell.square)) {
    const moves = legalMoves.value.filter((move) => move.to === cell.square);
    if (moves.length > 1 && moves.some((move) => move.promotion)) {
      promotionPrompt.value = { moves };
      return;
    }
    if (moves[0]) applyHumanMove(moves[0]);
    return;
  }

  if (cell.piece?.color === humanColor.value) {
    selectedSquare.value = cell.square;
    return;
  }
  selectedSquare.value = null;
}

function applyHumanMove(move, promotion) {
  const applied = game.value.move(toChessMoveInput(move, promotion));
  selectedSquare.value = null;
  promotionPrompt.value = null;
  lastMove.value = { from: applied.from, to: applied.to };
  moveLog.value = [...moveLog.value, `你 ${applied.san}`].slice(-8);
  syncPosition();
  if (!resolveGame()) triggerAI();
}

function choosePromotion(piece) {
  const move = promotionPrompt.value?.moves.find((candidate) => candidate.promotion === piece);
  if (move) applyHumanMove(move, piece);
}

function triggerAI() {
  if (game.value.isGameOver() || game.value.turn() !== aiColor.value) return;
  aiThinking.value = true;
  clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    const aiMove = chooseChessAIMove(game.value.fen(), aiColor.value, difficulty.value, rng);
    if (aiMove) {
      const applied = game.value.move({
        from: aiMove.from,
        to: aiMove.to,
        promotion: aiMove.promotion || "q",
      });
      lastMove.value = { from: applied.from, to: applied.to };
      moveLog.value = [...moveLog.value, `AI ${applied.san}`].slice(-8);
      syncPosition();
    }
    aiThinking.value = false;
    resolveGame();
  }, 180);
}

function resolveGame() {
  if (!game.value.isGameOver()) return false;
  const status = getChessStatus(game.value);
  if (game.value.isCheckmate()) {
    const winner = oppositeChessSide(game.value.turn());
    if (winner === humanColor.value) {
      stats.wins++;
      emit("solved", {});
      overlay.title = "你將死 AI";
      overlay.sub = `${status}，漂亮收官。`;
    } else {
      stats.losses++;
      overlay.title = "AI 將死你";
      overlay.sub = `${status}，換個開局再試。`;
    }
  } else {
    stats.draws++;
    overlay.title = "和棋";
    overlay.sub = status;
  }
  saveStats();
  overlay.open = true;
  return true;
}

function restart() {
  clearTimeout(aiTimer);
  game.value = createChessGame();
  selectedSquare.value = null;
  lastMove.value = null;
  promotionPrompt.value = null;
  moveLog.value = [];
  aiThinking.value = false;
  overlay.open = false;
  syncPosition();
  nextTick(triggerAI);
}

function setSide(side) {
  if (aiThinking.value) return;
  humanColor.value = side;
  restart();
}

function setDifficulty(next) {
  if (aiThinking.value) return;
  difficulty.value = next;
}

function undoMove() {
  if (!canUndo.value) return;
  game.value.undo();
  moveLog.value = moveLog.value.slice(0, -1);
  if (game.value.history().length > 0 && game.value.turn() !== humanColor.value) {
    game.value.undo();
    moveLog.value = moveLog.value.slice(0, -1);
  }
  selectedSquare.value = null;
  lastMove.value = null;
  overlay.open = false;
  syncPosition();
}

function saveStats() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(stats));
  } catch (_) {}
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (saved.wins != null) {
      stats.wins = saved.wins || 0;
      stats.draws = saved.draws || 0;
      stats.losses = saved.losses || 0;
    }
  } catch (_) {}
});

onBeforeUnmount(() => clearTimeout(aiTimer));
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="國際象棋" title-en="Chess">
      <template #actions>
        <button class="btn" :disabled="!canUndo" @click="undoMove">悔棋</button>
        <button class="btn btn--accent" @click="restart">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage chess-stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">你</span>
            <span class="chip__value is-accent">{{ humanColor === 'w' ? '白' : '黑' }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">狀態</span>
            <span class="chip__value chip__value--text">{{ statusText }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">AI</span>
            <span class="chip__value">{{ difficulty === 'hard' ? '強' : difficulty === 'normal' ? '中' : '輕' }}</span>
          </div>
        </div>

        <div class="board-wrap chess-wrap">
          <div class="chess-board" role="grid" aria-label="國際象棋棋盤">
            <button
              v-for="cell in boardCells"
              :key="cell.square"
              class="chess-cell"
              :class="{
                'is-light': cell.light,
                'is-dark': !cell.light,
                'is-selected': isSelected(cell.square),
                'is-legal': isLegalTarget(cell.square),
                'is-last': isLastMove(cell.square),
              }"
              :aria-label="cellAria(cell)"
              :disabled="aiThinking || game.isGameOver() || game.turn() !== humanColor"
              @click="selectCell(cell)"
            >
              <span v-if="cell.piece" class="chess-piece" :class="`piece-${cell.piece.color}`">
                {{ pieceGlyph(cell.piece) }}
              </span>
              <span v-if="isLegalTarget(cell.square)" class="target-dot" aria-hidden="true"></span>
              <span class="coord coord--file" aria-hidden="true">{{ cell.square[0] }}</span>
              <span class="coord coord--rank" aria-hidden="true">{{ cell.square[1] }}</span>
            </button>
          </div>

          <div class="promotion-pop" v-if="promotionPrompt">
            <div class="promotion-pop__title">選擇升變</div>
            <div class="promotion-pop__choices">
              <button
                v-for="piece in ['q', 'r', 'b', 'n']"
                :key="piece"
                class="promotion-choice"
                @click="choosePromotion(piece)"
              >
                {{ CHESS_PIECES[humanColor][piece] }}
              </button>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn" @click="overlay.open = false">繼續觀看</button>
                <button class="btn btn--accent" @click="restart">再來一局</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">執棋</span>
          <div class="seg">
            <button :aria-pressed="humanColor === 'w'" @click="setSide('w')">白方</button>
            <button :aria-pressed="humanColor === 'b'" @click="setSide('b')">黑方</button>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">AI 難度</span>
          <div class="seg">
            <button :aria-pressed="difficulty === 'easy'" @click="setDifficulty('easy')">輕量</button>
            <button :aria-pressed="difficulty === 'normal'" @click="setDifficulty('normal')">標準</button>
            <button :aria-pressed="difficulty === 'hard'" @click="setDifficulty('hard')">強化</button>
          </div>
          <p class="hint">{{ engineText }}</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">引擎選擇</span>
          <p class="hint">
            規則由 <strong style="color: var(--text)">chess.js</strong> 驗證。最強開源棋力是
            Stockfish 18，但最新版含 NNUE，不屬純 rule-based；本頁使用可離線部署的手工評估 alpha-beta AI。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">戰績</span>
          <p class="hint">勝 {{ stats.wins }} ／ 和 {{ stats.draws }} ／ 負 {{ stats.losses }}</p>
        </div>

        <div class="panel__group" v-if="moveLog.length">
          <span class="panel__legend">最近棋步</span>
          <ol class="move-list">
            <li v-for="(move, index) in moveLog" :key="`${move}-${index}`">{{ move }}</li>
          </ol>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.chess-stage {
  max-width: 1240px;
}
.chip__value--text {
  width: 8.5em;
  font-size: 1rem;
  line-height: 1.25;
  white-space: nowrap;
}
.chess-wrap {
  position: relative;
}
.chess-board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  width: min(92vw, 70vh, 560px);
  aspect-ratio: 1;
  border-radius: var(--r-md);
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--accent) 35%, var(--line));
  box-shadow: var(--shadow-2), 0 0 0 1px rgba(255,255,255,0.04) inset;
}
.chess-cell {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  border: 0;
  cursor: pointer;
  transition: filter var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.chess-cell:disabled {
  cursor: default;
}
.chess-cell.is-light {
  background: #ead8aa;
}
.chess-cell.is-dark {
  background: #7b5b38;
}
.chess-cell:not(:disabled):hover {
  filter: brightness(1.08);
}
.chess-cell.is-selected {
  box-shadow: inset 0 0 0 4px var(--accent);
}
.chess-cell.is-last {
  box-shadow: inset 0 0 0 4px color-mix(in oklab, var(--accent) 55%, transparent);
}
.chess-cell.is-selected.is-last {
  box-shadow: inset 0 0 0 4px var(--accent);
}
.chess-piece {
  position: relative;
  z-index: 2;
  display: block;
  font-family: "Times New Roman", Georgia, serif;
  font-size: clamp(2rem, 8vw, 4.25rem);
  line-height: 1;
  text-shadow: 0 3px 8px rgba(0,0,0,0.38);
  transform: translateY(-0.02em);
}
.piece-w {
  color: #fff8df;
  -webkit-text-stroke: 1px rgba(43, 25, 12, 0.45);
}
.piece-b {
  color: #18110c;
  -webkit-text-stroke: 1px rgba(255, 242, 199, 0.25);
}
.target-dot {
  position: absolute;
  z-index: 3;
  width: 27%;
  height: 27%;
  border-radius: 50%;
  background: color-mix(in oklab, var(--accent) 78%, transparent);
  box-shadow: 0 0 14px color-mix(in oklab, var(--accent) 65%, transparent);
  pointer-events: none;
}
.chess-cell:has(.chess-piece) .target-dot {
  width: 74%;
  height: 74%;
  background: transparent;
  border: 4px solid color-mix(in oklab, var(--accent) 80%, transparent);
}
.coord {
  position: absolute;
  z-index: 4;
  font-family: var(--font-mono);
  font-size: clamp(0.55rem, 1.8vw, 0.72rem);
  font-weight: 700;
  color: rgba(20, 14, 8, 0.58);
  pointer-events: none;
}
.is-dark .coord {
  color: rgba(255, 244, 210, 0.58);
}
.coord--file {
  right: 0.28rem;
  bottom: 0.12rem;
}
.coord--rank {
  left: 0.28rem;
  top: 0.12rem;
}
.promotion-pop {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 12;
  transform: translate(-50%, -50%);
  min-width: min(300px, 82vw);
  padding: 1rem;
  border-radius: var(--r-md);
  background: linear-gradient(180deg, var(--ink-800), var(--ink-900));
  border: 1px solid color-mix(in oklab, var(--accent) 42%, var(--line));
  box-shadow: var(--shadow-3), var(--glow);
}
.promotion-pop__title {
  margin-bottom: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  color: var(--text-faint);
  text-align: center;
}
.promotion-pop__choices {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}
.promotion-choice {
  min-height: 56px;
  border-radius: var(--r-sm);
  background: var(--accent);
  color: #18110c;
  font-family: Georgia, serif;
  font-size: 2rem;
  cursor: pointer;
}
.move-list {
  display: grid;
  gap: 0.28rem;
  margin: 0;
  padding-left: 1.2rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
@media (max-width: 520px) {
  .chip__value--text {
    width: 7.2em;
    font-size: 0.88rem;
  }
  .coord {
    display: none;
  }
}
</style>
