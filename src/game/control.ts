// 지배력: 칸 단위 땅 주인과 지배력(0~100)
import {
  CELL,
  CITIES,
  CITY_BY_ID,
  CITY_BY_REGION,
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

/** 적 부대가 지나간 칸: 지배력 -30. 0이 되면 그 부대 나라 땅(지배력 30)이 된다 */
export function armyPassesCells(s: GameState, nation: string, points: [number, number][]) {
  for (const idx of cellsOnLine(points)) {
    if (s.grid.region[idx] === 0) continue;
    if (s.grid.owner[idx] === nation) continue;
    s.grid.control[idx] -= 30;
    if (s.grid.control[idx] <= 0) {
      s.grid.owner[idx] = nation;
      s.grid.control[idx] = 30;
    }
  }
}

/** 매 턴 지배력 퍼짐 */
export function spreadControl(s: GameState) {
  const { region, owner, control } = s.grid;
  // 지역별 퍼짐 속도
  const rate: Record<number, number> = {};
  for (const c of CITIES) {
    const cs = s.cities[c.id];
    const gov = governorOf(s, c.id);
    const pol = gov ? stat(gov.id, 'politics') : 0;
    rate[c.regionId] = pol / 20 + cs.morale / 20 + Math.min(cs.troops / 2000, 5);
  }
  const newOwner = owner.slice();
  const newControl = control.slice();
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const i = cellIndex(cx, cy);
      const r = region[i];
      if (r === 0) continue;
      const lord = s.cities[CITY_BY_REGION[r].id].owner;
      const sp = rate[r] ?? 0;
      if (owner[i] === lord) {
        // 이미 성 주인 땅: 지배력 회복
        if (control[i] < 100) newControl[i] = Math.min(100, control[i] + sp);
        continue;
      }
      // 같은 지역 안 이웃 칸이 성 주인 땅이면 성 주인 쪽으로 늘어남
      let touch = false;
      const nb = [
        [cx - 1, cy],
        [cx + 1, cy],
        [cx, cy - 1],
        [cx, cy + 1],
      ];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const j = cellIndex(nx, ny);
        if (region[j] === r && owner[j] === lord) {
          touch = true;
          break;
        }
      }
      if (!touch) continue;
      // control 은 현재 주인의 지배력. 성 주인 쪽 몫(100 - control)이 100 이 되면 주인이 바뀐다.
      const toward = 100 - control[i] + sp;
      if (toward >= 100) {
        newOwner[i] = lord;
        newControl[i] = 100;
      } else {
        newControl[i] = 100 - toward;
      }
    }
  }
  s.grid.owner = newOwner;
  s.grid.control = newControl.map((v) => Math.round(v * 10) / 10);
}
