import { CITY_BY_ID, GameState, nationColor, nationName, officerName } from '../game/state';
import { prisonerExecute, prisonerRecruit, prisonerRecruitRate, prisonerRelease, prisonersOf } from '../game/personnel';
import Portrait from './Portrait';

type Run = (fn: (s: GameState) => string | null) => void;

export default function PrisonerSheet({ game, onRun, onClose }: { game: GameState; onRun: Run; onClose: () => void }) {
  const me = game.player;
  const list = prisonersOf(game, me);
  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className="sheet-title">포로</span>
        <button className="btn close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        {list.length === 0 && <div className="muted">잡아 둔 포로가 없습니다</div>}
        {list.map((p) => {
          const tried = p.triedTurn === game.turn;
          return (
            <div key={p.id} className="prisoner">
              <div className="prisoner-head">
                <Portrait officerId={p.id} nation={p.nation} kind="face" size={44} />
                <div>
                  <b>{officerName(p.id)}</b>{' '}
                  <span style={{ color: nationColor(p.nation) }}>{nationName(p.nation)}</span> · {p.rank}
                  <div className="muted">
                    충성 {p.loyalty} · {p.city ? CITY_BY_ID[p.city].name : '-'}에 갇힘 · 등용 확률 {Math.round(prisonerRecruitRate(game, me, p.id))}%
                  </div>
                </div>
              </div>
              <div className="seg">
                <button className="btn" disabled={tried} onClick={() => onRun((s) => prisonerRecruit(s, me, p.id))}>
                  {tried ? '이번 턴 시도함' : '등용'}
                </button>
                <button className="btn" onClick={() => onRun((s) => prisonerRelease(s, me, p.id))}>
                  석방
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    if (window.confirm(`${officerName(p.id)}을(를) 처형할까요? ${nationName(p.nation)}과의 관계가 크게 나빠지고 내 장수들의 충성이 떨어집니다.`))
                      onRun((s) => prisonerExecute(s, me, p.id));
                  }}
                >
                  처형
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
