import { useState } from 'react';
import { AiLevelId } from '../game/ai';
import { asset } from './assets';
import NationSelect from './NationSelect';

interface Props {
  canContinue: boolean;
  onContinue: () => void;
  onStart: (nation: string, level: AiLevelId, scenario: string) => void;
}

/** 시작 화면: 이어 하기 / 새로 시작 (시나리오 → 세력 → AI 수준) */
export default function TitleScreen({ canContinue, onContinue, onStart }: Props) {
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="title-screen" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.6), rgba(0,0,0,.6)), url(${asset('map/v2/summer_small.webp')})` }}>
      {choosing ? (
        <NationSelect onStart={onStart} onBack={() => setChoosing(false)} />
      ) : (
        <div className="title-win frame jua">
          <h1 className="title">한반도 삼국지</h1>
          {canContinue && (
            <button className="btn btn-gold big" onClick={onContinue}>
              이어 하기
            </button>
          )}
          <button className="btn btn-gold big" onClick={() => setChoosing(true)}>
            새로 시작
          </button>
        </div>
      )}
    </div>
  );
}
