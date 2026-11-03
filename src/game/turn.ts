// 턴 진행
// 순서: 컴퓨터 나라 행동 → 부대 이동 → 전투 → 지배력 퍼짐 → 수입 → 계절 넘어감 → (새 턴 시작) 이벤트·계승
import { runAI } from './ai';
import { regionRatio, spreadControl } from './control';
import { tickTreaties } from './diplomacy';
import { canDuel, runDuel } from './duel';
import { checkEvents } from './events';
import {
  aiSortie,
  armyEat,
  armyTarget,
  captureOfficer,
  defenderLeader,
  fieldBattle,
  killOfficer,
  mergeIntoCity,
  moveArmy,
  siegeTurn,
  startRetreat,
} from './military';
import { tickLoyalty, tickMoves } from './personnel';
import { checkRulerDeaths } from './succession';
import {
  Army,
  BattleDecision,
  BattleReportData,
  CITY_BY_ID,
  GameState,
  NATIONS,
  NEUTRAL,
  addLog,
  clamp100,
  cloneState,
  nationName,
  officerName,
} from './state';

/**
 * 턴 종료 1단계: 컴퓨터 행동과 부대 이동.
 * 내 나라가 낀 전투에서 고를 것이 있으면 state.pending 에 쌓고 멈춘다.
 */
export function beginEndTurn(prev: GameState): GameState {
  const s = cloneState(prev);
  if (s.status !== 'playing' || s.midTurn) return s;
  s.midTurn = true;
  s.alerts = [];
  s.popups = [];
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
      startRetreat(s, a);
      continue;
    }
    if (a.engaged) continue;
    const atkLead = a.officers[0] ?? null;
    const defLead = defenderLeader(s, target);
    if (city.owner === s.player) {
      s.pending.push({ armyId: a.id, cityId: target, defense: true, duelOffer: canDuel(atkLead, defLead), aiSortie: false });
    } else if (a.nation === s.player) {
      const sortie = aiSortie(s, a) && city.troops > 0;
      if (sortie && canDuel(atkLead, defLead)) {
        s.pending.push({ armyId: a.id, cityId: target, defense: false, duelOffer: true, aiSortie: true });
      }
    }
  }
  if (s.pending.length === 0) return finishEndTurn(s, {});
  return s;
}

function newReport(s: GameState, a: Army): BattleReportData {
  const target = armyTarget(a);
  const c = s.cities[target];
  return {
    city: target,
    field: false,
    siege: false,
    attacker: { nation: a.nation, leader: a.officers[0] ?? null, before: a.troops, after: a.troops },
    defender: { nation: c.owner, leader: defenderLeader(s, target), before: c.troops, after: c.troops },
    duel: null,
    fallen: false,
    captured: [],
    lines: [],
  };
}

/** 일기토 처리. 공격·수비 전투력 보정을 돌려줌 */
function handleDuel(s: GameState, a: Army, involved: boolean, rep: BattleReportData): { atk: number; def: number } {
  const target = armyTarget(a);
  const atkLead = a.officers[0]!;
  const defLead = defenderLeader(s, target)!;
  const defNation = s.cities[target].owner;
  const d = runDuel({ id: atkLead, nation: a.nation }, { id: defLead, nation: defNation }, target);
  const atkWon = d.winner === 'a';
  const loser = atkWon ? defLead : atkLead;
  const winNation = atkWon ? a.nation : defNation;
  let extra = '';
  const r = Math.random();
  if (r < 0.05) {
    extra = `, ${officerName(loser)} 전사`;
    d.outcome += extra;
    if (involved) s.popups.push({ kind: 'duel', duel: d });
    killOfficer(s, loser);
  } else if (r < 0.35 && !(atkWon && defNation === NEUTRAL)) {
    extra = `, ${officerName(loser)} 사로잡힘`;
    d.outcome += extra;
    if (involved) s.popups.push({ kind: 'duel', duel: d });
    captureOfficer(s, loser, winNation, atkWon ? null : target, rep);
  } else if (involved) {
    s.popups.push({ kind: 'duel', duel: d });
  }
  const line = `${CITY_BY_ID[target].name} 일기토: ${officerName(atkLead)} 대 ${officerName(defLead)} — ${d.outcome}`;
  addLog(s, line);
  rep.duel = d.outcome;
  rep.lines.push(line);
  return atkWon ? { atk: 1.2, def: 0.8 } : { atk: 0.8, def: 1.2 };
}

/**
 * 턴 종료 2단계: 전투와 나머지 처리.
 * decisions: armyId → 출격 여부, 일기토 여부
 */
export function finishEndTurn(prev: GameState, decisions: Record<string, BattleDecision>): GameState {
  const s = prev.midTurn && prev.pending.length === 0 ? prev : cloneState(prev);
  const pending = s.pending;
  s.pending = [];

  // 전투
  for (const a of [...s.armies]) {
    if (!s.armies.includes(a)) continue;
    if (a.retreating) continue;
    if (a.pathIndex < a.path.length - 1) continue;
    const target = armyTarget(a);
    const city = s.cities[target];
    if (city.owner === a.nation) {
      mergeIntoCity(s, a, target);
      continue;
    }
    const involved = a.nation === s.player || city.owner === s.player;
    const rep = newReport(s, a);
    const p = pending.find((x) => x.armyId === a.id);
    const dec = decisions[a.id] ?? {};
    let retreated = false;
    if (!a.engaged) {
      a.engaged = true;
      const name = CITY_BY_ID[target].name;
      let sortie: boolean;
      if (city.owner === s.player) sortie = dec.sortie ?? false;
      else sortie = p ? p.aiSortie : aiSortie(s, a);
      addLog(s, `${name}: ${nationName(city.owner)} ${sortie ? '출격' : '농성'}`);
      if (sortie && city.troops > 0) {
        rep.field = true;
        let mods = { atk: 1, def: 1 };
        const atkLead = a.officers[0] ?? null;
        const defLead = defenderLeader(s, target);
        if (canDuel(atkLead, defLead)) {
          const want = involved ? !!dec.duel : Math.random() < 0.3;
          if (want) mods = handleDuel(s, a, involved, rep);
        }
        const win = fieldBattle(s, a, mods, rep);
        if (!win) {
          startRetreat(s, a);
          retreated = true;
        }
      }
      if (!retreated) a.sieging = true;
    }
    if (!retreated && s.armies.includes(a)) {
      rep.siege = true;
      siegeTurn(s, a, rep);
    }
    rep.attacker.after = a.troops;
    rep.defender.after = rep.fallen ? 0 : s.cities[target].troops;
    if (involved) s.popups.push({ kind: 'battle', report: rep });
  }

  // 장수 이동
  tickMoves(s);

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
  tickLoyalty(s);
  tickTreaties(s);

  // 계절 넘어감
  s.season = (s.season + 1) % 4;
  if (s.season === 0) s.year++;
  s.turn++;
  for (const o of Object.values(s.officers)) o.acted = false;
  s.midTurn = false;

  // 새 턴 시작: 군주 사망, 역사 이벤트
  checkRulerDeaths(s);
  checkEvents(s);

  // 승패
  const mine = Object.values(s.cities).filter((c) => c.owner === s.player).length;
  if (mine === 0) {
    s.status = 'lost';
    addLog(s, `${nationName(s.player)}이(가) 멸망했다`);
  } else {
    const playableIds = new Set(NATIONS.filter((n) => n.playable).map((n) => n.id));
    const goal = Object.values(CITY_BY_ID).filter((c) => playableIds.has(c.owner));
    if (goal.every((c) => s.cities[c.id].owner === s.player)) {
      s.status = 'won';
      addLog(s, '삼한 일통! 천하를 통일했다');
    }
  }
  return s;
}

/** 새 게임 첫 턴 시작 처리(346년 봄 이벤트 등) */
export function startFirstTurn(s: GameState): GameState {
  checkEvents(s);
  return s;
}
