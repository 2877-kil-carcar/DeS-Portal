import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  onValue,
  onDisconnect,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const Rules = window.PictureShiritoriRules;
if (!Rules) throw new Error("絵しりとりのルールを読み込めませんでした。");

const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyBmPQX35nYTBzJhvU5Cu4lBifpmzQW2PLk",
  authDomain: "babanuki-5febb.firebaseapp.com",
  databaseURL: "https://babanuki-5febb-default-rtdb.firebaseio.com",
  projectId: "babanuki-5febb",
  storageBucket: "babanuki-5febb.firebasestorage.app",
  messagingSenderId: "918572931204",
  appId: "1:918572931204:web:a1e2db96dda922b4538ad1",
});

const ROOT_PATH = "pictureShiritori/rooms";
const MAX_PLAYERS = 8;
const RECONNECT_GRACE_MS = 180000;
const PREVIEW = new URLSearchParams(location.search).get("preview") === "1";
const $ = id => document.getElementById(id);
const els = Object.fromEntries([
  "homeView", "roomView", "homeName", "roomCodeInput", "createRoomBtn", "joinRoomBtn",
  "connectionBadge", "roomCodeText", "copyRoomBtn", "leaveRoomBtn", "lobbyPanel",
  "memberCount", "hostLabel", "memberList", "hostSettings", "timePreset", "customTimeWrap",
  "customTime", "answerTimePreset", "answerCustomTimeWrap", "answerCustomTime", "startGameBtn", "lobbyMessage", "gamePanel", "gameHostSettings",
  "gameTimePreset", "gameCustomTimeWrap", "gameCustomTime", "gameAnswerTimePreset", "gameAnswerCustomTimeWrap", "gameAnswerCustomTime", "turnNumber", "timer",
  "turnTitle", "turnGuide", "requiredStart", "drawCard", "drawingCanvas", "undoBtn",
  "clearBtn", "secretAnswer", "submitDrawingBtn", "guessCard", "submittedImage", "guessForm",
  "guessInput", "guessFeedback", "waitingCard", "waitingText", "spectatorImageWrap",
  "spectatorImage", "gameSettingLabel", "gameMemberList", "historyCount", "historyList",
  "endGameBtn", "finishedPanel", "finishReason", "finishedHistoryCount", "finishedHistoryList",
  "returnLobbyBtn", "toast",
].map(id => [id, $(id)]));

let db = null;
let roomCode = "";
let myId = "";
let myName = "";
let currentRoom = null;
let stopRoomListener = null;
let disconnectAction = null;
let toastTimer = 0;
let expirePending = false;
let renderedTurnKey = "";
let lastSettingsValues = { draw: null, answer: null };
let reconcilePending = false;
let lastPresenceTick = 0;

const canvas = els.drawingCanvas;
const ctx = canvas.getContext("2d", { willReadFrequently: true });
let lineColor = "#20344c";
let drawing = false;
let lastPoint = null;
let undoStack = [];

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function setConnection(label, state = "") {
  els.connectionBadge.textContent = label;
  els.connectionBadge.className = `connection-badge${state ? ` ${state}` : ""}`;
}

function cleanName(value) {
  return String(value || "").replace(/[<>\n\r]/g, "").trim().slice(0, 16);
}

function cleanCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(value => alphabet[value % alphabet.length]).join("");
}

function roomRef(code = roomCode) {
  return ref(db, `${ROOT_PATH}/${code}`);
}

function playerName(room, id) {
  return room?.players?.[id]?.name || "退出したプレイヤー";
}

function reconnectRemaining(player, now = Date.now()) {
  if (!player || player.active !== false) return 0;
  const disconnectedAt = Number(player.disconnectedAt || 0);
  if (!disconnectedAt) return 0;
  return Math.max(0, disconnectedAt + RECONNECT_GRACE_MS - now);
}

function isPlayerAvailable(player, now = Date.now()) {
  return Boolean(player) && (player.active !== false || reconnectRemaining(player, now) > 0);
}

function activeIds(room, now = Date.now()) {
  return (room?.order || []).filter(id => isPlayerAvailable(room.players?.[id], now));
}

function phaseActorId(room) {
  const game = room?.game;
  if (!game) return "";
  return game.phase === "guess" ? game.guesserId : game.artistId;
}

function historyEntries(room) {
  return Object.values(room?.history || {}).sort((a, b) => Number(a.turnNo) - Number(b.turnNo));
}

function usedWords(room) {
  return historyEntries(room).map(item => item.word).filter(Boolean);
}

function nextDeadline(seconds, now) {
  const value = Rules.normalizeTurnSeconds(seconds);
  return value ? now + value * 1000 : 0;
}

function historyKey(turnNo) {
  return `turn_${String(turnNo).padStart(5, "0")}`;
}

function addHistory(room, result, now, extra = {}) {
  const game = room.game || {};
  room.history ||= {};
  room.history[historyKey(game.turnNo || 0)] = {
    turnNo: game.turnNo || 0,
    artistId: game.artistId || "",
    artistName: playerName(room, game.artistId),
    guesserId: game.guesserId || "",
    guesserName: playerName(room, game.guesserId),
    word: game.answer || "",
    guess: "",
    image: game.image || "",
    result,
    finishedAt: now,
    ...extra,
  };
}

function finishRoom(room, reason, now) {
  room.status = "finished";
  room.finishedAt = now;
  room.finishReason = reason;
  if (room.game) room.game.phase = "finished";
}

function finishForUnansweredDrawing(room, now) {
  const game = room.game || {};
  const loserName = playerName(room, game.artistId);
  addHistory(room, "timeout-guess", now, {
    loserId: game.artistId || "",
    loserName,
  });
  room.loserId = game.artistId || "";
  room.loserName = loserName;
  finishRoom(room, `回答時間切れ。${loserName}さん（絵を描いた人）の負けです。`, now);
}

function resolveMissingPhaseActor(room, now) {
  const game = room.game || {};
  if (game.phase === "guess") {
    finishForUnansweredDrawing(room, now);
    return;
  }
  addHistory(room, "left", now, { guess: "" });
  beginNextTurn(room, "", now);
}

function beginNextTurn(room, basisWord, now) {
  const active = activeIds(room, now);
  if (active.length < 2) {
    finishRoom(room, "参加者が2人未満になったため終了しました。", now);
    return;
  }
  const previous = room.game || {};
  const artistId = Rules.nextActive(room.order, room.players, previous.artistId);
  const guesserId = Rules.nextActive(room.order, room.players, artistId);
  const seconds = Rules.normalizeTurnSeconds(room.settings?.turnSeconds);
  room.game = {
    turnNo: Number(previous.turnNo || 0) + 1,
    phase: "draw",
    artistId,
    guesserId,
    requiredStart: basisWord ? Rules.tailKana(basisWord) : (previous.requiredStart || ""),
    turnSeconds: seconds,
    startedAt: now,
    deadline: nextDeadline(seconds, now),
    wrongAttempts: 0,
  };
  room.updatedAt = now;
}

function startRoom(room, now) {
  const active = activeIds(room, now);
  if (active.length < 2) return false;
  const seconds = Rules.normalizeTurnSeconds(room.settings?.turnSeconds);
  room.status = "playing";
  room.history = {};
  room.startedAt = now;
  room.finishReason = "";
  room.loserId = "";
  room.loserName = "";
  room.game = {
    turnNo: 1,
    phase: "draw",
    artistId: active[0],
    guesserId: active[1],
    requiredStart: "",
    turnSeconds: seconds,
    startedAt: now,
    deadline: nextDeadline(seconds, now),
    wrongAttempts: 0,
  };
  return true;
}

function saveSession(code, id, name) {
  sessionStorage.setItem(`pictureShiritori:${code}:pid`, id);
  localStorage.setItem("pictureShiritori:name", name);
  const url = new URL(location.href);
  url.searchParams.set("room", code);
  url.searchParams.delete("preview");
  history.replaceState(null, "", url);
}

function clearSessionView() {
  if (stopRoomListener) stopRoomListener();
  stopRoomListener = null;
  disconnectAction = null;
  currentRoom = null;
  roomCode = "";
  myId = "";
  els.roomView.hidden = true;
  els.homeView.hidden = false;
  const url = new URL(location.href);
  url.searchParams.delete("room");
  history.replaceState(null, "", url);
}

async function createRoom() {
  const name = cleanName(els.homeName.value);
  if (!name) return showToast("表示名を入力してください。");
  els.createRoomBtn.disabled = true;
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeRoomCode();
      const pid = makeId();
      const now = Date.now();
      const result = await runTransaction(roomRef(code), room => {
        if (room) return;
        return {
          version: 1,
          hostId: pid,
          status: "lobby",
          createdAt: now,
          updatedAt: now,
          settings: { turnSeconds: 60, answerSeconds: 60 },
          players: { [pid]: { name, active: true, disconnectedAt: 0, joinedAt: now } },
          order: [pid],
          history: {},
        };
      }, { applyLocally: false });
      if (result.committed) {
        await enterRoom(code, pid, name);
        return;
      }
    }
    throw new Error("部屋コードを作成できませんでした。");
  } catch (error) {
    console.error(error);
    showToast("部屋を作成できませんでした。接続を確認してください。");
  } finally {
    els.createRoomBtn.disabled = false;
  }
}

async function joinRoom() {
  const name = cleanName(els.homeName.value);
  const code = cleanCode(els.roomCodeInput.value);
  if (!name) return showToast("表示名を入力してください。");
  if (code.length !== 6) return showToast("6文字の部屋コードを入力してください。");
  const savedId = sessionStorage.getItem(`pictureShiritori:${code}:pid`);
  const pid = savedId || makeId();
  let failure = "";
  els.joinRoomBtn.disabled = true;
  try {
    // A fresh Firebase client has no local value for this room yet. Prime the
    // cache before the transaction so its first callback does not mistake the
    // existing room for a missing one and abort locally.
    const existing = await get(roomRef(code));
    if (!existing.exists()) return showToast("部屋が見つかりません。");
    const now = Date.now();
    const result = await runTransaction(roomRef(code), room => {
      // The first transaction callback can still receive an empty local cache.
      // Returning null lets Firebase compare with the server and retry with the
      // current room, while returning undefined would abort before that retry.
      if (!room) { failure = "部屋が見つかりません。"; return null; }
      room.players ||= {};
      room.order ||= [];
      const exists = Boolean(room.players[pid]);
      if (!exists && room.status !== "lobby") { failure = "ゲーム開始後の新規参加はできません。"; return; }
      if (!exists && activeIds(room).length >= MAX_PLAYERS) { failure = "この部屋は満員です。"; return; }
      const previousPlayer = room.players[pid] || {};
      const disconnectedAt = previousPlayer.active === false ? Number(previousPlayer.disconnectedAt || 0) : 0;
      const disconnectedFor = disconnectedAt ? Math.max(0, now - disconnectedAt) : 0;
      room.players[pid] = { ...previousPlayer, name, active: true, disconnectedAt: 0, joinedAt: previousPlayer.joinedAt || now };
      if (!room.order.includes(pid)) room.order.push(pid);
      if (exists && room.status === "playing" && phaseActorId(room) === pid && disconnectedFor) {
        if (disconnectedFor <= RECONNECT_GRACE_MS) {
          if (room.game?.deadline) room.game.deadline += disconnectedFor;
        } else {
          resolveMissingPhaseActor(room, now);
        }
      }
      room.updatedAt = now;
      return room;
    }, { applyLocally: false });
    if (!result.committed || !result.snapshot.exists()) return showToast(failure || "部屋に参加できませんでした。");
    await enterRoom(code, pid, name);
  } catch (error) {
    console.error(error);
    showToast("部屋に参加できませんでした。接続を確認してください。");
  } finally {
    els.joinRoomBtn.disabled = false;
  }
}

async function enterRoom(code, pid, name) {
  roomCode = code;
  myId = pid;
  myName = name;
  saveSession(code, pid, name);
  els.homeView.hidden = true;
  els.roomView.hidden = false;
  els.roomCodeText.textContent = code;
  disconnectAction = onDisconnect(ref(db, `${ROOT_PATH}/${code}/players/${pid}`));
  await disconnectAction.update({ active: false, disconnectedAt: serverTimestamp() });
  if (stopRoomListener) stopRoomListener();
  stopRoomListener = onValue(roomRef(), snapshot => {
    if (!snapshot.exists()) {
      showToast("部屋が削除されました。");
      clearSessionView();
      return;
    }
    currentRoom = snapshot.val();
    expirePending = false;
    renderRoom();
    reconcileDisconnectedPlayers();
  }, error => {
    console.error(error);
    setConnection("接続エラー", "is-error");
  });
}

async function reconcileDisconnectedPlayers() {
  if (reconcilePending || !currentRoom || !myId || currentRoom.players?.[myId]?.active === false) return;
  const checkAt = Date.now();
  const hostExpired = currentRoom.hostId && !isPlayerAvailable(currentRoom.players?.[currentRoom.hostId], checkAt);
  const actorId = currentRoom.status === "playing" ? phaseActorId(currentRoom) : "";
  const actorExpired = actorId && !isPlayerAvailable(currentRoom.players?.[actorId], checkAt);
  if (!hostExpired && !actorExpired) return;
  reconcilePending = true;
  try {
    const now = Date.now();
    await runTransaction(roomRef(), room => {
      if (!room) return;
      const active = activeIds(room, now);
      if (!room.hostId || !isPlayerAvailable(room.players?.[room.hostId], now)) room.hostId = active[0] || "";
      if (room.status === "playing" && active.length < 2) {
        finishRoom(room, "参加者が2人未満になったため終了しました。", now);
      } else if (room.status === "playing") {
        const currentActorId = phaseActorId(room);
        if (currentActorId && !isPlayerAvailable(room.players?.[currentActorId], now)) {
          resolveMissingPhaseActor(room, now);
        }
      }
      room.updatedAt = now;
      return room;
    }, { applyLocally: false });
  } catch (error) {
    console.error(error);
  } finally {
    reconcilePending = false;
  }
}

async function leaveRoom() {
  if (!currentRoom || !roomCode) return clearSessionView();
  if (!confirm("この部屋から退出しますか？")) return;
  try {
    if (disconnectAction) await disconnectAction.cancel();
    const now = Date.now();
    await runTransaction(roomRef(), room => {
      if (!room?.players?.[myId]) return room;
      room.players[myId].active = false;
      room.players[myId].disconnectedAt = 0;
      const active = activeIds(room, now);
      if (room.hostId === myId) room.hostId = active[0] || "";
      if (room.status === "playing" && phaseActorId(room) === myId) {
        resolveMissingPhaseActor(room, now);
      } else if (room.status === "playing" && active.length < 2) {
        finishRoom(room, "参加者が2人未満になったため終了しました。", now);
      }
      room.updatedAt = now;
      return room;
    }, { applyLocally: false });
  } catch (error) {
    console.error(error);
  }
  clearSessionView();
}

async function saveTimeSetting(kind, value) {
  if (!currentRoom || currentRoom.hostId !== myId) return;
  const seconds = Rules.normalizeTurnSeconds(value);
  const settingKey = kind === "answer" ? "answerSeconds" : "turnSeconds";
  if (seconds === lastSettingsValues[kind]) return;
  try {
    await runTransaction(roomRef(), room => {
      if (!room || room.hostId !== myId) return;
      room.settings ||= {};
      room.settings[settingKey] = seconds;
      room.updatedAt = Date.now();
      return room;
    });
  } catch (error) {
    console.error(error);
    showToast(`${kind === "answer" ? "回答" : "描画"}時間を保存できませんでした。`);
  }
}

async function startGame() {
  try {
    const now = Date.now();
    let failure = "";
    const result = await runTransaction(roomRef(), room => {
      if (!room || room.hostId !== myId || room.status !== "lobby") return;
      if (activeIds(room).length < 2) { failure = "2人以上で開始してください。"; return; }
      startRoom(room, now);
      room.updatedAt = now;
      return room;
    }, { applyLocally: false });
    if (!result.committed) showToast(failure || "ゲームを開始できませんでした。");
  } catch (error) {
    console.error(error);
    showToast("ゲームを開始できませんでした。");
  }
}

async function submitDrawing() {
  const answerCheck = Rules.validateWord(els.secretAnswer.value, currentRoom?.game?.requiredStart, usedWords(currentRoom));
  if (!answerCheck.ok) return showToast(answerCheck.reason);
  const image = canvas.toDataURL("image/jpeg", 0.78);
  if (!hasDrawing()) return showToast("絵を描いてください。");
  if (image.length > 480000) return showToast("絵のデータが大きすぎます。少し消してからもう一度お試しください。");
  els.submitDrawingBtn.disabled = true;
  try {
    const now = Date.now();
    const expectedTurn = currentRoom.game.turnNo;
    const result = await runTransaction(roomRef(), room => {
      const game = room?.game;
      if (!room || room.status !== "playing" || game?.turnNo !== expectedTurn || game.phase !== "draw" || game.artistId !== myId) return;
      const check = Rules.validateWord(answerCheck.word, game.requiredStart, usedWords(room));
      if (!check.ok) return;
      game.answer = check.word;
      game.image = image;
      game.phase = "guess";
      game.turnSeconds = Rules.normalizeTurnSeconds(room.settings?.answerSeconds ?? 60) || 60;
      game.startedAt = now;
      game.deadline = nextDeadline(game.turnSeconds, now);
      game.lastGuess = "";
      game.lastGuessPid = "";
      room.updatedAt = now;
      return room;
    }, { applyLocally: false });
    if (!result.committed) showToast("手番が更新されました。最新の画面を確認してください。");
  } catch (error) {
    console.error(error);
    showToast("絵を送信できませんでした。");
  } finally {
    els.submitDrawingBtn.disabled = false;
  }
}

async function submitGuess(event) {
  event.preventDefault();
  const guess = Rules.normalizeKana(els.guessInput.value);
  if (!guess || !/^[ぁ-ゖー]+$/.test(guess)) return showToast("ひらがなで回答してください。");
  const expectedTurn = currentRoom?.game?.turnNo;
  try {
    const now = Date.now();
    const result = await runTransaction(roomRef(), room => {
      const game = room?.game;
      if (!room || room.status !== "playing" || game?.turnNo !== expectedTurn || game.phase !== "guess" || game.guesserId !== myId) return;
      if (Rules.isCorrectGuess(guess, game.answer)) {
        addHistory(room, "correct", now, { guess });
        beginNextTurn(room, game.answer, now);
      } else {
        game.lastGuess = guess;
        game.lastGuessPid = myId;
        game.wrongAttempts = Number(game.wrongAttempts || 0) + 1;
        room.updatedAt = now;
      }
      return room;
    }, { applyLocally: false });
    if (!result.committed) showToast("手番が更新されました。最新の画面を確認してください。");
    else if (!Rules.isCorrectGuess(guess, currentRoom?.game?.answer)) {
      els.guessInput.select();
    }
  } catch (error) {
    console.error(error);
    showToast("回答を送信できませんでした。");
  }
}

async function expireTurn() {
  const expectedTurn = currentRoom?.game?.turnNo;
  if (!expectedTurn || expirePending) return;
  expirePending = true;
  try {
    const now = Date.now();
    await runTransaction(roomRef(), room => {
      const game = room?.game;
      if (!room || room.status !== "playing" || game?.turnNo !== expectedTurn || !game.deadline || game.deadline > now) return;
      if (game.phase === "guess") {
        finishForUnansweredDrawing(room, now);
      } else {
        addHistory(room, "timeout-draw", now);
        beginNextTurn(room, "", now);
      }
      return room;
    }, { applyLocally: false });
  } catch (error) {
    console.error(error);
    expirePending = false;
  }
}

async function endGame() {
  if (!confirm("ゲームを終了しますか？")) return;
  const now = Date.now();
  await runTransaction(roomRef(), room => {
    if (!room || room.hostId !== myId || room.status !== "playing") return;
    finishRoom(room, "部屋主がゲームを終了しました。", now);
    room.updatedAt = now;
    return room;
  }, { applyLocally: false });
}

async function returnLobby() {
  const now = Date.now();
  await runTransaction(roomRef(), room => {
    if (!room || room.hostId !== myId || room.status !== "finished") return;
    room.status = "lobby";
    room.game = null;
    room.history = {};
    room.finishReason = "";
    room.loserId = "";
    room.loserName = "";
    room.updatedAt = now;
    return room;
  }, { applyLocally: false });
}

function renderRoom() {
  const room = currentRoom;
  if (!room) return;
  const host = room.hostId === myId;
  const active = activeIds(room);
  els.roomCodeText.textContent = roomCode;
  els.memberCount.textContent = `${active.length}/${MAX_PLAYERS}`;
  renderMemberList(els.memberList, room, false);
  renderMemberList(els.gameMemberList, room, true);
  renderSettingControls(room, host);

  els.lobbyPanel.hidden = room.status !== "lobby";
  els.gamePanel.hidden = room.status !== "playing";
  els.finishedPanel.hidden = room.status !== "finished";
  els.startGameBtn.hidden = !host;
  els.hostSettings.hidden = !host;
  els.gameHostSettings.hidden = !host;
  els.endGameBtn.hidden = !host;
  els.returnLobbyBtn.hidden = !host;
  els.hostLabel.textContent = host ? "あなたが部屋主" : `${playerName(room, room.hostId)} が部屋主`;
  els.startGameBtn.disabled = active.length < 2;
  els.lobbyMessage.textContent = host
    ? (active.length < 2 ? "もう1人参加すると開始できます。" : "準備ができたらゲームを開始してください。")
    : "部屋主が開始するまでお待ちください。";

  if (room.status === "playing") renderGame(room);
  if (room.status === "finished") {
    els.finishReason.textContent = room.finishReason || "ゲームが終了しました。";
    renderHistory(room);
  }
}

function renderMemberList(target, room, compact) {
  target.replaceChildren();
  const game = room.game || {};
  for (const id of room.order || []) {
    const player = room.players?.[id];
    if (!player) continue;
    const li = document.createElement("li");
    const reconnecting = reconnectRemaining(player) > 0;
    if (player.active === false) li.classList.add("inactive");
    if (id === game.artistId || id === game.guesserId) li.classList.add("current");
    const avatar = document.createElement("span");
    avatar.className = "member-avatar";
    avatar.textContent = (player.name || "?").charAt(0);
    const name = document.createElement("span");
    name.className = "member-name";
    name.textContent = player.name || "名前なし";
    const tag = document.createElement("span");
    tag.className = "member-tag";
    const tags = [];
    if (id === room.hostId) tags.push("HOST");
    if (compact && id === game.artistId) tags.push("描く");
    if (compact && id === game.guesserId) tags.push("答える");
    if (id === myId) tags.push("YOU");
    if (reconnecting) tags.push("再接続待ち（3分）");
    else if (player.active === false) tags.push("退出");
    tag.textContent = tags.join(" · ");
    li.append(avatar, name, tag);
    target.append(li);
  }
}

function setControlValue(preset, customWrap, custom, seconds) {
  const known = [30, 60, 90, 120];
  if (seconds === 0) preset.value = "none";
  else if (known.includes(seconds)) preset.value = String(seconds);
  else { preset.value = "custom"; custom.value = String(seconds); }
  customWrap.hidden = preset.value !== "custom";
}

function renderSettingControls(room, host) {
  const drawSeconds = Rules.normalizeTurnSeconds(room.settings?.turnSeconds);
  const answerSeconds = Rules.normalizeTurnSeconds(room.settings?.answerSeconds ?? 60) || 60;
  lastSettingsValues = { draw: drawSeconds, answer: answerSeconds };
  if (host) {
    setControlValue(els.timePreset, els.customTimeWrap, els.customTime, drawSeconds);
    setControlValue(els.gameTimePreset, els.gameCustomTimeWrap, els.gameCustomTime, drawSeconds);
    setControlValue(els.answerTimePreset, els.answerCustomTimeWrap, els.answerCustomTime, answerSeconds);
    setControlValue(els.gameAnswerTimePreset, els.gameAnswerCustomTimeWrap, els.gameAnswerCustomTime, answerSeconds);
  }
  els.gameSettingLabel.textContent = `描画 ${Rules.timerLabel(drawSeconds)} / 回答 ${Rules.timerLabel(answerSeconds)}`;
}

function renderGame(room) {
  const game = room.game;
  if (!game) return;
  const isArtist = game.artistId === myId;
  const isGuesser = game.guesserId === myId;
  const key = `${game.turnNo}:${game.phase}`;
  els.turnNumber.textContent = `TURN ${game.turnNo}`;
  els.requiredStart.textContent = game.requiredStart ? `「${game.requiredStart}」から始まる言葉` : "最初の言葉は自由です";
  els.drawCard.hidden = !(game.phase === "draw" && isArtist);
  els.guessCard.hidden = !(game.phase === "guess" && isGuesser);
  els.waitingCard.hidden = (game.phase === "draw" && isArtist) || (game.phase === "guess" && isGuesser);

  if (game.phase === "draw") {
    els.turnTitle.textContent = isArtist ? "あなたが描く番です" : `${playerName(room, game.artistId)}さんが描いています`;
    els.turnGuide.textContent = isArtist
      ? "言葉を決めて絵を描き、答えと一緒に送ってください。文字を絵に書くのは禁止です。"
      : `次は${playerName(room, game.guesserId)}さんが回答します。`;
    els.waitingText.textContent = `${playerName(room, game.artistId)}さんの絵を待っています。`;
    els.spectatorImageWrap.hidden = true;
  } else if (game.phase === "guess") {
    els.turnTitle.textContent = isGuesser ? "絵を見て答えてください" : `${playerName(room, game.guesserId)}さんが回答中です`;
    els.turnGuide.textContent = isGuesser
      ? "答えはひらがなで入力してください。正解すると、次はあなたが描く番です。"
      : "答えは正解または時間切れになるまで表示されません。";
    els.waitingText.textContent = `${playerName(room, game.guesserId)}さんの回答を待っています。`;
    els.submittedImage.src = game.image || "";
    els.spectatorImage.src = game.image || "";
    els.spectatorImageWrap.hidden = !game.image;
    els.guessFeedback.textContent = game.lastGuessPid === myId && game.lastGuess ? `「${game.lastGuess}」ではありません。もう一度！` : "";
  }

  if (key !== renderedTurnKey) {
    renderedTurnKey = key;
    els.secretAnswer.value = "";
    els.guessInput.value = "";
    els.guessFeedback.textContent = "";
    if (game.phase === "draw" && isArtist) resetCanvas();
  }
  renderHistory(room);
}

function renderHistory(room) {
  const items = historyEntries(room).reverse();
  els.historyCount.textContent = String(items.length);
  els.finishedHistoryCount.textContent = String(items.length);
  renderHistoryInto(els.historyList, items);
  renderHistoryInto(els.finishedHistoryList, items);
}

function renderHistoryInto(target, items) {
  target.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "hint";
    empty.textContent = "まだ履歴はありません。";
    target.append(empty);
    return;
  }
  const labels = {
    correct: "正解",
    "timeout-draw": "描画時間切れ",
    "timeout-guess": "回答時間切れ",
    left: "途中退出",
  };
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "history-item";
    let visual;
    if (item.image?.startsWith("data:image/")) {
      visual = document.createElement("img");
      visual.src = item.image;
      visual.alt = `ターン${item.turnNo}の絵`;
    } else {
      visual = document.createElement("span");
      visual.className = "history-placeholder";
      visual.textContent = "—";
    }
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.word || labels[item.result] || "スキップ";
    const meta = document.createElement("span");
    meta.textContent = `#${item.turnNo} ${item.artistName} → ${item.guesserName} · ${labels[item.result] || item.result}`;
    if (item.loserName) meta.textContent += ` · ${item.loserName}さんの負け`;
    body.append(title, meta);
    li.append(visual, body);
    target.append(li);
  }
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function updateTimer() {
  reconcileDisconnectedPlayers();
  const presenceTick = Math.floor(Date.now() / 1000);
  if (currentRoom && presenceTick !== lastPresenceTick) {
    lastPresenceTick = presenceTick;
    els.memberCount.textContent = `${activeIds(currentRoom).length}/${MAX_PLAYERS}`;
    renderMemberList(els.memberList, currentRoom, false);
    renderMemberList(els.gameMemberList, currentRoom, true);
  }
  const game = currentRoom?.status === "playing" ? currentRoom.game : null;
  if (!game) return;
  const actor = currentRoom.players?.[phaseActorId(currentRoom)];
  const reconnectMs = reconnectRemaining(actor);
  if (reconnectMs > 0) {
    els.timer.textContent = `再接続 ${formatRemaining(reconnectMs)}`;
    els.timer.classList.add("reconnecting");
    els.timer.classList.toggle("warning", reconnectMs <= 10000);
    return;
  }
  els.timer.classList.remove("reconnecting");
  if (!game.deadline) {
    els.timer.textContent = "制限なし";
    els.timer.classList.remove("warning");
    return;
  }
  const remaining = game.deadline - Date.now();
  els.timer.textContent = formatRemaining(remaining);
  els.timer.classList.toggle("warning", remaining > 0 && remaining <= 10000);
  if (remaining <= 0) expireTurn();
}

function resetCanvas() {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  undoStack = [];
}

function hasDrawing() {
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) return true;
  }
  return false;
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}

function beginStroke(event) {
  if (currentRoom?.game?.artistId !== myId || currentRoom?.game?.phase !== "draw") return;
  event.preventDefault();
  drawing = true;
  canvas.setPointerCapture?.(event.pointerId);
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > 8) undoStack.shift();
  lastPoint = canvasPoint(event);
  ctx.beginPath();
  ctx.arc(lastPoint.x, lastPoint.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
}

function continueStroke(event) {
  if (!drawing || !lastPoint) return;
  event.preventDefault();
  const point = canvasPoint(event);
  ctx.beginPath();
  ctx.moveTo(lastPoint.x, lastPoint.y);
  ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  lastPoint = point;
}

function endStroke() {
  drawing = false;
  lastPoint = null;
}

function undoStroke() {
  const previous = undoStack.pop();
  if (previous) ctx.putImageData(previous, 0, 0);
}

function clearDrawing() {
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > 8) undoStack.shift();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function wireTimeControls(preset, customWrap, custom, kind) {
  preset.addEventListener("change", () => {
    customWrap.hidden = preset.value !== "custom";
    if (preset.value === "custom") custom.focus();
    else saveTimeSetting(kind, preset.value);
  });
  custom.addEventListener("change", () => {
    const value = Rules.normalizeTurnSeconds(custom.value);
    custom.value = String(value || 10);
    saveTimeSetting(kind, value || 10);
  });
}

els.createRoomBtn.addEventListener("click", createRoom);
els.joinRoomBtn.addEventListener("click", joinRoom);
els.roomCodeInput.addEventListener("input", () => { els.roomCodeInput.value = cleanCode(els.roomCodeInput.value); });
els.roomCodeInput.addEventListener("keydown", event => { if (event.key === "Enter") joinRoom(); });
els.homeName.addEventListener("input", () => { els.homeName.value = cleanName(els.homeName.value); });
els.copyRoomBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    showToast("部屋コードをコピーしました。");
  } catch { showToast(`部屋コード：${roomCode}`); }
});
els.leaveRoomBtn.addEventListener("click", leaveRoom);
els.startGameBtn.addEventListener("click", startGame);
els.submitDrawingBtn.addEventListener("click", submitDrawing);
els.guessForm.addEventListener("submit", submitGuess);
els.endGameBtn.addEventListener("click", endGame);
els.returnLobbyBtn.addEventListener("click", returnLobby);
wireTimeControls(els.timePreset, els.customTimeWrap, els.customTime, "draw");
wireTimeControls(els.gameTimePreset, els.gameCustomTimeWrap, els.gameCustomTime, "draw");
wireTimeControls(els.answerTimePreset, els.answerCustomTimeWrap, els.answerCustomTime, "answer");
wireTimeControls(els.gameAnswerTimePreset, els.gameAnswerCustomTimeWrap, els.gameAnswerCustomTime, "answer");

document.querySelectorAll(".color-chip").forEach(button => button.addEventListener("click", () => {
  lineColor = button.dataset.color;
  document.querySelectorAll(".color-chip").forEach(item => item.classList.toggle("active", item === button));
}));
els.undoBtn.addEventListener("click", undoStroke);
els.clearBtn.addEventListener("click", clearDrawing);
canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", continueStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("pointerleave", endStroke);

setInterval(updateTimer, 250);
resetCanvas();

async function boot() {
  els.homeName.value = cleanName(localStorage.getItem("pictureShiritori:name"));
  const queryCode = cleanCode(new URLSearchParams(location.search).get("room"));
  if (queryCode) els.roomCodeInput.value = queryCode;
  if (PREVIEW) {
    setConnection("表示確認", "is-loading");
    document.querySelectorAll("button,input,select").forEach(element => { element.disabled = true; });
    return;
  }
  try {
    const app = initializeApp(firebaseConfig, `picture-shiritori-${Date.now()}`);
    db = getDatabase(app);
    onValue(ref(db, ".info/connected"), snapshot => {
      setConnection(snapshot.val() ? "接続済み" : "再接続中", snapshot.val() ? "" : "is-loading");
    });
    const savedPid = queryCode ? sessionStorage.getItem(`pictureShiritori:${queryCode}:pid`) : "";
    const savedName = cleanName(localStorage.getItem("pictureShiritori:name"));
    if (queryCode && savedPid && savedName) {
      const snapshot = await get(roomRef(queryCode));
      if (snapshot.exists() && snapshot.val()?.players?.[savedPid]) {
        els.homeName.value = savedName;
        els.roomCodeInput.value = queryCode;
        await joinRoom();
      }
    }
  } catch (error) {
    console.error(error);
    setConnection("接続エラー", "is-error");
    showToast("ゲームサーバーへ接続できませんでした。");
  }
}

boot();
