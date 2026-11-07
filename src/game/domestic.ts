// 내정 명령
import { APT_NAME, RESEARCH_SPECIAL_NEED, SPECIAL_UNIT, heavyUnlocked } from './military';
import {
  AptKey,
  addAptExp,
  aptAtCap,
  CITY_BY_ID,
  GameState,
  OfficerStats,
  WEAPON_NAME,
  WeaponKind,
  clamp100,
  officersInCity,
  stat,
} from './state';

export type CommandId = 'farm' | 'market' | 'flood' | 'fortify' | 'military' | 'arms' | 'relief' | 'march';

export const COMMAND_NAME: Record<CommandId, string> = {
  farm: '개간',
  market: '시장',
  flood: '치수',
  fortify: '축성',
  military: '군사',
  arms: '무장',
  relief: '구휼',
  march: '출진',
};

/** 명령마다 쓰는 능력치 */
export const COMMAND_STAT: Record<CommandId, keyof OfficerStats> = {
  farm: 'politics',
  market: 'politics',
  flood: 'politics',
  fortify: 'leadership',
  military: 'leadership',
  arms: 'politics',
  relief: 'charm',
  march: 'leadership',
};

export const STAT_NAME: Record<keyof OfficerStats, string> = {
  leadership: '통솔',
  war: '무력',
  intelligence: '지력',
  politics: '정치',
  charm: '매력',
};

/** 이번 턴에 명령을 받을 수 있는 그 성의 장수 */
export function availableOfficers(s: GameState, cityId: string) {
  const owner = s.cities[cityId].owner;
  return officersInCity(s, cityId).filter((o) => o.nation === owner && !o.acted);
}

/** 명령에 가장 알맞은 남는 장수 추천 */
export function recommendOfficer(s: GameState, cityId: string, cmd: CommandId): string | null {
  const key = COMMAND_STAT[cmd];
  const list = availableOfficers(s, cityId).sort((a, b) => stat(b.id, key) - stat(a.id, key));
  return list[0]?.id ?? null;
}

/** 무기 값 (특산물 할인) */
export function weaponPrice(cityId: string, kind: WeaponKind): number {
  const goods = CITY_BY_ID[cityId].goods;
  const has = (g: string) => goods.some((x) => x.includes(g));
  if ((kind === 'spear' || kind === 'armor') && (has('철') || has('덩이쇠'))) return 0.5;
  if (kind === 'bow' && has('맥궁')) return 0.5;
  if (kind === 'horse' && (has('명마') || has('과하마'))) return 0.5;
  return 1;
}

export const RESEARCH_COST = 500;
export const RESEARCH_SPECIAL_COST = 1000;

/** 병기 연구: 철기병이 열린 고구려·전연은 특수 연구(special)로, 금 1,000 */
export function researchPlan(s: GameState, nation: string): { special: boolean; cost: number } {
  const special = !!SPECIAL_UNIT[nation] && heavyUnlocked(s, nation) && (s.research?.[nation]?.special ?? 0) < RESEARCH_SPECIAL_NEED;
  return { special, cost: special ? RESEARCH_SPECIAL_COST : RESEARCH_COST };
}

/** 연구로 얻는 점수 = 20 + 지력/4 + 정치/4 */
export function researchGain(officerId: string | null): number {
  if (!officerId) return 20;
  return Math.floor(20 + stat(officerId, 'intelligence') / 4 + stat(officerId, 'politics') / 4);
}

/** 병기 연구 명령 실행 (맡긴 장수 1명). 실행할 수 없으면 null */
export function doResearch(s: GameState, cityId: string, officerId: string | null): string | null {
  if (!officerId) return null;
  const c = s.cities[cityId];
  const nation = c.owner;
  const plan = researchPlan(s, nation);
  if (c.gold < plan.cost) return null;
  const gain = researchGain(officerId);
  c.gold -= plan.cost;
  s.research ??= {};
  const r = (s.research[nation] ??= { points: 0, special: 0 });
  if (plan.special) r.special += gain;
  else r.points += gain;
  const o = s.officers[officerId];
  if (o) o.acted = true;
  return `${CITY_BY_ID[cityId].name} 병기 연구: ${plan.special ? '특수 연구' : '연구'} +${gain}점 (금 -${plan.cost})`;
}

export const APT_TRAIN_COST = 200;
/** 적성 수련으로 얻는 경험 = 20 + 통솔/5 */
export function aptTrainGain(officerId: string): number {
  return Math.floor(20 + stat(officerId, 'leadership') / 5);
}

/** 적성 수련: 장수 1명, 계열 하나, 금 200. 실행할 수 없으면 null */
export function doAptTrain(s: GameState, cityId: string, officerId: string | null, key: AptKey): string | null {
  if (!officerId) return null;
  const c = s.cities[cityId];
  if (c.gold < APT_TRAIN_COST || aptAtCap(s, officerId, key)) return null;
  const gain = aptTrainGain(officerId);
  c.gold -= APT_TRAIN_COST;
  const ups = addAptExp(s, officerId, key, gain, APT_NAME[key]);
  const o = s.officers[officerId];
  if (o) o.acted = true;
  const name = s.officers[officerId] ? CITY_BY_ID[cityId].name : '';
  return `${name} 적성 수련: ${APT_NAME[key]} 경험 +${gain}${ups.length ? ` (${ups[ups.length - 1]} 로 오름)` : ''} (금 -${APT_TRAIN_COST})`;
}

export interface CommandArgs {
  /** 군사: 징병(true) 또는 훈련(false) */
  conscript?: boolean;
  weapon?: WeaponKind;
  gold?: number;
}

/**
 * 내정 명령 실행. S 는 장수 능력치(장수가 없으면 AI 용 기본값).
 * 결과 메시지를 돌려준다. 실행할 수 없으면 null.
 */
export function applyDomestic(
  s: GameState,
  cityId: string,
  cmd: Exclude<CommandId, 'march'>,
  officerId: string | null,
  args: CommandArgs = {},
  fallbackStat = 30,
): string | null {
  const c = s.cities[cityId];
  const S = officerId ? stat(officerId, COMMAND_STAT[cmd]) : fallbackStat;
  const name = CITY_BY_ID[cityId].name;
  let msg: string | null = null;
  switch (cmd) {
    case 'farm': {
      const before = c.agri;
      c.agri = clamp100(c.agri + S / 10);
      msg = `${name} 개간: 농업 ${fmt(before)} → ${fmt(c.agri)}`;
      break;
    }
    case 'market': {
      const before = c.commerce;
      c.commerce = clamp100(c.commerce + S / 10);
      msg = `${name} 시장: 상업 ${fmt(before)} → ${fmt(c.commerce)}`;
      break;
    }
    case 'flood': {
      const before = c.flood;
      c.flood = clamp100(c.flood + S / 10);
      msg = `${name} 치수: 치수 ${fmt(before)} → ${fmt(c.flood)}`;
      break;
    }
    case 'fortify': {
      const winter = s.season === 3;
      const before = c.defense;
      const lead = officerId ? stat(officerId, 'leadership') : fallbackStat;
      c.defense = clamp100(c.defense + (lead / 10) * (winter ? 2 : 1));
      msg = `${name} 축성${winter ? '(겨울 2배)' : ''}: 방어 ${fmt(before)} → ${fmt(c.defense)}`;
      break;
    }
    case 'military': {
      if (args.conscript) {
        const n = Math.floor(c.population * 0.02);
        const cost = Math.floor(c.population * 0.005);
        if (c.gold < cost) return null;
        c.troops += n;
        c.population -= n;
        c.morale = clamp100(c.morale - 5);
        c.gold -= cost;
        msg = `${name} 징병: 병력 +${n} (금 -${cost}, 민심 -5)`;
      } else {
        const before = c.training;
        const lead = officerId ? stat(officerId, 'leadership') : fallbackStat;
        c.training = clamp100(c.training + lead / 10);
        msg = `${name} 훈련: 훈련도 ${fmt(before)} → ${fmt(c.training)}`;
      }
      break;
    }
    case 'arms': {
      const kind = args.weapon ?? 'spear';
      const spend = Math.max(0, Math.min(c.gold, Math.floor(args.gold ?? 0)));
      if (spend <= 0) return null;
      const price = weaponPrice(cityId, kind);
      const made = Math.floor(spend / price);
      c.gold -= spend;
      c.weapons[kind] += made;
      msg = `${name} 무장: ${WEAPON_NAME[kind]} ${made}개 생산 (금 -${spend})`;
      break;
    }
    case 'relief': {
      const need = Math.floor(c.population * 0.05);
      if (c.food < need) return null;
      c.food -= need;
      const before = c.morale;
      c.morale = clamp100(c.morale + 10);
      msg = `${name} 구휼: 군량 -${need}, 민심 ${fmt(before)} → ${fmt(c.morale)}`;
      break;
    }
  }
  if (msg && officerId) {
    const o = s.officers[officerId];
    if (o) o.acted = true;
  }
  return msg;
}

export function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
