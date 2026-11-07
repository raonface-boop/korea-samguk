import { CITY_BY_ID, GameState } from '../game/state';

export type CityMenuAction = '출병' | '정보' | '출진' | '이동' | '수송' | '담당관' | '도시정보';

/** 지도에서 성을 누르면 성 옆에 뜨는 작은 메뉴. 남의 성: 출병·정보 / 내 성: 출진·이동·수송·담당관·도시정보 */
export default function CityMenu({
  game,
  cityId,
  x,
  y,
  onPick,
  onClose,
}: {
  game: GameState;
  cityId: string;
  /** 무대 좌표 */
  x: number;
  y: number;
  onPick: (a: CityMenuAction) => void;
  onClose: () => void;
}) {
  const mine = game.cities[cityId].owner === game.player;
  const items: CityMenuAction[] = mine ? ['출진', '이동', '수송', '담당관', '도시정보'] : ['출병', '정보'];
  return (
    <>
      {/* 메뉴 밖을 누르면 닫힘 */}
      <div className="city-menu-back" onClick={onClose} />
      <div className="city-menu frame jua" style={{ left: x, top: y }}>
        <div className="city-menu-title">{CITY_BY_ID[cityId].name}</div>
        {items.map((a) => (
          <button key={a} className="city-menu-item" onClick={() => onPick(a)}>
            {a}
          </button>
        ))}
      </div>
    </>
  );
}
