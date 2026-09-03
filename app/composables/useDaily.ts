/* =========================================================================
   Daily Challenge — which game is featured today, and the player's streak.

   The rotation is a list of game ids that generate their puzzle from a seed
   and emit `solved`. dayIndex() % length picks today's entry, so everyone
   gets the same game and (via todaySeed()) the same puzzle on the same day.

   Everything here is date-dependent, so call it on the client (onMounted):
   the static build has no idea what day the visitor opens the page.
   ========================================================================= */

import { dayIndex, todaySeed } from "~/utils/rng";

export const DAILY_ROTATION = [
  "minesweeper",
  "wordle",
  "jp-wordle",
  "nonogram",
  "lights-out",
  "binario",
  "maze2d",
  "fifteen",
  "mastermind",
  "flood",
  "twenty-four",
  "word-search",
  "memory",
  "pipes",
  "hashi",
  "akari",
  "tents",
  "kenken",
  "equation-maze",
  "fraction-balance",
  "prime-hunter",
  "countdown",
  "function-runner",
  "flow",
  "rush-hour",
  "water-sort",
  "skyscrapers",
  "rullo",
  "untangle",
] as const;

export type DailyGameId = (typeof DAILY_ROTATION)[number];

export const DAILY_STORE_KEY = "playground.daily";

export interface DailyStore {
  lastDate?: string;
  streak?: number;
  best?: number;
}

export interface DailyStatus {
  /** today's seed, "YYYY-MM-DD" */
  seed: string;
  /** "9月3日" */
  dateLabel: string;
  gameId: DailyGameId;
  /** current streak (0 when broken / never played) */
  streak: number;
  best: number;
  doneToday: boolean;
}

export function dailyGameId(d: Date = new Date()): DailyGameId {
  const n = DAILY_ROTATION.length;
  return DAILY_ROTATION[((dayIndex(d) % n) + n) % n];
}

export function dailyDateLabel(d: Date = new Date()): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function loadDailyStore(): DailyStore {
  try {
    return JSON.parse(localStorage.getItem(DAILY_STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveDailyStore(s: DailyStore) {
  localStorage.setItem(DAILY_STORE_KEY, JSON.stringify(s));
}

function shiftDate(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Read today's status from localStorage. Client only. */
export function readDailyStatus(now: Date = new Date()): DailyStatus {
  const seed = todaySeed(now);
  const yesterday = todaySeed(shiftDate(now, -1));
  const s = loadDailyStore();
  let streak = 0;
  let doneToday = false;
  if (s.lastDate === seed) {
    doneToday = true;
    streak = s.streak || 1;
  } else if (s.lastDate === yesterday) {
    streak = s.streak || 0; // alive; finish today to extend it
  }
  return {
    seed,
    dateLabel: dailyDateLabel(now),
    gameId: dailyGameId(now),
    streak,
    best: s.best || 0,
    doneToday,
  };
}

/** Record today's challenge as solved and return the updated status. */
export function markDailySolved(now: Date = new Date()): DailyStatus {
  const seed = todaySeed(now);
  const yesterday = todaySeed(shiftDate(now, -1));
  const s = loadDailyStore();
  if (s.lastDate !== seed) {
    const streak = s.lastDate === yesterday ? (s.streak || 0) + 1 : 1;
    saveDailyStore({ lastDate: seed, streak, best: Math.max(s.best || 0, streak) });
  }
  return readDailyStatus(now);
}
