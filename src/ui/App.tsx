import { useEffect, useState } from 'react';
import { GameState, newGame } from '../game/state';
import { OLD_SAVE_MESSAGE, Settings, clearSave, loadGame, loadSettings, saveGame, saveSettings } from '../game/save';
import { startFirstTurn } from '../game/turn';
import { sound } from '../audio/sound';
import { loadRegionGrid } from './assets';
import Stage from './Stage';
import TitleScreen from './TitleScreen';
import GameScreen from './GameScreen';

function initialSave(): { saved: GameState | null; notice: string | null } {
  const r = loadGame();
  if (r.kind === 'ok') return { saved: r.state, notice: null };
  if (r.kind === 'old') {
    clearSave();
    return { saved: null, notice: OLD_SAVE_MESSAGE };
  }
  return { saved: null, notice: null };
}

export default function App() {
  const [regionGrid, setRegionGrid] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [{ saved, notice }, setSaveInfo] = useState(initialSave);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);

  useEffect(() => {
    loadRegionGrid().then(setRegionGrid, (e: Error) => setError(e.message));
  }, []);

  // 소리: 브라우저 정책 때문에 첫 클릭 뒤에 시작. 버튼을 누르면 딱따기 소리
  useEffect(() => {
    sound.setSettings(settings);
  }, [settings]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      sound.unlock();
      const el = e.target as HTMLElement | null;
      if (el?.closest('button')) sound.play('click');
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);
  useEffect(() => {
    if (!game) sound.setMode('map');
  }, [game]);

  const changeSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };

  if (error) return <div className="loading">불러오기 실패: {error}</div>;
  if (!regionGrid) return <div className="loading">지도를 펼치는 중…</div>;

  const start = (nation: string) => {
    const s = startFirstTurn(newGame(nation, regionGrid));
    if (settings.autosave) saveGame(s);
    setGame(s);
  };

  const restart = () => {
    clearSave();
    setSaveInfo({ saved: null, notice: null });
    setGame(null);
  };

  return (
    <Stage>
      {game ? (
        <GameScreen game={game} setGame={setGame} onRestart={restart} settings={settings} onSettings={changeSettings} />
      ) : (
        <TitleScreen canContinue={!!saved} onContinue={() => saved && setGame(saved)} onStart={start} />
      )}
      {notice && !game && (
        <div className="modal-back">
          <div className="modal menu frame">
            <p>{notice}</p>
            <button className="btn btn-gold big" onClick={() => setSaveInfo({ saved: null, notice: null })}>
              확인
            </button>
          </div>
        </div>
      )}
    </Stage>
  );
}
