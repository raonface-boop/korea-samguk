import { useRef, useState } from 'react';
import commandsData from '../data/commands.json';
import { L } from './Stage';

export interface CmdItem {
  label: string;
  action: string;
  desc?: string;
}
export interface CmdGroup {
  label: string;
  action?: string;
  desc?: string;
  items?: CmdItem[];
}
export const COMMANDS = commandsData as { top: CmdItem[]; big: CmdGroup[]; row: CmdGroup[]; side: CmdItem[] };

/** 펼침 띠가 시작하는 높이: 아래 줄 바로 밑, 또는 큰 칸 묶음 바로 밑 */
export function bandTop(group: CmdGroup): number {
  if (COMMANDS.row.includes(group)) return Math.max(...L.rowButtons.map((b) => b[3])) + 3;
  return Math.max(...L.bigButtons.map((b) => b[3])) + 5;
}

interface Props {
  group: CmdGroup;
  onPick: (item: CmdItem) => void;
  onCancel: () => void;
  /** 명령 설명을 대화창에 (null 이면 지움) */
  onHint: (item: CmdItem | null) => void;
}

/** 세부 명령: 누른 버튼 줄 바로 아래 패널 안에 가로로 펼쳐지는 띠 */
export default function CommandMenu({ group, onPick, onCancel, onHint }: Props) {
  const items = group.items ?? [];
  const [pressed, setPressed] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const p = L.panel;
  const left = p.x + 12;
  const width = p.w - 24;

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const down = (e: React.PointerEvent, it: CmdItem) => {
    setPressed(it.label);
    longPressed.current = false;
    if (e.pointerType === 'mouse') return;
    clearTimer();
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onHint(it);
    }, 450);
  };
  const up = () => {
    clearTimer();
    setPressed(null);
  };
  const click = (it: CmdItem) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onPick(it);
  };

  const cells = [...items, { label: '취소', action: 'cancel' } as CmdItem];
  return (
    <>
      <div className="band-back" onClick={onCancel} />
      <div className="cmd-band frame" style={{ left, top: bandTop(group), width }}>
        {cells.map((it) => (
          <button
            key={it.label}
            className={`band-cell jua ${pressed === it.label ? 'on' : ''} ${it.action === 'cancel' ? 'cancel' : ''}`}
            onPointerDown={(e) => down(e, it)}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerEnter={(e) => e.pointerType === 'mouse' && it.action !== 'cancel' && onHint(it)}
            onPointerLeave={() => {
              up();
              onHint(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => (it.action === 'cancel' ? onCancel() : click(it))}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}
