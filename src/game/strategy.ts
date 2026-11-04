// 계략: 유언비어·이간·내응
import { canAttack } from './diplomacy';
import { citiesWithin, nearestOwnCity } from './military';
import {
  CITY_BY_ID,
  GameState,
  NEUTRAL,
  addLog,
  clamp,
  clamp100,
  governorOf,
  nationName,
  officerName,
  officersInCity,
  stat,
} from './state';

export type StrategyId = 'rumor' | 'discord' | 'betray';
export const STRATEGY_NAME: Record<StrategyId, string> = {
  rumor: '유언비어',
  discord: '이간',
  betray: '내응',
};
export const STRATEGY_COST = 100;

/** 계략 대상이 될 수 있는 성: 길로 2단계 안의 남의 성 */
export function strategyTargets(s: GameState, cityId: string): string[] {
  const me = s.cities[cityId].owner;
  return citiesWithin(cityId, 2).filter((id) => s.cities[id].owner !== me);
}

export function strategyRate(s: GameState, kind: StrategyId, officerId: string, cityId: string, targetOfficer?: string | null): number {
  const myInt = stat(officerId, 'intelligence');
  switch (kind) {
    case 'rumor': {
      const gov = governorOf(s, cityId);
      return clamp(50 + (myInt - (gov ? stat(gov.id, 'intelligence') : 30)) / 2, 0, 100);
    }
    case 'discord':
      return targetOfficer ? clamp(50 + (myInt - stat(targetOfficer, 'intelligence')) / 2, 0, 100) : 0;
    case 'betray': {
      if (!targetOfficer) return 0;
      const loy = s.officers[targetOfficer].loyalty;
      if (loy >= 40) return 0;
      return clamp(60 - loy + stat(officerId, 'charm') / 4, 0, 100);
    }
  }
}

/** 계략 실행. 결과 메시지(실행 불가면 null) */
export function applyStrategy(
  s: GameState,
  fromCity: string,
  officerId: string,
  kind: StrategyId,
  targetCity: string,
  targetOfficer: string | null,
): string | null {
  const c = s.cities[fromCity];
  if (c.gold < STRATEGY_COST) return null;
  if (kind !== 'rumor' && !targetOfficer) return null;
  if (kind === 'betray' && targetOfficer && s.officers[targetOfficer].loyalty >= 40) return null;
  c.gold -= STRATEGY_COST;
  s.officers[officerId].acted = true;
  const me = c.owner;
  const t = s.cities[targetCity];
  const tName = CITY_BY_ID[targetCity].name;
  const who = officerName(officerId);
  const ok = Math.random() * 100 < strategyRate(s, kind, officerId, targetCity, targetOfficer);
  let msg: string;
  if (!ok) {
    msg = `${who}의 ${STRATEGY_NAME[kind]}, ${tName}에서 실패`;
  } else if (kind === 'rumor') {
    t.morale = clamp100(t.morale - 15);
    t.training = clamp100(t.training - 5);
    msg = `${who}의 유언비어가 ${tName}에 퍼졌다 (민심 −15, 훈련도 −5)`;
  } else if (kind === 'discord') {
    const o = s.officers[targetOfficer!];
    o.loyalty = Math.max(0, o.loyalty - 15);
    msg = `${who}의 이간으로 ${officerName(targetOfficer!)}의 충성이 흔들린다 (충성 ${o.loyalty})`;
  } else {
    const o = s.officers[targetOfficer!];
    const dest = nearestOwnCity(s, targetCity, me);
    if (!dest) return `${who}의 내응: 받아줄 성이 없다`;
    const bring = Math.floor(t.troops * 0.2);
    t.troops -= bring;
    s.cities[dest].troops += bring;
    const old = o.nation;
    o.nation = me;
    o.city = dest;
    o.loyalty = 60;
    o.acted = true;
    if (o.rank === '군주') o.rank = '장수';
    msg = `${who}의 내응 성공! ${nationName(old)}의 ${officerName(targetOfficer!)}이(가) 병력 ${bring.toLocaleString()}을 이끌고 ${CITY_BY_ID[dest].name}(으)로 넘어왔다`;
  }
  addLog(s, msg);
  return msg;
}

/** 컴퓨터 계략: 금 500 이상이면 10% 확률 */
export function aiStrategy(s: GameState, nation: string) {
  if (Math.random() >= 0.1) return;
  const rich = Object.values(s.cities).filter((c) => c.owner === nation && c.gold >= 500);
  for (const c of rich) {
    const offs = officersInCity(s, c.id).filter((o) => o.nation === nation && !o.acted && o.rank !== '군주');
    if (!offs.length) continue;
    const targets = strategyTargets(s, c.id).filter((id) => {
      const ow = s.cities[id].owner;
      return ow !== NEUTRAL && canAttack(s, nation, ow);
    });
    if (!targets.length) continue;
    const tc = targets[Math.floor(Math.random() * targets.length)];
    const agent = offs.sort((a, b) => stat(b.id, 'intelligence') - stat(a.id, 'intelligence'))[0];
    const enemies = officersInCity(s, tc).filter((o) => o.nation === s.cities[tc].owner);
    const weak = enemies.find((o) => o.loyalty < 40);
    if (weak) applyStrategy(s, c.id, agent.id, 'betray', tc, weak.id);
    else if (enemies.length && Math.random() < 0.5) applyStrategy(s, c.id, agent.id, 'discord', tc, enemies[0].id);
    else applyStrategy(s, c.id, agent.id, 'rumor', tc, null);
    return;
  }
}
