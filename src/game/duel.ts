// 일기토
import { DuelResult, DuelRound, officerName, stat } from './state';

export const DUEL_MIN_WAR = 60;

export function canDuel(a: string | null, b: string | null): boolean {
  return !!a && !!b && stat(a, 'war') >= DUEL_MIN_WAR && stat(b, 'war') >= DUEL_MIN_WAR;
}

function hitLine(atk: string, def: string, dmg: number): string {
  const A = officerName(atk);
  const D = officerName(def);
  if (dmg >= 20) return `${A}의 일격! ${D}이(가) 크게 휘청인다`;
  if (dmg >= 16) return `${A}의 창끝이 ${D}의 갑옷을 꿰뚫는다`;
  if (dmg >= 12) return `${A}이(가) 몰아치자 ${D}이(가) 뒤로 밀린다`;
  return `${A}의 공격을 ${D}이(가) 겨우 막아낸다`;
}

/** 일기토 진행. a 가 공격 측 대장 */
export function runDuel(
  a: { id: string; nation: string },
  b: { id: string; nation: string },
  city: string,
): DuelResult {
  let hpA = 100;
  let hpB = 100;
  const rounds: DuelRound[] = [];
  const wa = stat(a.id, 'war');
  const wb = stat(b.id, 'war');
  for (let r = 1; r <= 10 && hpA > 0 && hpB > 0; r++) {
    const atkA = wa * (0.8 + Math.random() * 0.4);
    const atkB = wb * (0.8 + Math.random() * 0.4);
    const dB = Math.round(atkA / 5);
    const dA = Math.round(atkB / 5);
    // 더 센 쪽이 먼저
    if (atkA >= atkB) {
      hpB = Math.max(0, hpB - dB);
      rounds.push({ text: `${r}합: ${hitLine(a.id, b.id, dB)}`, hpA, hpB });
      if (hpB > 0) {
        hpA = Math.max(0, hpA - dA);
        rounds.push({ text: `${r}합: ${hitLine(b.id, a.id, dA)}`, hpA, hpB });
      }
    } else {
      hpA = Math.max(0, hpA - dA);
      rounds.push({ text: `${r}합: ${hitLine(b.id, a.id, dA)}`, hpA, hpB });
      if (hpA > 0) {
        hpB = Math.max(0, hpB - dB);
        rounds.push({ text: `${r}합: ${hitLine(a.id, b.id, dB)}`, hpA, hpB });
      }
    }
  }
  const winner: 'a' | 'b' = hpA === hpB ? (wa >= wb ? 'a' : 'b') : hpA > hpB ? 'a' : 'b';
  const w = winner === 'a' ? a.id : b.id;
  return { a, b, rounds, winner, outcome: `${officerName(w)} 승리`, city };
}
