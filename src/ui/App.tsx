import { useEffect, useState } from 'react';
import { GameState, newGame } from '../game/state';
import { clearSave, loadGame, saveGame } from '../game/save';
import { loadCastleSymbols, loadRegionGrid } from './assets';
import TitleScreen from './TitleScreen';
import GameScreen from './GameScreen';

export default function App() {
  const [regionGrid, setRegionGrid] = useState<number[] | null>(null);
  const [symbols, setSymbols] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(() => loadGame());

  useEffect(() => {
    loadRegionGrid().then(setRegionGrid, (e: Error) => setError(e.message));
    loadCastleSymbols().then(setSymbols, () => setSymbols(''));
  }, []);

  if (error) return <div className="loading">불러오기 실패: {error}</div>;
  if (!regionGrid) return <div className="loading">지도를 펼치는 중…</div>;

  const start = (nation: string) => {
    const s = newGame(nation, regionGrid);
    saveGame(s);
    setGame(s);
  };

  const restart = () => {
    clearSave();
    setSaved(null);
    setGame(null);
  };

  return (
    <>
      <div className="symbols" dangerouslySetInnerHTML={{ __html: symbols }} />
      {game ? (
        <GameScreen game={game} setGame={setGame} onRestart={restart} />
      ) : (
        <TitleScreen
          canContinue={!!saved}
          onContinue={() => saved && setGame(saved)}
          onStart={start}
        />
      )}
    </>
  );
}
