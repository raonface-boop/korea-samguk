import { useEffect, useState } from 'react';
import { L, rectStyle } from './Stage';
import Portrait from './Portrait';

export interface Message {
  /** 말하는 장수 id (없으면 초상 없이) */
  speaker: string | null;
  nation: string;
  text: string;
  /** 같은 글이 다시 와도 새로 찍히도록 */
  key: number;
  /** 한 글자씩 찍지 않고 바로 (명령 설명 등) */
  instant?: boolean;
}

interface Props {
  message: Message | null;
  idle: string;
  fast: boolean;
  logOpen: boolean;
  log: string[];
  onCloseLog: () => void;
}

/** 한 글자씩 찍히는 글 */
function useTyping(text: string, fast: boolean, key: number) {
  const [n, setN] = useState(fast ? text.length : 0);
  useEffect(() => {
    if (fast) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(t);
    }, 28);
    return () => window.clearInterval(t);
  }, [text, fast, key]);
  return text.slice(0, n);
}

/** 아래 대화창. 그 자체는 누르기를 받지 않고(pointer-events: none) 지도가 대신 받아 기록을 펼친다 */
export default function MessageBox({ message, idle, fast, logOpen, log, onCloseLog }: Props) {
  const text = message?.text ?? idle;
  const shown = useTyping(text, fast || !message || !!message.instant, message?.key ?? -1);
  const r = L.message;
  return (
    <>
      <div className="msgbox frame" style={rectStyle(r)}>
        {message?.speaker && (
          <div className="msg-face">
            <Portrait officerId={message.speaker} nation={message.nation} kind="face" size={58} />
          </div>
        )}
        <div className="msg-text jua">{shown}</div>
        <div className="msg-hint jua">눌러서 기록 ▲</div>
      </div>
      {logOpen && (
        <div className="logwin frame" style={{ left: r.x, width: r.w, bottom: L.stage.h - r.y + 6 }} onClick={onCloseLog}>
          <div className="win-title jua">사건 기록 (최근 20줄) · 눌러서 닫기</div>
          <div className="log-lines jua">
            {log.slice(-20).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
            {!log.length && <div>기록이 없사옵니다</div>}
          </div>
        </div>
      )}
    </>
  );
}
