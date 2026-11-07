// 컴퓨터 나라
import { aiFillPosts, applyDomestic, recommendOfficer } from './domestic';
import { aiDiplomacy, canAttack } from './diplomacy';
import { MarchUnit, UNIT_APT, buildShips, canMarch, createArmy, neighbors, troopCap, unlockedUnits, weaponLimit } from './military';
import { aiPrisoners } from './personnel';
import { aiStrategy } from './strategy';
import { APT_ORDER, CITY_BY_ID, CityState, GameState, NATION_BY_ID, NEUTRAL, UnitType, aptOf, findRoad, officersInCity, relation, stat } from './state';

// ---------- AI 수준 ----------
export type AiLevelId = 'easy' | 'normal' | 'hard' | 'expert' | 'master';
export interface AiLevel {
  id: AiLevelId;
  name: string;
  /** AI 나라 금·쌀 수입 배율 */
  income: number;
  /** 자기 출진 병력이 상대 수비 병력의 이 배를 넘어야 공격 */
  attackRatio: number;
  /** 계략 빈도 (0~2: 1 미만이면 그 확률로만, 1.5 이상이면 한 턴에 두 번) */
  strategy: number;
  /** 약한 성을 골라 노림 */
  targetWeak: boolean;
  /** 플레이어 성을 먼저 노림 */
  targetPlayer: boolean;
  /** 시작 병력 배율 (AI 성) */
  startTroops: number;
  /** 아직 고를 수 없음 */
  locked: boolean;
  desc: string;
}
/** AI 수준 표: 숫자만 바꾸면 됨 */
export const AI_LEVELS: AiLevel[] = [
  { id: 'easy', name: '초급', income: 0.8, attackRatio: 1.6, strategy: 0.2, targetWeak: false, targetPlayer: false, startTroops: 1, locked: false, desc: '수입 ×0.8, 1.6배 힘이어야 공격, 계략 거의 없음' },
  { id: 'normal', name: '중급', income: 1.0, attackRatio: 1.3, strategy: 1, targetWeak: false, targetPlayer: false, startTroops: 1, locked: false, desc: '수입 ×1.0, 1.3배면 공격' },
  { id: 'hard', name: '상급', income: 1.2, attackRatio: 1.1, strategy: 1.5, targetWeak: true, targetPlayer: false, startTroops: 1, locked: false, desc: '수입 ×1.2, 1.1배면 공격, 약한 성을 노림, 계략 자주' },
  { id: 'expert', name: '특급', income: 1.5, attackRatio: 1.0, strategy: 1.5, targetWeak: true, targetPlayer: true, startTroops: 1, locked: true, desc: '수입 ×1.5, 1.0배면 공격, 플레이어 성을 먼저 노림' },
  { id: 'master', name: '초특급', income: 2.0, attackRatio: 1.0, strategy: 1.5, targetWeak: true, targetPlayer: true, startTroops: 1.3, locked: true, desc: '수입 ×2.0, 시작 병력 +30%, 플레이어 성을 먼저 노림' },
];
export function aiLevelOf(s: GameState): AiLevel {
  return AI_LEVELS.find((l) => l.id === s.aiLevel) ?? AI_LEVELS[1];
}

/** 처음 4턴(346년)은 공격하지 않음 */
export const AI_TRUCE_TURNS = 4;

function aiNations(s: GameState): string[] {
  const set = new Set<string>();
  for (const c of Object.values(s.cities)) if (c.owner !== NEUTRAL && c.owner !== s.player) set.add(c.owner);
  return [...set];
}

/** 바다 쪽을 더 노리는 나라 */
const SEA_MINDED = new Set(['yamato', 'tsukushi', 'izumo', 'kibi', 'tsushima', 'tamna', 'gaya']);

function cityDomestic(s: GameState, c: CityState) {
  // 항구는 배를 만들어 둠 (바다 쪽 나라는 더 많이)
  const wantShips = SEA_MINDED.has(c.owner) ? 40 : 15;
  if (CITY_BY_ID[c.id].port && (c.ships ?? 0) < wantShips && c.gold > 800) buildShips(s, c.id, 10);
  if (c.morale < 40) {
    const o = recommendOfficer(s, c.id, 'relief');
    if (applyDomestic(s, c.id, 'relief', o)) return;
  }
  if (c.troops < c.population * 0.05) {
    const o = recommendOfficer(s, c.id, 'military');
    if (applyDomestic(s, c.id, 'military', o, { conscript: true })) return;
  }
  // 전쟁 준비: 공격할 만한 이웃이 있으면 그 수비 병력의 2.5배까지 징병
  if (s.turn > 2 && c.morale >= 50 && c.troops < c.population * 0.25) {
    const weakest = neighbors(c.id)
      .map((n) => s.cities[n])
      .filter((t) => t.owner !== c.owner && canAttack(s, c.owner, t.owner))
      .sort((a, b) => a.troops - b.troops)[0];
    if (weakest && c.troops < weakest.troops * 2.6) {
      const o = recommendOfficer(s, c.id, 'military');
      if (applyDomestic(s, c.id, 'military', o, { conscript: true })) return;
    }
  }
  if (c.training < 50) {
    const o = recommendOfficer(s, c.id, 'military');
    if (applyDomestic(s, c.id, 'military', o, { conscript: false })) return;
  }
  const cmd = (s.turn + c.id.length) % 2 === 0 ? 'farm' : 'market';
  const o = recommendOfficer(s, c.id, cmd);
  applyDomestic(s, c.id, cmd, o);
}

/**
 * 연구로 열린 병과 가운데 성 무기로 가장 많이 갖출 수 있는 것.
 * 무기가 필요 없는 보병은 끝없이 만들 수 있으므로 비교에서 빼고, 무기 병과로 300명도 못 채우면 보병.
 */
function bestUnit(s: GameState, c: CityState, used: Partial<Record<UnitType, number>>): UnitType {
  let best: UnitType = 'infantry';
  let bestN = 300;
  for (const u of unlockedUnits(s, c.owner)) {
    if (u === 'infantry' || u === 'siege') continue;
    const n = weaponLimit(s, c.id, u) - (used[u] ?? 0);
    if (n > bestN) {
      best = u;
      bestN = n;
    }
  }
  return best;
}

function tryAttack(s: GameState, nation: string) {
  if (s.turn <= AI_TRUCE_TURNS) return;
  if (s.season === 3) return; // 겨울에는 새로 출진하지 않음
  if (s.armies.some((a) => a.nation === nation && !a.passThrough)) return; // 한 부대까지
  const options: { from: string; to: string; score: number; hostile: boolean }[] = [];
  for (const c of Object.values(s.cities)) {
    if (c.owner !== nation) continue;
    const send = Math.floor(c.troops * 0.6);
    if (send < 500 || c.training < 50 || c.food < Math.ceil(send / 20) * 6) continue;
    for (const n of neighbors(c.id)) {
      const t = s.cities[n];
      if (t.owner === nation || !canAttack(s, nation, t.owner)) continue;
      const lv = aiLevelOf(s);
      if (send < t.troops * lv.attackRatio) continue;
      const hostile = t.owner !== NEUTRAL && relation(s, nation, t.owner) < -50;
      // 바닷길이면 항구와 배가 있어야 함, 바다 쪽 나라는 바다 건너를 더 노림
      const road = findRoad(c.id, n);
      const sea = road?.type === 'sea';
      if (sea && (!CITY_BY_ID[c.id].port || (c.ships ?? 0) * 100 < t.troops * 1.5)) continue;
      const seaBonus = sea && SEA_MINDED.has(nation) ? 2000 : 0;
      const weakBonus = lv.targetWeak ? Math.max(0, 5000 - t.troops) : 0;
      const playerBonus = lv.targetPlayer && t.owner === s.player ? 4000 : 0;
      options.push({ from: c.id, to: n, score: send - t.troops + (hostile ? 3000 : 0) + seaBonus + weakBonus + playerBonus, hostile });
    }
  }
  if (!options.length) return;
  options.sort((a, b) => b.score - a.score);
  const { from, to, hostile } = options[0];
  const p = (NATION_BY_ID[nation]?.aggression ?? 0.5) * 0.5 * (hostile ? 1.5 : 1);
  if (Math.random() >= p) return;
  const c = s.cities[from];
  const troops = Math.floor(c.troops * 0.6);
  const offs = officersInCity(s, from)
    .filter((o) => o.nation === nation && canMarch(s, o.id, from))
    .sort((a, b) => stat(b.id, 'leadership') - stat(a.id, 'leadership'));
  const sendable = offs.length > 1 ? offs.filter((o) => o.rank !== '군주') : offs;
  // 부대마다 대장 1명 + 그 대장이 약한 계열을 메워 줄 부장 0~2명 (부대 명령은 싸움·공성)
  const units: MarchUnit[] = [];
  const used: Partial<Record<UnitType, number>> = {};
  const taken = new Set<string>();
  let left = troops;
  for (const o of sendable) {
    if (units.length >= 2 || left <= 0) break;
    if (taken.has(o.id)) continue;
    const unitType = bestUnit(s, c, used);
    const n = Math.min(left, troopCap(s, o.id, unitType), weaponLimit(s, c.id, unitType) - (used[unitType] ?? 0));
    if (n <= 0) continue;
    taken.add(o.id);
    const key = UNIT_APT[unitType];
    const leadGrade = APT_ORDER.indexOf(aptOf(s, o.id, key));
    const deputies = sendable
      .filter((d) => !taken.has(d.id) && (APT_ORDER.indexOf(aptOf(s, d.id, key)) > leadGrade || stat(d.id, 'war') > stat(o.id, 'war') + 10))
      .sort((x, y) => APT_ORDER.indexOf(aptOf(s, y.id, key)) - APT_ORDER.indexOf(aptOf(s, x.id, key)) || stat(y.id, 'war') - stat(x.id, 'war'))
      .slice(0, 2)
      .map((d) => d.id);
    for (const d of deputies) taken.add(d);
    used[unitType] = (used[unitType] ?? 0) + n;
    units.push({ officer: o.id, deputies, unitType, troops: n, order: { engage: 'fight', arrive: 'siege' } });
    left -= n;
  }
  if (!units.length) return;
  const sent = units.reduce((a, u) => a + u.troops, 0);
  createArmy(s, { cityId: from, target: to, units, food: Math.ceil(sent / 20) * 8, gold: Math.min(c.gold, Math.floor(sent / 10)) });
}

/** 컴퓨터 나라들 한 턴 행동 */
export function runAI(s: GameState) {
  for (const nation of aiNations(s)) {
    aiPrisoners(s, nation);
    aiDiplomacy(s, nation);
    tryAttack(s, nation);
    // 계략 빈도는 AI 수준에 따라
    const st = aiLevelOf(s).strategy;
    if (st >= 1 || Math.random() < st) aiStrategy(s, nation);
    if (st >= 1.5) aiStrategy(s, nation);
    for (const c of Object.values(s.cities)) {
      if (c.owner !== nation) continue;
      aiFillPosts(s, c.id);
      cityDomestic(s, c);
    }
  }
}
