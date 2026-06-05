/* Build the Word Guess word data for every supported word length (5–8).
   For each length L it emits app/games/wordguessWords{L}.ts containing:
     - VALID_GUESSES: every real L-letter word the game accepts as a guess.
         Sources unioned: the system dictionary (web2, incl. capitalised proper
         nouns like APRIL), an-array-of-english-words (~275k modern words),
         WordNet lemmas (adds country/month proper nouns such as KOREA/APRIL),
         and a hand supplement. This is why everyday words and names that the old
         web2-only list rejected (APRIL, KOREA, …) are now accepted.
     - ANSWERS: the curated/common pool the puzzle picks its solution from.
         L=5 keeps the original hand-curated list; L=6–8 are drawn from a
         frequency list (google-10000) intersected with an-array (which excludes
         proper nouns, so answers stay fair) and filtered to words that have a
         definition.
     - DEFINITIONS: a short gloss for every answer (WordNet, with a small hand
         fallback/override map) so the game can tell you what the word means.

   Self-contained: reads WordNet straight from the `wordnet-db` data files, so no
   postinstall/build step is required. Run: node scripts/gen-wordguess.mjs */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LENGTHS = [5, 6, 7, 8];
const COMMON_FILE = "scripts/common-words.txt"; // google-10000, frequency-ordered

// ----------------------------------------------------------------------------
// Sources
// ----------------------------------------------------------------------------

// System dictionary (Webster's 2nd). Keep BOTH lowercase and capitalised forms
// (uppercased) so proper nouns the old generator dropped — APRIL, INDIA, … — are
// accepted as guesses. Missing on non-mac systems; we degrade gracefully.
function readSystemDict() {
  for (const p of ["/usr/share/dict/web2", "/usr/share/dict/words"]) {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      /* try next */
    }
  }
  console.warn("! system dictionary not found — relying on an-array + WordNet");
  return "";
}
const web2 = new Set(); // every word (any case), uppercased — for valid guesses
const web2Lower = new Set(); // only words that appear LOWERCASE in the dictionary.
// Proper nouns are capitalised-only in web2, so a lowercase entry is a strong
// "this is an ordinary word, not a name/place" signal — used to keep the answer
// pool fair (no ALASKA/ALBERT/LONDON as the secret word, though they're valid guesses).
for (const raw of readSystemDict().split("\n")) {
  const w = raw.trim();
  if (/^[a-zA-Z]+$/.test(w)) web2.add(w.toUpperCase());
  if (/^[a-z]+$/.test(w)) web2Lower.add(w.toUpperCase());
}

// ~275k modern English words. Lowercase, and deliberately EXCLUDES proper nouns
// — which makes it the perfect gate for keeping the answer pool fair.
const anArray = require("an-array-of-english-words");
const anArraySet = new Set(anArray.map((w) => w.toUpperCase()));

// WordNet: lemma list (adds proper nouns like KOREA) + definitions, parsed
// directly from the wordnet-db data files.
const WN = loadWordNet();

function loadWordNet() {
  const dict = require("wordnet-db").path;
  const POSES = ["noun", "adj", "verb", "adv"];
  const data = {}; // pos -> Map(offset -> first definition clause)
  const index = {}; // pos -> Map(lemma -> first-sense offset)
  const lemmas = new Set();

  for (const pos of POSES) {
    const dmap = new Map();
    for (const line of fs.readFileSync(path.join(dict, `data.${pos}`), "utf8").split("\n")) {
      if (!line || line.startsWith("  ")) continue; // skip licence header
      const offset = line.slice(0, 8);
      const bar = line.indexOf("|");
      if (bar < 0) continue;
      // The gloss is `definition; definition; "example"` — keep the definition
      // clauses (those not starting with a quote) and use the first one.
      const clauses = line
        .slice(bar + 1)
        .trim()
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('"'));
      dmap.set(offset, clauses[0] || "");
    }
    data[pos] = dmap;

    const imap = new Map();
    for (const raw of fs.readFileSync(path.join(dict, `index.${pos}`), "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || raw.startsWith("  ")) continue;
      const parts = line.split(/\s+/);
      const lemma = parts[0];
      const synsetCnt = Number(parts[2]);
      const offsets = parts.slice(parts.length - synsetCnt); // trailing offsets
      imap.set(lemma, offsets[0]); // sense 1 = most common
      if (/^[a-z]+$/.test(lemma)) lemmas.add(lemma.toUpperCase());
    }
    index[pos] = imap;
  }

  function defOf(word) {
    const w = word.toLowerCase();
    for (const pos of POSES) {
      const off = index[pos].get(w);
      if (off && data[pos].get(off)) {
        return data[pos].get(off).replace(/\s+/g, " ").trim();
      }
    }
    return null;
  }
  return { lemmas, defOf };
}

// ----------------------------------------------------------------------------
// Hand data: supplement (extra valid guesses), curated 5-letter answers, and
// definition fallbacks/overrides.
// ----------------------------------------------------------------------------

// Modern terms / inflections / loanwords players guess that the dictionaries may
// miss. Any length; filtered per length below.
const SUPPLEMENT = `
EMAIL BLOGS VLOGS SUSHI SALSA MOCHA LATTE VEGAN DRONE EBOOK MODEM SCUBA TANGO
SAMBA PANDA MANGO TACOS NACHO CURRY KEBAB VODKA COMBO TURBO RETRO MEMES VIRAL
ROBOT PROXY SETUP LOGIN ADMIN INTRO MACRO MICRO PHOTO EMOJI VAPES SODAS RAMEN
BENTO BAGEL DONUT WAFER FUDGE PESTO PIXEL SWIPE TWEET REPLY SHARE LINKS POSTS
USERS PINGS SELFIE PODCAST EMOJIS MEMBER LAPTOP GADGET WIDGET WEBCAM ROUTER
INTERNET DOWNLOAD KEYBOARD SOFTWARE HARDWARE PASSWORD`;

// The original, hand-curated 5-letter answer pool (common, fair, no proper
// nouns). Preserved verbatim so the daily puzzle and difficulty stay consistent.
const CANDIDATES_5 = `
ABOUT ABOVE ABUSE ACTOR ACUTE ADMIT ADOPT ADULT AFTER AGAIN AGENT AGREE AHEAD
ALARM ALBUM ALERT ALIKE ALIVE ALLOW ALONE ALONG ALTER ANGEL ANGER ANGLE ANGRY
ANKLE APART APPLE APPLY ARENA ARGUE ARISE ARRAY ASIDE ASSET AVOID AWARD AWARE
AWFUL BACON BADGE BADLY BAKER BASIC BEACH BEARD BEAST BEGAN BEGIN BEING BELOW
BENCH BERRY BIRTH BLACK BLADE BLAME BLANK BLAST BLEED BLEND BLESS BLIND BLINK
BLOCK BLOOD BLOOM BOARD BOAST BONUS BOOST BOOTH BOUND BRAIN BRAND BRAVE BREAD
BREAK BREED BRICK BRIDE BRIEF BRING BROAD BROWN BRUSH BUILD BUILT BUNCH BURST
BUYER CABIN CABLE CANDY CARGO CARRY CATCH CAUSE CEASE CHAIN CHAIR CHALK CHAOS
CHARM CHART CHASE CHEAP CHEAT CHECK CHEEK CHEER CHESS CHEST CHIEF CHILD CHILL
CHINA CHOSE CIVIC CIVIL CLAIM CLASS CLEAN CLEAR CLERK CLICK CLIFF CLIMB CLING
CLOCK CLOSE CLOTH CLOUD COACH COAST COLOR COUCH COUGH COULD COUNT COURT COVER
CRACK CRAFT CRANE CRASH CRAZY CREAM CREEK CRIME CRISP CROSS CROWD CROWN CRUEL
CRUSH CURVE CYCLE DAILY DAIRY DANCE DEATH DEBUT DELAY DENSE DEPTH DERBY DEVIL
DIARY DIRTY DOZEN DRAFT DRAIN DRAMA DRANK DRAWN DREAM DRESS DRIED DRIFT
DRILL DRINK DRIVE DROVE DROWN DYING EAGER EAGLE EARLY EARTH EIGHT ELBOW ELDER
ELECT ELITE EMPTY ENEMY ENJOY ENTER ENTRY EQUAL ERROR ESSAY EVENT EVERY EXACT
EXIST EXTRA FAINT FAITH FALSE FANCY FAULT FAVOR FEAST FENCE FERRY FETCH FEVER
FIBER FIELD FIFTH FIFTY FIGHT FINAL FIRST FIXED FLAME FLASH FLEET FLESH FLOAT
FLOCK FLOOD FLOOR FLORA FLOUR FLUID FOCUS FORCE FORGE FORTH FORTY FORUM FOUND
FRAME FRANK FRAUD FRESH FRONT FROST FROZE FRUIT FULLY FUNNY GAUGE GENRE GHOST
GIANT GIVEN GLASS GLEAM GLOBE GLORY GLOVE GOING GRACE GRADE GRAIN GRAND GRANT
GRAPE GRAPH GRASP GRASS GRAVE GREAT GREED GREEN GREET GRIEF GRILL GRIND GROSS
GROUP GROWN GUARD GUESS GUEST GUIDE GUILT HABIT HAPPY HARSH HEART HEAVY HENCE
HOBBY HONEY HONOR HORSE HOTEL HOUSE HUMAN HUMOR HURRY ICILY IDEAL IMAGE IMPLY
INDEX INNER INPUT IRONY ISSUE IVORY JEANS JELLY JEWEL JOINT JUDGE JUICE JUICY
KNEEL KNIFE KNOCK KNOWN LABEL LABOR LANCE LARGE LASER LATER LAUGH LAYER LEARN
LEASE LEAST LEAVE LEGAL LEMON LEVEL LIGHT LIMIT LINEN LIVER LOCAL LODGE LOGIC
LOOSE LORRY LOVER LOWER LOYAL LUCKY LUNAR LUNCH LYING MAGIC MAJOR MAKER MARCH
MARRY MATCH MAYBE MAYOR MEANT MEDAL MEDIA MELON MERCY MERGE MERIT METAL METER
MIGHT MINOR MINUS MIXED MODEL MONEY MONTH MOOSE MORAL MOTOR MOUNT MOUSE MOUTH
MOVIE MUSIC NAKED NASTY NAVAL NERVE NEVER NEWLY NIGHT NINTH NOBLE NOISE NORTH
NOVEL NURSE OCCUR OCEAN OFFER OFTEN OLIVE ONION ORDER ORGAN OTHER OUGHT OUTER
OWNER PAINT PANEL PANIC PAPER PARTY PASTA PASTE PATCH PAUSE PEACE PEARL PEDAL
PENNY PHASE PHONE PHOTO PIANO PIECE PILOT PITCH PIVOT PIXEL PIZZA PLACE PLAIN
PLANE PLANT PLATE PLAZA PLEAD PLUMP POINT POLAR PORCH POUND POWER PRESS PRICE
PRIDE PRIME PRINT PRIOR PRIZE PROBE PRONE PROOF PROUD PROVE PROXY PULSE PUNCH
PUPIL PUPPY QUEEN QUERY QUEST QUEUE QUICK QUIET QUILT QUITE QUOTE RADAR RADIO
RAISE RALLY RANCH RANGE RAPID RATIO REACH READY REALM REBEL REFER REIGN RELAX
RELAY REPLY RHYME RHINO RIDGE RIFLE RIGHT RIGID RINSE RIVAL RIVER ROAST ROBIN
ROBOT ROCKY ROGUE ROUGH ROUND ROUTE ROYAL RUGBY RULER RURAL SADLY SAINT SALAD
SALON SANDY SAUCE SCALE SCARE SCENE SCENT SCOPE SCORE SCOUT SCRAP SCREW SENSE
SERVE SETUP SEVEN SEWER SHADE SHAFT SHAKE SHALL SHAME SHAPE SHARE SHARK SHARP
SHEEP SHEET SHELF SHELL SHIFT SHINE SHIRT SHOCK SHOOT SHORE SHORT SHOWN SHRUG
SIGHT SILLY SINCE SIXTH SIXTY SIZED SKILL SLASH SLATE SLAVE SLEEP SLICE SLIDE
SLOPE SMALL SMART SMASH SMELL SMILE SMOKE SNACK SNAKE SNEAK SOLAR SOLID SOLVE
SORRY SOUND SOUTH SPACE SPARE SPARK SPEAK SPEED SPELL SPEND SPENT SPICE SPILL
SPINE SPLIT SPOIL SPORT SPRAY SQUAD STACK STAFF STAGE STAIN STAIR STAKE STALE
STAMP STAND STARE STARK START STATE STEAM STEEL STEEP STEER STERN STICK STIFF
STILL STING STOCK STONE STOOD STOOL STORE STORM STORY STOUT STOVE STRAP STRAW
STRIP STUCK STUDY STUFF STYLE SUGAR SUITE SUNNY SUPER SWEAT SWEEP SWEET SWELL
SWIFT SWING SWORD TABLE TACKY TASTE TEACH TEETH TEMPO TENSE TENTH THANK THEFT
THEIR THEME THERE THESE THICK THIEF THING THINK THIRD THORN THOSE THREE THREW
THROW THUMB TIGER TIGHT TIRED TITLE TOAST TODAY TOKEN TOOTH TOPIC TORCH TOTAL
TOUCH TOUGH TOWEL TOWER TOXIC TRACE TRACK TRADE TRAIL TRAIN TRAIT TRASH TREAT
TREND TRIAL TRIBE TRICK TRIED TRUCK TRULY TRUNK TRUST TRUTH TWICE TWIST
ULTRA UNCLE UNDER UNDUE UNION UNITE UNITY UNTIL UPPER UPSET URBAN USAGE
USUAL VAGUE VALID VALUE VALVE VAULT VENUE VERSE VIDEO VIRUS VISIT VITAL VOCAL
VOICE VOTER WAGON WAIST WASTE WATCH WATER WEARY WEDGE WEIRD WHALE WHEAT WHEEL
WHERE WHICH WHILE WHITE WHOLE WHOSE WIDEN WIDOW WIDTH WINCE WORLD WORRY WORSE
WORST WORTH WOUND WRECK WRIST WRITE WRONG WROTE YACHT YEARN YIELD YOUNG YOUTH
ZEBRA ZONAL`;

// Definitions for common words WordNet lacks (function words / irregular verb
// forms) and a few overrides where WordNet's first sense is misleading for a
// general-audience word game.
const HAND_DEFS = {
  // 5-letter function words & irregular forms (no WordNet gloss)
  BEGAN: 'past tense of "begin"; started',
  CHOSE: 'past tense of "choose"; picked from options',
  COULD: 'past tense of "can"; was able to',
  DRANK: 'past tense of "drink"; swallowed liquid',
  FROZE: 'past tense of "freeze"; turned to ice',
  MEANT: 'past tense of "mean"; intended',
  MEDIA: "the channels of mass communication, such as TV and the press",
  OUGHT: "used to express duty or what is advisable",
  SHALL: "used to express the future tense or a strong intention",
  SHOWN: 'past participle of "show"; made visible',
  SINCE: "from a past time until now; because",
  STOOD: 'past tense of "stand"; was upright on one\'s feet',
  THEIR: "belonging to or associated with them",
  THESE: 'plural of "this"; the ones here',
  THOSE: 'plural of "that"; the ones there',
  THREW: 'past tense of "throw"; sent through the air',
  UNTIL: "up to the point in time of",
  WHERE: "in, at, or to what place",
  WHICH: "asking about a choice among a set",
  WHOSE: "belonging to whom",
  WROTE: 'past tense of "write"; formed letters or words',
  // overrides: prefer the everyday meaning over WordNet's figurative sense 1
  TIGER: "a large striped wild cat native to Asia",
  TABLE: "a piece of furniture with a flat top and one or more legs",
};

// Words to keep OUT of the answer pool (still valid as guesses): adult topics
// and a few that read awkwardly as a family-friendly puzzle solution.
const ANSWER_BLOCKLIST = new Set(["EROTIC", "EROTICA", "SEXUALLY", "ESCORT", "PENIS"]);

// ----------------------------------------------------------------------------
// Build
// ----------------------------------------------------------------------------

const supplementWords = SUPPLEMENT.trim().split(/\s+/).filter((w) => /^[A-Z]+$/.test(w));
const commonWords = fs.existsSync(COMMON_FILE)
  ? fs
      .readFileSync(COMMON_FILE, "utf8")
      .split("\n")
      .map((w) => w.trim().toUpperCase())
      .filter((w) => /^[A-Z]+$/.test(w))
  : [];

// Definition for an answer word: hand map first, then WordNet, trimmed to a
// readable length.
function definitionFor(word) {
  const hand = HAND_DEFS[word];
  if (hand) return hand;
  const wn = WN.defOf(word);
  if (!wn) return null;
  let d = wn.replace(/\s+/g, " ").trim();
  if (d.length > 140) d = d.slice(0, 138).replace(/\s+\S*$/, "") + "…";
  return d;
}

function buildLength(L) {
  // Valid guesses: union of all sources, this length only.
  const valid = new Set();
  const add = (w) => {
    if (w.length === L && /^[A-Z]+$/.test(w)) valid.add(w);
  };
  web2.forEach(add);
  anArraySet.forEach(add);
  WN.lemmas.forEach(add);
  supplementWords.forEach(add);

  // Answer candidates: frequency-ordered common words that are ordinary words
  // (a lowercase web2 entry — filters out proper nouns like ALASKA/LONDON). The
  // original hand-curated 5-letter pool is unioned in and exempt from the
  // commonness/casing filter so the classic daily list is preserved in full.
  const curated = L === 5 ? CANDIDATES_5.trim().split(/\s+/) : [];
  const fromFrequency = commonWords.filter((w) => w.length === L && web2Lower.has(w));
  const isCurated = new Set(curated);

  const seen = new Set();
  const answers = [];
  const definitions = {};
  const dropped = { dupe: [], nodef: [], blocked: [] };
  for (const w of [...curated, ...fromFrequency]) {
    if (w.length !== L || !/^[A-Z]+$/.test(w)) continue;
    if (seen.has(w)) {
      dropped.dupe.push(w);
      continue;
    }
    seen.add(w);
    if (ANSWER_BLOCKLIST.has(w) && !isCurated.has(w)) {
      dropped.blocked.push(w);
      continue;
    }
    const def = definitionFor(w);
    if (!def) {
      dropped.nodef.push(w);
      continue;
    }
    answers.push(w);
    definitions[w] = def;
    valid.add(w); // every answer must be an accepted guess
  }
  answers.sort();

  return { valid: [...valid].sort(), answers, definitions, dropped };
}

// ----------------------------------------------------------------------------
// Emit
// ----------------------------------------------------------------------------

function fmtAnswers(arr) {
  const lines = [];
  for (let i = 0; i < arr.length; i += 10) {
    lines.push("  " + arr.slice(i, i + 10).map((w) => `"${w}"`).join(", ") + ",");
  }
  return lines.join("\n");
}
function fmtDefs(answers, defs) {
  return answers.map((w) => `  ${JSON.stringify(w)}: ${JSON.stringify(defs[w])},`).join("\n");
}
function packValid(arr) {
  const lines = [];
  for (let i = 0; i < arr.length; i += 18) lines.push("  " + arr.slice(i, i + 18).join(" "));
  return lines.join("\n");
}

for (const L of LENGTHS) {
  const { valid, answers, definitions, dropped } = buildLength(L);
  const out = `/* AUTO-GENERATED by scripts/gen-wordguess.mjs — do not edit by hand.
   ${L}-letter Word Guess data.
     ANSWERS      — common, fair words the puzzle is drawn from.
     DEFINITIONS  — a short gloss for every answer (shown when the round ends).
     VALID_GUESSES — every real ${L}-letter word accepted as a guess.
   Regenerate with: node scripts/gen-wordguess.mjs */

export const ANSWERS: string[] = [
${fmtAnswers(answers)}
];

export const DEFINITIONS: Record<string, string> = {
${fmtDefs(answers, definitions)}
};

// ${valid.length} words, space-joined to keep the source compact.
const VALID_PACKED =
\`${packValid(valid)}\`;

export const VALID_GUESSES: string[] = VALID_PACKED.trim().split(/\\s+/);
`;
  const file = `app/games/wordguessWords${L}.ts`;
  fs.writeFileSync(file, out);
  console.log(
    `L=${L}: valid=${valid.length}  answers=${answers.length}  ` +
      `(dropped: ${dropped.nodef.length} no-def, ${dropped.dupe.length} dup, ${dropped.blocked.length} blocked) -> ${file}`,
  );
  if (L === 5 && dropped.nodef.length) {
    console.log("   5-letter no-def (add a HAND_DEFS entry):", dropped.nodef.join(" "));
  }
}
console.log("\nDone — wrote 4 per-length data files.");
