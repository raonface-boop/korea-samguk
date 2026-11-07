// 컴퓨터 나라
import { applyDomestic, recommendOfficer } from './domestic';
import { aiDiplomacy, canAttack } from './diplomacy';
import { MarchUnit, createArmy, neighbors, troopCap, unlockedUnits, weaponLimit } from './military';
import { aiPrisoners } from './personnel';
import { aiStrategy } from './strategy';
import { CityState, GameState, NATION_BY_ID, NEUTRAL, UnitType, officersInCity, relation, stat } from './state';

/** 처음 4턴(346년)은 공격하지 않음 */
export const AI_TRUCE_TURNS = 4;

function aiNations(s: GameState): string[] {
  const set = new Set<string>();
  for (const c of Object.values(s.cities)) if (c.owner !== NEUTRAL && c.owner !== s.player) set.add(c.owner);
  return [...set];
}

function cityDomestic(s: GameState, c: CityState) {
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
      if (send < t.troops * 1.5) continue;
      const hostile = t.owner !== NEUTRAL && relation(s, nation, t.owner) < -50;
      options.push({ from: c.id, to: n, score: send - t.troops + (hostile ? 3000 : 0), hostile });
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
    .filter((o) => o.nation === nation && !o.acted)
    .sort((a, b) => stat(b.id, 'leadership') - stat(a.id, 'leadership'));
  const sendable = offs.length > 1 ? offs.filter((o) => o.rank !== '군주') : offs;
  // 장수 1~2명, 각자 한 부대
  const units: MarchUnit[] = [];
  const used: Partial<Record<UnitType, number>> = {};
  let left = troops;
  for (const o of sendable.slice(0, 2)) {
    if (left <= 0) break;
    const unitType = bestUnit(s, c, used);
    const n = Math.min(left, troopCap(s, o.id, unitType), weaponLimit(s, c.id, unitType) - (used[unitType] ?? 0));
    if (n <= 0) continue;
    used[unitType] = (used[unitType] ?? 0) + n;
    units.push({ officer: o.id, unitType, troops: n });
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
    aiStrategy(s, nation);
    for (const c of Object.values(s.cities)) {
      if (c.owner === nation) cityDomestic(s, c);
    }
  }
}
