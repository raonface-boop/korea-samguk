import { OFFICER_DATA_BY_ID, nationColor } from '../game/state';
import { asset } from './assets';

interface Props {
  officerId: string;
  nation: string;
  kind: 'face' | 'full';
  size?: number;
}

/** 장수 그림. 없으면 나라 색 바탕에 이름 첫 글자 카드 */
export default function Portrait({ officerId, nation, kind, size = 56 }: Props) {
  const d = OFFICER_DATA_BY_ID[officerId];
  const src = d?.portrait ? d.portrait[kind] : null;
  const w = kind === 'face' ? size : size * 2.4;
  const h = kind === 'face' ? size * 1.2 : size * 3.2;
  if (src) {
    return (
      <img
        className={`portrait portrait-${kind}`}
        src={asset(src)}
        alt={d.name}
        style={{ width: w, height: h }}
      />
    );
  }
  return (
    <div
      className={`portrait portrait-card portrait-${kind}`}
      style={{ width: w, height: h, background: nationColor(nation), fontSize: (kind === 'face' ? size : size * 2) * 0.55 }}
    >
      {d?.name?.[0] ?? '?'}
    </div>
  );
}
