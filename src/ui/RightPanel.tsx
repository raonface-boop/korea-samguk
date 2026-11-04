import { GameState, NEUTRAL, governorOf, nationColor } from '../game/state';
import { asset } from './assets';
import { L, boxStyle, rectStyle } from './Stage';
import { COMMANDS, CmdGroup, CmdItem } from './CommandMenu';
import MiniMap, { MapViewState } from './MiniMap';
import Portrait from './Portrait';
import { CityInfo, CityTab, cityTitle } from './CityPanel';
import { BarView } from './CityBars';

/** 글자 그림을 얹은 패널 버튼 */
function LetterButton({
  box,
  word,
  vertical,
  on,
  disabled,
  onClick,
}: {
  box: number[];
  word: string;
  vertical?: boolean;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`panel-btn ${on ? 'on' : ''}`}
      style={boxStyle(box)}
      disabled={disabled}
      onClick={onClick}
      aria-label={word}
      title={word}
    >
      <img src={asset(`ui/letters/${vertical ? 'v_' : ''}${word}.png`)} alt={word} draggable={false} />
    </button>
  );
}

const VIEW_OF: Record<string, BarView> = { 'view:city': 'city', 'view:army': 'army', 'view:officer': 'officer' };
const TAB_OF: Record<string, CityTab | null> = {
  'city:picture': null,
  'city:domestic': 'domestic',
  'city:army': 'army',
  'city:officers': 'officers',
};

interface Props {
  game: GameState;
  city: string;
  view: MapViewState;
  onJump: (mx: number, my: number) => void;
  barView: BarView | null;
  setBarView: (v: BarView | null) => void;
  sideTab: CityTab | null;
  setSideTab: (t: CityTab | null) => void;
  openGroup: CmdGroup | null;
  onGroup: (g: CmdGroup) => void;
  onAction: (item: CmdItem) => void;
  onOfficer: (id: string) => void;
}

export default function RightPanel(p: Props) {
  const { game, city } = p;
  const busy = game.midTurn || game.status !== 'playing';
  const gov = governorOf(game, city);
  const owner = game.cities[city].owner;
  const title = cityTitle(game, city);
  const pressGroup = (g: CmdGroup) => {
    if (g.items) p.onGroup(g);
    else if (g.action) p.onAction({ label: g.label, action: g.action, desc: g.desc });
  };
  const ci = L.cityInfo;
  return (
    <>
      <img className="panel-bg" src={asset(L.panel.image)} alt="" style={rectStyle(L.panel)} draggable={false} />
      <MiniMap game={game} selected={city} view={p.view} onJump={p.onJump} />

      {COMMANDS.top.map((t, i) => {
        const bv = VIEW_OF[t.action];
        return (
          <LetterButton
            key={t.label}
            box={L.viewTabs[i]}
            word={t.label}
            on={!!bv && p.barView === bv}
            onClick={() => (bv ? p.setBarView(p.barView === bv ? null : bv) : p.onAction(t))}
          />
        );
      })}
      {COMMANDS.big.map((g, i) => (
        <LetterButton
          key={g.label}
          box={L.bigButtons[i]}
          word={g.label}
          on={p.openGroup?.label === g.label && !!g.items}
          disabled={busy && g.action !== 'open:settings'}
          onClick={() => pressGroup(g)}
        />
      ))}
      {COMMANDS.row.map((g, i) => (
        <LetterButton key={g.label} box={L.rowButtons[i]} word={g.label} on={p.openGroup === g} disabled={busy} onClick={() => pressGroup(g)} />
      ))}

      <div className="panel-portrait" style={rectStyle(L.portrait)}>
        {gov ? (
          <Portrait officerId={gov.id} nation={gov.nation} kind="full" w={L.portrait.w} h={L.portrait.h} />
        ) : (
          <div className="portrait portrait-card jua" style={{ width: '100%', height: '100%', background: owner === NEUTRAL ? '#555' : nationColor(owner) }}>
            태수 없음
          </div>
        )}
      </div>

      <img className="panel-cityview" src={asset('ui/cityview.jpg')} alt="" style={rectStyle(L.cityView)} draggable={false} />
      <div className="city-nameplate jua" style={{ left: L.cityName.x, top: L.cityName.y }}>
        <b>{title.name}</b> / {title.sub}
      </div>
      {p.sideTab && (
        <div className="city-info-panel" style={rectStyle(ci)}>
          <CityInfo game={game} cityId={city} tab={p.sideTab} onOfficer={p.onOfficer} />
        </div>
      )}
      {COMMANDS.side.map((t, i) => {
        const tab = TAB_OF[t.action] ?? null;
        const isClose = t.label === '닫기';
        return (
          <LetterButton
            key={t.label + i}
            box={L.sideTabs[i]}
            word={t.label}
            vertical
            on={!isClose && p.sideTab === tab}
            onClick={() => p.setSideTab(tab)}
          />
        );
      })}
    </>
  );
}
