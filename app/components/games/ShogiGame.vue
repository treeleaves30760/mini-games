<script setup>
import {
  Color,
  PieceType,
  chooseShogiAIMove,
  createShogiPosition,
  formatShogiMove,
  getLegalShogiMoves,
  getShogiCells,
  getShogiDifficultyDepth,
  getShogiHandPieces,
  oppositeShogiColor,
  shogiColorName,
  shogiPieceLabel,
} from "~/games/shogi";

const accent = "#ff7a59";
const SAVE_KEY = "playground.shogi.stats";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const position = shallowRef(createShogiPosition());
const positionKey = ref(position.value.sfen);
const selected = ref(null);
const promotionPrompt = ref(null);
const aiThinking = ref(false);
const humanColor = ref(Color.BLACK);
const difficulty = ref("normal");
const gameOver = ref(false);
const moveLog = ref([]);
const stats = reactive({ wins: 0, losses: 0 });
const overlay = reactive({ open: false, title: "", sub: "" });

let rng = makeRng(props.seed);
let aiTimer = null;

const aiColor = computed(() => oppositeShogiColor(humanColor.value));
const boardCells = computed(() => {
  positionKey.value;
  return getShogiCells(position.value, humanColor.value);
});
const humanHand = computed(() => {
  positionKey.value;
  return getShogiHandPieces(position.value, humanColor.value);
});
const aiHand = computed(() => {
  positionKey.value;
  return getShogiHandPieces(position.value, aiColor.value);
});
const allHumanMoves = computed(() => {
  positionKey.value;
  if (position.value.color !== humanColor.value || aiThinking.value || gameOver.value) return [];
  return getLegalShogiMoves(position.value);
});
const selectedMoves = computed(() => {
  if (!selected.value) return [];
  const key = selectedKey(selected.value);
  return allHumanMoves.value.filter((move) => moveFromKey(move) === key);
});
const legalTargetSet = computed(() => new Set(selectedMoves.value.map((move) => move.to.usi)));
const canUndo = computed(() => positionKey.value && !aiThinking.value && moveLog.value.length > 0);

const statusText = computed(() => {
  positionKey.value;
  if (gameOver.value) return "終局";
  if (aiThinking.value) return "AI 思考中";
  if (position.value.color !== humanColor.value) return "等待 AI";
  if (position.value.checked) return "王手，請解危";
  return "輪到你指";
});

const engineText = computed(() => {
  const depth = getShogiDifficultyDepth(difficulty.value);
  return `Alpha-beta ${depth} 層 · 持駒/升變評估`;
});

watch(
  () => props.seed,
  () => {
    rng = makeRng(props.seed);
    restart();
  }
);

function syncPosition() {
  positionKey.value = position.value.sfen;
}

function selectedKey(value) {
  return value.kind === "hand" ? `hand:${value.type}` : `board:${value.usi}`;
}

function moveFromKey(move) {
  return typeof move.from === "string" ? `hand:${move.from}` : `board:${move.from.usi}`;
}

function isSelectedBoard(usi) {
  return selected.value?.kind === "board" && selected.value.usi === usi;
}

function isSelectedHand(type) {
  return selected.value?.kind === "hand" && selected.value.type === type;
}

function isLegalTarget(usi) {
  return legalTargetSet.value.has(usi);
}

function isPromoted(type) {
  return [
    PieceType.PROM_PAWN,
    PieceType.PROM_LANCE,
    PieceType.PROM_KNIGHT,
    PieceType.PROM_SILVER,
    PieceType.HORSE,
    PieceType.DRAGON,
  ].includes(type);
}

function cellAria(cell) {
  if (!cell.piece) return `${cell.usi}: 空`;
  const owner = cell.piece.color === humanColor.value ? "你" : "AI";
  return `${cell.usi}: ${owner}${shogiPieceLabel(cell.piece.type)}`;
}

function clickBoard(cell) {
  if (aiThinking.value || gameOver.value || promotionPrompt.value) return;
  if (position.value.color !== humanColor.value) return;

  if (selected.value && isLegalTarget(cell.usi)) {
    const moves = selectedMoves.value.filter((move) => move.to.usi === cell.usi);
    if (moves.length > 1 && moves.some((move) => move.promote)) {
      promotionPrompt.value = { moves };
      return;
    }
    if (moves[0]) applyHumanMove(moves[0]);
    return;
  }

  if (cell.piece?.color === humanColor.value) {
    selected.value = { kind: "board", usi: cell.usi };
    return;
  }
  selected.value = null;
}

function clickHand(piece) {
  if (aiThinking.value || gameOver.value || position.value.color !== humanColor.value) return;
  selected.value = { kind: "hand", type: piece.type };
}

function choosePromotion(promote) {
  const move = promotionPrompt.value?.moves.find((candidate) => candidate.promote === promote);
  if (move) applyHumanMove(move);
}

function applyHumanMove(move) {
  const text = formatShogiMove(position.value, move);
  if (!position.value.doMove(move)) return;
  moveLog.value = [...moveLog.value, { move, text: `你 ${text}` }].slice(-10);
  selected.value = null;
  promotionPrompt.value = null;
  syncPosition();
  if (!resolveGame()) triggerAI();
}

function triggerAI() {
  if (gameOver.value || position.value.color !== aiColor.value) return;
  aiThinking.value = true;
  clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    const aiMove = chooseShogiAIMove(position.value.sfen, difficulty.value, rng);
    if (aiMove) {
      const move = position.value.createMoveByUSI(aiMove.usi);
      if (move) {
        const text = formatShogiMove(position.value, move);
        position.value.doMove(move);
        moveLog.value = [...moveLog.value, { move, text: `AI ${text}` }].slice(-10);
        syncPosition();
      }
    }
    aiThinking.value = false;
    resolveGame();
  }, 180);
}

function resolveGame() {
  if (getLegalShogiMoves(position.value).length > 0) return false;
  gameOver.value = true;
  const winner = oppositeShogiColor(position.value.color);
  if (winner === humanColor.value) {
    stats.wins++;
    emit("solved", {});
    overlay.title = "你詰住 AI";
    overlay.sub = `${shogiColorName(winner)}獲勝。`;
  } else {
    stats.losses++;
    overlay.title = "AI 詰住你";
    overlay.sub = `${shogiColorName(winner)}獲勝。`;
  }
  saveStats();
  overlay.open = true;
  return true;
}

function restart() {
  clearTimeout(aiTimer);
  position.value = createShogiPosition();
  selected.value = null;
  promotionPrompt.value = null;
  aiThinking.value = false;
  gameOver.value = false;
  overlay.open = false;
  moveLog.value = [];
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
  let undone = 0;
  while (moveLog.value.length > 0 && undone < 2) {
    const last = moveLog.value[moveLog.value.length - 1];
    position.value.undoMove(last.move);
    moveLog.value = moveLog.value.slice(0, -1);
    undone++;
    if (position.value.color === humanColor.value) break;
  }
  selected.value = null;
  promotionPrompt.value = null;
  gameOver.value = false;
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
      stats.losses = saved.losses || 0;
    }
  } catch (_) {}
});

onBeforeUnmount(() => clearTimeout(aiTimer));
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="日本將棋" title-en="Shogi">
      <template #actions>
        <button class="btn" :disabled="!canUndo" @click="undoMove">悔棋</button>
        <button class="btn btn--accent" @click="restart">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage shogi-stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">你</span>
            <span class="chip__value is-accent">{{ shogiColorName(humanColor) }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">狀態</span>
            <span class="chip__value chip__value--text">{{ statusText }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">手番</span>
            <span class="chip__value">{{ shogiColorName(position.color) }}</span>
          </div>
        </div>

        <div class="board-wrap shogi-wrap">
          <div class="hand-row hand-row--ai">
            <span class="hand-row__label">AI 持駒</span>
            <div class="hand-row__pieces">
              <span v-if="aiHand.length === 0" class="hand-empty">なし</span>
              <span v-for="piece in aiHand" :key="piece.type" class="hand-chip">
                {{ piece.label }}<small>×{{ piece.count }}</small>
              </span>
            </div>
          </div>

          <div class="shogi-board" role="grid" aria-label="日本將棋盤面">
            <button
              v-for="cell in boardCells"
              :key="cell.usi"
              class="shogi-cell"
              :class="{
                'is-selected': isSelectedBoard(cell.usi),
                'is-legal': isLegalTarget(cell.usi),
              }"
              :aria-label="cellAria(cell)"
              :disabled="aiThinking || gameOver || position.color !== humanColor"
              @click="clickBoard(cell)"
            >
              <span class="square-coord" aria-hidden="true">{{ cell.file }}{{ cell.rank }}</span>
              <span
                v-if="cell.piece"
                class="shogi-piece"
                :class="{
                  'piece--mine': cell.piece.color === humanColor,
                  'piece--opponent': cell.piece.color !== humanColor,
                  'piece--promoted': isPromoted(cell.piece.type),
                }"
              >
                {{ shogiPieceLabel(cell.piece.type) }}
              </span>
              <span v-if="isLegalTarget(cell.usi)" class="target-dot" aria-hidden="true"></span>
            </button>
          </div>

          <div class="hand-row hand-row--player">
            <span class="hand-row__label">你的持駒</span>
            <div class="hand-row__pieces">
              <span v-if="humanHand.length === 0" class="hand-empty">なし</span>
              <button
                v-for="piece in humanHand"
                :key="piece.type"
                class="hand-chip hand-chip--button"
                :class="{ 'is-selected': isSelectedHand(piece.type) }"
                :disabled="aiThinking || gameOver || position.color !== humanColor"
                @click="clickHand(piece)"
              >
                {{ piece.label }}<small>×{{ piece.count }}</small>
              </button>
            </div>
          </div>

          <div class="promotion-pop" v-if="promotionPrompt">
            <div class="promotion-pop__title">升變嗎？</div>
            <div class="promotion-pop__choices">
              <button class="btn btn--accent" @click="choosePromotion(true)">成</button>
              <button class="btn" @click="choosePromotion(false)">不成</button>
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
            <button :aria-pressed="humanColor === Color.BLACK" @click="setSide(Color.BLACK)">先手</button>
            <button :aria-pressed="humanColor === Color.WHITE" @click="setSide(Color.WHITE)">後手</button>
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
            規則由 <strong style="color: var(--text)">tsshogi</strong> 驗證。將棋頂尖開源引擎以
            YaneuraOu/Suisho 系列最具代表性，但最新版也依賴 NNUE；本頁內建純 rule-based 搜尋 AI。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">戰績</span>
          <p class="hint">勝 {{ stats.wins }} ／ 負 {{ stats.losses }}</p>
        </div>

        <div class="panel__group" v-if="moveLog.length">
          <span class="panel__legend">最近棋步</span>
          <ol class="move-list">
            <li v-for="(entry, index) in moveLog" :key="`${entry.text}-${index}`">{{ entry.text }}</li>
          </ol>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.shogi-stage {
  max-width: 1260px;
}
.chip__value--text {
  width: 7.8em;
  font-size: 1rem;
  line-height: 1.25;
  white-space: nowrap;
}
.shogi-wrap {
  position: relative;
  display: grid;
  gap: 0.75rem;
  justify-items: center;
}
.shogi-board {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  width: min(92vw, 68vh, 585px);
  aspect-ratio: 1;
  border-radius: var(--r-md);
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.08), transparent 26%, rgba(0,0,0,0.12)),
    #c8944f;
  border: 1px solid color-mix(in oklab, var(--accent) 40%, var(--line));
  box-shadow: var(--shadow-2), inset 0 0 40px rgba(70, 36, 12, 0.42);
}
.shogi-cell {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  border: 1px solid rgba(75, 43, 16, 0.44);
  background: transparent;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.shogi-cell:disabled {
  cursor: default;
}
.shogi-cell:not(:disabled):hover {
  background: rgba(255, 238, 185, 0.22);
}
.shogi-cell.is-selected {
  box-shadow: inset 0 0 0 3px var(--accent);
}
.shogi-cell.is-legal {
  background: color-mix(in oklab, var(--accent) 18%, transparent);
}
.square-coord {
  position: absolute;
  right: 0.16rem;
  top: 0.1rem;
  z-index: 1;
  font-family: var(--font-mono);
  font-size: clamp(0.48rem, 1.6vw, 0.62rem);
  color: rgba(68, 36, 12, 0.45);
  pointer-events: none;
}
.shogi-piece {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 78%;
  height: 86%;
  padding-top: 10%;
  clip-path: polygon(50% 0, 90% 20%, 82% 100%, 18% 100%, 10% 20%);
  background: linear-gradient(180deg, #fff0bf, #d7a95e);
  color: #2a1709;
  border: 1px solid rgba(67, 35, 10, 0.45);
  font-family: var(--font-display);
  font-size: clamp(1rem, 4vw, 2.05rem);
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 3px 8px rgba(40, 20, 6, 0.35);
}
.piece--opponent {
  transform: rotate(180deg);
  background: linear-gradient(180deg, #e9bf79, #9d6935);
}
.piece--promoted {
  color: #9b1c1c;
}
.target-dot {
  position: absolute;
  z-index: 3;
  width: 26%;
  height: 26%;
  border-radius: 50%;
  background: color-mix(in oklab, var(--accent) 78%, transparent);
  box-shadow: 0 0 14px color-mix(in oklab, var(--accent) 65%, transparent);
  pointer-events: none;
}
.shogi-cell:has(.shogi-piece) .target-dot {
  width: 80%;
  height: 86%;
  border-radius: 10px;
  background: transparent;
  border: 3px solid color-mix(in oklab, var(--accent) 80%, transparent);
}
.hand-row {
  width: min(92vw, 68vh, 585px);
  min-height: 52px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.7rem;
  border-radius: var(--r-sm);
  background: linear-gradient(180deg, var(--ink-850), var(--ink-900));
  border: 1px solid var(--line);
}
.hand-row__label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  color: var(--text-faint);
}
.hand-row__pieces {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: flex-end;
}
.hand-row--player .hand-row__pieces {
  justify-content: flex-start;
}
.hand-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.18rem;
  min-height: 34px;
  padding: 0.35rem 0.55rem;
  border-radius: var(--r-xs);
  background: color-mix(in oklab, var(--accent) 12%, var(--ink-700));
  border: 1px solid color-mix(in oklab, var(--accent) 25%, var(--line));
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 800;
}
.hand-chip small {
  font-family: var(--font-mono);
  color: var(--text-dim);
}
.hand-chip--button {
  cursor: pointer;
}
.hand-chip--button.is-selected {
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: var(--glow-sm);
}
.hand-empty {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 0.78rem;
}
.promotion-pop {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 12;
  transform: translate(-50%, -50%);
  min-width: min(260px, 80vw);
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
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
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
@media (max-width: 560px) {
  .chip__value--text {
    width: 6.8em;
    font-size: 0.88rem;
  }
  .square-coord {
    display: none;
  }
  .hand-row {
    grid-template-columns: 1fr;
    justify-items: start;
  }
  .hand-row__pieces,
  .hand-row--player .hand-row__pieces {
    justify-content: flex-start;
  }
}
</style>
