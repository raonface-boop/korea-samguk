import { CITIES, GameState, nationColor } from '../game/state';
import { IMG_H, IMG_W, IMG_X, IMG_Y } from './MapView';
import { asset } from './assets';
import { L, Rect, rectStyle } from './Stage';

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
  /** 무대 위 자리 (지금 화면에서는 쓰지 않음) */
  box: Rect;
}

/** 작은 지도. 누르면 그 자리로 이동 (5차부터 화면에서 뺌) */
export default function MiniMap({ game, selected, view, onJump, box }: Props) {
  // 새 지도 그림 범위(IMG_X·IMG_Y 부터 IMG_W×IMG_H)를 작은 지도에 맞춤
  const k = Math.min(box.w / IMG_W, box.h / IMG_H);
  const w = IMG_W * k;
  const h = IMG_H * k;
  const ox = (box.w - w) / 2;
  const oy = (box.h - h) / 2;
  const vx = (-view.x / view.s - IMG_X) * k;
  const vy = (-view.y / view.s - IMG_Y) * k;
  const vw = (L.map.w / view.s) * k;
  const vh = (L.map.viewBottom / view.s) * k;
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = r.width / w;
    const mx = (e.clientX - r.left) / sx / k + IMG_X;
    const my = (e.clientY - r.top) / sx / k + IMG_Y;
    onJump(mx, my);
  };
  return (
    <div className="minimap" style={rectStyle(box)}>
      <div className="minimap-in" style={{ left: ox, top: oy, width: w, height: h }} onClick={click}>
        <img src={asset('map/v2/summer_small.webp')} alt="" draggable={false} />
        <svg width={w} height={h}>
          {CITIES.map((c) => {
            const owner = game.cities[c.id].owner;
            return <circle key={c.id} cx={(c.x - IMG_X) * k} cy={(c.y - IMG_Y) * k} r={2.6} fill={nationColor(owner)} stroke="#000" strokeWidth={0.6} />;
          })}
          {selected && (
            <rect
              x={(CITY_X(selected) - IMG_X) * k - 5}
              y={(CITY_Y(selected) - IMG_Y) * k - 5}
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
