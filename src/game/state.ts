// 게임 상태 타입과 초기화
import citiesData from '../data/cities.json';
import roadsData from '../data/roads.json';
import nationsData from '../data/nations.json';
import officersData from '../data/officers.json';
import roninData from '../data/ronin.json';
import diplomacyData from '../data/diplomacy.json';

// ---------- 원본 데이터 타입 ----------
export interface CityData {
  id: string;
  regionId: number;
  name: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
  owner: string;
  /** 성 그림 양식 (나라별 + tribe·wa) */
  castleStyle: 'goguryeo' | 'baekje' | 'silla' | 'gaya' | 'buyeo' | 'yan' | 'tribe' | 'wa' | string;
  /** 성 그림 크기 단계 */
  castleSize: 1 | 2 | 3 | 4;
  /** 딸린 성 */
  subCastles: { name: string; loc: string; memo: string }[];
  memo?: string;
  labelSide: 'L' | 'R' | 'B' | string;
  population: number;
  troops: number;
  goods: string[];
  placeNames: string;
  capitalOf?: string | null;
  /** 무기 산지: 2 주산지, 1 조금 */
  arms?: Partial<Record<ArmsKind, 1 | 2>>;
  /** 산지 근거 한 줄 */
  armsNote?: string;
  /** 항구 (배를 만들고 바닷길로 나갈 수 있음) */
  port?: boolean;
  /** 346년 주인·양식 근거 */
  basis346?: string;
  /** 성 그림·이름표만 옮겨 그릴 값 (길·부대·클릭 좌표는 그대로) */
  drawDx?: number;
  drawDy?: number;
}

// ---------- 무기 산지 ----------
export type ArmsKind = '말' | '철' | '활' | '쇠뇌';
export const ARMS_KINDS: ArmsKind[] = ['말', '철', '활', '쇠뇌'];
/** 산지 무기 → 성 무기 (철은 창 2/3 · 철갑 1/3) */
export const ARMS_TO_WEAPONS: Record<ArmsKind, [WeaponKind, number][]> = {
  말: [['horse', 1]],
  활: [['bow', 1]],
  쇠뇌: [['crossbow', 1]],
  철: [
    ['spear', 2 / 3],
    ['armor', 1 / 3],
  ],
};
/** 매 턴 인구 1만 명당 만들어지는 무기 (주산지 150, 조금 50) */
export const ARMS_PER_10K: Record<1 | 2, number> = { 2: 150, 1: 50 };

/** 새 게임 처음 무기 (성 병력 대비 비율) */
const START_WEAPON_RATE: Record<string, Record<WeaponKind, number>> = {
  north: { spear: 0.3, bow: 0.3, horse: 0.25, crossbow: 0.05, armor: 0.05 },
  yan: { spear: 0.3, bow: 0.2, horse: 0.35, crossbow: 0.05, armor: 0.08 },
  baekje: { spear: 0.35, bow: 0.3, horse: 0.1, crossbow: 0.05, armor: 0.02 },
  silla: { spear: 0.35, bow: 0.25, horse: 0.1, crossbow: 0.03, armor: 0.02 },
  gaya: { spear: 0.35, bow: 0.2, horse: 0.1, crossbow: 0.03, armor: 0.1 },
  other: { spear: 0.35, bow: 0.25, horse: 0.03, crossbow: 0, armor: 0.01 },
};
function startWeaponRate(nation: string) {
  if (nation === 'goguryeo' || nation === 'buyeo' || nation === 'dongbuyeo') return START_WEAPON_RATE.north;
  return START_WEAPON_RATE[nation] ?? START_WEAPON_RATE.other;
}

// ---------- 담당관 ----------
export type PostKey = '농업' | '상업' | '징병' | '훈련' | '치안';
export const POST_KEYS: PostKey[] = ['농업', '상업', '징병', '훈련', '치안'];
/** 자리마다 쓰는 능력 (8턴 이어 맡으면 이 능력 +1). 치안은 무력+통솔 */
export const POST_STAT: Record<PostKey, keyof OfficerStats> = {
  농업: 'politics',
  상업: 'politics',
  징병: 'charm',
  훈련: 'leadership',
  치안: 'war',
};

export type RoadType = 'plain' | 'mountain' | 'pass' | 'sea';

export interface RoadData {
  a: string;
  b: string;
  type: RoadType;
  via: string | null;
  /** 바닷길에 걸리는 턴 */
  turns?: number;
}

export interface PassData {
  name: string;
  x: number;
  y: number;
}

export interface NationData {
  id: string;
  name: string;
  color: string;
  hanja: string;
  ruler: string | null;
  playable: boolean;
  flagName: string;
  capital: string | null;
  offmapCapital?: { name: string; x: number; y: number; note?: string };
  aggression: number;
}

export interface OfficerStats {
  leadership: number;
  war: number;
  intelligence: number;
  politics: number;
  charm: number;
}

export interface OfficerData {
  id: string;
  name: string;
  nation: string;
  city: string;
  rank: string;
  stats: OfficerStats;
  life: string;
  family: Record<string, string>;
  love: string;
  hate: string;
  tactic: string[] | null;
  skill: string[] | null;
  bio: string[];
  source: string;
  portrait: { full: string; face: string; faceCrop?: number[] } | null;
  loyalty: number;
  deathYear: number | null;
  successor: string | null;
  virtual?: boolean;
  /** 재야 인재의 자존심(등용 난이도) */
  pride?: number;
  isRonin?: boolean;
  /** 등장 해 (시작 해보다 뒤면 그때 출사) */
  debut?: number;
  /** 다른 이름 */
  alias?: string;
  /** 왕호·칭호 (예: 부여구 → 근초고왕) */
  title?: string;
  /** 병과 적성과 수련으로 오를 수 있는 한계 */
  aptitude?: Aptitude;
  aptitudeCap?: Aptitude;
  kind?: string;
  ambition?: number;
  giri?: number;
}

// ---------- 병과 적성 ----------
export type AptKey = '창' | '궁' | '기' | '병기' | '수' | '방';
export const APT_KEYS: AptKey[] = ['창', '궁', '기', '병기', '수', '방'];
export type AptGrade = 'S' | 'A' | 'B' | 'C';
export type Aptitude = Record<AptKey, AptGrade>;
export const APT_ORDER: AptGrade[] = ['C', 'B', 'A', 'S'];
/** 등급 배율 */
export const APT_MULT: Record<AptGrade, number> = { S: 1.2, A: 1.1, B: 1.0, C: 0.85 };
/** 다음 등급까지 필요한 경험 (C→B 100, B→A 200, A→S 300) */
export const APT_NEED: Record<AptGrade, number> = { C: 100, B: 200, A: 300, S: Infinity };
/** 등급이 오를 때 +1 되는 능력치 */
export const APT_STAT: Record<AptKey, keyof OfficerStats> = {
  창: 'war',
  기: 'war',
  궁: 'intelligence',
  병기: 'intelligence',
  수: 'leadership',
  방: 'leadership',
};
const defaultApt = (): Aptitude => ({ 창: 'B', 궁: 'B', 기: 'B', 병기: 'B', 수: 'B', 방: 'B' });
const zeroExp = (): Record<AptKey, number> => ({ 창: 0, 궁: 0, 기: 0, 병기: 0, 수: 0, 방: 0 });

/** 지금 그 장수의 적성 등급 (수련·전투로 오른 값) */
export function aptOf(s: GameState, officerId: string, key: AptKey): AptGrade {
  return s.officers[officerId]?.apt?.[key] ?? OFFICER_DATA_BY_ID[officerId]?.aptitude?.[key] ?? 'B';
}
export function aptCapOf(officerId: string, key: AptKey): AptGrade {
  return OFFICER_DATA_BY_ID[officerId]?.aptitudeCap?.[key] ?? 'S';
}
export const aptMult = (s: GameState, officerId: string | null | undefined, key: AptKey) => (officerId ? APT_MULT[aptOf(s, officerId, key)] : 1);
/** 한계까지 올랐는가 */
export function aptAtCap(s: GameState, officerId: string, key: AptKey): boolean {
  return APT_ORDER.indexOf(aptOf(s, officerId, key)) >= APT_ORDER.indexOf(aptCapOf(officerId, key));
}

/**
 * 적성 경험을 더하고 문턱을 넘으면 한 등급 올림 (한계까지). 오르면 능력치 +1 (100 까지), 기록 한 줄.
 * 오른 등급들을 돌려줌.
 */
export function addAptExp(s: GameState, officerId: string, key: AptKey, n: number, aptName: string): AptGrade[] {
  const o = s.officers[officerId];
  if (!o) return [];
  o.apt ??= { ...(OFFICER_DATA_BY_ID[officerId]?.aptitude ?? defaultApt()) };
  o.aptExp ??= zeroExp();
  o.statBonus ??= {};
  if (aptAtCap(s, officerId, key)) return [];
  o.aptExp[key] += n;
  const ups: AptGrade[] = [];
  while (!aptAtCap(s, officerId, key) && o.aptExp[key] >= APT_NEED[o.apt[key]]) {
    o.aptExp[key] -= APT_NEED[o.apt[key]];
    o.aptExp[key] = 0;
    o.apt[key] = APT_ORDER[APT_ORDER.indexOf(o.apt[key]) + 1];
    ups.push(o.apt[key]);
    const st = APT_STAT[key];
    const base = OFFICER_DATA_BY_ID[officerId]?.stats[st] ?? 0;
    const cur = o.statBonus[st] ?? 0;
    if (base + cur < 100) o.statBonus[st] = cur + 1;
    addLog(s, `${officerName(officerId)}, ${aptName} 적성 ${o.apt[key]} 로 오름`);
  }
  if (aptAtCap(s, officerId, key)) o.aptExp[key] = 0;
  return ups;
}

interface RoninData {
  id: string;
  name: string;
  city: string;
  culture: string;
  stats: OfficerStats;
  pride: number;
  bio: string[];
  virtual?: boolean;
}

interface RoadsFile {
  roads: { a: string; b: string; type: string; via: string | null }[];
  sea: { a: string; b: string; type: string; turns?: number }[];
  passes: PassData[];
}

export const CITIES: CityData[] = citiesData as CityData[];
export const NATIONS: NationData[] = nationsData as unknown as NationData[];
const BASE_OFFICERS: OfficerData[] = (officersData as unknown as OfficerData[]).map((o) => ({
  ...o,
  loyalty: o.loyalty ?? 80,
  deathYear: o.deathYear ?? null,
  successor: o.successor ?? null,
}));
const RONIN: OfficerData[] = (roninData as RoninData[]).map((r) => ({
  id: r.id,
  name: r.name,
  nation: 'none',
  city: r.city,
  rank: '재야',
  stats: r.stats,
  life: '',
  family: {},
  love: '',
  hate: '',
  tactic: null,
  skill: null,
  bio: r.bio,
  source: r.virtual ? '가상 인물' : '',
  portrait: null,
  loyalty: 0,
  deathYear: null,
  successor: null,
  virtual: r.virtual,
  pride: r.pride,
  isRonin: true,
}));
export const OFFICERS: OfficerData[] = [...BASE_OFFICERS, ...RONIN];
const roadsFile = roadsData as unknown as RoadsFile;
export const ROADS: RoadData[] = [
  ...roadsFile.roads.map((r) => ({ a: r.a, b: r.b, type: r.type as RoadType, via: r.via ?? null })),
  ...roadsFile.sea.map((r) => ({ a: r.a, b: r.b, type: 'sea' as RoadType, via: null, turns: r.turns })),
];
export const PASSES: PassData[] = roadsFile.passes;

export const CITY_BY_ID: Record<string, CityData> = Object.fromEntries(CITIES.map((c) => [c.id, c]));
export const NATION_BY_ID: Record<string, NationData> = Object.fromEntries(NATIONS.map((n) => [n.id, n]));
export const OFFICER_DATA_BY_ID: Record<string, OfficerData> = Object.fromEntries(OFFICERS.map((o) => [o.id, o]));
export const CITY_BY_REGION: Record<number, CityData> = Object.fromEntries(CITIES.map((c) => [c.regionId, c]));

export const NEUTRAL = 'none';
export const SAVE_VERSION = 8;
export const START_YEAR = 346;

// ---------- 지도 상수 ----------
export const MAP_W = 1000;
export const MAP_H = 1088;
export const CELL = 10;
export const GRID_W = Math.ceil(MAP_W / CELL); // 100
export const GRID_H = Math.ceil(MAP_H / CELL); // 109

// ---------- 게임 상태 타입 ----------
export type WeaponKind = 'spear' | 'bow' | 'horse' | 'crossbow' | 'armor';
export const WEAPON_KINDS: WeaponKind[] = ['spear', 'bow', 'horse', 'crossbow', 'armor'];
export const WEAPON_NAME: Record<WeaponKind, string> = {
  spear: '창',
  bow: '활',
  horse: '말',
  crossbow: '쇠뇌',
  armor: '철갑',
};
export type Weapons = Record<WeaponKind, number>;

export type UnitType = 'infantry' | 'spear' | 'siege' | 'archer' | 'crossbow' | 'cavalry' | 'heavy' | 'gaema' | 'xianbei';
export const UNIT_TYPES: UnitType[] = ['infantry', 'spear', 'siege', 'archer', 'crossbow', 'cavalry', 'heavy', 'gaema', 'xianbei'];
export const UNIT_NAME: Record<UnitType, string> = {
  infantry: '보병',
  spear: '창병',
  siege: '공성병',
  archer: '궁병',
  crossbow: '노병',
  cavalry: '기병',
  heavy: '철기병',
  gaema: '개마무사',
  xianbei: '선비 중장기병',
};

/** 병기 연구: points 로 일반 단계, special 로 특수 병과 */
export interface Research {
  points: number;
  special: number;
}

export interface CityState {
  id: string;
  owner: string;
  population: number;
  troops: number;
  training: number;
  morale: number;
  defense: number;
  agri: number;
  commerce: number;
  flood: number;
  gold: number;
  food: number;
  weapons: Weapons;
  /** 담당관: 자리마다 장수 id */
  posts: Partial<Record<PostKey, string>>;
  /** 그 자리를 이어 맡은 턴 수 */
  postTurns: Partial<Record<PostKey, number>>;
  /** 치안 0~100 */
  security: number;
  /** 임명한 태수 (없거나 성을 떠났으면 정치가 가장 높은 장수) */
  governor?: string | null;
  /** 배 수 (1척 = 병사 100명) */
  ships: number;
}

/** 이동·수송 행렬: 길을 따라 n턴 뒤 아군 성에 도착 (싸우지 않음) */
export interface Convoy {
  id: string;
  nation: string;
  from: string;
  to: string;
  /** 도착까지 남은 턴 */
  turnsLeft: number;
  /** 지금까지 간 턴 (되돌아갈 때 씀) */
  elapsed: number;
  returning: boolean;
  officers: string[];
  troops: number;
  gold: number;
  food: number;
  weapons: Weapons;
  /** 바닷길로 가면 싣고 가는 배 */
  ships?: number;
}

/** unborn: 아직 등장 해가 오지 않음 (화면·명령·AI 모두에서 안 보임) */
export type OfficerStatus = 'active' | 'ronin' | 'prisoner' | 'dead' | 'moving' | 'unborn';

export interface OfficerState {
  id: string;
  nation: string;
  rank: string;
  /** 있는 성 (포로는 갇힌 성, 재야는 머무는 성). 출진 중이면 null */
  city: string | null;
  armyId: string | null;
  /** 이번 턴에 이미 명령을 받았는가 */
  acted: boolean;
  status: OfficerStatus;
  loyalty: number;
  /** 포로로 잡은 나라 */
  captor: string | null;
  /** 이 재야를 찾아낸 나라들 */
  foundBy: string[];
  /** 장수 이동 */
  moveTo: string | null;
  moveTurns: number;
  /** 마지막으로 등용을 시도받은 턴 */
  triedTurn: number;
  /** 일기토에서 다쳐 이 턴까지 출진 못 함 */
  injuredUntil?: number;
  /** 지금 적성 등급과 수련 경험 */
  apt: Aptitude;
  aptExp: Record<AptKey, number>;
  /** 적성이 올라 더해진 능력치 */
  statBonus: Partial<OfficerStats>;
}

export interface Army {
  id: string;
  nation: string;
  officers: string[]; // 0번이 대장
  troops: number;
  /** 무기를 든 병력 (나머지는 맨손) */
  armed: number;
  unitType: UnitType;
  food: number;
  /** 실은 금 (점령한 성 민심 수습에 씀) */
  gold: number;
  training: number;
  origin: string;
  /** 성 id 경로 (0 = 출발 성) */
  path: string[];
  /** 현재 지나고 있는 구간의 시작 인덱스 */
  pathIndex: number;
  /** 현재 구간에서 간 거리(가중 거리) */
  progress: number;
  sieging: boolean;
  engaged: boolean;
  retreating: boolean;
  /** 남의 성을 지나갈 수 있음(역사 이벤트 부대) */
  passThrough: boolean;
  ignoreTruce: boolean;
  /** 내 성을 노린다는 첫 경고를 했는가 */
  warned: boolean;
  warnedNear: boolean;
  /** 지나온 칸 좌표 (지도 좌표) */
  trail: [number, number][];
  /** 부대 명령: 적 부대를 만나면 싸움/피함, 목표 도착 뒤 공성/대기 */
  order: ArmyOrder;
  /** 사기 0~100 (0 이 되면 무너짐) */
  morale: number;
  /** 출진할 때 병력 (10% 아래로 줄면 무너짐) */
  startTroops: number;
  /** 길 위에서 맞붙은 적 부대 id */
  clash: string | null;
  /** 교전한 턴 수 */
  clashTurns: number;
  /** 피함 명령으로 멈춰 있을 턴 */
  hold: number;
  /** 공성한 턴 수 */
  siegeTurns: number;
  /** 싣고 가는 배 */
  ships: number;
}

export interface PendingBattle {
  armyId: string;
  cityId: string;
  /** 내 성 수비: 출격/농성 선택 */
  defense: boolean;
  /** 일기토 제안 가능 */
  duelOffer: boolean;
  /** 컴퓨터 수비의 출격 여부(미리 정함) */
  aiSortie: boolean;
}

export interface BattleDecision {
  sortie?: boolean;
  duel?: boolean;
}

export interface Grid {
  region: number[];
  owner: string[];
  control: number[];
}

export type TreatyType = 'truce' | 'alliance' | 'tribute';
export interface Treaty {
  type: TreatyType;
  a: string;
  b: string;
  /** null 이면 기한 없음 */
  turnsLeft: number | null;
}

export interface DuelRound {
  text: string;
  hpA: number;
  hpB: number;
}
export interface DuelResult {
  a: { id: string; nation: string };
  b: { id: string; nation: string };
  rounds: DuelRound[];
  winner: 'a' | 'b';
  outcome: string;
  city: string;
}

export interface BattleSide {
  nation: string;
  leader: string | null;
  before: number;
  after: number;
}
export interface ArmyOrder {
  engage: 'fight' | 'avoid';
  arrive: 'siege' | 'wait';
}

export interface BattleReportData {
  city: string;
  /** 어디서 (길 위 교전이면 "갑 ↔ 을 사이 길") */
  place?: string;
  /** 길 위 교전 */
  clash?: boolean;
  /** 성벽 내구 변화 */
  wall?: [number, number];
  /** 결과: 계속·승리·패배·함락 */
  result?: string;
  field: boolean;
  siege: boolean;
  attacker: BattleSide;
  defender: BattleSide;
  duel: string | null;
  fallen: boolean;
  captured: string[];
  lines: string[];
}

export type Popup =
  | { kind: 'event'; title: string; speaker: string | null; nation: string | null; text: string[] }
  | { kind: 'duel'; duel: DuelResult }
  | { kind: 'battle'; report: BattleReportData };

export interface GameState {
  version: number;
  year: number;
  season: number; // 0 봄 1 여름 2 가을 3 겨울
  turn: number;
  player: string;
  cities: Record<string, CityState>;
  officers: Record<string, OfficerState>;
  armies: Army[];
  grid: Grid;
  log: string[];
  pending: PendingBattle[];
  /** 턴 진행 중(수비·일기토 선택 대기) */
  midTurn: boolean;
  status: 'playing' | 'won' | 'lost';
  nextArmyId: number;
  relations: Record<string, number>;
  treaties: Treaty[];
  firedEvents: string[];
  popups: Popup[];
  alerts: string[];
  /** 나라별 병기 연구 */
  research: Record<string, Research>;
  /** AI 수준 (ai.ts AI_LEVELS 의 id) */
  aiLevel: string;
  /** 시나리오 */
  scenario: string;
  /** 이동·수송 중인 행렬 */
  convoys: Convoy[];
  nextConvoyId: number;
}

export const SEASONS = ['봄', '여름', '가을', '겨울'];

export function dateLabel(s: GameState): string {
  return `${s.year}년 ${SEASONS[s.season]}`;
}

// ---------- 도움 함수 ----------
export const clamp100 = (v: number) => Math.max(0, Math.min(100, v));
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function emptyWeapons(): Weapons {
  return { spear: 0, bow: 0, horse: 0, crossbow: 0, armor: 0 };
}

export function roadsOf(cityId: string): RoadData[] {
  return ROADS.filter((r) => r.a === cityId || r.b === cityId);
}

export function otherEnd(r: RoadData, cityId: string): string {
  return r.a === cityId ? r.b : r.a;
}

export function findRoad(a: string, b: string): RoadData | undefined {
  return ROADS.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

export function isMountainCity(cityId: string): boolean {
  return roadsOf(cityId).some((r) => r.type === 'mountain' || r.type === 'pass');
}

export function officerName(id: string): string {
  return OFFICER_DATA_BY_ID[id]?.name ?? id;
}

export function nationName(id: string): string {
  return NATION_BY_ID[id]?.name ?? id;
}

export function nationColor(id: string): string {
  return NATION_BY_ID[id]?.color ?? '#888';
}

/** 그 성에서 일할 수 있는 장수(포로·재야 제외) */
export function officersInCity(s: GameState, cityId: string): OfficerState[] {
  return Object.values(s.officers).filter((o) => o.city === cityId && o.status === 'active');
}

/** 장수가 맡은 담당 자리를 모두 비움 (출진·이동할 때) */
export function clearPosts(s: GameState, officerId: string) {
  for (const c of Object.values(s.cities)) {
    for (const k of POST_KEYS) {
      if (c.posts?.[k] === officerId) {
        delete c.posts[k];
        if (c.postTurns) delete c.postTurns[k];
      }
    }
  }
}

/** 그 성의 태수 (임명한 태수, 없으면 정치가 가장 높은 장수) */
export function governorOf(s: GameState, cityId: string): OfficerState | undefined {
  const city = s.cities[cityId];
  const list = officersInCity(s, cityId).filter((o) => o.nation === city.owner);
  const appointed = city.governor ? list.find((o) => o.id === city.governor) : undefined;
  if (appointed) return appointed;
  list.sort((a, b) => stat(b.id, 'politics') - stat(a.id, 'politics'));
  return list[0];
}

/** stat() 이 더해 줄 능력치 보너스를 가진 게임 상태 (지금 다루는 상태로 맞춰 둠) */
let bonusSource: Record<string, OfficerState> | null = null;
export function bindStatBonuses(s: GameState) {
  bonusSource = s.officers;
}

export function stat(officerId: string, key: keyof OfficerStats): number {
  const base = OFFICER_DATA_BY_ID[officerId]?.stats[key] ?? 0;
  const bonus = bonusSource?.[officerId]?.statBonus?.[key] ?? 0;
  return Math.min(100, base + bonus);
}

export function rulerOf(s: GameState, nation: string): OfficerState | undefined {
  return Object.values(s.officers).find(
    (o) => o.nation === nation && o.rank === '군주' && (o.status === 'active' || o.status === 'moving'),
  );
}

export function citiesOf(s: GameState, nation: string): CityState[] {
  return Object.values(s.cities).filter((c) => c.owner === nation);
}

/** 나라의 수도: 원래 수도를 가지고 있으면 그곳, 아니면 인구가 가장 많은 성 */
export function capitalOf(s: GameState, nation: string): string | null {
  const orig = NATION_BY_ID[nation]?.capital;
  if (orig && s.cities[orig]?.owner === nation) return orig;
  const list = citiesOf(s, nation).sort((a, b) => b.population - a.population);
  return list[0]?.id ?? null;
}

export function nationGold(s: GameState, nation: string): number {
  return citiesOf(s, nation).reduce((a, c) => a + c.gold, 0);
}

export function addLog(s: GameState, msg: string) {
  s.log.push(`[${dateLabel(s)}] ${msg}`);
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

export function addAlert(s: GameState, msg: string) {
  s.alerts.push(msg);
  addLog(s, msg);
}

export function cellIndex(cx: number, cy: number) {
  return cy * GRID_W + cx;
}

/** 지도 좌표 → 칸 번호 */
export function cellAt(x: number, y: number): number {
  const cx = Math.max(0, Math.min(GRID_W - 1, Math.floor(x / CELL)));
  const cy = Math.max(0, Math.min(GRID_H - 1, Math.floor(y / CELL)));
  return cellIndex(cx, cy);
}

// ---------- 관계 ----------
export function relKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function relation(s: GameState, a: string, b: string): number {
  return s.relations[relKey(a, b)] ?? 0;
}

export function changeRelation(s: GameState, a: string, b: string, d: number) {
  if (a === b || a === NEUTRAL || b === NEUTRAL) return;
  const k = relKey(a, b);
  s.relations[k] = clamp((s.relations[k] ?? 0) + d, -100, 100);
}

// ---------- 지역 칸 만들기 ----------
/**
 * regions.png 의 빨강 채널 값으로 칸마다 지역 번호를 정한다.
 * 칸 안에서 가장 많은 값을 쓰고, 칸을 하나도 얻지 못한 작은 지역(섬 등)은 성이 있는 칸을 준다.
 */
export function buildRegionGrid(red: Uint8ClampedArray | number[], width: number, height: number): number[] {
  const valid = new Set(CITIES.map((c) => c.regionId));
  const region = new Array<number>(GRID_W * GRID_H).fill(0);
  const sx = width / MAP_W;
  const sy = height / MAP_H;
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const counts = new Map<number, number>();
      const y0 = Math.floor(cy * CELL * sy);
      const y1 = Math.min(height, Math.floor((cy * CELL + CELL) * sy));
      const x0 = Math.floor(cx * CELL * sx);
      const x1 = Math.min(width, Math.floor((cx * CELL + CELL) * sx));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const v = red[y * width + x];
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
      let best = 0;
      let bestN = -1;
      counts.forEach((n, v) => {
        if (n > bestN) {
          best = v;
          bestN = n;
        }
      });
      region[cellIndex(cx, cy)] = valid.has(best) ? best : 0;
    }
  }
  const have = new Set(region);
  for (const c of CITIES) {
    if (!have.has(c.regionId)) region[cellAt(c.x, c.y)] = c.regionId;
  }
  return region;
}

// ---------- 새 게임 ----------
/** AI 수준별 시작 병력 배율 (ai.ts AI_LEVELS 와 같은 값) */
const START_TROOPS_BY_LEVEL: Record<string, number> = { master: 1.3 };

export function newGame(player: string, regionGrid: number[], aiLevel = 'normal', scenario = '346'): GameState {
  const cities: Record<string, CityState> = {};
  for (const c of CITIES) {
    // 처음 무기: 나라별 병력 대비 비율 + 산지 성은 그 무기를 병력의 20% 더
    const weapons = emptyWeapons();
    const rate = startWeaponRate(c.owner);
    for (const k of WEAPON_KINDS) weapons[k] = Math.floor(c.troops * rate[k]);
    for (const a of ARMS_KINDS) {
      if (!c.arms?.[a]) continue;
      for (const [w, f] of ARMS_TO_WEAPONS[a]) weapons[w] += Math.floor(c.troops * 0.2 * f);
    }
    cities[c.id] = {
      id: c.id,
      owner: c.owner,
      population: c.population,
      // 초특급: AI 성은 시작 병력 +30%
      troops: c.owner !== player && c.owner !== NEUTRAL ? Math.floor(c.troops * (START_TROOPS_BY_LEVEL[aiLevel] ?? 1)) : c.troops,
      training: 40,
      morale: 60,
      defense: isMountainCity(c.id) ? 60 : 40,
      agri: Math.min(100, Math.floor(c.population / 1000)),
      commerce: Math.min(100, Math.floor(c.population / 1000)),
      flood: 30,
      gold: Math.floor(c.population / 20),
      food: Math.floor(c.population / 5),
      weapons,
      posts: {},
      postTurns: {},
      security: 50,
      // 항구는 배 10척을 갖고 시작
      ships: c.port ? 10 : 0,
    };
  }
  const officers: Record<string, OfficerState> = {};
  for (const o of OFFICERS) {
    const unborn = (o.debut ?? START_YEAR) > START_YEAR;
    officers[o.id] = {
      id: o.id,
      nation: o.nation,
      rank: o.rank,
      city: unborn ? null : o.city,
      armyId: null,
      acted: false,
      // 나라가 'none' 인 장수(주인 없는 성 등)는 재야
      status: unborn ? 'unborn' : o.isRonin || o.nation === NEUTRAL ? 'ronin' : 'active',
      loyalty: o.isRonin || o.nation === NEUTRAL ? 0 : o.loyalty,
      captor: null,
      foundBy: [],
      moveTo: null,
      moveTurns: 0,
      triedTurn: -1,
      apt: { ...(o.aptitude ?? defaultApt()) },
      aptExp: zeroExp(),
      statBonus: {},
    };
  }
  const relations: Record<string, number> = {};
  const rel = (diplomacyData as { relations: Record<string, number> }).relations;
  for (const k in rel) {
    const [a, b] = k.split('-');
    relations[relKey(a, b)] = rel[k];
  }
  const owner = regionGrid.map((r) => (r === 0 ? '' : CITY_BY_REGION[r]?.owner ?? ''));
  const control = regionGrid.map((r) => (r === 0 ? 0 : 100));
  const s: GameState = {
    version: SAVE_VERSION,
    year: START_YEAR,
    season: 0,
    turn: 1,
    player,
    cities,
    officers,
    armies: [],
    grid: { region: regionGrid.slice(), owner, control },
    log: [],
    pending: [],
    midTurn: false,
    status: 'playing',
    nextArmyId: 1,
    relations,
    treaties: [],
    firedEvents: [],
    popups: [],
    alerts: [],
    research: Object.fromEntries(NATIONS.map((n) => [n.id, { points: 0, special: 0 }])),
    convoys: [],
    nextConvoyId: 1,
    aiLevel,
    scenario,
  };
  const ruler = rulerOf(s, player);
  addLog(s, `${nationName(player)}${ruler ? ' ' + officerName(ruler.id) : ''}, 천하를 향한 첫걸음을 내딛다.`);
  bindStatBonuses(s);
  return s;
}

export function cloneState(s: GameState): GameState {
  const c = JSON.parse(JSON.stringify(s)) as GameState;
  bindStatBonuses(c);
  return c;
}
