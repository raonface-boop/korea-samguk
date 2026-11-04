import { useState } from 'react';
import {
  CITY_BY_ID,
  GameState,
  OFFICER_DATA_BY_ID,
  OfficerStats,
  nationColor,
  nationName,
} from '../game/state';
import { STAT_NAME } from '../game/domestic';
import Portrait from './Portrait';

const STAT_KEYS: (keyof OfficerStats)[] = ['leadership', 'war', 'intelligence', 'politics', 'charm'];

function whereIs(game: GameState, id: string): string {
  const o = game.officers[id];
  if (o.status === 'dead') return '사망';
  if (o.status === 'prisoner') return `포로(${nationName(o.captor ?? '')}·${o.city ? CITY_BY_ID[o.city].name : '-'})`;
  if (o.status === 'moving') return `이동 중 → ${o.moveTo ? CITY_BY_ID[o.moveTo].name : '-'} (${o.moveTurns}턴)`;
  if (o.status === 'ronin') return `재야(${o.city ? CITY_BY_ID[o.city].name : '-'})`;
  if (o.city) return CITY_BY_ID[o.city].name;
  if (o.armyId) return '출진 중';
  return '-';
}

export function OfficerList({
  game,
  onClose,
  onOpen,
}: {
  game: GameState;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [all, setAll] = useState(false);
  const list = Object.values(game.officers).filter(
    (o) =>
      o.status !== 'dead' &&
      (all
        ? o.status !== 'ronin' || o.foundBy.includes(game.player)
        : o.nation === game.player && o.status !== 'prisoner' && o.status !== 'ronin'),
  );
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal frame jua" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-title">장수 목록</span>
          <button className="btn close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="seg">
          <button className={`btn ${!all ? 'on' : ''}`} onClick={() => setAll(false)}>
            내 나라
          </button>
          <button className={`btn ${all ? 'on' : ''}`} onClick={() => setAll(true)}>
            전체
          </button>
        </div>
        <div className="officer-table">
          {list.map((o) => {
            const d = OFFICER_DATA_BY_ID[o.id];
            return (
              <button key={o.id} className="officer-row" onClick={() => onOpen(o.id)}>
                <Portrait officerId={o.id} nation={o.nation} kind="face" size={36} />
                <span className="o-name">
                  {d.name}
                  <small style={{ color: nationColor(o.nation) }}> {o.status === 'ronin' ? '재야' : nationName(o.nation)}</small>
                  {o.nation === game.player && o.status !== 'ronin' && (
                    <small className={`loy ${o.loyalty < 40 ? 'low' : ''}`}> 충성 {o.rank === '군주' ? '-' : o.loyalty}</small>
                  )}
                </span>
                <span className="o-stats">
                  {STAT_KEYS.map((k) => (
                    <span key={k}>
                      {STAT_NAME[k][0]}
                      {d.stats[k]}
                    </span>
                  ))}
                </span>
                <span className="o-where">{whereIs(game, o.id)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function OfficerDetail({ game, id, onClose }: { game: GameState; id: string; onClose: () => void }) {
  const [tab, setTab] = useState<'basic' | 'ability' | 'bio'>('basic');
  const d = OFFICER_DATA_BY_ID[id];
  const o = game.officers[id];
  const fam = (k: string) => d.family[k] || '-';
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal detail frame jua" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-title">{d.name}</span>
          <button className="btn close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="detail-body">
          <div className="detail-pic">
            <Portrait officerId={id} nation={o.nation} kind="full" size={60} />
          </div>
          <div className="detail-main">
            <div className="seg">
              <button className={`btn ${tab === 'basic' ? 'on' : ''}`} onClick={() => setTab('basic')}>
                기본
              </button>
              <button className={`btn ${tab === 'ability' ? 'on' : ''}`} onClick={() => setTab('ability')}>
                능력
              </button>
              <button className={`btn ${tab === 'bio' ? 'on' : ''}`} onClick={() => setTab('bio')}>
                열전
              </button>
            </div>
            {tab === 'basic' && (
              <div className="tab">
                <div className="kv">
                  <b>소속</b> <span style={{ color: nationColor(o.nation) }}>{o.status === 'ronin' ? '재야' : nationName(o.nation)}</span>
                </div>
                <div className="kv">
                  <b>신분</b> {o.rank}
                </div>
                {o.status !== 'ronin' && o.rank !== '군주' && (
                  <div className="kv">
                    <b>충성</b> <span className={`loy ${o.loyalty < 40 ? 'low' : ''}`}>{o.loyalty}</span>
                  </div>
                )}
                <div className="kv">
                  <b>생몰</b> {d.life || '미상'}
                </div>
                <div className="kv">
                  <b>있는 성</b> {whereIs(game, id)}
                </div>
              </div>
            )}
            {tab === 'ability' && (
              <div className="tab">
                {STAT_KEYS.map((k) => (
                  <div key={k} className="stat-row">
                    <span className="stat-label">{STAT_NAME[k]}</span>
                    <div className="bar">
                      <div className="bar-fill" style={{ width: `${d.stats[k]}%` }} />
                    </div>
                    <span className="stat-val">{d.stats[k]}</span>
                  </div>
                ))}
                <div className="kv">
                  <b>전법</b> {d.tactic ? `${d.tactic[0]} — ${d.tactic[1] ?? ''}` : '없음'}
                </div>
                <div className="kv">
                  <b>특기</b> {d.skill ? `${d.skill[0]} — ${d.skill[1] ?? ''}` : '없음'}
                </div>
              </div>
            )}
            {tab === 'bio' && (
              <div className="tab">
                <div className="family">
                  {['부친', '모친', '배우자', '자녀'].map((k) => (
                    <div key={k} className="fam-cell">
                      <small>{k}</small>
                      <div>{fam(k)}</div>
                    </div>
                  ))}
                </div>
                <div className="kv">
                  <b>친애</b> {d.love || '-'}
                </div>
                <div className="kv">
                  <b>혐오</b> {d.hate || '-'}
                </div>
                {d.bio.map((p, i) => (
                  <p key={i} className="bio">
                    {p}
                  </p>
                ))}
                <div className="source">출처: {d.source || '-'}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
