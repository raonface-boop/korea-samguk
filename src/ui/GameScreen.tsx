import { useEffect, useRef, useState } from 'react';
import {
  APT_KEYS,
  APT_NEED,
  AptKey,
  BattleDecision,
  aptAtCap,
  aptOf,
  bindStatBonuses,
  CITIES,
  CITY_BY_ID,
  GameState,
  NATION_BY_ID,
  NEUTRAL,
  OFFICERS,
  UNIT_NAME,
  addLog,
  capitalOf,
  cloneState,
  dateLabel,
  governorOf,
  nationColor,
  nationName,
  officerName,
  officersInCity,
  rulerOf,
  stat,
} from '../game/state';
import {
  APT_NAME,
  MarchOrder,
  armyAttack,
  armyDefense,
  armyTarget,
  armyTurnsLeft,
  createArmy,
  defenderLeader,
  SHIP_COST,
  buildShips,
  convoyTurns,
  reachableTargets,
  researchStatus,
  retreatToOrigin,
} from '../game/military';
import { APT_TRAIN_COST, aptTrainGain, availableOfficers, doAptTrain, doResearch, researchBlock, researchGain, researchPlan } from '../game/domestic';
import ArmyInfo from './ArmyInfo';
import { aiLevelOf } from '../game/ai';
import { DiploCommand } from '../game/diplomacy';
import { beginEndTurn, finishEndTurn } from '../game/turn';
import { Settings, saveGame } from '../game/save';
import { sound } from '../audio/sound';
import MapView, { ArmySnap, IMG_H, IMG_W, START_ZOOM, armyDrawPos, clampView, snapArmies } from './MapView';
import MiniMap from './MiniMap';
import Portrait from './Portrait';
import { CityDetailWindow, CityInfoWindow } from './CityPanel';
import CommandSheet, { ConvoySheet, SheetCmd } from './CommandSheet';
import MarchSheet, { originsFor } from './MarchSheet';
import CityMenu, { CityMenuAction } from './CityMenu';
import PostsSheet, { PostsTable } from './PostsSheet';
import { APT_COLOR, OfficerDetail, OfficerList } from './OfficerViews';
import DiplomacySheet, { NationInfo } from './DiplomacySheet';
import PrisonerSheet from './PrisonerSheet';
import SettingsSheet from './SettingsSheet';
import EventDialog from './EventDialog';
import DuelView from './DuelView';
import BattleReport from './BattleReport';
import RightPanel from './RightPanel';
import CommandMenu, { CmdGroup, CmdItem } from './CommandMenu';
import MessageBox, { Message } from './MessageBox';
import { MapViewState } from './MiniMap';
import { BarView } from './CityBars';
import { L } from './Stage';

/** 남의 성을 고른 동안에도 되는 명령 */
const FOREIGN_OK = new Set(['endTurn', 'open:settings', 'open:nations', 'list:fiefs', 'open:postsTable', 'info:enemyCity']);

/** 턴 종료 부대 이동 모습 길이 */
const ANIM_MS = 1600;
const MINIMAP_W = 200;

interface Props {
  game: GameState;
  setGame: (s: GameState) => void;
  onRestart: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
}

type Cmd =
  | { kind: 'sheet'; sheet: SheetCmd; conscript?: boolean }
  | { kind: 'marchPick'; origin: string }
  | { kind: 'march'; origin: string; target: string | null }
  | { kind: 'appoint'; city: string }
  | { kind: 'allyPick'; purpose: '이동' | '수송' }
  | { kind: 'convoy'; purpose: '이동' | '수송'; target: string }
  | { kind: 'posts' }
  | { kind: 'postsTable' }
  | { kind: 'shipbuild' }
  | { kind: 'prisoner' }
  | { kind: 'diplomacy'; initial: DiploCommand }
  | { kind: 'fiefs' }
  | { kind: 'spy' }
  | { kind: 'spyCity'; id: string }
  | { kind: 'research' }
  | { kind: 'aptTrain' };

/** commands.json 의 sheet:X 이름 → 기존 CommandSheet 명령 */
const SHEET_ALIAS: Record<string, SheetCmd> = { wall: 'fortify' };

// 말머리 장수 이름 → id (긴 이름 먼저)
const NAMES = OFFICERS.map((o) => [o.name, o.id] as const).sort((a, b) => b[0].length - a[0].length);
function speakerOf(msg: string): string | null {
  for (const [name, id] of NAMES) if (name && msg.startsWith(name)) return id;
  return null;
}

function firstCity(game: GameState): string {
  return capitalOf(game, game.player) ?? CITIES.find((c) => game.cities[c.id].owner === game.player)?.id ?? CITIES[0].id;
}

function centerOn(cityId: string, s: number): MapViewState {
  const c = CITY_BY_ID[cityId];
  return clampView({ s, x: L.map.w / 2 - c.x * s, y: L.map.viewBottom / 2 - c.y * s });
}

export default function GameScreen({ game, setGame, onRestart, settings, onSettings }: Props) {
  // stat() 이 지금 게임의 적성 능력치 보너스를 쓰도록
  bindStatBonuses(game);
  const [city, setCity] = useState<string>(() => firstCity(game));
  const [cmd, setCmd] = useState<Cmd | null>(null);
  const [group, setGroup] = useState<CmdGroup | null>(null);
  const [officer, setOfficer] = useState<string | null>(null);
  const [armyInfo, setArmyInfo] = useState<string | null>(null);
  const [isFull, setIsFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  /** 폰에서 전체 화면 + 가로 고정 (안 되면 조용히 넘어감). 전체 화면일 때 누르면 빠져나옴 */
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      return;
    }
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o.lock?.('landscape');
    } catch {
      /* 가로 고정을 못 하는 기기 */
    }
  };
  const marchTarget = cmd?.kind === 'march' ? cmd.target : null;
  const marchOrigin = cmd?.kind === 'marchPick' || cmd?.kind === 'march' ? cmd.origin : null;
  const [cityMenu, setCityMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [brSeen, setBrSeen] = useState(0);
  // 전투 결과 창이 다 닫히면 순번을 처음으로
  const battleLeft = game.popups.some((p) => p.kind === 'battle');
  useEffect(() => {
    if (!battleLeft) setBrSeen(0);
  }, [battleLeft]);
  const [armyPopup, setArmyPopup] = useState<string | null>(null);
  const [aptOfficer, setAptOfficer] = useState<string | null>(null);
  const [aptKey, setAptKey] = useState<AptKey>('창');
  // 턴 종료 부대 이동 모습 (1.6초)
  const [anim, setAnim] = useState<{ prev: Record<string, ArmySnap>; t: number } | null>(null);
  const animRef = useRef<number | null>(null);
  const playMoves = (prev: Record<string, ArmySnap>) => {
    if (settings.fast) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ANIM_MS);
      setAnim(t >= 1 ? null : { prev, t });
      animRef.current = t >= 1 ? null : requestAnimationFrame(step);
    };
    setAnim({ prev, t: 0 });
    animRef.current = requestAnimationFrame(step);
  };
  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);
  const [researcher, setResearcher] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [showNations, setShowNations] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, BattleDecision>>({});
  const [alertsHidden, setAlertsHidden] = useState(false);
  const [view, setView] = useState<MapViewState>(() => centerOn(firstCity(game), START_ZOOM));
  const [barView, setBarView] = useState<BarView | null>(null);
  const [cityWin, setCityWin] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [hint, setHint] = useState<CmdItem | null>(null);
  const [battle, setBattle] = useState<{ turn: number; cities: string[] }>({ turn: game.turn, cities: [] });

  const nation = NATION_BY_ID[game.player];
  const ruler = rulerOf(game, game.player);
  const popup = game.popups[0] ?? null;
  const busy = game.midTurn || game.status !== 'playing';
  const selCity = game.cities[city] ? city : firstCity(game);
  const mineSel = game.cities[selCity].owner === game.player;

  // 배경음악: 전투 결과·일기토 창이 떠 있으면 전투 음악
  useEffect(() => {
    sound.setMode(popup && (popup.kind === 'duel' || popup.kind === 'battle') ? 'battle' : 'map');
  }, [popup]);

  // 그 턴에 전투가 벌어진 성 (칼 그림)
  useEffect(() => {
    const now = new Set<string>();
    for (const p of game.popups) {
      if (p.kind === 'battle') now.add(p.report.city);
      if (p.kind === 'duel') now.add(p.duel.city);
    }
    for (const p of game.pending) now.add(p.cityId);
    setBattle((b) => {
      if (b.turn !== game.turn) return { turn: game.turn, cities: [...now] };
      const merged = new Set([...b.cities, ...now]);
      return merged.size === b.cities.length ? b : { turn: b.turn, cities: [...merged] };
    });
  }, [game]);

  const say = (text: string, speaker: string | null = null) => {
    const sp = speaker ?? speakerOf(text) ?? governorOf(game, selCity)?.id ?? ruler?.id ?? null;
    const n = sp ? (game.officers[sp]?.nation ?? game.player) : game.player;
    setMessage({ text, speaker: sp, nation: n, key: Date.now() });
  };

  const commit = (s: GameState, save = false) => {
    if (save && settings.autosave) saveGame(s);
    setGame(s);
  };

  const afterTurnSounds = (s: GameState) => {
    if (s.alerts.length) window.setTimeout(() => sound.play('warn'), 900);
    const conquered = s.popups.some((p) => p.kind === 'battle' && p.report.fallen && p.report.attacker.nation === s.player);
    if (conquered) window.setTimeout(() => sound.play('fanfare'), 1400);
  };

  /** 턴 사이에 새로 쌓인 기록을 대화창에 */
  const sayNewLog = (before: GameState, after: GameState) => {
    const added = after.log.length > before.log.length ? after.log.slice(before.log.length) : after.log.slice(-3);
    if (added.length) say(added.slice(-3).join(' '), rulerOf(after, after.player)?.id ?? null);
    else setMessage(null);
  };

  const endTurn = () => {
    setCmd(null);
    closeGroup();
    setArmyPopup(null);
    sound.play('gong');
    const before = snapArmies(game.armies);
    const s = beginEndTurn(game);
    playMoves(before);
    setDecisions({});
    setAlertsHidden(false);
    if (settings.fast) s.popups = s.popups.filter((p) => p.kind !== 'battle');
    commit(s, !s.midTurn);
    if (!s.midTurn) {
      afterTurnSounds(s);
      sayNewLog(game, s);
    } else if (s.pending.some((p) => p.defense)) sound.play('warn');
  };

  const resolvePending = () => {
    const before = snapArmies(game.armies);
    const s = finishEndTurn(game, decisions);
    playMoves(before);
    setDecisions({});
    if (settings.fast) s.popups = s.popups.filter((p) => p.kind !== 'battle');
    commit(s, true);
    afterTurnSounds(s);
    sayNewLog(game, s);
  };

  /** 명령 실행: 상태를 복사해 바꾸고 결과를 사건 기록과 대화창에 */
  const run = (fn: (s: GameState) => string | null) => {
    const s = cloneState(game);
    const msg = fn(s);
    const text = msg ?? '명령을 실행할 수 없사옵니다';
    if (msg) {
      if (!s.log[s.log.length - 1]?.endsWith(msg)) addLog(s, msg);
    } else addLog(s, '명령을 실행할 수 없습니다');
    if (cmd?.kind !== 'prisoner') setCmd(null);
    commit(s);
    say(text);
  };

  const doMarch = (order: MarchOrder) => {
    const s = cloneState(game);
    const gov = governorOf(game, order.cityId)?.id ?? null;
    const a = createArmy(s, order);
    if (!a) {
      addLog(s, '출진할 수 없습니다 (경로나 병력을 확인하시오)');
      say('출진할 수 없사옵니다. 경로나 병력을 살피소서');
    } else {
      sound.play('march');
      say(`${officerName(a[0].officers[0] ?? order.units[0].officer)}: ${CITY_BY_ID[order.target].name}(으)로 출진하옵니다!${a.length > 1 ? ` (${a.length}부대)` : ''}`);
    }
    // 출발 성의 태수가 출진하면 새 태수 임명
    const left = officersInCity(s, order.cityId).filter((o) => o.nation === s.player);
    const govLeft = !gov || s.officers[gov]?.city === order.cityId;
    if (a && !govLeft) s.cities[order.cityId].governor = null;
    if (a && !govLeft && left.length) setCmd({ kind: 'appoint', city: order.cityId });
    else setCmd(null);
    commit(s);
  };

  const jump = (mx: number, my: number) => setView((v) => clampView({ ...v, x: L.map.w / 2 - mx * v.s, y: L.map.viewBottom / 2 - my * v.s }));
  const selectCity = (id: string) => {
    if (cmd?.kind === 'marchPick') {
      if (id === cmd.origin) return;
      if (game.cities[id].owner === game.player) return say('아군 성입니다 — 이동·수송을 쓰십시오');
      if (!reachableTargets(game, cmd.origin, game.player).includes(id)) return say(`${CITY_BY_ID[id].name}(으)로는 갈 수 없사옵니다`);
      return setCmd({ kind: 'march', origin: cmd.origin, target: id });
    }
    if (cmd?.kind === 'march') return;
    if (cmd?.kind === 'allyPick') {
      if (id === selCity) return;
      if (game.cities[id].owner !== game.player) return say(`${CITY_BY_ID[id].name}은(는) 우리 성이 아닙니다`);
      if (!convoyTurns(game, selCity, id)) return say(`${CITY_BY_ID[id].name}(으)로 가는 아군 길이 없사옵니다`);
      return setCmd({ kind: 'convoy', purpose: cmd.purpose, target: id });
    }
    if (cmd?.kind === 'spy') {
      if (game.cities[id].owner !== game.player) setCmd({ kind: 'spyCity', id });
      return;
    }
    setCity(id);
    // 성 옆 작은 메뉴
    if (!cmd && !busy && !anim) {
      const c = CITY_BY_ID[id];
      const x = Math.min(L.map.x + L.map.w - 150, Math.max(8, L.map.x + c.x * view.s + view.x + 30));
      const y = Math.min(L.map.viewBottom - 200, Math.max(8, L.map.y + c.y * view.s + view.y - 30));
      setCityMenu({ id, x, y });
    }
  };

  /** 성 메뉴에서 고름 */
  const onCityMenu = (a: CityMenuAction) => {
    const id = cityMenu?.id;
    setCityMenu(null);
    if (!id) return;
    if (a === '출병') {
      if (busy) return;
      const from = originsFor(game, id)[0]?.id;
      if (!from) return say('출병할 수 있는 성이 없습니다');
      setCity(from);
      return setCmd({ kind: 'march', origin: from, target: id });
    }
    if (a === '정보') return setCmd({ kind: 'spyCity', id });
    if (a === '도시정보') return setCityWin(true);
    if (a === '담당관') return setCmd({ kind: 'posts' });
    // 축성은 명령판의 '축성'(sheet:wall)과 똑같이
    if (a === '축성') return onAction({ label: '축성', action: 'sheet:wall' });
    if (busy) return;
    if (a === '출진') return setCmd({ kind: 'march', origin: id, target: null });
    if (a === '이동' || a === '수송') {
      say(`${a}할 아군 성을 선택하십시오.`);
      return setCmd({ kind: 'allyPick', purpose: a });
    }
  };

  /** 성 명령은 내 성에서만 */
  const needMine = () => {
    if (mineSel) return true;
    say(`${CITY_BY_ID[selCity].name}은(는) 우리 성이 아니옵니다. 먼저 내 성을 고르소서`, ruler?.id ?? null);
    return false;
  };

  const onAction = (item: CmdItem) => {
    const a = item.action;
    closeGroup();
    // 남의 성을 고른 동안에는 성 명령을 못 함
    if (!mineSel && !FOREIGN_OK.has(a) && !a.startsWith('view:')) return say(`${CITY_BY_ID[selCity].name}은(는) 우리 성이 아닙니다`);
    if (a === 'todo') return say(`${item.label}: ${item.desc ? item.desc + ' — ' : ''}아직 준비 중이옵니다`);
    if (a === 'endTurn') return endTurn();
    if (a === 'open:settings') return setShowSettings(true);
    if (a === 'open:nations') return setShowNations(true);
    if (a === 'open:prisoner') return setCmd({ kind: 'prisoner' });
    if (a === 'open:aptTrain') {
      if (!needMine()) return;
      setAptOfficer(availableOfficers(game, selCity)[0]?.id ?? null);
      return setCmd({ kind: 'aptTrain' });
    }
    if (a === 'open:research') {
      if (!needMine()) return;
      // 병기 연구는 도읍에서 군주만
      setResearcher(availableOfficers(game, selCity).find((o) => o.rank === '군주')?.id ?? null);
      return setCmd({ kind: 'research' });
    }
    if (a === 'list:fiefs') return setCmd({ kind: 'fiefs' });
    if (busy) return;
    if (a === 'open:march') {
      if (!needMine()) return;
      return setCmd({ kind: 'march', origin: selCity, target: null });
    }
    if (a === 'pick:move' || a === 'pick:transport') {
      if (!needMine()) return;
      const purpose = a === 'pick:move' ? '이동' : '수송';
      say(`${purpose}할 아군 성을 선택하십시오.`);
      return setCmd({ kind: 'allyPick', purpose });
    }
    if (a === 'open:posts') return needMine() && setCmd({ kind: 'posts' });
    if (a === 'open:shipbuild') {
      if (!needMine()) return;
      if (!CITY_BY_ID[selCity].port) return say(`${CITY_BY_ID[selCity].name}은(는) 항구가 아니옵니다`);
      return setCmd({ kind: 'shipbuild' });
    }
    if (a === 'open:postsTable') return setCmd({ kind: 'postsTable' });
    if (a.startsWith('open:diplomacy')) {
      const cap = capitalOf(game, game.player);
      if (!cap) return say('외교를 펼 도읍이 없사옵니다');
      const initial = (a.split(':')[2] ?? 'goodwill') as DiploCommand;
      return setCmd({ kind: 'diplomacy', initial });
    }
    if (a === 'info:enemyCity') return setCmd({ kind: 'spy' });
    if (a.startsWith('sheet:')) {
      if (!needMine()) return;
      const [, name, sub] = a.split(':');
      const sheet = SHEET_ALIAS[name] ?? (name as SheetCmd);
      return setCmd({ kind: 'sheet', sheet, conscript: sub ? sub === 'conscript' : undefined });
    }
  };

  const closePopup = () => setGame({ ...game, popups: game.popups.slice(1) });
  const setDec = (id: string, d: BattleDecision) => setDecisions({ ...decisions, [id]: { ...decisions[id], ...d } });

  const closeGroup = () => {
    setGroup(null);
    setHint(null);
  };
  const openGroup = (g: CmdGroup) => {
    if (group === g) return closeGroup();
    if (!mineSel) return say(`${CITY_BY_ID[selCity].name}은(는) 우리 성이 아닙니다`);
    setGroup(g);
    setHint(null);
    setMessage(null);
  };
  const shownMessage: Message | null = hint
    ? { text: hint.desc || hint.label, speaker: null, nation: game.player, key: hint.label.length, instant: true }
    : group
      ? null
      : message;

  const idle = group ? `${group.label}, 무엇을 하시겠사옵니까?` : `${ruler ? officerName(ruler.id) : nation.name}님, ${CITY_BY_ID[selCity].name}에 무엇을 명하시겠사옵니까?`;
  const capital = capitalOf(game, game.player);
  const fiefs = Object.values(game.cities).filter((c) => c.owner === game.player && c.id !== capital);
  const enemies = Object.values(game.cities).filter((c) => c.owner !== game.player);

  return (
    <div className={`game ${mineSel ? '' : 'foreign'}`}>
      <MapView
        game={game}
        marchFrom={marchOrigin}
        marchTarget={marchTarget}
        onArmyClick={setArmyPopup}
        anim={anim}
        selected={selCity}
        onSelectCity={selectCity}
        view={view}
        setView={setView}
        barView={barView}
        battleCities={battle.cities}
        onMessageClick={() => setLogOpen((v) => !v)}
      />
      {/* 전체 화면 (확대·축소 버튼 옆) */}
      <button
        className="btn jua fullscreen-btn"
        style={{ left: L.map.x + 14 + 46, top: L.map.viewBottom - 12 - 40 }}
        aria-label={isFull ? '전체 화면 나가기' : '전체 화면'}
        title={isFull ? '전체 화면 나가기' : '전체 화면'}
        onClick={toggleFullscreen}
      >
        ⛶
      </button>
      <MessageBox message={shownMessage} idle={idle} fast={settings.fast} logOpen={logOpen} log={game.log} onCloseLog={() => setLogOpen(false)} />

      {game.alerts.length > 0 && !alertsHidden && (
        <div className="alerts frame" onClick={() => setAlertsHidden(true)}>
          {game.alerts.map((a, i) => (
            <div key={i}>⚠ {a}</div>
          ))}
          <div className="small">눌러서 닫기</div>
        </div>
      )}

      <RightPanel
        game={game}
        city={selCity}
        barView={barView}
        setBarView={setBarView}
        openGroup={group}
        onGroup={openGroup}
        onAction={onAction}
        onOpenCity={() => setCityWin(true)}
        onOpenOfficer={setOfficer}
      />
      {cityWin && (
        <CityDetailWindow
          key={selCity}
          game={game}
          cityId={selCity}
          onClose={() => setCityWin(false)}
          onOfficer={setOfficer}
          onAllOfficers={() => setShowList(true)}
        />
      )}

      {group && <CommandMenu group={group} onPick={onAction} onCancel={closeGroup} onHint={setHint} />}

      {cmd?.kind === 'sheet' && (
        <CommandSheet
          key={selCity + cmd.sheet + String(cmd.conscript)}
          game={game}
          cityId={selCity}
          cmd={cmd.sheet}
          initialConscript={cmd.conscript ?? true}
          onCancel={() => setCmd(null)}
          onRun={run}
        />
      )}
      {(cmd?.kind === 'marchPick' || cmd?.kind === 'allyPick') && (
        <div className="pick-banner jua" style={{ left: L.map.x + L.map.w / 2 }}>
          {cmd.kind === 'marchPick' ? '어느 성에 쳐들어가겠습니까? 지도에서 고르십시오.' : `${cmd.purpose}할 아군 성을 선택하십시오.`}
          <button className="btn" onClick={() => setCmd(null)}>
            취소
          </button>
        </div>
      )}
      {cmd?.kind === 'march' && (
        <MarchSheet
          key={`${cmd.origin}>${cmd.target}`}
          game={game}
          origin={cmd.origin}
          target={cmd.target}
          onCancel={() => setCmd(null)}
          onDone={doMarch}
          onPickOnMap={(origin) => setCmd({ kind: 'marchPick', origin })}
        />
      )}
      {cmd?.kind === 'appoint' && (() => {
        // 출발 성의 태수가 출진했을 때 새 태수 임명
        const list = officersInCity(game, cmd.city).filter((o) => o.nation === game.player);
        return (
          <div className="sheet frame jua">
            <div className="sheet-head">
              <span className="sheet-title">{CITY_BY_ID[cmd.city].name}의 태수를 임명해 주십시오</span>
            </div>
            <div className="sheet-body">
              <div className="picker">
                {list.map((o) => (
                  <button
                    key={o.id}
                    className="pick-row"
                    onClick={() => {
                      const s = cloneState(game);
                      s.cities[cmd.city].governor = o.id;
                      addLog(s, `${officerName(o.id)}, ${CITY_BY_ID[cmd.city].name} 태수가 되다`);
                      commit(s);
                      setCmd(null);
                    }}
                  >
                    <span className="pick-name">{officerName(o.id)}</span>
                    <span className="pick-stat">
                      통{stat(o.id, 'leadership')} 무{stat(o.id, 'war')} 지{stat(o.id, 'intelligence')} 정{stat(o.id, 'politics')} 매{stat(o.id, 'charm')}
                    </span>
                  </button>
                ))}
              </div>
              <div className="actions">
                <button className="btn" onClick={() => setCmd(null)}>
                  태수 없이 두기
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {cityMenu && <CityMenu game={game} cityId={cityMenu.id} x={cityMenu.x} y={cityMenu.y} onPick={onCityMenu} onClose={() => setCityMenu(null)} />}
      {cmd?.kind === 'convoy' && (
        <ConvoySheet key={cmd.target + cmd.purpose} game={game} cityId={selCity} target={cmd.target} kind={cmd.purpose} onCancel={() => setCmd(null)} onRun={run} />
      )}
      {cmd?.kind === 'posts' && (
        <PostsSheet
          game={game}
          cityId={selCity}
          onOpenTable={() => onAction({ label: '담당 상황표', action: 'open:postsTable' })}
          onClose={() => setCmd(null)}
          onCommit={(s, msg) => {
            addLog(s, msg);
            commit(s);
          }}
        />
      )}
      {cmd?.kind === 'postsTable' && <PostsTable game={game} onClose={() => setCmd(null)} />}
      {cmd?.kind === 'shipbuild' && (() => {
        const c = game.cities[selCity];
        const max = Math.floor(c.gold / SHIP_COST);
        return (
          <div className="sheet frame jua">
            <div className="sheet-head">
              <span className="sheet-title">{CITY_BY_ID[selCity].name} · 선박건조</span>
              <button className="btn close" onClick={() => setCmd(null)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="sheet-body">
              <div className="kv">
                지금 배 {c.ships ?? 0}척 (병사 {((c.ships ?? 0) * 100).toLocaleString()}명을 실음) · 금 {c.gold.toLocaleString()}
              </div>
              <div className="muted">배 한 척 금 {SHIP_COST}, 한 척에 병사 100명</div>
              <div className="seg wrap">
                {[5, 10, 20, 50].map((n) => (
                  <button key={n} className="btn" disabled={max < n} onClick={() => run((st) => buildShips(st, selCity, n))}>
                    {n}척 (금 {(n * SHIP_COST).toLocaleString()})
                  </button>
                ))}
              </div>
              <div className="actions">
                <button className="btn" onClick={() => setCmd(null)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {cmd?.kind === 'aptTrain' && (() => {
        const offs = availableOfficers(game, selCity);
        const gold = game.cities[selCity].gold;
        const capped = aptOfficer ? aptAtCap(game, aptOfficer, aptKey) : false;
        const warn = !aptOfficer ? '맡길 장수가 없습니다' : capped ? '한계에 이름' : gold < APT_TRAIN_COST ? `금 ${APT_TRAIN_COST}이 필요합니다` : null;
        return (
          <div className="sheet frame jua">
            <div className="sheet-head">
              <span className="sheet-title">적성 수련</span>
              <button className="btn close" onClick={() => setCmd(null)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="sheet-body">
              <div className="kv">
                <b>장수</b> <span className="muted">(금 {gold.toLocaleString()} · 한 번에 {APT_TRAIN_COST})</span>
              </div>
              <div className="picker">
                {offs.map((o) => (
                  <button key={o.id} className={`pick-row ${aptOfficer === o.id ? 'on' : ''}`} onClick={() => setAptOfficer(o.id)}>
                    <span className="pick-name">{officerName(o.id)}</span>
                    <span className="pick-stat">경험 +{aptTrainGain(o.id)}</span>
                  </button>
                ))}
                {!offs.length && <div className="muted">남는 장수가 없사옵니다</div>}
              </div>
              {aptOfficer && (
                <>
                  <div className="kv">
                    <b>계열</b>
                  </div>
                  <div className="seg wrap">
                    {APT_KEYS.map((k) => {
                      const g = aptOf(game, aptOfficer, k);
                      const cap = aptAtCap(game, aptOfficer, k);
                      return (
                        <button key={k} className={`btn ${aptKey === k ? 'on' : ''}`} disabled={cap} onClick={() => setAptKey(k)} title={cap ? '한계에 이름' : APT_NAME[k]}>
                          {APT_NAME[k]} <b style={{ color: APT_COLOR[g] }}>{g}</b>
                          {cap && <small> (한계에 이름)</small>}
                          {!cap && <small> {game.officers[aptOfficer]?.aptExp?.[k] ?? 0}/{APT_NEED[g]}</small>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {warn && <div className="warn">{warn}</div>}
              <div className="actions">
                <button className="btn" onClick={() => setCmd(null)}>
                  취소
                </button>
                <button className="btn btn-gold" disabled={!!warn} onClick={() => run((st) => doAptTrain(st, selCity, aptOfficer, aptKey))}>
                  수련
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {cmd?.kind === 'research' && (() => {
        const rs = researchStatus(game, game.player);
        const plan = researchPlan(game, game.player);
        const offs = availableOfficers(game, selCity).sort((x, y) => researchGain(y.id) - researchGain(x.id));
        const gold = game.cities[selCity].gold;
        const block = researchBlock(game, selCity, researcher ?? offs.find((o) => o.rank === '군주')?.id ?? null);
        const warn = block ?? (!researcher ? '맡길 장수가 없습니다' : gold < plan.cost ? `금 ${plan.cost.toLocaleString()}이 필요합니다` : null);
        return (
          <div className="sheet frame jua">
            <div className="sheet-head">
              <span className="sheet-title">병기 연구</span>
              <button className="btn close" onClick={() => setCmd(null)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="sheet-body">
              <div className="kv">
                <b>연구 점수</b> {rs.points}
                {plan.special || rs.special > 0 ? ` · 특수 ${rs.special}` : ''}
              </div>
              <div className="kv">
                <b>열린 병과</b> 보병·궁병·기병 {rs.text !== '기본 병과만' && `→ ${rs.text}`}
              </div>
              <div className="kv">
                <b>다음 단계</b> {rs.next ?? '모두 열림'}
              </div>
              <div className="kv">
                <b>{plan.special ? '특수 연구' : '연구'}</b> 금 {plan.cost.toLocaleString()} 소모 <span className="muted">(금 {gold.toLocaleString()})</span>
              </div>
              <div className="picker">
                {offs.map((o) => (
                  <button
                    key={o.id}
                    className={`pick-row ${researcher === o.id ? 'on' : ''}`}
                    disabled={o.rank !== '군주'}
                    title={o.rank !== '군주' ? '병기 연구는 군주만 할 수 있습니다' : undefined}
                    onClick={() => setResearcher(o.id)}
                  >
                    <span className="pick-name">{officerName(o.id)}</span>
                    <span className="pick-stat">+{researchGain(o.id)}점</span>
                  </button>
                ))}
                {!offs.length && <div className="muted">남는 장수가 없사옵니다</div>}
              </div>
              {warn && <div className="warn">{warn}</div>}
              <div className="actions">
                <button className="btn" onClick={() => setCmd(null)}>
                  취소
                </button>
                <button className="btn btn-gold" disabled={!!warn} onClick={() => run((st) => doResearch(st, selCity, researcher))}>
                  연구
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {armyInfo && (
        <ArmyInfo
          game={game}
          armyId={armyInfo}
          onClose={() => setArmyInfo(null)}
          onOpen={setArmyInfo}
          onSetOrder={(id, order) => {
            const s = cloneState(game);
            const x = s.armies.find((y) => y.id === id);
            if (!x) return;
            x.order = order;
            commit(s);
          }}
        />
      )}
      {armyPopup && (() => {
        // 부대 작은 창 (부대 옆)
        const a = game.armies.find((x) => x.id === armyPopup);
        if (!a) return null;
        const group = game.armies.filter((x) => x.nation === a.nation && x.origin === a.origin && armyTarget(x) === armyTarget(a));
        const lead = a.officers[0] ?? null;
        const troops = group.reduce((x, g) => x + g.troops, 0);
        const food = group.reduce((x, g) => x + g.food, 0);
        const eat = Math.max(1, Math.ceil(troops / 20));
        const avgAtk = group.reduce((x, g) => x + armyAttack(g, game), 0) / group.length;
        const avgDef = group.reduce((x, g) => x + armyDefense(g, game), 0) / group.length;
        const [mx, my] = armyDrawPos(a);
        const W = 250;
        const left = Math.min(L.map.x + L.map.w - W - 8, Math.max(8, L.map.x + mx * view.s + view.x + 24));
        const top = Math.min(L.map.viewBottom - 230, Math.max(8, L.map.y + my * view.s + view.y - 60));
        const mine = a.nation === game.player;
        return (
          <div className="army-popup frame jua" style={{ left, top, width: W }}>
            <div className="army-popup-head">
              {lead && <Portrait officerId={lead} nation={a.nation} kind="face" size={44} />}
              <div>
                <b>{lead ? officerName(lead) : '대장 없음'}</b>
                <div className="muted">{group.length > 1 ? `${group.length}부대 함께` : '한 부대'}</div>
              </div>
            </div>
            <div>병력 {troops.toLocaleString()}</div>
            <div>
              군량 {food.toLocaleString()} (약 {Math.floor(food / eat)}턴)
            </div>
            <div>
              평균 공격 {Math.round(avgAtk).toLocaleString()} · 평균 방어 {Math.round(avgDef).toLocaleString()}
            </div>
            <div>
              목표 {CITY_BY_ID[armyTarget(a)].name} · {a.sieging ? '공성 중' : armyTurnsLeft(a) > 0 ? `도착 ${armyTurnsLeft(a)}턴` : '도착'}
            </div>
            <div className="army-popup-btns">
              <button
                className="btn"
                onClick={() => {
                  setArmyInfo(a.id);
                  setArmyPopup(null);
                }}
              >
                부대 정보
              </button>
              {mine && !a.retreating && (
                <button
                  className="btn"
                  disabled={busy || !!anim}
                  onClick={() => {
                    run((st) => {
                      const ids = group.map((g) => g.id);
                      let n = 0;
                      for (const id of ids) if (retreatToOrigin(st, id)) n++;
                      return n ? `${CITY_BY_ID[a.origin].name}(으)로 퇴각 (${n}부대)` : null;
                    });
                    setArmyPopup(null);
                  }}
                >
                  퇴각
                </button>
              )}
              <button className="btn" onClick={() => setArmyPopup(null)}>
                닫기
              </button>
            </div>
          </div>
        );
      })()}
      {/* 작은 지도 (지도 칸 오른쪽 아래, 대화창 위) */}
      <MiniMap
        game={game}
        selected={selCity}
        view={view}
        onJump={jump}
        box={{ x: L.map.x + L.map.w - MINIMAP_W - 12, y: L.map.viewBottom - Math.round((MINIMAP_W * IMG_H) / IMG_W) - 8, w: MINIMAP_W, h: Math.round((MINIMAP_W * IMG_H) / IMG_W) }}
      />
      {/* 부대가 움직이는 동안 명령을 막음 */}
      {anim && <div className="anim-block" />}
      {cmd?.kind === 'diplomacy' && capital && (
        <DiplomacySheet game={game} cityId={capital} initialCmd={cmd.initial} onRun={run} onClose={() => setCmd(null)} />
      )}
      {cmd?.kind === 'prisoner' && <PrisonerSheet game={game} onRun={run} onClose={() => setCmd(null)} />}
      {cmd?.kind === 'fiefs' && (
        <div className="sheet frame">
          <div className="sheet-head">
            <span className="sheet-title">속령 일람</span>
            <button className="btn close" onClick={() => setCmd(null)} aria-label="닫기">
              ✕
            </button>
          </div>
          <div className="sheet-body">
            <div className="picker">
              {fiefs.map((c) => {
                const g = governorOf(game, c.id);
                return (
                  <button
                    key={c.id}
                    className="pick-row"
                    onClick={() => {
                      setCity(c.id);
                      jump(CITY_BY_ID[c.id].x, CITY_BY_ID[c.id].y);
                      setCmd(null);
                    }}
                  >
                    <span className="pick-name">{CITY_BY_ID[c.id].name}</span>
                    <span className="pick-stat">
                      태수 {g ? officerName(g.id) : '없음'} · 병력 {c.troops.toLocaleString()} · 금 {c.gold.toLocaleString()}
                    </span>
                  </button>
                );
              })}
              {!fiefs.length && <div className="muted">도읍 밖의 성이 없사옵니다</div>}
            </div>
          </div>
        </div>
      )}
      {cmd?.kind === 'spy' && (
        <div className="sheet frame">
          <div className="sheet-head">
            <span className="sheet-title">밀정 · 살필 성을 고르소서</span>
            <button className="btn close" onClick={() => setCmd(null)} aria-label="닫기">
              ✕
            </button>
          </div>
          <div className="sheet-body">
            <div className="muted">지도에서 적 성을 눌러도 됩니다</div>
            <div className="picker">
              {enemies.map((c) => (
                <button key={c.id} className="pick-row" onClick={() => setCmd({ kind: 'spyCity', id: c.id })}>
                  <span className="dot" style={{ background: nationColor(c.owner) }} />
                  <span className="pick-name">{CITY_BY_ID[c.id].name}</span>
                  <span className="pick-stat">{c.owner === NEUTRAL ? '중립' : nationName(c.owner)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {cmd?.kind === 'spyCity' && <CityInfoWindow game={game} cityId={cmd.id} onClose={() => setCmd(null)} onOfficer={setOfficer} />}

      {showList && <OfficerList game={game} onClose={() => setShowList(false)} onOpen={setOfficer} />}
      {showNations && <NationInfo game={game} onClose={() => setShowNations(false)} />}
      {officer && <OfficerDetail game={game} id={officer} onClose={() => setOfficer(null)} />}
      {showSettings && <SettingsSheet settings={settings} onChange={onSettings} onClose={() => setShowSettings(false)} onRestart={onRestart} aiLevelName={aiLevelOf(game).name} />}

      {game.pending.length > 0 && (
        <div className="modal-back">
          <div className="modal defense">
            <div className="sheet-title">{game.pending.some((p) => p.defense) ? '적이 쳐들어왔다!' : '적이 성 밖으로 나왔다'}</div>
            {game.pending.map((p) => {
              const a = game.armies.find((x) => x.id === p.armyId);
              if (!a) return null;
              const c = game.cities[p.cityId];
              const dec = decisions[p.armyId] ?? {};
              const sortie = dec.sortie ?? false;
              const duel = dec.duel ?? false;
              const atkLead = a.officers[0] ?? null;
              const defLead = defenderLeader(game, armyTarget(a));
              const myLead = p.defense ? defLead : atkLead;
              const foeLead = p.defense ? atkLead : defLead;
              return (
                <div key={p.armyId} className="defense-row">
                  <div>
                    <b>{CITY_BY_ID[p.cityId].name}</b> — {nationName(a.nation)} {atkLead ? officerName(atkLead) : ''} {UNIT_NAME[a.unitType]}{' '}
                    {a.troops.toLocaleString()} 대 {nationName(c.owner)} 수비 {c.troops.toLocaleString()}
                  </div>
                  {p.defense && (
                    <div className="seg">
                      <button className={`btn ${sortie ? 'on' : ''}`} onClick={() => setDec(p.armyId, { sortie: true })}>
                        출격
                      </button>
                      <button className={`btn ${!sortie ? 'on' : ''}`} onClick={() => setDec(p.armyId, { sortie: false })}>
                        농성
                      </button>
                    </div>
                  )}
                  {p.duelOffer && (!p.defense || sortie) && myLead && foeLead && (
                    <>
                      <div className="muted">
                        일기토를 걸겠습니까? ({officerName(myLead)} 대 {officerName(foeLead)})
                      </div>
                      <div className="seg">
                        <button className={`btn ${duel ? 'on' : ''}`} onClick={() => setDec(p.armyId, { duel: true })}>
                          일기토
                        </button>
                        <button className={`btn ${!duel ? 'on' : ''}`} onClick={() => setDec(p.armyId, { duel: false })}>
                          하지 않음
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <button className="btn btn-gold big" onClick={resolvePending}>
              결정
            </button>
          </div>
        </div>
      )}

      {popup && !game.pending.length && popup.kind === 'event' && (
        <EventDialog
          key={game.popups.length + popup.title}
          title={popup.title}
          speaker={popup.speaker}
          nation={popup.nation}
          text={popup.text}
          fast={settings.fast}
          onClose={closePopup}
        />
      )}
      {popup && !game.pending.length && popup.kind === 'duel' && (
        <DuelView key={game.popups.length} duel={popup.duel} fast={settings.fast} onClose={closePopup} />
      )}
      {popup && !game.pending.length && !anim && popup.kind === 'battle' && (
        <BattleReport
          key={game.popups.length}
          report={popup.report}
          index={brSeen}
          total={brSeen + game.popups.filter((p) => p.kind === 'battle').length}
          onNext={() => {
            setBrSeen((n) => n + 1);
            closePopup();
          }}
          onCloseAll={() => {
            setBrSeen(0);
            setGame({ ...game, popups: game.popups.filter((p) => p.kind !== 'battle') });
          }}
        />
      )}

      {game.status !== 'playing' && !popup && (
        <div className="modal-back">
          <div className="modal end">
            <div className="end-title">{game.status === 'won' ? '삼한 통일' : '패배'}</div>
            <p>
              {game.status === 'won'
                ? `${dateLabel(game)}, ${nation.name}이(가) 한반도를 하나로 아울렀다.`
                : `${dateLabel(game)}, ${nation.name}의 마지막 성이 무너졌다.`}
            </p>
            <button className="btn btn-gold big" onClick={onRestart}>
              새로 시작
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
