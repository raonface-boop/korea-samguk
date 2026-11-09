import { useMemo, useState } from 'react';
import {
  APT_KEYS,
  APT_MULT,
  CITY_BY_ID,
  GameState,
  POST_KEYS,
  UNIT_NAME,
  UnitType,
  WEAPON_KINDS,
  WEAPON_NAME,
  WeaponKind,
  aptOf,
  governorOf,
  nationColor,
  nationName,
  officerName,
  stat,
} from '../game/state';
import {
  MarchOrder,
  UNIT_APT,
  UNIT_STATS,
  canMarch,
  findPath,
  matchup,
  pathHasSea,
  reachableTargets,
  shipsFor,
  typhoonRisk,
  troopCap,
  turnsFor,
  unitAttack,
  unitDefense,
  unitStatsOf,
  unlockedUnits,
} from '../game/military';
import { APT_COLOR } from './OfficerViews';

interface Props {
  game: GameState;
  /** 처음 출발 성 */
  origin: string;
  /** 목표 성 (없으면 목표 고르기부터) */
  target: string | null;
  onCancel: () => void;
  /** 쳐들어감 */
  onDone: (order: MarchOrder) => void;
  /** 목표를 지도에서 고르기 */
  onPickOnMap: (origin: string) => void;
}

const MAX_UNITS = 5;
const ALL_UNITS: UnitType[] = ['infantry', 'spear', 'siege', 'archer', 'crossbow', 'cavalry', 'heavy', 'gaema', 'xianbei'];
const TROOP_STEP = 100;

interface Row {
  lead: string | null;
  deps: [string | null, string | null];
  troops: number;
  unit: UnitType;
  engage: 'fight' | 'avoid';
  arrive: 'siege' | 'wait';
}
const emptyRow = (): Row => ({ lead: null, deps: [null, null], troops: 0, unit: 'infantry', engage: 'fight', arrive: 'siege' });
const idsOf = (r: Row) => [r.lead, ...r.deps].filter((x): x is string => !!x);

/** 그 성에서 출진할 수 있는 장수 */
function marchable(game: GameState, cityId: string) {
  return Object.values(game.officers).filter((o) => canMarch(game, o.id, cityId));
}

/** 목표까지 갈 수 있고 출진할 장수가 있는 내 성 (가까운 순) */
export function originsFor(game: GameState, target: string): { id: string; turns: number }[] {
  const out: { id: string; turns: number }[] = [];
  for (const c of Object.values(game.cities)) {
    if (c.owner !== game.player || !marchable(game, c.id).length) continue;
    const p = findPath(game, c.id, target, game.player);
    if (p && p.length >= 2) out.push({ id: c.id, turns: turnsFor(p, 'infantry') });
  }
  return out.sort((a, b) => a.turns - b.turns);
}

/** 출진 (삼국지4 방식): 목표 → 편성 → 확인 → 보급 → 확인 */
export default function MarchSheet({ game, origin: origin0, target: target0, onCancel, onDone, onPickOnMap }: Props) {
  const [origin, setOrigin] = useState(origin0);
  const [target, setTarget] = useState<string | null>(target0);
  const [step, setStep] = useState<'target' | 'form' | 'confirm' | 'supply' | 'go'>(target0 ? 'form' : 'target');
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: MAX_UNITS }, emptyRow));
  const [slot, setSlot] = useState<{ row: number; col: number } | null>(null);
  const [unitPick, setUnitPick] = useState<number | null>(null);
  const c = game.cities[origin];
  const nation = c.owner;
  const officers = useMemo(
    () => marchable(game, origin).sort((a, b) => stat(b.id, 'leadership') - stat(a.id, 'leadership')),
    [game, origin],
  );
  const unlocked = unlockedUnits(game, nation);
  const usable = ALL_UNITS.filter((u) => unlocked.includes(u) && (!UNIT_STATS[u].only || UNIT_STATS[u].only === nation));
  const origins = target ? originsFor(game, target) : [];
  const [food, setFood] = useState(0);
  const [gold, setGold] = useState(0);

  // ---------- 목표 고르기 ----------
  if (step === 'target' || !target) {
    const list = reachableTargets(game, origin, nation)
      .filter((t) => game.cities[t].owner !== nation)
      .map((t) => ({ id: t, turns: turnsFor(findPath(game, origin, t, nation)!, 'infantry') }))
      .sort((a, b) => a.turns - b.turns);
    return (
      <div className="sheet frame jua">
        <div className="sheet-head">
          <span className="sheet-title">{CITY_BY_ID[origin].name} · 출진</span>
          <button className="btn close" onClick={onCancel} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="sheet-body">
          <div className="kv">
            <b>어느 성에 쳐들어가겠습니까?</b>
          </div>
          <div className="picker">
            {list.map((t) => {
              const tc = game.cities[t.id];
              const gov = governorOf(game, t.id);
              return (
                <button
                  key={t.id}
                  className="pick-row"
                  onClick={() => {
                    setTarget(t.id);
                    setStep('form');
                  }}
                >
                  <span className="dot" style={{ background: nationColor(tc.owner) }} />
                  <span className="pick-name">{CITY_BY_ID[t.id].name}</span>
                  <span className="pick-stat">
                    {nationName(tc.owner)} · 태수 {gov ? officerName(gov.id) : '없음'} · 병력 {tc.troops.toLocaleString()} · {t.turns}턴
                  </span>
                </button>
              );
            })}
            {!list.length && <div className="muted">쳐들어갈 수 있는 성이 없습니다</div>}
          </div>
          <div className="actions">
            <button className="btn" onClick={onCancel}>
              중지
            </button>
            <button className="btn btn-gold" onClick={() => onPickOnMap(origin)}>
              지도
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- 편성 계산 ----------
  const used = new Set(rows.flatMap(idsOf));
  const totalTroops = rows.reduce((a, r) => a + (r.lead ? r.troops : 0), 0);
  /** i 번째 줄을 뺀 다른 줄이 쓴 무기를 빼고 남은 무기 */
  const weaponLeft = (k: WeaponKind, except = -1) =>
    c.weapons[k] - rows.reduce((a, r, i) => a + (i !== except && r.lead && UNIT_STATS[r.unit].weapons.includes(k) ? r.troops : 0), 0);
  const unitLeft = (u: UnitType, except = -1) => {
    const need = UNIT_STATS[u].weapons;
    return need.length ? Math.min(...need.map((k) => weaponLeft(k, except))) : Infinity;
  };
  const maxFor = (rs: Row[], i: number, u = rs[i].unit) => {
    const r = rs[i];
    if (!r.lead) return 0;
    const others = rs.reduce((a, x, j) => a + (j !== i && x.lead ? x.troops : 0), 0);
    const wl = (() => {
      const need = UNIT_STATS[u].weapons;
      if (!need.length) return Infinity;
      return Math.min(...need.map((k) => c.weapons[k] - rs.reduce((a, x, j) => a + (j !== i && x.lead && UNIT_STATS[x.unit].weapons.includes(k) ? x.troops : 0), 0)));
    })();
    return Math.max(0, Math.floor(Math.min(troopCap(game, r.lead, u), c.troops - others, wl)));
  };
  /** 추천 병과 (부대 적성 기준): 무기가 그 병력만큼 있는 병과 중 적성 배율 × 보병 상대 상성 × 공격 배율 최대 */
  const recommend = (rs: Row[], i: number, want: number): UnitType => {
    const ids = idsOf(rs[i]);
    const us = unitStatsOf(game, ids);
    let best: UnitType = 'infantry';
    let bestScore = -1;
    for (const u of usable) {
      const need = UNIT_STATS[u].weapons;
      const left = need.length ? Math.min(...need.map((k) => c.weapons[k] - rs.reduce((a, x, j) => a + (j !== i && x.lead && UNIT_STATS[x.unit].weapons.includes(k) ? x.troops : 0), 0))) : Infinity;
      if (left < Math.max(1, want)) continue;
      const score = APT_MULT[us.apt[UNIT_APT[u]].grade] * matchup(u, 'infantry') * UNIT_STATS[u].atk;
      if (score > bestScore) {
        best = u;
        bestScore = score;
      }
    }
    return best;
  };
  /** 대장을 넣으면 병력 자동: 남은 병사 ÷ 아직 병력 없는 대장 수와 상한 중 작은 값 */
  const autoFill = (rs: Row[], i: number) => {
    const others = rs.reduce((a, x, j) => a + (j !== i && x.lead ? x.troops : 0), 0);
    const empty = rs.filter((x, j) => x.lead && (j === i || x.troops <= 0)).length || 1;
    const want = Math.max(0, Math.min(Math.floor((c.troops - others) / empty), troopCap(game, rs[i].lead!, 'infantry')));
    rs[i].unit = recommend(rs, i, want);
    rs[i].troops = Math.min(want, maxFor(rs, i));
  };

  const place = (id: string) => {
    if (used.has(id)) return;
    const rs = rows.map((r) => ({ ...r, deps: [...r.deps] as Row['deps'] }));
    let at = slot && !(slot.col === 0 ? rs[slot.row].lead : rs[slot.row].deps[slot.col - 1]) ? slot : null;
    if (!at) {
      const freeLead = rs.findIndex((r) => !r.lead);
      const freeDep = rs.findIndex((r) => r.lead && (!r.deps[0] || !r.deps[1]));
      if (freeLead >= 0 && (freeDep < 0 || freeLead <= freeDep)) at = { row: freeLead, col: 0 };
      else if (freeDep >= 0) at = { row: freeDep, col: rs[freeDep].deps[0] ? 2 : 1 };
    }
    if (!at) return;
    if (at.col === 0) {
      rs[at.row].lead = id;
      autoFill(rs, at.row);
    } else {
      if (!rs[at.row].lead) {
        rs[at.row].lead = id;
        autoFill(rs, at.row);
      } else rs[at.row].deps[at.col - 1] = id;
    }
    setRows(rs);
    setSlot(null);
  };
  const clickSlot = (row: number, col: number) => {
    const r = rows[row];
    const who = col === 0 ? r.lead : r.deps[col - 1];
    if (!who) return setSlot({ row, col });
    const rs = rows.map((x) => ({ ...x, deps: [...x.deps] as Row['deps'] }));
    if (col === 0) {
      // 대장이 빠지면 부장이 대장을 이어받음
      const next = rs[row].deps.find((d) => !!d) ?? null;
      rs[row].lead = next;
      rs[row].deps = rs[row].deps.map((d) => (d === next ? null : d)) as Row['deps'];
      if (!next) rs[row] = emptyRow();
      else rs[row].troops = Math.min(rs[row].troops, maxFor(rs, row));
    } else rs[row].deps[col - 1] = null;
    setRows(rs);
  };
  const setTroops = (i: number, v: number) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, troops: Math.max(0, Math.min(Math.floor(v || 0), maxFor(rs, i))) } : r)));
  const setUnit = (i: number, u: UnitType) =>
    setRows((rs) => {
      const out = rs.map((r) => ({ ...r }));
      out[i].unit = u;
      out[i].troops = Math.min(out[i].troops, maxFor(out, i, u));
      return out;
    });
  const setOrder = (i: number, p: Partial<Pick<Row, 'engage' | 'arrive'>>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  /** 자동 편성: 부대 수 = min(5, 고른 장수 수). 능력 순으로 대장을 먼저 세우고, 장수가 5명보다 많을 때만 남는 장수를 돌아가며 부장(최대 2명)으로 */
  const autoForm = () => {
    // 편성 칸에 이미 넣은 장수가 있으면 그들로, 없으면 이 성의 출진할 수 있는 장수 모두
    const picked = rows.flatMap(idsOf);
    const pool = (picked.length ? officers.filter((o) => picked.includes(o.id)) : [...officers]).sort(
      (a, b) => stat(b.id, 'leadership') + stat(b.id, 'war') - stat(a.id, 'leadership') - stat(a.id, 'war'),
    );
    const rs = Array.from({ length: MAX_UNITS }, emptyRow);
    const nUnits = Math.min(MAX_UNITS, pool.length);
    pool.slice(0, nUnits).forEach((o, i) => {
      rs[i].lead = o.id;
    });
    pool.slice(nUnits).forEach((o, k) => {
      const i = k % nUnits;
      const slot = rs[i].deps[0] ? 1 : 0;
      if (k < nUnits * 2) rs[i].deps[slot] = o.id;
    });
    for (let i = 0; i < nUnits; i++) autoFill(rs, i);
    setRows(rs);
  };
  /**
   * 병력최대: 성의 병력·무기를 처음에 한 번 세어 부대 수로 고르게 나눔.
   * 대장 한도·무기를 넘지 않게 하고, 한도 때문에 남은 몫은 아직 여유가 있는 부대에 다시 나눔.
   */
  const fillMax = () =>
    setRows((rs) => {
      const out = rs.map((r) => ({ ...r, troops: 0 }));
      const idx = out.map((r, i) => (r.lead ? i : -1)).filter((i) => i >= 0);
      let left = c.troops;
      const w = { ...c.weapons };
      const room = (i: number) => {
        const r = out[i];
        const need = UNIT_STATS[r.unit].weapons;
        const wl = need.length ? Math.min(...need.map((k) => w[k])) : Infinity;
        return Math.max(0, Math.min(troopCap(game, r.lead!, r.unit) - r.troops, wl));
      };
      let active = idx.filter((i) => room(i) > 0);
      while (left > 0 && active.length) {
        const share = Math.max(1, Math.floor(left / active.length));
        let gave = 0;
        for (const i of active) {
          const g = Math.min(share, room(i), left);
          if (g <= 0) continue;
          out[i].troops += g;
          for (const k of UNIT_STATS[out[i].unit].weapons) w[k] -= g;
          left -= g;
          gave += g;
        }
        if (gave === 0) break;
        active = active.filter((i) => room(i) > 0);
      }
      return out;
    });
  const valid = rows.filter((r) => r.lead && r.troops > 0);
  const path = findPath(game, origin, target, nation);
  // 바닷길이 끼면 배가 있어야 함 (1척 = 병사 100명)
  const sea = !!path && pathHasSea(path);
  const shipsNeed = valid.reduce((a, r) => a + shipsFor(r.troops), 0);
  const shipsHave = c.ships ?? 0;
  const seaBlock = sea && (!CITY_BY_ID[origin].port ? `${CITY_BY_ID[origin].name}은(는) 항구가 아닙니다` : shipsNeed > shipsHave ? '배가 모자랍니다' : null);
  const turns = path ? Math.max(1, ...valid.map((r) => turnsFor(path, r.unit))) : 0;
  const eat = Math.max(1, Math.ceil(totalTroops / 20));
  const order: MarchOrder = {
    cityId: origin,
    target,
    units: valid.map((r) => ({
      officer: r.lead!,
      deputies: r.deps.filter((d): d is string => !!d),
      unitType: r.unit,
      troops: r.troops,
      order: { engage: r.engage, arrive: r.arrive },
    })),
    food,
    gold,
  };

  const askBox = (text: string, yes: () => void, no: () => void) => (
    <div className="march-ask frame jua">
      <div className="march-ask-text">{text}</div>
      <div className="actions">
        <button className="btn" onClick={no}>
          아니오
        </button>
        <button className="btn btn-gold" onClick={yes}>
          예
        </button>
      </div>
    </div>
  );

  // ---------- 보급 ----------
  if (step === 'supply' || step === 'go') {
    return (
      <div className="sheet frame jua">
        <div className="sheet-head">
          <span className="sheet-title">보급</span>
          <button className="btn close" onClick={() => setStep('form')} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="sheet-body">
          <div className="kv">
            {CITY_BY_ID[origin].name} → {CITY_BY_ID[target].name} · {valid.length}부대 · 총병력 {totalTroops.toLocaleString()} · 도착 {turns}턴
          </div>
          <label className="num-row">
            <span>금</span>
            <input type="number" min={0} max={c.gold} value={gold} onChange={(e) => setGold(Math.max(0, Math.min(c.gold, Math.floor(+e.target.value || 0))))} />
            <small className="muted">/ {c.gold.toLocaleString()} · 점령한 성의 민심 수습에 씀</small>
          </label>
          <label className="num-row">
            <span>쌀</span>
            <input type="number" min={0} max={c.food} value={food} onChange={(e) => setFood(Math.max(0, Math.min(c.food, Math.floor(+e.target.value || 0))))} />
            <small className="muted">
              / {c.food.toLocaleString()} · 약 {Math.floor(food / eat)}턴치
            </small>
          </label>
          <div className="actions">
            <button className="btn" onClick={() => setStep('form')}>
              돌아가기
            </button>
            <button className="btn btn-gold" onClick={() => setStep('go')}>
              결정
            </button>
          </div>
        </div>
        {step === 'go' && askBox('쳐들어가겠습니까?', () => onDone(order), () => setStep('supply'))}
      </div>
    );
  }

  // ---------- 편성 화면 ----------
  const oi = origins.findIndex((o) => o.id === origin);
  const switchOrigin = (d: number) => {
    if (origins.length < 2) return;
    const next = origins[(oi + d + origins.length) % origins.length].id;
    setOrigin(next);
    setRows(Array.from({ length: MAX_UNITS }, emptyRow));
    setFood(0);
    setGold(0);
  };
  const postOf = (id: string) => POST_KEYS.find((k) => c.posts?.[k] === id);
  const usedWeapons = (k: WeaponKind) => weaponLeft(k);

  return (
    <div className="form-popup frame jua">
      <div className="sheet-head">
        <span className="sheet-title">
          출진 편성 · 출발 성{' '}
          <button className="btn tiny-btn" onClick={() => switchOrigin(-1)} disabled={origins.length < 2}>
            ◀
          </button>{' '}
          {CITY_BY_ID[origin].name}{' '}
          <button className="btn tiny-btn" onClick={() => switchOrigin(1)} disabled={origins.length < 2}>
            ▶
          </button>{' '}
          → {CITY_BY_ID[target].name}
        </span>
        <span className="muted">
          목표 병력 {game.cities[target].troops.toLocaleString()} · 도착 {turns}턴
          {sea && (
            <span className={seaBlock ? 'warn' : ''}>
              {' '}
              · 바다 건넘 · 배 {shipsNeed}척 필요(보유 {shipsHave}척) · 이번 계절 태풍 위험 {typhoonRisk(game.season)}
              {seaBlock && ` — ${seaBlock}`}
            </span>
          )}
        </span>
        <button className="btn close" onClick={onCancel} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="form-body">
        <div className="form-left">
          <div className="form-off head">
            <span>이름</span>
            <span>관직</span>
            <span>통</span>
            <span>무</span>
            <span>지</span>
            <span>적성</span>
            <span>추천</span>
          </div>
          <div className="form-off-list">
            {officers.map((o) => {
              const on = used.has(o.id);
              const rec = (() => {
                const tmp = [...rows.map((r) => ({ ...r })), { ...emptyRow(), lead: o.id }];
                return recommend(tmp, tmp.length - 1, Math.min(c.troops, troopCap(game, o.id, 'infantry')));
              })();
              const post = postOf(o.id);
              return (
                <button key={o.id} className={`form-off ${on ? 'used' : ''}`} disabled={on} onClick={() => place(o.id)}>
                  <span className="fo-name">
                    {officerName(o.id)}
                    {post && <small className="post-tag">{post} 담당</small>}
                  </span>
                  <span className="fo-rank">{o.rank}</span>
                  <span>{stat(o.id, 'leadership')}</span>
                  <span>{stat(o.id, 'war')}</span>
                  <span>{stat(o.id, 'intelligence')}</span>
                  <span className="fo-apt">
                    {APT_KEYS.map((k) => {
                      const g = aptOf(game, o.id, k);
                      return (
                        <span key={k}>
                          {k}
                          <b style={{ color: APT_COLOR[g] }}>{g}</b>
                        </span>
                      );
                    })}
                  </span>
                  <span className="fo-rec">
                    {UNIT_NAME[rec]} {aptOf(game, o.id, UNIT_APT[rec])}
                  </span>
                </button>
              );
            })}
            {!officers.length && <div className="warn">이 성에는 출진할 장수가 없습니다</div>}
          </div>
        </div>
        <div className="form-right">
          {rows.map((r, i) => {
            const ids = idsOf(r);
            const us = unitStatsOf(game, ids);
            const g = us.apt[UNIT_APT[r.unit]].grade;
            const m = APT_MULT[g];
            const max = maxFor(rows, i);
            const atk = r.lead ? unitAttack(r.unit, r.troops, us.war, c.training) * m : 0;
            const def = r.lead ? unitDefense(r.unit, r.troops, us.leadership) * m : 0;
            const who = (id: string | null) => (id && id !== r.lead ? ` (${officerName(id)})` : '');
            return (
              <div key={i} className={`form-unit ${r.lead ? '' : 'unused'}`}>
                <div className="form-slots">
                  {[0, 1, 2].map((col) => {
                    const id = col === 0 ? r.lead : r.deps[col - 1];
                    const active = slot?.row === i && slot.col === col;
                    return (
                      <button key={col} className={`form-slot ${col === 0 ? 'lead' : ''} ${active ? 'active' : ''}`} onClick={() => clickSlot(i, col)}>
                        {id ? officerName(id) : <span className="muted">{col === 0 ? '대장' : '부장'}</span>}
                      </button>
                    );
                  })}
                  <span className="form-troops">
                    <button className="btn tiny-btn" disabled={!r.lead} onClick={() => setTroops(i, r.troops - TROOP_STEP)}>
                      −
                    </button>
                    <input type="number" min={0} max={max} value={r.troops} disabled={!r.lead} onChange={(e) => setTroops(i, +e.target.value)} />
                    <button className="btn tiny-btn" disabled={!r.lead} onClick={() => setTroops(i, r.troops + TROOP_STEP)}>
                      +
                    </button>
                  </span>
                  <button className="btn form-unit-btn" disabled={!r.lead} onClick={() => setUnitPick(unitPick === i ? null : i)}>
                    {UNIT_NAME[r.unit]}
                  </button>
                </div>
                {r.lead && (
                  <div className="form-unit-info">
                    통솔 {us.leadership}
                    {who(us.by.leadership)} · 무력 {us.war}
                    {who(us.by.war)} · 지력 {us.intelligence}
                    {who(us.by.intelligence)} · {UNIT_APT[r.unit]} <b style={{ color: APT_COLOR[g] }}>{g}</b> ×{m} · 상한 {max.toLocaleString()} · 공{' '}
                    {Math.round(atk).toLocaleString()} 방 {Math.round(def).toLocaleString()}
                    <span className="form-orders">
                      <button className={`btn tiny-btn ${r.engage === 'fight' ? 'on' : ''}`} onClick={() => setOrder(i, { engage: r.engage === 'fight' ? 'avoid' : 'fight' })}>
                        {r.engage === 'fight' ? '싸움' : '피함'}
                      </button>
                      <button className={`btn tiny-btn ${r.arrive === 'siege' ? 'on' : ''}`} onClick={() => setOrder(i, { arrive: r.arrive === 'siege' ? 'wait' : 'siege' })}>
                        {r.arrive === 'siege' ? '공성' : '대기'}
                      </button>
                    </span>
                  </div>
                )}
                {unitPick === i && r.lead && (
                  <table className="unit-table">
                    <thead>
                      <tr>
                        <th>병과</th>
                        <th>적성</th>
                        <th>공격</th>
                        <th>방어</th>
                        <th>기동</th>
                        <th>공성</th>
                        <th>필요 무기</th>
                        <th>남은 무기</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usable.map((u) => {
                        const st = UNIT_STATS[u];
                        const ug = us.apt[UNIT_APT[u]].grade;
                        const left = unitLeft(u, i);
                        const lack = left <= 0;
                        return (
                          <tr
                            key={u}
                            className={`${lack ? 'lack' : ''} ${r.unit === u ? 'on' : ''}`}
                            onClick={() => {
                              if (lack) return;
                              setUnit(i, u);
                              setUnitPick(null);
                            }}
                          >
                            <td>{UNIT_NAME[u]}</td>
                            <td style={{ color: APT_COLOR[ug] }}>
                              {UNIT_APT[u]} {ug}
                            </td>
                            <td>{st.atk}</td>
                            <td>{st.def}</td>
                            <td>{st.speed}</td>
                            <td>{st.siege}</td>
                            <td>{st.weapons.map((k) => WEAPON_NAME[k]).join('+') || '없음'}</td>
                            <td>{left === Infinity ? '-' : left.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="form-left-over">
        남은 병사 {(c.troops - totalTroops).toLocaleString()} ·{' '}
        {WEAPON_KINDS.map((k) => `${WEAPON_NAME[k]} ${Math.max(0, usedWeapons(k)).toLocaleString()}`).join(' · ')}
      </div>
      <div className="form-foot">
        <span>
          {valid.length}부대 · 총병력 {totalTroops.toLocaleString()} · 총대장 {valid[0]?.lead ? officerName(valid[0].lead) : '-'}
        </span>
        <span className="actions">
          <button className="btn" disabled={!officers.length} onClick={autoForm}>
            자동편성
          </button>
          <button className="btn" disabled={!valid.length} onClick={fillMax}>
            병력최대
          </button>
          <button className="btn" onClick={onCancel}>
            중지
          </button>
          <button className="btn btn-gold" disabled={!valid.length || !path || !!seaBlock} onClick={() => setStep('confirm')}>
            결정
          </button>
        </span>
      </div>
      {step === 'confirm' &&
        askBox(
          '부대편성은 이것으로 좋습니까?',
          () => {
            setFood(Math.min(c.food, Math.ceil(totalTroops / 20) * Math.max(6, turns * 3)));
            setStep('supply');
          },
          () => setStep('form'),
        )}
    </div>
  );
}
