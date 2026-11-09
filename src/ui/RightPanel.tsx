import { useState } from 'react';
import { GameState, NEUTRAL, governorOf, nationColor, nationName, officerName, officersInCity } from '../game/state';
import { L, boxStyle, rectStyle } from './Stage';
import { COMMANDS, CmdGroup, CmdItem, sideCommands } from './CommandMenu';
import Portrait from './Portrait';
import { cityTitle } from './CityPanel';
import { BarView } from './CityBars';
import DateBox from './DateBox';

/** 판 버튼 (글자로 씀) */
function LetterButton({
  box,
  word,
  className,
  on,
  disabled,
  onClick,
}: {
  box: number[];
  word: string;
  className: string;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`side-btn ${className} ${on ? 'on' : ''}`}
      style={boxStyle(box)}
      disabled={disabled}
      onClick={onClick}
      aria-label={word}
      title={word}
    >
      {word}
    </button>
  );
}

const VIEW_OF: Record<string, BarView> = { 'view:city': 'city', 'view:army': 'army', 'view:officer': 'officer' };

/** 판 아래 성 정보 막대 (막대 끝 값) */
const CARD_BARS: { label: string; max: number; color: string; get: (g: GameState, id: string) => number }[] = [
  { label: '인구', max: 100000, color: '#cfc6b0', get: (g, id) => g.cities[id].population },
  { label: '금', max: 5000, color: '#e8c04a', get: (g, id) => g.cities[id].gold },
  { label: '군량', max: 20000, color: '#9fcf58', get: (g, id) => g.cities[id].food },
  { label: '병사', max: 20000, color: '#d6574a', get: (g, id) => g.cities[id].troops },
  { label: '민심', max: 100, color: '#e88a5a', get: (g, id) => Math.round(g.cities[id].morale) },
];

const CARD_NAMES = 6;

/** 고른 성 정보 칸: 도시 | 장수 탭 (도시 탭을 누르면 성 정보창) */
function CityCard({ game, city, onOpen, onOfficer }: { game: GameState; city: string; onOpen: () => void; onOfficer: (id: string) => void }) {
  const [tab, setTab] = useState<'city' | 'officer'>('city');
  const gov = governorOf(game, city);
  const c = game.cities[city];
  const owner = c.owner;
  const title = cityTitle(game, city);
  const pt = L.cityCard.portrait;
  const list = officersInCity(game, city).filter((o) => o.id !== gov?.id);
  return (
    <div className="city-card jua" style={rectStyle(L.cityCard)}>
      <div className="city-card-tabs">
        <button className={`city-card-tab ${tab === 'city' ? 'on' : ''}`} onClick={() => setTab('city')}>
          도시
        </button>
        <button className={`city-card-tab ${tab === 'officer' ? 'on' : ''}`} onClick={() => setTab('officer')}>
          장수
        </button>
      </div>
      {tab === 'city' ? (
        <button className="city-card-page" onClick={onOpen} title="성 정보 보기">
          <div className="city-card-name">{title.name}</div>
          <div className="city-card-who">
            <span>세력</span> {owner === NEUTRAL ? '중립' : nationName(owner)}
          </div>
          <div className="city-card-bars">
            {CARD_BARS.map((b) => {
              const v = b.get(game, city);
              const t = Math.max(0, Math.min(1, v / b.max));
              return (
                <div key={b.label} className="city-card-bar">
                  <span>{b.label}</span>
                  <i>
                    <u style={{ width: `${t * 100}%`, background: b.color }} />
                  </i>
                  <b>{v.toLocaleString()}</b>
                </div>
              );
            })}
          </div>
        </button>
      ) : (
        <div className="city-card-page">
          <div className="city-card-head">
            <div className="city-card-face" style={{ width: pt.w, height: pt.h }}>
              {gov ? (
                <Portrait officerId={gov.id} nation={gov.nation} kind="face" w={pt.w} h={pt.h} />
              ) : (
                <div className="portrait portrait-card" style={{ width: '100%', height: '100%', background: owner === NEUTRAL ? '#555' : nationColor(owner) }}>
                  없음
                </div>
              )}
            </div>
            <div className="city-card-who">
              <span>태수</span>{' '}
              {gov ? (
                <button className="city-card-officer" onClick={() => onOfficer(gov.id)}>
                  {officerName(gov.id)}
                </button>
              ) : (
                '없음'
              )}
            </div>
          </div>
          <div className="city-card-officers">
            {list.slice(0, CARD_NAMES).map((o) => (
              <button key={o.id} className="city-card-officer" onClick={() => onOfficer(o.id)}>
                {officerName(o.id)}
              </button>
            ))}
            {list.length > CARD_NAMES && <span className="muted">외 {list.length - CARD_NAMES}명</span>}
            {!list.length && <span className="muted">다른 장수 없음</span>}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  game: GameState;
  city: string;
  barView: BarView | null;
  setBarView: (v: BarView | null) => void;
  openGroup: CmdGroup | null;
  onGroup: (g: CmdGroup) => void;
  onAction: (item: CmdItem) => void;
  onOpenCity: () => void;
  /** 장수 정보 열기 */
  onOpenOfficer: (id: string) => void;
}

/** 오른쪽 세로 명령판: 날짜 · 보기 4칸 · 명령 2열 · 고른 성 정보 */
export default function RightPanel(p: Props) {
  const { game, city } = p;
  const busy = game.midTurn || game.status !== 'playing';
  const pressGroup = (g: CmdGroup) => {
    if (g.items) p.onGroup(g);
    else if (g.action) p.onAction({ label: g.label, action: g.action, desc: g.desc });
  };
  return (
    <>
      <div className="side-panel" style={rectStyle(L.side)} />
      <DateBox game={game} />

      {COMMANDS.top.map((t, i) => {
        const bv = VIEW_OF[t.action];
        return (
          <LetterButton
            key={t.label}
            className="view"
            box={L.viewTabs[i]}
            word={t.label}
            on={!!bv && p.barView === bv}
            onClick={() => (bv ? p.setBarView(p.barView === bv ? null : bv) : p.onAction(t))}
          />
        );
      })}
      <div className="side-rule" style={rectStyle(L.sideRule)} />

      {sideCommands().map(({ group: g, box }) => (
        <LetterButton
          key={g.label + box[1]}
          className="cmd"
          box={box}
          word={g.label}
          on={p.openGroup === g && !!g.items}
          disabled={busy && g.action !== 'open:settings'}
          onClick={() => pressGroup(g)}
        />
      ))}

      <CityCard game={game} city={city} onOpen={p.onOpenCity} onOfficer={p.onOpenOfficer} />
    </>
  );
}
