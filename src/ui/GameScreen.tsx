import { useState } from 'react';
import {
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
import { applyDomestic, CommandArgs, CommandId } from '../game/domestic';
import { MarchOrder, createArmy } from '../game/military';
import { beginEndTurn, finishEndTurn } from '../game/turn';
import { saveGame } from '../game/save';
import MapView from './MapView';
import CityPanel from './CityPanel';
import CommandSheet from './CommandSheet';
import MarchSheet from './MarchSheet';
import { OfficerDetail, OfficerList } from './OfficerViews';

interface Props {
  game: GameState;
  setGame: (s: GameState) => void;
  onRestart: () => void;
}

const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];

export default function GameScreen({ game, setGame, onRestart }: Props) {
  const [city, setCity] = useState<string | null>(null);
  const [cmd, setCmd] = useState<CommandId | null>(null);
  const [officer, setOfficer] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [menu, setMenu] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});

  const nation = NATION_BY_ID[game.player];
  const ruler = rulerOf(game, game.player);
  const myCities = Object.values(game.cities).filter((c) => c.owner === game.player);
  const totalGold = myCities.reduce((a, c) => a + c.gold, 0);
  const totalFood = myCities.reduce((a, c) => a + c.food, 0);
  const totalTroops =
    myCities.reduce((a, c) => a + c.troops, 0) +
    game.armies.filter((a) => a.nation === game.player).reduce((a, x) => a + x.troops, 0);

  const commit = (s: GameState, save = false) => {
    if (save) saveGame(s);
    setGame(s);
  };

  const endTurn = () => {
    setCity(null);
    setCmd(null);
    const s = beginEndTurn(game);
    setDecisions({});
    commit(s, !s.midTurn);
  };

  const resolveDefense = () => {
    const s = finishEndTurn(game, decisions);
    setDecisions({});
    commit(s, true);
  };

  const doCommand = (officerId: string, args: CommandArgs) => {
    if (!city || !cmd || cmd === 'march') return;
    const s = cloneState(game);
    const msg = applyDomestic(s, city, cmd, officerId, args);
    if (msg) addLog(s, `${officerName(officerId)}: ${msg}`);
    else addLog(s, '명령을 실행할 수 없습니다');
    setCmd(null);
    commit(s);
  };

  const doMarch = (order: MarchOrder) => {
    const s = cloneState(game);
    const a = createArmy(s, order);
    if (!a) addLog(s, '출진할 수 없습니다 (경로나 병력을 확인하시오)');
    setCmd(null);
    setCity(null);
    commit(s);
  };

  const recent = game.log.slice(-20);

  return (
    <div className="game">
      <header className="topbar">
        <div className="date">
          {SEASON_ICON[game.season]} {dateLabel(game)}
        </div>
        <div className="me">
          <span className="me-flag" style={{ background: nation.color }}>
            {nation.hanja}
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
          <button className="btn" onClick={() => setMenu(true)}>
            메뉴
          </button>
          <button className="btn btn-gold" onClick={endTurn} disabled={game.midTurn || game.status !== 'playing'}>
            턴 종료
          </button>
        </div>
      </header>

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
        <CityPanel
          game={game}
          cityId={city}
          onClose={() => setCity(null)}
          onCommand={setCmd}
          onOfficer={setOfficer}
        />
      )}
      {city && cmd && cmd !== 'march' && (
        <CommandSheet key={city + cmd} game={game} cityId={city} cmd={cmd} onCancel={() => setCmd(null)} onConfirm={doCommand} />
      )}
      {city && cmd === 'march' && <MarchSheet game={game} cityId={city} onCancel={() => setCmd(null)} onConfirm={doMarch} />}

      {showList && <OfficerList game={game} onClose={() => setShowList(false)} onOpen={setOfficer} />}
      {officer && <OfficerDetail game={game} id={officer} onClose={() => setOfficer(null)} />}

      {menu && (
        <div className="modal-back" onClick={() => setMenu(false)}>
          <div className="modal menu" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">메뉴</div>
            <button className="btn big" onClick={() => (setMenu(false), setShowList(true))}>
              장수 목록
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
            <div className="sheet-title">적이 쳐들어왔다!</div>
            {game.pending.map((p) => {
              const a = game.armies.find((x) => x.id === p.armyId);
              if (!a) return null;
              const c = game.cities[p.cityId];
              const choice = decisions[p.armyId] ?? false;
              return (
                <div key={p.armyId} className="defense-row">
                  <div>
                    <b>{CITY_BY_ID[p.cityId].name}</b> — {nationName(a.nation)} {a.officers[0] ? officerName(a.officers[0]) : ''}{' '}
                    {UNIT_NAME[a.unitType]} {a.troops.toLocaleString()} (우리 병력 {c.troops.toLocaleString()})
                  </div>
                  <div className="seg">
                    <button className={`btn ${choice ? 'on' : ''}`} onClick={() => setDecisions({ ...decisions, [p.armyId]: true })}>
                      출격
                    </button>
                    <button className={`btn ${!choice ? 'on' : ''}`} onClick={() => setDecisions({ ...decisions, [p.armyId]: false })}>
                      농성
                    </button>
                  </div>
                </div>
              );
            })}
            <button className="btn btn-gold big" onClick={resolveDefense}>
              결정
            </button>
          </div>
        </div>
      )}

      {game.status !== 'playing' && (
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
