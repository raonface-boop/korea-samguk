// 외교: 관계, 친선·휴전·동맹·조공
import {
  CITY_BY_ID,
  GameState,
  NATIONS,
  NEUTRAL,
  Treaty,
  TreatyType,
  addLog,
  capitalOf,
  changeRelation,
  citiesOf,
  nationName,
  officerName,
  relation,
  roadsOf,
  otherEnd,
  rulerOf,
  stat,
} from './state';

export type DiploCommand = 'goodwill' | 'truce' | 'alliance' | 'tribute';

export const DIPLO_NAME: Record<DiploCommand, string> = {
  goodwill: '친선',
  truce: '휴전',
  alliance: '동맹',
  tribute: '조공',
};

export const DIPLO_DESC: Record<DiploCommand, string> = {
  goodwill: '금 200 → 관계 + 10 + 매력/10',
  truce: '관계 −20 이상일 때, 성공률 50 + 매력/4. 12턴 서로 공격 금지',
  alliance: '관계 60 이상일 때. 서로 공격 금지',
  tribute: '금 300 → 관계 +25. 상대가 성이 더 많으면 4턴 동안 나를 공격하지 않음',
};

export const TREATY_NAME: Record<TreatyType, string> = {
  truce: '휴전',
  alliance: '동맹',
  tribute: '조공',
};

/** 아직 살아 있는(성이 있는) 나라들 */
export function liveNations(s: GameState): string[] {
  return NATIONS.filter((n) => n.id !== NEUTRAL && citiesOf(s, n.id).length > 0).map((n) => n.id);
}

export function treatiesBetween(s: GameState, a: string, b: string): Treaty[] {
  return s.treaties.filter((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a));
}

export function hasTreaty(s: GameState, a: string, b: string, type: TreatyType): boolean {
  return treatiesBetween(s, a, b).some((t) => t.type === type);
}

/** attacker 가 target 나라를 공격할 수 있는가 */
export function canAttack(s: GameState, attacker: string, target: string): boolean {
  if (attacker === target) return false;
  if (target === NEUTRAL) return true;
  for (const t of treatiesBetween(s, attacker, target)) {
    if (t.type === 'truce' || t.type === 'alliance') return false;
    // 조공: a(받은 나라)는 b(바친 나라)를 공격하지 않음
    if (t.type === 'tribute' && t.a === attacker && t.b === target) return false;
  }
  return true;
}

function addTreaty(s: GameState, t: Treaty) {
  s.treaties = s.treaties.filter(
    (x) => !(x.type === t.type && ((x.a === t.a && x.b === t.b) || (x.a === t.b && x.b === t.a))),
  );
  s.treaties.push(t);
}

/** 매 턴 조약 기한 줄이기 */
export function tickTreaties(s: GameState) {
  for (const t of s.treaties) if (t.turnsLeft !== null) t.turnsLeft--;
  const ended = s.treaties.filter((t) => t.turnsLeft !== null && t.turnsLeft <= 0);
  for (const t of ended) addLog(s, `${nationName(t.a)}·${nationName(t.b)} ${TREATY_NAME[t.type]}이 끝났다`);
  s.treaties = s.treaties.filter((t) => t.turnsLeft === null || t.turnsLeft > 0);
}

/** 동맹이 공격받으면 동맹국과의 관계 +5 */
export function onAttacked(s: GameState, victim: string) {
  for (const t of s.treaties) {
    if (t.type !== 'alliance') continue;
    if (t.a === victim) changeRelation(s, t.a, t.b, 5);
    else if (t.b === victim) changeRelation(s, t.a, t.b, 5);
  }
}

/** 외교 명령 실행. 결과 메시지 */
export function applyDiplomacy(
  s: GameState,
  nation: string,
  target: string,
  cmd: DiploCommand,
  officerId: string | null,
): string | null {
  const cap = capitalOf(s, nation);
  if (!cap) return null;
  const city = s.cities[cap];
  const charm = officerId ? stat(officerId, 'charm') : 50;
  const who = officerId ? officerName(officerId) : nationName(nation);
  const tn = nationName(target);
  let msg: string | null = null;
  switch (cmd) {
    case 'goodwill': {
      if (city.gold < 200) return null;
      city.gold -= 200;
      const d = Math.floor(10 + charm / 10);
      changeRelation(s, nation, target, d);
      msg = `${who}, ${tn}에 친선 사절: 관계 +${d} (지금 ${relation(s, nation, target)})`;
      break;
    }
    case 'truce': {
      if (relation(s, nation, target) < -20) return null;
      const rate = 50 + charm / 4;
      if (Math.random() * 100 < rate) {
        addTreaty(s, { type: 'truce', a: nation, b: target, turnsLeft: 12 });
        msg = `${who}, ${tn}과(와) 휴전 성공 (12턴)`;
      } else {
        msg = `${who}, ${tn}과(와) 휴전 실패`;
      }
      break;
    }
    case 'alliance': {
      if (relation(s, nation, target) < 60) return null;
      addTreaty(s, { type: 'alliance', a: nation, b: target, turnsLeft: null });
      msg = `${who}, ${tn}과(와) 동맹을 맺다`;
      break;
    }
    case 'tribute': {
      if (city.gold < 300) return null;
      city.gold -= 300;
      changeRelation(s, nation, target, 25);
      let extra = '';
      if (citiesOf(s, target).length > citiesOf(s, nation).length) {
        addTreaty(s, { type: 'tribute', a: target, b: nation, turnsLeft: 4 });
        extra = ', 4턴 동안 공격받지 않음';
      }
      msg = `${who}, ${tn}에 조공: 관계 +25${extra}`;
      break;
    }
  }
  if (officerId && s.officers[officerId]) s.officers[officerId].acted = true;
  if (msg) addLog(s, msg);
  return msg;
}

/** 두 나라 성이 길로 맞닿아 있는가 */
export function nationsNeighbor(s: GameState, a: string, b: string): boolean {
  for (const c of citiesOf(s, a)) {
    for (const r of roadsOf(c.id)) {
      if (s.cities[otherEnd(r, c.id)].owner === b) return true;
    }
  }
  return false;
}

/** 컴퓨터 외교: 성 수가 두 배 이상인 이웃과는 휴전이나 조공 */
export function aiDiplomacy(s: GameState, nation: string) {
  const mine = citiesOf(s, nation).length;
  const cap = capitalOf(s, nation);
  if (!cap) return;
  for (const other of liveNations(s)) {
    if (other === nation) continue;
    if (citiesOf(s, other).length < mine * 2) continue;
    if (!nationsNeighbor(s, nation, other)) continue;
    if (treatiesBetween(s, nation, other).length) continue;
    if (Math.random() > 0.25) continue;
    const ruler = rulerOf(s, nation);
    const envoy = ruler && ruler.city === cap ? ruler.id : null;
    if (relation(s, nation, other) >= -20) applyDiplomacy(s, nation, other, 'truce', envoy);
    else if (s.cities[cap].gold >= 300) applyDiplomacy(s, nation, other, 'tribute', envoy);
    return;
  }
}

export function capitalName(s: GameState, nation: string): string {
  const c = capitalOf(s, nation);
  return c ? CITY_BY_ID[c].name : '-';
}
