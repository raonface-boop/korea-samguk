import { GameState, NEUTRAL, OfficerStats, governorOf, nationColor, officerName, stat } from '../game/state';
import { roninInCity } from '../game/personnel';
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
      {NO_LETTER.has(word) ? (
        <span className={`btn-text jua ${vertical ? 'vertical' : ''}`}>{word}</span>
      ) : (
        <img src={asset(`ui/letters/${vertical ? 'v_' : ''}${word}.png`)} alt={word} draggable={false} />
      )}
    </button>
  );
}

/** 글자 그림이 없는 칸 (Jua 글자로 씀) */
const NO_LETTER = new Set(['재야']);

/** 성 그림 위 판: 성 정보 셋 + 재야 */
export type PanelTab = CityTab | 'ronin';

const STAT_KEYS: [keyof OfficerStats, string][] = [
  ['leadership', '통'],
  ['war', '무'],
  ['intelligence', '지'],
  ['politics', '정'],
  ['charm', '매'],
];

/** 그 성의 재야 인재 (못 찾은 사람은 ???) */
function RoninList({ game, cityId }: { game: GameState; cityId: string }) {
  const list = roninInCity(game, cityId);
  const found = list.filter((o) => o.foundBy.includes(game.player)).length;
  return (
    <div className="city-info jua">
      <div className="kv">
        <b>재야 인재</b> {list.length}명 · 찾아냄 {found}명
      </div>
      <div className="officer-list">
        {list.map((o) => {
          const known = o.foundBy.includes(game.player);
          return (
            <div key={o.id} className="ronin-line">
              <span className="pick-name">{known ? officerName(o.id) : '???'}</span>
              <span className="ronin-stats">
                {STAT_KEYS.map(([k, n]) => (
                  <span key={k}>
                    {n}
                    {known ? stat(o.id, k) : '??'}
                  </span>
                ))}
              </span>
              <span className={`ronin-found ${known ? 'yes' : ''}`}>{known ? '발견' : '미발견'}</span>
            </div>
          );
        })}
        {!list.length && <div className="muted">이 성에는 재야 인재가 없사옵니다</div>}
      </div>
    </div>
  );
}

const VIEW_OF: Record<string, BarView> = { 'view:city': 'city', 'view:army': 'army', 'view:officer': 'officer' };
const TAB_OF: Record<string, PanelTab | null> = {
  'city:picture': null,
  'city:ronin': 'ronin',
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
  sideTab: PanelTab | null;
  setSideTab: (t: PanelTab | null) => void;
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
          <Portrait officerId={gov.id} nation={gov.nation} kind="face" w={L.portrait.w} h={L.portrait.h} />
        ) : (
          <div className="portrait portrait-card jua" style={{ width: '100%', height: '100%', background: owner === NEUTRAL ? '#555' : nationColor(owner) }}>
            태수 없음
          </div>
        )}
      </div>

      <div className="city-nameplate jua" style={{ left: L.cityName.x, top: L.cityName.y }}>
        <b>{title.name}</b> / {title.sub}
      </div>
      {p.sideTab && (
        <div className="city-info-panel" style={rectStyle(ci)}>
          {p.sideTab === 'ronin' ? (
            <RoninList game={game} cityId={city} />
          ) : (
            <CityInfo game={game} cityId={city} tab={p.sideTab} onOfficer={p.onOfficer} />
          )}
        </div>
      )}
      {COMMANDS.side.map((t, i) => {
        const tab = TAB_OF[t.action] ?? null;
        return (
          <LetterButton
            key={t.label + i}
            box={L.sideTabs[i]}
            word={t.label}
            vertical
            on={p.sideTab === tab}
            onClick={() => p.setSideTab(tab)}
          />
        );
      })}
    </>
  );
}
