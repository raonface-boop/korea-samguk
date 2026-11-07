import { OFFICER_DATA_BY_ID, nationColor } from '../game/state';
import { asset } from './assets';

interface Props {
  officerId: string;
  nation: string;
  kind: 'face' | 'full';
  size?: number;
  /** 칸 크기를 직접 정할 때 (증명사진 칸 등) */
  w?: number;
  h?: number;
}

/** 장수 그림. 없으면 나라 색 바탕에 이름 카드 */
export default function Portrait({ officerId, nation, kind, size = 56, w: fw, h: fh }: Props) {
  const d = OFFICER_DATA_BY_ID[officerId];
  const src = d?.portrait ? d.portrait[kind] : null;
  const w = fw ?? (kind === 'face' ? size : size * 2.4);
  const h = fh ?? (kind === 'face' ? size * 1.2 : size * 3.2);
  if (src) {
    return <img className={`portrait portrait-${kind}`} src={asset(src)} alt={d.name} style={{ width: w, height: h }} draggable={false} />;
  }
  const name = d?.name ?? '?';
  const big = fw !== undefined || kind === 'full';
  return (
    <div
      className={`portrait portrait-card portrait-${kind} jua`}
      style={{ width: w, height: h, background: nationColor(nation), fontSize: big ? Math.min(w / Math.max(2, name.length), 40) : w * 0.55 }}
    >
      {big ? name : name[0]}
    </div>
  );
}
