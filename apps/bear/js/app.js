import { db, authReady, PREVIEW } from "./firebase.js";
import { doc, writeBatch, deleteDoc, onSnapshot, collection, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { members, setObjects, objects, setMembers, adminApproved, setAdminApproved } from "./data.js?v=3.27.1";
import { getObjectAt } from "./grid.js?v=3.27.1";
import * as ui from "./ui.js?v=3.43";
import { allianceConfig, allianceHref, setupAllianceTabs } from "./alliance.js?v=3.43";
import {
  coordinates,
  getGridMetrics,
  getMapConfig,
  gridObjectToStored,
  normalizeMapConfig,
  objectFitsMap,
  setMapConfig,
  storageIdForObject,
  storedObjectToGrid,
  worldX,
  worldY
} from "./map-config.js?v=3.43";

const grid = document.getElementById("grid");
const wrapper = document.getElementById("gridWrapper");
const stage = document.getElementById("gridStage");
const status = document.getElementById("syncStatus");
const adminDialog = document.getElementById("adminDialog");
const adminPwInput = document.getElementById("adminPwInput");
const adminApproveBtn = document.getElementById("adminApproveBtn");
const memberLink = document.getElementById("memberLink");
const placementTray = document.getElementById("placementTray");
const placementLabel = document.getElementById("placementLabel");
const placementHint = document.getElementById("placementHint");
const confirmPlacement = document.getElementById("confirmPlacement");
const mapSettingsBtn = document.getElementById("mapSettingsBtn");
const mapSettingsDialog = document.getElementById("mapSettingsDialog");
const mapSettingsForm = document.getElementById("mapSettingsForm");
const mapSettingsError = document.getElementById("mapSettingsError");
const ADMIN_PASSWORD = allianceConfig.key === "gem" ? "gem" : "des";
const ADMIN_SESSION_KEY = `adminApproved:${allianceConfig.key}`;

document.getElementById("allianceName").textContent = allianceConfig.label;
document.title = `${allianceConfig.label} 熊罠配置 | DeS ポータル`;
setupAllianceTabs(document.getElementById("allianceTabs"), "./index.html");
memberLink.href = allianceHref("./members.html");

let activeCellPos = null;
let flashCellPos = null;
let pendingSelection = null;
let pendingPlan = null;
let saving = false;
let scale = 1;
let lastDist = null;
let lastPanAt = -1000;
let trapIndex = -1;
let metrics = getGridMetrics();
let rawStoredObjects = [];

function gridPixelWidth() { return metrics.viewCols * 37 + 13; }
function gridPixelHeight() { return metrics.rows * 37 + 16; }

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function updateMapHeight() {
  document.documentElement.style.setProperty("--map-top", (document.getElementById("topBar").offsetHeight + 28) + "px");
}
new ResizeObserver(updateMapHeight).observe(document.getElementById("topBar"));

function syncScale() {
  grid.style.transform = "scale(" + scale + ")";
  stage.style.width = (gridPixelWidth() * scale) + "px";
  stage.style.height = (gridPixelHeight() * scale) + "px";
  document.getElementById("zoomReset").textContent = Math.round(scale * 100) + "%";
}

function zoomTo(next) {
  const old = scale;
  scale = Math.max(.08, Math.min(3, next));
  const cx = wrapper.clientWidth / 2;
  const cy = wrapper.clientHeight / 2;
  syncScale();
  wrapper.scrollLeft = (wrapper.scrollLeft + cx) * scale / old - cx;
  wrapper.scrollTop = (wrapper.scrollTop + cy) * scale / old - cy;
}

function showWholeMap() {
  zoomTo(Math.min(wrapper.clientWidth / gridPixelWidth(), wrapper.clientHeight / gridPixelHeight()));
  wrapper.scrollTo(0, 0);
}

document.getElementById("zoomIn").onclick = () => zoomTo(scale + .15);
document.getElementById("zoomOut").onclick = () => zoomTo(scale - .15);
document.getElementById("zoomReset").onclick = () => zoomTo(1);
document.getElementById("mapAll").onclick = showWholeMap;
document.getElementById("findMember").onclick = () => ui.openMemberSearch();
document.getElementById("focusTrap").onclick = () => {
  const traps = objects.filter(object => object.type === "trap");
  if (!traps.length) return showStatus("熊罠はまだ配置されていません", true);
  trapIndex = (trapIndex + 1) % traps.length;
  const trap = traps[trapIndex];
  jumpTo(trap.x, trap.y + trap.size - 1);
  showStatus("熊罠 " + (trapIndex + 1) + "/" + traps.length + " を表示");
};

function updateAdminUi() {
  document.getElementById("modeBadge").textContent = adminApproved ? (PREVIEW ? "試し置きモード" : "編集モード") : "閲覧モード";
  document.getElementById("modeBadge").classList.toggle("editing", adminApproved);
  adminApproveBtn.textContent = adminApproved ? "編集を終了" : "編集";
  adminApproveBtn.classList.toggle("editing", adminApproved);
  memberLink.hidden = !adminApproved;
  mapSettingsBtn.hidden = allianceConfig.key !== "gem" || !adminApproved;
  ui.refreshSheet();
}

function endEditing() {
  setAdminApproved(false);
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  cancelPending();
  updateAdminUi();
  render();
  showStatus(PREVIEW ? "表示確認モード：本番には接続・保存しません" : "共有配置と同期中 · 閲覧モード");
}

adminApproveBtn.addEventListener("click", () => {
  if (adminApproved) return endEditing();
  if (PREVIEW) {
    setAdminApproved(true);
    updateAdminUi();
    render();
    return showStatus("表示確認モード：試し置きは本番に保存されません");
  }
  adminDialog.showModal();
  setTimeout(() => adminPwInput.focus(), 30);
});

document.getElementById("adminSubmitBtn").addEventListener("click", event => {
  if (adminPwInput.value !== ADMIN_PASSWORD) {
    event.preventDefault();
    adminPwInput.setCustomValidity("パスワードが違います");
    adminPwInput.reportValidity();
    return;
  }
  adminPwInput.setCustomValidity("");
  adminPwInput.value = "";
  setAdminApproved(true);
  sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
  updateAdminUi();
  render();
  showStatus("編集モード：配置を変更できます");
});
adminPwInput.addEventListener("input", () => adminPwInput.setCustomValidity(""));
memberLink.addEventListener("click", event => { if (!adminApproved) event.preventDefault(); });

function initGrid() {
  metrics = getGridMetrics();
  grid.replaceChildren();
  grid.style.gridTemplateColumns = `repeat(${metrics.viewCols}, 34px)`;
  const fragment = document.createDocumentFragment();
  for (let y = 0; y < metrics.rows; y++) {
    for (let x = 0; x < metrics.cols; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      fragment.appendChild(cell);
    }
  }
  grid.appendChild(fragment);
  syncScale();
  render();
}

function applyStoredObjects() {
  setObjects(rawStoredObjects.map(item => storedObjectToGrid(item, item._storageId)));
  ui.refreshSheet();
}

function fillMapSettingsForm() {
  const config = getMapConfig();
  document.getElementById("mapMinX").value = config.minX;
  document.getElementById("mapMaxX").value = config.maxX;
  document.getElementById("mapMinY").value = config.minY;
  document.getElementById("mapMaxY").value = config.maxY;
  mapSettingsError.textContent = "";
}

mapSettingsBtn.addEventListener("click", () => {
  if (allianceConfig.key !== "gem" || !adminApproved) return;
  fillMapSettingsForm();
  mapSettingsDialog.showModal();
});

document.getElementById("mapSettingsCancel").addEventListener("click", () => mapSettingsDialog.close());

mapSettingsForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (allianceConfig.key !== "gem" || !adminApproved) return;
  const nextConfig = normalizeMapConfig({
    minX: document.getElementById("mapMinX").valueAsNumber,
    maxX: document.getElementById("mapMaxX").valueAsNumber,
    minY: document.getElementById("mapMinY").valueAsNumber,
    maxY: document.getElementById("mapMaxY").valueAsNumber
  });
  if (!nextConfig) {
    mapSettingsError.textContent = "最小値より最大値を大きくし、各辺を2〜100マスで設定してください。";
    return;
  }

  const storedForCheck = PREVIEW ? objects.map(gridObjectToStored) : rawStoredObjects;
  const outsideCount = storedForCheck.filter(object => !objectFitsMap(object, nextConfig)).length;
  if (outsideCount) {
    mapSettingsError.textContent = `範囲外になる配置が${outsideCount}件あります。配置を範囲内へ移動してから変更してください。`;
    return;
  }

  const submit = mapSettingsForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    if (PREVIEW) {
      rawStoredObjects = storedForCheck;
      setMapConfig(nextConfig);
      applyStoredObjects();
      activeCellPos = null;
      cancelPending();
      initGrid();
    } else {
      await setDoc(doc(db, allianceConfig.settingsCollection, "map"), { ...nextConfig, updatedAt: Date.now() });
    }
    mapSettingsDialog.close();
    showStatus(PREVIEW ? "表示確認モード：GeMの表示範囲を更新しました" : "GeMの表示範囲を保存しました");
  } catch (_) {
    mapSettingsError.textContent = "保存できませんでした。通信・権限を確認してください。";
  } finally {
    submit.disabled = false;
  }
});

async function commitPlan(plan) {
  if (!adminApproved || saving || !plan) return;
  if (plan.next.type === "player" && !members.some(member => String(member.id) === String(plan.next.memberId))) {
    showStatus("同盟員情報が更新されています。読み直してください。", true);
    return;
  }
  saving = true;
  showStatus(PREVIEW ? "試し置きを更新中…" : "共有配置を保存中…");
  try {
    const next = { ...plan.next, updatedAt: Date.now() };
    if (PREVIEW) {
      setObjects([...objects.filter(object => object !== plan.previous), next]);
      render();
    } else {
      const batch = writeBatch(db);
      const storedNext = gridObjectToStored(next);
      const nextId = allianceConfig.key === "gem" ? `${storedNext.mapX}_${storedNext.mapY}` : `${next.x}_${next.y}`;
      const nextRef = doc(db, allianceConfig.objectsCollection, nextId);
      if (plan.previous && (plan.previous.x !== next.x || plan.previous.y !== next.y)) {
        batch.delete(doc(db, allianceConfig.objectsCollection, storageIdForObject(plan.previous)));
      }
      batch.set(nextRef, storedNext);
      await batch.commit();
    }
    showStatus(PREVIEW ? "表示確認モード：試し置きは本番に保存されません" : "配置を保存しました");
    cancelPending();
  } catch (error) {
    showStatus("保存できませんでした。通信・権限を確認してください。", true);
    alert("保存に失敗しました。元の配置は削除されていません。");
  } finally {
    saving = false;
  }
}

ui.setOnSelectCallback(async (type, memberId, pos) => {
  if (!adminApproved || saving) return;
  try {
    const plan = window.WOS_PLACEMENT.planPlacement(objects, type, memberId, pos, metrics.cols, metrics.rows, null, metrics.minGridX, metrics.maxGridX);
    await commitPlan(plan);
  } catch (error) {
    showStatus(error.message, true);
  }
});

ui.setOnArmCallback((type, memberId, label, previous = null) => {
  if (!adminApproved) return;
  pendingSelection = { type, memberId, label, previous };
  pendingPlan = null;
  activeCellPos = null;
  placementTray.hidden = false;
  placementLabel.textContent = label + "を配置";
  placementHint.textContent = "配置の基準となる左下のマスをタップしてください";
  placementHint.classList.remove("error");
  confirmPlacement.disabled = true;
  render();
});

function previewPlacement(pos) {
  activeCellPos = pos;
  try {
    pendingPlan = window.WOS_PLACEMENT.planPlacement(
      objects,
      pendingSelection.type,
      pendingSelection.memberId,
      pos,
      metrics.cols,
      metrics.rows,
      pendingSelection.previous,
      metrics.minGridX,
      metrics.maxGridX
    );
    placementHint.textContent = coordinates(pos.x, pos.y) + " に配置できます";
    placementHint.classList.remove("error");
    confirmPlacement.disabled = false;
  } catch (error) {
    pendingPlan = null;
    placementHint.textContent = error.message;
    placementHint.classList.add("error");
    confirmPlacement.disabled = true;
  }
  render();
}

function cancelPending() {
  pendingSelection = null;
  pendingPlan = null;
  placementTray.hidden = true;
  confirmPlacement.disabled = true;
  render();
}

document.getElementById("cancelPlacement").onclick = cancelPending;
confirmPlacement.onclick = () => commitPlan(pendingPlan);
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (pendingSelection) cancelPending();
  else ui.closeSheet();
});

function render() {
  const cells = grid.children;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const x = i % metrics.cols;
    const y = Math.floor(i / metrics.cols);
    cell.className = "cell";
    cell.replaceChildren();
    if (x !== 0 && (x < metrics.minGridX || x > metrics.maxGridX)) {
      cell.classList.add("out-of-range");
      continue;
    }
    if (x === 0 && y === 0) {
      cell.textContent = "Y\\X";
      cell.classList.add("coord-cell");
      continue;
    }
    if (y === 0) {
      cell.textContent = worldX(x);
      cell.classList.add("coord-cell");
      continue;
    }
    if (x === 0) {
      cell.textContent = worldY(y);
      cell.classList.add("coord-cell");
      continue;
    }
    cell.onclick = () => {
      if (performance.now() - lastPanAt < 350) return;
      if (pendingSelection) previewPlacement({ x, y });
      else {
        activeCellPos = { x, y };
        render();
        ui.openSheet(x, y);
      }
    };
    const object = getObjectAt(x, y);
    if (object) drawObject(cell, object, x, y);
    if (activeCellPos?.x === x && activeCellPos?.y === y) cell.classList.add("active");
    if (flashCellPos?.x === x && flashCellPos?.y === y) cell.classList.add("flash");
    if (pendingPlan && inside(pendingPlan.next, x, y)) {
      cell.classList.add("placement-preview");
      drawMultiBorder(cell, pendingPlan.next, x, y);
    }
    if (pendingPlan?.previous && inside(pendingPlan.previous, x, y)) cell.classList.add("placement-origin");
  }
  adjustTextSize();
  updateCurrentPos();
  updateCurrentPosTop();
  updateGlobalUpdatedAt();
}

function drawObject(cell, object, x, y) {
  if (object.type === "player") {
    const member = members.find(item => String(item.id) === String(object.memberId));
    if (!member) return;
    if (x === object.x && y === object.y) appendText(cell, "cell-name", member.name);
    else if (x === object.x + 1 && y === object.y) appendText(cell, "cell-center", member.rank || "");
    else if (x === object.x && y === object.y + 1) appendCoordinates(cell, object);
    cell.classList.add("player-normal");
  } else {
    cell.textContent = ({ flag: "🚩", trap: "🐻", base: "🕌", mine: "⛏️", food: "🍕" })[object.type] || "";
  }
  drawMultiBorder(cell, object, x, y);
}

function appendText(cell, className, value) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = value || "";
  cell.appendChild(element);
}

function appendCoordinates(cell, object) {
  const element = document.createElement("div");
  element.className = "cell-center";
  const first = document.createTextNode("X" + worldX(object.x));
  const br = document.createElement("br");
  const second = document.createTextNode("Y" + worldY(object.y + 1));
  element.append(first, br, second);
  cell.appendChild(element);
}

function inside(object, x, y) {
  return x >= object.x && x < object.x + object.size && y >= object.y && y < object.y + object.size;
}

export async function deleteObjectAt(x, y) {
  if (!adminApproved || saving) return;
  const object = getObjectAt(x, y);
  if (!object) return;
  saving = true;
  try {
    if (PREVIEW) {
      setObjects(objects.filter(item => item !== object));
      render();
    } else await deleteDoc(doc(db, allianceConfig.objectsCollection, storageIdForObject(object)));
    showStatus(PREVIEW ? "表示確認モード：試し置きを削除しました" : "配置を削除しました");
  } catch (error) {
    showStatus("削除できませんでした。通信・権限を確認してください。", true);
    throw error;
  } finally {
    saving = false;
  }
}

ui.setMapActions({ jumpTo, deleteObjectAt });

function drawMultiBorder(cell, object, x, y) {
  if (y === object.y) cell.classList.add("border-top");
  if (y === object.y + object.size - 1) cell.classList.add("border-bottom");
  if (x === object.x) cell.classList.add("border-left");
  if (x === object.x + object.size - 1) cell.classList.add("border-right");
}

async function connect() {
  if (PREVIEW) {
    setMembers([
      { id: "demo-a", name: "サンプル A", rank: "R4" },
      { id: "demo-b", name: "サンプル B", rank: "R3" },
      { id: "demo-c", name: "未配置サンプル", rank: "R2" }
    ]);
    setObjects([
      { type: "trap", x: 7, y: 5, size: 3, updatedAt: Date.now() - 3600000 },
      { type: "trap", x: 20, y: 13, size: 3, updatedAt: Date.now() - 7200000 },
      { type: "base", x: 13, y: 8, size: 3, updatedAt: Date.now() - 5400000 },
      { type: "player", memberId: "demo-a", x: 5, y: 7, size: 2, updatedAt: Date.now() - 1800000 },
      { type: "player", memberId: "demo-b", x: 10, y: 8, size: 2, updatedAt: Date.now() - 2400000 }
    ]);
    status.classList.add("preview");
    memberLink.href = allianceHref("./members.html");
    showStatus("表示確認モード：本番には接続・保存しません");
    updateAdminUi();
    render();
    return;
  }
  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") setAdminApproved(true);
  updateAdminUi();
  try {
    await authReady;
    const failed = () => showStatus("共有配置を読み込めません。通信またはアクセス権限を確認してください。", true);
    if (allianceConfig.key === "gem") {
      onSnapshot(doc(db, allianceConfig.settingsCollection, "map"), snapshot => {
        setMapConfig(snapshot.exists() ? snapshot.data() : undefined);
        applyStoredObjects();
        cancelPending();
        activeCellPos = null;
        initGrid();
      }, failed);
    }
    onSnapshot(collection(db, allianceConfig.objectsCollection), snapshot => {
      rawStoredObjects = snapshot.docs.map(item => ({ ...item.data(), _storageId: item.id }));
      applyStoredObjects();
      render();
      showStatus(adminApproved ? "共有配置と同期中 · 編集モード" : "共有配置と同期中 · 閲覧モード");
    }, failed);
    onSnapshot(collection(db, allianceConfig.membersCollection), snapshot => {
      setMembers(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
      render();
      ui.refreshSheet();
    }, failed);
  } catch (error) {
    showStatus("接続できません。通信・Firebaseの認証設定を確認してください。", true);
  }
}

export function jumpTo(x, y) {
  const cellSize = 37;
  const visibleX = Math.max(1, Math.min(metrics.viewCols - 1, x - metrics.minGridX + 1));
  const targetX = visibleX * cellSize * scale;
  const targetY = y * cellSize * scale;
  activeCellPos = { x, y };
  flashCellPos = { x, y };
  render();
  wrapper.scrollTo({
    left: targetX - wrapper.clientWidth / 2 + cellSize * scale / 2,
    top: targetY - wrapper.clientHeight / 2 + cellSize * scale / 2,
    behavior: "smooth"
  });
  setTimeout(() => { flashCellPos = null; render(); }, 800);
}

wrapper.addEventListener("wheel", event => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const rect = wrapper.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const previous = scale;
  scale = Math.min(Math.max(.08, scale + (event.deltaY > 0 ? -.1 : .1)), 2);
  syncScale();
  wrapper.scrollLeft = (wrapper.scrollLeft + mouseX) * scale / previous - mouseX;
  wrapper.scrollTop = (wrapper.scrollTop + mouseY) * scale / previous - mouseY;
}, { passive: false });

let panStartX = 0, panStartY = 0, panScrollLeft = 0, panScrollTop = 0, isSingleTouch = false;
let pendingScrollLeft = null, pendingScrollTop = null, rafId = null;

wrapper.addEventListener("touchstart", event => {
  if (event.touches.length === 1) {
    isSingleTouch = true;
    panStartX = event.touches[0].clientX;
    panStartY = event.touches[0].clientY;
    panScrollLeft = wrapper.scrollLeft;
    panScrollTop = wrapper.scrollTop;
  } else if (event.touches.length === 2) {
    isSingleTouch = false;
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    lastDist = Math.sqrt(dx * dx + dy * dy);
    pendingScrollLeft = pendingScrollTop = null;
  }
}, { passive: true });

wrapper.addEventListener("touchmove", event => {
  event.preventDefault();
  if (event.touches.length > 1 || Math.abs(event.touches[0].clientX - panStartX) > 6 || Math.abs(event.touches[0].clientY - panStartY) > 6) lastPanAt = performance.now();
  if (event.touches.length === 1 && isSingleTouch) {
    wrapper.scrollLeft = panScrollLeft - (event.touches[0].clientX - panStartX);
    wrapper.scrollTop = panScrollTop - (event.touches[0].clientY - panStartY);
    return;
  }
  if (event.touches.length !== 2 || !lastDist) return;
  const [first, second] = event.touches;
  const dx = first.clientX - second.clientX;
  const dy = first.clientY - second.clientY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > 0) {
    const previous = scale;
    scale = Math.min(Math.max(.08, scale * (distance / lastDist)), 3);
    const ratio = scale / previous;
    const rect = wrapper.getBoundingClientRect();
    const midX = (first.clientX + second.clientX) / 2 - rect.left;
    const midY = (first.clientY + second.clientY) / 2 - rect.top;
    pendingScrollLeft = ((pendingScrollLeft ?? wrapper.scrollLeft) + midX) * ratio - midX;
    pendingScrollTop = ((pendingScrollTop ?? wrapper.scrollTop) + midY) * ratio - midY;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      syncScale();
      wrapper.scrollLeft = pendingScrollLeft;
      wrapper.scrollTop = pendingScrollTop;
      pendingScrollLeft = pendingScrollTop = null;
      rafId = null;
    });
  }
  lastDist = distance;
}, { passive: false });

wrapper.addEventListener("touchend", event => {
  if (event.touches.length < 2) lastDist = null;
  if (!event.touches.length) isSingleTouch = false;
});

function adjustTextSize() {
  document.querySelectorAll(".cell-name").forEach(element => {
    let size = 9;
    element.style.fontSize = size + "px";
    while (element.scrollHeight > element.clientHeight && size > 6) element.style.fontSize = --size + "px";
  });
}

function getSelectedUpdatedAt() {
  if (!activeCellPos) return null;
  return getObjectAt(activeCellPos.x, activeCellPos.y)?.updatedAt || null;
}

function formatDateTime(timestamp, short = false) {
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, "0");
  const body = pad(date.getMonth() + 1) + "/" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  return short ? body : date.getFullYear() + "/" + body;
}

function updateGlobalUpdatedAt() {
  const latest = objects.reduce((value, object) => Math.max(value, object.updatedAt || 0), 0);
  document.getElementById("globalUpdatedAt").textContent = latest ? "最終更新 " + formatDateTime(latest) : "";
}

function updateCurrentPos() {
  const element = document.getElementById("currentPos");
  element.replaceChildren();
  if (!activeCellPos) return;
  element.textContent = "現在地 " + coordinates(activeCellPos.x, activeCellPos.y);
  const updatedAt = getSelectedUpdatedAt();
  if (updatedAt) appendUpdated(element, "最終更新 " + formatDateTime(updatedAt));
}

function updateCurrentPosTop() {
  const element = document.getElementById("currentPosTop");
  element.replaceChildren();
  if (!activeCellPos) return;
  element.textContent = coordinates(activeCellPos.x, activeCellPos.y);
  const updatedAt = getSelectedUpdatedAt();
  if (updatedAt) appendUpdated(element, "更新 " + formatDateTime(updatedAt, true));
}

function appendUpdated(parent, text) {
  const element = document.createElement("span");
  element.className = "updated-at";
  element.textContent = text;
  parent.appendChild(element);
}

initGrid();
syncScale();
updateAdminUi();
connect();
