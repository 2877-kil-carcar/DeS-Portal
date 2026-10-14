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

  function validateWord(value, requiredStart, usedWords) {
    const word = normalizeKana(value);
    const required = normalizeKana(requiredStart).charAt(0);
    const used = new Set((usedWords || []).map(normalizeKana));
    if (!word) return { ok: false, reason: "答えを入力してください。", word };
    if (!/^[ぁ-ゖー]+$/.test(word)) {
      return { ok: false, reason: "答えは、ひらがなで入力してください。", word };
    }
    if (tailKana(word) === "ん") {
      return { ok: false, reason: "「ん」で終わる言葉は使えません。", word };
    }
    if (required && headKana(word) !== required) {
      return { ok: false, reason: `「${required}」から始まる言葉にしてください。`, word };
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
    validateWord,
    isCorrectGuess,
    normalizeTurnSeconds,
    nextActive,
    timerLabel,
  });
});
