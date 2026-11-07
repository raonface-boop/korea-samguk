// 역사 이벤트
import eventsData from '../data/events.json';
import { findPath, makeArmy, warnIfThreat } from './military';
import { succeed } from './succession';
import {
  CITY_BY_ID,
  GameState,
  UNIT_TYPES,
  UnitType,
  addLog,
  capitalOf,
  citiesOf,
  clamp100,
  officerName,
  relation,
  rulerOf,
} from './state';

interface SpawnArmy {
  nation: string;
  from_: string;
  to: string;
  troops: number;
  unit: string;
  leader?: string;
  officers?: string[];
}

export interface GameEvent {
  id: string;
  year: number;
  season: number | null;
  nation?: string;
  condition?: string;
  title: string;
  speaker: string | null;
  text: string[];
  effect: {
    nation?: string;
    loyalty?: number;
    morale?: number;
    gold?: number;
    spawnArmy?: SpawnArmy;
    succession?: { nation: string; to: string };
    ignoreTruce?: boolean;
  };
}

export const EVENTS: GameEvent[] = eventsData as unknown as GameEvent[];

function conditionOk(s: GameState, cond?: string): boolean {
  if (!cond) return true;
  switch (cond) {
    case 'goguryeo_relation_yan_ge_0':
      return relation(s, 'goguryeo', 'yan') >= 0;
    case 'baekje_owns_hanseong':
      return s.cities.hanseong?.owner === 'baekje';
    default:
      return true;
  }
}

/** 그 나라가 아직 살아 있는가 */
function nationAlive(s: GameState, nation?: string) {
  return !nation || citiesOf(s, nation).length > 0;
}

function applyEffect(s: GameState, ev: GameEvent) {
  const e = ev.effect;
  const n = e.nation ?? ev.nation;
  if (n) {
    if (e.loyalty) {
      for (const o of Object.values(s.officers)) if (o.nation === n && o.status !== 'dead') o.loyalty = Math.min(100, o.loyalty + e.loyalty);
    }
    if (e.morale) {
      for (const c of citiesOf(s, n)) c.morale = clamp100(c.morale + e.morale);
    }
    if (e.gold) {
      const cap = capitalOf(s, n);
      if (cap) s.cities[cap].gold += e.gold;
    }
  }
  if (e.spawnArmy) {
    const sp = e.spawnArmy;
    if (s.cities[sp.from_]?.owner === sp.nation && s.cities[sp.to]?.owner !== sp.nation) {
      const path = findPath(s, sp.from_, sp.to, sp.nation, true);
      if (path && path.length >= 2) {
        const offs = [sp.leader, ...(sp.officers ?? [])].filter(
          (id): id is string => !!id && s.officers[id]?.nation === sp.nation && s.officers[id]?.status === 'active' && !s.officers[id]?.armyId,
        );
        const unit = ((UNIT_TYPES as string[]).includes(sp.unit) ? sp.unit : 'spear') as UnitType;
        const a = makeArmy(s, {
          nation: sp.nation,
          officers: offs.slice(0, 3),
          troops: sp.troops,
          armed: sp.troops,
          unitType: unit,
          food: Math.ceil(sp.troops / 20) * 8,
          training: 70,
          path,
          passThrough: true,
          ignoreTruce: !!e.ignoreTruce,
        });
        addLog(s, `${CITY_BY_ID[sp.from_].name}에서 ${CITY_BY_ID[sp.to].name}(으)로 대군이 출진했다 (${sp.troops.toLocaleString()})`);
        warnIfThreat(s, a);
      }
    }
  }
  if (e.succession) {
    const cur = rulerOf(s, e.succession.nation);
    if (cur?.id !== e.succession.to) {
      if (cur) {
        cur.status = 'dead';
        cur.city = null;
      }
      succeed(s, e.succession.nation, cur?.id ?? null, cur ? `${officerName(cur.id)}이(가) 세상을 떠나고,` : '', e.succession.to, false);
    }
  }
}

/** 매 턴 시작: 조건이 맞는 이벤트를 한 번씩 */
export function checkEvents(s: GameState) {
  for (const ev of EVENTS) {
    if (s.firedEvents.includes(ev.id)) continue;
    if (ev.year !== s.year) continue;
    if (ev.season !== null && ev.season !== undefined) {
      if (ev.season !== s.season) continue;
    } else if (Math.random() >= 1 / (4 - s.season)) {
      continue; // 그해 아무 계절 1회
    }
    if (!nationAlive(s, ev.nation)) continue;
    if (!conditionOk(s, ev.condition)) {
      if (ev.season === null || ev.season === undefined) s.firedEvents.push(ev.id);
      continue;
    }
    s.firedEvents.push(ev.id);
    applyEffect(s, ev);
    addLog(s, `【${ev.title}】 ${ev.text[0]}`);
    s.popups.push({ kind: 'event', title: ev.title, speaker: ev.speaker, nation: ev.nation ?? ev.effect.nation ?? null, text: ev.text });
  }
}
