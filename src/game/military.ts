// 이동과 전투
import { armyPassesCells, captureLand } from './control';
import {
  Army,
  CITY_BY_ID,
  GameState,
  NEUTRAL,
  PASSES,
  ROADS,
  RoadData,
  UNIT_NAME,
  UnitType,
  WeaponKind,
  addLog,
  findRoad,
  nationName,
  officerName,
  officersInCity,
  otherEnd,
  roadsOf,
  rulerOf,
  stat,
} from './state';

export const MOVE_PER_TURN = 2;

// ---------- 길과 경로 ----------
export function isCavalry(t: UnitType) {
  return t === 'cavalry' || t === 'heavy';
}

export function edgeCost(r: RoadData, unit: UnitType): number {
  switch (r.type) {
    case 'plain':
      return isCavalry(unit) ? 0.5 : 1;
    case 'mountain':
    case 'pass':
    case 'sea':
      return 2;
  }
}

/** 길 위 점들 (pass 는 고개 좌표를 거침) */
export function roadPoints(from: string, to: string): [number, number][] {
  const a = CITY_BY_ID[from];
  const b = CITY_BY_ID[to];
  const r = findRoad(from, to);
  const pts: [number, number][] = [[a.x, a.y]];
  if (r?.type === 'pass' && r.via) {
    const p = PASSES.find((x) => x.name === r.via);
    if (p) pts.push([p.x, p.y]);
  }
  pts.push([b.x, b.y]);
  return pts;
}

function polyLength(pts: [number, number][]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** 꺾은선 위 t(0~1) 위치 */
export function pointAlong(pts: [number, number][], t: number): [number, number] {
  const total = polyLength(pts);
  let d = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= seg || i === pts.length - 1) {
      const k = seg === 0 ? 0 : Math.min(1, d / seg);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
    d -= seg;
  }
  return pts[pts.length - 1];
}

/** t 구간까지의 부분 꺾은선 */
function subPath(pts: [number, number][], t0: number, t1: number): [number, number][] {
  const out: [number, number][] = [pointAlong(pts, t0)];
  const total = polyLength(pts);
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const t = total === 0 ? 0 : acc / total;
    if (t > t0 && t < t1) out.push(pts[i]);
  }
  out.push(pointAlong(pts, t1));
  return out;
}

/**
 * 가장 빠른 경로. 중간에 거치는 성은 모두 자기 나라 성이어야 한다.
 * 도착 성은 아무 성이나 된다.
 */
export function findPath(s: GameState, from: string, to: string, nation: string, unit: UnitType): string[] | null {
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const k in dist) {
      if (!done.has(k) && dist[k] < best) {
        best = dist[k];
        cur = k;
      }
    }
    if (cur === null) return null;
    if (cur === to) break;
    done.add(cur);
    if (cur !== from && s.cities[cur].owner !== nation) continue; // 남의 성은 지나갈 수 없음
    for (const r of roadsOf(cur)) {
      const nx = otherEnd(r, cur);
      const nd = best + edgeCost(r, unit);
      if (dist[nx] === undefined || nd < dist[nx]) {
        dist[nx] = nd;
        prev[nx] = cur;
      }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

/** 출진 가능한 목적지 (길로 이어진 성) */
export function reachableTargets(s: GameState, from: string, nation: string, unit: UnitType = 'spear'): string[] {
  const out: string[] = [];
  for (const id in s.cities) {
    if (id === from) continue;
    if (findPath(s, from, id, nation, unit)) out.push(id);
  }
  return out;
}

/** 이웃 성 (길로 바로 이어진) */
export function neighbors(cityId: string): string[] {
  return ROADS.filter((r) => r.a === cityId || r.b === cityId).map((r) => otherEnd(r, cityId));
}

export function pathCost(path: string[], unit: UnitType): number {
  let c = 0;
  for (let i = 1; i < path.length; i++) {
    const r = findRoad(path[i - 1], path[i]);
    if (r) c += edgeCost(r, unit);
  }
  return c;
}

// ---------- 출진 ----------
export interface MarchOrder {
  cityId: string;
  officers: string[];
  troops: number;
  weapon: WeaponKind | 'heavy';
  food: number;
  target: string;
}

export function unitTypeOf(weapon: WeaponKind | 'heavy'): UnitType {
  switch (weapon) {
    case 'bow':
    case 'crossbow':
      return 'archer';
    case 'horse':
      return 'cavalry';
    case 'heavy':
      return 'heavy';
    default:
      return 'spear';
  }
}

/** 무기를 든 병력 수 */
export function armedCount(s: GameState, cityId: string, weapon: WeaponKind | 'heavy', troops: number): number {
  const w = s.cities[cityId].weapons;
  if (weapon === 'heavy') return Math.min(troops, w.horse, w.armor);
  return Math.min(troops, w[weapon]);
}

export function createArmy(s: GameState, order: MarchOrder): Army | null {
  const c = s.cities[order.cityId];
  const troops = Math.floor(Math.min(order.troops, c.troops));
  if (troops <= 0) return null;
  const unitType = unitTypeOf(order.weapon);
  const path = findPath(s, order.cityId, order.target, c.owner, unitType);
  if (!path || path.length < 2) return null;
  const armed = armedCount(s, order.cityId, order.weapon, troops);
  if (order.weapon === 'heavy') {
    c.weapons.horse -= armed;
    c.weapons.armor -= armed;
  } else {
    c.weapons[order.weapon] -= armed;
  }
  const food = Math.floor(Math.max(0, Math.min(order.food, c.food)));
  c.food -= food;
  c.troops -= troops;
  const army: Army = {
    id: `a${s.nextArmyId++}`,
    nation: c.owner,
    officers: order.officers.slice(0, 3),
    troops,
    armed,
    unitType,
    weaponKind: order.weapon,
    food,
    training: c.training,
    origin: order.cityId,
    path,
    pathIndex: 0,
    progress: 0,
    sieging: false,
    engaged: false,
    retreating: false,
    trail: [[CITY_BY_ID[order.cityId].x, CITY_BY_ID[order.cityId].y]],
  };
  for (const oid of army.officers) {
    const o = s.officers[oid];
    o.city = null;
    o.armyId = army.id;
    o.acted = true;
  }
  s.armies.push(army);
  const lead = army.officers[0] ? officerName(army.officers[0]) : '무명 장수';
  addLog(
    s,
    `${nationName(army.nation)} ${lead}, ${CITY_BY_ID[order.cityId].name}에서 ${CITY_BY_ID[order.target].name}(으)로 출진 (${UNIT_NAME[unitType]} ${troops})`,
  );
  return army;
}

/** 부대의 지도 위 위치 */
export function armyPosition(a: Army): [number, number] {
  if (a.pathIndex >= a.path.length - 1) {
    const c = CITY_BY_ID[a.path[a.path.length - 1]];
    return [c.x, c.y];
  }
  const from = a.path[a.pathIndex];
  const to = a.path[a.pathIndex + 1];
  const r = findRoad(from, to)!;
  const cost = edgeCost(r, a.unitType);
  return pointAlong(roadPoints(from, to), a.progress / cost);
}

export function armyTarget(a: Army): string {
  return a.path[a.path.length - 1];
}

/** 부대 한 턴 이동. 도착하면 true */
export function moveArmy(s: GameState, a: Army): boolean {
  if (a.sieging) return true;
  let budget = MOVE_PER_TURN;
  const moved: [number, number][] = [armyPosition(a)];
  while (budget > 1e-9 && a.pathIndex < a.path.length - 1) {
    const from = a.path[a.pathIndex];
    const to = a.path[a.pathIndex + 1];
    const r = findRoad(from, to)!;
    const cost = edgeCost(r, a.unitType);
    const pts = roadPoints(from, to);
    const remain = cost - a.progress;
    const t0 = a.progress / cost;
    if (budget >= remain - 1e-9) {
      budget -= remain;
      moved.push(...subPath(pts, t0, 1).slice(1));
      a.pathIndex++;
      a.progress = 0;
      // 중간 성이 더 이상 우리 성이 아니면 거기서 멈춰 공격
      const here = a.path[a.pathIndex];
      if (a.pathIndex < a.path.length - 1 && s.cities[here].owner !== a.nation) {
        a.path = a.path.slice(0, a.pathIndex + 1);
        break;
      }
    } else {
      a.progress += budget;
      moved.push(...subPath(pts, t0, a.progress / cost).slice(1));
      budget = 0;
    }
  }
  a.trail.push(...moved.slice(1));
  armyPassesCells(s, a.nation, moved);
  return a.pathIndex >= a.path.length - 1;
}

// ---------- 전투력 ----------
export function leaderLeadership(ids: string[]): number {
  return ids.length ? stat(ids[0], 'leadership') : 40;
}

function unitMod(a: Army, field: boolean): number {
  const lastRoad = a.path.length >= 2 ? findRoad(a.path[a.path.length - 2], a.path[a.path.length - 1]) : undefined;
  const viaMountain = lastRoad?.type === 'mountain' || lastRoad?.type === 'pass';
  switch (a.unitType) {
    case 'spear':
      return 1.0;
    case 'archer':
      return field ? 1.0 : 1.2;
    case 'cavalry':
      return field && !viaMountain ? 1.2 : 1.0;
    case 'heavy':
      return field && !viaMountain ? 1.4 : 1.0;
  }
}

export function armyPower(_s: GameState, a: Army, field: boolean): number {
  const base = a.armed * unitMod(a, field) + (a.troops - a.armed) * 0.5;
  return base * (0.5 + a.training / 100) * (0.5 + leaderLeadership(a.officers) / 100);
}

/** 수비 측 대장: 그 성에서 통솔이 가장 높은 장수 */
export function defenderLeader(s: GameState, cityId: string): string | null {
  const owner = s.cities[cityId].owner;
  const list = officersInCity(s, cityId).filter((o) => o.nation === owner);
  list.sort((a, b) => stat(b.id, 'leadership') - stat(a.id, 'leadership'));
  return list[0]?.id ?? null;
}

export function cityPower(s: GameState, cityId: string): number {
  const c = s.cities[cityId];
  const w = c.weapons;
  const armed = Math.min(c.troops, w.spear + w.bow + w.crossbow + w.horse);
  const base = armed * 1.0 + (c.troops - armed) * 0.5;
  const lead = defenderLeader(s, cityId);
  return base * (0.5 + c.training / 100) * (0.5 + (lead ? stat(lead, 'leadership') : 40) / 100);
}

function sideName(nation: string, leader: string | null) {
  return `${nationName(nation)}${leader ? ' ' + officerName(leader) : ''}`;
}

// ---------- 전투 ----------
/** 컴퓨터 수비 선택: 출격이면 true */
export function aiSortie(s: GameState, a: Army): boolean {
  return s.cities[armyTarget(a)].troops >= a.troops * 0.8;
}

/** 야전. 공격 측이 이기면 true */
export function fieldBattle(s: GameState, a: Army): boolean {
  const cityId = armyTarget(a);
  const c = s.cities[cityId];
  const name = CITY_BY_ID[cityId].name;
  const ap = armyPower(s, a, true);
  const dp = cityPower(s, cityId);
  const atkWin = ap >= dp;
  const ratio = atkWin ? ap / Math.max(1, dp) : dp / Math.max(1, ap);
  const k = Math.min(2, Math.sqrt(ratio));
  const loserRate = Math.min(0.6, 0.3 * k);
  const winnerRate = Math.max(0.03, 0.1 / k);
  const aLoss = Math.floor(a.troops * (atkWin ? winnerRate : loserRate));
  const dLoss = Math.floor(c.troops * (atkWin ? loserRate : winnerRate));
  applyArmyLoss(a, aLoss);
  c.troops -= dLoss;
  const defLead = defenderLeader(s, cityId);
  const atkLead = a.officers[0] ?? null;
  if (atkWin) {
    addLog(
      s,
      `${name} 야전: ${sideName(a.nation, atkLead)} 승리, ${nationName(c.owner)} 병력 ${dLoss} 잃음 (수비군 성으로 물러남)`,
    );
  } else {
    addLog(s, `${name} 야전: ${sideName(c.owner, defLead)} 승리, ${nationName(a.nation)} 병력 ${aLoss} 잃음`);
  }
  return atkWin;
}

function applyArmyLoss(a: Army, loss: number) {
  const armedRatio = a.troops > 0 ? a.armed / a.troops : 0;
  a.troops = Math.max(0, a.troops - loss);
  a.armed = Math.min(a.troops, Math.round(a.troops * armedRatio));
}

/** 공성전 한 턴 */
export function siegeTurn(s: GameState, a: Army) {
  const cityId = armyTarget(a);
  const c = s.cities[cityId];
  const name = CITY_BY_ID[cityId].name;
  if (a.food <= 0) {
    addLog(s, `${name} 공성전: ${nationName(a.nation)} 부대 군량이 바닥나 퇴각`);
    startRetreat(s, a);
    return;
  }
  const ap = armyPower(s, a, false);
  const dp = cityPower(s, cityId) * (1 + c.defense / 50);
  const defLead = defenderLeader(s, cityId);
  const atkLead = a.officers[0] ?? null;
  if (ap > dp) {
    const loss = Math.ceil(c.troops * 0.15);
    c.defense = Math.max(0, c.defense - 10);
    c.troops = Math.max(0, c.troops - loss);
    const aLoss = Math.floor(a.troops * 0.03);
    applyArmyLoss(a, aLoss);
    addLog(
      s,
      `${name} 공성전: ${sideName(a.nation, atkLead)} 승리, ${nationName(c.owner)} 병력 ${loss} 잃음 (방어 ${c.defense})`,
    );
    if (c.defense <= 0 || c.troops <= 0) conquer(s, a);
  } else {
    const aLoss = Math.floor(a.troops * 0.1);
    applyArmyLoss(a, aLoss);
    addLog(s, `${name} 공성전: ${sideName(c.owner, defLead)} 승리, ${nationName(a.nation)} 병력 ${aLoss} 잃음`);
    if (a.troops < 100) {
      addLog(s, `${nationName(a.nation)} 부대가 무너져 흩어짐`);
      disbandArmy(s, a);
    }
  }
}

/** 성 함락 */
export function conquer(s: GameState, a: Army) {
  const cityId = armyTarget(a);
  const c = s.cities[cityId];
  const prevOwner = c.owner;
  const name = CITY_BY_ID[cityId].name;
  c.owner = a.nation;
  c.troops = a.troops;
  c.defense = Math.max(c.defense, 10);
  c.training = Math.round((c.training + a.training) / 2);
  c.food += a.food;
  if (a.weaponKind === 'heavy') {
    c.weapons.horse += a.armed;
    c.weapons.armor += a.armed;
  } else {
    c.weapons[a.weaponKind] += a.armed;
  }
  addLog(s, `${name} 함락! ${nationName(a.nation)}의 땅이 되다 (${nationName(prevOwner)}에게서 빼앗음)`);

  // 성에 있던 적 장수
  for (const o of officersInCity(s, cityId)) {
    if (o.nation === a.nation) continue;
    if (Math.random() < 0.5) {
      o.nation = a.nation;
      if (o.rank === '군주') o.rank = '장수';
      addLog(s, `${officerName(o.id)}, 사로잡혀 ${nationName(a.nation)}의 장수가 되다`);
    } else {
      const dest = nearestOwnCity(s, cityId, o.nation);
      if (dest) {
        o.city = dest;
        addLog(s, `${officerName(o.id)}, ${CITY_BY_ID[dest].name}(으)로 도망`);
      } else {
        o.city = null;
        o.gone = true;
        addLog(s, `${officerName(o.id)}, 재야로 사라지다`);
      }
    }
  }
  // 부대 장수는 성에 들어감
  for (const oid of a.officers) {
    const o = s.officers[oid];
    o.city = cityId;
    o.armyId = null;
  }
  captureLand(s, cityId, a.nation, a.trail);
  s.armies = s.armies.filter((x) => x.id !== a.id);
  // 같은 성을 노리던 다른 부대들
  for (const other of s.armies) {
    if (armyTarget(other) === cityId && other.nation === a.nation && other.sieging) other.sieging = false;
  }
  if (prevOwner !== NEUTRAL && !s.armies.some((x) => x.nation === prevOwner) && citiesOfCount(s, prevOwner) === 0) {
    addLog(s, `${nationName(prevOwner)}이(가) 멸망하다`);
    const r = rulerOf(s, prevOwner);
    if (r) r.gone = true;
  }
}

function citiesOfCount(s: GameState, nation: string) {
  return Object.values(s.cities).filter((c) => c.owner === nation).length;
}

/** 가장 가까운(거리) 자기 나라 성 */
export function nearestOwnCity(s: GameState, fromCity: string, nation: string): string | null {
  const f = CITY_BY_ID[fromCity];
  let best: string | null = null;
  let bd = Infinity;
  for (const c of Object.values(s.cities)) {
    if (c.owner !== nation || c.id === fromCity) continue;
    const d = Math.hypot(CITY_BY_ID[c.id].x - f.x, CITY_BY_ID[c.id].y - f.y);
    if (d < bd) {
      bd = d;
      best = c.id;
    }
  }
  return best;
}

/** 퇴각: 길로 가장 가까운 자기 성으로 */
export function startRetreat(s: GameState, a: Army) {
  const here = a.pathIndex >= a.path.length - 1 ? armyTarget(a) : a.path[a.pathIndex];
  let best: string[] | null = null;
  let bc = Infinity;
  for (const c of Object.values(s.cities)) {
    if (c.owner !== a.nation) continue;
    const p = here === c.id ? [here] : findPath(s, here, c.id, a.nation, a.unitType);
    if (!p) continue;
    const cost = pathCost(p, a.unitType);
    if (cost < bc) {
      bc = cost;
      best = p;
    }
  }
  if (!best || best.length < 2) {
    if (best && best.length === 1) {
      mergeIntoCity(s, a, best[0]);
      return;
    }
    addLog(s, `${nationName(a.nation)} 부대, 돌아갈 성이 없어 흩어짐`);
    disbandArmy(s, a);
    return;
  }
  a.path = best;
  a.pathIndex = 0;
  a.progress = 0;
  a.sieging = false;
  a.engaged = false;
  a.retreating = true;
}

export function disbandArmy(s: GameState, a: Army) {
  for (const oid of a.officers) {
    const o = s.officers[oid];
    o.armyId = null;
    const dest = nearestOwnCity(s, armyTarget(a), o.nation) ?? (s.cities[a.origin].owner === o.nation ? a.origin : null);
    if (dest) o.city = dest;
    else {
      o.city = null;
      o.gone = true;
    }
  }
  s.armies = s.armies.filter((x) => x.id !== a.id);
}

/** 자기 성에 도착: 병력과 장수가 성에 합류 */
export function mergeIntoCity(s: GameState, a: Army, cityId: string) {
  const c = s.cities[cityId];
  c.troops += a.troops;
  c.food += a.food;
  if (a.weaponKind === 'heavy') {
    c.weapons.horse += a.armed;
    c.weapons.armor += a.armed;
  } else {
    c.weapons[a.weaponKind] += a.armed;
  }
  for (const oid of a.officers) {
    const o = s.officers[oid];
    o.city = cityId;
    o.armyId = null;
  }
  s.armies = s.armies.filter((x) => x.id !== a.id);
  addLog(s, `${nationName(a.nation)} 부대, ${CITY_BY_ID[cityId].name}에 들어감 (병력 ${a.troops})`);
}

/** 부대 군량 소모 */
export function armyEat(a: Army) {
  a.food = Math.max(0, a.food - Math.ceil(a.troops / 20));
}
