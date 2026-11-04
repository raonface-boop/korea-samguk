import { useEffect, useState } from 'react';
import {
  BattleDecision,
  CITY_BY_ID,
  GameState,
  NATION_BY_ID,
  UNIT_NAME,
  addLog,
  cloneState,
  dateLabel,
  nationName,
  officerName,
  rulerOf,
} from '../game/state';
import { MarchOrder, armyTarget, createArmy, defenderLeader } from '../game/military';
import { beginEndTurn, finishEndTurn } from '../game/turn';
import { Settings, saveGame } from '../game/save';
import { sound } from '../audio/sound';
import MapView from './MapView';
import CityPanel, { MenuCmd } from './CityPanel';
import CommandSheet, { SheetCmd } from './CommandSheet';
import MarchSheet from './MarchSheet';
import { OfficerDetail, OfficerList } from './OfficerViews';
import DiplomacySheet, { NationInfo } from './DiplomacySheet';
import PrisonerSheet from './PrisonerSheet';
import SettingsSheet from './SettingsSheet';
import EventDialog from './EventDialog';
import DuelView from './DuelView';
import BattleReport from './BattleReport';

interface Props {
  game: GameState;
  setGame: (s: GameState) => void;
  onRestart: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
}

const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];

export default function GameScreen({ game, setGame, onRestart, settings, onSettings }: Props) {
  const [city, setCity] = useState<string | null>(null);
  const [cmd, setCmd] = useState<MenuCmd | null>(null);
  const [officer, setOfficer] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [showNations, setShowNations] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [menu, setMenu] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, BattleDecision>>({});
  const [alertsHidden, setAlertsHidden] = useState(false);

  const nation = NATION_BY_ID[game.player];
  const ruler = rulerOf(game, game.player);
  const myCities = Object.values(game.cities).filter((c) => c.owner === game.player);
  const totalGold = myCities.reduce((a, c) => a + c.gold, 0);
  const totalFood = myCities.reduce((a, c) => a + c.food, 0);
  const totalTroops =
    myCities.reduce((a, c) => a + c.troops, 0) +
    game.armies.filter((a) => a.nation === game.player).reduce((a, x) => a + x.troops, 0);

  const popup = game.popups[0] ?? null;

  // 배경음악: 전투 결과·일기토 창이 떠 있으면 전투 음악
  useEffect(() => {
    sound.setMode(popup && (popup.kind === 'duel' || popup.kind === 'battle') ? 'battle' : 'map');
  }, [popup]);

  const commit = (s: GameState, save = false) => {
    if (save && settings.autosave) saveGame(s);
    setGame(s);
  };

  const afterTurnSounds = (s: GameState) => {
    if (s.alerts.length) window.setTimeout(() => sound.play('warn'), 900);
    const conquered = s.popups.some((p) => p.kind === 'battle' && p.report.fallen && p.report.attacker.nation === s.player);
    if (conquered) window.setTimeout(() => sound.play('fanfare'), 1400);
  };

  const endTurn = () => {
    setCity(null);
    setCmd(null);
    sound.play('gong');
    const s = beginEndTurn(game);
    setDecisions({});
    setAlertsHidden(false);
    commit(s, !s.midTurn);
    if (!s.midTurn) afterTurnSounds(s);
    else if (s.pending.some((p) => p.defense)) sound.play('warn');
  };

  const resolvePending = () => {
    const s = finishEndTurn(game, decisions);
    setDecisions({});
    commit(s, true);
    afterTurnSounds(s);
  };

  /** 명령 실행: 상태를 복사해 바꾸고 결과를 사건 기록에 */
  const run = (fn: (s: GameState) => string | null) => {
    const s = cloneState(game);
    const msg = fn(s);
    if (msg) {
      if (!s.log[s.log.length - 1]?.endsWith(msg)) addLog(s, msg);
    } else addLog(s, '명령을 실행할 수 없습니다');
    if (cmd !== 'prisoner') setCmd(null);
    commit(s);
  };

  const doMarch = (order: MarchOrder) => {
    const s = cloneState(game);
    const a = createArmy(s, order);
    if (!a) addLog(s, '출진할 수 없습니다 (경로나 병력을 확인하시오)');
    else sound.play('march');
    setCmd(null);
    setCity(null);
    commit(s);
  };

  const onCommand = (c: MenuCmd) => {
    if (c === 'officers') return setShowList(true);
    if (c === 'nations') return setShowNations(true);
    setCmd(c);
  };

  const closePopup = () => setGame({ ...game, popups: game.popups.slice(1) });

  const recent = game.log.slice(-20);
  const setDec = (id: string, d: BattleDecision) => setDecisions({ ...decisions, [id]: { ...decisions[id], ...d } });

  const sheetCmd = cmd && !['march', 'prisoner', 'diplomacy', 'officers', 'nations'].includes(cmd) ? (cmd as SheetCmd) : null;

  return (
    <div className="game">
      <header className="topbar">
        <div className="date">
          {SEASON_ICON[game.season]} {dateLabel(game)}
        </div>
        <div className="me">
          <span className="me-flag" style={{ background: nation.color }}>
            {nation.flagName}
          </span>
          <span className="me-name">{nation.name}</span>
          <span className="me-ruler">{ruler ? officerName(ruler.id) : '군주 없음'}</span>
        </div>
        <div className="totals">
          <span>금 {totalGold.toLocaleString()}</span>
          <span>군량 {totalFood.toLocaleString()}</span>
          <span>병력 {totalTroops.toLocaleString()}</span>
        </div>
        <div className="top-btns">
          <button className="btn gear" onClick={() => setShowSettings(true)} aria-label="설정">
            ⚙
          </button>
          <button className="btn" onClick={() => setMenu(true)}>
            메뉴
          </button>
          <button className="btn btn-gold" onClick={endTurn} disabled={game.midTurn || game.status !== 'playing'}>
            턴 종료
          </button>
        </div>
      </header>

      {game.alerts.length > 0 && !alertsHidden && (
        <div className="alerts" onClick={() => setAlertsHidden(true)}>
          {game.alerts.map((a, i) => (
            <div key={i}>⚠ {a}</div>
          ))}
          <div className="muted small">눌러서 닫기</div>
        </div>
      )}

      <MapView game={game} selected={city} onSelectCity={(id) => (setCity(id), setCmd(null))} />

      <div className={`log ${logOpen ? 'open' : ''}`} onClick={() => setLogOpen((v) => !v)}>
        <div className="log-head">사건 기록 {logOpen ? '▼' : '▲'}</div>
        <div className="log-lines">
          {(logOpen ? recent : recent.slice(-3)).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>

      {city && !cmd && (
        <CityPanel game={game} cityId={city} onClose={() => setCity(null)} onCommand={onCommand} onOfficer={setOfficer} />
      )}
      {city && sheetCmd && (
        <CommandSheet key={city + sheetCmd} game={game} cityId={city} cmd={sheetCmd} onCancel={() => setCmd(null)} onRun={run} />
      )}
      {city && cmd === 'march' && <MarchSheet game={game} cityId={city} onCancel={() => setCmd(null)} onConfirm={doMarch} />}
      {city && cmd === 'diplomacy' && <DiplomacySheet game={game} cityId={city} onRun={run} onClose={() => setCmd(null)} />}
      {cmd === 'prisoner' && <PrisonerSheet game={game} onRun={run} onClose={() => setCmd(null)} />}

      {showList && <OfficerList game={game} onClose={() => setShowList(false)} onOpen={setOfficer} />}
      {showNations && <NationInfo game={game} onClose={() => setShowNations(false)} />}
      {officer && <OfficerDetail game={game} id={officer} onClose={() => setOfficer(null)} />}
      {showSettings && <SettingsSheet settings={settings} onChange={onSettings} onClose={() => setShowSettings(false)} />}

      {menu && (
        <div className="modal-back" onClick={() => setMenu(false)}>
          <div className="modal menu" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">메뉴</div>
            <button className="btn big" onClick={() => (setMenu(false), setShowList(true))}>
              장수 목록
            </button>
            <button className="btn big" onClick={() => (setMenu(false), setShowNations(true))}>
              세력 정보
            </button>
            <button className="btn big" onClick={() => (setMenu(false), setCmd('prisoner'))}>
              포로
            </button>
            <button className="btn big" onClick={() => (setMenu(false), setShowSettings(true))}>
              설정
            </button>
            <button
              className="btn big"
              onClick={() => {
                if (window.confirm('지금 게임을 버리고 새로 시작할까요?')) onRestart();
              }}
            >
              새로 시작
            </button>
            <button className="btn big" onClick={() => setMenu(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

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
      {popup && !game.pending.length && popup.kind === 'battle' && (
        <BattleReport key={game.popups.length} report={popup.report} onClose={closePopup} />
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
