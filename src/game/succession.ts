// 왕위 계승
import { GameState, OFFICER_DATA_BY_ID, OfficerState, addLog, nationName, officerName, stat } from './state';

const ROYAL = ['왕자', '세자', '왕족'];

function available(o: OfficerState | undefined, nation: string): o is OfficerState {
  return !!o && o.nation === nation && (o.status === 'active' || o.status === 'moving');
}

/** 다음 군주 고르기 */
export function pickSuccessor(s: GameState, nation: string, oldRuler: string | null): string | null {
  const pref = oldRuler ? OFFICER_DATA_BY_ID[oldRuler]?.successor : null;
  if (pref && available(s.officers[pref], nation)) return pref;
  const list = Object.values(s.officers).filter((o) => available(o, nation) && o.id !== oldRuler);
  const royals = list.filter((o) => ROYAL.includes(o.rank));
  const pool = royals.length ? royals : list;
  pool.sort((a, b) => stat(b.id, 'charm') - stat(a.id, 'charm'));
  return pool[0]?.id ?? null;
}

/** 군주를 바꿈 (to 를 정하지 않으면 규칙대로 고름) */
export function succeed(s: GameState, nation: string, oldRuler: string | null, reason: string, to?: string, popup = true) {
  const next = to && available(s.officers[to], nation) ? to : pickSuccessor(s, nation, oldRuler);
  if (oldRuler && s.officers[oldRuler]?.rank === '군주') s.officers[oldRuler].rank = '선왕';
  if (!next) {
    addLog(s, `${nationName(nation)}에 왕위를 이을 사람이 없다`);
    return;
  }
  s.officers[next].rank = '군주';
  for (const o of Object.values(s.officers)) {
    if (o.nation === nation && o.status !== 'dead' && o.id !== next) o.loyalty = Math.max(0, o.loyalty - 5);
  }
  const text = `${reason} ${officerName(next)}이(가) ${nationName(nation)}의 왕위를 이었다.`;
  addLog(s, text);
  if (popup) {
    s.popups.push({ kind: 'event', title: `${nationName(nation)} 왕위 계승`, speaker: next, nation, text: [text] });
  }
}

/** 군주가 사로잡히거나 죽었을 때 */
export function handleRulerLoss(s: GameState, nation: string, rulerId: string) {
  const o = s.officers[rulerId];
  const reason = o.status === 'dead' ? `${officerName(rulerId)}이(가) 세상을 떠나고,` : `${officerName(rulerId)}이(가) 사로잡혀,`;
  succeed(s, nation, rulerId, reason);
}

/** 매 턴: deathYear 가 된 군주는 그해 무작위 계절에 사망 */
export function checkRulerDeaths(s: GameState) {
  for (const o of Object.values(s.officers)) {
    if (o.rank !== '군주' || o.status === 'dead') continue;
    const dy = OFFICER_DATA_BY_ID[o.id]?.deathYear;
    if (!dy) continue;
    const due = s.year > dy || (s.year === dy && Math.random() < 1 / (4 - s.season));
    if (!due) continue;
    const nation = o.nation;
    o.status = 'dead';
    o.city = null;
    if (o.armyId) {
      const a = s.armies.find((x) => x.id === o.armyId);
      if (a) a.officers = a.officers.filter((x) => x !== o.id);
      o.armyId = null;
    }
    addLog(s, `${nationName(nation)}의 ${officerName(o.id)}, 세상을 떠나다`);
    if (o.captor) continue; // 포로로 죽음: 이미 승계됨
    succeed(s, nation, o.id, `${officerName(o.id)}이(가) 세상을 떠나고,`);
  }
}
