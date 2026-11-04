import commandsData from '../data/commands.json';

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

interface Props {
  group: CmdGroup;
  onPick: (item: CmdItem) => void;
  onCancel: () => void;
}

/** 세부 명령 목록: 지도 가운데에 두 줄로 "▸ 이름" */
export default function CommandMenu({ group, onPick, onCancel }: Props) {
  const items = group.items ?? [];
  return (
    <div className="map-center">
      <div className="cmd-menu frame jua">
        <div className="win-title">{group.label}</div>
        <div className="cmd-menu-grid">
          {items.map((it) => (
            <button key={it.label} className="cmd-item" onClick={() => onPick(it)} title={it.desc || undefined}>
              ▸ {it.label}
            </button>
          ))}
          <button className="cmd-item cancel" onClick={onCancel}>
            ▸ 취소
          </button>
        </div>
      </div>
    </div>
  );
}
