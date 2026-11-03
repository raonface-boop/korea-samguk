import {
  CITY_BY_ID,
  GameState,
  WEAPON_KINDS,
  WEAPON_NAME,
  governorOf,
  nationColor,
  nationName,
  officerName,
  officersInCity,
} from '../game/state';
import { regionRatio } from '../game/control';
import { COMMAND_NAME, CommandId, availableOfficers, fmt } from '../game/domestic';
import Portrait from './Portrait';

interface Props {
  game: GameState;
  cityId: string;
  onClose: () => void;
  onCommand: (cmd: CommandId) => void;
  onOfficer: (id: string) => void;
}

const COMMANDS: CommandId[] = ['farm', 'market', 'flood', 'fortify', 'military', 'arms', 'relief', 'march'];

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="stat-val">{fmt(Math.round(value * 10) / 10)}</span>
    </div>
  );
}

export default function CityPanel({ game, cityId, onClose, onCommand, onOfficer }: Props) {
  const d = CITY_BY_ID[cityId];
  const c = game.cities[cityId];
  const mine = c.owner === game.player;
  const officers = officersInCity(game, cityId);
  const free = availableOfficers(game, cityId).length;
  const gov = governorOf(game, cityId);
  const ratio = Math.round(regionRatio(game, cityId) * 100);
  return (
    <div className="sheet">
      <div className="sheet-head">
        <div>
          <span className="sheet-title">{d.name}</span>
          <span className="owner-tag" style={{ background: nationColor(c.owner) }}>
            {nationName(c.owner)}
          </span>
        </div>
        <button className="btn close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <div className="info-grid">
          <div>
            <b>인구</b> {c.population.toLocaleString()}
          </div>
          <div>
            <b>병력</b> {c.troops.toLocaleString()}
          </div>
          <div>
            <b>금</b> {c.gold.toLocaleString()}
          </div>
          <div>
            <b>군량</b> {c.food.toLocaleString()}
          </div>
          <div>
            <b>지역 장악</b> {ratio}%
          </div>
          <div>
            <b>태수</b> {gov ? officerName(gov.id) : '없음'}
          </div>
        </div>
        <Bar label="훈련도" value={c.training} />
        <Bar label="민심" value={c.morale} />
        <Bar label="방어" value={c.defense} />
        <Bar label="농업" value={c.agri} />
        <Bar label="상업" value={c.commerce} />
        <Bar label="치수" value={c.flood} />
        <div className="weapons">
          <b>무기 창고</b>
          {WEAPON_KINDS.map((k) => (
            <span key={k} className="chip">
              {WEAPON_NAME[k]} {c.weapons[k].toLocaleString()}
            </span>
          ))}
        </div>
        <div className="kv">
          <b>특산물</b> {d.goods.join(', ') || '-'}
        </div>
        {d.placeNames && (
          <div className="kv">
            <b>시대별 지명</b> {d.placeNames}
          </div>
        )}
        <div className="kv">
          <b>장수</b>
          {officers.length === 0 && <span className="muted"> 없음</span>}
        </div>
        <div className="officer-strip">
          {officers.map((o) => (
            <button key={o.id} className="officer-mini" onClick={() => onOfficer(o.id)}>
              <Portrait officerId={o.id} nation={o.nation} kind="face" size={40} />
              <span>{officerName(o.id)}</span>
              {o.acted && <span className="acted">행동함</span>}
            </button>
          ))}
        </div>
        {mine && game.status === 'playing' && (
          <>
            <div className="kv">
              <b>명령</b> <span className="muted">남는 장수 {free}명</span>
            </div>
            <div className="cmd-grid">
              {COMMANDS.map((cmd) => (
                <button key={cmd} className="btn cmd" disabled={free === 0 || game.midTurn} onClick={() => onCommand(cmd)}>
                  {COMMAND_NAME[cmd]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
