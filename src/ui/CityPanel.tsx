import { useState } from 'react';
import {
  CITY_BY_ID,
  GameState,
  NEUTRAL,
  WEAPON_KINDS,
  WEAPON_NAME,
  capitalOf,
  governorOf,
  nationColor,
  nationName,
  officerName,
  officersInCity,
  rulerOf,
} from '../game/state';
import { regionRatio, spreadLayers } from '../game/control';
import { availableOfficers, fmt } from '../game/domestic';
import { foundRonin, prisonersOf } from '../game/personnel';
import { SHEET_NAME, SheetCmd } from './CommandSheet';
import Portrait from './Portrait';

export type MenuCmd = SheetCmd | 'march' | 'prisoner' | 'diplomacy' | 'officers' | 'nations';

interface Props {
  game: GameState;
  cityId: string;
  onClose: () => void;
  onCommand: (cmd: MenuCmd) => void;
  onOfficer: (id: string) => void;
}

type Group = '내정' | '군사' | '인사' | '계략' | '외교' | '정보';
const GROUPS: { name: Group; cmds: MenuCmd[] }[] = [
  { name: '내정', cmds: ['farm', 'market', 'flood', 'fortify', 'relief'] },
  { name: '군사', cmds: ['military', 'arms', 'march'] },
  { name: '인사', cmds: ['search', 'recruit', 'reward', 'move', 'prisoner'] },
  { name: '계략', cmds: ['rumor', 'discord', 'betray'] },
  { name: '외교', cmds: ['diplomacy'] },
  { name: '정보', cmds: ['officers', 'nations'] },
];

const EXTRA_NAME: Record<string, string> = {
  march: '출진',
  prisoner: '포로',
  diplomacy: '외교',
  officers: '장수 목록',
  nations: '세력 정보',
};

const NO_OFFICER: MenuCmd[] = ['reward', 'prisoner', 'officers', 'nations'];

function cmdName(c: MenuCmd) {
  return EXTRA_NAME[c] ?? SHEET_NAME[c as SheetCmd];
}

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
  const [group, setGroup] = useState<Group>('내정');
  const d = CITY_BY_ID[cityId];
  const c = game.cities[cityId];
  const mine = c.owner === game.player;
  const officers = officersInCity(game, cityId);
  const free = availableOfficers(game, cityId).length;
  const gov = governorOf(game, cityId);
  const ratio = Math.round(regionRatio(game, cityId) * 100);
  const isCapital = c.owner !== NEUTRAL && capitalOf(game, c.owner) === cityId;
  const ruler = c.owner !== NEUTRAL ? rulerOf(game, c.owner) : undefined;
  const ronin = mine ? foundRonin(game, cityId, game.player).length : 0;
  const prisoners = prisonersOf(game, game.player).length;
  const headline =
    c.owner === NEUTRAL
      ? '중립 · 소국·부족'
      : `${nationName(c.owner)}${isCapital ? '의 수도' : ''} · 군주 ${ruler ? officerName(ruler.id) : '없음'}`;

  const disabled = (cmd: MenuCmd) => {
    if (game.midTurn) return true;
    if (cmd === 'diplomacy' && !isCapital) return true;
    if (!NO_OFFICER.includes(cmd) && free === 0) return true;
    return false;
  };

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div>
          <div className="city-headline" style={{ color: nationColor(c.owner) }}>
            {headline}
          </div>
          <span className="sheet-title">
            {isCapital && <span className="capital-mark">都</span>}
            {d.name}
          </span>
          <span className="owner-tag" style={{ background: nationColor(c.owner) }}>
            {nationName(c.owner)}
          </span>
        </div>
        <button className="btn close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        {mine && game.status === 'playing' && (
          <div className="menu-box">
            <div className="group-tabs">
              {GROUPS.map((g) => (
                <button key={g.name} className={`btn tab-btn ${group === g.name ? 'on' : ''}`} onClick={() => setGroup(g.name)}>
                  {g.name}
                </button>
              ))}
            </div>
            <div className="cmd-grid">
              {GROUPS.find((g) => g.name === group)!.cmds.map((cmd) => (
                <button key={cmd} className="btn cmd" disabled={disabled(cmd)} onClick={() => onCommand(cmd)}>
                  {cmdName(cmd)}
                  {cmd === 'recruit' && ronin > 0 && <span className="badge">{ronin}</span>}
                  {cmd === 'prisoner' && prisoners > 0 && <span className="badge">{prisoners}</span>}
                </button>
              ))}
            </div>
            <div className="muted">
              남는 장수 {free}명{group === '외교' && !isCapital && ' · 외교는 수도에서만 할 수 있습니다'}
            </div>
          </div>
        )}
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
            <b>지역 장악</b> {ratio}%{ratio < 100 && <span className="muted"> (+{spreadLayers(game, cityId)}겹/턴)</span>}
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
              {o.nation === game.player && <span className={`loy ${o.loyalty < 40 ? 'low' : ''}`}>충성 {o.loyalty}</span>}
              {o.acted && <span className="acted">행동함</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
