/* 日語猜詞 Japanese Word Guess — framework-free game logic + dictionary, shared
   by the Vue component and the unit tests. A Wordle-style deduction game played
   in hiragana: the answer is a common 4-mora Japanese word and each guess is
   scored kana-by-kana (correct / present / absent).

   Every answer carries learner metadata — kanji form, romaji reading, English
   and Chinese meanings, a short usage note, and two worked example sentences —
   so that solving a puzzle teaches the word. The Vue component reads the same
   data to render the reveal card and to speak the word aloud (Web Speech API).
   Keeping the data and scoring here (rather than inside the component) makes the
   rules independently testable. */
import type { Rng } from "~/utils/rng";

/** One worked example: a Japanese sentence with reading and translations. */
export interface JpExample {
  /** Japanese sentence (spaced word-by-word for beginners; uses the headword in kana). */
  jp: string;
  /** Hepburn reading of the sentence. */
  romaji: string;
  /** Chinese (Traditional) translation. */
  zh: string;
  /** English translation. */
  en: string;
}

/** A puzzle word, exactly WORD_LENGTH single hiragana with full learner notes. */
export interface JpWord {
  /** The answer, as guessable hiragana — one keyboard key per character. */
  kana: string;
  /** Natural written form (kanji or kana) shown on the reveal card. */
  display: string;
  /** Hepburn reading with macrons, for pronunciation. */
  romaji: string;
  /** English meaning. */
  en: string;
  /** Chinese (Traditional) meaning. */
  zh: string;
  /** Short category, shown as a fair, spoiler-free hint while playing. */
  category: string;
  /** A short learning tip in Chinese (word formation, particles, nuance…). */
  note: string;
  /** Two example sentences; the first always contains the headword in kana. */
  examples: JpExample[];
}

export const WORD_LENGTH = 4;
export const MAX_GUESSES = 6;

export type LetterState = "correct" | "present" | "absent";

/* The on-screen keyboard, laid out as the gojūon (五十音) plus the dakuten and
   handakuten rows. Also the single source of truth for which kana are legal in a
   guess — every answer character must appear here (asserted in the tests). */
export const KANA_ROWS: readonly string[][] = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["さ", "し", "す", "せ", "そ"],
  ["た", "ち", "つ", "て", "と"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ま", "み", "む", "め", "も"],
  ["や", "ゆ", "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", "を", "ん"],
  ["が", "ぎ", "ぐ", "げ", "ご"],
  ["ざ", "じ", "ず", "ぜ", "ぞ"],
  ["だ", "ぢ", "づ", "で", "ど"],
  ["ば", "び", "ぶ", "べ", "ぼ"],
  ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
];

/** Every kana the game accepts in a guess. */
export const KANA: ReadonlySet<string> = new Set(KANA_ROWS.flat());

/* Curated answers: everyday 4-mora words, each written with four standalone
   hiragana (no small kana ゃゅょっ or long-vowel marks) so one cell maps to one
   keyboard key. */
export const WORDS: readonly JpWord[] = [
  // ===== 食物 Food & drink =====
  {
    kana: "たべもの", display: "食べ物", romaji: "tabemono",
    en: "food", zh: "食物", category: "食物 Food",
    note: "「食べる(taberu, 吃) + 物(mono, 東西)」。問喜好用「〜が すきです」。",
    examples: [
      { jp: "にほんの たべものが すきです。", romaji: "Nihon no tabemono ga suki desu.", zh: "我喜歡日本的食物。", en: "I like Japanese food." },
      { jp: "すきな たべものは なんですか。", romaji: "Suki na tabemono wa nan desu ka.", zh: "你喜歡的食物是什麼？", en: "What food do you like?" },
    ],
  },
  {
    kana: "のみもの", display: "飲み物", romaji: "nomimono",
    en: "drink, beverage", zh: "飲料", category: "食物 Food",
    note: "「飲む(nomu, 喝) + 物」。點餐：のみものは いかがですか。",
    examples: [
      { jp: "つめたい のみものが ほしいです。", romaji: "Tsumetai nomimono ga hoshii desu.", zh: "我想要冰的飲料。", en: "I want a cold drink." },
      { jp: "のみものは なにに しますか。", romaji: "Nomimono wa nani ni shimasu ka.", zh: "飲料要點什麼？", en: "What would you like to drink?" },
    ],
  },
  {
    kana: "くだもの", display: "果物", romaji: "kudamono",
    en: "fruit", zh: "水果", category: "食物 Food",
    note: "蘋果、橘子等的總稱；不可數時不加量詞。",
    examples: [
      { jp: "くだものを まいにち たべます。", romaji: "Kudamono o mainichi tabemasu.", zh: "我每天吃水果。", en: "I eat fruit every day." },
      { jp: "あまい くだものが だいすきです。", romaji: "Amai kudamono ga daisuki desu.", zh: "我最愛甜的水果。", en: "I love sweet fruit." },
    ],
  },
  {
    kana: "たまねぎ", display: "玉ねぎ", romaji: "tamanegi",
    en: "onion", zh: "洋蔥", category: "食物 Food",
    note: "「玉(tama, 圓球) + ねぎ(negi, 蔥)」。",
    examples: [
      { jp: "たまねぎを きると なみだが でます。", romaji: "Tamanegi o kiru to namida ga demasu.", zh: "切洋蔥會流眼淚。", en: "Cutting onions makes your eyes water." },
      { jp: "カレーに たまねぎを いれます。", romaji: "Karē ni tamanegi o iremasu.", zh: "在咖哩裡加洋蔥。", en: "I put onions in the curry." },
    ],
  },
  {
    kana: "にんじん", display: "人参", romaji: "ninjin",
    en: "carrot", zh: "紅蘿蔔", category: "食物 Food",
    note: "橘色的根菜；「〜が にがて」＝不擅長／不愛吃。",
    examples: [
      { jp: "にんじんは からだに いいです。", romaji: "Ninjin wa karada ni ii desu.", zh: "紅蘿蔔對身體很好。", en: "Carrots are good for your health." },
      { jp: "にんじんが にがてです。", romaji: "Ninjin ga nigate desu.", zh: "我不太敢吃紅蘿蔔。", en: "I'm not fond of carrots." },
    ],
  },
  {
    kana: "おにぎり", display: "お握り", romaji: "onigiri",
    en: "rice ball", zh: "飯糰", category: "食物 Food",
    note: "源自「握る(nigiru, 握)」；便利商店常見。",
    examples: [
      { jp: "あさ、おにぎりを ひとつ たべました。", romaji: "Asa, onigiri o hitotsu tabemashita.", zh: "早上吃了一個飯糰。", en: "I ate a rice ball in the morning." },
      { jp: "コンビニで おにぎりを かいます。", romaji: "Konbini de onigiri o kaimasu.", zh: "在超商買飯糰。", en: "I buy a rice ball at the convenience store." },
    ],
  },
  {
    kana: "やきとり", display: "焼き鳥", romaji: "yakitori",
    en: "grilled chicken skewer", zh: "烤雞肉串", category: "食物 Food",
    note: "「焼く(yaku, 烤) + 鳥(tori, 雞)」。",
    examples: [
      { jp: "おみせで やきとりを たべました。", romaji: "Omise de yakitori o tabemashita.", zh: "在店裡吃了烤雞肉串。", en: "I ate yakitori at the shop." },
      { jp: "やきとりは ビールに あいます。", romaji: "Yakitori wa bīru ni aimasu.", zh: "烤雞肉串很配啤酒。", en: "Yakitori goes well with beer." },
    ],
  },
  {
    kana: "てんぷら", display: "天ぷら", romaji: "tenpura",
    en: "tempura", zh: "天婦羅", category: "食物 Food",
    note: "蔬菜或海鮮裹麵衣油炸的料理。",
    examples: [
      { jp: "てんぷらは あぶらで あげます。", romaji: "Tenpura wa abura de agemasu.", zh: "天婦羅是用油炸的。", en: "Tempura is deep-fried in oil." },
      { jp: "えびの てんぷらが いちばん すきです。", romaji: "Ebi no tenpura ga ichiban suki desu.", zh: "我最喜歡蝦天婦羅。", en: "I like shrimp tempura best." },
    ],
  },
  {
    kana: "すきやき", display: "すき焼き", romaji: "sukiyaki",
    en: "sukiyaki (hot pot)", zh: "壽喜燒", category: "食物 Food",
    note: "牛肉與蔬菜用甜醬油煮的鍋物，冬天常吃。",
    examples: [
      { jp: "ふゆは すきやきが おいしいです。", romaji: "Fuyu wa sukiyaki ga oishii desu.", zh: "冬天壽喜燒很好吃。", en: "Sukiyaki is delicious in winter." },
      { jp: "かぞくで すきやきを たべます。", romaji: "Kazoku de sukiyaki o tabemasu.", zh: "全家一起吃壽喜燒。", en: "My family eats sukiyaki together." },
    ],
  },
  {
    kana: "みそしる", display: "味噌汁", romaji: "misoshiru",
    en: "miso soup", zh: "味噌湯", category: "食物 Food",
    note: "「味噌(miso) + 汁(shiru, 湯)」；日式早餐常見。",
    examples: [
      { jp: "あさごはんに みそしるを のみます。", romaji: "Asagohan ni misoshiru o nomimasu.", zh: "早餐喝味噌湯。", en: "I have miso soup with breakfast." },
      { jp: "ははの みそしるは おいしいです。", romaji: "Haha no misoshiru wa oishii desu.", zh: "媽媽煮的味噌湯很好喝。", en: "My mother's miso soup is delicious." },
    ],
  },
  {
    kana: "たこやき", display: "たこ焼き", romaji: "takoyaki",
    en: "octopus balls", zh: "章魚燒", category: "食物 Food",
    note: "大阪名物，「たこ(tako, 章魚)」當內餡。",
    examples: [
      { jp: "おまつりで たこやきを かいました。", romaji: "Omatsuri de takoyaki o kaimashita.", zh: "在祭典買了章魚燒。", en: "I bought takoyaki at the festival." },
      { jp: "たこやきは あつくて おいしいです。", romaji: "Takoyaki wa atsukute oishii desu.", zh: "章魚燒燙燙的很好吃。", en: "Takoyaki is hot and tasty." },
    ],
  },

  // ===== 人物 People =====
  {
    kana: "ともだち", display: "友達", romaji: "tomodachi",
    en: "friend", zh: "朋友", category: "人物 People",
    note: "一起做某事用助詞「と」：ともだちと＝和朋友。",
    examples: [
      { jp: "ともだちと えいがを みます。", romaji: "Tomodachi to eiga o mimasu.", zh: "和朋友一起看電影。", en: "I watch a movie with my friend." },
      { jp: "たいせつな ともだちが います。", romaji: "Taisetsu na tomodachi ga imasu.", zh: "我有重要的朋友。", en: "I have a dear friend." },
    ],
  },
  {
    kana: "せんせい", display: "先生", romaji: "sensei",
    en: "teacher", zh: "老師", category: "人物 People",
    note: "也用於醫生、律師等專業人士的尊稱。",
    examples: [
      { jp: "せんせいに しつもんを しました。", romaji: "Sensei ni shitsumon o shimashita.", zh: "我向老師提問了。", en: "I asked the teacher a question." },
      { jp: "やまだせんせいは やさしいです。", romaji: "Yamada-sensei wa yasashii desu.", zh: "山田老師很親切。", en: "Mr. Yamada is kind." },
    ],
  },
  {
    kana: "がくせい", display: "学生", romaji: "gakusei",
    en: "student", zh: "學生", category: "人物 People",
    note: "「学(gaku, 學) + 生(sei)」；大學生、高中生等。",
    examples: [
      { jp: "わたしは だいがくの がくせいです。", romaji: "Watashi wa daigaku no gakusei desu.", zh: "我是大學生。", en: "I am a university student." },
      { jp: "がくせいの ときは よく あそびました。", romaji: "Gakusei no toki wa yoku asobimashita.", zh: "學生時代常常玩。", en: "I played a lot when I was a student." },
    ],
  },
  {
    kana: "おとうと", display: "弟", romaji: "otōto",
    en: "younger brother", zh: "弟弟", category: "人物 People",
    note: "指自己的弟弟；別人的弟弟說「おとうとさん」。",
    examples: [
      { jp: "おとうとは サッカーが すきです。", romaji: "Otōto wa sakkā ga suki desu.", zh: "弟弟喜歡足球。", en: "My younger brother likes soccer." },
      { jp: "おとうとと こうえんへ いきました。", romaji: "Otōto to kōen e ikimashita.", zh: "和弟弟去了公園。", en: "I went to the park with my younger brother." },
    ],
  },
  {
    kana: "いもうと", display: "妹", romaji: "imōto",
    en: "younger sister", zh: "妹妹", category: "人物 People",
    note: "指自己的妹妹；別人的妹妹說「いもうとさん」。",
    examples: [
      { jp: "いもうとと こうえんで あそびます。", romaji: "Imōto to kōen de asobimasu.", zh: "和妹妹在公園玩。", en: "I play with my younger sister in the park." },
      { jp: "いもうとは ピアノが じょうずです。", romaji: "Imōto wa piano ga jōzu desu.", zh: "妹妹鋼琴彈得很好。", en: "My younger sister is good at the piano." },
    ],
  },
  {
    kana: "おなまえ", display: "お名前", romaji: "onamae",
    en: "name (polite)", zh: "名字（敬稱）", category: "人物 People",
    note: "「お」是敬語接頭辭，問對方姓名時使用。",
    examples: [
      { jp: "おなまえを おしえて ください。", romaji: "Onamae o oshiete kudasai.", zh: "請告訴我您的名字。", en: "Please tell me your name." },
      { jp: "ここに おなまえを かいて ください。", romaji: "Koko ni onamae o kaite kudasai.", zh: "請在這裡寫上名字。", en: "Please write your name here." },
    ],
  },

  // ===== 動物 Animals =====
  {
    kana: "にわとり", display: "鶏", romaji: "niwatori",
    en: "chicken, hen", zh: "雞", category: "動物 Animal",
    note: "由「庭(niwa, 庭院) + 鳥(tori, 鳥)」而來。",
    examples: [
      { jp: "にわとりが あさ なきます。", romaji: "Niwatori ga asa nakimasu.", zh: "雞在早上啼叫。", en: "The rooster crows in the morning." },
      { jp: "にわとりは たまごを うみます。", romaji: "Niwatori wa tamago o umimasu.", zh: "雞會下蛋。", en: "Chickens lay eggs." },
    ],
  },
  {
    kana: "こうもり", display: "蝙蝠", romaji: "kōmori",
    en: "bat (animal)", zh: "蝙蝠", category: "動物 Animal",
    note: "夜行性、倒掛睡覺的哺乳類。",
    examples: [
      { jp: "こうもりは よる とびます。", romaji: "Kōmori wa yoru tobimasu.", zh: "蝙蝠在夜晚飛。", en: "Bats fly at night." },
      { jp: "どうくつに こうもりが いました。", romaji: "Dōkutsu ni kōmori ga imashita.", zh: "洞穴裡有蝙蝠。", en: "There were bats in the cave." },
    ],
  },

  // ===== 交通・物品 Transport & things =====
  {
    kana: "のりもの", display: "乗り物", romaji: "norimono",
    en: "vehicle, ride", zh: "交通工具", category: "交通 Transport",
    note: "「乗る(noru, 搭乘) + 物」；遊樂園的設施也叫のりもの。",
    examples: [
      { jp: "こどもは のりものが だいすきです。", romaji: "Kodomo wa norimono ga daisuki desu.", zh: "小孩最喜歡交通工具。", en: "Children love vehicles." },
      { jp: "ゆうえんちの のりものは たのしいです。", romaji: "Yūenchi no norimono wa tanoshii desu.", zh: "遊樂園的設施很好玩。", en: "The rides at the amusement park are fun." },
    ],
  },
  {
    kana: "ひこうき", display: "飛行機", romaji: "hikōki",
    en: "airplane", zh: "飛機", category: "交通 Transport",
    note: "搭乘交通工具用助詞「で」：ひこうきで＝搭飛機。",
    examples: [
      { jp: "ひこうきで にほんへ いきます。", romaji: "Hikōki de Nihon e ikimasu.", zh: "搭飛機去日本。", en: "I go to Japan by airplane." },
      { jp: "ひこうきが そらを とんで います。", romaji: "Hikōki ga sora o tonde imasu.", zh: "飛機在天上飛。", en: "An airplane is flying in the sky." },
    ],
  },
  {
    kana: "しんぶん", display: "新聞", romaji: "shinbun",
    en: "newspaper", zh: "報紙", category: "物品 Things",
    note: "注意：日文「新聞」是報紙，新聞節目是「ニュース」。",
    examples: [
      { jp: "ちちは まいあさ しんぶんを よみます。", romaji: "Chichi wa maiasa shinbun o yomimasu.", zh: "爸爸每天早上看報紙。", en: "My father reads the newspaper every morning." },
      { jp: "しんぶんで ニュースを しりました。", romaji: "Shinbun de nyūsu o shirimashita.", zh: "從報紙得知了消息。", en: "I learned the news from the newspaper." },
    ],
  },
  {
    kana: "えんぴつ", display: "鉛筆", romaji: "enpitsu",
    en: "pencil", zh: "鉛筆", category: "物品 Things",
    note: "用工具書寫用「で」：えんぴつで かく。",
    examples: [
      { jp: "えんぴつで なまえを かきます。", romaji: "Enpitsu de namae o kakimasu.", zh: "用鉛筆寫名字。", en: "I write my name with a pencil." },
      { jp: "あたらしい えんぴつを かいました。", romaji: "Atarashii enpitsu o kaimashita.", zh: "買了新鉛筆。", en: "I bought a new pencil." },
    ],
  },
  {
    kana: "くつした", display: "靴下", romaji: "kutsushita",
    en: "socks", zh: "襪子", category: "物品 Things",
    note: "「靴(kutsu, 鞋) + 下(shita)」；穿在腳上用「はく」。",
    examples: [
      { jp: "あたらしい くつしたを はきます。", romaji: "Atarashii kutsushita o hakimasu.", zh: "穿上新襪子。", en: "I put on new socks." },
      { jp: "くつしたに あなが あきました。", romaji: "Kutsushita ni ana ga akimashita.", zh: "襪子破了個洞。", en: "My socks have a hole in them." },
    ],
  },
  {
    kana: "てぶくろ", display: "手袋", romaji: "tebukuro",
    en: "gloves", zh: "手套", category: "物品 Things",
    note: "「手(te) + 袋(bukuro, 袋)」；戴手套說「てぶくろを する」。",
    examples: [
      { jp: "さむいので てぶくろを します。", romaji: "Samui node tebukuro o shimasu.", zh: "因為冷所以戴手套。", en: "It's cold, so I wear gloves." },
      { jp: "てぶくろを かたほう なくしました。", romaji: "Tebukuro o katahō nakushimashita.", zh: "弄丟了一隻手套。", en: "I lost one of my gloves." },
    ],
  },
  {
    kana: "はぶらし", display: "歯ブラシ", romaji: "haburashi",
    en: "toothbrush", zh: "牙刷", category: "物品 Things",
    note: "「歯(ha, 牙齒) + ブラシ(burashi, 刷子)」。",
    examples: [
      { jp: "はぶらしで はを みがきます。", romaji: "Haburashi de ha o migakimasu.", zh: "用牙刷刷牙。", en: "I brush my teeth with a toothbrush." },
      { jp: "あたらしい はぶらしに かえました。", romaji: "Atarashii haburashi ni kaemashita.", zh: "換了新牙刷。", en: "I switched to a new toothbrush." },
    ],
  },

  // ===== 場所 Places =====
  {
    kana: "たてもの", display: "建物", romaji: "tatemono",
    en: "building", zh: "建築物", category: "場所 Places",
    note: "「建てる(tateru, 建造) + 物」。",
    examples: [
      { jp: "あの たてものは とても たかいです。", romaji: "Ano tatemono wa totemo takai desu.", zh: "那棟建築物很高。", en: "That building is very tall." },
      { jp: "ふるい たてものを けんがくしました。", romaji: "Furui tatemono o kengaku shimashita.", zh: "參觀了古老的建築。", en: "I toured an old building." },
    ],
  },
  {
    kana: "ぎんこう", display: "銀行", romaji: "ginkō",
    en: "bank", zh: "銀行", category: "場所 Places",
    note: "「銀(gin, 銀) + 行(kō)」；領錢「おろす」、存錢「あずける」。",
    examples: [
      { jp: "ぎんこうで おかねを おろします。", romaji: "Ginkō de okane o oroshimasu.", zh: "在銀行領錢。", en: "I withdraw money at the bank." },
      { jp: "ぎんこうは くじに あきます。", romaji: "Ginkō wa kuji ni akimasu.", zh: "銀行九點開門。", en: "The bank opens at nine." },
    ],
  },
  {
    kana: "げんかん", display: "玄関", romaji: "genkan",
    en: "entrance, doorway", zh: "玄關", category: "場所 Places",
    note: "日本住家在玄關脫鞋後才進屋。",
    examples: [
      { jp: "げんかんで くつを ぬぎます。", romaji: "Genkan de kutsu o nugimasu.", zh: "在玄關脫鞋。", en: "I take off my shoes at the entrance." },
      { jp: "げんかんの ベルが なりました。", romaji: "Genkan no beru ga narimashita.", zh: "玄關的門鈴響了。", en: "The doorbell at the entrance rang." },
    ],
  },
  {
    kana: "かいだん", display: "階段", romaji: "kaidan",
    en: "stairs", zh: "樓梯", category: "場所 Places",
    note: "上樓「のぼる」、下樓「おりる」。",
    examples: [
      { jp: "かいだんを のぼると つかれます。", romaji: "Kaidan o noboru to tsukaremasu.", zh: "爬樓梯會累。", en: "Climbing the stairs is tiring." },
      { jp: "かいだんで ころばないで ください。", romaji: "Kaidan de korobanai de kudasai.", zh: "在樓梯上請別跌倒。", en: "Please don't fall on the stairs." },
    ],
  },
  {
    kana: "こうえん", display: "公園", romaji: "kōen",
    en: "park", zh: "公園", category: "場所 Places",
    note: "「公(kō, 公共) + 園(en, 園)」。",
    examples: [
      { jp: "こうえんで さんぽを します。", romaji: "Kōen de sanpo o shimasu.", zh: "在公園散步。", en: "I take a walk in the park." },
      { jp: "こうえんに きれいな はなが あります。", romaji: "Kōen ni kirei na hana ga arimasu.", zh: "公園裡有漂亮的花。", en: "There are pretty flowers in the park." },
    ],
  },
  {
    kana: "くうこう", display: "空港", romaji: "kūkō",
    en: "airport", zh: "機場", category: "場所 Places",
    note: "「空(kū, 天空) + 港(kō, 港)」。",
    examples: [
      { jp: "くうこうまで バスで いきます。", romaji: "Kūkō made basu de ikimasu.", zh: "搭巴士到機場。", en: "I go to the airport by bus." },
      { jp: "くうこうで ともだちを むかえます。", romaji: "Kūkō de tomodachi o mukaemasu.", zh: "去機場接朋友。", en: "I meet my friend at the airport." },
    ],
  },

  // ===== 自然・時間 Nature & time =====
  {
    kana: "たいよう", display: "太陽", romaji: "taiyō",
    en: "the sun", zh: "太陽", category: "自然 Nature",
    note: "口語的太陽也說「おひさま」。",
    examples: [
      { jp: "たいようが やまから のぼります。", romaji: "Taiyō ga yama kara noborimasu.", zh: "太陽從山那邊升起。", en: "The sun rises from behind the mountains." },
      { jp: "たいようの ひかりは あたたかいです。", romaji: "Taiyō no hikari wa atatakai desu.", zh: "陽光很溫暖。", en: "The sunlight is warm." },
    ],
  },
  {
    kana: "みずうみ", display: "湖", romaji: "mizuumi",
    en: "lake", zh: "湖", category: "自然 Nature",
    note: "由「水(mizu) + 海(umi)」組成；比池(ike)大。",
    examples: [
      { jp: "みずうみの みずは とても きれいです。", romaji: "Mizuumi no mizu wa totemo kirei desu.", zh: "湖水非常清澈。", en: "The water of the lake is very clear." },
      { jp: "みずうみで ボートに のりました。", romaji: "Mizuumi de bōto ni norimashita.", zh: "在湖上划了船。", en: "I rode a boat on the lake." },
    ],
  },
  {
    kana: "かみなり", display: "雷", romaji: "kaminari",
    en: "thunder", zh: "雷", category: "自然 Nature",
    note: "打雷說「かみなりが なる」。",
    examples: [
      { jp: "かみなりが なって こわいです。", romaji: "Kaminari ga natte kowai desu.", zh: "打雷好可怕。", en: "The thunder is scary." },
      { jp: "ゆうべ おおきな かみなりが おちました。", romaji: "Yūbe ōkina kaminari ga ochimashita.", zh: "昨晚打了個大雷。", en: "A big bolt of thunder struck last night." },
    ],
  },
  {
    kana: "かようび", display: "火曜日", romaji: "kayōbi",
    en: "Tuesday", zh: "星期二", category: "時間 Time",
    note: "星期幾以「〜ようび」結尾；火＝星期二。",
    examples: [
      { jp: "かようびに テストが あります。", romaji: "Kayōbi ni tesuto ga arimasu.", zh: "星期二有考試。", en: "There is a test on Tuesday." },
      { jp: "つぎの かようびは やすみです。", romaji: "Tsugi no kayōbi wa yasumi desu.", zh: "下星期二放假。", en: "Next Tuesday is a holiday." },
    ],
  },
  {
    kana: "まいにち", display: "毎日", romaji: "mainichi",
    en: "every day", zh: "每天", category: "時間 Time",
    note: "「毎(mai, 每) + 日(nichi)」；也有まいあさ(每早)、まいばん(每晚)。",
    examples: [
      { jp: "まいにち にほんごを べんきょうします。", romaji: "Mainichi nihongo o benkyō shimasu.", zh: "每天學日文。", en: "I study Japanese every day." },
      { jp: "まいにち あるいて がっこうへ いきます。", romaji: "Mainichi aruite gakkō e ikimasu.", zh: "每天走路去學校。", en: "I walk to school every day." },
    ],
  },
  {
    kana: "ゆうがた", display: "夕方", romaji: "yūgata",
    en: "evening, dusk", zh: "傍晚", category: "時間 Time",
    note: "「夕(yū, 傍晚) + 方(gata)」；指日落前後。",
    examples: [
      { jp: "ゆうがたに さんぽを します。", romaji: "Yūgata ni sanpo o shimasu.", zh: "傍晚去散步。", en: "I take a walk in the evening." },
      { jp: "ゆうがたの そらは あかいです。", romaji: "Yūgata no sora wa akai desu.", zh: "傍晚的天空是紅的。", en: "The evening sky is red." },
    ],
  },

  // ===== 動詞 Verbs (dictionary form) =====
  {
    kana: "はたらく", display: "働く", romaji: "hataraku",
    en: "to work", zh: "工作", category: "動詞 Verb",
    note: "辭書形（ます形：はたらきます）；工作地點用「で」。",
    examples: [
      { jp: "まいにち はたらくのは たいへんです。", romaji: "Mainichi hataraku no wa taihen desu.", zh: "每天工作很辛苦。", en: "Working every day is tough." },
      { jp: "ちちは ぎんこうで はたらいて います。", romaji: "Chichi wa ginkō de hataraite imasu.", zh: "爸爸在銀行工作。", en: "My father works at a bank." },
    ],
  },
  {
    kana: "おしえる", display: "教える", romaji: "oshieru",
    en: "to teach, to tell", zh: "教、告訴", category: "動詞 Verb",
    note: "教某人某事用「〜に〜を」；也有「告訴」之意。",
    examples: [
      { jp: "にほんごを おしえるのが すきです。", romaji: "Nihongo o oshieru no ga suki desu.", zh: "我喜歡教日文。", en: "I like teaching Japanese." },
      { jp: "えきへの みちを おしえて ください。", romaji: "Eki e no michi o oshiete kudasai.", zh: "請告訴我去車站的路。", en: "Please tell me the way to the station." },
    ],
  },
  {
    kana: "おぼえる", display: "覚える", romaji: "oboeru",
    en: "to remember, to memorize", zh: "記住、背", category: "動詞 Verb",
    note: "相反詞「わすれる(wasureru, 忘記)」。",
    examples: [
      { jp: "たんごを おぼえるのは むずかしいです。", romaji: "Tango o oboeru no wa muzukashii desu.", zh: "背單字很難。", en: "Memorizing vocabulary is hard." },
      { jp: "あなたの なまえを おぼえて います。", romaji: "Anata no namae o oboete imasu.", zh: "我記得你的名字。", en: "I remember your name." },
    ],
  },
  {
    kana: "でかける", display: "出かける", romaji: "dekakeru",
    en: "to go out", zh: "出門", category: "動詞 Verb",
    note: "與「出る(deru, 出)」相關；指外出。",
    examples: [
      { jp: "これから でかけるところです。", romaji: "Kore kara dekakeru tokoro desu.", zh: "我正要出門。", en: "I'm just about to go out." },
      { jp: "あめでも でかけます。", romaji: "Ame demo dekakemasu.", zh: "就算下雨也出門。", en: "I'll go out even if it rains." },
    ],
  },
  {
    kana: "てつだう", display: "手伝う", romaji: "tetsudau",
    en: "to help", zh: "幫忙", category: "動詞 Verb",
    note: "「手(te) + 伝う」；幫忙做某件事。",
    examples: [
      { jp: "ははの しごとを てつだう つもりです。", romaji: "Haha no shigoto o tetsudau tsumori desu.", zh: "我打算幫媽媽的工作。", en: "I plan to help my mother with her work." },
      { jp: "にもつを てつだいましょうか。", romaji: "Nimotsu o tetsudaimashō ka.", zh: "要我幫你提行李嗎？", en: "Shall I help you with your luggage?" },
    ],
  },

  // ===== 活動 Activities =====
  {
    kana: "うんどう", display: "運動", romaji: "undō",
    en: "exercise, sport", zh: "運動", category: "活動 Activity",
    note: "「運動する」＝做運動（する動詞）。",
    examples: [
      { jp: "まいあさ こうえんで うんどうします。", romaji: "Maiasa kōen de undō shimasu.", zh: "每天早上在公園運動。", en: "I exercise in the park every morning." },
      { jp: "けんこうの ために うんどうします。", romaji: "Kenkō no tame ni undō shimasu.", zh: "為了健康而運動。", en: "I exercise for my health." },
    ],
  },
  {
    kana: "せんたく", display: "洗濯", romaji: "sentaku",
    en: "laundry, washing", zh: "洗衣服", category: "活動 Activity",
    note: "「洗濯する」＝洗衣服；曬衣服「ほす」。",
    examples: [
      { jp: "にちようびに せんたくを します。", romaji: "Nichiyōbi ni sentaku o shimasu.", zh: "星期天洗衣服。", en: "I do the laundry on Sunday." },
      { jp: "はれた ひに せんたくものを ほします。", romaji: "Hareta hi ni sentakumono o hoshimasu.", zh: "晴天時曬衣服。", en: "I hang the laundry out on sunny days." },
    ],
  },
  {
    kana: "かいもの", display: "買い物", romaji: "kaimono",
    en: "shopping", zh: "購物", category: "活動 Activity",
    note: "「買う(kau, 買) + 物」；「買い物する」＝購物。",
    examples: [
      { jp: "スーパーで かいものを します。", romaji: "Sūpā de kaimono o shimasu.", zh: "在超市購物。", en: "I do my shopping at the supermarket." },
      { jp: "ははと かいものに いきます。", romaji: "Haha to kaimono ni ikimasu.", zh: "和媽媽去購物。", en: "I go shopping with my mother." },
    ],
  },

  // ===== 形容 Adjectives =====
  {
    kana: "ゆうめい", display: "有名", romaji: "yūmei",
    en: "famous", zh: "有名", category: "形容 Adjective",
    note: "な形容詞：ゆうめいな〜／〜は ゆうめいです。",
    examples: [
      { jp: "この まちは おまつりで ゆうめいです。", romaji: "Kono machi wa omatsuri de yūmei desu.", zh: "這個城鎮以祭典聞名。", en: "This town is famous for its festival." },
      { jp: "かれは ゆうめいな かしゅです。", romaji: "Kare wa yūmei na kashu desu.", zh: "他是有名的歌手。", en: "He is a famous singer." },
    ],
  },
  {
    kana: "しんせつ", display: "親切", romaji: "shinsetsu",
    en: "kind, helpful", zh: "親切", category: "形容 Adjective",
    note: "な形容詞；對某人親切用「に」。",
    examples: [
      { jp: "みせの ひとは とても しんせつでした。", romaji: "Mise no hito wa totemo shinsetsu deshita.", zh: "店裡的人很親切。", en: "The shop staff were very kind." },
      { jp: "しんせつな ひとに たすけられました。", romaji: "Shinsetsu na hito ni tasukeraremashita.", zh: "受到親切的人幫助。", en: "A kind person helped me." },
    ],
  },
  {
    kana: "たいせつ", display: "大切", romaji: "taisetsu",
    en: "important, precious", zh: "重要、珍惜", category: "形容 Adjective",
    note: "な形容詞；也表示「珍惜」某物。",
    examples: [
      { jp: "かぞくは いちばん たいせつです。", romaji: "Kazoku wa ichiban taisetsu desu.", zh: "家人是最重要的。", en: "Family is the most important thing." },
      { jp: "たいせつな てがみを もらいました。", romaji: "Taisetsu na tegami o moraimashita.", zh: "收到一封珍貴的信。", en: "I received a precious letter." },
    ],
  },
  {
    kana: "ほんとう", display: "本当", romaji: "hontō",
    en: "true, really", zh: "真的", category: "形容 Adjective",
    note: "「ほんとうに」＝真的、非常（副詞用法）。",
    examples: [
      { jp: "その はなしは ほんとうですか。", romaji: "Sono hanashi wa hontō desu ka.", zh: "那件事是真的嗎？", en: "Is that story true?" },
      { jp: "ほんとうに ありがとう ございます。", romaji: "Hontō ni arigatō gozaimasu.", zh: "真的非常感謝。", en: "Thank you very much indeed." },
    ],
  },
  {
    kana: "おいしい", display: "美味しい", romaji: "oishii",
    en: "delicious, tasty", zh: "好吃", category: "形容 Adjective",
    note: "い形容詞；男性口語也說「うまい」。",
    examples: [
      { jp: "この ケーキは おいしいです。", romaji: "Kono kēki wa oishii desu.", zh: "這個蛋糕很好吃。", en: "This cake is delicious." },
      { jp: "おいしい ラーメンが たべたいです。", romaji: "Oishii rāmen ga tabetai desu.", zh: "想吃好吃的拉麵。", en: "I want to eat delicious ramen." },
    ],
  },
  {
    kana: "たのしい", display: "楽しい", romaji: "tanoshii",
    en: "fun, enjoyable", zh: "快樂、好玩", category: "形容 Adjective",
    note: "い形容詞；過去式「たのしかった」。",
    examples: [
      { jp: "パーティーは とても たのしいです。", romaji: "Pātī wa totemo tanoshii desu.", zh: "派對非常好玩。", en: "The party is a lot of fun." },
      { jp: "たのしい いちにちを すごしました。", romaji: "Tanoshii ichinichi o sugoshimashita.", zh: "度過了快樂的一天。", en: "I spent an enjoyable day." },
    ],
  },
  {
    kana: "うれしい", display: "嬉しい", romaji: "ureshii",
    en: "happy, glad", zh: "高興", category: "形容 Adjective",
    note: "い形容詞；指一時的開心心情。",
    examples: [
      { jp: "プレゼントを もらって うれしいです。", romaji: "Purezento o moratte ureshii desu.", zh: "收到禮物很高興。", en: "I'm happy to receive a present." },
      { jp: "あなたに あえて うれしいです。", romaji: "Anata ni aete ureshii desu.", zh: "能見到你很高興。", en: "I'm glad to meet you." },
    ],
  },
  {
    kana: "やさしい", display: "優しい", romaji: "yasashii",
    en: "kind, gentle; easy", zh: "溫柔；（也指）簡單", category: "形容 Adjective",
    note: "「優しい」＝溫柔；同音「易しい」＝簡單。",
    examples: [
      { jp: "かのじょは とても やさしいです。", romaji: "Kanojo wa totemo yasashii desu.", zh: "她非常溫柔。", en: "She is very kind." },
      { jp: "やさしい にほんごで はなして ください。", romaji: "Yasashii nihongo de hanashite kudasai.", zh: "請用簡單的日文說。", en: "Please speak in easy Japanese." },
    ],
  },
  {
    kana: "つめたい", display: "冷たい", romaji: "tsumetai",
    en: "cold (to the touch)", zh: "冰、冷（觸感）", category: "形容 Adjective",
    note: "物體冰用「つめたい」；天氣冷用「さむい」。",
    examples: [
      { jp: "つめたい みずを のみます。", romaji: "Tsumetai mizu o nomimasu.", zh: "喝冰水。", en: "I drink cold water." },
      { jp: "ふゆの かぜは つめたいです。", romaji: "Fuyu no kaze wa tsumetai desu.", zh: "冬天的風很冷。", en: "The winter wind is cold." },
    ],
  },

  // ===== 顏色 Colour =====
  {
    kana: "むらさき", display: "紫", romaji: "murasaki",
    en: "purple", zh: "紫色", category: "顏色 Colour",
    note: "顏色名詞；「むらさきの〜」＝紫色的〜。",
    examples: [
      { jp: "むらさきの はなが さきました。", romaji: "Murasaki no hana ga sakimashita.", zh: "紫色的花開了。", en: "The purple flowers have bloomed." },
      { jp: "むらさきは すきな いろです。", romaji: "Murasaki wa suki na iro desu.", zh: "紫色是我喜歡的顏色。", en: "Purple is my favorite color." },
    ],
  },
  {
    kana: "みずいろ", display: "水色", romaji: "mizuiro",
    en: "light blue", zh: "水藍色", category: "顏色 Colour",
    note: "「水(mizu) + 色(iro)」＝像水的淡藍色。",
    examples: [
      { jp: "みずいろの シャツを きます。", romaji: "Mizuiro no shatsu o kimasu.", zh: "穿水藍色的襯衫。", en: "I wear a light-blue shirt." },
      { jp: "そらは きれいな みずいろです。", romaji: "Sora wa kirei na mizuiro desu.", zh: "天空是漂亮的水藍色。", en: "The sky is a beautiful light blue." },
    ],
  },

  // ===== 招呼 Greeting =====
  {
    kana: "おはよう", display: "お早う", romaji: "ohayō",
    en: "good morning", zh: "早安", category: "招呼 Greeting",
    note: "禮貌時說「おはようございます」。",
    examples: [
      { jp: "あさ、げんきに おはようと いいます。", romaji: "Asa, genki ni ohayō to iimasu.", zh: "早上精神飽滿地說早安。", en: "In the morning I say good morning cheerfully." },
      { jp: "せんせいに おはようございますと いいました。", romaji: "Sensei ni ohayō gozaimasu to iimashita.", zh: "對老師說了早安。", en: "I said good morning to my teacher." },
    ],
  },
];

/** The answer pool, as plain kana strings. */
export const ANSWERS: readonly string[] = WORDS.map((w) => w.kana);

/**
 * Score a guess against the answer, Wordle-style, with correct duplicate-kana
 * handling: exact-position matches are claimed first, then the remaining kana are
 * matched against the unused pool. A kana guessed more often than it occurs in
 * the answer only lights up as many times as it actually appears.
 */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  const g = [...String(guess)];
  const a = [...String(answer)];
  const n = a.length;
  const result: LetterState[] = Array(n).fill("absent");
  const pool: (string | null)[] = a.slice();

  // Pass 1: kana in the correct position.
  for (let i = 0; i < n; i++) {
    if (g[i] === a[i]) {
      result[i] = "correct";
      pool[i] = null;
    }
  }
  // Pass 2: kana present elsewhere, consuming from the remaining pool.
  for (let i = 0; i < n; i++) {
    if (result[i] === "correct") continue;
    const idx = pool.indexOf(g[i]);
    if (idx !== -1) {
      result[i] = "present";
      pool[idx] = null;
    }
  }
  return result;
}

/** True when every kana of the guess is in the correct position. */
export function isWin(states: LetterState[]): boolean {
  return states.length > 0 && states.every((s) => s === "correct");
}

/** Is `s` a legal guess: exactly WORD_LENGTH kana, all from the keyboard set? */
export function isValidGuess(s: string): boolean {
  const chars = [...String(s)];
  return chars.length === WORD_LENGTH && chars.every((c) => KANA.has(c));
}

/** Pick a puzzle word from the curated pool using a seeded RNG. */
export function pickWord(rng: Rng): JpWord {
  return rng.pick(WORDS as JpWord[]);
}

/* Romaji → hiragana table for physical-keyboard typists. Covers the kana that
   appear in the answer pool plus common wāpuro spelling variants (si=shi,
   ti=chi, tu=tsu, hu=fu, zi=ji). Long vowels are typed out (kou → こう). */
const ROMAJI: Readonly<Record<string, string>> = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
  ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", nn: "ん",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
};

/**
 * Convert a romaji buffer into kana, greedily matching the longest token first.
 * Returns the completed kana and any trailing `rest` that is still an incomplete
 * syllable (e.g. a lone consonant awaiting its vowel) so the caller can keep it
 * buffered for the next keystroke.
 */
export function parseRomaji(buf: string): { kana: string[]; rest: string } {
  const lower = String(buf).toLowerCase();
  const kana: string[] = [];
  let i = 0;
  while (i < lower.length) {
    let hit = "";
    let len = 0;
    for (let l = 3; l >= 1; l--) {
      const tok = lower.slice(i, i + l);
      if (tok.length === l && ROMAJI[tok]) {
        hit = ROMAJI[tok];
        len = l;
        break;
      }
    }
    if (!hit) break; // incomplete/unknown syllable starts here — leave it as rest
    kana.push(hit);
    i += len;
  }
  return { kana, rest: lower.slice(i) };
}
