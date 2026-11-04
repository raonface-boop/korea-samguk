import { useEffect, useState } from 'react';
import { OFFICER_DATA_BY_ID, nationColor, nationName } from '../game/state';
import Portrait from './Portrait';

interface Props {
  title: string;
  speaker: string | null;
  nation: string | null;
  text: string[];
  fast: boolean;
  onClose: () => void;
}

/** 역사 이벤트 창: 문단을 차례로 보여줌 */
export default function EventDialog({ title, speaker, nation, text, fast, onClose }: Props) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (shown >= text.length) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), fast ? 300 : 1200);
    return () => window.clearTimeout(t);
  }, [shown, text.length, fast]);
  const sp = speaker ? OFFICER_DATA_BY_ID[speaker] : null;
  const spNation = nation ?? sp?.nation ?? 'none';
  const done = shown >= text.length;
  return (
    <div className="modal-back">
      <div className="modal event" onClick={() => !done && setShown(text.length)}>
        {nation && (
          <div className="event-nation" style={{ background: nationColor(nation) }}>
            {nationName(nation)}
          </div>
        )}
        <div className="event-title">{title}</div>
        <div className="event-body">
          {sp && (
            <div className="event-speaker">
              <Portrait officerId={sp.id} nation={spNation} kind="face" size={72} />
              <span>{sp.name}</span>
            </div>
          )}
          <div className="event-text">
            {text.slice(0, shown).map((p, i) => (
              <p key={i} className="fade-in">
                {p}
              </p>
            ))}
          </div>
        </div>
        <button className="btn btn-gold big" onClick={(e) => (e.stopPropagation(), done ? onClose() : setShown(text.length))}>
          {done ? '확인' : '넘기기'}
        </button>
      </div>
    </div>
  );
}
