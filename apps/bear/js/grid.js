import { objects, GRID_COLS, GRID_ROWS } from "./data.js";


export function getObjectAt(x, y) {
  return objects.find(o =>
    x >= o.x && x < o.x + o.size &&
    y >= o.y && y < o.y + o.size
  );
}

export function canPlace(x, y, size) {
  if (x + size > GRID_COLS || y + size > GRID_ROWS) return false;

  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      if (getObjectAt(x + dx, y + dy)) return false;
    }
  }
  return true;
}