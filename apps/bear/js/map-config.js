import { allianceConfig } from "./alliance.js?v=3.43";

export const DEFAULT_GEM_MAP_CONFIG = Object.freeze({
  minX: 416,
  maxX: 453,
  minY: 633,
  maxY: 658
});

const DES_MAP_CONFIG = Object.freeze({
  minX: 416,
  maxX: 453,
  minY: 633,
  maxY: 658
});

let currentConfig = { ...(allianceConfig.key === "gem" ? DEFAULT_GEM_MAP_CONFIG : DES_MAP_CONFIG) };

export function normalizeMapConfig(value = {}) {
  const normalized = {
    minX: Number(value.minX),
    maxX: Number(value.maxX),
    minY: Number(value.minY),
    maxY: Number(value.maxY)
  };
  if (!Object.values(normalized).every(Number.isInteger)) return null;
  if (normalized.minX < 0 || normalized.minY < 0 || normalized.maxX > 9999 || normalized.maxY > 9999) return null;
  const width = normalized.maxX - normalized.minX + 1;
  const height = normalized.maxY - normalized.minY + 1;
  if (width < 2 || height < 2 || width > 100 || height > 100) return null;
  return normalized;
}

export function setMapConfig(value) {
  if (allianceConfig.key !== "gem") return getMapConfig();
  const normalized = normalizeMapConfig(value) || { ...DEFAULT_GEM_MAP_CONFIG };
  currentConfig = normalized;
  return getMapConfig();
}

export function getMapConfig() {
  return { ...currentConfig };
}

export function getGridMetrics() {
  if (allianceConfig.key === "gem") {
    const width = currentConfig.maxX - currentConfig.minX + 1;
    const height = currentConfig.maxY - currentConfig.minY + 1;
    return {
      cols: width + 1,
      rows: height + 1,
      minGridX: 1,
      maxGridX: width,
      viewCols: width + 1
    };
  }
  return { cols: 48, rows: 27, minGridX: 5, maxGridX: 42, viewCols: 39 };
}

export function worldX(gridX) {
  return allianceConfig.key === "gem" ? currentConfig.minX + gridX - 1 : 411 + gridX;
}

export function worldY(gridY) {
  return allianceConfig.key === "gem" ? currentConfig.maxY - gridY + 1 : 659 - gridY;
}

export function coordinates(gridX, gridY) {
  return `X:${worldX(gridX)}  Y:${worldY(gridY)}`;
}

export function storedObjectToGrid(data, id = "") {
  const object = { ...data, _storageId: id };
  if (allianceConfig.key !== "gem") return object;
  const size = Number(object.size) || 1;
  if (!Number.isInteger(object.mapX) || !Number.isInteger(object.mapY)) {
    if (!Number.isInteger(object.x) || !Number.isInteger(object.y)) return object;
    // v3.42以前のGeM配置はDeSと同じ固定座標式で保存されていたため、実座標へ読み替える。
    object.mapX = 411 + object.x;
    object.mapY = 659 - (object.y + size - 1);
  }
  object.x = object.mapX - currentConfig.minX + 1;
  const bottomRow = currentConfig.maxY - object.mapY + 1;
  object.y = bottomRow - size + 1;
  return object;
}

export function gridObjectToStored(object) {
  const stored = { ...object };
  delete stored._storageId;
  if (allianceConfig.key !== "gem") return stored;
  stored.mapX = worldX(object.x);
  stored.mapY = worldY(object.y + object.size - 1);
  delete stored.x;
  delete stored.y;
  return stored;
}

export function storageIdForObject(object) {
  if (allianceConfig.key !== "gem") return object._storageId || `${object.x}_${object.y}`;
  const mapX = Number.isInteger(object.mapX) ? object.mapX : worldX(object.x);
  const mapY = Number.isInteger(object.mapY) ? object.mapY : worldY(object.y + object.size - 1);
  return object._storageId || `${mapX}_${mapY}`;
}

export function objectFitsMap(object, config) {
  const size = Number(object.size) || 1;
  const mapX = Number.isInteger(object.mapX) ? object.mapX : 411 + object.x;
  const mapY = Number.isInteger(object.mapY) ? object.mapY : 659 - (object.y + size - 1);
  return mapX >= config.minX && mapX + size - 1 <= config.maxX
    && mapY >= config.minY && mapY + size - 1 <= config.maxY;
}
