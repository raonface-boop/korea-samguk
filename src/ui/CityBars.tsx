import { GameState, officersInCity } from '../game/state';
import { roninInCity } from '../game/personnel';

export type BarView = 'city' | 'army' | 'officer';

interface Row {
  label: string;
  value: number;
  max: number;
  color: string;
}

function rowsFor(game: GameState, cityId: string, view: BarView): Row[] {
  const c = game.cities[cityId];
  if (view === 'city')
    return [
      { label: '금', value: c.gold, max: 5000, color: '#e8c04a' },
      { label: '군량', value: c.food, max: 20000, color: '#9fcf58' },
      { label: '민심', value: Math.round(c.morale), max: 100, color: '#e88a5a' },
    ];
  if (view === 'army')
    return [
      { label: '병사', value: c.troops, max: 20000, color: '#d6574a' },
      { label: '훈련', value: Math.round(c.training), max: 100, color: '#5aa8e6' },
      { label: '사기', value: Math.round((c.training + c.morale) / 2), max: 100, color: '#e6a44a' },
    ];
  const active = officersInCity(game, cityId).filter((o) => o.nation === c.owner).length;
  const ronin = roninInCity(game, cityId).length;
  const prisoners = Object.values(game.officers).filter((o) => o.status === 'prisoner' && o.city === cityId).length;
  return [
    { label: '현역', value: active, max: 10, color: '#6fc06f' },
    { label: '재야', value: ronin, max: 10, color: '#c9b46a' },
    { label: '포로', value: prisoners, max: 10, color: '#b07ad6' },
  ];
}

/** 성 옆 막대 3줄 (지도 좌표 x,y 에 화면 크기 고정으로 그림) */
export default function CityBars({ game, cityId, view, x, y, k }: { game: GameState; cityId: string; view: BarView; x: number; y: number; k: number }) {
  const rows = rowsFor(game, cityId, view);
  const W = 118;
  const rowH = 15;
  return (
    <g transform={`translate(${x},${y}) scale(${k})`} pointerEvents="none">
      <g transform={`translate(${40},${-30})`}>
        <rect x={-4} y={-4} width={W + 8} height={rows.length * rowH + 6} rx={4} fill="rgba(14,22,44,.86)" stroke="#c9a65a" strokeWidth={1} />
        {rows.map((r, i) => {
          const t = Math.max(0, Math.min(1, r.value / r.max));
          return (
            <g key={r.label} transform={`translate(0,${i * rowH})`}>
              <text x={0} y={10} className="svg-jua small">
                {r.label}
              </text>
              <rect x={30} y={2} width={56} height={9} fill="#0b0f1c" stroke="#3B1E0C" strokeWidth={0.8} />
              <rect x={30} y={2} width={56 * t} height={9} fill={r.color} />
              <text x={W} y={10} textAnchor="end" className="svg-jua small">
                {r.value.toLocaleString()}
              </text>
            </g>
          );
        })}
      </g>
    </g>
  );
}
