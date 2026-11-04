import {
  CITY_BY_ID,
  GameState,
  NEUTRAL,
  WEAPON_KINDS,
  WEAPON_NAME,
  capitalOf,
  governorOf,
  nationName,
  officerName,
  officersInCity,
  rulerOf,
} from '../game/state';
import { regionRatio, spreadLayers } from '../game/control';
import { availableOfficers, fmt } from '../game/domestic';
import { foundRonin } from '../game/personnel';
import Portrait from './Portrait';

export type CityTab = 'domestic' | 'army' | 'officers';

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

/** "한성 / 백제의 도읍, 군주 근초고왕" */
export function cityTitle(game: GameState, cityId: string): { name: string; sub: string } {
  const c = game.cities[cityId];
  const name = CITY_BY_ID[cityId].name;
  if (c.owner === NEUTRAL) return { name, sub: '중립 · 소국·부족' };
  const capital = capitalOf(game, c.owner) === cityId;
  const ruler = rulerOf(game, c.owner);
  return { name, sub: `${nationName(c.owner)}의 ${capital ? '도읍' : '성'}, 군주 ${ruler ? officerName(ruler.id) : '없음'}` };
}

/** 성 정보 (내정·군사·장수 가운데 하나, 또는 전부) */
export function CityInfo({
  game,
  cityId,
  tab,
  onOfficer,
}: {
  game: GameState;
  cityId: string;
  tab: CityTab | 'all';
  onOfficer: (id: string) => void;
}) {
  const d = CITY_BY_ID[cityId];
  const c = game.cities[cityId];
  const mine = c.owner === game.player;
  const officers = officersInCity(game, cityId);
  const gov = governorOf(game, cityId);
  const ratio = Math.round(regionRatio(game, cityId) * 100);
  const free = availableOfficers(game, cityId).length;
  const ronin = mine ? foundRonin(game, cityId, game.player).length : 0;
  const show = (t: CityTab) => tab === 'all' || tab === t;
  return (
    <div className="city-info jua">
      {show('domestic') && (
        <>
          <div className="info-grid">
            <div>
              <b>인구</b> {c.population.toLocaleString()}
            </div>
            <div>
              <b>태수</b> {gov ? officerName(gov.id) : '없음'}
            </div>
            <div>
              <b>금</b> {c.gold.toLocaleString()}
            </div>
            <div>
              <b>군량</b> {c.food.toLocaleString()}
            </div>
            <div>
              <b>지역 장악</b> {ratio}%{ratio < 100 && <small> (+{spreadLayers(game, cityId)}겹/턴)</small>}
            </div>
          </div>
          <Bar label="민심" value={c.morale} />
          <Bar label="농업" value={c.agri} />
          <Bar label="상업" value={c.commerce} />
          <Bar label="치수" value={c.flood} />
          <div className="kv">
            <b>특산물</b> {d.goods.join(', ') || '-'}
          </div>
          {d.placeNames && (
            <div className="kv">
              <b>시대별 지명</b> {d.placeNames}
            </div>
          )}
        </>
      )}
      {show('army') && (
        <>
          <div className="info-grid">
            <div>
              <b>병력</b> {c.troops.toLocaleString()}
            </div>
            <div>
              <b>군량</b> {c.food.toLocaleString()}
            </div>
          </div>
          <Bar label="훈련도" value={c.training} />
          <Bar label="방어" value={c.defense} />
          <div className="weapons">
            <b>무기 창고</b>
            {WEAPON_KINDS.map((k) => (
              <span key={k} className="chip">
                {WEAPON_NAME[k]} {c.weapons[k].toLocaleString()}
              </span>
            ))}
          </div>
        </>
      )}
      {show('officers') && (
        <>
          <div className="kv">
            <b>장수</b> {officers.length}명{mine && ` · 남는 장수 ${free}명`}
            {ronin > 0 && ` · 찾아낸 재야 ${ronin}명`}
          </div>
          <div className="officer-list">
            {officers.map((o) => (
              <button key={o.id} className="officer-line" onClick={() => onOfficer(o.id)}>
                <Portrait officerId={o.id} nation={o.nation} kind="face" size={30} />
                <span className="pick-name">{officerName(o.id)}</span>
                <span className="pick-stat">
                  {o.rank}
                  {o.nation === game.player && o.rank !== '군주' && ` · 충성 ${o.loyalty}`}
                  {o.acted && ' · 행동함'}
                </span>
              </button>
            ))}
            {!officers.length && <div className="muted">장수가 없사옵니다</div>}
          </div>
        </>
      )}
    </div>
  );
}

/** 밀정: 적 성 정보창 */
export function CityInfoWindow({ game, cityId, onClose, onOfficer }: { game: GameState; cityId: string; onClose: () => void; onOfficer: (id: string) => void }) {
  const t = cityTitle(game, cityId);
  return (
    <div className="sheet frame">
      <div className="sheet-head">
        <span className="sheet-title jua">
          {t.name} <small>{t.sub}</small>
        </span>
        <button className="btn close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <CityInfo game={game} cityId={cityId} tab="all" onOfficer={onOfficer} />
      </div>
    </div>
  );
}
