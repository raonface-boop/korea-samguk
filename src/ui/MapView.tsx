import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CITIES,
  GRID_H,
  GRID_W,
  GameState,
  MAP_H,
  MAP_W,
  NATION_BY_ID,
  PASSES,
  ROADS,
  CELL,
  nationColor,
} from '../game/state';
import { armyPosition, roadPoints } from '../game/military';
import { asset } from './assets';

interface Props {
  game: GameState;
  selected: string | null;
  onSelectCity: (id: string) => void;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 칸마다 주인 나라 색(투명도 0.4)을 칠한 그림 */
function useControlImage(owner: string[]): string {
  return useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = GRID_W;
    cv.height = GRID_H;
    const ctx = cv.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(GRID_W, GRID_H);
    const cache: Record<string, [number, number, number]> = {};
    for (let i = 0; i < owner.length; i++) {
      const o = owner[i];
      if (!o) continue;
      const rgb = (cache[o] ??= hexToRgb(nationColor(o)));
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = Math.round(255 * 0.4);
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }, [owner]);
}

/** 세로 깃발(아래 끝이 갈라진 모양) */
function Flag({ x, y, color, hanja, scale = 1 }: { x: number; y: number; color: string; hanja: string; scale?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} className="flag">
      <line x1={0} y1={0} x2={0} y2={-30} stroke="#2a1d10" strokeWidth={1.4} />
      <path d="M0,-30 H11 V-10 L5.5,-14 L0,-10 Z" fill={color} stroke="#1a120a" strokeWidth={0.7} />
      {hanja && (
        <text x={5.5} y={-19} fontSize={8} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontWeight={700}>
          {hanja}
        </text>
      )}
    </g>
  );
}

export default function MapView({ game, selected, onSelectCity }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const controlImg = useControlImage(game.grid.owner);

  // 처음에는 내 나라 도성을 가운데로
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const s = Math.max(0.6, Math.min(1.6, Math.min(w, h) / 600));
    const mine = CITIES.find((c) => game.cities[c.id].owner === game.player) ?? CITIES[0];
    setView({ s, x: w / 2 - mine.x * s, y: h / 2 - mine.y * s });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoom = (f: number, cx?: number, cy?: number) => {
    const el = wrap.current;
    if (!el) return;
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    setView((v) => {
      const s = Math.max(0.35, Math.min(4, v.s * f));
      const k = s / v.s;
      return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    movedRef.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 6) {
      d.moved = true;
      movedRef.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  };

  const clickCity = (id: string) => {
    if (movedRef.current) return;
    onSelectCity(id);
  };

  return (
    <div
      className="map-wrap"
      ref={wrap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <svg
        className="map-svg"
        width={MAP_W}
        height={MAP_H}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      >
        <image href={asset('map/relief.jpg')} x={0} y={0} width={MAP_W} height={MAP_H} />
        {controlImg && (
          <image
            href={controlImg}
            x={0}
            y={0}
            width={GRID_W * CELL}
            height={GRID_H * CELL}
            preserveAspectRatio="none"
            style={{ imageRendering: 'pixelated' }}
          />
        )}
        <image href={asset('map/borders.png')} x={0} y={0} width={MAP_W} height={MAP_H} />

        {/* 길 */}
        <g className="roads">
          {ROADS.map((r, i) => {
            const pts = roadPoints(r.a, r.b);
            const d = pts.map((p) => p.join(',')).join(' ');
            const style =
              r.type === 'plain'
                ? { stroke: '#f3e2b5', strokeWidth: 2.2, strokeDasharray: undefined }
                : r.type === 'mountain'
                  ? { stroke: '#e8d29a', strokeWidth: 2, strokeDasharray: '5 4' }
                  : r.type === 'pass'
                    ? { stroke: '#f0c36a', strokeWidth: 2.2, strokeDasharray: '2 3' }
                    : { stroke: '#5aa8e6', strokeWidth: 2, strokeDasharray: '6 5' };
            return (
              <polyline
                key={i}
                points={d}
                fill="none"
                strokeLinecap="round"
                opacity={0.9}
                {...style}
              />
            );
          })}
          {PASSES.map((p) => (
            <g key={p.name}>
              <path d={`M${p.x - 5},${p.y + 3} L${p.x},${p.y - 4} L${p.x + 5},${p.y + 3} Z`} fill="#6b4a22" stroke="#f0c36a" strokeWidth={0.8} />
              <text x={p.x + 7} y={p.y + 3} className="pass-label">
                {p.name}
              </text>
            </g>
          ))}
        </g>

        {/* 출진 부대 경로 */}
        {game.armies.map((a) => {
          const pts: [number, number][] = [armyPosition(a)];
          for (let i = a.pathIndex + 1; i < a.path.length; i++) {
            const seg = roadPoints(a.path[i - 1], a.path[i]);
            pts.push(...seg.slice(1));
          }
          return (
            <polyline
              key={a.id + 'p'}
              points={pts.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke={nationColor(a.nation)}
              strokeWidth={3}
              strokeDasharray="1 5"
              strokeLinecap="round"
            />
          );
        })}

        {/* 성 */}
        {CITIES.map((c) => {
          const cs = game.cities[c.id];
          const nation = NATION_BY_ID[cs.owner];
          const W = 30;
          const H = 24;
          const label = c.name;
          const lw = label.length * 12 + 10;
          let lx = c.x + 18;
          let ly = c.y - 6;
          if (c.labelSide === 'L') lx = c.x - 18 - lw;
          if (c.labelSide === 'B') {
            lx = c.x - lw / 2;
            ly = c.y + 14;
          }
          return (
            <g key={c.id} className="castle" onClick={() => clickCity(c.id)}>
              <circle cx={c.x} cy={c.y} r={20} fill="transparent" />
              {selected === c.id && <circle cx={c.x} cy={c.y} r={19} className="sel-ring" />}
              <use href={`#b-${c.castleStyle}`} x={c.x - W / 2} y={c.y - H + 6} width={W} height={H} />
              {cs.owner !== 'none' && <Flag x={c.x + 9} y={c.y - 12} color={nation.color} hanja={nation.hanja} />}
              <rect x={lx} y={ly} width={lw} height={17} rx={3} className="label-bg" />
              <text x={lx + lw / 2} y={ly + 12.5} className="label" textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}

        {/* 부대 */}
        {game.armies.map((a) => {
          const [x, y] = armyPosition(a);
          const n = NATION_BY_ID[a.nation];
          return (
            <g key={a.id} className="army">
              <Flag x={x} y={y} color={n.color} hanja={n.hanja} scale={1.1} />
              <rect x={x - 16} y={y + 1} width={32} height={12} rx={2} fill="rgba(20,12,6,.8)" />
              <text x={x} y={y + 10.5} textAnchor="middle" className="army-label">
                {a.troops}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="zoom-btns">
        <button className="btn round" onClick={() => zoom(1.25)} aria-label="확대">
          ＋
        </button>
        <button className="btn round" onClick={() => zoom(0.8)} aria-label="축소">
          －
        </button>
      </div>
    </div>
  );
}

