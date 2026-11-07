import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { APT_MULT, CITY_BY_ID, GameState, UNIT_NAME, UnitType, WEAPON_NAME, aptOf, nationColor, nationName, officerName, stat } from '../game/state';
import { availableOfficers } from '../game/domestic';
import {
  MarchOrder,
  UNIT_STATS,
  defenderLeader,
  findPath,
  matchup,
  reachableTargets,
  UNIT_APT,
  troopCap,
  turnsFor,
  unitAttack,
  unitDefense,
  unlockedUnits,
} from '../game/military';
import Portrait from './Portrait';
import { APT_COLOR } from './OfficerViews';
import { L, rectStyle } from './Stage';

interface Props {
  game: GameState;
  cityId: string;
  onCancel: () => void;
  onConfirm: (order: MarchOrder) => void;
  /** 지금 고른 목적지·부대 (지도 강조·요약 상자용). 창을 닫으면 null */
  onPlan?: (plan: MarchPlan | null) => void;
}

export interface MarchPlan {
  target: string | null;
  units: { officer: string; unitType: UnitType; troops: number }[];
}

const MAX_UNITS = 5;
const ALL_UNITS: UnitType[] = ['infantry', 'spear', 'siege', 'archer', 'crossbow', 'cavalry', 'heavy', 'gaema', 'xianbei'];

interface Row {
  officer: string;
  unitType: UnitType;
  troops: number;
}

/** 앞 단계를 고르기 전엔 흐리게 */
const stepStyle = (on: boolean): CSSProperties => (on ? {} : { opacity: 0.4, pointerEvents: 'none' });

function StepTitle({ n, text, done }: { n: string; text: string; done: boolean }) {
  return (
    <div className="kv" style={{ marginTop: 4 }}>
      <b style={{ color: done ? 'var(--gold2)' : undefined }}>
        {n} {text}
      </b>
    </div>
  );
}

/** 상성 배율 글자 */
function matchText(m: number) {
  if (m > 1) return `유리 ×${m}`;
  if (m < 1) return `불리 ×${m}`;
  return '대등';
}

export default function MarchSheet({ game, cityId, onCancel, onConfirm, onPlan }: Props) {
  const c = game.cities[cityId];
  const nation = c.owner;
  const offs = availableOfficers(game, cityId).sort((a, b) => stat(b.id, 'leadership') - stat(a.id, 'leadership'));
  const unlocked = unlockedUnits(game, nation);
  const usable = ALL_UNITS.filter((u) => unlocked.includes(u) && (!UNIT_STATS[u].only || UNIT_STATS[u].only === nation));

  // ① 목적지
  const targets = useMemo(
    () =>
      reachableTargets(game, cityId, nation)
        .map((id) => ({ id, turns: turnsFor(findPath(game, cityId, id, nation)!, 'infantry') }))
        .sort((a, b) => a.turns - b.turns),
    [game, cityId, nation],
  );
  const [target, setTarget] = useState<string | null>(null);

  // ② 장수 · ③ 부대
  const [rows, setRows] = useState<Row[]>([]);
  const toggle = (id: string) =>
    setRows((rs) => {
      if (rs.some((r) => r.officer === id)) return rs.filter((r) => r.officer !== id);
      if (rs.length >= MAX_UNITS) return rs;
      return [...rs, { officer: id, unitType: 'infantry', troops: 0 }];
    });
  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  useEffect(() => {
    onPlan?.({ target, units: rows });
  }, [target, rows, onPlan]);
  useEffect(() => () => onPlan?.(null), [onPlan]);

  /** 앞 줄이 쓰고 남은 병력·무기 안에서 이 줄의 상한 */
  const limits = rows.map((r, i) => {
    const before = rows.slice(0, i);
    const troopsLeft = c.troops - before.reduce((a, x) => a + x.troops, 0);
    const weaponLeft = (u: UnitType) => {
      const need = UNIT_STATS[u].weapons;
      if (!need.length) return Infinity;
      return Math.min(...need.map((k) => c.weapons[k] - before.filter((x) => UNIT_STATS[x.unitType].weapons.includes(k)).reduce((a, x) => a + x.troops, 0)));
    };
    const max = (u: UnitType) => Math.max(0, Math.floor(Math.min(troopsLeft, troopCap(game, r.officer, u), weaponLeft(u))));
    return { max, weaponLeft };
  });
  // 상한이 줄면 병력도 맞춤
  useEffect(() => {
    rows.forEach((r, i) => {
      const m = limits[i].max(r.unitType);
      if (r.troops > m) setRow(i, { troops: m });
    });
  });

  // ④ 보급
  const total = rows.reduce((a, r) => a + r.troops, 0);
  const eat = Math.max(1, Math.ceil(total / 20));
  const [food, setFood] = useState(() => Math.min(c.food, Math.ceil(c.troops / 2 / 20) * 6));
  const [gold, setGold] = useState(0);

  const defLead = target ? defenderLeader(game, target) : null;
  const step1 = !!target;
  const step2 = step1 && rows.length > 0;
  const step3 = step2 && rows.every((r) => r.troops > 0);

  return (
    <div className="sheet frame jua side-sheet" style={rectStyle(L.side)}>
      <div className="sheet-head">
        <span className="sheet-title">{CITY_BY_ID[cityId].name} · 출진</span>
        <button className="btn close" onClick={onCancel} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <StepTitle n="①" text="목적지" done={step1} />
        <div className="picker">
          {targets.map((t) => {
            const owner = game.cities[t.id].owner;
            return (
              <button key={t.id} className={`pick-row ${target === t.id ? 'on' : ''}`} onClick={() => setTarget(t.id)}>
                <span className="dot" style={{ background: nationColor(owner) }} />
                <span className="pick-name">{CITY_BY_ID[t.id].name}</span>
                <span className="pick-stat">
                  {nationName(owner)} · 병력 {game.cities[t.id].troops.toLocaleString()} · {t.turns}턴
                </span>
              </button>
            );
          })}
          {targets.length === 0 && <div className="muted">갈 수 있는 성이 없습니다</div>}
        </div>

        <div style={stepStyle(step1)}>
          <StepTitle n="②" text={`장수 (한 명이 한 부대, 최대 ${MAX_UNITS}부대)`} done={step2} />
          {offs.length === 0 ? (
            <div className="warn" style={{ fontSize: 22, textAlign: 'center', padding: '10px 0' }}>
              이 성에는 출진할 장수가 없습니다
            </div>
          ) : (
            <div className="picker">
              {offs.map((o) => {
                const on = rows.some((r) => r.officer === o.id);
                return (
                  <button key={o.id} className={`pick-row ${on ? 'on' : ''}`} onClick={() => toggle(o.id)}>
                    <Portrait officerId={o.id} nation={o.nation} kind="face" size={32} />
                    <span className="pick-name">{officerName(o.id)}</span>
                    <span className="pick-stat">
                      {o.rank} · 무력 {stat(o.id, 'war')} 통솔 {stat(o.id, 'leadership')} · 상한 {troopCap(game, o.id, 'infantry').toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={stepStyle(step2)}>
          <StepTitle n="③" text="부대 편성" done={step3} />
          {rows.map((r, i) => {
            const lim = limits[i];
            const max = lim.max(r.unitType);
            const aptKey = UNIT_APT[r.unitType];
            const grade = aptOf(game, r.officer, aptKey);
            const aptM = APT_MULT[grade];
            const atk = unitAttack(r.unitType, r.troops, stat(r.officer, 'war'), c.training) * aptM;
            const def = unitDefense(r.unitType, r.troops, stat(r.officer, 'leadership')) * aptM;
            const m = matchup(r.unitType, 'infantry');
            return (
              <div key={r.officer} className="nation-row" style={{ borderColor: 'var(--line)' }}>
                <div className="nation-row-head">
                  <Portrait officerId={r.officer} nation={nation} kind="face" size={26} />
                  <b>{officerName(r.officer)}</b>
                  <span>
                    {aptKey} <b style={{ color: APT_COLOR[grade] }}>{grade}</b> ×{aptM}
                  </span>
                  <span className="muted">상한 {troopCap(game, r.officer, r.unitType).toLocaleString()}</span>
                </div>
                <div className="seg wrap">
                  {usable.map((u) => {
                    const need = UNIT_STATS[u].weapons;
                    const lack = need.length > 0 && lim.weaponLeft(u) <= 0;
                    const why = lack ? `${need.map((k) => WEAPON_NAME[k]).join('+')} 없음` : `${need.map((k) => WEAPON_NAME[k]).join('+') || '무기 없음'}`;
                    return (
                      <button
                        key={u}
                        className={`btn ${r.unitType === u ? 'on' : ''}`}
                        disabled={lack}
                        title={why}
                        onClick={() => setRow(i, { unitType: u, troops: Math.min(r.troops, lim.max(u)) })}
                      >
                        {UNIT_NAME[u]}{' '}
                        <small style={{ color: APT_COLOR[aptOf(game, r.officer, UNIT_APT[u])] }}>
                          {UNIT_APT[u]}
                          {aptOf(game, r.officer, UNIT_APT[u])}
                        </small>
                        {lack && <small> ({why})</small>}
                      </button>
                    );
                  })}
                </div>
                <label className="slider">
                  <span>
                    병력 {r.troops.toLocaleString()} / {max.toLocaleString()}
                  </span>
                  <input type="range" min={0} max={max} step={100} value={Math.min(r.troops, max)} onChange={(e) => setRow(i, { troops: +e.target.value })} />
                </label>
                <div className="muted">
                  공격 {Math.round(atk).toLocaleString()} · 방어 {Math.round(def).toLocaleString()} · 수비군(보병) 상대 {matchText(m)}
                  {defLead && ` · 수비 대장 ${officerName(defLead)}`}
                </div>
              </div>
            );
          })}
        </div>

        <div style={stepStyle(step3)}>
          <StepTitle n="④" text="보급" done={step3} />
          <label className="slider">
            <span>
              쌀(군량) {food.toLocaleString()} / {c.food.toLocaleString()} · 약 {Math.floor(food / eat)}턴 버팀
            </span>
            <input type="range" min={0} max={c.food} step={50} value={food} onChange={(e) => setFood(+e.target.value)} />
          </label>
          <label className="slider">
            <span>
              금 {gold.toLocaleString()} / {c.gold.toLocaleString()} <small className="muted">점령한 성의 민심 수습에 씀</small>
            </span>
            <input type="range" min={0} max={c.gold} step={50} value={gold} onChange={(e) => setGold(+e.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            className="btn btn-gold"
            disabled={!step3}
            onClick={() => target && onConfirm({ cityId, target, units: rows.map((r) => ({ ...r })), food, gold })}
          >
            출진
          </button>
        </div>
      </div>
    </div>
  );
}
