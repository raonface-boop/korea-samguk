// 내정 명령
import { APT_NAME, RESEARCH_SPECIAL_NEED, SPECIAL_UNIT, heavyUnlocked } from './military';
import {
  NEUTRAL,
  governorOf,
  AptKey,
  POST_KEYS,
  POST_STAT,
  PostKey,
  addAptExp,
  addLog,
  aptAtCap,
  capitalOf,
  CITY_BY_ID,
  officerName,
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

/** 병기 연구는 도읍에서 군주만. 안 되면 까닭 */
export function researchBlock(s: GameState, cityId: string, officerId: string | null): string | null {
  const c = s.cities[cityId];
  if (capitalOf(s, c.owner) !== cityId) return '병기 연구는 도읍에서만 할 수 있습니다';
  if (!officerId || s.officers[officerId]?.rank !== '군주') return '병기 연구는 군주만 할 수 있습니다';
  return null;
}

/** 병기 연구 명령 실행 (도읍의 군주). 실행할 수 없으면 null */
export function doResearch(s: GameState, cityId: string, officerId: string | null): string | null {
  if (!officerId || researchBlock(s, cityId, officerId)) return null;
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

// ---------- 담당관 ----------
/** 자리마다 그 장수의 능력 값 (치안은 무력+통솔) */
export function postScore(officerId: string, key: PostKey): number {
  if (key === '치안') return stat(officerId, 'war') + stat(officerId, 'leadership');
  return stat(officerId, POST_STAT[key]);
}

/** 치안이 한 턴에 오르는 양 = 2 + (무력+통솔)/40 */
export const securityGain = (officerId: string) => 2 + postScore(officerId, '치안') / 40;

/** 이번 턴 예상 효과 한 줄 */
export function postPreview(s: GameState, cityId: string, key: PostKey, officerId: string | null): string {
  if (!officerId) return '비어 있음';
  const c = s.cities[cityId];
  switch (key) {
    case '농업':
      return `농업 +${fmt(stat(officerId, 'politics') / 10)} (금 0)`;
    case '상업':
      return `상업 +${fmt(stat(officerId, 'politics') / 10)} (금 0)`;
    case '징병': {
      const n = Math.floor(c.population * NATURAL_TROOP_RATE * (3 + stat(officerId, 'charm') / 100));
      return c.troops >= c.population * NATURAL_TROOP_CAP ? '병사가 인구의 15% 를 넘어 늘지 않음' : `병사 자연 증가 +${n} (3배 + 매력/100)`;
    }
    case '훈련':
      return `훈련도 +${fmt(stat(officerId, 'leadership') / 10)}`;
    case '치안':
      return `치안 +${fmt(Math.round(securityGain(officerId) * 10) / 10)}`;
  }
}

/** 민심이 이보다 낮으면 징병 담당은 쉼 (민심이 끝없이 떨어지지 않게) */
export const POST_CONSCRIPT_MIN_MORALE = 40;

/** 그 자리에 앉힘 (한 장수는 한 자리만). officerId null 이면 비움 */
export function assignPost(s: GameState, cityId: string, key: PostKey, officerId: string | null) {
  const c = s.cities[cityId];
  c.posts ??= {};
  c.postTurns ??= {};
  if (officerId) {
    for (const k of POST_KEYS) {
      if (c.posts[k] === officerId && k !== key) {
        delete c.posts[k];
        delete c.postTurns[k];
      }
    }
  }
  if (c.posts[key] !== officerId) c.postTurns[key] = 0;
  if (officerId) c.posts[key] = officerId;
  else {
    delete c.posts[key];
    delete c.postTurns[key];
  }
}

/** 병사 자연 증가: 인구의 0.1% (병사가 인구의 15% 를 넘으면 늘지 않음) */
export const NATURAL_TROOP_RATE = 0.001;
export const NATURAL_TROOP_CAP = 0.15;

/**
 * 매 턴 담당관 자동 내정.
 * 담당이 있는 자리는 제 효과, 빈 자리는 태수가 절반 효과로 대신 실행 (태수가 다른 자리를 맡고 있어도).
 * 징병 자리는 병사 자연 증가를 (1 + (2 + 매력/100) × 효과) 배로 늘림. 치안은 담당이 없으면 50 쪽으로 1 씩 돌아감.
 * 8턴 이어 맡으면(태수 대리 제외) 쓰는 능력 +1.
 */
export function runPosts(s: GameState, cityId: string) {
  const c = s.cities[cityId];
  c.posts ??= {};
  c.postTurns ??= {};
  const name = CITY_BY_ID[cityId].name;
  const gov = c.owner !== NEUTRAL ? governorOf(s, cityId)?.id ?? null : null;
  let growthMult = 1;
  for (const key of POST_KEYS) {
    let id = c.posts[key] ?? null;
    if (id) {
      const o = s.officers[id];
      // 성을 떠났거나 다른 나라가 된 장수는 자리에서 뺌
      if (!o || o.status !== 'active' || o.city !== cityId || o.nation !== c.owner) {
        delete c.posts[key];
        delete c.postTurns[key];
        id = null;
      }
    }
    const assigned = !!id;
    if (!assigned && key === '치안') {
      const sec = c.security ?? 50;
      c.security = sec > 50 ? sec - 1 : sec < 50 ? sec + 1 : sec;
    }
    const who = id ?? gov;
    if (!who) continue;
    const eff = assigned ? 1 : 0.5;
    switch (key) {
      case '농업':
        c.agri = clamp100(c.agri + (stat(who, 'politics') / 10) * eff);
        break;
      case '상업':
        c.commerce = clamp100(c.commerce + (stat(who, 'politics') / 10) * eff);
        break;
      case '징병':
        growthMult = 1 + (2 + stat(who, 'charm') / 100) * eff;
        break;
      case '훈련':
        c.training = clamp100(c.training + (stat(who, 'leadership') / 10) * eff);
        break;
      case '치안':
        c.security = clamp100((c.security ?? 50) + securityGain(who) * eff);
        break;
    }
    if (!assigned) continue;
    const o = s.officers[who];
    const t = (c.postTurns[key] ?? 0) + 1;
    c.postTurns[key] = t;
    if (t % 8 === 0) {
      const st = POST_STAT[key];
      o.statBonus ??= {};
      if (stat(who, st) < 100) {
        o.statBonus[st] = (o.statBonus[st] ?? 0) + 1;
        addLog(s, `${officerName(who)}, ${name} ${key} 담당 ${t}턴째 — ${STAT_NAME[st]} +1`);
      }
    }
  }
  // 병사 자연 증가
  if (c.owner !== NEUTRAL && c.troops < c.population * NATURAL_TROOP_CAP) {
    const n = Math.floor(c.population * NATURAL_TROOP_RATE * growthMult);
    c.troops += n;
    c.population -= n;
  }
}

/** 매 턴 치안 효과: 60 이상 민심 +1, 30 미만 민심 −1 에 20% 확률로 도적 (금 5% 잃음) */
export function tickSecurity(s: GameState, cityId: string) {
  const c = s.cities[cityId];
  c.security = clamp100(c.security ?? 50);
  if (c.security >= 60) c.morale = clamp100(c.morale + 1);
  else if (c.security < 30) {
    c.morale = clamp100(c.morale - 1);
    if (Math.random() < 0.2 && c.gold > 0) {
      const lost = Math.floor(c.gold * 0.05);
      c.gold -= lost;
      if (lost > 0) addLog(s, `${CITY_BY_ID[cityId].name}에 도적이 들어 금 ${lost.toLocaleString()}을 잃음 (치안 ${Math.round(c.security)})`);
    }
  }
}

/** 컴퓨터 나라: 빈 자리에 그 자리 능력이 가장 높은 놀고 있는 장수를 앉힘 */
export function aiFillPosts(s: GameState, cityId: string) {
  const c = s.cities[cityId];
  c.posts ??= {};
  for (const key of POST_KEYS) {
    if (c.posts[key]) continue;
    const used = new Set(Object.values(c.posts));
    const best = officersInCity(s, cityId)
      .filter((o) => o.nation === c.owner && !used.has(o.id))
      .sort((a, b) => postScore(b.id, key) - postScore(a.id, key))[0];
    if (best) assignPost(s, cityId, key, best.id);
  }
}
