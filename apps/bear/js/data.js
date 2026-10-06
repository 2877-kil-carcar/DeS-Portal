export const GRID_COLS = 48; // 横
export const GRID_ROWS = 27; // 縦
export const GRID_MIN_X = 5;  // 表示座標 X416
export const GRID_MAX_X = 42; // 表示座標 X453
export const GRID_VIEW_COLS = GRID_MAX_X - GRID_MIN_X + 2; // 座標見出しを含む

export let members = [];

export function setMembers(data) {
  members = data;
}

export let objects = [];

export function setObjects(newData) {
  objects = newData;
}

export let adminApproved = false;

export function setAdminApproved(v) {
  adminApproved = v;
}
