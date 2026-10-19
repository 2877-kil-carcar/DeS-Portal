(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PictureShiritoriRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SMALL_KANA = Object.freeze({
    "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お",
    "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ", "ゎ": "わ",
  });
  const START_KANA = Object.freeze([..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ"]);
  const COMPOUND_HEADS = Object.freeze({
    き: ["きゃ", "きゅ", "きょ"], ぎ: ["ぎゃ", "ぎゅ", "ぎょ"],
    し: ["しゃ", "しゅ", "しょ"], じ: ["じゃ", "じゅ", "じょ"],
    ち: ["ちゃ", "ちゅ", "ちょ"], ぢ: ["ぢゃ", "ぢゅ", "ぢょ"],
    に: ["にゃ", "にゅ", "にょ"], ひ: ["ひゃ", "ひゅ", "ひょ"],
    び: ["びゃ", "びゅ", "びょ"], ぴ: ["ぴゃ", "ぴゅ", "ぴょ"],
    み: ["みゃ", "みゅ", "みょ"], り: ["りゃ", "りゅ", "りょ"],
  });

  const VOWEL_GROUPS = Object.freeze({
    あ: "あかがさざただなはばぱまゃやらゎわ",
    い: "いきぎしじちぢにひびぴみりゐ",
    う: "うくぐすずつづぬふぶぷむゅゆるゔ",
    え: "えけげせぜてでねへべぺめれゑ",
    お: "おこごそぞとどのほぼぽもょよろを",
  });

  function normalizeKana(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/[\s　・･]/g, "")
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  function vowelOf(kana) {
    const normalized = SMALL_KANA[kana] || kana;
    return Object.keys(VOWEL_GROUPS).find(vowel => VOWEL_GROUPS[vowel].includes(normalized)) || "";
  }

  function headKana(value) {
    const word = normalizeKana(value);
    return SMALL_KANA[word.charAt(0)] || word.charAt(0) || "";
  }

  function tailKana(value) {
    const word = normalizeKana(value);
    if (!word) return "";
    const chars = [...word];
    const last = chars.at(-1);
    if (last === "ー" && chars.length > 1) return vowelOf(chars.at(-2));
    return SMALL_KANA[last] || last;
  }

  function startOptions(value) {
    const list = Array.isArray(value) ? value : [value];
    return [...new Set(list.map(normalizeKana).filter(part => /^[ぁ-ゖ]{1,2}$/.test(part)))];
  }

  function nextStarts(value) {
    const word = normalizeKana(value), chars = [...word];
    if (!chars.length) return [];
    const last = chars.at(-1), previous = chars.at(-2);
    if (SMALL_KANA[last]) {
      // A small final kana may connect by itself (ゅ -> ゆ), or together with
      // the previous kana (しゅ -> しゅ). Keep the compound as a full prefix.
      return startOptions([SMALL_KANA[last], previous && /^[ぁ-ゖ]$/.test(previous) ? previous + last : ""]);
    }
    const tail = tailKana(word);
    return startOptions([tail, ...(COMPOUND_HEADS[tail] || [])]);
  }

  function shuffleOrder(order, random = Math.random) {
    const result = [...order];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function randomStart(random = Math.random) {
    return START_KANA[Math.min(START_KANA.length - 1, Math.max(0, Math.floor(random() * START_KANA.length)))];
  }

  function cleanChatText(value) {
    return [...String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim()].slice(0, 240).join("");
  }

  function validateWord(value, requiredStart, usedWords) {
    const word = normalizeKana(value);
    const required = startOptions(requiredStart);
    const used = new Set((usedWords || []).map(normalizeKana));
    if (!word) return { ok: false, reason: "答えを入力してください。", word };
    if (!/^[ぁ-ゖー]+$/.test(word)) {
      return { ok: false, reason: "答えは、ひらがなで入力してください。", word };
    }
    if (tailKana(word) === "ん") {
      return { ok: false, reason: "「ん」で終わる言葉は使えません。", word };
    }
    if (required.length && !required.some(prefix => word.startsWith(prefix))) {
      return { ok: false, reason: `${required.map(prefix => `「${prefix}」`).join("・")}から始まる言葉にしてください。`, word };
    }
    if (used.has(word)) return { ok: false, reason: "一度使った言葉は使えません。", word };
    return { ok: true, reason: "", word };
  }

  function isCorrectGuess(guess, answer) {
    return normalizeKana(guess) === normalizeKana(answer);
  }

  function normalizeTurnSeconds(value) {
    if (value === null || value === "none" || Number(value) === 0) return 0;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 60;
    return Math.min(600, Math.max(10, parsed));
  }

  function nextActive(order, players, afterId) {
    const active = (order || []).filter(id => players && players[id] && players[id].active !== false);
    if (!active.length) return "";
    const index = active.indexOf(afterId);
    return active[(index < 0 ? 0 : index + 1) % active.length];
  }

  function timerLabel(seconds) {
    const value = normalizeTurnSeconds(seconds);
    if (!value) return "時間制限なし";
    if (value < 60) return `${value}秒`;
    if (value % 60 === 0) return `${value / 60}分`;
    return `${Math.floor(value / 60)}分${value % 60}秒`;
  }

  return Object.freeze({
    normalizeKana,
    headKana,
    tailKana,
    nextStarts,
    startOptions,
    START_KANA,
    shuffleOrder,
    randomStart,
    cleanChatText,
    validateWord,
    isCorrectGuess,
    normalizeTurnSeconds,
    nextActive,
    timerLabel,
  });
});
