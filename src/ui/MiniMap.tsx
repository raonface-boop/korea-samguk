import { CITIES, GameState, MAP_H, MAP_W, nationColor } from '../game/state';
import { asset } from './assets';
import { L, rectStyle } from './Stage';

export interface MapViewState {
  s: number;
  x: number;
  y: number;
}

interface Props {
  game: GameState;
  selected: string | null;
  view: MapViewState;
  onJump: (mx: number, my: number) => void;
}

/** 패널 왼쪽 위 작은 지도. 누르면 그 자리로 이동 */
export default function MiniMap({ game, selected, view, onJump }: Props) {
  const box = L.minimap;
  const k = Math.min(box.w / MAP_W, box.h / MAP_H);
  const w = MAP_W * k;
  const h = MAP_H * k;
  const ox = (box.w - w) / 2;
  const oy = (box.h - h) / 2;
  const vx = (-view.x / view.s) * k;
  const vy = (-view.y / view.s) * k;
  const vw = (L.map.w / view.s) * k;
  const vh = (L.map.h / view.s) * k;
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = r.width / w;
    const mx = (e.clientX - r.left) / sx / k;
    const my = (e.clientY - r.top) / sx / k;
    onJump(mx, my);
  };
  return (
    <div className="minimap" style={rectStyle(box)}>
      <div className="minimap-in" style={{ left: ox, top: oy, width: w, height: h }} onClick={click}>
        <img src={asset('map/season/summer.jpg')} alt="" draggable={false} />
        <svg width={w} height={h}>
          {CITIES.map((c) => {
            const owner = game.cities[c.id].owner;
            return <circle key={c.id} cx={c.x * k} cy={c.y * k} r={2.6} fill={nationColor(owner)} stroke="#000" strokeWidth={0.6} />;
          })}
          {selected && (
            <rect
              x={CITY_X(selected) * k - 5}
              y={CITY_Y(selected) * k - 5}
              width={10}
              height={10}
              fill="none"
              stroke="#fff"
              strokeWidth={1.5}
            />
          )}
          <rect x={vx} y={vy} width={vw} height={vh} fill="none" stroke="#fff" strokeWidth={1.2} />
        </svg>
      </div>
    </div>
  );
}

const CITY_X = (id: string) => CITIES.find((c) => c.id === id)?.x ?? 0;
const CITY_Y = (id: string) => CITIES.find((c) => c.id === id)?.y ?? 0;
