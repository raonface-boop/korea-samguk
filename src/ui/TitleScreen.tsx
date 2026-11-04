import { NATIONS, OFFICER_DATA_BY_ID } from '../game/state';
import { asset } from './assets';
import Portrait from './Portrait';

interface Props {
  canContinue: boolean;
  onContinue: () => void;
  onStart: (nation: string) => void;
}

export default function TitleScreen({ canContinue, onContinue, onStart }: Props) {
  const playable = NATIONS.filter((n) => n.playable);
  return (
    <div className="title-screen" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.6), rgba(0,0,0,.6)), url(${asset('map/season/summer.jpg')})` }}>
      <div className="title-win frame jua">
        <h1 className="title">한반도 삼국지</h1>
        <div className="scenario">
          <div className="scenario-year">346년 봄</div>
          <div className="scenario-desc">근초고왕이 백제의 왕위에 오르다. 고구려·백제·신라·가야·부여, 그리고 요동의 전연.</div>
        </div>
        {canContinue && (
          <button className="btn btn-gold big" onClick={onContinue}>
            이어 하기
          </button>
        )}
        <h2 className="choose">나라를 고르시오</h2>
        <div className="nation-list">
          {playable.map((n) => {
            const ruler = n.ruler ? OFFICER_DATA_BY_ID[n.ruler] : null;
            return (
              <button key={n.id} className="nation-card" onClick={() => onStart(n.id)} style={{ borderColor: n.color }}>
                <img className="nation-flag-img" src={asset(`sprites/flag_${n.id}.png`)} alt="" />
                {ruler && <Portrait officerId={ruler.id} nation={n.id} kind="face" size={48} />}
                <div className="nation-info">
                  <div className="nation-name" style={{ color: n.color }}>
                    {n.name}
                  </div>
                  <div className="nation-ruler">군주 {ruler?.name ?? '-'}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
