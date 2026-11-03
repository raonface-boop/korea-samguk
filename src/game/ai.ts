// 컴퓨터 나라
import { applyDomestic, recommendOfficer } from './domestic';
import { aiDiplomacy, canAttack } from './diplomacy';
import { createArmy, neighbors } from './military';
import { aiPrisoners } from './personnel';
import { aiStrategy } from './strategy';
import { CityState, GameState, NATION_BY_ID, NEUTRAL, WeaponKind, officersInCity, relation, stat } from './state';

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

function bestWeapon(c: CityState, troops: number): WeaponKind | 'heavy' {
  const w = c.weapons;
  if (Math.min(w.horse, w.armor) >= troops * 0.5) return 'heavy';
  const kinds: WeaponKind[] = ['horse', 'spear', 'bow', 'crossbow'];
  let best: WeaponKind = 'spear';
  for (const k of kinds) if (w[k] > w[best]) best = k;
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
  createArmy(s, {
    cityId: from,
    officers: sendable.slice(0, 2).map((o) => o.id),
    troops,
    weapon: bestWeapon(c, troops),
    food: Math.ceil(troops / 20) * 8,
    target: to,
  });
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
