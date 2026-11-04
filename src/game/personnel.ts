// 인사: 탐색·등용·포상·이동·포로
import { findPath, nearestOwnCity, pathLength, SPEED } from './military';
import {
  CITY_BY_ID,
  GameState,
  NEUTRAL,
  OFFICER_DATA_BY_ID,
  OfficerState,
  addLog,
  capitalOf,
  changeRelation,
  citiesOf,
  clamp,
  nationGold,
  nationName,
  officerName,
  rulerOf,
  stat,
} from './state';

const rand = (n: number) => Math.random() * 100 < n;

/** 그 성의 재야 (찾았는지 여부 포함) */
export function roninInCity(s: GameState, cityId: string): OfficerState[] {
  return Object.values(s.officers).filter((o) => o.status === 'ronin' && o.city === cityId);
}

export function foundRonin(s: GameState, cityId: string, nation: string): OfficerState[] {
  return roninInCity(s, cityId).filter((o) => o.foundBy.includes(nation));
}

/** 내 나라 포로 */
export function prisonersOf(s: GameState, nation: string): OfficerState[] {
  return Object.values(s.officers).filter((o) => o.status === 'prisoner' && o.captor === nation);
}

function act(s: GameState, officerId: string) {
  const o = s.officers[officerId];
  if (o) o.acted = true;
}

export function searchRate(officerId: string) {
  return Math.min(100, 30 + stat(officerId, 'intelligence') / 3 + stat(officerId, 'charm') / 4);
}

/** 탐색 */
export function doSearch(s: GameState, cityId: string, officerId: string): string {
  const nation = s.cities[cityId].owner;
  act(s, officerId);
  const name = officerName(officerId);
  const hidden = roninInCity(s, cityId).filter((o) => !o.foundBy.includes(nation));
  if (hidden.length && rand(searchRate(officerId))) {
    const r = hidden[Math.floor(Math.random() * hidden.length)];
    r.foundBy.push(nation);
    return `${name}, ${CITY_BY_ID[cityId].name}에서 재야 인재 ${officerName(r.id)}을(를) 찾아냈다`;
  }
  if (Math.random() < 0.5) {
    const g = 50 + Math.floor(Math.random() * 101);
    s.cities[cityId].gold += g;
    return `${name}, 인재는 못 찾았지만 금 ${g}을(를) 찾았다`;
  }
  return `${name}, 탐색했으나 아무것도 찾지 못했다`;
}

export function recruitRate(s: GameState, nation: string, officerId: string, roninId: string) {
  const ruler = rulerOf(s, nation);
  const rc = ruler ? stat(ruler.id, 'charm') : 50;
  const pride = OFFICER_DATA_BY_ID[roninId]?.pride ?? 50;
  return clamp(30 + rc / 2 + stat(officerId, 'charm') / 4 - pride, 10, 90);
}

/** 등용 (재야) */
export function doRecruit(s: GameState, cityId: string, officerId: string, roninId: string): string {
  const nation = s.cities[cityId].owner;
  act(s, officerId);
  const r = s.officers[roninId];
  const rate = recruitRate(s, nation, officerId, roninId);
  if (rand(rate)) {
    r.status = 'active';
    r.nation = nation;
    r.rank = '장수';
    r.loyalty = 70;
    r.city = cityId;
    r.acted = true;
    r.foundBy = [];
    return `${officerName(officerId)}의 설득으로 ${officerName(roninId)}이(가) ${nationName(nation)}에 들어왔다`;
  }
  return `${officerName(roninId)}이(가) ${officerName(officerId)}의 청을 거절했다`;
}

/** 포상: 금 100 → 충성 +10 */
export function doReward(s: GameState, cityId: string, targetId: string): string | null {
  const c = s.cities[cityId];
  if (c.gold < 100) return null;
  c.gold -= 100;
  const o = s.officers[targetId];
  o.loyalty = Math.min(100, o.loyalty + 10);
  return `${officerName(targetId)}에게 금 100을 내렸다 (충성 ${o.loyalty})`;
}

/** 장수 이동: 길 거리만큼 턴이 걸림 */
export function moveTurns(s: GameState, from: string, to: string, nation: string): number | null {
  const p = findPath(s, from, to, nation);
  if (!p) return null;
  return Math.max(1, Math.ceil(pathLength(p) / SPEED));
}

export function doMove(s: GameState, officerId: string, to: string): string | null {
  const o = s.officers[officerId];
  if (!o.city) return null;
  const t = moveTurns(s, o.city, to, o.nation);
  if (t === null) return null;
  o.acted = true;
  o.status = 'moving';
  o.moveTo = to;
  o.moveTurns = t;
  const from = o.city;
  o.city = null;
  return `${officerName(officerId)}, ${CITY_BY_ID[from].name}에서 ${CITY_BY_ID[to].name}(으)로 떠남 (${t}턴)`;
}

/** 매 턴: 이동 중 장수 도착 처리 */
export function tickMoves(s: GameState) {
  for (const o of Object.values(s.officers)) {
    if (o.status !== 'moving' || !o.moveTo) continue;
    o.moveTurns--;
    if (o.moveTurns > 0) continue;
    let dest: string | null = o.moveTo;
    if (s.cities[dest].owner !== o.nation) dest = nearestOwnCity(s, dest, o.nation);
    o.status = 'active';
    o.moveTo = null;
    if (dest) {
      o.city = dest;
      if (o.nation === s.player) addLog(s, `${officerName(o.id)}, ${CITY_BY_ID[dest].name}에 도착`);
    } else {
      o.status = 'ronin';
      o.nation = NEUTRAL;
      o.city = o.city ?? Object.keys(s.cities)[0];
    }
  }
}

// ---------- 포로 ----------
export function prisonerRecruitRate(s: GameState, captor: string, prisonerId: string) {
  const ruler = rulerOf(s, captor);
  const rc = ruler ? stat(ruler.id, 'charm') : 50;
  return clamp(40 + rc / 2 - s.officers[prisonerId].loyalty / 2, 0, 100);
}

export function prisonerRecruit(s: GameState, captor: string, prisonerId: string): string {
  const o = s.officers[prisonerId];
  o.triedTurn = s.turn;
  if (rand(prisonerRecruitRate(s, captor, prisonerId))) {
    const old = o.nation;
    o.status = 'active';
    o.nation = captor;
    o.captor = null;
    o.loyalty = 60;
    o.acted = true;
    if (!['장수', '문관', '태수'].includes(o.rank)) o.rank = '장수';
    if (!o.city || s.cities[o.city].owner !== captor) o.city = capitalOf(s, captor);
    const msg = `포로 ${officerName(prisonerId)}이(가) ${nationName(captor)}에 귀순했다 (원래 ${nationName(old)})`;
    addLog(s, msg);
    return msg;
  }
  const msg = `포로 ${officerName(prisonerId)}이(가) ${nationName(captor)}의 등용을 거절했다`;
  addLog(s, msg);
  return msg;
}

export function prisonerRelease(s: GameState, captor: string, prisonerId: string): string {
  const o = s.officers[prisonerId];
  const home = capitalOf(s, o.nation);
  o.captor = null;
  if (home) {
    o.status = 'active';
    o.city = home;
  } else {
    o.status = 'ronin';
    o.nation = NEUTRAL;
    o.rank = '재야';
    o.foundBy = [];
  }
  changeRelation(s, captor, s.officers[prisonerId].nation, 10);
  const msg = `${nationName(captor)}, 포로 ${officerName(prisonerId)}을(를) 풀어주다`;
  addLog(s, msg);
  return msg;
}

export function prisonerExecute(s: GameState, captor: string, prisonerId: string): string {
  const o = s.officers[prisonerId];
  o.status = 'dead';
  o.captor = null;
  o.city = null;
  changeRelation(s, captor, o.nation, -40);
  for (const x of Object.values(s.officers)) {
    if (x.nation === captor && x.status !== 'dead' && x.status !== 'prisoner') x.loyalty = Math.max(0, x.loyalty - 3);
  }
  const msg = `${nationName(captor)}, 포로 ${officerName(prisonerId)}을(를) 처형하다`;
  addLog(s, msg);
  return msg;
}

/** 컴퓨터: 포로는 등용을 시도하고, 실패하면 석방 */
export function aiPrisoners(s: GameState, nation: string) {
  for (const p of prisonersOf(s, nation)) {
    const msg = prisonerRecruit(s, nation, p.id);
    if (s.officers[p.id].status === 'prisoner') prisonerRelease(s, nation, p.id);
    void msg;
  }
}

/** 매 턴 충성 변화: 나라 금이 바닥나면 −5 */
export function tickLoyalty(s: GameState) {
  const broke = new Set<string>();
  for (const o of Object.values(s.officers)) {
    if (o.status !== 'active' && o.status !== 'moving') continue;
    if (o.nation === NEUTRAL || o.rank === '군주') continue;
    if (!broke.has(o.nation) && citiesOf(s, o.nation).length && nationGold(s, o.nation) <= 0) broke.add(o.nation);
    if (broke.has(o.nation)) o.loyalty = Math.max(0, o.loyalty - 5);
  }
}
