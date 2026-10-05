import { members, objects, adminApproved } from "./data.js";
import { jumpTo, deleteObjectAt } from "./app.js";
import { getObjectAt } from "./grid.js";

let current = null;
let filterText = "";
let inputEl = null;

export function openSheet(x, y) {
  current = { x, y };
  inputEl?.focus({preventScroll:true});
  document.getElementById("sheet").classList.add("show");
  buildList();
}

export function closeSheet() {
  document.getElementById("sheet").classList.remove("show");
}

function buildList() {
  const list = document.getElementById("list");

  if (!inputEl) {
    inputEl = document.createElement("input");
    inputEl.placeholder = "検索...";

    inputEl.style.width = "100%";
    inputEl.style.boxSizing = "border-box";
    inputEl.style.padding = "10px";
    inputEl.style.marginBottom = "10px";
    inputEl.style.borderRadius = "10px";

    inputEl.oninput = (e) => {
      filterText = e.target.value.toLowerCase();
      renderListOnly();
    };

    list.appendChild(inputEl);
  }

  inputEl.value = filterText;
  renderListOnly();
}

function renderListOnly() {
  const list = document.getElementById("list");

  while (list.children.length > 1) {
    list.removeChild(list.lastChild);
  }

  // 削除ボタン（管理者承認済み＆オブジェクトがある場合のみ）
  if (adminApproved && current) {
    const obj = getObjectAt(current.x, current.y);
    if (obj) {
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑 削除";
      deleteBtn.style.cssText = `
        width: 100%;
        margin-bottom: 10px;
        padding: 10px;
        background: #dc2626;
        color: #fff;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 14px;
      `;
      deleteBtn.onclick = async () => {
        if (confirm("削除する？")) {
          try { await deleteObjectAt(current.x, current.y); } catch (_) { return; }
          closeSheet();
        }
      };
      list.appendChild(deleteBtn);
    }
  }

  const rankOrder = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4, R0: 5 };

  // ===== 未配置（先頭） =====
  const unplaced = members.filter(m =>
    !objects.find(o => o.type === "player" && o.memberId === m.id) && String(m.name).toLowerCase().includes(filterText)
  );

  if (unplaced.length > 0) {
    const title = document.createElement("div");
    title.textContent = "未配置";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "4px";
    list.appendChild(title);

    unplaced
      .sort((a, b) => {
        const ra = rankOrder[a.rank] ?? 6;
        const rb = rankOrder[b.rank] ?? 6;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      })
      .forEach(m => {
        if (adminApproved) {
          addItem(list, "⚠ " + m.name, () => select("player", m.id));
        } else {
          const div = document.createElement("div");
          div.className = "item";
          div.textContent = "⚠ " + m.name;
          div.style.opacity = "0.6";
          div.style.cursor = "default";
          list.appendChild(div);
        }
      });

    addDivider(list);
  }

  // ===== 同盟員 =====
  const filtered = members
    .filter(m => m.name.toLowerCase().includes(filterText))
    .sort((a, b) => {
      const ra = rankOrder[a.rank] ?? 6;
      const rb = rankOrder[b.rank] ?? 6;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });

  let currentRank = null;

  filtered.forEach(m => {
    const rank = m.rank || "－";
    if (rank !== currentRank) {
      const header = document.createElement("div");
      header.textContent = rank;
      header.style.fontWeight = "bold";
      header.style.color = "#facc15";
      header.style.marginTop = currentRank === null ? "0" : "10px";
      header.style.marginBottom = "4px";
      list.appendChild(header);
      currentRank = rank;
    }

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.marginBottom = "6px";

    const placeBtn = document.createElement("button");
    placeBtn.type="button";
    placeBtn.className = "item";
    placeBtn.textContent = m.name;
    placeBtn.style.flex = "1";

    if (adminApproved) {
      placeBtn.onclick = () => {
        select("player", m.id);
      };
    } else {
      placeBtn.style.opacity = "0.6";
      placeBtn.style.cursor = "default";
    }

    row.appendChild(placeBtn);

    const obj = findMemberObject(m.id);
    if (obj) {
      const jumpBtn = document.createElement("button");
      jumpBtn.type="button";
      jumpBtn.setAttribute("aria-label",m.name+"の配置へ移動");
      jumpBtn.className = "item";
      jumpBtn.textContent = "📍";
      jumpBtn.style.width = "48px";
      jumpBtn.style.textAlign = "center";
      jumpBtn.onclick = () => {
        jumpTo(obj.x, obj.y + obj.size - 1);
        closeSheet();
      };
      row.appendChild(jumpBtn);
    }

    list.appendChild(row);
  });

  // 配置アイテム（管理者のみ）
  if (adminApproved) {
    addDivider(list);
    addItem(list, "🚩 旗", () => select("flag"));
    addItem(list, "🐻 熊罠", () => select("trap"));
    addItem(list, "🕌 本部", () => select("base"));
    addItem(list, "⛏️ 大型採取場", () => select("mine"));
    addItem(list, "🍕 同盟資源", () => select("food"));
  }
}

function findMemberObject(memberId) {
  return objects.find(o =>
    o.type === "player" &&
    String(o.memberId) === String(memberId)
  );
}

function addItem(parent, text, fn) {
  const div = document.createElement("button");
  div.type="button";
  div.className = "item";
  div.textContent = text;
  div.onclick = fn;
  parent.appendChild(div);
}

function addDivider(parent) {
  const div = document.createElement("div");
  div.style.margin = "10px 0";
  div.style.borderTop = "1px solid rgba(255,255,255,0.2)";
  parent.appendChild(div);
}

let onSelectCallback = null;

export function setOnSelectCallback(fn) {
  onSelectCallback = fn;
}

function select(type, memberId = null) {
  if (!onSelectCallback) return;
  onSelectCallback(type, memberId, current);
  closeSheet();
}

window.closeSheet = closeSheet;
