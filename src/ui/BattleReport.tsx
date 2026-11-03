import { BattleReportData, BattleSide, CITY_BY_ID, nationColor, nationName, officerName } from '../game/state';

function Side({ title, side }: { title: string; side: BattleSide }) {
  const lost = side.before - side.after;
  return (
    <div className="br-side" style={{ borderColor: nationColor(side.nation) }}>
      <div className="muted">{title}</div>
      <div className="br-nation" style={{ color: nationColor(side.nation) }}>
        {nationName(side.nation)}
      </div>
      <div>대장 {side.leader ? officerName(side.leader) : '없음'}</div>
      <div>
        병력 {side.before.toLocaleString()} → {side.after.toLocaleString()}
      </div>
      {lost > 0 && <div className="loss">−{lost.toLocaleString()}</div>}
    </div>
  );
}

export default function BattleReport({ report, onClose }: { report: BattleReportData; onClose: () => void }) {
  const kind = [report.field && '야전', report.siege && '공성전'].filter(Boolean).join(' · ') || '전투';
  return (
    <div className="modal-back">
      <div className="modal battle">
        <div className="sheet-title center">
          {CITY_BY_ID[report.city].name} {kind}
        </div>
        <div className="br-sides">
          <Side title="공격" side={report.attacker} />
          <Side title="수비" side={report.defender} />
        </div>
        {report.duel && <div className="kv">일기토: {report.duel}</div>}
        {report.fallen && <div className="br-fallen">성 함락!</div>}
        {report.captured.length > 0 && <div className="kv">포로: {report.captured.join(', ')}</div>}
        <div className="br-lines">
          {report.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <button className="btn btn-gold big" onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  );
}
