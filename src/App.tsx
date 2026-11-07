/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ArenaSelect } from './components/ArenaSelect';
import { CharacterSelect } from './components/CharacterSelect';
import { ControlsModal } from './components/ControlsModal';
import { DisclaimerModal } from './components/DisclaimerModal';
import { FightHUD } from './components/FightHUD';
import { GameCanvas } from './components/GameCanvas';
import { MobileControls } from './components/MobileControls';
import { PauseModal } from './components/PauseModal';
import { ResultsModal } from './components/ResultsModal';
import { SettingsModal } from './components/SettingsModal';
import { TitleScreen } from './components/TitleScreen';
import { CHARACTERS } from './data/characters';
import { AudioManager } from './engine/AudioManager';
import { GameBridge, GameHUDState, GameScreen } from './engine/GameBridge';
import { GameMode } from './types/fighter';
import { RotateCcw } from 'lucide-react';

export default function App() {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();

  const [currentScreen, setCurrentScreen] = useState<GameScreen>(bridge.screen);
  const [isPaused, setIsPaused] = useState<boolean>(bridge.isPaused);
  const [showControls, setShowControls] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [dismissedPortraitPrompt, setDismissedPortraitPrompt] = useState(false);

  // HUD state pushed from 60fps simulation
  const [hudState, setHudState] = useState<GameHUDState>(() => {
    const p1 = CHARACTERS[bridge.p1CharacterId];
    const p2 = CHARACTERS[bridge.p2CharacterId];
    return {
      p1Health: p1.stats.maxHealth,
      p1MaxHealth: p1.stats.maxHealth,
      p2Health: p2.stats.maxHealth,
      p2MaxHealth: p2.stats.maxHealth,
      p1Meter: 0,
      p2Meter: 0,
      p1Name: p1.name,
      p2Name: p2.name,
      p1Wins: 0,
      p2Wins: 0,
      roundTimer: 60,
      currentRound: 1,
      phase: 'round_intro',
      comboP1: 0,
      comboP2: 0,
      announcementText: 'ROUND 1',
      isPaused: bridge.isPaused,
      isMuted: audio.isMuted,
      debugHitboxes: bridge.debugHitboxes,
      gameMode: bridge.gameMode,
      trainingDummyBehavior: bridge.trainingDummyBehavior,
    };
  });

  // Track screen orientation for mobile portrait warning during active fighting
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window !== 'undefined') {
        const narrowPortrait =
          window.innerHeight > window.innerWidth && window.innerWidth < 768;
        setIsPortrait(narrowPortrait);
        if (!narrowPortrait) {
          setDismissedPortraitPrompt(false);
        }
      }
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Support ?autostart=1 for fast automated browser testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' && bridge.screen === 'title') {
        const modeParam = params.get('mode');
        if (modeParam === 'training' || modeParam === 'vs_cpu' || modeParam === 'arcade') {
          bridge.gameMode = modeParam;
        }
        bridge.startMatch();
      }
    }
  }, [bridge]);

  // Subscribe to authoritative GameBridge state changes
  useEffect(() => {
    const unsubScreen = bridge.subscribeScreen((s) => setCurrentScreen(s));
    const unsubPause = bridge.subscribePause((p) => setIsPaused(p));
    const unsubHUD = bridge.subscribeHUD((h) => setHudState(h));
    const unsubMute = audio.subscribeMute((m) =>
      setHudState((prev) => ({ ...prev, isMuted: m }))
    );
    return () => {
      unsubScreen();
      unsubPause();
      unsubHUD();
      unsubMute();
    };
  }, [bridge, audio]);

  const handleStartGame = useCallback(
    (mode: GameMode) => {
      bridge.gameMode = mode;
      bridge.setScreen('character_select');
    },
    [bridge]
  );

  const handleProceedToArena = useCallback(() => {
    bridge.setScreen('arena_select');
  }, [bridge]);

  const handleStartFight = useCallback(() => {
    bridge.startMatch();
    audio.startBgm();
  }, [bridge, audio]);

  const handleRematch = useCallback(() => {
    bridge.rematch();
    audio.startBgm();
  }, [bridge, audio]);

  const handleRestartRound = useCallback(() => {
    bridge.restartRound();
  }, [bridge]);

  const handlePauseFight = useCallback(() => {
    bridge.setPaused(true);
  }, [bridge]);

  const handleResumeFight = useCallback(() => {
    bridge.setPaused(false);
  }, [bridge]);

  const handleToggleMute = useCallback(() => {
    audio.toggleMute();
  }, [audio]);

  const handleReturnToTitle = useCallback(() => {
    audio.stopBgm();
    bridge.returnToMenu();
  }, [bridge, audio]);

  return (
    <div
      data-screen={currentScreen}
      data-mode={bridge.gameMode}
      className="relative w-screen h-screen bg-[#10111B] text-[#F1E7D0] overflow-hidden select-none font-sans"
    >
      {/* SCREEN ROUTING */}
      {currentScreen === 'title' && (
        <TitleScreen
          onStartGame={handleStartGame}
          onOpenControls={() => setShowControls(true)}
          onOpenDisclaimer={() => setShowDisclaimer(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {currentScreen === 'character_select' && (
        <CharacterSelect
          onBack={handleReturnToTitle}
          onProceed={handleProceedToArena}
        />
      )}

      {currentScreen === 'arena_select' && (
        <ArenaSelect
          onBack={() => bridge.setScreen('character_select')}
          onStartFight={handleStartFight}
        />
      )}

      {currentScreen === 'fighting' && (
        <div className="relative w-full h-full flex items-center justify-center">
          {/* ISOLATED 60FPS SIMULATION CANVAS */}
          <GameCanvas />

          {/* RETRO ARCADE HUD OVERLAY */}
          <FightHUD
            hudState={hudState}
            onPause={handlePauseFight}
            onToggleMute={handleToggleMute}
          />

          {/* MULTITOUCH MOBILE CONTROLS OVERLAY */}
          <MobileControls />

          {/* PAUSE MODAL */}
          {isPaused && (
            <PauseModal
              onResume={handleResumeFight}
              onRestart={handleRestartRound}
              onOpenControls={() => setShowControls(true)}
              onOpenSettings={() => setShowSettings(true)}
              onMainMenu={handleReturnToTitle}
            />
          )}
        </div>
      )}

      {currentScreen === 'results' && (
        <ResultsModal
          onRematch={handleRematch}
          onCharacterSelect={() => bridge.setScreen('character_select')}
          onMainMenu={handleReturnToTitle}
        />
      )}

      {/* GLOBAL MODALS */}
      {showControls && <ControlsModal onClose={() => setShowControls(false)} />}
      {showDisclaimer && <DisclaimerModal onClose={() => setShowDisclaimer(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* MOBILE PORTRAIT ROTATE DEVICE PROMPT (During active fighting, non-destructive & dismissible) */}
      {isPortrait && currentScreen === 'fighting' && !dismissedPortraitPrompt && (
        <div className="fixed inset-0 bg-[#10111B]/95 z-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#BE123C] border-2 border-[#D6A447] flex items-center justify-center mb-4 text-[#FEF08A]">
            <RotateCcw size={32} />
          </div>
          <h2 className="font-['Bungee'] text-2xl text-[#FEF08A] mb-2 tracking-wider">
            ROTATE FOR WIDESCREEN ACTION
          </h2>
          <p className="text-xs text-[#F1E7D0]/80 max-w-xs leading-relaxed font-['Rajdhani'] font-bold mb-5">
            Filmi Dangal is optimized for landscape widescreen combat, or you can continue playing in portrait mode below.
          </p>
          <button
            onClick={() => setDismissedPortraitPrompt(true)}
            className="px-5 py-2.5 bg-[#1A1829] hover:bg-[#25203B] text-[#FEF08A] font-['Cinzel'] font-bold text-xs rounded border border-[#D6A447] cursor-pointer"
          >
            CONTINUE IN PORTRAIT
          </button>
        </div>
      )}
    </div>
  );
}
