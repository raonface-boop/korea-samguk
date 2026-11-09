import { useState } from 'react';
import { Settings } from '../game/save';
import { UI_ZOOMS, getUiZoom, setUiZoom } from './Stage';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onRestart?: () => void;
  /** 지금 게임의 AI 수준 이름 (보기만) */
  aiLevelName?: string;
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="set-row">
      <span>{label}</span>
      <div className="seg">
        <button className={`btn ${on ? 'on' : ''}`} onClick={() => onChange(true)}>
          켜기
        </button>
        <button className={`btn ${!on ? 'on' : ''}`} onClick={() => onChange(false)}>
          끄기
        </button>
      </div>
    </div>
  );
}

export default function SettingsSheet({ settings, onChange, onClose, onRestart, aiLevelName }: Props) {
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  const [zoom, setZoom] = useState(getUiZoom);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal settings frame jua" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-title">설정</span>
          <button className="btn close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <Toggle label="배경음악" on={settings.bgm} onChange={(v) => set({ bgm: v })} />
        <label className="slider">
          <span>배경음악 음량 {Math.round(settings.bgmVolume * 100)}</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.bgmVolume} onChange={(e) => set({ bgmVolume: +e.target.value })} />
        </label>
        <Toggle label="효과음" on={settings.sfx} onChange={(v) => set({ sfx: v })} />
        <label className="slider">
          <span>효과음 음량 {Math.round(settings.sfxVolume * 100)}</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.sfxVolume} onChange={(e) => set({ sfxVolume: +e.target.value })} />
        </label>
        <Toggle label="자동 저장" on={settings.autosave} onChange={(v) => set({ autosave: v })} />
        <Toggle label="일기토·이벤트 연출 빠르게" on={settings.fast} onChange={(v) => set({ fast: v })} />
        <div className="set-row">
          <span>글씨 크기</span>
          <div className="seg">
            {UI_ZOOMS.map((z) => (
              <button
                key={z.value}
                className={`btn ${zoom === z.value ? 'on' : ''}`}
                onClick={() => {
                  setZoom(z.value);
                  setUiZoom(z.value);
                }}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
        {aiLevelName && <div className="set-row">AI 수준: {aiLevelName}</div>}
        {onRestart && (
          <button
            className="btn big"
            onClick={() => {
              if (window.confirm('지금 게임을 버리고 새로 시작할까요?')) onRestart();
            }}
          >
            새로 시작
          </button>
        )}
      </div>
    </div>
  );
}
