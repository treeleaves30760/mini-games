/* Sokoban — framework-free game logic, shared by the Vue component and unit tests.
   Pure data: level definitions, parsing, movement rules, win detection, undo.
   No Vue, no DOM, no localStorage. */

// ---- tile constants ----
export const WALL      = "#";
export const FLOOR     = " ";
export const TARGET    = ".";
export const BOX       = "$";
export const BOX_ON    = "*";  // box on target
export const PLAYER    = "@";
export const PLAYER_ON = "+";  // player on target

// ---- types ----
export interface Pos { x: number; y: number }

export interface ParsedLevel {
  name: string;
  /** clean grid: only WALL / FLOOR / TARGET — no player or box cells */
  grid: string[][];
  rows: number;
  cols: number;
  /** initial player position */
  px: number;
  py: number;
  /** initial box positions */
  boxes: Pos[];
  /** target positions (never changes) */
  targets: Pos[];
}

/** Mutable snapshot of one move: what was true *before* the move. */
export interface HistoryEntry {
  px: number;
  py: number;
  boxes: Pos[];
}

/** The full mutable game state (plain object — no Vue reactivity). */
export interface SokobanState {
  /** index into LEVELS */
  levelIndex: number;
  playerX: number;
  playerY: number;
  boxes: Pos[];
  history: HistoryEntry[];
  moves: number;
  pushes: number;
  won: boolean;
}

// ---- raw level definitions ----
// Cell chars: # wall  ' ' floor  . target  $ box  * box-on-target  @ player  + player-on-target
interface RawLevel { name: string; map: string[] }

export const RAW_LEVELS: RawLevel[] = [
  {
    name: "初探",
    map: [
      "#####",
      "#@$.#",
      "#####",
    ],
  },
  {
    name: "轉角",
    map: [
      "#####",
      "# . #",
      "# $ #",
      "#@  #",
      "#####",
    ],
  },
  {
    name: "雙星",
    map: [
      "#######",
      "#  @  #",
      "#.$  .#",
      "# $ $ #",
      "# . . #",
      "#######",
    ],
  },
  {
    name: "雙箱迴廊",
    map: [
      "########",
      "#      #",
      "# .$@$.#",
      "#      #",
      "########",
    ],
  },
  {
    name: "四方陣",
    map: [
      "#########",
      "#   .   #",
      "#  $ $  #",
      "# . @ . #",
      "#  $ $  #",
      "#   .   #",
      "#########",
    ],
  },
  {
    name: "迷宮箱",
    map: [
      "########",
      "#@ #  .#",
      "#  $$  #",
      "# #  # #",
      "#  $   #",
      "#.  . ##",
      "########",
    ],
  },
];

// ---- level parser ----
/** Parse a raw ASCII map into a clean ParsedLevel. */
export function parseLevel(raw: RawLevel): ParsedLevel {
  const grid = raw.map.map((row) => row.split(""));
  const rows = grid.length;
  const cols = Math.max(...grid.map((r) => r.length));
  // pad rows to uniform width
  for (const row of grid) {
    while (row.length < cols) row.push(FLOOR);
  }

  let px = 0, py = 0;
  const boxes: Pos[] = [];
  const targets: Pos[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = grid[y][x];
      if (c === PLAYER || c === PLAYER_ON) { px = x; py = y; }
      if (c === BOX || c === BOX_ON) boxes.push({ x, y });
      if (c === TARGET || c === BOX_ON || c === PLAYER_ON) targets.push({ x, y });
    }
  }

  // Build clean floor/wall/target grid (strip player and box info)
  const clean = grid.map((row) =>
    row.map((c) => {
      if (c === PLAYER)    return FLOOR;
      if (c === PLAYER_ON) return TARGET;
      if (c === BOX)       return FLOOR;
      if (c === BOX_ON)    return TARGET;
      return c;
    })
  );

  return { name: raw.name, grid: clean, rows, cols, px, py, boxes, targets };
}

/** All bundled levels, parsed once at module load. */
export const LEVELS: ParsedLevel[] = RAW_LEVELS.map(parseLevel);

// ---- pure game helpers ----

/** Return the cell type at (x, y) in the level's clean grid; out-of-bounds → WALL. */
export function cellAt(level: ParsedLevel, x: number, y: number): string {
  if (y < 0 || y >= level.rows || x < 0 || x >= level.cols) return WALL;
  return level.grid[y][x];
}

/** Index of the box occupying (x, y), or -1 if none. */
export function boxAt(boxes: Pos[], x: number, y: number): number {
  return boxes.findIndex((b) => b.x === x && b.y === y);
}

/** True if (x, y) is a target cell. */
export function isTarget(level: ParsedLevel, x: number, y: number): boolean {
  return level.targets.some((t) => t.x === x && t.y === y);
}

/** True when every box rests on a target. */
export function isWon(level: ParsedLevel, boxes: Pos[]): boolean {
  const targets = level.targets;
  return boxes.every((b) => targets.some((t) => t.x === b.x && t.y === b.y));
}

// ---- movement ----

/** Outcome of a move attempt. */
export type MoveResult =
  | { kind: "blocked" }
  | { kind: "moved";  state: SokobanState }
  | { kind: "pushed"; state: SokobanState }
  | { kind: "won";    state: SokobanState };

/**
 * Attempt to move the player by (dx, dy) in the given level.
 * Returns an immutable result — the original state is never mutated.
 *
 * Rules:
 *  - Moving into a wall → blocked.
 *  - Moving into a box:
 *      - If the cell beyond the box is empty/target → box pushed, player moves.
 *      - If the cell beyond is a wall or another box → blocked.
 *  - Moving into an empty cell → player moves.
 *  - If the move completes the puzzle → result.kind === "won".
 */
export function applyMove(
  level: ParsedLevel,
  state: SokobanState,
  dx: number,
  dy: number
): MoveResult {
  if (state.won) return { kind: "blocked" };

  const nx = state.playerX + dx;
  const ny = state.playerY + dy;

  if (cellAt(level, nx, ny) === WALL) return { kind: "blocked" };

  const bi = boxAt(state.boxes, nx, ny);

  if (bi >= 0) {
    // Trying to push a box
    const bx2 = nx + dx;
    const by2 = ny + dy;
    if (cellAt(level, bx2, by2) === WALL || boxAt(state.boxes, bx2, by2) >= 0) {
      return { kind: "blocked" };
    }

    // Deep-copy boxes and move the pushed one
    const newBoxes = state.boxes.map((b) => ({ ...b }));
    newBoxes[bi] = { x: bx2, y: by2 };

    const newHistory: HistoryEntry[] = [
      ...state.history,
      { px: state.playerX, py: state.playerY, boxes: state.boxes.map((b) => ({ ...b })) },
    ];

    const newState: SokobanState = {
      ...state,
      playerX: nx,
      playerY: ny,
      boxes: newBoxes,
      history: newHistory,
      moves: state.moves + 1,
      pushes: state.pushes + 1,
    };

    if (isWon(level, newBoxes)) {
      return { kind: "won", state: { ...newState, won: true } };
    }
    return { kind: "pushed", state: newState };
  } else {
    // Plain move into an empty cell
    const newHistory: HistoryEntry[] = [
      ...state.history,
      { px: state.playerX, py: state.playerY, boxes: state.boxes.map((b) => ({ ...b })) },
    ];

    const newState: SokobanState = {
      ...state,
      playerX: nx,
      playerY: ny,
      history: newHistory,
      moves: state.moves + 1,
    };
    return { kind: "moved", state: newState };
  }
}

// ---- undo ----

/** Undo result: either nothing to undo or the previous state. */
export type UndoResult =
  | { kind: "empty" }
  | { kind: "undone"; state: SokobanState };

/**
 * Pop the most recent history entry and return the restored state.
 * If history is empty returns { kind: "empty" }.
 */
export function applyUndo(state: SokobanState): UndoResult {
  if (state.history.length === 0) return { kind: "empty" };

  const history = [...state.history];
  const prev = history.pop()!;

  const newState: SokobanState = {
    ...state,
    playerX: prev.px,
    playerY: prev.py,
    boxes: prev.boxes,
    history,
    moves: Math.max(0, state.moves - 1),
    won: false,
  };
  return { kind: "undone", state: newState };
}

// ---- state factory ----

/** Create a fresh game state for the given level (by index into LEVELS). */
export function makeLevelState(levelIndex: number): SokobanState {
  const idx = ((levelIndex % LEVELS.length) + LEVELS.length) % LEVELS.length;
  const lv = LEVELS[idx];
  return {
    levelIndex: idx,
    playerX: lv.px,
    playerY: lv.py,
    boxes: lv.boxes.map((b) => ({ ...b })),
    history: [],
    moves: 0,
    pushes: 0,
    won: false,
  };
}
