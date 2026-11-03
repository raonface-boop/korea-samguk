// 지배력: 칸 단위 땅 주인과 지배력(0~100)
import {
  CELL,
  CITIES,
  CITY_BY_ID,
  GRID_H,
  GRID_W,
  GameState,
  cellAt,
  cellIndex,
  governorOf,
  stat,
} from './state';

/** 그 성 지역에서 성 주인 땅의 비율 (0~1) */
export function regionRatio(s: GameState, cityId: string): number {
  const rid = CITY_BY_ID[cityId].regionId;
  const owner = s.cities[cityId].owner;
  let total = 0;
  let mine = 0;
  const { region, owner: cellOwner } = s.grid;
  for (let i = 0; i < region.length; i++) {
    if (region[i] !== rid) continue;
    total++;
    if (cellOwner[i] === owner) mine++;
  }
  return total === 0 ? 1 : mine / total;
}

export function allRegionRatios(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CITIES) out[c.id] = regionRatio(s, c.id);
  return out;
}

/** 칸을 바로 nation 땅(지배력 100)으로 */
function seize(s: GameState, idx: number, nation: string) {
  if (s.grid.region[idx] === 0) return;
  s.grid.owner[idx] = nation;
  s.grid.control[idx] = 100;
}

/** 선분이 지나는 칸 목록 */
export function cellsOnLine(points: [number, number][]): number[] {
  const out = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      out.add(cellAt(points[0][0], points[0][1]));
      continue;
    }
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (CELL / 3)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      out.add(cellAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
    }
  }
  return [...out];
}

/** 성 함락: 성 반경 3칸 + 부대가 지나온 경로를 새 주인 땅으로 */
export function captureLand(s: GameState, cityId: string, nation: string, trail: [number, number][]) {
  const c = CITY_BY_ID[cityId];
  const ccx = Math.floor(c.x / CELL);
  const ccy = Math.floor(c.y / CELL);
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > 9) continue;
      const cx = ccx + dx;
      const cy = ccy + dy;
      if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) continue;
      seize(s, cellIndex(cx, cy), nation);
    }
  }
  for (const idx of cellsOnLine(trail)) seize(s, idx, nation);
}

/** 적 부대가 지나간 칸은 그 부대 나라 땅이 된다 */
export function armyPassesCells(s: GameState, nation: string, points: [number, number][]) {
  for (const idx of cellsOnLine(points)) {
    if (s.grid.region[idx] === 0) continue;
    if (s.grid.owner[idx] === nation) continue;
    s.grid.owner[idx] = nation;
    s.grid.control[idx] = 100;
  }
}

/** 지역마다 한 턴에 퍼지는 겹 수 */
export function spreadLayers(s: GameState, cityId: string): number {
  const gov = governorOf(s, cityId);
  const pol = gov ? stat(gov.id, 'politics') : 0;
  const n = 3 + Math.floor(pol / 25) + Math.floor(s.cities[cityId].morale / 34);
  return Math.max(3, Math.min(9, n));
}

/** 매 턴 지배력 퍼짐: 지역마다 성 주인 땅에서 N겹(BFS 층)만큼 넓힘 */
export function spreadControl(s: GameState) {
  const { region, owner, control } = s.grid;
  const cellsByRegion: Record<number, number[]> = {};
  for (let i = 0; i < region.length; i++) {
    if (region[i] === 0) continue;
    (cellsByRegion[region[i]] ??= []).push(i);
  }
  for (const c of CITIES) {
    const cells = cellsByRegion[c.regionId];
    if (!cells) continue;
    const lord = s.cities[c.id].owner;
    let frontier = cells.filter((i) => owner[i] === lord);
    if (frontier.length === cells.length) continue;
    if (frontier.length === 0) {
      const ci = cellAt(c.x, c.y);
      const seed = region[ci] === c.regionId ? ci : cells[0];
      owner[seed] = lord;
      control[seed] = 100;
      frontier = [seed];
    }
    const layers = spreadLayers(s, c.id);
    for (let k = 0; k < layers && frontier.length; k++) {
      const next: number[] = [];
      for (const i of frontier) {
        const cx = i % GRID_W;
        const cy = Math.floor(i / GRID_W);
        const nb = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
          const j = cellIndex(nx, ny);
          if (region[j] !== c.regionId || owner[j] === lord) continue;
          owner[j] = lord;
          control[j] = 100;
          next.push(j);
        }
      }
      frontier = next;
    }
  }
}
