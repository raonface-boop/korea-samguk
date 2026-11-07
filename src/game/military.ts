// 이동과 전투
import routesData from '../data/routes.json';
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
  APT_KEYS,
  APT_MULT,
  APT_ORDER,
  AptGrade,
  AptKey,
  ArmyOrder,
  addAlert,
  addAptExp,
  aptOf,
  clamp100,
  clearPosts,
  emptyWeapons,
  Weapons,
  WEAPON_KINDS,
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

/** 한 턴 이동 거리(지도 좌표), 병과 속도 배율을 곱함 */
export const SPEED = 45;

// ---------- 병과 ----------
export type UnitFamily = 'inf' | 'arc' | 'cav';
export const FAMILY_NAME: Record<UnitFamily, string> = { inf: '보병계', arc: '궁계', cav: '기병계' };

export interface UnitStat {
  /** 공격·방어·속도·공성 배율 */
  atk: number;
  def: number;
  speed: number;
  siege: number;
  /** 병사 1명당 필요한 무기 */
  weapons: WeaponKind[];
  family: UnitFamily;
  /** 부대당 병력 상한 (장수 상한과 따로) */
  cap?: number;
  /** 이 나라만 쓸 수 있음 */
  only?: string;
  note?: string;
}

export const UNIT_STATS: Record<UnitType, UnitStat> = {
  infantry: { atk: 1.0, def: 1.0, speed: 1.0, siege: 1.2, weapons: [], family: 'inf', note: '산·숲 싸움 +20%, 성 수비 +20%' },
  spear: { atk: 1.1, def: 1.15, speed: 1.0, siege: 1.1, weapons: ['spear'], family: 'inf', note: '기병 돌격을 막음' },
  siege: { atk: 0.6, def: 0.7, speed: 0.7, siege: 3.0, weapons: [], family: 'inf', cap: 2000, note: '성벽을 크게 깎음' },
  archer: { atk: 1.05, def: 0.85, speed: 1.0, siege: 0.8, weapons: ['bow'], family: 'arc' },
  crossbow: { atk: 1.2, def: 0.9, speed: 0.9, siege: 0.9, weapons: ['crossbow'], family: 'arc', note: '중장기병에 강함' },
  cavalry: { atk: 1.2, def: 0.9, speed: 1.5, siege: 0.6, weapons: ['horse'], family: 'cav' },
  heavy: { atk: 1.35, def: 1.2, speed: 1.2, siege: 0.6, weapons: ['horse', 'armor'], family: 'cav' },
  gaema: { atk: 1.5, def: 1.35, speed: 1.15, siege: 0.6, weapons: ['horse', 'armor'], family: 'cav', only: 'goguryeo', note: '고구려 특수 병과' },
  xianbei: { atk: 1.45, def: 1.3, speed: 1.25, siege: 0.6, weapons: ['horse', 'armor'], family: 'cav', only: 'yan', note: '전연 특수 병과' },
};

/** 병과 → 적성 계열 */
export const UNIT_APT: Record<UnitType, AptKey> = {
  infantry: '창',
  spear: '창',
  archer: '궁',
  crossbow: '궁',
  cavalry: '기',
  heavy: '기',
  gaema: '기',
  xianbei: '기',
  siege: '병기',
};
/** 적성 계열 이름 */
export const APT_NAME: Record<AptKey, string> = { 창: '창병', 궁: '궁병', 기: '기병', 병기: '병기', 수: '수군', 방: '방어' };

/** 대장의 그 병과 적성 배율 */
export function leaderAptMult(s: GameState, officerId: string | null | undefined, unit: UnitType): number {
  return officerId ? APT_MULT[aptOf(s, officerId, UNIT_APT[unit])] : 1;
}

/** 철갑 두른 중장기병 */
const HEAVY_CAV = new Set<UnitType>(['heavy', 'gaema', 'xianbei']);
const BEATS: Record<UnitFamily, UnitFamily> = { cav: 'inf', inf: 'arc', arc: 'cav' };

/** 상성: 공격 병과가 방어 병과를 칠 때의 배율 */
export function matchup(atk: UnitType, def: UnitType): number {
  if (atk === 'crossbow' && HEAVY_CAV.has(def)) return 1.4;
  const fa = UNIT_STATS[atk].family;
  const fd = UNIT_STATS[def].family;
  if ((atk === 'spear' && fd === 'cav') || (def === 'spear' && fa === 'cav')) return 1.0;
  if (fa === fd) return 1.0;
  if (BEATS[fa] === fd) return 1.3;
  if (HEAVY_CAV.has(atk) && def === 'archer') return 0.9;
  return 0.75;
}

/** 상성 요약 한 줄: "기병계에 강함 · 궁계에 약함" */
export function matchupSummary(u: UnitType): string {
  const f = UNIT_STATS[u].family;
  const weak = (Object.keys(BEATS) as UnitFamily[]).find((k) => BEATS[k] === f)!;
  const parts = [`${FAMILY_NAME[BEATS[f]]}에 강함`, `${FAMILY_NAME[weak]}에 약함`];
  if (u === 'spear') parts.push('기병계와 대등');
  if (u === 'crossbow') parts.push('중장기병에 크게 강함');
  if (HEAVY_CAV.has(u)) parts.push('궁병에 덜 약함');
  return parts.join(' · ');
}

export function isCavalry(t: UnitType) {
  return UNIT_STATS[t].family === 'cav';
}

export function speedOf(unit: UnitType) {
  return SPEED * UNIT_STATS[unit].speed;
}

/** 대장 관직에 따른 부대 병력 상한 (공성병은 따로 2,000) */
export function troopCap(s: GameState, officerId: string, unit: UnitType): number {
  const rank = s.officers[officerId]?.rank ?? '';
  const byRank = rank === '군주' ? 10000 : rank === '태수' ? 6000 : rank === '장수' ? 4000 : 3000;
  const u = UNIT_STATS[unit].cap;
  return u ? Math.min(byRank, u) : byRank;
}

/** 그 성 무기로 이 병과를 몇 명까지 갖출 수 있나 (무기가 필요 없으면 무한) */
export function weaponLimit(s: GameState, cityId: string, unit: UnitType): number {
  const w = s.cities[cityId].weapons;
  const need = UNIT_STATS[unit].weapons;
  return need.length ? Math.min(...need.map((k) => w[k])) : Infinity;
}

// ---------- 병기 연구 ----------
export const RESEARCH_SPECIAL_NEED = 1200;
export const SPECIAL_UNIT: Record<string, UnitType> = { goguryeo: 'gaema', yan: 'xianbei' };

/** 일반 연구 단계: [필요 점수, 열리는 병과] */
export function researchSteps(nation: string): { need: number; units: UnitType[] }[] {
  return [
    { need: 100, units: ['spear', 'siege'] },
    { need: 250, units: ['crossbow'] },
    { need: nation === 'gaya' ? 300 : 450, units: ['heavy'] },
  ];
}

function researchOf(s: GameState, nation: string) {
  return s.research?.[nation] ?? { points: 0, special: 0 };
}

export function heavyUnlocked(s: GameState, nation: string): boolean {
  const steps = researchSteps(nation);
  return researchOf(s, nation).points >= steps[steps.length - 1].need;
}

/** 지금 쓸 수 있는 병과 */
export function unlockedUnits(s: GameState, nation: string): UnitType[] {
  const r = researchOf(s, nation);
  const out: UnitType[] = ['infantry', 'archer', 'cavalry'];
  for (const st of researchSteps(nation)) if (r.points >= st.need) out.push(...st.units);
  const sp = SPECIAL_UNIT[nation];
  if (sp && heavyUnlocked(s, nation) && r.special >= RESEARCH_SPECIAL_NEED) out.push(sp);
  return out;
}

/** 연구 단계 설명과 다음 단계까지 남은 점수 */
export function researchStatus(s: GameState, nation: string): { points: number; special: number; text: string; next: string | null } {
  const r = researchOf(s, nation);
  const steps = researchSteps(nation);
  const done = steps.filter((st) => r.points >= st.need);
  const text = done.length ? done.map((st) => st.units.map((u) => UNIT_NAME[u]).join('·')).join(' → ') : '기본 병과만';
  const nextStep = steps.find((st) => r.points < st.need);
  let next: string | null = null;
  if (nextStep) next = `${nextStep.units.map((u) => UNIT_NAME[u]).join('·')}까지 ${nextStep.need - r.points}점`;
  else {
    const sp = SPECIAL_UNIT[nation];
    if (sp && r.special < RESEARCH_SPECIAL_NEED) next = `${UNIT_NAME[sp]}까지 특수 연구 ${RESEARCH_SPECIAL_NEED - r.special}점`;
  }
  return { points: r.points, special: r.special, text, next };
}

/** routes.json: 지형을 따라 낸 길 점들 */
const ROUTE_PTS: Record<string, [number, number][]> = {};
for (const r of routesData as { a: string; b: string; pts: number[][] }[]) {
  ROUTE_PTS[`${r.a}|${r.b}`] = r.pts.map((p) => [p[0], p[1]] as [number, number]);
}

/** 두 성 사이 길 위 점들 (from → to 방향). routes.json 에 없으면 곧은 선 (고갯길은 고개를 거침) */
export function roadPoints(from: string, to: string): [number, number][] {
  const fwd = ROUTE_PTS[`${from}|${to}`];
  if (fwd) return fwd;
  const rev = ROUTE_PTS[`${to}|${from}`];
  if (rev) return [...rev].reverse();
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
export interface MarchUnit {
  /** 대장 */
  officer: string;
  /** 부장 0~2명 */
  deputies?: string[];
  unitType: UnitType;
  troops: number;
  /** 부대 명령 (없으면 싸움·공성) */
  order?: ArmyOrder;
}

/** 출진할 수 있는 장수: 그 성에 있고 이번 턴 명령을 안 받았고 다치지 않음 */
export function canMarch(s: GameState, officerId: string, cityId: string): boolean {
  const o = s.officers[officerId];
  const owner = s.cities[cityId].owner;
  return !!o && o.city === cityId && o.nation === owner && !o.acted && o.status === 'active' && (o.injuredUntil ?? -1) < s.turn;
}
export interface MarchOrder {
  cityId: string;
  target: string;
  units: MarchUnit[];
  food: number;
  gold: number;
}

/** 병과에 드는 무기를 성에서 빼거나(−) 돌려놓음(+) */
function moveWeapons(c: { weapons: Record<WeaponKind, number> }, unit: UnitType, n: number) {
  for (const k of UNIT_STATS[unit].weapons) c.weapons[k] = Math.max(0, c.weapons[k] + n);
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

/** 출진: 부대마다 Army 를 만들어 같은 길로 함께 보냄. 하나도 못 만들면 null */
export function createArmy(s: GameState, order: MarchOrder): Army[] | null {
  const c = s.cities[order.cityId];
  const targetOwner = s.cities[order.target].owner;
  if (targetOwner !== c.owner && !canAttack(s, c.owner, targetOwner)) return null;
  const path = findPath(s, order.cityId, order.target, c.owner);
  if (!path || path.length < 2) return null;
  const allowed = unlockedUnits(s, c.owner);
  // 병력·무기를 실제로 갖출 수 있는 만큼으로 줄임
  const units: MarchUnit[] = [];
  let pool = c.troops;
  const used = new Set<string>();
  for (const u of order.units.slice(0, 5)) {
    if (used.has(u.officer) || !canMarch(s, u.officer, order.cityId)) continue;
    if (!allowed.includes(u.unitType)) continue;
    const troops = Math.floor(Math.min(u.troops, pool, troopCap(s, u.officer, u.unitType), weaponLimit(s, order.cityId, u.unitType)));
    if (troops <= 0) continue;
    used.add(u.officer);
    const deputies = (u.deputies ?? []).filter((d) => d !== u.officer && !used.has(d) && canMarch(s, d, order.cityId)).slice(0, 2);
    for (const d of deputies) used.add(d);
    moveWeapons(c, u.unitType, -troops);
    pool -= troops;
    units.push({ ...u, deputies, troops });
  }
  if (!units.length) return null;
  const total = units.reduce((a, u) => a + u.troops, 0);
  const food = Math.floor(Math.max(0, Math.min(order.food, c.food)));
  const gold = Math.floor(Math.max(0, Math.min(order.gold, c.gold)));
  c.food -= food;
  c.gold -= gold;
  c.troops -= total;
  const armies: Army[] = [];
  let foodLeft = food;
  let goldLeft = gold;
  units.forEach((u, i) => {
    const last = i === units.length - 1;
    const f = last ? foodLeft : Math.floor((food * u.troops) / total);
    const g = last ? goldLeft : Math.floor((gold * u.troops) / total);
    foodLeft -= f;
    goldLeft -= g;
    armies.push(
      makeArmy(s, {
        nation: c.owner,
        officers: [u.officer, ...(u.deputies ?? [])],
        troops: u.troops,
        armed: u.troops,
        unitType: u.unitType,
        food: f,
        gold: g,
        training: c.training,
        path,
        order: u.order,
      }),
    );
  });
  const desc = units.map((u) => `${officerName(u.officer)} ${UNIT_NAME[u.unitType]} ${u.troops.toLocaleString()}`).join(', ');
  addLog(
    s,
    `${nationName(c.owner)}군, ${CITY_BY_ID[order.cityId].name}에서 ${CITY_BY_ID[order.target].name}(으)로 출진 (${desc}, 약 ${armyTurnsLeft(armies[0])}턴)`,
  );
  return armies;
}

export function makeArmy(
  s: GameState,
  p: {
    nation: string;
    officers: string[];
    troops: number;
    armed: number;
    unitType: UnitType;
    food: number;
    gold?: number;
    training: number;
    path: string[];
    passThrough?: boolean;
    ignoreTruce?: boolean;
    order?: ArmyOrder;
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
    food: p.food,
    gold: p.gold ?? 0,
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
    order: p.order ?? { engage: 'fight', arrive: 'siege' },
    morale: 100,
    startTroops: p.troops,
    clash: null,
    clashTurns: 0,
    hold: 0,
    siegeTurns: 0,
  };
  for (const oid of army.officers) {
    const o = s.officers[oid];
    clearPosts(s, oid);
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

// ---------- 부대 능력 (대장·부장 중 최고값) ----------
export interface UnitStats {
  leadership: number;
  war: number;
  intelligence: number;
  /** 그 값을 가진 장수 */
  by: { leadership: string | null; war: string | null; intelligence: string | null };
  /** 계열마다 부대원 중 가장 높은 등급과 그 장수 */
  apt: Record<AptKey, { grade: AptGrade; id: string | null }>;
}

/** 부대 능력: 통솔·무력·지력은 부대원 중 각각 가장 높은 값, 계열 적성은 가장 높은 등급. 장수가 없으면 40·B */
export function unitStatsOf(s: GameState | undefined, ids: string[]): UnitStats {
  const best = (key: 'leadership' | 'war' | 'intelligence') => {
    let v = -1;
    let id: string | null = null;
    for (const o of ids) {
      const x = stat(o, key);
      if (x > v) {
        v = x;
        id = o;
      }
    }
    return { v: id ? v : 40, id };
  };
  const L = best('leadership');
  const W = best('war');
  const I = best('intelligence');
  const apt = {} as UnitStats['apt'];
  for (const k of APT_KEYS) {
    let g: AptGrade = 'B';
    let id: string | null = null;
    for (const o of ids) {
      const x = s ? aptOf(s, o, k) : 'B';
      if (!id || APT_ORDER.indexOf(x) > APT_ORDER.indexOf(g)) {
        g = x;
        id = o;
      }
    }
    apt[k] = { grade: g, id };
  }
  return { leadership: L.v, war: W.v, intelligence: I.v, by: { leadership: L.id, war: W.id, intelligence: I.id }, apt };
}
export const unitStats = (a: Army, s?: GameState) => unitStatsOf(s, a.officers);

/** 부대가 쓰는 병과 적성 배율 (부대원 중 가장 높은 등급) */
export function unitAptMult(s: GameState | undefined, ids: string[], unit: UnitType): number {
  return s && ids.length ? APT_MULT[unitStatsOf(s, ids).apt[UNIT_APT[unit]].grade] : 1;
}

// ---------- 전투력 ----------
export function leaderLeadership(ids: string[]): number {
  return unitStatsOf(undefined, ids).leadership;
}
export function leaderWar(ids: string[]): number {
  return unitStatsOf(undefined, ids).war;
}

const trainMod = (training: number) => 0.5 + training / 100;

/** 공격력 = 병력 × 공격 배율 × (0.5 + 무력/100) × 훈련 보정 */
export function unitAttack(unit: UnitType, troops: number, war: number, training: number): number {
  return troops * UNIT_STATS[unit].atk * (0.5 + war / 100) * trainMod(training);
}
/** 방어력 = 병력 × 방어 배율 × (0.5 + 통솔/100) */
export function unitDefense(unit: UnitType, troops: number, leadership: number): number {
  return troops * UNIT_STATS[unit].def * (0.5 + leadership / 100);
}

/** 산길·고갯길로 들어온 보병은 +20% */
function terrainMod(a: Army): number {
  const lastRoad = a.path.length >= 2 ? findRoad(a.path[a.path.length - 2], a.path[a.path.length - 1]) : undefined;
  const viaMountain = lastRoad?.type === 'mountain' || lastRoad?.type === 'pass';
  return a.unitType === 'infantry' && viaMountain ? 1.2 : 1;
}

/** 부대 공격력·방어력 (부대 능력 최고값 + 부대 최고 적성 배율). s 가 없으면 적성 배율 없이 */
export function armyAttack(a: Army, s?: GameState): number {
  const u = unitStats(a, s);
  return unitAttack(a.unitType, a.troops, u.war, a.training) * terrainMod(a) * unitAptMult(s, a.officers, a.unitType);
}
export function armyDefense(a: Army, s?: GameState): number {
  const u = unitStats(a, s);
  return unitDefense(a.unitType, a.troops, u.leadership) * unitAptMult(s, a.officers, a.unitType);
}

/** 공격 부대 싸움 힘: 공격력 × 수비군(보병) 상대 상성 */
export function armyPower(a: Army, field: boolean, s?: GameState): number {
  const atk = armyAttack(a, s) * matchup(a.unitType, 'infantry');
  return field ? atk : (atk + armyDefense(a, s)) / 2;
}

/** 수비 측 대장: 그 성에서 통솔이 가장 높은 장수 */
export function defenderLeader(s: GameState, cityId: string): string | null {
  const owner = s.cities[cityId].owner;
  const list = officersInCity(s, cityId).filter((o) => o.nation === owner);
  list.sort((a, b) => stat(b.id, 'leadership') - stat(a.id, 'leadership'));
  return list[0]?.id ?? null;
}

/** 성 수비군(보병) 공격력 / 방어력 (성 수비 +20%) */
export function cityAttack(s: GameState, cityId: string): number {
  const c = s.cities[cityId];
  const lead = defenderLeader(s, cityId);
  return unitAttack('infantry', c.troops, lead ? stat(lead, 'war') : 40, c.training);
}
export function cityDefense(s: GameState, cityId: string): number {
  const c = s.cities[cityId];
  const lead = defenderLeader(s, cityId);
  // 성 수비 +20%, 수비 대장의 '방' 적성 배율
  const apt = lead ? APT_MULT[aptOf(s, lead, '방')] : 1;
  return unitDefense('infantry', c.troops, lead ? stat(lead, 'leadership') : 40) * 1.2 * apt;
}

/** 수비 측 싸움 힘 (상대 병과와의 상성 포함). 야전은 공격력, 농성은 방어력 */
export function cityPower(s: GameState, cityId: string, vs: UnitType = 'infantry', field = false): number {
  const m = matchup('infantry', vs);
  return field ? cityAttack(s, cityId) * m : (cityDefense(s, cityId) + cityAttack(s, cityId) * m) / 2;
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
    if (a) removeFromArmy(s, a, officerId);
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
    if (a) removeFromArmy(s, a, officerId);
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
  const ap = armyPower(a, true, s) * mods.atk;
  const dp = cityPower(s, cityId, a.unitType, true) * mods.def;
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
  battleExp(s, a, atkWin, atkLead, defLead);
  // 야전에서 진 쪽 대장은 20% 확률로 포로
  if (Math.random() < 0.2) {
    if (atkWin && defLead && c.owner !== NEUTRAL) captureOfficer(s, defLead, a.nation, null, rep);
    else if (!atkWin && atkLead) captureOfficer(s, atkLead, c.owner, cityId, rep);
  }
  return atkWin;
}

/** 이기면 적성 경험 +15: 공격은 그 부대가 쓴 계열 등급을 가진 장수에게, 수비는 '방' */
function battleExp(s: GameState, a: Army, atkWin: boolean, _atkLead: string | null, defLead: string | null) {
  if (atkWin && a.officers.length) {
    const key = UNIT_APT[a.unitType];
    const who = unitStats(a, s).apt[key].id;
    if (who) addAptExp(s, who, key, 15, APT_NAME[key]);
  } else if (!atkWin && defLead) addAptExp(s, defLead, '방', 15, APT_NAME['방']);
}

/** 부대에서 장수가 빠졌을 때: 대장이 빠졌으면 남은 부장 중 통솔이 가장 높은 장수가 대장. 아무도 없으면 흩어짐 */
function removeFromArmy(s: GameState, a: Army, officerId: string) {
  const wasLead = a.officers[0] === officerId;
  a.officers = a.officers.filter((x) => x !== officerId);
  if (!a.officers.length) {
    addLog(s, `${nationName(a.nation)} 부대, 장수를 모두 잃고 무너져 흩어짐`);
    disbandArmy(s, a);
    return;
  }
  if (wasLead) {
    const next = [...a.officers].sort((x, y) => stat(y, 'leadership') - stat(x, 'leadership'))[0];
    a.officers = [next, ...a.officers.filter((x) => x !== next)];
    addLog(s, `${officerName(next)}, 대장을 이어받음`);
  }
}

/** 부대를 출발 성으로 돌려보냄 (지나던 길을 되돌아 findPath 로). 출발 성을 잃었으면 가장 가까운 내 성으로 */
export function retreatToOrigin(s: GameState, armyId: string): boolean {
  const a = s.armies.find((x) => x.id === armyId);
  if (!a || a.retreating) return false;
  if (s.cities[a.origin]?.owner !== a.nation) {
    startRetreat(s, a);
    return true;
  }
  const atNode = a.pathIndex >= a.path.length - 1 || a.progress <= 0;
  const here = a.path[a.pathIndex];
  let path: string[] | null;
  let progress = 0;
  if (atNode) {
    path = here === a.origin ? [here] : findPath(s, here, a.origin, a.nation);
  } else {
    // 길 가운데: 지나온 성으로 되돌아간 뒤 출발 성까지
    const next = a.path[a.pathIndex + 1];
    const back = here === a.origin ? [here] : findPath(s, here, a.origin, a.nation);
    path = back ? [next, ...back] : null;
    const r = findRoad(here, next);
    progress = r ? Math.max(0, edgeLength(r) - a.progress) : 0;
  }
  if (!path) {
    startRetreat(s, a);
    return true;
  }
  if (path.length < 2) {
    mergeIntoCity(s, a, path[0]);
    return true;
  }
  a.path = path;
  a.pathIndex = 0;
  a.progress = progress;
  a.sieging = false;
  a.engaged = false;
  a.retreating = true;
  a.passThrough = false;
  addLog(s, `${nationName(a.nation)} 부대, ${CITY_BY_ID[a.origin].name}(으)로 퇴각`);
  return true;
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
  const wallBefore = c.defense;
  // 공성 첫 턴: 일기토
  let duelMod = { atk: 1, def: 1 };
  if (a.siegeTurns === 0 && !rep?.duel) {
    const defIds = officersInCity(s, cityId)
      .filter((o) => o.nation === c.owner)
      .map((o) => o.id);
    const d = tryDuel(s, a, a.officers, null, defIds, cityId, name, rep);
    if (d === 'a') duelMod = { atk: 1.1, def: 0.9 };
    if (d === 'b') duelMod = { atk: 0.9, def: 1.1 };
  }
  a.siegeTurns = (a.siegeTurns ?? 0) + 1;
  if (!s.armies.includes(a)) return;
  const ap = armyPower(a, false, s) * duelMod.atk;
  const dp = cityPower(s, cityId, a.unitType, false) * (1 + c.defense / 50) * duelMod.def;
  const defLead = defenderLeader(s, cityId);
  const atkLead = a.officers[0] ?? null;
  let line: string;
  if (ap > dp) {
    const loss = Math.ceil(c.troops * 0.15);
    c.defense = Math.max(0, Math.round(c.defense - 10 * UNIT_STATS[a.unitType].siege));
    c.troops = Math.max(0, c.troops - loss);
    applyArmyLoss(a, Math.floor(a.troops * 0.03));
    line = `${name} 공성전: ${sideName(a.nation, atkLead)} 승리, ${nationName(c.owner)} 병력 ${loss.toLocaleString()} 잃음 (방어 ${c.defense})`;
    addLog(s, line);
    rep?.lines.push(line);
    battleExp(s, a, true, atkLead, defLead);
    if (rep) {
      rep.wall = [wallBefore, c.defense];
      rep.result = '계속';
    }
    if (c.defense <= 0 || c.troops <= 0) {
      conquer(s, a, rep);
      if (rep) rep.result = '함락';
    }
  } else {
    const aLoss = Math.floor(a.troops * 0.1);
    applyArmyLoss(a, aLoss);
    line = `${name} 공성전: ${sideName(c.owner, defLead)} 승리, ${nationName(a.nation)} 병력 ${aLoss.toLocaleString()} 잃음`;
    addLog(s, line);
    rep?.lines.push(line);
    battleExp(s, a, false, atkLead, defLead);
    if (rep) {
      rep.wall = [wallBefore, c.defense];
      rep.result = '계속';
    }
    if (a.troops < 100) {
      addLog(s, `${nationName(a.nation)} 부대가 무너져 흩어짐`);
      if (rep) rep.result = '패배';
      disbandArmy(s, a);
    }
  }
}

// ---------- 일기토 ----------
/**
 * 교전·공성 첫 턴: 양쪽 부대 무력(최고값)이 모두 80 이상이면 15% 확률로 일기토.
 * 무력 + 무작위(0~20) 비교. 진 쪽 장수는 다침(3턴 출진 불가) 또는 5% 전사, 진 쪽 부대 사기 −20 (성 쪽은 훈련도 −20).
 * 이긴 쪽 'a' | 'b', 없으면 null
 */
export function tryDuel(
  s: GameState,
  armyA: Army,
  idsA: string[],
  armyB: Army | null,
  idsB: string[],
  cityId: string,
  place: string,
  rep?: BattleReportData,
): 'a' | 'b' | null {
  if (!idsA.length || !idsB.length) return null;
  const ua = unitStatsOf(s, idsA);
  const ub = unitStatsOf(s, idsB);
  if (ua.war < 80 || ub.war < 80 || Math.random() >= 0.15) return null;
  const pa = ua.by.war!;
  const pb = ub.by.war!;
  const ra = ua.war + Math.random() * 20;
  const rb = ub.war + Math.random() * 20;
  const aWin = ra >= rb;
  const loser = aWin ? pb : pa;
  let fate: string;
  if (Math.random() < 0.05) {
    fate = '전사';
    killOfficer(s, loser);
  } else {
    fate = '다침 (3턴 출진 불가)';
    const o = s.officers[loser];
    if (o) o.injuredUntil = s.turn + 3;
  }
  const loseArmy = aWin ? armyB : armyA;
  if (loseArmy) loseArmy.morale = Math.max(0, loseArmy.morale - 20);
  else s.cities[cityId].training = Math.max(0, s.cities[cityId].training - 20);
  const text = `${officerName(pa)} 대 ${officerName(pb)} — ${officerName(aWin ? pa : pb)} 승리, ${officerName(loser)} ${fate}`;
  const line = `${place} 일기토: ${text}`;
  addLog(s, line);
  if (rep) {
    rep.duel = text;
    rep.lines.push(line);
  }
  return aWin ? 'a' : 'b';
}

// ---------- 길 위 교전 ----------
/** 이 거리(지도 좌표) 안으로 가까워지면 교전 */
export const CLASH_DIST = 6;

/** 부대가 있는 길(구간)·성 자리 */
function roadSpots(a: Army): string[] {
  if (a.pathIndex >= a.path.length - 1 || a.progress <= 0) return [`n:${a.path[Math.min(a.pathIndex, a.path.length - 1)]}`];
  const x = a.path[a.pathIndex];
  const y = a.path[a.pathIndex + 1];
  return [`e:${[x, y].sort().join('|')}`, `n:${x}`, `n:${y}`];
}

function hostile(s: GameState, a: Army, b: Army) {
  return a.nation !== b.nation && (canAttack(s, a.nation, b.nation) || canAttack(s, b.nation, a.nation));
}

/**
 * 같은 길 위에서 가까워진 적 부대끼리 교전을 시작. 둘 다 '피함'이면 덤비지 않고 한 턴 멈춤.
 */
export function detectClashes(s: GameState) {
  const list = s.armies.filter((a) => !a.clash);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.clash || b.clash || !hostile(s, a, b)) continue;
      const pa = armyPosition(a);
      const pb = armyPosition(b);
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > CLASH_DIST) continue;
      const sa = roadSpots(a);
      const sb = roadSpots(b);
      const edgeA = sa.find((x) => x.startsWith('e:'));
      const edgeB = sb.find((x) => x.startsWith('e:'));
      const same = (edgeA && edgeA === edgeB) || sa.some((x) => x.startsWith('n:') && sb.includes(x) && (!edgeA || !edgeB));
      if (!same) continue;
      if (a.order?.engage === 'avoid' && b.order?.engage === 'avoid') {
        a.hold = 1;
        b.hold = 1;
        continue;
      }
      a.clash = b.id;
      b.clash = a.id;
      a.clashTurns = 0;
      b.clashTurns = 0;
      a.sieging = false;
      b.sieging = false;
      addLog(s, `${nationName(a.nation)}군과 ${nationName(b.nation)}군이 길 위에서 맞붙음`);
    }
  }
}

/** 교전한 두 부대가 있는 곳 이름 */
export function clashPlace(a: Army): string {
  if (a.pathIndex >= a.path.length - 1 || a.progress <= 0) return CITY_BY_ID[a.path[Math.min(a.pathIndex, a.path.length - 1)]].name;
  return `${CITY_BY_ID[a.path[a.pathIndex]].name} ↔ ${CITY_BY_ID[a.path[a.pathIndex + 1]].name} 사이 길`;
}

function endClash(a: Army, b: Army | undefined) {
  a.clash = null;
  a.clashTurns = 0;
  if (b) {
    b.clash = null;
    b.clashTurns = 0;
  }
}

/**
 * 교전 한 턴: 야전 계산을 한 턴 몫(1/3)으로 나눠 양쪽 병력을 깎고, 사기 0 이나 병력 10% 아래가 된 쪽이 무너져 물러남.
 * 첫 턴엔 일기토가 날 수 있음.
 */
export function clashTurn(s: GameState, a: Army, b: Army, rep?: BattleReportData) {
  const place = clashPlace(a);
  if (a.clashTurns === 0) tryDuel(s, a, a.officers, b, b.officers, a.path[a.pathIndex], place, rep);
  if (!s.armies.includes(a) || !s.armies.includes(b)) {
    const alive = s.armies.includes(a) ? a : s.armies.includes(b) ? b : null;
    if (alive) endClash(alive, undefined);
    return;
  }
  a.clashTurns++;
  b.clashTurns++;
  const pa = armyAttack(a, s) * matchup(a.unitType, b.unitType) * (0.5 + a.morale / 200);
  const pb = armyAttack(b, s) * matchup(b.unitType, a.unitType) * (0.5 + b.morale / 200);
  const aWin = pa >= pb;
  const ratio = aWin ? pa / Math.max(1, pb) : pb / Math.max(1, pa);
  const k = Math.min(2, Math.sqrt(ratio));
  const loserRate = Math.min(0.6, 0.3 * k) / 3;
  const winnerRate = Math.max(0.03, 0.1 / k) / 3;
  const aLoss = Math.floor(a.troops * (aWin ? winnerRate : loserRate));
  const bLoss = Math.floor(b.troops * (aWin ? loserRate : winnerRate));
  applyArmyLoss(a, aLoss);
  applyArmyLoss(b, bLoss);
  a.morale = Math.max(0, a.morale - (aWin ? 5 : 15));
  b.morale = Math.max(0, b.morale - (aWin ? 15 : 5));
  const line = `${place} 교전: ${sideName(a.nation, a.officers[0] ?? null)} −${aLoss.toLocaleString()} · ${sideName(b.nation, b.officers[0] ?? null)} −${bLoss.toLocaleString()}`;
  addLog(s, line);
  rep?.lines.push(line);
  const brokeA = a.morale <= 0 || a.troops < a.startTroops * 0.1;
  const brokeB = b.morale <= 0 || b.troops < b.startTroops * 0.1;
  if (rep) rep.result = '계속';
  if (brokeA || brokeB) {
    endClash(a, b);
    for (const [x, broke] of [
      [a, brokeA],
      [b, brokeB],
    ] as [Army, boolean][]) {
      if (!broke) continue;
      const l = `${nationName(x.nation)} 부대가 무너져 물러남`;
      addLog(s, l);
      rep?.lines.push(l);
      startRetreat(s, x);
    }
    const winner = brokeA && !brokeB ? b : brokeB && !brokeA ? a : null;
    if (winner) {
      const key = UNIT_APT[winner.unitType];
      const who = unitStats(winner, s).apt[key].id;
      if (who) addAptExp(s, who, key, 15, APT_NAME[key]);
    }
    if (rep) rep.result = winner === a ? '공격 측 승리' : winner === b ? '수비 측 승리' : '양쪽 모두 물러남';
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
  moveWeapons(c, a.unitType, a.armed);
  const line = `${name} 함락! ${nationName(a.nation)}의 땅이 되다 (${nationName(prevOwner)}에게서 빼앗음)`;
  addLog(s, line);
  if (rep) {
    rep.fallen = true;
    rep.lines.push(line);
  }
  // 들어온 부대들의 금으로 민심 수습 (금 100 당 +1), 남은 금은 성 금고로
  let gold = a.gold;
  a.gold = 0;
  for (const other of s.armies) {
    if (other.id === a.id || other.nation !== a.nation || armyTarget(other) !== cityId || other.pathIndex < other.path.length - 1) continue;
    gold += other.gold;
    other.gold = 0;
  }
  if (gold > 0) {
    const gain = Math.min(Math.floor(gold / 100), Math.max(0, 100 - Math.floor(c.morale)));
    c.morale = clamp100(c.morale + gain);
    c.gold += gold - gain * 100;
    const gl = `금 ${(gain * 100).toLocaleString()} 으로 민심 수습 (민심 +${gain})`;
    addLog(s, `${name} ${gl}`);
    rep?.lines.push(gl);
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
  c.gold += a.gold ?? 0;
  moveWeapons(c, a.unitType, a.armed);
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

// ---------- 추천 병과 ----------
/**
 * 추천 병과: 연구로 열렸고 성에 무기가 troops 만큼 있는 병과 가운데
 * (장수의 그 계열 적성 배율) × (수비군 보병 상대 상성) × (병과 공격 배율) 이 가장 큰 것.
 * weaponLeft 로 앞 부대가 이미 쓴 무기를 뺄 수 있음.
 */
export function recommendUnit(
  s: GameState,
  cityId: string,
  officerId: string,
  troops: number,
  weaponLeft: (u: UnitType) => number = (u) => weaponLimit(s, cityId, u),
): UnitType {
  const nation = s.cities[cityId].owner;
  let best: UnitType = 'infantry';
  let bestScore = -1;
  for (const u of unlockedUnits(s, nation)) {
    const st = UNIT_STATS[u];
    if (st.only && st.only !== nation) continue;
    if (weaponLeft(u) < Math.max(1, troops)) continue;
    const score = APT_MULT[aptOf(s, officerId, UNIT_APT[u])] * matchup(u, 'infantry') * st.atk;
    if (score > bestScore) {
      best = u;
      bestScore = score;
    }
  }
  return best;
}

// ---------- 이동·수송 ----------
export interface ConvoyOrder {
  officers: string[];
  troops: number;
  gold: number;
  food: number;
  weapons: Partial<Weapons>;
}

/** 아군 성까지 걸리는 턴 (길이 없으면 null) */
export function convoyTurns(s: GameState, from: string, to: string): number | null {
  const nation = s.cities[from].owner;
  const path = findPath(s, from, to, nation);
  return path && path.length >= 2 ? turnsFor(path, 'infantry') : null;
}

/** 이동(장수·병사)·수송(금·쌀·무기)을 아군 성으로 보냄. n턴 뒤 도착, 싸우지 않음 */
export function sendConvoy(s: GameState, from: string, to: string, order: ConvoyOrder, kind: '이동' | '수송'): string | null {
  const c = s.cities[from];
  const nation = c.owner;
  if (from === to || s.cities[to].owner !== nation) return null;
  const turns = convoyTurns(s, from, to);
  if (!turns) return null;
  const officers = order.officers.filter((id) => {
    const o = s.officers[id];
    return o && o.status === 'active' && o.city === from && o.nation === nation;
  });
  const troops = Math.floor(Math.max(0, Math.min(order.troops, c.troops)));
  const gold = Math.floor(Math.max(0, Math.min(order.gold, c.gold)));
  const food = Math.floor(Math.max(0, Math.min(order.food, c.food)));
  const weapons = emptyWeapons();
  for (const k of WEAPON_KINDS) weapons[k] = Math.floor(Math.max(0, Math.min(order.weapons[k] ?? 0, c.weapons[k])));
  const goods = troops + gold + food + WEAPON_KINDS.reduce((a, k) => a + weapons[k], 0);
  if (!officers.length && goods <= 0) return null;
  c.troops -= troops;
  c.gold -= gold;
  c.food -= food;
  for (const k of WEAPON_KINDS) c.weapons[k] -= weapons[k];
  for (const id of officers) {
    const o = s.officers[id];
    clearPosts(s, id);
    o.status = 'moving';
    o.moveTo = null;
    o.city = null;
    o.acted = true;
  }
  s.convoys ??= [];
  const cid = s.nextConvoyId ?? 1;
  s.nextConvoyId = cid + 1;
  s.convoys.push({
    id: `c${cid}`,
    nation,
    from,
    to,
    turnsLeft: turns,
    elapsed: 0,
    returning: false,
    officers,
    troops,
    gold,
    food,
    weapons,
  });
  const what = [
    officers.length ? `장수 ${officers.length}명` : '',
    troops ? `병사 ${troops.toLocaleString()}` : '',
    gold ? `금 ${gold.toLocaleString()}` : '',
    food ? `쌀 ${food.toLocaleString()}` : '',
    ...WEAPON_KINDS.filter((k) => weapons[k] > 0).map((k) => `${WEAPON_NAME_K[k]} ${weapons[k].toLocaleString()}`),
  ]
    .filter(Boolean)
    .join(', ');
  const msg = `${CITY_BY_ID[from].name} → ${CITY_BY_ID[to].name} ${kind}: ${what} (${turns}턴 뒤 도착)`;
  addLog(s, msg);
  return msg;
}

const WEAPON_NAME_K: Record<WeaponKind, string> = { spear: '창', bow: '활', horse: '말', crossbow: '쇠뇌', armor: '철갑' };

/** 매 턴: 행렬 이동. 가는 길에 목적지가 남의 성이 되면 출발 성으로 돌아감 */
export function tickConvoys(s: GameState) {
  const done: string[] = [];
  for (const cv of s.convoys ?? []) {
    if (!cv.returning && s.cities[cv.to].owner !== cv.nation) {
      cv.returning = true;
      cv.turnsLeft = Math.max(1, cv.elapsed);
      cv.elapsed = 0;
      addLog(s, `${CITY_BY_ID[cv.to].name}이(가) 남의 성이 되어 ${CITY_BY_ID[cv.from].name}(으)로 돌아감`);
    }
    cv.turnsLeft--;
    cv.elapsed++;
    if (cv.turnsLeft > 0) continue;
    let dest: string | null = cv.returning ? cv.from : cv.to;
    if (s.cities[dest].owner !== cv.nation) dest = nearestOwnCity(s, dest, cv.nation);
    done.push(cv.id);
    if (!dest) {
      for (const id of cv.officers) {
        const o = s.officers[id];
        if (!o) continue;
        o.status = 'ronin';
        o.nation = NEUTRAL;
        o.foundBy = [];
        o.city = cv.from;
      }
      addLog(s, `${nationName(cv.nation)} 행렬이 돌아갈 성이 없어 흩어짐`);
      continue;
    }
    const c = s.cities[dest];
    c.troops += cv.troops;
    c.gold += cv.gold;
    c.food += cv.food;
    for (const k of WEAPON_KINDS) c.weapons[k] += cv.weapons[k];
    for (const id of cv.officers) {
      const o = s.officers[id];
      if (!o || o.status !== 'moving') continue;
      o.status = 'active';
      o.city = dest;
    }
    if (cv.nation === s.player) addLog(s, `${CITY_BY_ID[dest].name}에 행렬 도착`);
  }
  s.convoys = (s.convoys ?? []).filter((x) => !done.includes(x.id));
}
