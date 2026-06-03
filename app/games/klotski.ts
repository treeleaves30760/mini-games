/* Klotski (華容道) — framework-free game logic.
   Classic 4-wide × 5-tall sliding-block puzzle.
   Shared by the Vue component and the Vitest suite. */

// ---- board constants ----
export const COLS = 4;
export const ROWS = 5;

/** Goal: Cao Cao (id 0, the 2×2 block) must reach this position to win. */
export const WIN_ROW = 3;
export const WIN_COL = 1;

// ---- types ----
export type BlockType = "2x2" | "1x2h" | "2x1v" | "1x1";

export interface Block {
  id: number;
  type: BlockType;
  r: number;
  c: number;
}

export interface Layout {
  name: string;
  blocks: Block[];
}

/** An occupancy map: "r,c" → block id, covering every cell a block occupies. */
export type OccupiedMap = Record<string, number>;

// ---- two canonical, known-solvable layouts ----
export const VALID_LAYOUTS: Layout[] = [
  {
    name: "橫刀立馬",
    blocks: [
      { id: 0, type: "2x2",  r: 0, c: 1 }, // Cao Cao
      { id: 1, type: "2x1v", r: 0, c: 0 },
      { id: 2, type: "2x1v", r: 0, c: 3 },
      { id: 3, type: "2x1v", r: 2, c: 0 },
      { id: 4, type: "2x1v", r: 2, c: 3 },
      { id: 5, type: "1x2h", r: 2, c: 1 },
      { id: 6, type: "1x1",  r: 3, c: 1 },
      { id: 7, type: "1x1",  r: 3, c: 2 },
      { id: 8, type: "1x1",  r: 4, c: 0 },
      { id: 9, type: "1x1",  r: 4, c: 3 },
    ],
  },
  {
    name: "百萬軍中",
    blocks: [
      { id: 0, type: "2x2",  r: 0, c: 1 }, // Cao Cao
      { id: 1, type: "2x1v", r: 0, c: 0 },
      { id: 2, type: "2x1v", r: 0, c: 3 },
      { id: 3, type: "2x1v", r: 2, c: 1 },
      { id: 4, type: "2x1v", r: 2, c: 2 },
      { id: 5, type: "1x2h", r: 4, c: 1 },
      { id: 6, type: "1x1",  r: 2, c: 0 },
      { id: 7, type: "1x1",  r: 2, c: 3 },
      { id: 8, type: "1x1",  r: 3, c: 0 },
      { id: 9, type: "1x1",  r: 3, c: 3 },
    ],
  },
];

// ---- geometry ----

/** Return the (width, height) in grid cells for each block type. */
export function blockDims(type: BlockType): { w: number; h: number } {
  if (type === "2x2")  return { w: 2, h: 2 };
  if (type === "1x2h") return { w: 2, h: 1 };
  if (type === "2x1v") return { w: 1, h: 2 };
  return { w: 1, h: 1 };
}

/** All grid cells occupied by block `b`. */
export function blockCells(b: Block): { r: number; c: number }[] {
  const { w, h } = blockDims(b.type);
  const cells: { r: number; c: number }[] = [];
  for (let dr = 0; dr < h; dr++)
    for (let dc = 0; dc < w; dc++)
      cells.push({ r: b.r + dr, c: b.c + dc });
  return cells;
}

/** Build an occupancy map from an array of blocks. */
export function buildOccupied(blks: Block[]): OccupiedMap {
  const map: OccupiedMap = {};
  for (const b of blks)
    for (const { r, c } of blockCells(b))
      map[`${r},${c}`] = b.id;
  return map;
}

// ---- move legality ----

/**
 * Return true if block `b` can move one step in direction (dr, dc) without
 * leaving the board or overlapping any other block.
 */
export function canMove(b: Block, dr: number, dc: number, blks: Block[]): boolean {
  const { w, h } = blockDims(b.type);
  const occ = buildOccupied(blks.filter((x) => x.id !== b.id));
  for (let row = b.r; row < b.r + h; row++) {
    for (let col = b.c; col < b.c + w; col++) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false;
      if (occ[`${nr},${nc}`] !== undefined) return false;
    }
  }
  return true;
}

// ---- applying moves ----

/**
 * Return a new blocks array with block `id` shifted by (dr, dc).
 * Pure / immutable: the original array is not modified.
 */
export function shiftBlock(blks: Block[], id: number, dr: number, dc: number): Block[] {
  return blks.map((b) => b.id === id ? { ...b, r: b.r + dr, c: b.c + dc } : { ...b });
}

// ---- win detection ----

/**
 * True when the 2×2 Cao Cao block (id 0) is at the winning position
 * (row WIN_ROW, col WIN_COL), meaning its top-left corner sits there.
 */
export function isWon(blks: Block[]): boolean {
  const cao = blks.find((b) => b.id === 0);
  return cao !== undefined && cao.r === WIN_ROW && cao.c === WIN_COL;
}

// ---- layout validation ----

/**
 * Return true when all blocks in the layout fit within the board and
 * no two blocks overlap each other.
 */
export function isValidLayout(blks: Block[]): boolean {
  const seen = new Set<string>();
  for (const b of blks) {
    for (const { r, c } of blockCells(b)) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      const key = `${r},${c}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
}
