import { useEffect, useMemo, useState } from 'react';
import {
  APT_KEYS,
  APT_MULT,
  CITY_BY_ID,
  GameState,
  UNIT_NAME,
  UnitType,
  WEAPON_NAME,
  aptOf,
  officerName,
  stat,
} from '../game/state';
import { availableOfficers } from '../game/domestic';
import {
  MarchOrder,
  UNIT_APT,
  UNIT_STATS,
  defenderLeader,
  findPath,
  recommendUnit,
  troopCap,
  turnsFor,
  unitAttack,
  unitDefense,
  unlockedUnits,
} from '../game/military';
import Portrait from './Portrait';
import { APT_COLOR } from './OfficerViews';

interface Props {
  game: GameState;
  cityId: string;
  /** 지도에서 고른 목표 성 (남의 성) */
  target: string;
  onCancel: () => void;
  onConfirm: (order: MarchOrder) => void;
}

/** 출진 편성 팝업에서 고른 부대 (지도 강조용) */
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

/** 출진 편성 팝업 (지도 칸 가운데) */
export default function MarchSheet({ game, cityId, target, onCancel, onConfirm }: Props) {
  const c = game.cities[cityId];
  const nation = c.owner;
  const offs = useMemo(
    () => availableOfficers(game, cityId).sort((a, b) => stat(b.id, 'war') + stat(b.id, 'leadership') - stat(a.id, 'war') - stat(a.id, 'leadership')),
    [game, cityId],
  );
  const unlocked = unlockedUnits(game, nation);
  const usable = ALL_UNITS.filter((u) => unlocked.includes(u) && (!UNIT_STATS[u].only || UNIT_STATS[u].only === nation));
  const path = findPath(game, cityId, target, nation);
  const defLead = defenderLeader(game, target);
  const [rows, setRows] = useState<Row[]>([]);

  /** 앞 줄들이 쓴 무기를 뺀, 이 병과로 갖출 수 있는 수 */
  const weaponLeftFor = (before: Row[]) => (u: UnitType) => {
    const need = UNIT_STATS[u].weapons;
    if (!need.length) return Infinity;
    return Math.min(...need.map((k) => c.weapons[k] - before.filter((x) => UNIT_STATS[x.unitType].weapons.includes(k)).reduce((a, x) => a + x.troops, 0)));
  };
  const maxFor = (r: Row, before: Row[], u: UnitType) => {
    const troopsLeft = c.troops - before.reduce((a, x) => a + x.troops, 0);
    return Math.max(0, Math.floor(Math.min(troopsLeft, troopCap(game, r.officer, u), weaponLeftFor(before)(u))));
  };

  /** 추천 병과 (장수 목록 표시용: 이 성 무기 전체 기준, 그 장수 상한만큼) */
  const recOf = (officer: string) => recommendUnit(game, cityId, officer, Math.min(c.troops, troopCap(game, officer, 'infantry')));

  const toggle = (id: string) =>
    setRows((rs) => {
      if (rs.some((r) => r.officer === id)) return rs.filter((r) => r.officer !== id);
      if (rs.length >= MAX_UNITS) return rs;
      // 남은 병력을 아직 병력 안 받은 장수 수로 나눈 몫과 그 장수 상한 중 작은 값으로 채움
      const used = rs.reduce((a, r) => a + r.troops, 0);
      const empty = rs.filter((r) => r.troops <= 0).length + 1;
      const share = Math.floor((c.troops - used) / empty);
      const want = Math.max(0, Math.min(share, troopCap(game, id, 'infantry')));
      const unitType = recommendUnit(game, cityId, id, want, weaponLeftFor(rs));
      const troops = Math.max(0, Math.min(want, maxFor({ officer: id, unitType, troops: 0 }, rs, unitType)));
      return [...rs, { officer: id, unitType, troops }];
    });
  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const fillAll = () =>
    setRows((rs) => {
      const out: Row[] = [];
      for (const r of rs) out.push({ ...r, troops: maxFor(r, out, r.unitType) });
      return out;
    });
  // 앞 줄이 바뀌어 상한이 줄면 병력도 맞춤
  useEffect(() => {
    rows.forEach((r, i) => {
      const m = maxFor(r, rows.slice(0, i), r.unitType);
      if (r.troops > m) setRow(i, { troops: m });
    });
  });

  const total = rows.reduce((a, r) => a + r.troops, 0);
  const eat = Math.max(1, Math.ceil(total / 20));
  const [food, setFood] = useState(() => Math.min(c.food, Math.ceil(c.troops / 2 / 20) * 6));
  const [gold, setGold] = useState(0);
  const turns = path ? Math.max(turnsFor(path, 'infantry'), ...rows.map((r) => turnsFor(path, r.unitType))) : 0;
  const ok = rows.length > 0 && total > 0 && !!path;

  return (
    <div className="march-popup frame jua">
      <div className="sheet-head">
        <span className="sheet-title">출진 편성</span>
        <button className="btn close" onClick={onCancel} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="march-head">
        <b>{CITY_BY_ID[cityId].name}</b> → <b>{CITY_BY_ID[target].name}</b> · 목표 병력 {game.cities[target].troops.toLocaleString()} · 수비 대장{' '}
        {defLead ? officerName(defLead) : '없음'} · 도착 {turns}턴
      </div>
      <div className="march-scroll">
        {offs.length === 0 ? (
          <div className="warn" style={{ fontSize: 22, textAlign: 'center', padding: '12px 0' }}>
            이 성에는 출진할 장수가 없습니다
          </div>
        ) : (
          <div className="march-officers">
            {offs.map((o) => {
              const on = rows.some((r) => r.officer === o.id);
              const rec = recOf(o.id);
              const recG = aptOf(game, o.id, UNIT_APT[rec]);
              return (
                <button key={o.id} className={`march-off ${on ? 'on' : ''}`} onClick={() => toggle(o.id)}>
                  <Portrait officerId={o.id} nation={o.nation} kind="face" size={30} />
                  <span className="mo-name">{officerName(o.id)}</span>
                  <span className="mo-rank">{o.rank}</span>
                  <span className="mo-stats">
                    무{stat(o.id, 'war')} 통{stat(o.id, 'leadership')} 지{stat(o.id, 'intelligence')}
                  </span>
                  <span className="mo-apt">
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
                  <span className="mo-rec">
                    추천: {UNIT_NAME[rec]} {recG}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {rows.length > 0 && (
          <div className="march-rows">
            {rows.map((r, i) => {
              const before = rows.slice(0, i);
              const left = weaponLeftFor(before);
              const max = maxFor(r, before, r.unitType);
              const g = aptOf(game, r.officer, UNIT_APT[r.unitType]);
              const m = APT_MULT[g];
              const atk = unitAttack(r.unitType, r.troops, stat(r.officer, 'war'), c.training) * m;
              const def = unitDefense(r.unitType, r.troops, stat(r.officer, 'leadership')) * m;
              return (
                <div key={r.officer} className="march-row">
                  <div className="march-row-head">
                    <b className="mo-name">{officerName(r.officer)}</b>
                    <span>
                      {UNIT_APT[r.unitType]} <b style={{ color: APT_COLOR[g] }}>{g}</b> ×{m}
                    </span>
                    <span className="muted">
                      공격 {Math.round(atk).toLocaleString()} · 방어 {Math.round(def).toLocaleString()}
                    </span>
                  </div>
                  <div className="seg wrap">
                    {usable.map((u) => {
                      const need = UNIT_STATS[u].weapons;
                      const lack = need.length > 0 && left(u) <= 0;
                      const ug = aptOf(game, r.officer, UNIT_APT[u]);
                      return (
                        <button
                          key={u}
                          className={`btn ${r.unitType === u ? 'on' : ''}`}
                          disabled={lack}
                          onClick={() => setRow(i, { unitType: u, troops: Math.min(r.troops || max, maxFor(r, before, u)) })}
                        >
                          {UNIT_NAME[u]} <small style={{ color: APT_COLOR[ug] }}>{ug}</small>
                          {lack && <small> ({need.map((k) => WEAPON_NAME[k]).join('·')} 없음)</small>}
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
                </div>
              );
            })}
          </div>
        )}

        <label className="slider">
          <span>
            쌀 {food.toLocaleString()} / {c.food.toLocaleString()} · 약 {Math.floor(food / eat)}턴 버팀
          </span>
          <input type="range" min={0} max={c.food} step={50} value={food} onChange={(e) => setFood(+e.target.value)} />
        </label>
        <label className="slider">
          <span>
            금 {gold.toLocaleString()} / {c.gold.toLocaleString()} <small className="muted">점령한 성의 민심 수습에 씀</small>
          </span>
          <input type="range" min={0} max={c.gold} step={50} value={gold} onChange={(e) => setGold(+e.target.value)} />
        </label>
        <button className="btn" disabled={!rows.length} onClick={fillAll}>
          모두 최대
        </button>
      </div>
      <div className="march-foot">
        <span>
          출진 {rows.length}부대 · 총병력 {total.toLocaleString()} · 총대장 {rows[0] ? officerName(rows[0].officer) : '-'} · 도착 {turns}턴
        </span>
        <span className="actions">
          <button className="btn" onClick={onCancel}>
            취소
          </button>
          <button className="btn btn-gold" disabled={!ok} onClick={() => onConfirm({ cityId, target, units: rows.map((r) => ({ ...r })), food, gold })}>
            출진
          </button>
        </span>
      </div>
    </div>
  );
}
