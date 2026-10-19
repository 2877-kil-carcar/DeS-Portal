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
const REQUEST_TIMEOUT_MS = 15000;
const CHAT_LIMIT = 80;
const PREVIEW = new URLSearchParams(location.search).get("preview") === "1";
const $ = id => document.getElementById(id);
const els = Object.fromEntries([
  "homeView", "roomView", "homeName", "roomCodeInput", "createRoomBtn", "joinRoomBtn",
  "connectionBadge", "roomCodeText", "copyRoomBtn", "leaveRoomBtn", "lobbyPanel",
  "memberCount", "hostLabel", "memberList", "hostSettings", "timePreset", "customTimeWrap",
  "customTime", "answerTimePreset", "answerCustomTimeWrap", "answerCustomTime", "startGameBtn", "lobbyMessage", "gamePanel", "gameHostSettings",
  "gameTimePreset", "gameCustomTimeWrap", "gameCustomTime", "gameAnswerTimePreset", "gameAnswerCustomTimeWrap", "gameAnswerCustomTime", "turnNumber", "timer",
  "turnTitle", "turnGuide", "turnRole", "turnParticipants", "requiredStart", "drawCard", "drawingCanvas", "undoBtn",
  "clearBtn", "secretAnswer", "submitDrawingBtn", "guessCard", "submittedImage", "guessForm",
  "guessInput", "guessFeedback", "waitingCard", "waitingText", "spectatorImageWrap",
  "spectatorImage", "gameSettingLabel", "gameMemberList", "historyCount", "historyList",
  "endGameBtn", "finishedPanel", "finishReason", "finishedHistoryCount", "finishedHistoryList",
  "returnLobbyBtn", "toast",
  "chatToggle", "chatPreview", "chatUnread", "chatPanel", "chatClose", "chatList",
  "chatForm", "chatInput", "chatSend", "chatNewMessages", "chatAnnouncement",
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
let serverTimeOffset = 0;
let networkConnected = false;
let presenceReady = false;
let connectionEpoch = 0;
let connectionId = "";
let recoveryPromise = null;
let resumePromise = null;
let recoveryTimer = null;
let actionPending = false;
let actionSerial = 0;
let canvasRevision = 0;
let chatSending = false;
let chatSerial = 0;
let chatOpen = false;
let chatInitialized = false;
let chatKnownIds = new Set();
let chatReadIds = new Set();
let unreadChatIds = new Set();
let chatSignature = "";
let chatDraft = null;

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

function serverNow() {
  return Date.now() + serverTimeOffset;
}

function isPlayerConnected(player) {
  if (!player || player.left === true) return false;
  const connections = Object.values(player.connections || {}).filter(connection => Number(connection.connectedAt) > 0);
  return connections.length ? connections.some(connection => connection.online === true) : player.active !== false;
}

function playerDisconnectedAt(player) {
  if (!player || player.left === true || isPlayerConnected(player)) return 0;
  const connections = Object.values(player.connections || {}).filter(connection => Number(connection.connectedAt) > 0);
  return connections.length
    ? Math.max(0, ...connections.map(connection => Number(connection.disconnectedAt) || 0))
    : Number(player.disconnectedAt) || 0;
}

function playerName(room, id) {
  return room?.players?.[id]?.name || "退出したプレイヤー";
}

function reconnectRemaining(player, now = serverNow()) {
  const disconnectedAt = playerDisconnectedAt(player);
  if (!disconnectedAt) return 0;
  return Math.max(0, disconnectedAt + RECONNECT_GRACE_MS - now);
}

function isPlayerAvailable(player, now = serverNow()) {
  return Boolean(player) && (isPlayerConnected(player) || reconnectRemaining(player, now) > 0);
}

function activeIds(room, now = serverNow()) {
  return (room?.order || []).filter(id => isPlayerAvailable(room.players?.[id], now));
}

function nextAvailable(room, afterId, now) {
  const ids = activeIds(room, now);
  const index = (room.order || []).indexOf(afterId);
  for (let step = 1; step <= (room.order || []).length; step += 1) {
    const id = room.order[(index + step + room.order.length) % room.order.length];
    if (ids.includes(id)) return id;
  }
  return "";
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
  const artistId = nextAvailable(room, previous.artistId, now);
  const guesserId = nextAvailable(room, artistId, now);
  const seconds = Rules.normalizeTurnSeconds(room.settings?.turnSeconds);
  room.game = {
    turnNo: Number(previous.turnNo || 0) + 1,
    phase: "draw",
    artistId,
    guesserId,
    requiredStart: basisWord ? Rules.nextStarts(basisWord) : (previous.requiredStart || ""),
    turnSeconds: seconds,
    startedAt: now,
    deadline: nextDeadline(seconds, now),
    wrongAttempts: 0,
  };
  room.updatedAt = now;
}

function startRoom(room, now) {
  const active = activeIds(room, now).filter(id => isPlayerConnected(room.players[id]));
  if (active.length < 2) return false;
  const order = Rules.shuffleOrder(active);
  room.order = [...order, ...(room.order || []).filter(id => !order.includes(id))];
  const seconds = Rules.normalizeTurnSeconds(room.settings?.turnSeconds);
  room.status = "playing";
  room.history = {};
  room.startedAt = now;
  room.roundId = makeId();
  room.finishReason = "";
  room.loserId = "";
  room.loserName = "";
  room.game = {
    turnNo: 1,
    phase: "draw",
    artistId: order[0],
    guesserId: order[1],
    requiredStart: Rules.randomStart(),
    turnSeconds: seconds,
    startedAt: now,
    deadline: nextDeadline(seconds, now),
    wrongAttempts: 0,
  };
  return true;
}

// Every mutation rechecks presence and deadlines against the transaction's
// current room. A UI countdown alone cannot protect against a delayed write.
function settleRoom(room, now) {
  let changed = false;
  const available = activeIds(room, now);
  if (!room.hostId || !isPlayerAvailable(room.players?.[room.hostId], now)) {
    const host = available.find(id => isPlayerConnected(room.players[id])) || available[0] || "";
    if (host !== room.hostId) { room.hostId = host; changed = true; }
  }
  if (room.status !== "playing") return changed;
  if (available.length < 2) {
    finishRoom(room, "参加者が2人未満になったため終了しました。", now);
    return true;
  }
  const actor = room.players?.[phaseActorId(room)];
  if (!isPlayerAvailable(actor, now)) {
    resolveMissingPhaseActor(room, now);
    return true;
  }
  if (!isPlayerConnected(actor)) return changed;
  if (room.game?.deadline && room.game.deadline <= now) {
    if (room.game.phase === "guess") finishForUnansweredDrawing(room, now);
    else {
      addHistory(room, "timeout-draw", now);
      beginNextTurn(room, "", now);
    }
    return true;
  }
  return changed;
}

function restorePlayer(room, pid, name, id, now) {
  const previous = room.players?.[pid];
  const disconnectedAt = playerDisconnectedAt(previous);
  const paused = room.status === "playing" && phaseActorId(room) === pid && reconnectRemaining(previous, now) > 0;
  // Settle expired players BEFORE making the returning player available again.
  if (!paused) settleRoom(room, now);
  if (paused && room.game?.deadline) {
    room.game.deadline += Math.max(0, now - Math.max(disconnectedAt, Number(room.game.startedAt) || disconnectedAt));
  }
  room.players ||= {};
  const connections = { ...(previous?.connections || {}) };
  // Keep live tabs, but bound old disconnected connection records.
  for (const [key] of Object.entries(connections).filter(([, value]) => !value.online).slice(0, -8)) delete connections[key];
  connections[id] = { online: true, disconnectedAt: 0, connectedAt: now };
  room.players[pid] = { ...previous, name, active: true, left: false, disconnectedAt: 0, joinedAt: previous?.joinedAt || now, connections };
  room.order ||= [];
  if (!room.order.includes(pid)) room.order.push(pid);
  if (!room.hostId) room.hostId = pid;
  room.updatedAt = now;
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
  saveDraft();
  connectionEpoch += 1;
  actionSerial += 1;
  chatSerial += 1;
  chatSending = false;
  presenceReady = false;
  actionPending = false;
  recoveryPromise = null;
  resumePromise = null;
  clearTimeout(recoveryTimer);
  if (stopRoomListener) stopRoomListener();
  stopRoomListener = null;
  disconnectAction = null;
  currentRoom = null;
  roomCode = "";
  myId = "";
  resetChat();
  document.body.dataset.turn = "idle";
  els.roomView.hidden = true;
  els.homeView.hidden = false;
  const url = new URL(location.href);
  url.searchParams.delete("room");
  history.replaceState(null, "", url);
}

function withTimeout(promise, onTimeout = () => {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error("通信結果を確認できませんでした。接続を確認して、もう一度お試しください。"));
    }, REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function canOperate() {
  return networkConnected && presenceReady && Boolean(currentRoom && myId) && isPlayerConnected(currentRoom.players?.[myId]);
}

function acceptRoomSnapshot(room) {
  // A delayed get()/transaction response must not roll back a newer live event.
  if (currentRoom && Number(room.revision || 0) < Number(currentRoom.revision || 0)) return;
  currentRoom = room;
}

function updateControls() {
  const disabled = !canOperate() || actionPending;
  for (const element of [els.submitDrawingBtn, ...els.guessForm.querySelectorAll("button,input"),
    els.startGameBtn, els.endGameBtn, els.returnLobbyBtn, els.timePreset, els.customTime,
    els.answerTimePreset, els.answerCustomTime, els.gameTimePreset, els.gameCustomTime,
    els.gameAnswerTimePreset, els.gameAnswerCustomTime]) element.disabled = disabled;
  els.startGameBtn.disabled = disabled || Object.values(currentRoom?.players || {}).filter(isPlayerConnected).length < 2;
  els.chatInput.disabled = !canOperate() || chatSending;
  els.chatSend.disabled = !canOperate() || chatSending;
}

async function recoverPresence() {
  if (!networkConnected || !roomCode || !myId) return;
  if (recoveryPromise) return recoveryPromise;
  const code = roomCode, pid = myId, name = myName, epoch = connectionEpoch, id = makeId();
  const valid = () => networkConnected && epoch === connectionEpoch && code === roomCode && pid === myId;
  presenceReady = false;
  updateControls();
  setConnection("復帰中", "is-loading");
  const task = (async () => {
    const action = onDisconnect(ref(db, `${ROOT_PATH}/${code}/players/${pid}/connections/${id}`));
    // Each transport connection needs its own one-shot disconnect registration.
    // A late disconnect from an old tab must not mark a new connection offline.
    await withTimeout(action.update({ online: false, disconnectedAt: serverTimestamp() }));
    if (!valid()) return;
    disconnectAction = action;
    let aborted = false, failure = "部屋が見つからないか、参加情報がありません。";
    const result = await withTimeout(runTransaction(roomRef(code), room => {
      if (aborted || !valid()) return;
      if (!room) return null;
      if (!room.players?.[pid]?.name || !room.order?.includes(pid)) return;
      const now = serverNow();
      if (!isPlayerAvailable(room.players[pid], now) && activeIds(room, now).length >= MAX_PLAYERS) {
        failure = "この部屋は満員です。";
        return;
      }
      restorePlayer(room, pid, name, id, now);
      settleRoom(room, now);
      room.revision = Number(room.revision || 0) + 1;
      return room;
    }, { applyLocally: false }), () => { aborted = true; });
    if (!valid()) return;
    if (!result.committed || !result.snapshot.exists()) {
      action.cancel().catch(console.error);
      showToast(failure);
      clearSessionView();
      return;
    }
    connectionId = id;
    presenceReady = true;
    acceptRoomSnapshot(result.snapshot.val());
    setConnection("接続済み");
    renderRoom();
  })();
  recoveryPromise = task;
  try { await task; }
  catch (error) {
    if (valid()) {
      presenceReady = false;
      setConnection("再接続中", "is-loading");
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => { recoverPresence(); }, 3000);
    }
    console.error(error);
  } finally {
    if (recoveryPromise === task) recoveryPromise = null;
    updateControls();
  }
}

function handleConnection(connected) {
  if (networkConnected === connected) return;
  networkConnected = connected;
  connectionEpoch += 1;
  actionSerial += 1;
  chatSerial += 1;
  chatSending = false;
  actionPending = false;
  presenceReady = false;
  recoveryPromise = null;
  resumePromise = null;
  expirePending = false;
  reconcilePending = false;
  clearTimeout(recoveryTimer);
  saveDraft();
  setConnection(connected && !roomCode ? "接続済み" : "再接続中", connected && !roomCode ? "" : "is-loading");
  updateControls();
  if (connected) recoverPresence();
}

async function runRoomAction(change, { phase = "", turn = 0, channel = "game", settle = true, message = "手番が更新されました。最新の画面を確認してください。" } = {}) {
  const chatting = channel === "chat";
  if (!canOperate() || (chatting ? chatSending : actionPending)) {
    if (!canOperate()) { showToast("再接続しています。復帰が完了するまでお待ちください。"); recoverPresence(); }
    return false;
  }
  const code = roomCode, pid = myId, epoch = connectionEpoch, serial = chatting ? ++chatSerial : ++actionSerial;
  let cancelled = false, accepted = false;
  const valid = () => !cancelled && code === roomCode && pid === myId && epoch === connectionEpoch && networkConnected && presenceReady;
  if (chatting) chatSending = true;
  else actionPending = true;
  updateControls();
  try {
    const result = await withTimeout(runTransaction(roomRef(code), room => {
      accepted = false;
      if (!valid() || !room || !isPlayerConnected(room.players?.[pid])) return;
      const now = serverNow();
      const settled = settle && settleRoom(room, now);
      if ((turn && room.game?.turnNo !== turn) || (phase && (room.status !== "playing" || room.game?.phase !== phase))) return settled ? room : undefined;
      accepted = change(room, now, pid) === true;
      if (!accepted && !settled) return;
      room.updatedAt = now;
      room.revision = Number(room.revision || 0) + 1;
      return room;
    }, { applyLocally: false }), () => { cancelled = true; });
    if (!valid()) return false;
    if (result.snapshot.exists()) {
      acceptRoomSnapshot(result.snapshot.val());
      renderRoom();
    }
    if (!result.committed || !accepted) showToast(message);
    return result.committed && accepted;
  } catch (error) {
    if (code === roomCode && epoch === connectionEpoch) showToast(error.message || "送信できませんでした。");
    console.error(error);
    return false;
  } finally {
    if (chatting && serial === chatSerial) chatSending = false;
    if (!chatting && serial === actionSerial) actionPending = false;
    updateControls();
  }
}

async function createRoom() {
  if (!networkConnected) return showToast("接続を確認してください。");
  const name = cleanName(els.homeName.value);
  if (!name) return showToast("表示名を入力してください。");
  els.createRoomBtn.disabled = true;
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeRoomCode();
      const pid = makeId();
      const epoch = connectionEpoch;
      let cancelled = false;
      const result = await withTimeout(runTransaction(roomRef(code), room => {
        if (cancelled || !networkConnected || epoch !== connectionEpoch) return;
        if (room) return;
        const now = serverNow();
        return {
          version: 1,
          revision: 1,
          hostId: pid,
          status: "lobby",
          createdAt: now,
          updatedAt: now,
          settings: { turnSeconds: 60, answerSeconds: 60 },
          players: { [pid]: { name, active: false, disconnectedAt: now, joinedAt: now } },
          order: [pid],
          history: {},
        };
      }, { applyLocally: false }), () => { cancelled = true; });
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
  if (!networkConnected) return showToast("接続を確認してください。");
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
    const existing = await withTimeout(get(roomRef(code)));
    if (!existing.exists()) return showToast("部屋が見つかりません。");
    let cancelled = false;
    const epoch = connectionEpoch;
    const result = await withTimeout(runTransaction(roomRef(code), room => {
      if (cancelled || !networkConnected || epoch !== connectionEpoch) return;
      // The first transaction callback can still receive an empty local cache.
      // Returning null lets Firebase compare with the server and retry with the
      // current room, while returning undefined would abort before that retry.
      if (!room) { failure = "部屋が見つかりません。"; return null; }
      room.players ||= {};
      room.order ||= [];
      const now = serverNow();
      const exists = Boolean(room.players[pid]?.name && room.order.includes(pid));
      if (!exists && room.status !== "lobby") { failure = "ゲーム開始後の新規参加はできません。"; return; }
      if (!isPlayerAvailable(room.players[pid], now) && activeIds(room, now).length >= MAX_PLAYERS) { failure = "この部屋は満員です。"; return; }
      // Reserve capacity atomically while the disconnect handler is armed.
      if (!exists) room.players[pid] = { name, active: false, disconnectedAt: now, joinedAt: now };
      if (!room.order.includes(pid)) room.order.push(pid);
      room.updatedAt = now;
      room.revision = Number(room.revision || 0) + 1;
      return room;
    }, { applyLocally: false }), () => { cancelled = true; });
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
  resetChat();
  connectionEpoch += 1;
  recoveryPromise = null;
  presenceReady = false;
  roomCode = code;
  myId = pid;
  myName = name;
  saveSession(code, pid, name);
  els.homeView.hidden = true;
  els.roomView.hidden = false;
  els.roomCodeText.textContent = code;
  if (stopRoomListener) stopRoomListener();
  stopRoomListener = onValue(roomRef(), snapshot => {
    if (code !== roomCode || pid !== myId) return;
    if (!snapshot.exists()) {
      showToast("部屋が削除されました。");
      clearSessionView();
      return;
    }
    acceptRoomSnapshot(snapshot.val());
    renderRoom();
    reconcileDisconnectedPlayers();
  }, error => {
    console.error(error);
    setConnection("接続エラー", "is-error");
  });
  await recoverPresence();
}

async function reconcileDisconnectedPlayers() {
  if (reconcilePending || !canOperate() || actionPending) return;
  const checkAt = serverNow();
  const hostExpired = !currentRoom.hostId || !isPlayerAvailable(currentRoom.players?.[currentRoom.hostId], checkAt);
  const actorId = currentRoom.status === "playing" ? phaseActorId(currentRoom) : "";
  const actorExpired = actorId && !isPlayerAvailable(currentRoom.players?.[actorId], checkAt);
  const tooFew = currentRoom.status === "playing" && activeIds(currentRoom, checkAt).length < 2;
  if (!hostExpired && !actorExpired && !tooFew) return;
  reconcilePending = true;
  try {
    await runRoomAction(() => true);
  } finally {
    reconcilePending = false;
  }
}

async function leaveRoom() {
  if (!currentRoom || !roomCode) return clearSessionView();
  if (!confirm("この部屋から退出しますか？")) return;
  let explicitlyLeft = false;
  if (canOperate()) {
    const left = await runRoomAction((room, now, pid) => {
      if (!room.players?.[pid]) return false;
      room.players[pid].active = false;
      room.players[pid].left = true;
      room.players[pid].disconnectedAt = 0;
      settleRoom(room, now);
      return true;
    });
    if (!left) return;
    explicitlyLeft = true;
  } else if (disconnectAction) {
    // Let the armed server disconnect operation handle an offline departure.
    // Waiting for cancel() here would keep the user trapped on the room screen.
    showToast("退出しました。通信が切れている間は、ほかの参加者には再接続待ちと表示されます。");
  }
  const action = disconnectAction;
  clearSessionView();
  if (explicitlyLeft && action) action.cancel().catch(console.error);
}

async function saveTimeSetting(kind, value) {
  if (!currentRoom || currentRoom.hostId !== myId) return;
  const seconds = Rules.normalizeTurnSeconds(value);
  const settingKey = kind === "answer" ? "answerSeconds" : "turnSeconds";
  if (seconds === lastSettingsValues[kind]) return;
  await runRoomAction((room, now, pid) => {
    if (room.hostId !== pid) return false;
    room.settings ||= {};
    room.settings[settingKey] = seconds;
    return true;
  });
}

async function startGame() {
  await runRoomAction((room, now, pid) => {
    if (room.hostId !== pid || room.status !== "lobby") return false;
    return startRoom(room, now);
  }, { message: "接続済みの参加者が2人以上必要です。" });
}

async function submitDrawing() {
  if (!canOperate() || actionPending) return runRoomAction(() => false);
  const answerCheck = Rules.validateWord(els.secretAnswer.value, currentRoom?.game?.requiredStart, usedWords(currentRoom));
  if (!answerCheck.ok) return showToast(answerCheck.reason);
  const image = canvas.toDataURL("image/jpeg", 0.78);
  if (!hasDrawing()) return showToast("絵を描いてください。");
  if (image.length > 480000) return showToast("絵のデータが大きすぎます。少し消してからもう一度お試しください。");
  saveDraft();
  await runRoomAction((room, now, pid) => {
      const game = room?.game;
      if (game.artistId !== pid) return false;
      const check = Rules.validateWord(answerCheck.word, game.requiredStart, usedWords(room));
      if (!check.ok) return false;
      game.answer = check.word;
      game.image = image;
      game.phase = "guess";
      game.turnSeconds = Rules.normalizeTurnSeconds(room.settings?.answerSeconds ?? 60) || 60;
      game.startedAt = now;
      game.deadline = nextDeadline(game.turnSeconds, now);
      game.lastGuess = "";
      game.lastGuessPid = "";
      room.updatedAt = now;
      return true;
  }, { phase: "draw", turn: currentRoom.game.turnNo });
}

async function submitGuess(event) {
  event.preventDefault();
  if (!canOperate() || actionPending) return runRoomAction(() => false);
  const guess = Rules.normalizeKana(els.guessInput.value);
  if (!guess || !/^[ぁ-ゖー]+$/.test(guess)) return showToast("ひらがなで回答してください。");
  saveDraft();
  const correct = Rules.isCorrectGuess(guess, currentRoom?.game?.answer);
  const accepted = await runRoomAction((room, now, pid) => {
      const game = room?.game;
      if (game.guesserId !== pid) return false;
      if (Rules.isCorrectGuess(guess, game.answer)) {
        addHistory(room, "correct", now, { guess });
        beginNextTurn(room, game.answer, now);
      } else {
        game.lastGuess = guess;
        game.lastGuessPid = pid;
        game.wrongAttempts = Number(game.wrongAttempts || 0) + 1;
        room.updatedAt = now;
      }
      return true;
  }, { phase: "guess", turn: currentRoom.game.turnNo });
  if (accepted && !correct) els.guessInput.select();
}

async function expireTurn() {
  if (!canOperate() || actionPending || !currentRoom?.game?.turnNo || expirePending) return;
  expirePending = true;
  try {
    // runRoomAction settles using the latest presence, phase and server time.
    await runRoomAction(() => true);
  } finally {
    expirePending = false;
  }
}

async function endGame() {
  if (!confirm("ゲームを終了しますか？")) return;
  await runRoomAction((room, now, pid) => {
    if (room.hostId !== pid || room.status !== "playing") return false;
    finishRoom(room, "部屋主がゲームを終了しました。", now);
    return true;
  });
}

async function returnLobby() {
  await runRoomAction((room, now, pid) => {
    if (room.hostId !== pid || room.status !== "finished") return false;
    room.status = "lobby";
    room.game = null;
    room.history = {};
    room.finishReason = "";
    room.loserId = "";
    room.loserName = "";
    return true;
  });
}

function renderRoom() {
  const room = currentRoom;
  if (!room) return;
  if (room.status !== "playing") document.body.dataset.turn = "idle";
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
  renderChat();
  updateControls();
}

function renderMemberList(target, room, compact) {
  target.replaceChildren();
  const game = room.game || {};
  for (const [index, id] of (room.order || []).entries()) {
    const player = room.players?.[id];
    if (!player) continue;
    const li = document.createElement("li");
    const reconnecting = reconnectRemaining(player) > 0;
    if (!isPlayerConnected(player)) li.classList.add("inactive");
    if (id === game.artistId || id === game.guesserId) li.classList.add("current");
    const avatar = document.createElement("span");
    avatar.className = "member-avatar";
    avatar.textContent = room.status === "playing" ? String(index + 1) : (player.name || "?").charAt(0);
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
    else if (!isPlayerConnected(player)) tags.push("退出");
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
  const role = game.phase === "draw" && isArtist ? "draw" : game.phase === "guess" && isGuesser ? "guess" : "watch";
  document.body.dataset.turn = role;
  els.turnRole.textContent = role === "draw" ? "✎ 描く番" : role === "guess" ? "✓ 答える番" : "ほかの人の番";
  els.turnParticipants.textContent = `描く：${playerName(room, game.artistId)} → 答える：${playerName(room, game.guesserId)}`;
  const key = `${roomCode}:${room.roundId || room.startedAt || 0}:${game.turnNo}:${game.phase}`;
  els.turnNumber.textContent = `TURN ${game.turnNo}`;
  const starts = Rules.startOptions(game.requiredStart);
  els.requiredStart.textContent = starts.length ? `${starts.map(kana => `「${kana}」`).join("・")}から始まる言葉` : "最初の言葉は自由です";
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
    restoreDraft();
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

function resetChat() {
  chatOpen = false;
  chatInitialized = false;
  chatKnownIds = new Set();
  chatReadIds = new Set();
  unreadChatIds = new Set();
  chatSignature = "";
  chatDraft = null;
  chatSending = false;
  chatSerial += 1;
  els.chatToggle.hidden = true;
  els.chatPanel.hidden = true;
  els.chatToggle.setAttribute("aria-expanded", "false");
  els.chatInput.value = "";
  els.chatList.replaceChildren();
  els.chatAnnouncement.textContent = "";
}

function chatEntries() {
  return Object.entries(currentRoom?.chatMessages || {}).map(([id, entry]) => ({ ...entry, id }))
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0) || Number(a.sentAt || 0) - Number(b.sentAt || 0) || a.id.localeCompare(b.id));
}

function chatAtBottom() {
  return els.chatList.scrollHeight - els.chatList.scrollTop - els.chatList.clientHeight < 45;
}

function chatReadKey() {
  return `pictureShiritori:chatRead:${roomCode}:${myId}`;
}

function saveChatRead() {
  try { sessionStorage.setItem(chatReadKey(), JSON.stringify([...chatReadIds])); }
  catch (_) { /* Chat still works when browser storage is unavailable. */ }
}

function markChatRead() {
  for (const entry of chatEntries()) chatReadIds.add(entry.id);
  unreadChatIds.clear();
  saveChatRead();
  updateChatUnread();
}

function updateChatUnread() {
  const count = unreadChatIds.size;
  els.chatUnread.textContent = String(count);
  els.chatUnread.hidden = count === 0;
  els.chatToggle.classList.toggle("has-unread", count > 0);
  els.chatToggle.setAttribute("aria-label", `部屋のチャットを${chatOpen ? "閉じる" : "開く"}${count ? `、未読${count}件` : ""}`);
  els.chatNewMessages.hidden = !chatOpen || count === 0;
  els.chatNewMessages.textContent = `新着${count}件を見る ↓`;
}

function readLatestChat() {
  els.chatList.scrollTop = els.chatList.scrollHeight;
  markChatRead();
}

function renderChat() {
  if (!currentRoom || !roomCode) return;
  els.chatToggle.hidden = false;
  const entries = chatEntries();
  if (!chatInitialized) {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(chatReadKey()) || "null"); } catch (_) { /* Ignore corrupt history. */ }
    chatReadIds = new Set(Array.isArray(saved) ? saved : entries.map(entry => entry.id));
    saveChatRead();
  }
  const newEntries = entries.filter(entry => !(chatInitialized ? chatKnownIds : chatReadIds).has(entry.id));
  const atBottom = chatAtBottom(), viewingLatest = chatOpen && !document.hidden && atBottom;
  const liveIds = new Set(entries.map(entry => entry.id));
  chatReadIds = new Set([...chatReadIds].filter(id => liveIds.has(id)));
  for (const entry of entries) if (viewingLatest || entry.pid === myId) chatReadIds.add(entry.id);
  unreadChatIds = new Set(entries.filter(entry => entry.pid !== myId && !chatReadIds.has(entry.id)).map(entry => entry.id));
  if (viewingLatest) saveChatRead();
  chatKnownIds = liveIds;
  chatInitialized = true;
  const latest = entries.at(-1);
  els.chatPreview.textContent = latest ? `${latest.pid === myId ? "自分" : String(latest.name || "参加者")}：${String(latest.text || "")}` : "部屋のみんなと話そう";
  const incoming = newEntries.filter(entry => entry.pid !== myId).at(-1);
  if (incoming && !viewingLatest) els.chatAnnouncement.textContent = `${String(incoming.name || "参加者")}さんからチャットが届きました。${String(incoming.text || "")}`;
  const signature = JSON.stringify(entries);
  if (signature !== chatSignature) {
    chatSignature = signature;
    els.chatList.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "chat-empty";
      empty.textContent = "まだメッセージはありません。ひとこと送ってみよう。";
      els.chatList.append(empty);
    }
    for (const entry of entries) {
      const item = document.createElement("li"), meta = document.createElement("span"), text = document.createElement("p");
      item.className = entry.pid === myId ? "chat-message mine" : "chat-message";
      meta.className = "chat-message-meta";
      const time = Number(entry.sentAt) > 0 ? new Date(Number(entry.sentAt)).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "";
      meta.textContent = `${entry.pid === myId ? "自分" : String(entry.name || "参加者")} · ${time}`;
      text.className = "chat-message-text";
      text.textContent = String(entry.text || "");
      item.append(meta, text);
      els.chatList.append(item);
    }
    if (chatOpen && !document.hidden && (atBottom || newEntries.some(entry => entry.pid === myId))) readLatestChat();
  }
  updateChatUnread();
}

function toggleChat(open = !chatOpen) {
  if (!currentRoom || !roomCode) return;
  chatOpen = open;
  els.chatPanel.hidden = !open;
  els.chatToggle.setAttribute("aria-expanded", String(open));
  if (open) { renderChat(); readLatestChat(); }
  else { els.chatToggle.focus({ preventScroll: true }); updateChatUnread(); }
}

async function sendChat(event) {
  event.preventDefault();
  const text = Rules.cleanChatText(els.chatInput.value);
  if (!text) return;
  if (!chatDraft || chatDraft.text !== text) chatDraft = { id: makeId(), text };
  const message = chatDraft;
  const accepted = await runRoomAction((room, now, pid) => {
    room.chatMessages ||= {};
    if (room.chatMessages[message.id]) return true;
    room.chatSequence = Number(room.chatSequence || 0) + 1;
    room.chatMessages[message.id] = { pid, name: playerName(room, pid), text: message.text, sentAt: now, sequence: room.chatSequence };
    const oldest = Object.keys(room.chatMessages).sort((a, b) => Number(room.chatMessages[a].sequence || 0) - Number(room.chatMessages[b].sequence || 0) || Number(room.chatMessages[a].sentAt || 0) - Number(room.chatMessages[b].sentAt || 0) || a.localeCompare(b));
    for (const id of oldest.slice(0, -CHAT_LIMIT)) delete room.chatMessages[id];
    return true;
  }, { channel: "chat", settle: false, message: "メッセージを送信できませんでした。" });
  if (accepted) {
    if (Rules.cleanChatText(els.chatInput.value) === message.text) els.chatInput.value = "";
    if (chatDraft === message) chatDraft = null;
    if (chatOpen) readLatestChat();
  }
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function updateTimer() {
  reconcileDisconnectedPlayers();
  const presenceTick = Math.floor(serverNow() / 1000);
  if (currentRoom && presenceTick !== lastPresenceTick) {
    lastPresenceTick = presenceTick;
    els.memberCount.textContent = `${activeIds(currentRoom).length}/${MAX_PLAYERS}`;
    renderMemberList(els.memberList, currentRoom, false);
    renderMemberList(els.gameMemberList, currentRoom, true);
  }
  const game = currentRoom?.status === "playing" ? currentRoom.game : null;
  if (!game) return;
  if (!networkConnected || !presenceReady) {
    els.timer.textContent = "再接続中";
    els.timer.classList.add("reconnecting");
    return;
  }
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
  const remaining = game.deadline - serverNow();
  els.timer.textContent = formatRemaining(remaining);
  els.timer.classList.toggle("warning", remaining > 0 && remaining <= 10000);
  if (remaining <= 0) expireTurn();
}

function resetCanvas() {
  canvasRevision += 1;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  undoStack = [];
}

function draftKey() {
  const game = currentRoom?.game;
  if (!roomCode || !myId || currentRoom?.status !== "playing" || !game) return "";
  return `pictureShiritori:draft:${roomCode}:${myId}`;
}

function saveDraft() {
  const key = draftKey(), game = currentRoom?.game;
  if (!key || !game) return;
  const draw = game.phase === "draw" && game.artistId === myId;
  const guess = game.phase === "guess" && game.guesserId === myId;
  if (!draw && !guess) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({
      startedAt: currentRoom.startedAt || 0, roundId: currentRoom.roundId || "", turnNo: game.turnNo, phase: game.phase,
      word: draw ? els.secretAnswer.value : els.guessInput.value,
      image: draw ? canvas.toDataURL("image/jpeg", 0.78) : "",
    }));
  } catch (_) { /* Storage can be unavailable in private browsing. */ }
}

function restoreDraft() {
  const key = draftKey(), game = currentRoom?.game;
  if (!key) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!saved || String(saved.roundId || saved.startedAt || 0) !== String(currentRoom.roundId || currentRoom.startedAt || 0) || saved.turnNo !== game.turnNo || saved.phase !== game.phase) return;
    if (game.phase === "guess" && game.guesserId === myId) els.guessInput.value = saved.word || "";
    if (game.phase !== "draw" || game.artistId !== myId) return;
    els.secretAnswer.value = saved.word || "";
    if (!saved.image?.startsWith("data:image/")) return;
    const image = new Image(), revision = canvasRevision, turnKey = renderedTurnKey;
    image.onload = () => {
      if (revision !== canvasRevision || renderedTurnKey !== turnKey) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = saved.image;
  } catch (_) { /* Ignore corrupt or unavailable local drafts. */ }
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
  canvasRevision += 1;
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
  if (drawing) saveDraft();
  drawing = false;
  lastPoint = null;
}

function undoStroke() {
  const previous = undoStack.pop();
  if (previous) ctx.putImageData(previous, 0, 0);
  canvasRevision += 1;
  saveDraft();
}

function clearDrawing() {
  canvasRevision += 1;
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > 8) undoStack.shift();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveDraft();
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
els.secretAnswer.addEventListener("input", saveDraft);
els.guessInput.addEventListener("input", saveDraft);
els.chatToggle.addEventListener("click", () => toggleChat());
els.chatClose.addEventListener("click", () => toggleChat(false));
els.chatForm.addEventListener("submit", sendChat);
els.chatNewMessages.addEventListener("click", readLatestChat);
els.chatList.addEventListener("scroll", () => {
  if (chatOpen && !document.hidden && chatAtBottom()) markChatRead();
});
addEventListener("keydown", event => { if (event.key === "Escape" && chatOpen) toggleChat(false); });
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

function resumePage() {
  if (PREVIEW || !db || !roomCode || !myId || !networkConnected) return;
  if (resumePromise) return resumePromise;
  // Recheck server state before re-enabling actions after the page was frozen.
  if (!presenceReady) return recoverPresence();
  const code = roomCode, epoch = connectionEpoch;
  presenceReady = false;
  updateControls();
  setConnection("復帰中", "is-loading");
  const task = withTimeout(get(roomRef(code))).then(snapshot => {
    if (code !== roomCode || epoch !== connectionEpoch) return;
    if (!snapshot.exists()) { showToast("部屋が削除されました。"); clearSessionView(); return; }
    acceptRoomSnapshot(snapshot.val());
    if (!isPlayerConnected(currentRoom.players?.[myId])) recoverPresence();
    else { presenceReady = true; setConnection("接続済み"); renderRoom(); updateTimer(); }
  }).catch(() => {
    if (code === roomCode && epoch === connectionEpoch) { setConnection("再接続中", "is-loading"); recoverPresence(); }
  }).finally(() => {
    if (resumePromise === task) resumePromise = null;
  });
  resumePromise = task;
  return task;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveDraft();
  else { if (chatOpen) renderChat(); resumePage(); }
});
addEventListener("pagehide", saveDraft);
addEventListener("pageshow", resumePage);
addEventListener("focus", resumePage);
addEventListener("online", resumePage);

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
    onValue(ref(db, ".info/serverTimeOffset"), snapshot => {
      serverTimeOffset = Number(snapshot.val()) || 0;
    });
    onValue(ref(db, ".info/connected"), snapshot => {
      handleConnection(snapshot.val() === true);
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
