import { useState } from 'react';
import {
  GameState,
  NATIONS,
  citiesOf,
  nationColor,
  nationName,
  officerName,
  relation,
  rulerOf,
  stat,
} from '../game/state';
import {
  DIPLO_DESC,
  DIPLO_NAME,
  DiploCommand,
  TREATY_NAME,
  applyDiplomacy,
  liveNations,
  treatiesBetween,
} from '../game/diplomacy';
import { availableOfficers } from '../game/domestic';
import { OfficerPicker } from './CommandSheet';

type Run = (fn: (s: GameState) => string | null) => void;

function TreatyTags({ game, a, b }: { game: GameState; a: string; b: string }) {
  const ts = treatiesBetween(game, a, b);
  if (!ts.length) return <span className="muted">없음</span>;
  return (
    <>
      {ts.map((t, i) => (
        <span key={i} className="chip">
          {TREATY_NAME[t.type]}
          {t.type === 'tribute' && ` (${nationName(t.b)}→${nationName(t.a)})`}
          {t.turnsLeft !== null ? ` ${t.turnsLeft}턴` : ''}
        </span>
      ))}
    </>
  );
}

/** 세력 정보: 나라별 관계와 조약 */
export function NationInfo({ game, onClose }: { game: GameState; onClose: () => void }) {
  const list = NATIONS.filter((n) => n.id !== 'none');
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal frame jua" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-title">세력 정보</span>
          <button className="btn close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        {list.map((n) => {
          const cs = citiesOf(game, n.id);
          const ruler = rulerOf(game, n.id);
          const troops = cs.reduce((a, c) => a + c.troops, 0) + game.armies.filter((a) => a.nation === n.id).reduce((a, x) => a + x.troops, 0);
          const me = n.id === game.player;
          return (
            <div key={n.id} className="nation-row" style={{ borderColor: n.color }}>
              <div className="nation-row-head">
                <span className="dot" style={{ background: n.color }} />
                <b style={{ color: n.color }}>{n.name}</b>
                {me && <span className="chip">내 나라</span>}
                {!cs.length && <span className="chip">멸망</span>}
                <span className="muted">군주 {ruler ? officerName(ruler.id) : '-'}</span>
              </div>
              <div className="muted">
                성 {cs.length} · 병력 {troops.toLocaleString()} · 금 {cs.reduce((a, c) => a + c.gold, 0).toLocaleString()}
              </div>
              {!me && (
                <div className="kv">
                  <b>관계</b> {relation(game, game.player, n.id)} <b>조약</b> <TreatyTags game={game} a={game.player} b={n.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 외교 명령 (수도에서만) */
export default function DiplomacySheet({
  game,
  cityId,
  onRun,
  onClose,
  initialCmd = 'goodwill',
}: {
  game: GameState;
  cityId: string;
  onRun: Run;
  onClose: () => void;
  initialCmd?: DiploCommand;
}) {
  const me = game.player;
  const targets = liveNations(game).filter((n) => n !== me);
  const [target, setTarget] = useState(targets[0] ?? '');
  const [cmd, setCmd] = useState<DiploCommand>(initialCmd);
  const offs = availableOfficers(game, cityId).sort((a, b) => stat(b.id, 'charm') - stat(a.id, 'charm'));
  const [officer, setOfficer] = useState<string | null>(offs[0]?.id ?? null);
  const gold = game.cities[cityId].gold;
  const rel = target ? relation(game, me, target) : 0;
  let warn: string | null = null;
  if (cmd === 'goodwill' && gold < 200) warn = '금 200이 필요합니다';
  if (cmd === 'tribute' && gold < 300) warn = '금 300이 필요합니다';
  if (cmd === 'truce' && rel < -20) warn = '관계가 −20 이상이어야 합니다';
  if (cmd === 'alliance' && rel < 60) warn = '관계가 60 이상이어야 합니다';
  if (target && treatiesBetween(game, me, target).some((t) => t.type === cmd && cmd !== 'tribute')) warn = '이미 맺은 조약입니다';
  return (
    <div className="sheet frame jua">
      <div className="sheet-head">
        <span className="sheet-title">외교</span>
        <button className="btn close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <div className="kv">
          <b>상대 나라</b>
        </div>
        <div className="picker">
          {targets.map((n) => (
            <button key={n} className={`pick-row ${target === n ? 'on' : ''}`} onClick={() => setTarget(n)}>
              <span className="dot" style={{ background: nationColor(n) }} />
              <span className="pick-name">{nationName(n)}</span>
              <span className="pick-stat">
                관계 {relation(game, me, n)} · 성 {citiesOf(game, n).length}
              </span>
            </button>
          ))}
        </div>
        {target && (
          <div className="kv">
            <b>맺은 조약</b> <TreatyTags game={game} a={me} b={target} />
          </div>
        )}
        <div className="seg wrap">
          {(Object.keys(DIPLO_NAME) as DiploCommand[]).map((k) => (
            <button key={k} className={`btn ${cmd === k ? 'on' : ''}`} onClick={() => setCmd(k)}>
              {DIPLO_NAME[k]}
            </button>
          ))}
        </div>
        <div className="muted">{DIPLO_DESC[cmd]}</div>
        <div className="kv">
          <b>사신</b> <span className="muted">(금 {gold.toLocaleString()})</span>
        </div>
        <OfficerPicker game={game} cityId={cityId} statKey="charm" value={officer} onChange={setOfficer} />
        {warn && <div className="warn">{warn}</div>}
        <div className="actions">
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-gold"
            disabled={!officer || !target || !!warn}
            onClick={() => {
              onRun((s) => applyDiplomacy(s, me, target, cmd, officer));
              onClose();
            }}
          >
            보내기
          </button>
        </div>
      </div>
    </div>
  );
}
