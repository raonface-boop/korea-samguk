import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import layout from '../data/ui_layout.json';
import { asset } from './assets';

export const L = layout;
export type Box = [number, number, number, number];
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** [x1,y1,x2,y2] 칸을 무대 좌표 style 로 */
export const boxStyle = (b: number[]): CSSProperties => ({ left: b[0], top: b[1], width: b[2] - b[0], height: b[3] - b[1] });
export const rectStyle = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });

function useStageScale() {
  const calc = () => Math.min(window.innerWidth / L.stage.w, window.innerHeight / L.stage.h);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const on = () => setScale(calc());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return scale;
}

/** 1672x941 고정 무대를 창 크기에 맞춰 통째로 확대·축소 (남는 곳은 검은 여백) */
export default function Stage({ children }: { children: ReactNode }) {
  const scale = useStageScale();
  const vars = {
    '--frame': `url(${asset('ui/frame.jpg')})`,
    '--frame-wood': `url(${asset('ui/frame_wood.png')})`,
    '--panel-tex': `url(${asset('ui/panel_navy.png')})`,
    '--lotus': `url(${asset('ui/lotus.png')})`,
    '--cloud': `url(${asset('ui/cloud_band.png')})`,
    '--map-w': `${L.map.w}px`,
    '--map-h': `${L.map.h}px`,
  } as CSSProperties;
  return (
    <div className="stage-outer">
      <div className="stage-box" style={{ width: L.stage.w * scale, height: L.stage.h * scale }}>
        <div className="stage" style={{ ...vars, width: L.stage.w, height: L.stage.h, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
