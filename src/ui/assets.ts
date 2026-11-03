// 그림 자료 불러오기
import { buildRegionGrid } from '../game/state';

export const BASE = import.meta.env.BASE_URL;
export const asset = (p: string) => `${BASE}${p.replace(/^\//, '')}`;

/** regions.png 의 빨강 채널을 읽어 칸별 지역 번호를 만든다 */
export function loadRegionGrid(): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const red = new Uint8ClampedArray(cv.width * cv.height);
      for (let i = 0; i < red.length; i++) red[i] = data[i * 4];
      resolve(buildRegionGrid(red, cv.width, cv.height));
    };
    img.onerror = () => reject(new Error('regions.png 를 읽지 못했습니다'));
    img.src = asset('map/regions.png');
  });
}

export async function loadCastleSymbols(): Promise<string> {
  const res = await fetch(asset('map/castles.svg'));
  return res.text();
}
