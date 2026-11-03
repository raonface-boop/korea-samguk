import { useState } from 'react';
import { CITY_BY_ID, GameState, WEAPON_KINDS, WEAPON_NAME, WeaponKind, officerName, stat } from '../game/state';
import {
  COMMAND_NAME,
  COMMAND_STAT,
  CommandArgs,
  CommandId,
  STAT_NAME,
  availableOfficers,
  recommendOfficer,
  weaponPrice,
} from '../game/domestic';
import Portrait from './Portrait';

interface Props {
  game: GameState;
  cityId: string;
  cmd: Exclude<CommandId, 'march'>;
  onCancel: () => void;
  onConfirm: (officerId: string, args: CommandArgs) => void;
}

const EFFECT: Record<Exclude<CommandId, 'march'>, string> = {
  farm: '농업 + 정치/10',
  market: '상업 + 정치/10',
  flood: '치수 + 정치/10',
  fortify: '방어 + 통솔/10 (겨울 2배)',
  military: '징병: 병력 + 인구의 2% / 훈련: 훈련도 + 통솔/10',
  arms: '금을 써서 무기 생산',
  relief: '군량 - 인구의 5%, 민심 +10',
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

export default function CommandSheet({ game, cityId, cmd, onCancel, onConfirm }: Props) {
  const c = game.cities[cityId];
  const [officer, setOfficer] = useState<string | null>(() => recommendOfficer(game, cityId, cmd));
  const [conscript, setConscript] = useState(true);
  const [weapon, setWeapon] = useState<WeaponKind>('spear');
  const [gold, setGold] = useState(() => Math.min(c.gold, 1000));
  const statKey = cmd === 'military' && !conscript ? 'leadership' : COMMAND_STAT[cmd];

  let warn: string | null = null;
  if (cmd === 'military' && conscript && c.gold < Math.floor(c.population * 0.005)) warn = '금이 모자랍니다';
  if (cmd === 'relief' && c.food < Math.floor(c.population * 0.05)) warn = '군량이 모자랍니다';
  if (cmd === 'arms' && gold <= 0) warn = '쓸 금을 정하시오';

  const price = weaponPrice(cityId, weapon);
  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className="sheet-title">
          {CITY_BY_ID[cityId].name} · {COMMAND_NAME[cmd]}
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
              징병 (+{Math.floor(c.population * 0.02)})
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
                금 {gold.toLocaleString()} / {c.gold.toLocaleString()} → {WEAPON_NAME[weapon]} {Math.floor(gold / price).toLocaleString()}개
                (1개 금 {price})
              </span>
              <input type="range" min={0} max={c.gold} step={10} value={gold} onChange={(e) => setGold(+e.target.value)} />
            </label>
          </>
        )}
        <div className="kv">
          <b>맡길 장수</b>
        </div>
        <OfficerPicker game={game} cityId={cityId} statKey={statKey} value={officer} onChange={setOfficer} />
        {warn && <div className="warn">{warn}</div>}
        <div className="actions">
          <button className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            className="btn btn-gold"
            disabled={!officer || !!warn}
            onClick={() => officer && onConfirm(officer, { conscript, weapon, gold })}
          >
            실행
          </button>
        </div>
      </div>
    </div>
  );
}
