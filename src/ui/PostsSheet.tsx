import { useState } from 'react';
import { CITY_BY_ID, GameState, POST_KEYS, PostKey, cloneState, officerName, officersInCity } from '../game/state';
import { STAT_NAME, assignPost, postPreview, postScore } from '../game/domestic';
import Portrait from './Portrait';

/** 자리마다 쓰는 능력 이름 */
const POST_STAT_LABEL: Record<PostKey, string> = {
  농업: STAT_NAME.politics,
  상업: STAT_NAME.politics,
  징병: STAT_NAME.charm,
  훈련: STAT_NAME.leadership,
  치안: `${STAT_NAME.war}+${STAT_NAME.leadership}`,
};

/** 담당관: 다섯 자리마다 지금 담당 장수와 '바꾸기' */
export default function PostsSheet({
  game,
  cityId,
  onCommit,
  onClose,
}: {
  game: GameState;
  cityId: string;
  /** 바뀐 상태를 저장 */
  onCommit: (s: GameState, msg: string) => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState<PostKey | null>(null);
  const c = game.cities[cityId];
  const posts = c.posts ?? {};
  const officers = officersInCity(game, cityId).filter((o) => o.nation === c.owner);

  const set = (key: PostKey, id: string | null) => {
    const s = cloneState(game);
    assignPost(s, cityId, key, id);
    onCommit(s, id ? `${CITY_BY_ID[cityId].name} ${key} 담당: ${officerName(id)}` : `${CITY_BY_ID[cityId].name} ${key} 담당을 비움`);
    setPicking(null);
  };

  return (
    <div className="sheet frame jua">
      <div className="sheet-head">
        <span className="sheet-title">{CITY_BY_ID[cityId].name} · 담당관</span>
        <button className="btn close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <div className="muted">자리에 앉힌 장수는 매 턴 저절로 일합니다. 한 장수는 한 자리만, 8턴 이어 맡으면 쓰는 능력 +1.</div>
        {POST_KEYS.map((key) => {
          const id = posts[key] ?? null;
          return (
            <div key={key} className="post-row">
              <div className="post-row-head">
                <b className="post-key">{key}</b>
                <span className="post-who">
                  {id ? (
                    <>
                      <Portrait officerId={id} nation={c.owner} kind="face" size={26} />
                      {officerName(id)} <small className="muted">({POST_STAT_LABEL[key]} {postScore(id, key)} · {c.postTurns?.[key] ?? 0}턴째)</small>
                    </>
                  ) : (
                    <span className="muted">비어 있음</span>
                  )}
                </span>
                <button className="btn" onClick={() => setPicking(picking === key ? null : key)}>
                  바꾸기
                </button>
                {id && (
                  <button className="btn" onClick={() => set(key, null)}>
                    비우기
                  </button>
                )}
              </div>
              <div className="muted post-preview">이번 턴 예상: {postPreview(game, cityId, key, id)}</div>
              {picking === key && (
                <div className="picker">
                  {[...officers]
                    .sort((a, b) => postScore(b.id, key) - postScore(a.id, key))
                    .map((o) => {
                      const other = POST_KEYS.find((k) => posts[k] === o.id && k !== key);
                      return (
                        <button key={o.id} className={`pick-row ${id === o.id ? 'on' : ''}`} onClick={() => set(key, o.id)}>
                          <Portrait officerId={o.id} nation={o.nation} kind="face" size={28} />
                          <span className="pick-name">{officerName(o.id)}</span>
                          <span className="pick-stat">
                            {POST_STAT_LABEL[key]} {postScore(o.id, key)}
                            {other && ` · 지금 ${other} 담당`}
                          </span>
                        </button>
                      );
                    })}
                  {!officers.length && <div className="muted">이 성에는 장수가 없사옵니다</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 담당 상황표: 내 성마다 다섯 자리의 담당 장수 */
export function PostsTable({ game, onClose }: { game: GameState; onClose: () => void }) {
  const mine = Object.values(game.cities).filter((c) => c.owner === game.player);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal frame jua posts-table-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-title">담당 상황표</span>
          <button className="btn close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <table className="posts-table">
          <thead>
            <tr>
              <th>성</th>
              {POST_KEYS.map((k) => (
                <th key={k}>{k}</th>
              ))}
              <th>치안</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((c) => (
              <tr key={c.id}>
                <td>{CITY_BY_ID[c.id].name}</td>
                {POST_KEYS.map((k) => (
                  <td key={k}>{c.posts?.[k] ? officerName(c.posts[k]!) : <span className="muted">-</span>}</td>
                ))}
                <td>{Math.round(c.security ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
