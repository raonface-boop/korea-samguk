import { APT_MULT, ArmyOrder, CITY_BY_ID, GameState, UNIT_NAME, nationColor, nationName, officerName } from '../game/state';
import { UNIT_APT, armyAttack, armyDefense, armyTarget, armyTurnsLeft, matchupSummary, troopCap, unitStats } from '../game/military';
import Portrait from './Portrait';

/** 부대 정보 창: 지도에서 부대 표식을 누르면 열림 */
export default function ArmyInfo({
  game,
  armyId,
  onClose,
  onOpen,
  onSetOrder,
}: {
  game: GameState;
  armyId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  /** 내 부대의 명령 바꾸기 */
  onSetOrder?: (id: string, order: ArmyOrder) => void;
}) {
  const a = game.armies.find((x) => x.id === armyId);
  if (!a) return null;
  const us = unitStats(a, game);
  const apt = us.apt[UNIT_APT[a.unitType]];
  const who = (id: string | null) => (id && id !== a.officers[0] ? ` (${officerName(id)})` : '');
  const order = a.order ?? { engage: 'fight', arrive: 'siege' };
  const mine = a.nation === game.player;
  const lead = a.officers[0] ?? null;
  const target = armyTarget(a);
  const left = armyTurnsLeft(a);
  const eat = Math.max(1, Math.ceil(a.troops / 20));
  const cap = lead ? troopCap(game, lead, a.unitType) : a.troops;
  const mates = game.armies.filter((x) => x.id !== a.id && x.nation === a.nation && armyTarget(x) === target && x.origin === a.origin);
  return (
    <div className="sheet frame jua">
      <div className="sheet-head">
        <span className="sheet-title">
          부대 정보 <small style={{ color: nationColor(a.nation) }}>{nationName(a.nation)}</small>
        </span>
        <button className="btn close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <div style={{ display: 'flex', gap: 12 }}>
          {lead && <Portrait officerId={lead} nation={a.nation} kind="face" size={84} />}
          <div className="city-info">
            <div className="kv">
              <b>{lead ? officerName(lead) : '대장 없음'}</b> {lead && <span className="muted">{game.officers[lead]?.rank}</span>}
            </div>
            {a.officers.length > 1 && (
              <div className="kv">
                <b>부장</b> {a.officers.slice(1).map(officerName).join(', ')}
              </div>
            )}
            <div className="kv">
              부대 능력: 통솔 {us.leadership}
              {who(us.by.leadership)} · 무력 {us.war}
              {who(us.by.war)} · 지력 {us.intelligence}
              {who(us.by.intelligence)}
            </div>
            <div className="kv">
              <b>병과</b> {UNIT_NAME[a.unitType]} · {UNIT_APT[a.unitType]} {apt.grade} ×{APT_MULT[apt.grade]}
              {apt.id && apt.id !== a.officers[0] && ` (${officerName(apt.id)})`}
            </div>
            <div className="kv">
              <b>사기</b> {Math.round(a.morale ?? 100)} · <b>명령</b>{' '}
              {mine && onSetOrder ? (
                <>
                  <button className="btn tiny-btn" onClick={() => onSetOrder(a.id, { ...order, engage: order.engage === 'fight' ? 'avoid' : 'fight' })}>
                    {order.engage === 'fight' ? '싸움' : '피함'}
                  </button>{' '}
                  <button className="btn tiny-btn" onClick={() => onSetOrder(a.id, { ...order, arrive: order.arrive === 'siege' ? 'wait' : 'siege' })}>
                    {order.arrive === 'siege' ? '공성' : '대기'}
                  </button>
                </>
              ) : (
                `${order.engage === 'fight' ? '싸움' : '피함'} · ${order.arrive === 'siege' ? '공성' : '대기'}`
              )}
              {a.clash && <span className="warn"> 교전 중</span>}
            </div>
            <div className="kv">
              <b>병력</b> {a.troops.toLocaleString()} / {cap.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="info-grid">
          <div>
            <b>공격력</b> {Math.round(armyAttack(a, game)).toLocaleString()}
          </div>
          <div>
            <b>방어력</b> {Math.round(armyDefense(a, game)).toLocaleString()}
          </div>
          <div>
            <b>훈련</b> {Math.round(a.training)}
          </div>
          <div>
            <b>군량</b> {a.food.toLocaleString()} (약 {Math.floor(a.food / eat)}턴)
          </div>
          <div>
            <b>실은 금</b> {(a.gold ?? 0).toLocaleString()}
          </div>
          <div>
            <b>남은 턴</b> {a.sieging ? '공성 중' : left > 0 ? `${left}턴` : '도착'}
          </div>
        </div>
        <div className="kv">
          <b>길</b> {CITY_BY_ID[a.origin]?.name ?? a.origin} → {CITY_BY_ID[target].name}
          {a.retreating && ' (퇴각 중)'}
        </div>
        <div className="kv">
          <b>상성</b> {matchupSummary(a.unitType)}
        </div>
        {mates.length > 0 && (
          <>
            <div className="kv">
              <b>함께 가는 부대</b>
            </div>
            <div className="picker">
              {mates.map((m) => (
                <button key={m.id} className="pick-row" onClick={() => onOpen(m.id)}>
                  {m.officers[0] && <Portrait officerId={m.officers[0]} nation={m.nation} kind="face" size={28} />}
                  <span className="pick-name">{m.officers[0] ? officerName(m.officers[0]) : '대장 없음'}</span>
                  <span className="pick-stat">
                    {UNIT_NAME[m.unitType]} {m.troops.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
