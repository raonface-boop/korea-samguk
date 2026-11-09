import { useState } from 'react';
import {
  CITY_BY_ID,
  GameState,
  WEAPON_KINDS,
  WEAPON_NAME,
  WeaponKind,
  nationColor,
  nationName,
  officerName,
  officersInCity,
  stat,
} from '../game/state';
import {
  COMMAND_NAME,
  COMMAND_STAT,
  CommandId,
  STAT_NAME,
  applyDomestic,
  availableOfficers,
  fmt,
  weaponPrice,
} from '../game/domestic';
import { doMove, doRecruit, doReward, doSearch, foundRonin, moveTurns, recruitRate, searchRate } from '../game/personnel';
import { STRATEGY_COST, STRATEGY_NAME, StrategyId, applyStrategy, strategyRate, strategyTargets } from '../game/strategy';
import { convoyTurns, sendConvoy } from '../game/military';
import Portrait from './Portrait';

export type DomesticCmd = Exclude<CommandId, 'march'>;
export type PersonnelCmd = 'search' | 'recruit' | 'reward' | 'move';
export type SheetCmd = DomesticCmd | PersonnelCmd | StrategyId;

export const SHEET_NAME: Record<SheetCmd, string> = {
  ...(COMMAND_NAME as Record<DomesticCmd, string>),
  search: '탐색',
  recruit: '등용',
  reward: '포상',
  move: '이동',
  ...STRATEGY_NAME,
};

type Run = (fn: (s: GameState) => string | null) => void;

interface Props {
  game: GameState;
  cityId: string;
  cmd: SheetCmd;
  onCancel: () => void;
  onRun: Run;
  /** 징병(true)·훈련(false)을 미리 골라 둠 */
  initialConscript?: boolean;
}

const EFFECT: Record<SheetCmd, string> = {
  farm: '농업 + 정치/10',
  market: '상업 + 정치/10',
  flood: '치수 + 정치/10',
  fortify: '방어 + 통솔/10 (겨울 2배)',
  military: '징병: 병력 + 인구의 2% / 훈련: 훈련도 + 통솔/10',
  arms: '금을 써서 무기 생산',
  relief: '군량 − 인구의 5%, 민심 +10',
  search: '이 성에 숨은 재야 인재를 찾음. 못 찾으면 금을 줍기도 함',
  recruit: '찾아낸 재야 인재를 설득해 장수로 삼음',
  reward: '금 100으로 장수의 충성 +10',
  move: '다른 내 성으로 장수를 보냄 (길 거리만큼 턴이 걸림)',
  rumor: `금 ${STRATEGY_COST}. 성공하면 대상 성 민심 −15, 훈련도 −5`,
  discord: `금 ${STRATEGY_COST}. 성공하면 대상 장수 충성 −15`,
  betray: `금 ${STRATEGY_COST}. 충성 40 미만 장수를 병력 20%와 함께 빼냄`,
};

const SHEET_STAT: Record<SheetCmd, keyof typeof STAT_NAME> = {
  ...(COMMAND_STAT as Record<DomesticCmd, keyof typeof STAT_NAME>),
  search: 'intelligence',
  recruit: 'charm',
  reward: 'charm',
  move: 'leadership',
  rumor: 'intelligence',
  discord: 'intelligence',
  betray: 'charm',
};

export function OfficerPicker({
  game,
  cityId,
  statKey,
  value,
  onChange,
}: {
  game: GameState;
  cityId: string;
  statKey: keyof typeof STAT_NAME;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const list = availableOfficers(game, cityId).sort((a, b) => stat(b.id, statKey) - stat(a.id, statKey));
  if (!list.length) return <div className="muted">남는 장수가 없습니다</div>;
  return (
    <div className="picker">
      {list.map((o, i) => (
        <button key={o.id} className={`pick-row ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
          <Portrait officerId={o.id} nation={o.nation} kind="face" size={36} />
          <span className="pick-name">{officerName(o.id)}</span>
          <span className="pick-stat">
            {STAT_NAME[statKey]} {stat(o.id, statKey)}
          </span>
          {i === 0 && <span className="rec">추천</span>}
        </button>
      ))}
    </div>
  );
}

export default function CommandSheet({ game, cityId, cmd, onCancel, onRun, initialConscript = true }: Props) {
  const c = game.cities[cityId];
  const me = c.owner;
  const [conscript, setConscript] = useState(initialConscript);
  const statKey = cmd === 'military' && !conscript ? 'leadership' : SHEET_STAT[cmd];
  const best = availableOfficers(game, cityId).sort((a, b) => stat(b.id, statKey) - stat(a.id, statKey))[0]?.id ?? null;
  const [officer, setOfficer] = useState<string | null>(best);
  const [weapon, setWeapon] = useState<WeaponKind>('spear');
  const [gold, setGold] = useState(() => Math.min(c.gold, 1000));
  const ronin = foundRonin(game, cityId, me);
  const [roninId, setRoninId] = useState<string | null>(ronin[0]?.id ?? null);
  const myOfficers = officersInCity(game, cityId).filter((o) => o.nation === me);
  // 포상: 여러 명을 골라 차례로
  const rewardable = myOfficers.filter((o) => o.rank !== '군주');
  const [rewardIds, setRewardIds] = useState<string[]>(() => {
    const low = [...rewardable].sort((a, b) => a.loyalty - b.loyalty)[0];
    return low ? [low.id] : [];
  });
  const [rewardSort, setRewardSort] = useState(false);
  const rewardList = rewardSort ? [...rewardable].sort((a, b) => a.loyalty - b.loyalty) : rewardable;
  const toggleReward = (id: string) => setRewardIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const moveDests = Object.values(game.cities)
    .filter((x) => x.owner === me && x.id !== cityId)
    .map((x) => ({ id: x.id, turns: moveTurns(game, cityId, x.id, me) }))
    .filter((x): x is { id: string; turns: number } => x.turns !== null)
    .sort((a, b) => a.turns - b.turns);
  const [dest, setDest] = useState<string | null>(moveDests[0]?.id ?? null);
  const isStrategy = cmd === 'rumor' || cmd === 'discord' || cmd === 'betray';
  const sTargets = isStrategy ? strategyTargets(game, cityId) : [];
  const [tCity, setTCity] = useState<string | null>(sTargets[0] ?? null);
  const tOfficers = tCity ? officersInCity(game, tCity).filter((o) => o.nation === game.cities[tCity].owner) : [];
  const [tOfficer, setTOfficer] = useState<string | null>(null);

  const needOfficer = cmd !== 'reward';
  let warn: string | null = null;
  if (cmd === 'military' && conscript && c.gold < Math.floor(c.population * 0.005)) warn = '금이 모자랍니다';
  if (cmd === 'relief' && c.food < Math.floor(c.population * 0.05)) warn = '군량이 모자랍니다';
  if (cmd === 'arms' && gold <= 0) warn = '쓸 금을 정하시오';
  if (cmd === 'recruit' && !roninId) warn = '찾아낸 재야 인재가 없습니다. 먼저 탐색하시오';
  if (cmd === 'reward' && c.gold < 100) warn = '금 100이 필요합니다';
  if (cmd === 'reward' && !rewardIds.length) warn = '포상할 장수를 고르시오';
  if (cmd === 'move' && !dest) warn = '갈 수 있는 내 성이 없습니다';
  if (isStrategy && c.gold < STRATEGY_COST) warn = `금 ${STRATEGY_COST}이 필요합니다`;
  if (isStrategy && !tCity) warn = '2단계 안에 대상 성이 없습니다';
  if ((cmd === 'discord' || cmd === 'betray') && !tOfficer) warn = '대상 장수를 고르시오';
  if (cmd === 'betray' && tOfficer && game.officers[tOfficer].loyalty >= 40) warn = '충성 40 미만 장수만 내응시킬 수 있습니다';

  let rate: number | null = null;
  if (officer) {
    if (cmd === 'search') rate = searchRate(officer);
    if (cmd === 'recruit' && roninId) rate = recruitRate(game, me, officer, roninId);
    if (isStrategy && tCity) rate = strategyRate(game, cmd as StrategyId, officer, tCity, tOfficer);
  }

  const run = () => {
    const off = officer;
    switch (cmd) {
      case 'search':
        onRun((s) => doSearch(s, cityId, off!));
        break;
      case 'recruit':
        onRun((s) => doRecruit(s, cityId, off!, roninId!));
        break;
      case 'reward':
        onRun((s) => {
          // 고른 장수마다 차례로 포상, 금이 모자라면 거기서 멈춤
          let n = 0;
          for (const id of rewardIds) {
            if (!doReward(s, cityId, id)) break;
            n++;
          }
          if (!n) return null;
          return n < rewardIds.length
            ? `${n}명에게 포상 (금이 모자라 ${rewardIds.length}명 가운데 ${n}명까지만)`
            : `${n}명에게 포상 (금 -${(n * 100).toLocaleString()})`;
        });
        break;
      case 'move':
        onRun((s) => doMove(s, off!, dest!));
        break;
      case 'rumor':
      case 'discord':
      case 'betray':
        onRun((s) => applyStrategy(s, cityId, off!, cmd, tCity!, tOfficer));
        break;
      default: {
        const dcmd = cmd;
        onRun((s) => {
          const msg = applyDomestic(s, cityId, dcmd, off, { conscript, weapon, gold });
          return msg ? `${officerName(off!)}: ${msg}` : null;
        });
      }
    }
  };

  const price = weaponPrice(cityId, weapon);
  return (
    <div className="sheet frame jua">
      <div className="sheet-head">
        <span className="sheet-title">
          {CITY_BY_ID[cityId].name} · {SHEET_NAME[cmd]}
        </span>
        <button className="btn close" onClick={onCancel} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <div className="muted">{EFFECT[cmd]}</div>
        {cmd === 'military' && (
          <div className="seg">
            <button className={`btn ${conscript ? 'on' : ''}`} onClick={() => setConscript(true)}>
              징병 (+{Math.floor(c.population * 0.02).toLocaleString()})
            </button>
            <button className={`btn ${!conscript ? 'on' : ''}`} onClick={() => setConscript(false)}>
              훈련
            </button>
          </div>
        )}
        {cmd === 'arms' && (
          <>
            <div className="seg wrap">
              {WEAPON_KINDS.map((k) => (
                <button key={k} className={`btn ${weapon === k ? 'on' : ''}`} onClick={() => setWeapon(k)}>
                  {WEAPON_NAME[k]}
                  {weaponPrice(cityId, k) < 1 && <span className="disc"> 할인</span>}
                </button>
              ))}
            </div>
            <label className="slider">
              <span>
                금 {gold.toLocaleString()} / {c.gold.toLocaleString()} → {WEAPON_NAME[weapon]} {Math.floor(gold / price).toLocaleString()}개 (1개 금{' '}
                {price})
              </span>
              <input type="range" min={0} max={c.gold} step={10} value={gold} onChange={(e) => setGold(+e.target.value)} />
            </label>
          </>
        )}
        {cmd === 'recruit' && (
          <>
            <div className="kv">
              <b>재야 인재</b>
            </div>
            <div className="picker">
              {ronin.map((r) => (
                <button key={r.id} className={`pick-row ${roninId === r.id ? 'on' : ''}`} onClick={() => setRoninId(r.id)}>
                  <Portrait officerId={r.id} nation="none" kind="face" size={36} />
                  <span className="pick-name">{officerName(r.id)}</span>
                  <span className="pick-stat">
                    통{stat(r.id, 'leadership')} 무{stat(r.id, 'war')} 지{stat(r.id, 'intelligence')} 정{stat(r.id, 'politics')} 매{stat(r.id, 'charm')}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        {cmd === 'reward' && (
          <>
            <div className="seg">
              <button className="btn" onClick={() => setRewardIds(rewardable.map((o) => o.id))}>
                모두 고르기
              </button>
              <button className={`btn ${rewardSort ? 'on' : ''}`} onClick={() => setRewardSort((v) => !v)}>
                충성 낮은 순
              </button>
            </div>
            <div className="picker">
              {rewardList.map((o) => (
                <button key={o.id} className={`pick-row ${rewardIds.includes(o.id) ? 'on' : ''}`} onClick={() => toggleReward(o.id)}>
                  <input type="checkbox" readOnly checked={rewardIds.includes(o.id)} />
                  <Portrait officerId={o.id} nation={o.nation} kind="face" size={36} />
                  <span className="pick-name">{officerName(o.id)}</span>
                  <span className="pick-stat">충성 {o.loyalty}</span>
                </button>
              ))}
            </div>
            <div className="kv">
              {rewardIds.length}명 고름 · 포상 금 합계 {(rewardIds.length * 100).toLocaleString()} <span className="muted">(금 {c.gold.toLocaleString()})</span>
            </div>
          </>
        )}
        {cmd === 'move' && (
          <>
            <div className="kv">
              <b>갈 곳</b>
            </div>
            <div className="picker">
              {moveDests.map((d) => (
                <button key={d.id} className={`pick-row ${dest === d.id ? 'on' : ''}`} onClick={() => setDest(d.id)}>
                  <span className="pick-name">{CITY_BY_ID[d.id].name}</span>
                  <span className="pick-stat">{d.turns}턴</span>
                </button>
              ))}
            </div>
          </>
        )}
        {isStrategy && (
          <>
            <div className="kv">
              <b>대상 성</b> <span className="muted">(길로 2단계 안)</span>
            </div>
            <div className="picker">
              {sTargets.map((id) => (
                <button
                  key={id}
                  className={`pick-row ${tCity === id ? 'on' : ''}`}
                  onClick={() => (setTCity(id), setTOfficer(null))}
                >
                  <span className="dot" style={{ background: nationColor(game.cities[id].owner) }} />
                  <span className="pick-name">{CITY_BY_ID[id].name}</span>
                  <span className="pick-stat">
                    {nationName(game.cities[id].owner)} · 민심 {fmt(game.cities[id].morale)}
                  </span>
                </button>
              ))}
            </div>
            {cmd !== 'rumor' && (
              <>
                <div className="kv">
                  <b>대상 장수</b>
                </div>
                <div className="picker">
                  {tOfficers.length === 0 && <div className="muted">장수가 없습니다</div>}
                  {tOfficers.map((o) => (
                    <button key={o.id} className={`pick-row ${tOfficer === o.id ? 'on' : ''}`} onClick={() => setTOfficer(o.id)}>
                      <Portrait officerId={o.id} nation={o.nation} kind="face" size={36} />
                      <span className="pick-name">{officerName(o.id)}</span>
                      <span className="pick-stat">
                        지력 {stat(o.id, 'intelligence')} · 충성 {o.loyalty}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {needOfficer && (
          <>
            <div className="kv">
              <b>맡길 장수</b>
            </div>
            <OfficerPicker game={game} cityId={cityId} statKey={statKey} value={officer} onChange={setOfficer} />
          </>
        )}
        {rate !== null && <div className="kv">성공 확률 약 {Math.round(rate)}%</div>}
        {warn && <div className="warn">{warn}</div>}
        <div className="actions">
          <button className="btn" onClick={onCancel}>
            취소
          </button>
          <button className="btn btn-gold" disabled={(needOfficer && !officer) || !!warn} onClick={run}>
            실행
          </button>
        </div>
      </div>
    </div>
  );
}

/** 이동(장수·병사) · 수송(금·쌀·무기): 지도에서 고른 아군 성으로 보냄 */
export function ConvoySheet({
  game,
  cityId,
  target,
  kind,
  onCancel,
  onRun,
}: {
  game: GameState;
  cityId: string;
  target: string;
  kind: '이동' | '수송';
  onCancel: () => void;
  onRun: Run;
}) {
  const c = game.cities[cityId];
  const turns = convoyTurns(game, cityId, target);
  const offs = availableOfficers(game, cityId);
  const [picked, setPicked] = useState<string[]>([]);
  const [troops, setTroops] = useState(0);
  const [gold, setGold] = useState(0);
  const [food, setFood] = useState(0);
  const [weapons, setWeapons] = useState<Partial<Record<WeaponKind, number>>>({});
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const empty =
    kind === '이동' ? picked.length === 0 && troops <= 0 : gold <= 0 && food <= 0 && WEAPON_KINDS.every((k) => (weapons[k] ?? 0) <= 0);
  const warn = !turns ? '그 성으로 가는 아군 길이 없습니다' : empty ? (kind === '이동' ? '데려갈 장수나 병사를 정하시오' : '보낼 것을 정하시오') : null;
  const slider = (label: string, value: number, max: number, set: (v: number) => void, step = 50) => (
    <label className="slider" key={label}>
      <span>
        {label} {value.toLocaleString()} / {max.toLocaleString()}
      </span>
      <input type="range" min={0} max={max} step={step} value={Math.min(value, max)} onChange={(e) => set(+e.target.value)} />
    </label>
  );
  return (
    <div className="sheet frame jua">
      <div className="sheet-head">
        <span className="sheet-title">
          {kind}: {CITY_BY_ID[cityId].name} → {CITY_BY_ID[target].name}
        </span>
        <button className="btn close" onClick={onCancel} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <div className="muted">{turns ? `길을 따라 ${turns}턴 뒤 도착 (싸우지 않음, 도착 전에 그 성을 잃으면 되돌아옴)` : ''}</div>
        {kind === '이동' ? (
          <>
            <div className="kv">
              <b>데려갈 장수</b> <span className="muted">(여러 명)</span>
            </div>
            <div className="picker">
              {offs.map((o) => (
                <button key={o.id} className={`pick-row ${picked.includes(o.id) ? 'on' : ''}`} onClick={() => toggle(o.id)}>
                  <Portrait officerId={o.id} nation={o.nation} kind="face" size={30} />
                  <span className="pick-name">{officerName(o.id)}</span>
                  <span className="pick-stat">
                    {o.rank} · 통솔 {stat(o.id, 'leadership')}
                  </span>
                </button>
              ))}
              {!offs.length && <div className="muted">남는 장수가 없습니다</div>}
            </div>
            {slider('병사', troops, c.troops, setTroops, 100)}
          </>
        ) : (
          <>
            {slider('금', gold, c.gold, setGold)}
            {slider('쌀', food, c.food, setFood)}
            {WEAPON_KINDS.map((k) => slider(WEAPON_NAME[k], weapons[k] ?? 0, c.weapons[k], (v) => setWeapons((w) => ({ ...w, [k]: v }))))}
          </>
        )}
        {warn && <div className="warn">{warn}</div>}
        <div className="actions">
          <button className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            className="btn btn-gold"
            disabled={!!warn}
            onClick={() =>
              onRun((s) =>
                sendConvoy(
                  s,
                  cityId,
                  target,
                  kind === '이동' ? { officers: picked, troops, gold: 0, food: 0, weapons: {} } : { officers: [], troops: 0, gold, food, weapons },
                  kind,
                ),
              )
            }
          >
            보내기
          </button>
        </div>
      </div>
    </div>
  );
}
