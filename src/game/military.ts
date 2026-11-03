// 이동과 전투
import { armyPassesCells, captureLand } from './control';
import { canAttack, onAttacked } from './diplomacy';
import { handleRulerLoss } from './succession';
import {
  Army,
  BattleReportData,
  CITY_BY_ID,
  GameState,
  NEUTRAL,
  PASSES,
  ROADS,
  RoadData,
  UNIT_NAME,
  UnitType,
  WeaponKind,
  addAlert,
  addLog,
  capitalOf,
  findRoad,
  nationName,
  officerName,
  officersInCity,
  otherEnd,
  roadsOf,
  stat,
} from './state';

/** 한 턴 이동 거리(지도 좌표) */
export const SPEED = 45;
export const SPEED_CAV = 60;

// ---------- 길과 경로 ----------
export function isCavalry(t: UnitType) {
  return t === 'cavalry' || t === 'heavy';
}

export function speedOf(unit: UnitType) {
  return isCavalry(unit) ? SPEED_CAV : SPEED;
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

/** 길 종류를 반영한 거리: 산길·고갯길 2배, 바닷길 1.5배 */
export function roadWeight(r: RoadData): number {
  return r.type === 'mountain' || r.type === 'pass' ? 2 : r.type === 'sea' ? 1.5 : 1;
}

export function edgeLength(r: RoadData): number {
  return polyLength(roadPoints(r.a, r.b)) * roadWeight(r);
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
 * 가장 빠른 경로(가중 거리). 중간 성은 모두 자기 나라 성이어야 한다(anyCity 면 상관없음).
 */
export function findPath(s: GameState, from: string, to: string, nation: string, anyCity = false): string[] | null {
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
    if (!anyCity && cur !== from && s.cities[cur].owner !== nation) continue;
    for (const r of roadsOf(cur)) {
      const nx = otherEnd(r, cur);
      const nd = best + edgeLength(r);
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

export function pathLength(path: string[]): number {
  let c = 0;
  for (let i = 1; i < path.length; i++) {
    const r = findRoad(path[i - 1], path[i]);
    if (r) c += edgeLength(r);
  }
  return c;
}

export function turnsFor(path: string[], unit: UnitType): number {
  return Math.max(1, Math.ceil(pathLength(path) / speedOf(unit)));
}

/** 출진 가능한 목적지 (길로 이어진 성, 공격 금지 상대 제외) */
export function reachableTargets(s: GameState, from: string, nation: string): string[] {
  const out: string[] = [];
  for (const id in s.cities) {
    if (id === from) continue;
    const owner = s.cities[id].owner;
    if (owner !== nation && !canAttack(s, nation, owner)) continue;
    if (findPath(s, from, id, nation)) out.push(id);
  }
  return out;
}

/** 이웃 성 (길로 바로 이어진) */
export function neighbors(cityId: string): string[] {
  return ROADS.filter((r) => r.a === cityId || r.b === cityId).map((r) => otherEnd(r, cityId));
}

/** 길로 n 단계 안의 성 */
export function citiesWithin(cityId: string, steps: number): string[] {
  const seen = new Set([cityId]);
  let frontier = [cityId];
  for (let k = 0; k < steps; k++) {
    const next: string[] = [];
    for (const c of frontier) for (const n of neighbors(c)) if (!seen.has(n)) (seen.add(n), next.push(n));
    frontier = next;
  }
  seen.delete(cityId);
  return [...seen];
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

export function armedCount(s: GameState, cityId: string, weapon: WeaponKind | 'heavy', troops: number): number {
  const w = s.cities[cityId].weapons;
  if (weapon === 'heavy') return Math.min(troops, w.horse, w.armor);
  return Math.min(troops, w[weapon]);
}

/** 남은 턴 수 */
export function armyTurnsLeft(a: Army): number {
  if (a.pathIndex >= a.path.length - 1) return 0;
  let remain = 0;
  for (let i = a.pathIndex + 1; i < a.path.length; i++) {
    const r = findRoad(a.path[i - 1], a.path[i]);
    if (r) remain += edgeLength(r);
  }
  remain -= a.progress;
  return Math.max(1, Math.ceil(remain / speedOf(a.unitType)));
}

/** 내 성을 노리는 적 출진 경고 */
export function warnIfThreat(s: GameState, a: Army) {
  const target = armyTarget(a);
  if (a.nation === s.player || a.retreating) return;
  if (s.cities[target].owner !== s.player) return;
  a.warned = true;
  if (armyTurnsLeft(a) <= 1) a.warnedNear = true;
  addAlert(
    s,
    `${nationName(a.nation)}군 ${a.troops.toLocaleString()}이 ${CITY_BY_ID[target].name}(으)로 진군 중 (도착 약 ${armyTurnsLeft(a)}턴 뒤)`,
  );
}

export function createArmy(s: GameState, order: MarchOrder): Army | null {
  const c = s.cities[order.cityId];
  const troops = Math.floor(Math.min(order.troops, c.troops));
  if (troops <= 0) return null;
  const unitType = unitTypeOf(order.weapon);
  const targetOwner = s.cities[order.target].owner;
  if (targetOwner !== c.owner && !canAttack(s, c.owner, targetOwner)) return null;
  const path = findPath(s, order.cityId, order.target, c.owner);
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
  const army = makeArmy(s, {
    nation: c.owner,
    officers: order.officers.slice(0, 3),
    troops,
    armed,
    unitType,
    weaponKind: order.weapon,
    food,
    training: c.training,
    path,
  });
  const lead = army.officers[0] ? officerName(army.officers[0]) : '무명 장수';
  addLog(
    s,
    `${nationName(army.nation)} ${lead}, ${CITY_BY_ID[order.cityId].name}에서 ${CITY_BY_ID[order.target].name}(으)로 출진 (${UNIT_NAME[unitType]} ${troops.toLocaleString()}, 약 ${armyTurnsLeft(army)}턴)`,
  );
  return army;
}

export function makeArmy(
  s: GameState,
  p: {
    nation: string;
    officers: string[];
    troops: number;
    armed: number;
    unitType: UnitType;
    weaponKind: WeaponKind | 'heavy';
    food: number;
    training: number;
    path: string[];
    passThrough?: boolean;
    ignoreTruce?: boolean;
  },
): Army {
  const start = CITY_BY_ID[p.path[0]];
  const army: Army = {
    id: `a${s.nextArmyId++}`,
    nation: p.nation,
    officers: p.officers,
    troops: p.troops,
    armed: p.armed,
    unitType: p.unitType,
    weaponKind: p.weaponKind,
    food: p.food,
    training: p.training,
    origin: p.path[0],
    path: p.path,
    pathIndex: 0,
    progress: 0,
    sieging: false,
    engaged: false,
    retreating: false,
    passThrough: !!p.passThrough,
    ignoreTruce: !!p.ignoreTruce,
    warned: false,
    warnedNear: false,
    trail: [[start.x, start.y]],
  };
  for (const oid of army.officers) {
    const o = s.officers[oid];
    o.city = null;
    o.armyId = army.id;
    o.acted = true;
  }
  s.armies.push(army);
  return army;
}

export function armyPosition(a: Army): [number, number] {
  if (a.pathIndex >= a.path.length - 1) {
    const c = CITY_BY_ID[a.path[a.path.length - 1]];
    return [c.x, c.y];
  }
  const from = a.path[a.pathIndex];
  const to = a.path[a.pathIndex + 1];
  const r = findRoad(from, to)!;
  return pointAlong(roadPoints(from, to), a.progress / edgeLength(r));
}

export function armyTarget(a: Army): string {
  return a.path[a.path.length - 1];
}

/** 부대 한 턴 이동. 도착하면 true */
export function moveArmy(s: GameState, a: Army): boolean {
  if (a.sieging) return true;
  let budget = speedOf(a.unitType);
  const moved: [number, number][] = [armyPosition(a)];
  while (budget > 1e-9 && a.pathIndex < a.path.length - 1) {
    const from = a.path[a.pathIndex];
    const to = a.path[a.pathIndex + 1];
    const r = findRoad(from, to)!;
    const len = edgeLength(r);
    const pts = roadPoints(from, to);
    const remain = len - a.progress;
    const t0 = a.progress / len;
    if (budget >= remain - 1e-9) {
      budget -= remain;
      moved.push(...subPath(pts, t0, 1).slice(1));
      a.pathIndex++;
      a.progress = 0;
      const here = a.path[a.pathIndex];
      if (!a.passThrough && a.pathIndex < a.path.length - 1 && s.cities[here].owner !== a.nation) {
        a.path = a.path.slice(0, a.pathIndex + 1);
        break;
      }
    } else {
      a.progress += budget;
      moved.push(...subPath(pts, t0, a.progress / len).slice(1));
      budget = 0;
    }
  }
  a.trail.push(...moved.slice(1));
  armyPassesCells(s, a.nation, moved);
  const arrived = a.pathIndex >= a.path.length - 1;
  const target = armyTarget(a);
  const threat = a.nation !== s.player && !a.retreating && s.cities[target].owner === s.player;
  if (!arrived && threat) {
    if (!a.warned) {
      // 출진 직후 첫 경고 (도착까지 남은 턴)
      warnIfThreat(s, a);
    } else if (!a.warnedNear && armyTurnsLeft(a) === 1) {
      a.warnedNear = true;
      addAlert(s, `${nationName(a.nation)}군 ${a.troops.toLocaleString()}이 다음 턴 ${CITY_BY_ID[target].name}에 닿는다!`);
    }
  }
  return arrived;
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

export function armyPower(a: Army, field: boolean): number {
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

// ---------- 포로 ----------
/** 장수를 포로로 잡음 */
export function captureOfficer(s: GameState, officerId: string, captor: string, holdCity: string | null, rep?: BattleReportData) {
  const o = s.officers[officerId];
  if (!o || o.status === 'dead' || o.status === 'prisoner') return;
  if (o.armyId) {
    const a = s.armies.find((x) => x.id === o.armyId);
    if (a) a.officers = a.officers.filter((x) => x !== officerId);
  }
  const hold = holdCity && s.cities[holdCity].owner === captor ? holdCity : capitalOf(s, captor);
  o.status = 'prisoner';
  o.captor = captor;
  o.city = hold;
  o.armyId = null;
  o.moveTo = null;
  addLog(s, `${officerName(officerId)}, ${nationName(captor)}에 사로잡히다`);
  rep?.captured.push(officerName(officerId));
  if (o.rank === '군주') handleRulerLoss(s, o.nation, officerId);
}

/** 장수 전사 */
export function killOfficer(s: GameState, officerId: string) {
  const o = s.officers[officerId];
  if (!o) return;
  if (o.armyId) {
    const a = s.armies.find((x) => x.id === o.armyId);
    if (a) a.officers = a.officers.filter((x) => x !== officerId);
  }
  o.status = 'dead';
  o.city = null;
  o.armyId = null;
  addLog(s, `${officerName(officerId)}, 전사하다`);
  if (o.rank === '군주') handleRulerLoss(s, o.nation, officerId);
}

// ---------- 전투 ----------
export function aiSortie(s: GameState, a: Army): boolean {
  return s.cities[armyTarget(a)].troops >= a.troops * 0.8;
}

/** 야전. 공격 측이 이기면 true. mods 는 일기토 보정 */
export function fieldBattle(s: GameState, a: Army, mods: { atk: number; def: number }, rep?: BattleReportData): boolean {
  const cityId = armyTarget(a);
  const c = s.cities[cityId];
  const name = CITY_BY_ID[cityId].name;
  onAttacked(s, c.owner);
  const ap = armyPower(a, true) * mods.atk;
  const dp = cityPower(s, cityId) * mods.def;
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
  let line: string;
  if (atkWin) {
    line = `${name} 야전: ${sideName(a.nation, atkLead)} 승리, ${nationName(c.owner)} 병력 ${dLoss.toLocaleString()} 잃음 (수비군 성으로 물러남)`;
  } else {
    line = `${name} 야전: ${sideName(c.owner, defLead)} 승리, ${nationName(a.nation)} 병력 ${aLoss.toLocaleString()} 잃음`;
  }
  addLog(s, line);
  rep?.lines.push(line);
  // 야전에서 진 쪽 대장은 20% 확률로 포로
  if (Math.random() < 0.2) {
    if (atkWin && defLead && c.owner !== NEUTRAL) captureOfficer(s, defLead, a.nation, null, rep);
    else if (!atkWin && atkLead) captureOfficer(s, atkLead, c.owner, cityId, rep);
  }
  return atkWin;
}

function applyArmyLoss(a: Army, loss: number) {
  const armedRatio = a.troops > 0 ? a.armed / a.troops : 0;
  a.troops = Math.max(0, a.troops - loss);
  a.armed = Math.min(a.troops, Math.round(a.troops * armedRatio));
}

/** 공성전 한 턴 */
export function siegeTurn(s: GameState, a: Army, rep?: BattleReportData) {
  const cityId = armyTarget(a);
  const c = s.cities[cityId];
  const name = CITY_BY_ID[cityId].name;
  if (a.food <= 0) {
    const line = `${name} 공성전: ${nationName(a.nation)} 부대 군량이 바닥나 퇴각`;
    addLog(s, line);
    rep?.lines.push(line);
    startRetreat(s, a);
    return;
  }
  onAttacked(s, c.owner);
  const ap = armyPower(a, false);
  const dp = cityPower(s, cityId) * (1 + c.defense / 50);
  const defLead = defenderLeader(s, cityId);
  const atkLead = a.officers[0] ?? null;
  let line: string;
  if (ap > dp) {
    const loss = Math.ceil(c.troops * 0.15);
    c.defense = Math.max(0, c.defense - 10);
    c.troops = Math.max(0, c.troops - loss);
    applyArmyLoss(a, Math.floor(a.troops * 0.03));
    line = `${name} 공성전: ${sideName(a.nation, atkLead)} 승리, ${nationName(c.owner)} 병력 ${loss.toLocaleString()} 잃음 (방어 ${c.defense})`;
    addLog(s, line);
    rep?.lines.push(line);
    if (c.defense <= 0 || c.troops <= 0) conquer(s, a, rep);
  } else {
    const aLoss = Math.floor(a.troops * 0.1);
    applyArmyLoss(a, aLoss);
    line = `${name} 공성전: ${sideName(c.owner, defLead)} 승리, ${nationName(a.nation)} 병력 ${aLoss.toLocaleString()} 잃음`;
    addLog(s, line);
    rep?.lines.push(line);
    if (a.troops < 100) {
      addLog(s, `${nationName(a.nation)} 부대가 무너져 흩어짐`);
      disbandArmy(s, a);
    }
  }
}

/** 성 함락 */
export function conquer(s: GameState, a: Army, rep?: BattleReportData) {
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
  const line = `${name} 함락! ${nationName(a.nation)}의 땅이 되다 (${nationName(prevOwner)}에게서 빼앗음)`;
  addLog(s, line);
  if (rep) {
    rep.fallen = true;
    rep.lines.push(line);
  }

  // 부대 장수는 성에 들어감
  for (const oid of a.officers) {
    const o = s.officers[oid];
    o.city = cityId;
    o.armyId = null;
  }
  s.armies = s.armies.filter((x) => x.id !== a.id);

  // 성에 있던 적 장수: 충성 40 미만은 넘어올 수 있고, 나머지는 포로
  for (const o of officersInCity(s, cityId)) {
    if (o.nation === a.nation) continue;
    if (o.nation === NEUTRAL || o.loyalty < 40) {
      if (Math.random() < 0.5) {
        o.nation = a.nation;
        o.loyalty = 50;
        if (o.rank === '군주' || o.rank === '족장' || o.rank === '군장') o.rank = '장수';
        addLog(s, `${officerName(o.id)}, ${nationName(a.nation)}에 항복해 장수가 되다`);
        continue;
      }
    }
    if (o.nation === NEUTRAL) {
      // 중립 족장은 재야로
      o.status = 'ronin';
      o.nation = NEUTRAL;
      o.foundBy = [];
      continue;
    }
    captureOfficer(s, o.id, a.nation, cityId, rep);
  }
  // 성에 갇혀 있던 포로
  for (const o of Object.values(s.officers)) {
    if (o.status !== 'prisoner' || o.city !== cityId) continue;
    if (o.nation === a.nation) {
      o.status = 'active';
      o.captor = null;
      addLog(s, `${officerName(o.id)}, 풀려나 돌아오다`);
    } else {
      o.captor = a.nation;
    }
  }
  captureLand(s, cityId, a.nation, a.trail);
  for (const other of s.armies) {
    if (armyTarget(other) === cityId && other.nation === a.nation && other.sieging) other.sieging = false;
  }
  if (prevOwner !== NEUTRAL && !s.armies.some((x) => x.nation === prevOwner) && citiesCount(s, prevOwner) === 0) {
    addLog(s, `${nationName(prevOwner)}이(가) 멸망하다`);
    for (const o of Object.values(s.officers)) {
      if (o.nation === prevOwner && (o.status === 'active' || o.status === 'moving')) {
        o.status = 'ronin';
        o.nation = NEUTRAL;
        o.rank = '재야';
        o.foundBy = [];
        if (!o.city) o.city = cityId;
      }
    }
  }
}

function citiesCount(s: GameState, nation: string) {
  return Object.values(s.cities).filter((c) => c.owner === nation).length;
}

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

export function startRetreat(s: GameState, a: Army) {
  const here = a.pathIndex >= a.path.length - 1 ? armyTarget(a) : a.path[a.pathIndex];
  let best: string[] | null = null;
  let bc = Infinity;
  for (const c of Object.values(s.cities)) {
    if (c.owner !== a.nation) continue;
    const p = here === c.id ? [here] : findPath(s, here, c.id, a.nation);
    if (!p) continue;
    const cost = pathLength(p);
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
  a.passThrough = false;
}

export function disbandArmy(s: GameState, a: Army) {
  for (const oid of a.officers) {
    const o = s.officers[oid];
    o.armyId = null;
    const dest = nearestOwnCity(s, armyTarget(a), o.nation) ?? (s.cities[a.origin].owner === o.nation ? a.origin : null);
    if (dest) o.city = dest;
    else {
      o.city = armyTarget(a);
      o.status = 'ronin';
      o.nation = NEUTRAL;
      o.foundBy = [];
    }
  }
  s.armies = s.armies.filter((x) => x.id !== a.id);
}

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
  addLog(s, `${nationName(a.nation)} 부대, ${CITY_BY_ID[cityId].name}에 들어감 (병력 ${a.troops.toLocaleString()})`);
}

export function armyEat(a: Army) {
  a.food = Math.max(0, a.food - Math.ceil(a.troops / 20));
}
