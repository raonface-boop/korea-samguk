// 컴퓨터 나라
import { applyDomestic, recommendOfficer } from './domestic';
import { createArmy, neighbors } from './military';
import { CityState, GameState, NEUTRAL, OfficerState, WeaponKind, officersInCity, stat } from './state';

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
  if (s.armies.some((a) => a.nation === nation)) return; // 한 부대까지
  const options: { from: string; to: string; score: number }[] = [];
  for (const c of Object.values(s.cities)) {
    if (c.owner !== nation || c.troops < 1500) continue;
    for (const n of neighbors(c.id)) {
      const t = s.cities[n];
      if (t.owner === nation) continue;
      if (t.troops < c.troops * 0.6) options.push({ from: c.id, to: n, score: c.troops - t.troops });
    }
  }
  if (!options.length) return;
  options.sort((a, b) => b.score - a.score);
  const { from, to } = options[0];
  const c = s.cities[from];
  const troops = Math.floor(c.troops * 0.6);
  const offs: OfficerState[] = officersInCity(s, from)
    .filter((o) => o.nation === nation && !o.acted)
    .sort((a, b) => stat(b.id, 'leadership') - stat(a.id, 'leadership'));
  // 군주는 도성을 지키게 하고, 장수가 둘 이상이면 나머지를 보냄
  const sendable = offs.length > 1 ? offs.filter((o) => o.rank !== '군주') : offs;
  const officers = sendable.slice(0, 2).map((o) => o.id);
  createArmy(s, {
    cityId: from,
    officers,
    troops,
    weapon: bestWeapon(c, troops),
    food: Math.ceil(troops / 20) * 8,
    target: to,
  });
}

/** 컴퓨터 나라들 한 턴 행동 */
export function runAI(s: GameState) {
  for (const nation of aiNations(s)) {
    tryAttack(s, nation);
    for (const c of Object.values(s.cities)) {
      if (c.owner === nation) cityDomestic(s, c);
    }
  }
}
