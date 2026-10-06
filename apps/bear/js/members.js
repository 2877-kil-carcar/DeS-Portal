import { setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

window._docs = [];

import { db, authReady, PREVIEW } from "./firebase.js";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const nameInput = document.getElementById("name");
const rankSelect = document.getElementById("rank");
const list = document.getElementById("memberList");
const membersForm = document.getElementById("membersForm");
const addBtn = document.querySelector("#membersForm button");
const nameDropdown = document.getElementById("nameDropdown");
const memberBackLink = document.getElementById("memberBackLink");

const isAdmin = !PREVIEW && sessionStorage.getItem("adminApproved") === "true";

memberBackLink.href = PREVIEW ? "./index.html?preview=1" : "./index.html";

let memberCount = 0;

if (!isAdmin) {
  membersForm.style.display = "none";
}

const dropdownRankOrder = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4, R0: 5 };

// ドロップダウン全体でスクロール中かを追跡
let dropdownScrolled = false;
let dropdownTouchStartY = 0;
let blurTimer = null;

nameDropdown.addEventListener("touchstart", (e) => {
  clearTimeout(blurTimer);
  dropdownScrolled = false;
  dropdownTouchStartY = e.touches[0].clientY;
}, { passive: true });

nameDropdown.addEventListener("touchmove", (e) => {
  if (Math.abs(e.touches[0].clientY - dropdownTouchStartY) > 5) {
    dropdownScrolled = true;
  }
}, { passive: true });

function buildNameDropdown(filter) {
  nameDropdown.innerHTML = "";

  const filtered = window._docs
    .filter(d => filter === "" || d.data().name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      const ra = dropdownRankOrder[a.data().rank] ?? 6;
      const rb = dropdownRankOrder[b.data().rank] ?? 6;
      if (ra !== rb) return ra - rb;
      return a.data().name.localeCompare(b.data().name);
    });

  if (filtered.length === 0) {
    nameDropdown.classList.remove("show");
    return;
  }

  const guide = document.createElement("div");
  guide.className = "name-dropdown-guide";
  guide.textContent = "登録済み候補 · 選択すると更新";
  nameDropdown.appendChild(guide);

  let currentRank = null;
  filtered.forEach(docSnap => {
    const d = docSnap.data();
    const rank = d.rank || "－";

    if (rank !== currentRank) {
      const header = document.createElement("div");
      header.textContent = rank;
      header.className = "name-dropdown-header";
      nameDropdown.appendChild(header);
      currentRank = rank;
    }

    const item = document.createElement("div");
    item.textContent = d.name;
    item.className = "name-dropdown-item";

    // PC: mousedown（blur前に発火させるため）
    item.onmousedown = (e) => {
      e.preventDefault();
      selectMember(docSnap);
    };

    // スマホ: スクロール中でなければ選択
    item.addEventListener("touchend", (e) => {
      if (!dropdownScrolled) {
        e.preventDefault();
        selectMember(docSnap);
      }
    }, { passive: false });

    nameDropdown.appendChild(item);
  });

  nameDropdown.classList.add("show");
}

function selectMember(docSnap) {
  const d = docSnap.data();
  nameInput.value = d.name;
  rankSelect.value = d.rank || "R5";
  addBtn.textContent = "更新";
  nameDropdown.classList.remove("show");
}

nameInput.addEventListener("focus", () => {
  clearTimeout(blurTimer);
  buildNameDropdown(nameInput.value.trim());
});

nameInput.addEventListener("input", () => {
  const name = nameInput.value.trim();
  buildNameDropdown(name);

  const existing = window._docs.find(d => d.data().name === name);
  if (existing) {
    const d = existing.data();
    rankSelect.value = d.rank || "R5";
    addBtn.textContent = "更新";
  } else {
    addBtn.textContent = "追加";
  }
});

nameInput.addEventListener("blur", () => {
  blurTimer = setTimeout(() => nameDropdown.classList.remove("show"), 300);
});

async function addMember() {
  if (!isAdmin) return;

  const name = nameInput.value.trim();
  const rank = rankSelect.value;

  if (!name) {
    alert("名前必須");
    return;
  }

  const existing = window._docs.find(d => d.data().name === name);

  if (existing) {
    // 既存メンバーの更新（名前以外）
    await setDoc(doc(db, "members", existing.id), {
      name: existing.data().name,
      rank,
      createdAt: existing.data().createdAt
    });
    nameInput.value = "";
    addBtn.textContent = "追加";
    return;
  }

  // 新規登録
  if (memberCount >= 100) {
    alert("100人まで");
    return;
  }

  await addDoc(collection(db, "members"), {
    name,
    rank,
    createdAt: Date.now()
  });

  nameInput.value = "";
}

const rankOrder = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4, R0: 5 };

let connectionReady=false;
try { await authReady; connectionReady=true; }
catch (_) { list.textContent='同盟員を読み込めません。通信・認証設定を確認してください。'; }
const q = collection(db, "members");

if (!PREVIEW && connectionReady) onSnapshot(q, snap => {
  window._docs = snap.docs;
  memberCount = snap.size;

  // ドロップダウンを最新状態に保つ（表示中なら再描画）
  if (nameDropdown.classList.contains("show")) {
    buildNameDropdown(nameInput.value.trim());
  }

  list.innerHTML = "";

  const sorted = snap.docs.sort((a, b) => {
    const ra = rankOrder[a.data().rank] ?? 6;
    const rb = rankOrder[b.data().rank] ?? 6;
    if (ra !== rb) return ra - rb;
    return a.data().name.localeCompare(b.data().name);
  });

  let currentRank = null;

  sorted.forEach(docSnap => {
    const d = docSnap.data();
    const rank = d.rank || "－";

    if (rank !== currentRank) {
      const header = document.createElement("div");
      header.textContent = rank;
      header.style.fontWeight = "bold";
      header.style.color = "#facc15";
      header.style.marginTop = currentRank === null ? "4px" : "12px";
      header.style.marginBottom = "4px";
      list.appendChild(header);
      currentRank = rank;
    }

    const div = document.createElement("div");
    div.style.padding = "6px 8px";
    div.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
    div.style.cursor = isAdmin ? "pointer" : "default";
    div.textContent = d.name;

    if (isAdmin) {
      div.onclick = async () => {
        if (confirm("削除する？")) {
          try { await deleteDoc(doc(db, "members", docSnap.id)); }
          catch (_) { alert('削除できませんでした。通信・権限を確認してください。'); }
        }
      };
    }

    list.appendChild(div);
  });
}, () => { list.textContent='同盟員を読み込めません。通信・権限を確認してください。'; });

window.addMember = async () => {
  if(addBtn.disabled || !connectionReady)return;
  addBtn.disabled=true;
  try { await addMember(); }
  catch (_) { alert('保存できませんでした。入力内容は残しています。通信・権限を確認してください。'); }
  finally { addBtn.disabled=false; }
};
if(PREVIEW){list.textContent="表示確認モード：同盟員の読込・登録は無効です。";}
