import { useMemo, useState } from 'react';
import {
  CITY_BY_ID,
  GameState,
  UNIT_NAME,
  WEAPON_NAME,
  WeaponKind,
  nationColor,
  nationName,
  officerName,
  stat,
} from '../game/state';
import { availableOfficers } from '../game/domestic';
import { MarchOrder, armedCount, findPath, reachableTargets, turnsFor, unitTypeOf } from '../game/military';
import Portrait from './Portrait';

interface Props {
  game: GameState;
  cityId: string;
  onCancel: () => void;
  onConfirm: (order: MarchOrder) => void;
}

type WeaponChoice = WeaponKind | 'heavy';
const CHOICES: WeaponChoice[] = ['spear', 'bow', 'horse', 'crossbow', 'heavy'];

export default function MarchSheet({ game, cityId, onCancel, onConfirm }: Props) {
  const c = game.cities[cityId];
  const offs = availableOfficers(game, cityId).sort((a, b) => stat(b.id, 'leadership') - stat(a.id, 'leadership'));
  const [picked, setPicked] = useState<string[]>(() => (offs[0] ? [offs[0].id] : []));
  const [troops, setTroops] = useState(() => Math.floor(c.troops / 2));
  const [weapon, setWeapon] = useState<WeaponChoice>('spear');
  const [food, setFood] = useState(() => Math.min(c.food, Math.ceil(c.troops / 2 / 20) * 6));
  const unit = unitTypeOf(weapon);
  const targets = useMemo(() => {
    return reachableTargets(game, cityId, c.owner)
      .map((id) => {
        const p = findPath(game, cityId, id, c.owner)!;
        return { id, turns: turnsFor(p, unit) };
      })
      .sort((a, b) => a.turns - b.turns);
  }, [game, cityId, c.owner, unit]);
  const [target, setTarget] = useState<string>(() => targets.find((t) => game.cities[t.id].owner !== c.owner)?.id ?? targets[0]?.id ?? '');

  const toggle = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  };
  const makeLeader = (id: string) => setPicked((p) => [id, ...p.filter((x) => x !== id)]);

  const armed = armedCount(game, cityId, weapon, troops);
  const stock = (k: WeaponChoice) => (k === 'heavy' ? Math.min(c.weapons.horse, c.weapons.armor) : c.weapons[k]);
  const ok = picked.length >= 1 && troops > 0 && !!target;

  return (
    <div className="sheet frame jua">
      <div className="sheet-head">
        <span className="sheet-title">{CITY_BY_ID[cityId].name} · 출진</span>
        <button className="btn close" onClick={onCancel} aria-label="닫기">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <div className="kv">
          <b>장수</b> <span className="muted">1~3명, 별표가 대장</span>
        </div>
        <div className="picker">
          {offs.map((o) => {
            const on = picked.includes(o.id);
            const leader = picked[0] === o.id;
            return (
              <div key={o.id} className={`pick-row ${on ? 'on' : ''}`} onClick={() => toggle(o.id)}>
                <Portrait officerId={o.id} nation={o.nation} kind="face" size={36} />
                <span className="pick-name">{officerName(o.id)}</span>
                <span className="pick-stat">
                  통솔 {stat(o.id, 'leadership')} 무력 {stat(o.id, 'war')}
                </span>
                {on && (
                  <button
                    className={`btn star ${leader ? 'on' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      makeLeader(o.id);
                    }}
                  >
                    {leader ? '★ 대장' : '☆'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <label className="slider">
          <span>
            병력 {troops.toLocaleString()} / {c.troops.toLocaleString()}
          </span>
          <input type="range" min={0} max={c.troops} step={100} value={troops} onChange={(e) => setTroops(+e.target.value)} />
        </label>
        <div className="kv">
          <b>무기</b>
        </div>
        <div className="seg wrap">
          {CHOICES.map((k) => (
            <button key={k} className={`btn ${weapon === k ? 'on' : ''}`} onClick={() => setWeapon(k)}>
              {k === 'heavy' ? '말+철갑' : WEAPON_NAME[k]} ({stock(k).toLocaleString()})
            </button>
          ))}
        </div>
        <div className="muted">
          병종 {UNIT_NAME[unit]} {armed.toLocaleString()}
          {troops - armed > 0 && ` · 맨손 ${(troops - armed).toLocaleString()} (전투력 절반)`}
        </div>
        <label className="slider">
          <span>
            군량 {food.toLocaleString()} / {c.food.toLocaleString()} (약 {troops > 0 ? Math.floor(food / Math.ceil(troops / 20)) : 0}턴)
          </span>
          <input type="range" min={0} max={c.food} step={50} value={food} onChange={(e) => setFood(+e.target.value)} />
        </label>
        <div className="kv">
          <b>목적지</b>
        </div>
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
        <div className="actions">
          <button className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            className="btn btn-gold"
            disabled={!ok}
            onClick={() => onConfirm({ cityId, officers: picked, troops, weapon, food, target })}
          >
            출진
          </button>
        </div>
      </div>
    </div>
  );
}
