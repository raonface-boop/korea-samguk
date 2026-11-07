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
  tickConvoys,
  clashPlace,
  clashTurn,
  typhoon,
  detectClashes,
} from './military';
import { runPosts, tickSecurity } from './domestic';
import { tickLoyalty, tickMoves } from './personnel';
import { checkRulerDeaths } from './succession';
import {
  Army,
  BattleDecision,
  BattleReportData,
  CITY_BY_ID,
  GameState,
  NATIONS,
  ARMS_KINDS,
  ARMS_PER_10K,
  ARMS_TO_WEAPONS,
  NEUTRAL,
  OFFICER_DATA_BY_ID,
  addLog,
  capitalOf,
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
    // 교전 중이면 움직이지 않음 (맞붙은 부대가 사라졌으면 풀림)
    if (a.clash) {
      if (s.armies.some((x) => x.id === a.clash)) continue;
      a.clash = null;
    }
    // '피함' 부대는 적을 만나면 한 턴 멈춤
    if (a.hold > 0) {
      a.hold--;
      continue;
    }
    const arrived = moveArmy(s, a);
    // 태풍 (바닷길 위 부대, 여름 25%·가을 10%)
    const storm = typhoon(s, a);
    if (storm && (a.nation === s.player)) {
      s.popups.push({
        kind: 'battle',
        report: {
          city: armyTarget(a),
          place: '바다 위',
          field: false,
          siege: false,
          attacker: { nation: a.nation, leader: a.officers[0] ?? null, before: a.troops, after: a.troops },
          defender: { nation: NEUTRAL, leader: null, before: 0, after: 0 },
          duel: null,
          fallen: false,
          captured: [],
          lines: [storm],
          result: '태풍',
        },
      });
    }
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
    // '대기' 부대는 성 밖에 머물며 공격하지 않음
    if (a.order?.arrive === 'wait') continue;
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

  // 길 위 교전: 새로 맞붙은 부대를 찾고, 맞붙은 부대마다 한 턴 싸움
  detectClashes(s);
  const doneClash = new Set<string>();
  for (const a of [...s.armies]) {
    if (!a.clash || doneClash.has(a.id) || !s.armies.includes(a)) continue;
    const b = s.armies.find((x) => x.id === a.clash);
    if (!b) {
      a.clash = null;
      continue;
    }
    doneClash.add(a.id);
    doneClash.add(b.id);
    const involved = a.nation === s.player || b.nation === s.player;
    const rep: BattleReportData = {
      city: armyTarget(a),
      place: clashPlace(a),
      clash: true,
      field: true,
      siege: false,
      attacker: { nation: a.nation, leader: a.officers[0] ?? null, before: a.troops, after: a.troops },
      defender: { nation: b.nation, leader: b.officers[0] ?? null, before: b.troops, after: b.troops },
      duel: null,
      fallen: false,
      captured: [],
      lines: [],
    };
    clashTurn(s, a, b, rep);
    rep.attacker.after = s.armies.includes(a) ? a.troops : 0;
    rep.defender.after = s.armies.includes(b) ? b.troops : 0;
    if (involved) s.popups.push({ kind: 'battle', report: rep });
  }

  // 전투
  for (const a of [...s.armies]) {
    if (!s.armies.includes(a)) continue;
    if (a.retreating || a.clash) continue;
    if (a.pathIndex < a.path.length - 1) continue;
    const target = armyTarget(a);
    const city = s.cities[target];
    if (city.owner === a.nation) {
      mergeIntoCity(s, a, target);
      continue;
    }
    // '대기' 부대는 성 밖에서 기다림
    if (a.order?.arrive === 'wait') continue;
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
          rep.result = '패배';
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

  // 장수 이동, 이동·수송 행렬
  tickMoves(s);
  tickConvoys(s);

  // 담당관 자동 내정, 치안, 무기 산지
  for (const c of Object.values(s.cities)) {
    if (c.owner !== NEUTRAL) runPosts(s, c.id);
    tickSecurity(s, c.id);
    produceArms(s, c.id);
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
  tickLoyalty(s);
  tickTreaties(s);

  // 계절 넘어감 (봄이 되면 새 해: 등장 해가 된 장수 출사)
  s.season = (s.season + 1) % 4;
  if (s.season === 0) {
    s.year++;
    debutOfficers(s);
  }
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

/** 등장 해가 된 장수 출사: 나라가 있으면 그 나라 장수(데이터의 성이 그 나라 땅이면 거기, 아니면 도읍), 망했으면 그 성에 재야 */
export function debutOfficers(s: GameState) {
  for (const o of Object.values(s.officers)) {
    if (o.status !== 'unborn') continue;
    const d = OFFICER_DATA_BY_ID[o.id];
    if ((d?.debut ?? 0) > s.year) continue;
    const home = d?.city ?? null;
    const alive = o.nation !== NEUTRAL && Object.values(s.cities).some((c) => c.owner === o.nation);
    if (alive) {
      o.status = 'active';
      o.city = home && s.cities[home]?.owner === o.nation ? home : nearestCityOf(s, o.nation, home) ?? capitalOf(s, o.nation);
      if (!o.city) {
        o.status = 'ronin';
        o.nation = NEUTRAL;
        o.foundBy = [];
        o.city = home;
      }
    } else {
      o.status = 'ronin';
      o.nation = NEUTRAL;
      o.foundBy = [];
      o.city = home;
    }
    o.acted = false;
    addLog(s, `${officerName(o.id)}, 출사`);
  }
}

/** 매 턴 무기 산지: 주산지 인구 1만 명당 150, 조금 50 (철은 창 2/3 · 철갑 1/3) */
function produceArms(s: GameState, cityId: string) {
  const arms = CITY_BY_ID[cityId].arms;
  if (!arms) return;
  const c = s.cities[cityId];
  for (const a of ARMS_KINDS) {
    const lv = arms[a];
    if (!lv) continue;
    const n = (c.population / 10000) * ARMS_PER_10K[lv];
    for (const [w, f] of ARMS_TO_WEAPONS[a]) c.weapons[w] += Math.floor(n * f);
  }
}

/** 그 나라 성 가운데 데이터의 성에서 가장 가까운 성 */
function nearestCityOf(s: GameState, nation: string, home: string | null): string | null {
  const h = home ? CITY_BY_ID[home] : null;
  if (!h) return null;
  let best: string | null = null;
  let bd = Infinity;
  for (const c of Object.values(s.cities)) {
    if (c.owner !== nation) continue;
    const d = Math.hypot(CITY_BY_ID[c.id].x - h.x, CITY_BY_ID[c.id].y - h.y);
    if (d < bd) {
      bd = d;
      best = c.id;
    }
  }
  return best;
}
