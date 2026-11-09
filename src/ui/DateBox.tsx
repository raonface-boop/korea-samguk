import { GameState, SEASONS, dateLabel, officerName, rulerOf } from '../game/state';
import { asset } from './assets';
import { L, rectStyle } from './Stage';

// 계절 그림은 아직 봄 한 장뿐이라 모든 계절에 쓴다
const SEASON_PIC = ['ui/season_spring.jpg', 'ui/season_spring.jpg', 'ui/season_spring.jpg', 'ui/season_spring.jpg'];

export default function DateBox({ game }: { game: GameState }) {
  const d = L.date;
  const ruler = rulerOf(game, game.player);
  return (
    <div className="datebox" style={{ ...rectStyle(d), backgroundImage: `url(${asset(d.image)})` }}>
      <div className="datebox-text jua" style={rectStyle(d.text)}>
        <div className="date-big">{dateLabel(game)}</div>
        <div className="date-ruler">
          {ruler ? officerName(ruler.id) : '군주 없음'}
        </div>
      </div>
      <div className="datebox-season" style={rectStyle(d.seasonPic)}>
        <img src={asset(SEASON_PIC[game.season])} alt="" />
        <span className="jua">{SEASONS[game.season]}</span>
      </div>
    </div>
  );
}
