/* もふもふ美術館の「みんなで入る」：通信まわり。
   ・部屋は常に 1 つだけ（museum/room）、6 人まで。部屋のコードを知っている人だけが入れる
   ・既存ミニゲームと同じ Firebase Realtime Database を使う（絵しりとりと同じ設定・同じ公開ルール）
   ・通信が切れた人は、サーバー側の onDisconnect で自動的に部屋から消える
   shortcut: コードの照合も当たり判定も各自の端末で行う（同盟内で遊ぶ前提）。不正対策が要るならサーバー側の検証へ移す */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, remove, onValue, onDisconnect, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyBmPQX35nYTBzJhvU5Cu4lBifpmzQW2PLk",
  authDomain: "babanuki-5febb.firebaseapp.com",
  databaseURL: "https://babanuki-5febb-default-rtdb.firebaseio.com",
  projectId: "babanuki-5febb",
  storageBucket: "babanuki-5febb.firebasestorage.app",
  messagingSenderId: "918572931204",
  appId: "1:918572931204:web:a1e2db96dda922b4538ad1",
});
const ROOM_PATH = "museum/room";
export const MAX_PLAYERS = 6;
const TIMEOUT_MS = 15000;

export const cleanName = v => String(v || "").replace(/[<>\n\r]/g, "").trim().slice(0, 12);
export const cleanCode = v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";                 // 読み間違えやすい 0/O・1/I は使わない
  return [...crypto.getRandomValues(new Uint8Array(6))].map(b => alphabet[b % alphabet.length]).join("");
}
const fail = message => Object.assign(new Error(message), { userMessage: message });
const withTimeout = promise => Promise.race([promise, new Promise((_, ng) => setTimeout(() => ng(fail("接続に時間がかかっています。通信状態を確認して、もう一度お試しください。")), TIMEOUT_MS))]);

/* 部屋へ入れるかを決める（通信なしで確かめられるよう、Firebase に依存しない形にしてある）。
   戻り値：{ room } で書き込む／{ error } で中止。room が null のときは、まだサーバーの内容を知らない可能性がある */
export function decideEntry(room, { create, code, pid, name }) {
  const players = room?.players || {}, count = Object.keys(players).length;
  if (create) {
    if (count) return { error: "すでに部屋があります。部屋のコードを教えてもらって入ってください。" };
    room = { code, createdAt: Date.now(), players: {} };
  } else {
    if (!room) return { room: null };                                  // 空のまま書いてサーバーの本当の内容を確かめさせる
    if (room.code !== code) return { error: "その部屋は見つかりません。コードを確かめてください。" };
    if (count >= MAX_PLAYERS) return { error: `満員です（${MAX_PLAYERS}人まで）。` };
    room = { ...room, players: { ...players } };
  }
  // チームは人数の少ない方へ（同数なら 0）
  const reds = Object.values(room.players).filter(q => q.team === 0).length;
  room.players[pid] = { name, team: reds * 2 <= Object.keys(room.players).length ? 0 : 1, s: [0, 0, 0, 0, 0] };
  return { room };
}

let db, pid, myRef, stopListening;

/* 部屋を作る（create: true）か、コードで入る。onRoom(code, players, 自分の id) は部屋の内容が変わるたびに呼ばれ、
   自分が部屋から消えたら onGone() が呼ばれる。失敗時は userMessage つきのエラーを投げる */
export async function enter({ create, code, name, onRoom, onGone }) {
  if (!db) { db = getDatabase(initializeApp(firebaseConfig, "museum-room")); pid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  if (create) code = makeCode();
  const roomRef = ref(db, ROOM_PATH);
  myRef = ref(db, `${ROOM_PATH}/players/${pid}`);
  await withTimeout(onDisconnect(myRef).remove());                     // 先に「切れたら消す」を予約してから入る
  let error = "";
  const result = await withTimeout(runTransaction(roomRef, room => {
    const d = decideEntry(room, { create, code, pid, name });
    error = d.error || "";
    return d.error ? undefined : d.room;
  }));
  if (!result.committed || !result.snapshot.val()?.players?.[pid]) {
    onDisconnect(myRef).cancel().catch(() => {});
    throw fail(error || "その部屋は見つかりません。コードを確かめてください。");
  }
  stopListening = onValue(roomRef, snap => {
    const room = snap.val(), me = room?.players?.[pid];
    if (!me?.name || room.code !== code) { leave(); onGone(); return; }  // 通信が切れて消された／部屋が作り直された
    onRoom(room.code, room.players, pid);
  });
  return { code };
}

/* 自分の位置などを送る（s = [x, y, z, 向き, 歩いているか]） */
export function send(s) {
  if (myRef && stopListening) set(ref(db, `${ROOM_PATH}/players/${pid}/s`), s).catch(() => {});
}

export function leave() {
  if (!myRef) return;
  stopListening?.(); stopListening = null;
  onDisconnect(myRef).cancel().catch(() => {});
  remove(myRef).catch(() => {});
  myRef = null;
}
