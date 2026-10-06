import { members, objects, adminApproved } from "./data.js";
import { getObjectAt } from "./grid.js";

const sheet = document.getElementById("sheet");
const list = document.getElementById("list");
const search = document.getElementById("memberSearch");
const summary = document.getElementById("selectionSummary");
const title = document.getElementById("sheetTitle");
const tabs = [...document.querySelectorAll(".sheet-tabs [data-tab]")];
const rankOrder = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4, R0: 5 };
const facilityLabels = { flag: "🚩 旗", trap: "🐻 熊罠", base: "🕌 本部", mine: "⛏️ 大型採取場", food: "🍕 同盟資源" };

let current = null;
let activeTab = "unplaced";
let filterText = "";
let onSelectCallback = null;
let onArmCallback = null;
let jumpHandler = null;
let deleteHandler = null;

export function openSheet(x = null, y = null, tab = null) {
  current = Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
  if (tab) activeTab = tab;
  sheet.classList.add("show");
  sheet.setAttribute("aria-hidden", "false");
  build();
}

export function openMemberSearch() {
  activeTab = "placed";
  openSheet(null, null, "placed");
  setTimeout(() => search.focus({ preventScroll: true }), 50);
}

export function closeSheet() {
  sheet.classList.remove("show");
  sheet.setAttribute("aria-hidden", "true");
}

export function refreshSheet() {
  if (sheet.classList.contains("show")) build();
}

tabs.forEach(button => button.addEventListener("click", () => {
  activeTab = button.dataset.tab;
  build();
}));
search.addEventListener("input", event => {
  filterText = event.target.value.trim().toLowerCase();
  renderList();
});
document.getElementById("sheetClose").addEventListener("click", closeSheet);

function build() {
  title.textContent = current ? "選択位置の詳細" : "同盟員・施設を探す";
  renderSummary();
  tabs.forEach(button => {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  search.hidden = activeTab === "facilities";
  search.value = filterText;
  renderList();
}

function renderSummary() {
  summary.replaceChildren();
  if (!current) {
    summary.className = "selection-summary muted";
    summary.textContent = "一覧から配置を探せます。地図のマスをタップすると、その位置の詳細を表示します。";
    return;
  }
  const obj = getObjectAt(current.x, current.y);
  const coord = coordinates(current.x, current.y);
  summary.className = "selection-summary";
  const heading = document.createElement("strong");
  const detail = document.createElement("span");
  if (!obj) {
    heading.textContent = "空きマス";
    detail.textContent = coord;
    summary.append(heading, detail);
    return;
  }
  if (obj.type === "player") {
    const member = members.find(item => String(item.id) === String(obj.memberId));
    heading.textContent = member?.name || "登録情報のない同盟員";
    detail.textContent = [member?.rank, coordinates(obj.x, obj.y + obj.size - 1)].filter(Boolean).join(" · ");
  } else {
    heading.textContent = facilityLabels[obj.type] || obj.type;
    detail.textContent = coordinates(obj.x, obj.y + obj.size - 1);
  }
  summary.append(heading, detail);
  if (obj.updatedAt) {
    const updated = document.createElement("small");
    updated.textContent = "最終更新 " + formatDateTime(obj.updatedAt);
    summary.appendChild(updated);
  }
  const actions = document.createElement("div");
  actions.className = "summary-actions";
  const jump = actionButton("地図で表示", () => { jumpHandler?.(obj.x, obj.y + obj.size - 1); closeSheet(); });
  actions.appendChild(jump);
  if (adminApproved) {
    const label = obj.type === "player"
      ? (members.find(item => String(item.id) === String(obj.memberId))?.name || "同盟員")
      : (facilityLabels[obj.type] || "施設");
    actions.appendChild(actionButton("移動", () => arm(obj.type, obj.memberId || null, label, obj)));
    const remove = actionButton("削除", async () => {
      if (!confirm(label + "を削除しますか？")) return;
      try { await deleteHandler?.(current.x, current.y); closeSheet(); } catch (_) {}
    });
    remove.classList.add("danger");
    actions.appendChild(remove);
  }
  summary.appendChild(actions);
}

function renderList() {
  list.replaceChildren();
  if (activeTab === "unplaced") renderUnplaced();
  else if (activeTab === "placed") renderPlaced();
  else renderFacilities();
}

function renderUnplaced() {
  const rows = sortedMembers().filter(member => !findMemberObject(member.id));
  if (!rows.length) return emptyState(filterText ? "該当する未配置の同盟員はいません" : "全員配置済みです");
  rows.forEach(member => list.appendChild(memberRow(member, false)));
}

function renderPlaced() {
  const rows = sortedMembers().filter(member => findMemberObject(member.id));
  if (!rows.length) return emptyState(filterText ? "該当する配置済みの同盟員はいません" : "配置済みの同盟員はいません");
  rows.forEach(member => list.appendChild(memberRow(member, true)));
}

function renderFacilities() {
  Object.entries(facilityLabels).forEach(([type, label]) => {
    const row = document.createElement("div");
    row.className = "list-row";
    const text = document.createElement("div");
    text.className = "row-copy";
    const strong = document.createElement("strong");
    strong.textContent = label;
    const count = objects.filter(obj => obj.type === type).length;
    const small = document.createElement("small");
    small.textContent = count ? "配置済み " + count : "未配置";
    text.append(strong, small);
    row.appendChild(text);
    if (adminApproved) {
      row.appendChild(actionButton(current ? "ここに配置" : "配置先を選ぶ", () => choose(type, null, label)));
    }
    const first = objects.find(obj => obj.type === type);
    if (first) row.appendChild(actionButton("表示", () => { jumpHandler?.(first.x, first.y + first.size - 1); closeSheet(); }));
    list.appendChild(row);
  });
  if (!adminApproved) emptyState("施設の追加・移動は編集モードで利用できます");
}

function memberRow(member, placed) {
  const row = document.createElement("div");
  row.className = "list-row";
  const copy = document.createElement("div");
  copy.className = "row-copy";
  const strong = document.createElement("strong");
  strong.textContent = member.name;
  const small = document.createElement("small");
  small.textContent = member.rank || "階級なし";
  copy.append(strong, small);
  row.appendChild(copy);
  if (adminApproved) row.appendChild(actionButton(current ? "ここに配置" : (placed ? "移動" : "配置先を選ぶ"), () => choose("player", member.id, member.name)));
  if (placed) {
    const obj = findMemberObject(member.id);
    row.appendChild(actionButton("表示", () => { jumpHandler?.(obj.x, obj.y + obj.size - 1); closeSheet(); }));
  }
  return row;
}

function choose(type, memberId, label) {
  if (current && onSelectCallback) {
    onSelectCallback(type, memberId, current);
    closeSheet();
  } else {
    arm(type, memberId, label);
  }
}

function arm(type, memberId, label, previous = null) {
  if (!onArmCallback) return;
  onArmCallback(type, memberId, label, previous);
  closeSheet();
}

function sortedMembers() {
  return members
    .filter(member => String(member.name || "").toLowerCase().includes(filterText))
    .sort((a, b) => (rankOrder[a.rank] ?? 6) - (rankOrder[b.rank] ?? 6) || String(a.name).localeCompare(String(b.name), "ja"));
}

function findMemberObject(memberId) {
  return objects.find(obj => obj.type === "player" && String(obj.memberId) === String(memberId));
}

function actionButton(label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function emptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  list.appendChild(empty);
}

function coordinates(x, y) {
  return "X:" + (411 + x) + "  Y:" + (659 - y);
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

export function setOnSelectCallback(handler) { onSelectCallback = handler; }
export function setOnArmCallback(handler) { onArmCallback = handler; }
export function setMapActions(actions) { jumpHandler = actions.jumpTo; deleteHandler = actions.deleteObjectAt; }
window.closeSheet = closeSheet;
