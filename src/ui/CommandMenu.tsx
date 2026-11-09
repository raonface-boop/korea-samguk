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

/** 오른쪽 판 명령 버튼: ui_layout.json 의 commands 순서·칸대로 commands.json 의 묶음을 찾아 붙임 */
export function sideCommands(): { group: CmdGroup; box: number[] }[] {
  return L.commands
    .map((c) => {
      const list = c.group === 'row' ? COMMANDS.row : COMMANDS.big;
      const group = list.find((g) => g.label === c.label);
      // 없는 묶음은 그 칸만 건너뜀 (화면 전체가 멈추지 않게)
      if (!group) console.warn(`commands.json 에 ${c.group}:${c.label} 이 없어 건너뜁니다`);
      return group ? { group, box: c.box } : null;
    })
    .filter((x): x is { group: CmdGroup; box: number[] } => x !== null);
}

/** 세부 명령 목록 자리: 누른 버튼 바로 왼쪽, 위는 버튼 높이에 맞추되 화면 밖으로 나가지 않게 */
function menuPos(group: CmdGroup, count: number) {
  const m = L.cmdMenu;
  const box = sideCommands().find((c) => c.group === group)?.box ?? L.commands[0].box;
  const h = count * m.itemH + m.pad * 2;
  const top = Math.max(0, Math.min(box[1], L.stage.h - h));
  return { left: box[0] - m.gap - m.w, top, width: m.w };
}

interface Props {
  group: CmdGroup;
  onPick: (item: CmdItem) => void;
  onCancel: () => void;
  /** 명령 설명을 대화창에 (null 이면 지움) */
  onHint: (item: CmdItem | null) => void;
}

/** 세부 명령: 누른 버튼 바로 왼쪽에 세로로 펼쳐지는 목록 */
export default function CommandMenu({ group, onPick, onCancel, onHint }: Props) {
  const items = group.items ?? [];
  const [pressed, setPressed] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

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
      <div className="cmd-band frame" style={{ ...menuPos(group, cells.length), padding: L.cmdMenu.pad }}>
        {cells.map((it) => (
          <button
            key={it.label}
            style={{ height: L.cmdMenu.itemH }}
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
