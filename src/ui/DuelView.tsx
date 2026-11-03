import { useEffect, useState } from 'react';
import { CITY_BY_ID, DuelResult, nationColor, officerName, stat } from '../game/state';
import Portrait from './Portrait';

interface Props {
  duel: DuelResult;
  fast: boolean;
  onClose: () => void;
}

function Fighter({ id, nation, hp }: { id: string; nation: string; hp: number }) {
  return (
    <div className="fighter">
      <Portrait officerId={id} nation={nation} kind="face" size={80} />
      <div className="fighter-name" style={{ color: nationColor(nation) }}>
        {officerName(id)}
      </div>
      <div className="muted">무력 {stat(id, 'war')}</div>
      <div className="hp">
        <div className="hp-fill" style={{ width: `${hp}%` }} />
      </div>
      <div className="hp-num">{hp}</div>
    </div>
  );
}

export default function DuelView({ duel, fast, onClose }: Props) {
  const [n, setN] = useState(0);
  const total = duel.rounds.length;
  useEffect(() => {
    if (n >= total) return;
    const t = window.setTimeout(() => setN((x) => x + 1), fast ? 200 : 600);
    return () => window.clearTimeout(t);
  }, [n, total, fast]);
  const cur = n > 0 ? duel.rounds[n - 1] : { hpA: 100, hpB: 100 };
  const done = n >= total;
  return (
    <div className="modal-back">
      <div className="modal duel">
        <div className="sheet-title center">{CITY_BY_ID[duel.city].name} 일기토</div>
        <div className="fighters">
          <Fighter id={duel.a.id} nation={duel.a.nation} hp={cur.hpA} />
          <div className="vs">對</div>
          <Fighter id={duel.b.id} nation={duel.b.nation} hp={cur.hpB} />
        </div>
        <div className="duel-lines">
          {duel.rounds.slice(Math.max(0, n - 5), n).map((r, i) => (
            <div key={n - 5 + i} className="fade-in">
              {r.text}
            </div>
          ))}
        </div>
        {done && <div className="duel-result">{duel.outcome}</div>}
        <div className="actions">
          {!done && (
            <button className="btn" onClick={() => setN(total)}>
              건너뛰기
            </button>
          )}
          {done && (
            <button className="btn btn-gold" onClick={onClose}>
              확인
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
