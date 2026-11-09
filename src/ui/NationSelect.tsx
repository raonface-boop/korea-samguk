import { useState } from 'react';
import { CITIES, CITY_BY_ID, NATIONS, NATION_BY_ID, OFFICERS, START_YEAR, nationColor } from '../game/state';
import { AI_LEVELS, AiLevelId } from '../game/ai';
import { asset } from './assets';
import Portrait from './Portrait';
import { IMG_H, IMG_W, IMG_X, IMG_Y } from './MapView';

/** 시나리오 목록 (지금은 하나, 나중에 더함) */
const SCENARIOS = [
  {
    id: '346',
    title: '346년 봄 군웅할거',
    sub: '영웅이 무리 지어 일어난 때',
    desc: [
      '부여구(근초고왕)가 백제의 왕위에 오르고, 고구려는 전연에게 환도성을 잃은 상처를 추스른다.',
      '부여 왕 현은 전연에 사로잡혀 갔고, 남쪽에는 마한 소국과 가야, 바다 건너 왜가 저마다 힘을 겨룬다.',
    ],
    faces: ['goguryeo', 'baekje', 'silla'],
  },
];

/** 세력 선택: 난이도 별과 조언 */
const NATION_TIPS: Record<string, { stars: number; tip: string }> = {
  goguryeo: { stars: 2, tip: '서쪽 전연의 위협이 크다. 요동을 지키며 남쪽 땅을 다질 것' },
  baekje: { stars: 2, tip: '부여구(근초고왕)의 치세가 막 열렸다. 남쪽 마한을 거두어 힘을 키울 것' },
  gaya: { stars: 3, tip: '철은 넘치나 말이 없다. 바다 건너 왜와 손잡을 것' },
  silla: { stars: 4, tip: '땅은 좁고 사방이 강국이다. 동해안을 따라 숨을 고를 것' },
  mahan: { stars: 4, tip: '소국들의 마음이 흩어져 있다. 연맹부터 하나로 묶을 것' },
  dongbuyeo: { stars: 4, tip: '북쪽 끝 외딴 땅. 고구려의 눈을 피해 힘을 기를 것' },
  buyeo: { stars: 5, tip: '왕이 전연에 붙잡혀 갔다. 나라를 보전하는 것이 급선무' },
  tamna: { stars: 5, tip: '섬 하나뿐이다. 배를 모아 바닷길을 여는 것이 먼저' },
};

/** 시작 때 나라 살림 (데이터에서 바로 셈) */
function nationSummary(id: string) {
  const cities = CITIES.filter((c) => c.owner === id);
  return {
    cities: cities.length,
    gold: cities.reduce((a, c) => a + Math.floor(c.population / 20), 0),
    food: cities.reduce((a, c) => a + Math.floor(c.population / 5), 0),
    troops: cities.reduce((a, c) => a + c.troops, 0),
    officers: OFFICERS.filter((o) => o.nation === id && !o.isRonin && (o.debut ?? START_YEAR) <= START_YEAR).length,
  };
}

const MAP_BOX_W = 300;

export default function NationSelect({ onStart, onBack }: { onStart: (nation: string, level: AiLevelId, scenario: string) => void; onBack: () => void }) {
  const [step, setStep] = useState<'scenario' | 'nation' | 'level'>('scenario');
  const [scenario, setScenario] = useState(SCENARIOS[0].id);
  const playable = NATIONS.filter((n) => n.playable);
  const [nation, setNation] = useState(playable[0]?.id ?? '');
  const [level, setLevel] = useState<AiLevelId>('normal');
  const sc = SCENARIOS.find((x) => x.id === scenario) ?? SCENARIOS[0];

  if (step === 'scenario') {
    return (
      <div className="ns-win frame jua">
        <div className="ns-title">시나리오 선택</div>
        <div className="ns-scenario">
          <div className="ns-list">
            {SCENARIOS.map((x) => (
              <button key={x.id} className={`ns-item ${x.id === scenario ? 'on' : ''}`} onClick={() => setScenario(x.id)}>
                {x.title}
                <small className="muted"> — {x.sub}</small>
              </button>
            ))}
          </div>
          <div className="ns-desc">
            {sc.desc.map((d, i) => (
              <p key={i}>{d}</p>
            ))}
            <div className="ns-faces">
              {sc.faces.map((n) => {
                const r = NATION_BY_ID[n]?.ruler;
                return r ? (
                  <div key={n} className="ns-face">
                    <Portrait officerId={r} nation={n} kind="face" size={64} />
                    <small style={{ color: nationColor(n) }}>{NATION_BY_ID[n].name}</small>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={onBack}>
            돌아가기
          </button>
          <button className="btn btn-gold big" onClick={() => setStep('nation')}>
            다음
          </button>
        </div>
      </div>
    );
  }

  if (step === 'level') {
    return (
      <div className="ns-win frame jua">
        <div className="ns-title">AI 수준 선택</div>
        <div className="ns-levels">
          {AI_LEVELS.map((l) => (
            <button key={l.id} className={`ns-item ${level === l.id ? 'on' : ''}`} disabled={l.locked} onClick={() => setLevel(l.id)}>
              {l.locked ? '🔒 ' : ''}
              {l.name}
              <small className="muted"> — {l.locked ? '아직 열리지 않음' : l.desc}</small>
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setStep('nation')}>
            돌아가기
          </button>
          <button className="btn btn-gold big" onClick={() => onStart(nation, level, scenario)}>
            시작
          </button>
        </div>
      </div>
    );
  }

  // 세력 선택 (삼국지14 방식)
  const n = NATION_BY_ID[nation];
  const sum = nationSummary(nation);
  const tip = NATION_TIPS[nation] ?? { stars: 3, tip: '' };
  const k = MAP_BOX_W / IMG_W;
  return (
    <div className="ns-win wide frame jua">
      <div className="ns-title">세력 선택 · {sc.title}</div>
      <div className="ns-nation">
        <div className="ns-left">
          <div className="ns-ruler">{n?.ruler && <Portrait officerId={n.ruler} nation={nation} kind="full" w={180} h={240} />}</div>
          <div className="ns-name" style={{ color: nationColor(nation) }}>
            {n?.name}
          </div>
          <div className="ns-stats">
            <div>금 {sum.gold.toLocaleString()}</div>
            <div>군량 {sum.food.toLocaleString()}</div>
            <div>병사 {sum.troops.toLocaleString()}</div>
            <div>도시 {sum.cities}</div>
            <div>현역 장수 {sum.officers}</div>
          </div>
        </div>
        <div className="ns-mid">
          <div className="ns-stars">
            난이도{' '}
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={i <= tip.stars ? 'on' : ''}>
                ★
              </span>
            ))}
          </div>
          <div className="ns-tip">{tip.tip}</div>
        </div>
        <div className="ns-map" style={{ width: MAP_BOX_W, height: (IMG_H * MAP_BOX_W) / IMG_W }}>
          <img src={asset('map/v2/summer_small.webp')} alt="" draggable={false} />
          {playable.map((p) => {
            const cap = p.capital ? CITY_BY_ID[p.capital] : CITIES.find((c) => c.owner === p.id);
            if (!cap) return null;
            return (
              <button
                key={p.id}
                className={`ns-flag ${p.id === nation ? 'on' : ''}`}
                style={{ left: (cap.x - IMG_X) * k, top: (cap.y - IMG_Y) * k, background: p.color }}
                onClick={() => setNation(p.id)}
                title={p.name}
              >
                {[...p.name][0]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="ns-rulers">
        {playable.map((p) => (
          <button key={p.id} className={`ns-ruler-btn ${p.id === nation ? 'on' : ''}`} onClick={() => setNation(p.id)} style={{ borderColor: p.color }}>
            {p.ruler && <Portrait officerId={p.ruler} nation={p.id} kind="face" size={48} />}
            <small style={{ color: p.color }}>{p.name}</small>
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn" onClick={() => setStep('scenario')}>
          돌아가기
        </button>
        <button className="btn btn-gold big" onClick={() => setStep('level')}>
          이 나라로
        </button>
      </div>
    </div>
  );
}
