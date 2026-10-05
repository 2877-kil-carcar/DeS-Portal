import { db, authReady, PREVIEW } from "./firebase.js";

import {
  doc,
  setDoc,
  writeBatch,
  deleteDoc,
  onSnapshot,
  collection
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { GRID_COLS, GRID_ROWS, members, setObjects, objects, setMembers, adminApproved, setAdminApproved } from "./data.js";
import { getObjectAt, canPlace } from "./grid.js";
import * as ui from "./ui.js";

const grid = document.getElementById("grid");
const wrapper = document.getElementById("gridWrapper");
const adminPwInput = document.getElementById("adminPwInput");
const adminApproveBtn = document.getElementById("adminApproveBtn");
const memberLink = document.getElementById("memberLink");

let activeCellPos = null;
let saving = false;
const status = document.getElementById('syncStatus');
function showStatus(message, error=false) { status.textContent=message;status.classList.toggle('error',error); }
function updateMapHeight() { document.documentElement.style.setProperty('--map-top',(document.getElementById('topBar').offsetHeight+28)+'px'); }
new ResizeObserver(updateMapHeight).observe(document.getElementById('topBar'));
function syncScale() { grid.style.transform='scale('+scale+')';const stage=document.getElementById('gridStage');stage.style.width=(1792*scale)+'px';stage.style.height=(1015*scale)+'px';document.getElementById('zoomReset').textContent=Math.round(scale*100)+'%'; }
function zoomTo(next) { const old=scale;scale=Math.max(.15,Math.min(3,next));const cx=wrapper.clientWidth/2,cy=wrapper.clientHeight/2;syncScale();wrapper.scrollLeft=(wrapper.scrollLeft+cx)*scale/old-cx;wrapper.scrollTop=(wrapper.scrollTop+cy)*scale/old-cy; }
document.getElementById('zoomIn').onclick=()=>zoomTo(scale+.15);
document.getElementById('zoomOut').onclick=()=>zoomTo(scale-.15);
document.getElementById('zoomReset').onclick=()=>zoomTo(1);
document.getElementById('mapAll').onclick=()=>{zoomTo(Math.min(wrapper.clientWidth/1792,wrapper.clientHeight/1015));wrapper.scrollTo(0,0);};
document.getElementById('findMember').onclick=()=>ui.openSheet(activeCellPos?.x||1,activeCellPos?.y||2);
document.addEventListener('keydown',e=>{if(e.key==='Escape')ui.closeSheet();});
let flashCellPos = null;
let scale = 1;
let lastDist = null;

const ADMIN_PASSWORD = "des";

// ==========================
// 管理者承認
// ==========================
function toggleAdmin() {
  if (PREVIEW) { setAdminApproved(!adminApproved); adminApproveBtn.textContent=adminApproved?'試し置き中':'試し置き';render();return; }
  if (adminApproved) {
    setAdminApproved(false);
    adminApproveBtn.textContent = "編集を許可";
    adminApproveBtn.style.background = "";
    adminPwInput.value = "";
    sessionStorage.removeItem("adminApproved");
  } else {
    const input = adminPwInput.value;
    if (input !== ADMIN_PASSWORD) {
      alert("パスワードが違います");
      return;
    }
    setAdminApproved(true);
    adminApproveBtn.textContent = "編集を終了";
    adminApproveBtn.style.background = "#16a34a";
    adminPwInput.value = "";
    sessionStorage.setItem("adminApproved", "true");
  }
  render();
}

adminApproveBtn.addEventListener("click", toggleAdmin);
adminApproveBtn.addEventListener("touchend", (e) => {
  e.preventDefault();
  toggleAdmin();
});

memberLink.addEventListener("click", (e) => {
  if (!adminApproved) {
    e.preventDefault();
    alert("管理者承認が必要です");
  }
});

memberLink.addEventListener("touchend", (e) => {
  if (!adminApproved) {
    e.preventDefault();
    alert("管理者承認が必要です");
  }
});

// ==========================
// 初期化
// ==========================
function initGrid() {
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      grid.appendChild(cell);
    }
  }
  render();
}

// ==========================
// 配置処理
// ==========================
ui.setOnSelectCallback(async (type, memberId, pos) => {
  if (!adminApproved || saving) return;
  let plan;
  try { plan=window.WOS_PLACEMENT.planPlacement(objects,type,memberId,pos); }
  catch(err) { alert(err.message);return; }
  if(type==='player'&&!members.some(m=>m.id===memberId)){alert('同盟員情報が更新されています。読み直してください。');return;}
  saving=true;showStatus(PREVIEW?'試し置きを更新中…':'共有配置を保存中…');
  try {
    const next={...plan.next,updatedAt:Date.now()};
    if(PREVIEW){setObjects([...objects.filter(o=>o!==plan.previous),next]);render();}
    else {
      // Validate BEFORE deleting. Commit old-origin deletion and new-origin write atomically.
      const batch=writeBatch(db);
      if(plan.previous)batch.delete(doc(db,'objects',plan.previous.x+'_'+plan.previous.y));
      batch.set(doc(db,'objects',next.x+'_'+next.y),next);
      await batch.commit();
    }
    showStatus(PREVIEW?'表示確認モード：試し置きは本番に保存されません':'配置を保存しました');
  } catch(err){showStatus('保存できませんでした。通信・権限を確認してください。',true);alert('保存に失敗しました。元の配置は削除されていません。');}
  finally { saving=false; }
});

// ==========================
// 描画
// ==========================
function render() {
  const cells = grid.children;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const x = i % GRID_COLS;
    const y = Math.floor(i / GRID_COLS);

    cell.className = "cell";
    cell.innerHTML = "";

    // ==========================
    // 座標表示
    // ==========================
    if (x === 0 && y === 0) {
      cell.textContent = "Y\\X";
      cell.classList.add("coord-cell");
      continue;
    }

    if (y === 0) {
      const xVal = 411 + x;
      cell.textContent = xVal;
      cell.classList.add("coord-cell");
      continue;
    }

    if (x === 0) {
      const yVal = 659 - y;
      cell.textContent = yVal;
      cell.classList.add("coord-cell");
      continue;
    }

    cell.onclick = async (e) => {
      if (performance.now() - lastPanAt < 350) return;
      activeCellPos = { x, y };
      render();
      ui.openSheet(x, y);
    };

    const obj = getObjectAt(x, y);

    if (obj) {
      if (obj.type === "player") {
        const m = members.find(m => m.id === obj.memberId);
        if (!m) continue;

        const isTopLeft     = x === obj.x     && y === obj.y;
        const isTopRight    = x === obj.x + 1 && y === obj.y;
        const isBottomLeft  = x === obj.x     && y === obj.y + 1;
        const isBottomRight = x === obj.x + 1 && y === obj.y + 1;

        if (isTopLeft) {
          // 左上 → 名前
          const nameDiv = document.createElement("div");
          nameDiv.className = "cell-name";
          nameDiv.textContent = m.name;
          cell.appendChild(nameDiv);
        } else if (isTopRight) {
          // 右上 → 溶鉱炉
          const furnaceDiv = document.createElement("div");
          furnaceDiv.className = "cell-furnace-center";
          furnaceDiv.textContent = m.furnace;
          cell.appendChild(furnaceDiv);
        } else if (isBottomLeft) {
          // 左下 → 座標2行
          const coordDiv = document.createElement("div");
          coordDiv.className = "cell-furnace-center";
          coordDiv.style.lineHeight = "1.3";
          coordDiv.innerHTML = `X${411 + obj.x}<br>Y${659 - (obj.y + 1)}`;
          cell.appendChild(coordDiv);
        } else if (isBottomRight) {
          // 右下 → 階級
          const rankDiv = document.createElement("div");
          rankDiv.className = "cell-furnace-center";
          rankDiv.textContent = m.rank || "";
          cell.appendChild(rankDiv);
        }

        if (String(m.furnace || "").startsWith("FC")) {
          const lv = parseInt(String(m.furnace).replace("FC", ""), 10);
          cell.classList.add(`fc${Math.min(lv, 10)}`);
        } else {
          cell.classList.add("player-normal");
        }

      } else if (obj.type === "flag") {
        cell.textContent = "🚩";
      } else if (obj.type === "trap") {
        cell.textContent = "🐻";
      } else if (obj.type === "base") {
        cell.textContent = "🕌";
      } else if (obj.type === "mine") {
        cell.textContent = "⛏️";
      } else if (obj.type === "food") {
        cell.textContent = "🍕";
      }

      drawMultiBorder(cell, obj, x, y);
    }

    if (activeCellPos && activeCellPos.x === x && activeCellPos.y === y) {
      cell.classList.add("active");
    }

    if (flashCellPos && flashCellPos.x === x && flashCellPos.y === y) {
      cell.classList.add("flash");
    }
  }
  adjustTextSize();
  updateCurrentPos();
  updateCurrentPosTop();
}

// ==========================
// 削除
// ==========================
export async function deleteObjectAt(x, y) {
  if(!adminApproved||saving)return;
  const obj=getObjectAt(x,y);if(!obj)return;
  saving=true;
  try {if(PREVIEW){setObjects(objects.filter(o=>o!==obj));render();}else{await deleteDoc(doc(db,'objects',obj.x+'_'+obj.y));}showStatus(PREVIEW?'表示確認モード：試し置きを削除しました':'配置を削除しました');}
  catch(err){showStatus('削除できませんでした。通信・権限を確認してください。',true);throw err;}
  finally{saving=false;}
}

// ==========================
// 複数マス枠
// ==========================
function drawMultiBorder(cell, obj, x, y) {
  const isTop = y === obj.y;
  const isBottom = y === obj.y + obj.size - 1;
  const isLeft = x === obj.x;
  const isRight = x === obj.x + obj.size - 1;

  if (isTop) cell.classList.add("border-top");
  if (isBottom) cell.classList.add("border-bottom");
  if (isLeft) cell.classList.add("border-left");
  if (isRight) cell.classList.add("border-right");
}

// ==========================
// Firestore同期
// ==========================
async function connect() {
 if(PREVIEW){
   setMembers([{id:'demo-a',name:'サンプル A',furnace:'FC5',rank:'R4'},{id:'demo-b',name:'サンプル B',furnace:'30',rank:'R3'}]);
   setObjects([{type:'trap',x:7,y:5,size:3},{type:'trap',x:20,y:13,size:3},{type:'base',x:13,y:8,size:3},{type:'player',memberId:'demo-a',x:5,y:7,size:2},{type:'player',memberId:'demo-b',x:10,y:8,size:2}]);
   status.classList.add('preview');showStatus('表示確認モード：本番には接続・保存しません');adminPwInput.hidden=true;adminApproveBtn.textContent='試し置き';memberLink.href='./members.html?preview=1';render();return;
 }
 try { await authReady;
  const failed=()=>showStatus('共有配置を読み込めません。通信またはアクセス権限を確認してください。',true);
  onSnapshot(collection(db,'objects'),snap=>{setObjects(snap.docs.map(d=>d.data()));updateGlobalUpdatedAt();render();showStatus('共有配置と同期中 · 閲覧のみ（編集には承認が必要）');},failed);
  onSnapshot(collection(db,'members'),snap=>{setMembers(snap.docs.map(d=>({...d.data(),id:d.id})));render();},failed);
 } catch(err){showStatus('接続できません。通信・Firebaseの認証設定を確認してください。',true);}
}

// ==========================
// ジャンプ
// ==========================
export function jumpTo(x, y) {

  const cellSize = 34 + 3;
  const targetX = x * cellSize * scale;
  const targetY = y * cellSize * scale;

  const viewWidth = wrapper.clientWidth;
  const viewHeight = wrapper.clientHeight;

  const scrollX = targetX - viewWidth / 2 + (cellSize * scale) / 2;
  const scrollY = targetY - viewHeight / 2 + (cellSize * scale) / 2;

  activeCellPos = { x, y };
  flashCellPos = { x, y };
  render();

  wrapper.scrollTo({
    left: scrollX,
    top: scrollY,
    behavior: "smooth"
  });

  setTimeout(() => {
    flashCellPos = null;
    render();
  }, 800);
}

// ==========================
// ズーム
// ==========================
wrapper.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return; // 2本指スクロール → ネイティブスクロールに任せる

  e.preventDefault();

  const rect = wrapper.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const prevScale = scale;
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  scale = Math.min(Math.max(0.5, scale + delta), 2);

  const ratio = scale / prevScale;

  wrapper.scrollLeft = (wrapper.scrollLeft + mouseX) * ratio - mouseX;
  wrapper.scrollTop = (wrapper.scrollTop + mouseY) * ratio - mouseY;

  syncScale();
}, { passive: false });

// 1本指パン用
let panStartX = 0, panStartY = 0;
let panScrollLeft = 0, panScrollTop = 0;
let isSingleTouch = false;
let lastPanAt = -1000;

// ピンチ zoom rAF 用
let pendingScrollLeft = null;
let pendingScrollTop  = null;
let rafId = null;

wrapper.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    isSingleTouch = true;
    panStartX    = e.touches[0].clientX;
    panStartY    = e.touches[0].clientY;
    panScrollLeft = wrapper.scrollLeft;
    panScrollTop  = wrapper.scrollTop;
  } else if (e.touches.length === 2) {
    isSingleTouch = false;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastDist = Math.sqrt(dx * dx + dy * dy);
    pendingScrollLeft = null;
    pendingScrollTop  = null;
  }
}, { passive: true });

wrapper.addEventListener("touchmove", (e) => {
  e.preventDefault();

  if (e.touches.length > 1 || Math.abs(e.touches[0].clientX-panStartX)>6 || Math.abs(e.touches[0].clientY-panStartY)>6) lastPanAt=performance.now();
  // 1本指：パン
  if (e.touches.length === 1 && isSingleTouch) {
    wrapper.scrollLeft = panScrollLeft - (e.touches[0].clientX - panStartX);
    wrapper.scrollTop  = panScrollTop  - (e.touches[0].clientY - panStartY);
    return;
  }

  // 2本指：ピンチズーム
  if (e.touches.length !== 2 || !lastDist) return;

  const t0 = e.touches[0];
  const t1 = e.touches[1];
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    const prevScale = scale;
    scale = Math.min(Math.max(0.15, scale * (dist / lastDist)), 3);
    const ratio = scale / prevScale;

    const rect = wrapper.getBoundingClientRect();
    const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
    const midY = (t0.clientY + t1.clientY) / 2 - rect.top;

    // 前フレームの未適用スクロール値を引き継ぐ
    const baseLeft = pendingScrollLeft ?? wrapper.scrollLeft;
    const baseTop  = pendingScrollTop  ?? wrapper.scrollTop;
    pendingScrollLeft = (baseLeft + midX) * ratio - midX;
    pendingScrollTop  = (baseTop  + midY) * ratio - midY;

    // 1フレームに1回だけDOM更新
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      syncScale();
      wrapper.scrollLeft = pendingScrollLeft;
      wrapper.scrollTop  = pendingScrollTop;
      pendingScrollLeft = null;
      pendingScrollTop  = null;
      rafId = null;
    });
  }

  lastDist = dist;
}, { passive: false });

wrapper.addEventListener("touchend", (e) => {
  if (e.touches.length < 2) lastDist = null;
  if (e.touches.length === 0) isSingleTouch = false;
});

function adjustTextSize() {
  const names = document.querySelectorAll(".cell-name");

  names.forEach(el => {
    let size = 9;
    el.style.fontSize = size + "px";

    while (el.scrollHeight > el.clientHeight && size > 6) {
      size--;
      el.style.fontSize = size + "px";
    }
  });
}

// 選択セルにある配置の最終更新日時（なければ null）
function getSelectedUpdatedAt() {
  if (!activeCellPos) return null;
  const obj = getObjectAt(activeCellPos.x, activeCellPos.y);
  if (!obj || !obj.updatedAt) return null;
  return obj.updatedAt;
}

// short=true のとき年を省略（右上バー用、スマホ幅で折り返さないように）
function formatDateTime(ts, short = false) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, "0");
  const md = `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return short ? md : `${d.getFullYear()}/${md}`;
}

// 全配置の中で最も新しい updatedAt を見出し横に表示
function updateGlobalUpdatedAt() {
  const el = document.getElementById("globalUpdatedAt");
  if (!el) return;

  let latest = 0;
  for (const obj of objects) {
    if (obj.updatedAt && obj.updatedAt > latest) latest = obj.updatedAt;
  }

  el.textContent = latest ? `最終更新 ${formatDateTime(latest)}` : "";
}

function updateCurrentPos() {
  const el = document.getElementById("currentPos");
  if (!el) return;

  if (!activeCellPos) {
    el.textContent = "";
    return;
  }

  const x = activeCellPos.x;
  const y = activeCellPos.y;

  const xVal = 411 + x;
  const yVal = 659 - y;

  el.textContent = `現在地 X:${xVal}  Y:${yVal}`;

  const updatedAt = getSelectedUpdatedAt();
  if (updatedAt) {
    const upd = document.createElement("div");
    upd.className = "updated-at";
    upd.textContent = `最終更新 ${formatDateTime(updatedAt)}`;
    el.appendChild(upd);
  }
}

function updateCurrentPosTop() {
  const el = document.getElementById("currentPosTop");
  if (!el) return;

  if (!activeCellPos) {
    el.textContent = "";
    return;
  }

  const x = activeCellPos.x;
  const y = activeCellPos.y;

  const xVal = 411 + x;
  const yVal = 659 - y;

  el.textContent = `X:${xVal}  Y:${yVal}`;

  const updatedAt = getSelectedUpdatedAt();
  if (updatedAt) {
    const upd = document.createElement("div");
    upd.className = "updated-at";
    upd.textContent = `更新 ${formatDateTime(updatedAt, true)}`;
    el.appendChild(upd);
  }
}
// ==========================
initGrid();
syncScale();
connect();
