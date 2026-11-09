import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Army,
  CITIES,
  CITY_BY_ID,
  CITY_BY_REGION,
  GameState,
  MAP_H,
  MAP_W,
  UnitType,
  NATIONS,
  NEUTRAL,
  PASSES,
  ROADS,
  capitalOf,
  cellAt,
  findRoad,
  nationColor,
  officerName,
} from '../game/state';
import { armyTarget, armyTurnsLeft, onSea, edgeLength, findPath, pointAlong, reachableTargets, roadPoints, turnsFor } from '../game/military';
import placesData from '../data/places.json';
import castleRatiosData from '../data/castleRatios.json';
import castleFacingData from '../data/castleFacing.json';
import nationLabelsData from '../data/nationLabels.json';
import { asset } from './assets';
import { L } from './Stage';
import CityBars, { BarView } from './CityBars';
import { MapViewState } from './MiniMap';

/** 새 지도(v2) 그림이 덮는 지도 좌표 범위 */
export const IMG_X = 170;
export const IMG_Y = 262;
export const IMG_W = 770;
export const IMG_H = 826;
/** 지도 그림이 지도 칸 가로와 대화창 위까지를 꽉 채우는 배율 */
export const MIN_ZOOM = Math.max(L.map.w / IMG_W, L.map.viewBottom / IMG_H);
export const MAX_ZOOM = 12;
export const START_ZOOM = 2.6;
/** 지도 그림 바깥이 보이지 않게 배율·위치를 자름 (아래는 대화창 위까지) */
export function clampView(v: MapViewState): MapViewState {
  const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.s));
  const x = Math.min(-IMG_X * s, Math.max(L.map.w - (IMG_X + IMG_W) * s, v.x));
  const y = Math.min(-IMG_Y * s, Math.max(L.map.viewBottom - (IMG_Y + IMG_H) * s, v.y));
  return { s, x, y };
}

const SEASON_FILE = ['spring', 'summer', 'autumn', 'winter'];
/** 이 배율 이상 확대해야 요새·싸움터 이름을 보임 */
const PLACE_NAME_ZOOM = 4.5;
/**
 * 축소·확대 기준 (가장 작은 배율 기준):
 * OVERVIEW_END 아래는 땅 칠하기·나라 이름·성 동그라미, DETAIL_ZOOM 이상은 성 그림만.
 * 그 사이 앞 절반에서 칠하기·나라 이름이 옅어지고, 뒤 절반에서 성 그림이 나타남 (둘이 함께 진하지 않음).
 */
const OVERVIEW_END = MIN_ZOOM * 1.35;
const DETAIL_ZOOM = MIN_ZOOM * 1.7;
const FADE_MID = (OVERVIEW_END + DETAIL_ZOOM) / 2;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 땅 칠하기 진하기: 축소 0.55 → (OVERVIEW_END~DETAIL_ZOOM) 0.22 → 배율 8 이상 0.10. 확대해도 옅게 남음 */
const fillOpacity = (s: number) => {
  if (s >= 8) return 0.1;
  if (s >= DETAIL_ZOOM) return 0.22;
  if (s <= OVERVIEW_END) return 0.55;
  return 0.55 - (0.55 - 0.22) * ((s - OVERVIEW_END) / (DETAIL_ZOOM - OVERVIEW_END));
};
/** 나라 이름 진하기 (1 → 0) */
const overviewAlpha = (s: number) => 1 - clamp01((s - OVERVIEW_END) / (FADE_MID - OVERVIEW_END));
/** 성 그림 진하기 (0 → 1) */
const detailAlpha = (s: number) => clamp01((s - FADE_MID) / (DETAIL_ZOOM - FADE_MID));
/** 성 그림이 지도와 함께 커지는 비율 (화면 고정 크기 기준) */
const castleGrow = (s: number) => Math.max(0.5, Math.min(2.6, s / 4));
/** 확대·축소 버튼 한 번에 */
const ZOOM_STEP = 1.25;
/** 계절 지도 조각: 한 장 4353×4670 점, 조각 1024 점, 5×5 */
const TILE_PX = 1024;
/** 이 배율 이상은 2배 지도(map/v2x2): 한 장 8706×9340 점, 9×10 조각 */
const X2_ZOOM = 5;
/** 성 그림 좌우 뒤집기 */
const CASTLE_FACING = castleFacingData as Record<string, { flip: boolean }>;
/** 이름 태그가 확대에 따라 커지는 비율 */
/** 이름 태그 배율 (글씨가 화면 12점 아래로 줄지 않게 1.1 이상) */
const tagGrow = (s: number) => Math.max(1.1, Math.min(1.6, s / 5));
/** 성 그림 너비 (크기 단계 1~4) */
const CASTLE_W: Record<number, number> = { 1: 56, 2: 66, 3: 78, 4: 92 };
const CASTLE_RATIOS = castleRatiosData as Record<string, number>;
const FLAG_W = 28;
const FLAG_RATIO = 2.938;
/** 나라 → 깃발 그림 (그 밖의 나라·소국은 small) */
const FLAG_KEY: Record<string, string> = {
  goguryeo: 'goguryeo',
  baekje: 'baekje',
  silla: 'silla',
  gaya: 'gaya',
  yan: 'yan',
  buyeo: 'buyeo',
  dongbuyeo: 'buyeo',
  yamato: 'wa',
  tsukushi: 'wa',
  izumo: 'wa',
  kibi: 'wa',
  tsushima: 'wa',
};
const flagKey = (nation: string) => FLAG_KEY[nation] ?? 'small';
/** 축소 화면 땅 칠하기 진하기와 경계선 */
const NATION_LINE: [number, number, number] = [0x1e, 0x14, 0x0a];
const REGION_LINE: [number, number, number] = [0x2a, 0x1c, 0x10];
const REGION_LINE_ALPHA = 0.45;
const NATION_LABELS = nationLabelsData as { id: string; name: string; x: number; y: number; size: number }[];
/** 시작 때 나라별 성 */
const START_CITIES: Record<string, string[]> = {};
for (const c of CITIES) (START_CITIES[c.owner] ??= []).push(c.id);



interface PlaceData {
  id: string;
  owner?: string;
  ownerBasis?: string;
  name: string;
  loc: string;
  x: number;
  y: number;
  firstYear?: number | null;
  memo: string;
  kind: string;
  conf?: string;
  sub?: string;
}
interface PlacesFile {
  forts: PlaceData[];
  battlefields: PlaceData[];
  labels: {
    rivers: { n: string; x: number; y: number; r?: number }[];
    mountains: { n: string; x: number; y: number }[];
    seas: { n: string; x: number; y: number }[];
  };
  passNotes: Record<string, string>;
}
const PLACES = placesData as unknown as PlacesFile;

/** 정보 창에 보일 내용 */
interface PlaceInfo {
  name: string;
  kind: string;
  loc?: string;
  firstYear?: number | null;
  memo?: string;
  conf?: string;
  ownerBasis?: string;
}

/** 두 성 사이 길의 굽은 점 목록 (from → to 방향). 부대 이동과 같은 점 (military.roadPoints) */
export const routePts = roadPoints;

function polyLen(pts: [number, number][]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}

/** 지금 구간에서 간 비율 (이동 계산은 기존 그대로) */
function armyRatio(a: Army): number {
  const r = findRoad(a.path[a.pathIndex], a.path[a.pathIndex + 1]);
  return r ? a.progress / edgeLength(r) : 0;
}

/** 부대 그리는 위치: 경로 위 비율 지점 */
export function armyDrawPos(a: Army): [number, number] {
  if (a.pathIndex >= a.path.length - 1) {
    const c = CITY_BY_ID[a.path[a.path.length - 1]];
    return [c.x, c.y];
  }
  return pointAlong(routePts(a.path[a.pathIndex], a.path[a.pathIndex + 1]), armyRatio(a));
}

/** 턴 종료 이동 모습용: 턴 처리 전 부대 자리 */
export interface ArmySnap {
  path: string[];
  pathIndex: number;
  progress: number;
  pos: [number, number];
}
export function snapArmies(armies: Army[]): Record<string, ArmySnap> {
  return Object.fromEntries(armies.map((a) => [a.id, { path: a.path.slice(), pathIndex: a.pathIndex, progress: a.progress, pos: armyDrawPos(a) }]));
}

function segLen(from: string, to: string): number {
  const r = findRoad(from, to);
  return r ? edgeLength(r) : polyLen(routePts(from, to));
}
/** 경로 처음부터 (pathIndex, progress) 까지 간 거리 */
function distOf(path: string[], pathIndex: number, progress: number): number {
  let d = 0;
  for (let i = 1; i <= Math.min(pathIndex, path.length - 1); i++) d += segLen(path[i - 1], path[i]);
  return d + (pathIndex < path.length - 1 ? progress : 0);
}
/** 경로 위 거리 d 의 지도 자리 */
function posAtDist(path: string[], d: number): [number, number] {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const len = segLen(path[i - 1], path[i]);
    if (d <= acc + len || i === path.length - 1) return pointAlong(routePts(path[i - 1], path[i]), len > 0 ? (d - acc) / len : 1);
    acc += len;
  }
  const c = CITY_BY_ID[path[path.length - 1]];
  return [c.x, c.y];
}
/** 이동 모습 t(0~1) 때 부대 자리: 같은 길이면 길을 따라, 길이 바뀌었으면 곧게. 새 부대는 출발 성에서 */
export function armyAnimPos(a: Army, prev: ArmySnap | undefined, t: number): [number, number] {
  const now = distOf(a.path, a.pathIndex, a.progress);
  if (!prev) return posAtDist(a.path, now * t);
  const samePrefix = prev.path.slice(0, prev.pathIndex + 2).every((id, i) => a.path[i] === id);
  if (samePrefix) {
    const d0 = distOf(a.path, prev.pathIndex, prev.progress);
    return posAtDist(a.path, d0 + (now - d0) * t);
  }
  const p1 = armyDrawPos(a);
  return [prev.pos[0] + (p1[0] - prev.pos[0]) * t, prev.pos[1] + (p1[1] - prev.pos[1]) * t];
}

/** 부대가 앞으로 갈 길 */
function armyTrail(a: Army): [number, number][] {
  if (a.pathIndex >= a.path.length - 1) return [];
  const cur = routePts(a.path[a.pathIndex], a.path[a.pathIndex + 1]);
  const total = polyLen(cur);
  const done = total * Math.max(0, Math.min(1, armyRatio(a)));
  const out: [number, number][] = [armyDrawPos(a)];
  let d = 0;
  for (let i = 1; i < cur.length; i++) {
    d += Math.hypot(cur[i][0] - cur[i - 1][0], cur[i][1] - cur[i - 1][1]);
    if (d > done) out.push(cur[i]);
  }
  for (let i = a.pathIndex + 2; i < a.path.length; i++) out.push(...routePts(a.path[i - 1], a.path[i]).slice(1));
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** regions.png 를 점마다 지역 번호로 읽음 (한 번만) */
let regionPixelsCache: Uint8Array | null = null;
function useRegionPixels(): Uint8Array | null {
  const [px, setPx] = useState<Uint8Array | null>(regionPixelsCache);
  useEffect(() => {
    if (regionPixelsCache) return;
    const valid = new Set(CITIES.map((c) => c.regionId));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = MAP_W;
      cv.height = MAP_H;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
      const d = ctx.getImageData(0, 0, MAP_W, MAP_H).data;
      const out = new Uint8Array(MAP_W * MAP_H);
      for (let i = 0; i < out.length; i++) out[i] = valid.has(d[i * 4]) ? d[i * 4] : 0;
      regionPixelsCache = out;
      setPx(out);
    };
    img.src = asset('map/regions.png');
  }, []);
  return px;
}

/**
 * 축소 화면 땅 칠하기: 지도 좌표 1칸 = 1점.
 * 점 주인 = regions.png 의 지역 번호 → 그 지역 성의 지금 주인 (칸 단위 주인은 쓰지 않음). 나라 경계는 짙은 선 2점, 같은 나라 안 성 구역 경계는 옅은 선 1점.
 */
function useControlImage(cityOwners: string, region: Uint8Array | null): { fill: string; lines: string } {
  return useMemo(() => {
    if (!region) return { fill: '', lines: '' };
    const ownerOfCity: Record<string, string> = {};
    for (const pair of cityOwners.split(',')) {
      const [id, o] = pair.split(':');
      ownerOfCity[id] = o;
    }
    const W = MAP_W;
    const H = MAP_H;
    const own: string[] = new Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = region[i];
      own[i] = r && CITY_BY_REGION[r] ? (ownerOfCity[CITY_BY_REGION[r].id] ?? '') : '';
    }
    const painted = (o: string) => !!o && o !== NEUTRAL;
    const nationLine = new Uint8Array(W * H);
    const regionLine = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1]) {
          if (j < 0) continue;
          const a = own[i];
          const b = own[j];
          if (a !== b) {
            if (!painted(a) && !painted(b)) continue;
            nationLine[i] = 1;
            nationLine[j] = 1;
          } else if (painted(a) && region[i] !== region[j]) regionLine[i] = 1;
        }
      }
    }
    // 두 장: 나라 색 칠하기(성 구역 옅은 선 포함, 진하기는 배율로 정함) / 나라 경계선(늘 보임)
    const make = (fill: boolean) => {
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext('2d');
      if (!ctx) return '';
      const img = ctx.createImageData(W, H);
      const cache: Record<string, [number, number, number]> = {};
      for (let i = 0; i < W * H; i++) {
        const o = own[i];
        let rgb: [number, number, number] = [0, 0, 0];
        let a = 0;
        if (fill) {
          if (painted(o)) {
            rgb = (cache[o] ??= hexToRgb(nationColor(o)));
            a = 1;
            if (regionLine[i] && !nationLine[i]) {
              rgb = [0, 1, 2].map((c) => REGION_LINE[c] * REGION_LINE_ALPHA + rgb[c] * (1 - REGION_LINE_ALPHA)) as [number, number, number];
            }
          }
        } else if (nationLine[i]) {
          rgb = NATION_LINE;
          a = 1;
        }
        img.data[i * 4] = rgb[0];
        img.data[i * 4 + 1] = rgb[1];
        img.data[i * 4 + 2] = rgb[2];
        img.data[i * 4 + 3] = Math.round(a * 255);
      }
      ctx.putImageData(img, 0, 0);
      return cv.toDataURL();
    };
    return { fill: make(true), lines: make(false) };
  }, [cityOwners, region]);
}

/** 성을 가진 나라의 이름 자리·크기 (시작 때와 같으면 json 그대로, 아니면 성 평균 자리·성 수에 따른 크기) */
function nationLabelList(game: GameState): { id: string; name: string; x: number; y: number; size: number }[] {
  const have: Record<string, string[]> = {};
  for (const c of CITIES) {
    const o = game.cities[c.id].owner;
    if (o && o !== NEUTRAL) (have[o] ??= []).push(c.id);
  }
  return Object.entries(have).map(([id, list]) => {
    const def = NATION_LABELS.find((n) => n.id === id);
    const start = START_CITIES[id] ?? [];
    const same = start.length === list.length && start.every((c) => list.includes(c));
    if (def && same) return def;
    const x = list.reduce((a, c) => a + CITY_BY_ID[c].x, 0) / list.length;
    const y = list.reduce((a, c) => a + CITY_BY_ID[c].y, 0) / list.length;
    if (!def) return null;
    const f = Math.max(0.6, Math.min(1.2, Math.sqrt(list.length / Math.max(1, start.length))));
    return { ...def, x, y, size: def.size * f };
  }).filter((n): n is NonNullable<typeof n> => !!n);
}


/** 문양 깃발 그림 */
function FlagSprite({ nation, x, y, w }: { nation: string; x: number; y: number; w: number }) {
  return <image href={asset(`sprites/flag2/${flagKey(nation)}.png`)} x={x} y={y} width={w} height={w * FLAG_RATIO} pointerEvents="none" />;
}

interface Tile {
  key: string;
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 조각 하나의 지도 좌표 자리 (마지막 줄·칸은 남은 점 수만큼). 점 1개 = scaleX·scaleY 지도 칸 */
function buildTiles(cols: number, rows: number, pxW: number, pxH: number, scaleX: number, scaleY: number): Omit<Tile, 'file'>[] {
  const out: Omit<Tile, 'file'>[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = c * TILE_PX;
      const py = r * TILE_PX;
      out.push({
        key: `${r}_${c}`,
        x: IMG_X + px * scaleX,
        y: IMG_Y + py * scaleY,
        w: Math.min(TILE_PX, pxW - px) * scaleX,
        h: Math.min(TILE_PX, pxH - py) * scaleY,
      });
    }
  }
  return out;
}
/** 보통 지도 (map/v2): 4353×4670 점, 5×5 조각 */
const TILES = buildTiles(5, 5, 4353, 4670, IMG_W / 4353, IMG_H / 4670);
/** 2배 지도 (map/v2x2): 8706×9340 점, 9×10 조각, 점 1개 = 770/8706 칸 */
const TILES_X2 = buildTiles(9, 10, 8706, 9340, IMG_W / 8706, IMG_W / 8706);

/** 성 이름 태그: [나라 색 네모][이름][병력] 한 줄 */
const TAG_H = 15;
function tagWidth(name: string, troopsText: string) {
  return 6 + 8 + 4 + [...name].length * 11 + 5 + troopsText.length * 6.5 + 6;
}

function castleBox(c: (typeof CITIES)[number]) {
  const W = CASTLE_W[c.castleSize] ?? CASTLE_W[1];
  const H = W * (CASTLE_RATIOS[`${c.castleStyle}_${c.castleSize}`] ?? 0.85);
  return { W, H, top: -H * 0.62 };
}

/** 성 그림 안 좌표로 본 깃발 너비: 화면에서 FLAG_W × min(castleGrow, 1.3) */
const flagLocalW = (s: number) => (FLAG_W * Math.min(castleGrow(s), 1.3)) / castleGrow(s);



/** 확대 화면 성 이름 태그: [나라 색 네모][성 이름][병력] */
function CityTag({ name, troops, color, y, capital }: { name: string; troops: number; color: string; y: number; capital: boolean }) {
  const troopsText = troops.toLocaleString();
  const w = tagWidth(name, troopsText);
  const x0 = -w / 2;
  const nameW = [...name].length * 11;
  return (
    <g pointerEvents="none">
      <rect x={x0} y={y} width={w} height={TAG_H} rx={4} fill="rgba(40,28,18,.9)" stroke="#d6b25e" strokeWidth={capital ? 1.6 : 0.8} />
      <rect x={x0 + 6} y={y + 3.5} width={8} height={8} fill={color} stroke="#1e140a" strokeWidth={0.6} />
      <text x={x0 + 18} y={y + 11.5} className="plate-name" style={{ fontSize: 11 }}>
        {name}
      </text>
      <text x={x0 + 18 + nameW + 5} y={y + 11} className="plate-troops" style={{ fontSize: 11 }}>
        {troopsText}
      </text>
    </g>
  );
}

/** 병과 글자 */
const UNIT_LETTER: Record<UnitType, string> = {
  infantry: '보',
  spear: '창',
  siege: '공',
  archer: '궁',
  crossbow: '노',
  cavalry: '기',
  heavy: '철',
  gaema: '개',
  xianbei: '선',
};
/** 부대 그림 크기 */
const UNIT_W = 64;
const UNIT_H = 45;
/** 그림 아래 이름표·병력 막대·턴 표시 자리 */
const ARMY_TAG_Y = 26;
const ARMY_BAR_Y = ARMY_TAG_Y + 18;
const ARMY_NOTE_Y = ARMY_BAR_Y + 18;

/**
 * 부대 표식: 발밑 나라 색 타원 + 부대 그림(바다 위면 배) + 오른쪽 위 깃발 + 왼쪽 위 병과 글자 + 아래 이름표.
 * 왼쪽으로 가는 부대는 그림만 좌우로 뒤집음
 */
function ArmyMarker({ army, faceLeft, sea }: { army: Army; faceLeft: boolean; sea: boolean }) {
  const lead = army.officers[0];
  const color = nationColor(army.nation);
  const name = lead ? officerName(lead) : '';
  const label = `${name} ${army.troops.toLocaleString()}`;
  const w = [...name].length * 12 + String(army.troops.toLocaleString()).length * 7 + 14;
  return (
    <g>
      <ellipse cx={0} cy={12} rx={30} ry={10} fill={color} fillOpacity={0.45} stroke={color} strokeWidth={2} />
      {sea ? (
        <image href={asset('sprites/boat.png')} x={-30} y={-40} width={60} height={60 * (110 / 120)} transform={faceLeft ? 'scale(-1,1)' : undefined} />
      ) : (
        <image href={asset('sprites/units/army.webp')} x={-UNIT_W / 2} y={-38} width={UNIT_W} height={UNIT_H} transform={faceLeft ? 'scale(-1,1)' : undefined} />
      )}
      <FlagSprite nation={army.nation} x={16} y={-62} w={10} />
      <rect x={-40} y={-46} width={18} height={18} rx={2} fill="rgba(14,22,44,.9)" stroke={color} strokeWidth={1.5} />
      <text x={-31} y={-37} textAnchor="middle" dominantBaseline="central" className="army-initial" style={{ fontSize: 13 }}>
        {UNIT_LETTER[army.unitType]}
      </text>
      <rect x={-w / 2} y={ARMY_TAG_Y} width={w} height={16} rx={3} fill="rgba(14,22,44,.9)" stroke="#c9a65a" strokeWidth={0.8} />
      <text x={0} y={ARMY_TAG_Y + 12} textAnchor="middle" className="svg-jua tiny">
        {label}
      </text>
    </g>
  );
}

interface Props {
  game: GameState;
  /** 출진 창이 열려 있으면 출발 성 (갈 수 있는 길을 미리 보여 줌) */
  marchFrom?: string | null;
  /** 출진 창에서 고른 목적지 (그 길만 강조) */
  marchTarget?: string | null;
  /** 부대 표식을 누르면 */
  onArmyClick?: (armyId: string) => void;
  /** 턴 종료 이동 모습: 턴 처리 전 자리와 진행 0~1 */
  anim?: { prev: Record<string, ArmySnap>; t: number } | null;
  selected: string | null;
  onSelectCity: (id: string) => void;
  view: MapViewState;
  setView: (f: (v: MapViewState) => MapViewState) => void;
  barView: BarView | null;
  battleCities: string[];
  onMessageClick: () => void;
}

export default function MapView({ game, marchFrom, marchTarget, onArmyClick, anim, selected, onSelectCity, view, setView: setRawView, barView, battleCities, onMessageClick }: Props) {
  const setView = (f: (v: MapViewState) => MapViewState) => setRawView((v) => clampView(f(v)));
  const wrap = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'drag'; sx: number; sy: number; vx: number; vy: number }
    | { kind: 'pinch'; d0: number; mx: number; my: number; v0: MapViewState }
    | null
  >(null);
  const movedRef = useRef(false);
  const [hover, setHover] = useState<string | null>(null);
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  const regionPx = useRegionPixels();
  const cityOwners = CITIES.map((c) => `${c.id}:${game.cities[c.id].owner}`).join(',');
  const controlImg = useControlImage(cityOwners, regionPx);
  const k = 1 / view.s;
  const ovAlpha = overviewAlpha(view.s);
  const dtAlpha = detailAlpha(view.s);
  /** 조각 지도는 축소 화면이 끝나면 씀 */
  const detail = view.s >= OVERVIEW_END;
  const grow = castleGrow(view.s);
  const kc = k * grow;
  const closeUp = view.s >= PLACE_NAME_ZOOM;
  /** 화면 좌표 → 지도 영역(무대) 좌표 */
  const local = (clientX: number, clientY: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const sc = r.width / L.map.w;
    return { x: (clientX - r.left) / sc, y: (clientY - r.top) / sc };
  };

  const zoomAt = (f: number, px: number, py: number) => {
    setView((v) => {
      const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.s * f));
      const q = s / v.s;
      return { s, x: px - (px - v.x) * q, y: py - (py - v.y) * q };
    });
  };

  const pinchInfo = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = local(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      movedRef.current = false;
      gesture.current = { kind: 'drag', sx: p.x, sy: p.y, vx: view.x, vy: view.y };
    } else if (pointers.current.size === 2) {
      const { d, mx, my } = pinchInfo();
      gesture.current = { kind: 'pinch', d0: Math.max(1, d), mx, my, v0: view };
      movedRef.current = true;
      for (const id of pointers.current.keys()) {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(id);
        } catch {
          /* 이미 놓은 손가락 */
        }
      }
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) {
      // 마우스를 올린 성 찾기는 성 쪽에서
      return;
    }
    const p = local(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const { d, mx, my } = pinchInfo();
      const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, g.v0.s * (d / g.d0)));
      const q = s / g.v0.s;
      setView(() => ({ s, x: mx - (g.mx - g.v0.x) * q, y: my - (g.my - g.v0.y) * q }));
      return;
    }
    if (g.kind === 'drag') {
      const dx = p.x - g.sx;
      const dy = p.y - g.sy;
      if (!movedRef.current && Math.hypot(dx, dy) > 6) {
        movedRef.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      if (movedRef.current) setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (gesture.current?.kind === 'pinch') {
      const [rest] = [...pointers.current.values()];
      gesture.current = { kind: 'drag', sx: rest.x, sy: rest.y, vx: view.x, vy: view.y };
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = local(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  };

  /** 끌기 뒤 누르기는 무시, 대화창 자리를 누르면 기록 펼치기 */
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation();
      return;
    }
    const p = local(e.clientX, e.clientY);
    const m = L.message;
    if (p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) {
      e.stopPropagation();
      onMessageClick();
    }
  };

  const season = SEASON_FILE[game.season] ?? 'spring';
  // 지금 화면에 걸치는 지도 범위 (지도 좌표)
  const vx0 = -view.x / view.s;
  const vy0 = -view.y / view.s;
  const vx1 = vx0 + L.map.w / view.s;
  const vy1 = vy0 + L.map.h / view.s;
  const x2 = view.s >= X2_ZOOM;
  const tiles: Tile[] = detail
    ? (x2 ? TILES_X2 : TILES)
        .filter((t) => t.x < vx1 && t.x + t.w > vx0 && t.y < vy1 && t.y + t.h > vy0)
        .map((t) => ({ ...t, file: `map/${x2 ? 'v2x2' : 'v2'}/${season}/${t.key}.webp` }))
    : [];
  const showTag = dtAlpha >= 0.5;
  const tg = tagGrow(view.s);
  // 진하기 0.55 는 그림에 넣었으니 배율에 따라 옅어지는 비율만 씀
  const ctrlOpacity = fillOpacity(view.s);
  const lblOpacity = ovAlpha;
  const labels = lblOpacity > 0 ? nationLabelList(game) : [];
  // 출진 경로 미리보기
  const march = useMemo(() => {
    if (!marchFrom) return null;
    const segs = new Map<string, [number, number][]>();
    const targets: { id: string; turns: number }[] = [];
    // 출진은 남의 성만 (아군 성은 이동·수송)
    const list = marchTarget ? [marchTarget] : reachableTargets(game, marchFrom, game.player).filter((t) => game.cities[t].owner !== game.player);
    for (const t of list) {
      const path = findPath(game, marchFrom, t, game.player);
      if (!path) continue;
      for (let i = 1; i < path.length; i++) {
        const key = [path[i - 1], path[i]].sort().join('|');
        if (!segs.has(key)) segs.set(key, roadPoints(path[i - 1], path[i]));
      }
      targets.push({ id: t, turns: turnsFor(path, 'spear') });
    }
    return { segs: [...segs.values()], targets };
  }, [marchFrom, marchTarget, game]);
  const battles = new Set(battleCities);
  const seaRoads = ROADS.filter((r) => r.type === 'sea');
  const showPlaceNames = closeUp;
  const openPlace = (p: PlaceData) =>
    setInfo({
      name: p.name,
      kind: p.sub ? `${p.kind} · ${p.sub}` : p.kind,
      loc: p.loc,
      firstYear: p.firstYear,
      memo: p.memo,
      conf: p.conf,
      ownerBasis: p.ownerBasis,
    });

  return (
    <div
      className="map-wrap"
      ref={wrap}
      style={{ left: L.map.x, top: L.map.y, width: L.map.w, height: L.map.h }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onClickCapture={onClickCapture}
    >
      <svg
        className="map-svg"
        width={L.map.w}
        height={L.map.h}
        viewBox={`0 0 ${L.map.w} ${L.map.h}`}
      >
        {/* 확대·이동은 svg 안에서 (CSS 로 늘리지 않으니 글씨·그림이 선명) */}
        <g transform={`translate(${view.x},${view.y}) scale(${view.s})`}>
        {detail ? (
          <g style={{ filter: 'saturate(0.62) brightness(0.97)' }}>
            {tiles.map((t) => (
              <image key={t.key} href={asset(t.file)} x={t.x} y={t.y} width={t.w + k} height={t.h + k} preserveAspectRatio="none" />
            ))}
          </g>
        ) : (
          <image href={asset(`map/v2/${season}_small.webp`)} x={IMG_X} y={IMG_Y} width={IMG_W} height={IMG_H} preserveAspectRatio="none" />
        )}
        {controlImg.fill && ctrlOpacity > 0 && (
          <image href={controlImg.fill} x={0} y={0} width={MAP_W} height={MAP_H} preserveAspectRatio="none" opacity={ctrlOpacity} />
        )}
        {/* 나라 경계선은 모든 배율에서 */}
        {controlImg.lines && <image href={controlImg.lines} x={0} y={0} width={MAP_W} height={MAP_H} preserveAspectRatio="none" pointerEvents="none" />}

        {/* 축소 화면 나라 이름 (땅과 함께 커지고 작아짐) */}
        {labels.length > 0 && (
          <g pointerEvents="none" opacity={lblOpacity}>
            {labels.map((n) => (
              <text
                key={n.id}
                x={n.x}
                y={n.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="nation-label"
                fontSize={n.size}
                strokeWidth={n.size * 0.06}
              >
                {n.name}
              </text>
            ))}
          </g>
        )}

        {/* 옛 지명: 바다·산·강 */}
        <g pointerEvents="none">
          {PLACES.labels.seas.map((l, i) => (
            <text
              key={'s' + i}
              transform={`translate(${l.x},${l.y}) scale(${k})`}
              textAnchor="middle"
              dominantBaseline="central"
              className="svg-jua label-sea"
            >
              {l.n}
            </text>
          ))}
          {closeUp &&
            PLACES.labels.mountains.map((l, i) => (
            <text
              key={'m' + i}
              transform={`translate(${l.x},${l.y}) scale(${k})`}
              textAnchor="middle"
              dominantBaseline="central"
              className="svg-jua label-mount"
            >
              {l.n}
            </text>
          ))}
          {closeUp &&
            PLACES.labels.rivers.map((l, i) => (
            <text
              key={'r' + i}
              transform={`translate(${l.x},${l.y}) rotate(${l.r ?? 0}) scale(${k})`}
              textAnchor="middle"
              dominantBaseline="central"
              className="svg-jua label-river"
            >
              {l.n}
            </text>
          ))}
        </g>

        {/* 바닷길 (뭍길은 지도 그림 안에 있음) */}
        {seaRoads.map((r, i) => {
          const a = CITY_BY_ID[r.a];
          const b = CITY_BY_ID[r.b];
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={i} pointerEvents="none">
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8fd3ff" strokeWidth={2 * k} strokeDasharray={`${6 * k} ${5 * k}`} opacity={0.95} />
              <image href={asset('sprites/boat.png')} x={mx - 14 * k} y={my - 13 * k} width={28 * k} height={28 * k * (110 / 120)} />
            </g>
          );
        })}

        {/* 고개 (다리는 지도 그림에 들어 있음) */}
        {PASSES.map((p) => (
          <g
            key={p.name}
            className="castle"
            transform={`translate(${p.x},${p.y}) scale(${k})`}
            onClick={() =>
              setInfo({
                name: p.name,
                kind: '고개',
                memo: PLACES.passNotes[p.name],
              })
            }
          >
            <rect x={-14} y={-12} width={28} height={30} fill="transparent" />
            <image href={asset('sprites/pass.png')} x={-12} y={-11} width={24} height={24 * (72 / 120)} />
            <text x={0} y={14} textAnchor="middle" className="svg-jua tiny">
              {p.name}
            </text>
          </g>
        ))}

        {/* 싸움터 */}
        {PLACES.battlefields.map((b) => (
          <g key={b.id} className="castle" transform={`translate(${b.x},${b.y}) scale(${k})`} onClick={() => openPlace(b)}>
            <rect x={-10} y={-10} width={20} height={20} fill="transparent" />
            <image href={asset('sprites/swords.png')} x={-8} y={-8} width={16} height={16 * (112 / 120)} opacity={0.6} />
            {showPlaceNames && (
              <text x={0} y={17} textAnchor="middle" className="svg-jua tiny">
                {b.name}
              </text>
            )}
          </g>
        ))}

        {/* 요새 (확대했을 때만. 깃발은 그 칸의 땅 주인을 따름) */}
        {PLACES.forts.map((f) => {
          // 작은 요새 표식 (삼국지13 처럼): 주인 나라 색 테두리 동그라미 + 작은 이름
          const cellOwner = game.grid.owner[cellAt(f.x, f.y)];
          const owner = cellOwner || f.owner || '';
          const hasOwner = !!owner && owner !== NEUTRAL;
          return (
            <g key={f.id} className="castle" transform={`translate(${f.x},${f.y}) scale(${k})`} onClick={() => openPlace(f)}>
              <circle r={10} fill="transparent" />
              {f.sub === '고개' ? (
                <path d="M -7 5 L 0 -7 L 7 5 Z" fill="#3b2a18" stroke={hasOwner ? nationColor(owner) : '#cfc6b0'} strokeWidth={2.5} />
              ) : (
                <circle r={7} fill="#3b2a18" stroke={hasOwner ? nationColor(owner) : '#cfc6b0'} strokeWidth={2.5} />
              )}
              <text x={0} y={20} textAnchor="middle" className="svg-jua tiny">
                {f.name}
              </text>
            </g>
          );
        })}

        {/* 출진 창이 열려 있으면 지도를 어둡게 (바탕·땅 칠하기 위, 경로·성 아래) */}
        {marchFrom && <rect x={-MAP_W} y={-MAP_H} width={MAP_W * 3} height={MAP_H * 3} fill="rgba(10,15,30,.45)" pointerEvents="none" />}

        {/* 출진 경로 미리보기 (성 그림 아래) */}
        {march && (
          <g pointerEvents="none">
            {march.segs.map((pts, i) => (
              <polyline
                key={'o' + i}
                points={pts.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="rgba(30,60,160,.8)"
                strokeWidth={7 * k}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {march.segs.map((pts, i) => (
              <polyline
                key={'i' + i}
                points={pts.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="#5a96ff"
                strokeWidth={4 * k}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        )}

        {/* 출진 부대 경로 */}
        {game.armies.map((a) => {
          const pts = anim ? [] : armyTrail(a);
          if (pts.length < 2) return null;
          return (
            <polyline
              key={a.id + 'p'}
              points={pts.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke={nationColor(a.nation)}
              strokeWidth={3 * k}
              strokeDasharray={`${1 * k} ${5 * k}`}
              strokeLinecap="round"
              pointerEvents="none"
            />
          );
        })}

        {/* 성 */}
        {CITIES.map((c) => {
          const cs = game.cities[c.id];
          const owner = cs.owner;
          const capital = owner !== NEUTRAL && capitalOf(game, owner) === c.id;
          const fief = owner === game.player && !capital;
          // 깃발: DETAIL_ZOOM 부터 작게(0.6), 배율 4.5 이상이면 제 크기. 성 그림 뒤 왼쪽 위 모서리에 꽂음
          const flagW = flagLocalW(view.s) * (closeUp ? 1 : 0.6);
          const showFlag = owner !== NEUTRAL && view.s >= DETAIL_ZOOM;
          const handlers = {
            onClick: () => onSelectCity(c.id),
            onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHover(c.id),
            onPointerLeave: () => setHover((h) => (h === c.id ? null : h)),
          };
          // 축소: 나라 색 동그라미 + 이름 (성 그림이 나타나면서 옅어짐)
          // 출진할 곳을 고르는 동안 아군 성은 흐리게
          const dim = !!marchFrom && owner === game.player && c.id !== marchFrom ? 0.4 : 1;
          const dot = dtAlpha < 1 && (
            <g className="castle" opacity={(1 - dtAlpha) * dim} transform={`translate(${c.x},${c.y}) scale(${k})`} {...handlers}>
              {selected === c.id && <circle r={11} className="sel-ring" />}
              <circle r={6} fill={nationColor(owner)} stroke="#3b1e0c" strokeWidth={1.5} />
              {!showTag && (
                <text x={0} y={19} textAnchor="middle" className={`svg-jua small ${capital ? 'cap' : ''}`}>
                  {c.name}
                </text>
              )}
            </g>
          );
          if (dtAlpha <= 0) return <g key={c.id}>{dot}</g>;
          const { W, H, top } = castleBox(c);
          return (
            <g key={c.id}>
              {dot}
              {/* 성 그림은 지도와 함께 조금씩 커짐 (scale k × castleGrow) */}
              <g className="castle" opacity={dtAlpha * dim} transform={`translate(${c.x},${c.y}) scale(${kc})`} {...handlers}>
                {selected === c.id && <ellipse cx={0} cy={H * 0.3} rx={W * 0.62} ry={H * 0.32} className="sel-ring" />}
                <rect x={-W / 2} y={top} width={W} height={H + 20 / grow} fill="transparent" />
                {showFlag && <FlagSprite nation={owner} x={-W / 2 - flagW * 0.15} y={top - flagW * FLAG_RATIO * 0.62} w={flagW} />}
                <image
                  href={asset(`sprites/castle2/${c.castleStyle}_${c.castleSize}.png`)}
                  x={-W / 2}
                  y={top}
                  width={W}
                  height={H}
                  transform={CASTLE_FACING[c.id]?.flip ? 'scale(-1,1)' : undefined}
                />

                {battles.has(c.id) && <image href={asset('sprites/swords.png')} x={-17} y={top - 34} width={34} height={34 * (112 / 120)} className="swords" />}
              </g>
              {/* 이름 태그: 성 그림 바로 아래, 확대하면 조금 커짐 (scale k × tagGrow) */}
              {showTag && (
                <g opacity={dtAlpha} transform={`translate(${c.x},${c.y + (top + H) * kc}) scale(${k * tg})`}>
                  <CityTag name={c.name} troops={cs.troops} color={nationColor(owner)} y={2} capital={capital} />
                  {fief && closeUp && (
                    <g transform={`translate(${tagWidth(c.name, cs.troops.toLocaleString()) / 2 + 4},2)`}>
                      <rect x={0} y={0} width={34} height={TAG_H} rx={3} fill="rgba(20,30,60,.9)" stroke="#d6b25e" strokeWidth={0.8} />
                      <text x={17} y={11.5} textAnchor="middle" className="svg-jua tiny">
                        속령
                      </text>
                    </g>
                  )}
                </g>
              )}
            </g>
          );
        })}

        {/* 출진 미리보기: 도착 턴 */}
        {march?.targets.map(({ id, turns }) => {
          const c = CITY_BY_ID[id];
          const y = dtAlpha > 0 ? castleBox(c).top * grow - 22 : -30;
          const text = `도착 ${turns}턴`;
          const w = text.length * 11 + 10;
          return (
            <g key={'t' + id} transform={`translate(${c.x},${c.y}) scale(${k})`} pointerEvents="none">
              <rect x={-w / 2} y={y} width={w} height={18} rx={4} fill="rgba(25,45,110,.92)" stroke="#96beff" strokeWidth={1} />
              <text x={0} y={y + 13} textAnchor="middle" className="march-eta">
                {text}
              </text>
            </g>
          );
        })}

        {/* 지도 밖 도읍 (전연 용성) */}
        {NATIONS.filter((n) => n.offmapCapital).map((n) => {
          const oc = n.offmapCapital!;
          return (
            <g key={n.id} transform={`translate(${oc.x},${oc.y}) scale(${k})`} pointerEvents="none">
              <text x={0} y={4} textAnchor="middle" className="svg-jua cap">
                {`${oc.name} (${n.name} 도읍)`}
              </text>
            </g>
          );
        })}

        {/* 공성 중인 성: 성벽 내구 막대 */}
        {CITIES.filter((c) => game.armies.some((a) => a.sieging && armyTarget(a) === c.id)).map((c) => {
          const d = Math.max(0, Math.min(100, game.cities[c.id].defense));
          return (
            <g key={'wall' + c.id} transform={`translate(${c.x},${c.y}) scale(${k})`} pointerEvents="none">
              <rect x={-26} y={-52} width={52} height={7} fill="#0b0f1c" stroke="#3b1e0c" strokeWidth={0.8} />
              <rect x={-26} y={-52} width={52 * (d / 100)} height={7} fill="#c9a65a" />
              <text x={30} y={-45} className="svg-jua tiny">
                성벽 {Math.round(d)}
              </text>
            </g>
          );
        })}

        {/* 교전: 맞붙은 두 부대 사이에 엇갈린 칼 */}
        {!anim &&
          game.armies
            .filter((a) => a.clash && a.id < a.clash && game.armies.some((b) => b.id === a.clash))
            .map((a) => {
              const b = game.armies.find((x) => x.id === a.clash)!;
              const pa = armyDrawPos(a);
              const pb = armyDrawPos(b);
              return (
                <image
                  key={'clash' + a.id}
                  href={asset('sprites/swords.png')}
                  x={(pa[0] + pb[0]) / 2 - 14 * k}
                  y={(pa[1] + pb[1]) / 2 - 30 * k}
                  width={28 * k}
                  height={28 * k * (112 / 120)}
                  className="swords"
                  pointerEvents="none"
                />
              );
            })}

        {/* 부대 */}
        {game.armies.map((a) => {
          const p0 = anim ? armyAnimPos(a, anim.prev[a.id], anim.t) : armyDrawPos(a);
          // 맞붙은 부대는 서로 조금 비켜 그림
          const side = a.clash ? (a.id < a.clash ? -1 : 1) : 0;
          const x = p0[0] + side * 18 * k;
          const y = p0[1];
          const left = armyTurnsLeft(a);
          const ratio = Math.max(0, Math.min(1, a.troops / Math.max(1, a.startTroops ?? a.troops)));
          // 지금 구간의 다음 성이 지금 성보다 왼쪽이면 왼쪽으로 가는 부대
          const here = CITY_BY_ID[a.path[Math.min(a.pathIndex, a.path.length - 1)]];
          const next = a.pathIndex < a.path.length - 1 ? CITY_BY_ID[a.path[a.pathIndex + 1]] : null;
          const faceLeft = !!next && next.x < here.x;
          return (
            <g
              key={a.id}
              className="army"
              transform={`translate(${x},${y}) scale(${k})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onArmyClick?.(a.id)}
            >
              {/* 부대 그림 (바다 위면 배) — 다음 성이 왼쪽이면 그림만 뒤집음 */}
              <ArmyMarker army={a} faceLeft={faceLeft} sea={onSea(a)} />
              {/* 병력 막대 (출진 때 병력 대비) */}
              <rect x={-20} y={ARMY_BAR_Y} width={40} height={4} fill="#0b0f1c" stroke="#3b1e0c" strokeWidth={0.6} />
              <rect x={-20} y={ARMY_BAR_Y} width={40 * ratio} height={4} fill={ratio > 0.5 ? '#6fc06f' : ratio > 0.25 ? '#e6a44a' : '#d6574a'} />
              {left > 0 && !a.clash && (
                <text x={0} y={ARMY_NOTE_Y} textAnchor="middle" className="svg-jua tiny">
                  {left}턴
                </text>
              )}
              {left === 0 && a.sieging && (
                <text x={0} y={ARMY_NOTE_Y} textAnchor="middle" className="svg-jua tiny warn">
                  공성
                </text>
              )}
            </g>
          );
        })}

        {/* 성 옆 막대 */}
        {barView &&
          [...new Set([selected, hover].filter((x): x is string => !!x))].map((id) => {
            const c = CITY_BY_ID[id];
            return <CityBars key={id} game={game} cityId={id} view={barView} x={c.x} y={c.y} k={k} />;
          })}
        </g>
      </svg>
      {/* 확대·축소 버튼 (화면 가운데 기준) */}
      <div
        style={{ position: 'absolute', left: 14, bottom: L.map.h - L.map.viewBottom + 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 3 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          movedRef.current = false;
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {[
          { label: '+', f: ZOOM_STEP, name: '확대' },
          { label: '−', f: 1 / ZOOM_STEP, name: '축소' },
        ].map((b) => (
          <button
            key={b.label}
            className="btn jua"
            aria-label={b.name}
            title={b.name}
            style={{ width: 40, height: 40, fontSize: 24, padding: 0 }}
            onClick={() => zoomAt(b.f, L.map.w / 2, L.map.viewBottom / 2)}
          >
            {b.label}
          </button>
        ))}
      </div>
      {info && (
        <div
          className="logwin frame place-info jua"
          style={{ left: 16, top: 16 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setInfo(null)}
        >
          <div className="win-title">
            {info.name} <span className="muted">({info.kind})</span>
          </div>
          <div className="log-lines">
            {info.loc && <div>지금 위치: {info.loc}</div>}
            {info.firstYear ? <div>처음 나온 해: {info.firstYear}년</div> : null}
            {info.memo && <div>일어난 일: {info.memo}</div>}
            {info.conf && <div>위치 확실도: {info.conf}</div>}
            {info.ownerBasis && <div>346년 주인 근거: {info.ownerBasis}</div>}
            <div className="muted">눌러서 닫기</div>
          </div>
        </div>
      )}
    </div>
  );
}
