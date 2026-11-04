import { useMemo, useRef, useState } from 'react';
import {
  Army,
  CITIES,
  CITY_BY_ID,
  GRID_H,
  GRID_W,
  GameState,
  MAP_H,
  MAP_W,
  NATION_BY_ID,
  NATIONS,
  NEUTRAL,
  PASSES,
  ROADS,
  CELL,
  capitalOf,
  cellAt,
  findRoad,
  nationColor,
} from '../game/state';
import { armyTurnsLeft, edgeLength, pointAlong, roadPoints } from '../game/military';
import routesData from '../data/routes.json';
import bridgesData from '../data/bridges.json';
import placesData from '../data/places.json';
import { asset } from './assets';
import { L } from './Stage';
import CityBars, { BarView } from './CityBars';
import { MapViewState } from './MiniMap';

/** 지도 그림은 원래 지도의 위쪽 이만큼(지도 좌표)을 잘라낸 것. 좌표계는 그대로 */
export const MAP_TOP = 174;
/** 잘라낸 그림의 높이 (지도 좌표) */
const IMG_H = MAP_H - MAP_TOP;
/** 지도 그림이 지도 칸 가로와 대화창 위까지를 꽉 채우는 배율 */
export const MIN_ZOOM = Math.max(L.map.w / MAP_W, L.map.viewBottom / IMG_H);
export const MAX_ZOOM = 7;
export const START_ZOOM = 2.6;
/** 지도 그림 바깥이 보이지 않게 배율·위치를 자름 (아래는 대화창 위까지, 위는 MAP_TOP 까지) */
export function clampView(v: MapViewState): MapViewState {
  const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.s));
  const x = Math.min(0, Math.max(L.map.w - MAP_W * s, v.x));
  const y = Math.min(-MAP_TOP * s, Math.max(L.map.viewBottom - MAP_H * s, v.y));
  return { s, x, y };
}

const SEASON_FILE = ['spring', 'summer', 'autumn', 'winter'];
const FLAG_NATIONS = new Set(['goguryeo', 'baekje', 'silla', 'gaya', 'buyeo', 'yan', 'yamato', 'tsukushi', 'izumo', 'kibi', 'tsushima']);
/** 이 배율 이상 확대해야 요새·싸움터 이름을 보임 */
const PLACE_NAME_ZOOM = 3.6;
/** 성 그림 높이/너비 (그림 크기 180 기준) */
const CASTLE_RATIO: Record<string, number> = {
  baekje: 134 / 180,
  buyeo: 145 / 180,
  gaya: 143 / 180,
  goguryeo: 143 / 180,
  goguryeo_cap: 148 / 180,
  silla: 128 / 180,
  tribe: 141 / 180,
  yan: 136 / 180,
};
const FLAG_RATIO = 175 / 80;

interface RouteData {
  a: string;
  b: string;
  type: string;
  via: string | null;
  pts: number[][];
}
const ROUTES = routesData as RouteData[];
const ROUTE_BY_KEY: Record<string, RouteData> = Object.fromEntries(ROUTES.map((r) => [`${r.a}|${r.b}`, r]));
const BRIDGES = bridgesData as { x: number; y: number; h: boolean }[];

interface PlaceData {
  id: string;
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
}

/** 두 성 사이 길의 굽은 점 목록 (from → to 방향). 없으면 곧은 선 */
export function routePts(from: string, to: string): [number, number][] {
  const r = ROUTE_BY_KEY[`${from}|${to}`];
  if (r) return r.pts.map((p) => [p[0], p[1]]);
  const rev = ROUTE_BY_KEY[`${to}|${from}`];
  if (rev) return rev.pts.map((p) => [p[0], p[1]] as [number, number]).reverse();
  return roadPoints(from, to);
}

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

/** 칸마다 주인 나라 색(투명도 0.13)을 칠하고, 부드럽게 늘려 살짝 흐린 그림 */
function useControlImage(owner: string[]): string {
  return useMemo(() => {
    const small = document.createElement('canvas');
    small.width = GRID_W;
    small.height = GRID_H;
    const sctx = small.getContext('2d');
    if (!sctx) return '';
    const img = sctx.createImageData(GRID_W, GRID_H);
    const cache: Record<string, [number, number, number]> = {};
    for (let i = 0; i < owner.length; i++) {
      const o = owner[i];
      if (!o) continue;
      const rgb = (cache[o] ??= hexToRgb(nationColor(o)));
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = Math.round(255 * 0.13);
    }
    sctx.putImageData(img, 0, 0);
    const big = document.createElement('canvas');
    big.width = GRID_W * CELL;
    big.height = GRID_H * CELL;
    const ctx = big.getContext('2d');
    if (!ctx) return small.toDataURL();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'blur(1.5px)';
    ctx.drawImage(small, 0, 0, big.width, big.height);
    return big.toDataURL();
  }, [owner]);
}

/** 깃발 그림 + 천 위에 나라 이름 세로쓰기 */
function FlagSprite({ nation, x, y, w }: { nation: string; x: number; y: number; w: number }) {
  const n = NATION_BY_ID[nation];
  const h = w * FLAG_RATIO;
  const chars = [...(n?.flagName ?? '')];
  const fs = Math.min(w * 0.36, (h * 0.58) / Math.max(1, chars.length));
  return (
    <g pointerEvents="none">
      <image href={asset(`sprites/flag_${nation}.png`)} x={x} y={y} width={w} height={h} />
      {chars.map((ch, i) => (
        <text
          key={i}
          x={x + w * 0.5}
          y={y + h * 0.2 + fs * (i + 0.5)}
          fontSize={fs}
          textAnchor="middle"
          dominantBaseline="central"
          className="flag-char"
        >
          {ch}
        </text>
      ))}
    </g>
  );
}

interface Props {
  game: GameState;
  selected: string | null;
  onSelectCity: (id: string) => void;
  view: MapViewState;
  setView: (f: (v: MapViewState) => MapViewState) => void;
  barView: BarView | null;
  battleCities: string[];
  onMessageClick: () => void;
}

export default function MapView({ game, selected, onSelectCity, view, setView: setRawView, barView, battleCities, onMessageClick }: Props) {
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
  const controlImg = useControlImage(game.grid.owner);
  const k = 1 / view.s;

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
  const battles = new Set(battleCities);
  const seaRoads = ROADS.filter((r) => r.type === 'sea');
  const showPlaceNames = view.s >= PLACE_NAME_ZOOM;
  const openPlace = (p: PlaceData) =>
    setInfo({
      name: p.name,
      kind: p.sub ? `${p.kind} · ${p.sub}` : p.kind,
      loc: p.loc,
      firstYear: p.firstYear,
      memo: p.memo,
      conf: p.conf,
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
        width={MAP_W}
        height={MAP_H}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      >
        <image href={asset(`map/season/${season}.jpg`)} x={0} y={MAP_TOP} width={MAP_W} height={IMG_H} preserveAspectRatio="none" />
        {controlImg && (
          <image
            href={controlImg}
            x={0}
            y={0}
            width={GRID_W * CELL}
            height={GRID_H * CELL}
            preserveAspectRatio="none"
          />
        )}
        <image href={asset('map/borders.png')} x={0} y={MAP_TOP} width={MAP_W} height={IMG_H} preserveAspectRatio="none" opacity={0.55} />

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
          {PLACES.labels.mountains.map((l, i) => (
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
          {PLACES.labels.rivers.map((l, i) => (
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

        {/* 다리·고개 */}
        {BRIDGES.map((b, i) => {
          const w = (b.h ? 30 : 18) * k;
          const h = w * (b.h ? 52 / 120 : 178 / 120);
          return (
            <image
              key={i}
              href={asset(`sprites/${b.h ? 'bridge_h' : 'bridge_v'}.png`)}
              x={b.x - w / 2}
              y={b.y - h / 2}
              width={w}
              height={h}
              pointerEvents="none"
            />
          );
        })}
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

        {/* 요새 (깃발은 그 칸의 땅 주인을 따름) */}
        {PLACES.forts.map((f) => {
          const owner = game.grid.owner[cellAt(f.x, f.y)];
          const hasOwner = !!owner && owner !== NEUTRAL;
          if (f.sub === '고개') {
            return (
              <g key={f.id} className="castle" transform={`translate(${f.x},${f.y}) scale(${k})`} onClick={() => openPlace(f)}>
                <rect x={-14} y={-12} width={28} height={26} fill="transparent" />
                <image href={asset('sprites/pass.png')} x={-12} y={-11} width={24} height={24 * (72 / 120)} />
                {hasOwner && <path d="M 9 -9 v -12 l 8 3 l -8 3" fill={nationColor(owner)} stroke="#3b1e0c" strokeWidth={0.8} />}
                {showPlaceNames && (
                  <text x={0} y={14} textAnchor="middle" className="svg-jua tiny">
                    {f.name}
                  </text>
                )}
              </g>
            );
          }
          const W = 26;
          const H = W * CASTLE_RATIO.tribe;
          const top = -H * 0.62;
          return (
            <g key={f.id} className="castle" transform={`translate(${f.x},${f.y}) scale(${k})`} onClick={() => openPlace(f)}>
              <rect x={-W / 2} y={top} width={W} height={H + 4} fill="transparent" />
              <image href={asset('sprites/castle_tribe.png')} x={-W / 2} y={top} width={W} height={H} />
              {hasOwner && <path d={`M ${-W / 2 + 3} ${top + 4} v -14 l 9 3.5 l -9 3.5`} fill={nationColor(owner)} stroke="#3b1e0c" strokeWidth={0.8} />}
              {showPlaceNames && (
                <text x={0} y={top + H + 10} textAnchor="middle" className="svg-jua tiny">
                  {f.name}
                </text>
              )}
            </g>
          );
        })}

        {/* 출진 부대 경로 */}
        {game.armies.map((a) => {
          const pts = armyTrail(a);
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
          const style = c.id === 'gungnae' ? 'goguryeo_cap' : c.castleStyle;
          const W = capital ? 84 : 64;
          const H = W * (CASTLE_RATIO[style] ?? 0.78);
          const top = -H * 0.62;
          const fw = capital ? 38 : 32;
          const fh = fw * FLAG_RATIO;
          const fief = owner === game.player && !capital;
          return (
            <g
              key={c.id}
              className="castle"
              transform={`translate(${c.x},${c.y}) scale(${k})`}
              onClick={() => onSelectCity(c.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(c.id)}
              onPointerLeave={() => setHover((h) => (h === c.id ? null : h))}
            >
              {selected === c.id && <ellipse cx={0} cy={H * 0.3} rx={W * 0.62} ry={H * 0.32} className="sel-ring" />}
              <rect x={-W / 2} y={top} width={W} height={H + 20} fill="transparent" />
              <image href={asset(`sprites/castle_${style}.png`)} x={-W / 2} y={top} width={W} height={H} />
              {owner !== NEUTRAL && FLAG_NATIONS.has(owner) && <FlagSprite nation={owner} x={-W / 2 - fw * 0.35} y={top - fh * 0.55} w={fw} />}
              <text x={0} y={top + H + 13} textAnchor="middle" className={`svg-jua ${capital ? 'cap' : ''}`}>
                {c.name}
              </text>
              {fief && (
                <g transform={`translate(${W / 2 - 6},${top + H - 10})`}>
                  <rect x={-2} y={-9} width={28} height={13} rx={3} fill="rgba(20,30,60,.9)" stroke="#d6b25e" strokeWidth={0.8} />
                  <text x={12} y={1} textAnchor="middle" className="svg-jua tiny">
                    속령
                  </text>
                </g>
              )}
              {battles.has(c.id) && <image href={asset('sprites/swords.png')} x={-17} y={top - 34} width={34} height={34 * (112 / 120)} className="swords" />}
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

        {/* 부대 */}
        {game.armies.map((a) => {
          const [x, y] = armyDrawPos(a);
          const left = armyTurnsLeft(a);
          return (
            <g key={a.id} className="army" transform={`translate(${x},${y}) scale(${k})`} pointerEvents="none">
              {FLAG_NATIONS.has(a.nation) ? (
                <FlagSprite nation={a.nation} x={-13} y={-58} w={26} />
              ) : (
                <rect x={-6} y={-40} width={12} height={36} fill={nationColor(a.nation)} />
              )}
              <rect x={-20} y={0} width={40} height={14} rx={3} fill="rgba(14,22,44,.88)" stroke="#c9a65a" strokeWidth={0.8} />
              <text x={0} y={11} textAnchor="middle" className="svg-jua tiny">
                {a.troops.toLocaleString()}
              </text>
              {left > 0 && (
                <text x={16} y={-44} className="svg-jua tiny">
                  {left}턴
                </text>
              )}
              {left === 0 && a.sieging && (
                <text x={16} y={-44} className="svg-jua tiny warn">
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
      </svg>
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
            <div className="muted">눌러서 닫기</div>
          </div>
        </div>
      )}
    </div>
  );
}
