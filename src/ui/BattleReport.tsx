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

/**
 * 전투 결과 창: 그 턴에 내 나라가 낀 교전·공성을 차례로.
 * 어디서 · 누구 대 누구 · 시작 병력 → 남은 병력 · 성벽 내구 · 일기토 · 결과. '다음' / '모두 닫기'
 */
export default function BattleReport({
  report,
  index,
  total,
  onNext,
  onCloseAll,
}: {
  report: BattleReportData;
  index: number;
  total: number;
  onNext: () => void;
  onCloseAll: () => void;
}) {
  const kind = report.clash ? '교전' : [report.field && '야전', report.siege && '공성전'].filter(Boolean).join(' · ') || '전투';
  const place = report.place ?? CITY_BY_ID[report.city].name;
  const result = report.fallen ? '함락' : (report.result ?? '계속');
  return (
    <div className="modal-back">
      <div className="modal battle">
        <div className="sheet-title center">
          {place} {kind}
          {total > 1 && (
            <small className="muted">
              {' '}
              ({index + 1}/{total})
            </small>
          )}
        </div>
        <div className="br-sides">
          <Side title={report.clash ? '한쪽' : '공격'} side={report.attacker} />
          <Side title={report.clash ? '다른 쪽' : '수비'} side={report.defender} />
        </div>
        {report.wall && (
          <div className="kv">
            성벽 내구 {report.wall[0]} → {report.wall[1]}
          </div>
        )}
        {report.duel && <div className="kv">일기토: {report.duel}</div>}
        <div className={report.fallen ? 'br-fallen' : 'kv'}>결과: {result}</div>
        {report.captured.length > 0 && <div className="kv">포로: {report.captured.join(', ')}</div>}
        <div className="br-lines">
          {report.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div className="actions">
          {total > 1 && (
            <button className="btn" onClick={onCloseAll}>
              모두 닫기
            </button>
          )}
          <button className="btn btn-gold big" onClick={onNext}>
            {index + 1 < total ? '다음' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
