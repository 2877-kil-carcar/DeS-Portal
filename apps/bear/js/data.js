export const GRID_COLS = 48; // 横
export const GRID_ROWS = 27; // 縦

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