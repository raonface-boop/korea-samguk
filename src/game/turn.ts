// 턴 진행
// 순서: 컴퓨터 나라 행동 → 부대 이동 → 전투 → 지배력 퍼짐 → 수입 → 계절 넘어감
import { runAI } from './ai';
import { regionRatio, spreadControl } from './control';
import {
  aiSortie,
  armyEat,
  armyTarget,
  fieldBattle,
  mergeIntoCity,
  moveArmy,
  siegeTurn,
  startRetreat,
} from './military';
import { CITY_BY_ID, GameState, NATIONS, addLog, clamp100, cloneState, nationName } from './state';

/**
 * 턴 종료 1단계: 컴퓨터 행동과 부대 이동.
 * 내 성에 새로 닿은 적 부대가 있으면 state.pending 에 쌓고 멈춘다(출격/농성 선택 대기).
 */
export function beginEndTurn(prev: GameState): GameState {
  const s = cloneState(prev);
  if (s.status !== 'playing' || s.midTurn) return s;
  s.midTurn = true;
  runAI(s);
  for (const a of [...s.armies]) {
    armyEat(a);
    if (a.sieging) continue;
    const arrived = moveArmy(s, a);
    if (!arrived) continue;
    const target = armyTarget(a);
    const city = s.cities[target];
    if (city.owner === a.nation) {
      mergeIntoCity(s, a, target);
      continue;
    }
    if (a.retreating) {
      // 돌아갈 성이 그 사이 빼앗김: 다시 길을 찾음
      startRetreat(s, a);
      continue;
    }
    if (city.owner === s.player) {
      s.pending.push({ armyId: a.id, cityId: target });
    }
  }
  if (s.pending.length === 0) return finishEndTurn(s, {});
  return s;
}

/**
 * 턴 종료 2단계: 전투와 나머지 처리.
 * decisions: armyId → true(출격) / false(농성)
 */
export function finishEndTurn(prev: GameState, decisions: Record<string, boolean>): GameState {
  const s = prev.midTurn && prev.pending.length === 0 ? prev : cloneState(prev);
  s.pending = [];

  // 전투
  for (const a of [...s.armies]) {
    if (!s.armies.includes(a)) continue;
    if (a.retreating) continue;
    if (a.pathIndex < a.path.length - 1) continue; // 아직 가는 중
    const target = armyTarget(a);
    const city = s.cities[target];
    if (city.owner === a.nation) {
      mergeIntoCity(s, a, target);
      continue;
    }
    if (!a.engaged) {
      a.engaged = true;
      const name = CITY_BY_ID[target].name;
      let sortie: boolean;
      if (city.owner === s.player && decisions[a.id] !== undefined) sortie = decisions[a.id];
      else sortie = aiSortie(s, a);
      addLog(s, `${name}: ${nationName(city.owner)} ${sortie ? '출격' : '농성'}`);
      if (sortie && city.troops > 0) {
        const win = fieldBattle(s, a);
        if (!win) {
          startRetreat(s, a);
          continue;
        }
      }
      a.sieging = true;
    }
    siegeTurn(s, a);
  }

  // 지배력 퍼짐
  spreadControl(s);

  // 수입
  const autumn = s.season === 2;
  for (const c of Object.values(s.cities)) {
    const ratio = regionRatio(s, c.id);
    c.gold += Math.floor(c.commerce * (c.population / 1000) * ratio);
    if (autumn) {
      c.food += Math.floor(c.agri * (c.population / 200) * ratio * (0.7 + c.flood / 300));
    }
    c.food -= Math.ceil(c.troops / 20);
    if (c.food < 0) {
      c.food = 0;
      c.morale = clamp100(c.morale - 10);
      if (c.owner === s.player) addLog(s, `${CITY_BY_ID[c.id].name}: 군량이 모자라 민심이 떨어짐`);
    }
    if (c.morale < 30) c.population = Math.floor(c.population * 0.99);
  }
  if (autumn) addLog(s, '가을 수확이 들어왔다');

  // 계절 넘어감
  s.season = (s.season + 1) % 4;
  if (s.season === 0) s.year++;
  s.turn++;
  for (const o of Object.values(s.officers)) o.acted = false;
  s.midTurn = false;

  // 승패
  const mine = Object.values(s.cities).filter((c) => c.owner === s.player).length;
  if (mine === 0) {
    s.status = 'lost';
    addLog(s, `${nationName(s.player)}이(가) 멸망했다`);
  } else {
    const playableIds = new Set(NATIONS.filter((n) => n.playable).map((n) => n.id));
    // 다섯 나라의 처음 성(시작 때 주인이 플레이 가능 나라인 성)을 모두 차지
    const goal = Object.values(CITY_BY_ID).filter((c) => playableIds.has(c.owner));
    if (goal.every((c) => s.cities[c.id].owner === s.player)) {
      s.status = 'won';
      addLog(s, '삼한 일통! 천하를 통일했다');
    }
  }
  return s;
}
