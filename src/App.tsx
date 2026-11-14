/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ArenaSelect } from './components/ArenaSelect';
import { CharacterSelect } from './components/CharacterSelect';
import { FightHUD } from './components/FightHUD';
import { GameCanvas } from './components/GameCanvas';
import { GameModeSelect } from './components/GameModeSelect';
import { LoadingScreen } from './components/LoadingScreen';
import { MobileControls } from './components/MobileControls';
import { PauseModal } from './components/PauseModal';
import { ResultsModal } from './components/ResultsModal';
import { SettingsModal } from './components/SettingsModal';
import { TitleScreen } from './components/TitleScreen';
import { CHARACTERS } from './data/characters';
import { AudioManager } from './engine/AudioManager';
import { GameBridge, GameHUDState, GameScreen } from './engine/GameBridge';
import { FighterId, GameMode } from './types/fighter';
import { RotateCcw } from 'lucide-react';

export default function App() {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();

  const [currentScreen, setCurrentScreen] = useState<GameScreen>(
    bridge.screen === 'character_overview' ? 'character_select' : bridge.screen
  );
  const [homeShowcaseCharacterId, setHomeShowcaseCharacterId] =
    useState<FighterId>('action_sultan');
  const [isStartupComplete, setIsStartupComplete] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' || params.get('skipLoading') === '1';
  });
  const [holdLoadingScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('holdLoading') === '1';
  });
  const [isPaused, setIsPaused] = useState<boolean>(bridge.isPaused);
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
        if (
          modeParam === 'training' ||
          modeParam === 'vs_cpu' ||
          modeParam === 'arcade'
        ) {
          bridge.gameMode = modeParam;
        }
        bridge.startMatch();
      }
    }
  }, [bridge]);

  // Subscribe to authoritative GameBridge state changes
  useEffect(() => {
    const unsubScreen = bridge.subscribeScreen((s) =>
      setCurrentScreen(s === 'character_overview' ? 'character_select' : s)
    );
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

  const handleOpenGameModes = useCallback(() => {
    bridge.characterSelectBrowseOnly = false;
    bridge.setScreen('game_mode');
  }, [bridge]);

  const handleOpenFightersFromMenu = useCallback(() => {
    bridge.openFightersBrowse(homeShowcaseCharacterId);
  }, [bridge, homeShowcaseCharacterId]);

  const handleSelectGameMode = useCallback(
    (mode: GameMode) => {
      bridge.openMatchCharacterSelect(mode);
    },
    [bridge]
  );

  const handleSelectShowcaseFromBrowse = useCallback(
    (id: FighterId) => {
      setHomeShowcaseCharacterId(id);
      bridge.inspectedCharacterId = id;
      bridge.returnToMenu();
    },
    [bridge]
  );

  const handleProceedToArena = useCallback(() => {
    if (bridge.characterSelectBrowseOnly) {
      return;
    }
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

  const handleRestartMatch = useCallback(() => {
    bridge.restartMatch();
    audio.startBgm();
  }, [bridge, audio]);

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

  const characterSelectMode = bridge.getCharacterSelectMode();

  return (
    <div
      data-screen={isStartupComplete ? currentScreen : 'loading'}
      data-mode={bridge.gameMode}
      className="relative w-screen h-screen h-dvh bg-[#0D0C16] text-[#F1E7D0] overflow-hidden select-none font-sans"
    >
      {/* 0. STARTUP LOADING SCREEN */}
      {!isStartupComplete && (
        <LoadingScreen
          holdOnComplete={holdLoadingScreen}
          onComplete={() => setIsStartupComplete(true)}
        />
      )}

      {/* 1. MAIN MENU */}
      {isStartupComplete && currentScreen === 'title' && (
        <TitleScreen
          onPlay={handleOpenGameModes}
          onOpenFighters={handleOpenFightersFromMenu}
          onOpenSettings={() => setShowSettings(true)}
          showcaseCharacterId={homeShowcaseCharacterId}
          isModalOpen={showSettings}
        />
      )}

      {/* 2. GAME MODE SELECT */}
      {currentScreen === 'game_mode' && (
        <GameModeSelect
          onBack={handleReturnToTitle}
          onSelectMode={handleSelectGameMode}
        />
      )}

      {/* 3. CHARACTER SELECT (UNIFIED SCREEN FOR BROWSE & MATCH MODES) */}
      {currentScreen === 'character_select' && (
        <CharacterSelect
          mode={characterSelectMode}
          initialBrowseCharacterId={homeShowcaseCharacterId}
          onBack={() =>
            bridge.characterSelectBrowseOnly
              ? handleReturnToTitle()
              : bridge.setScreen('game_mode')
          }
          onProceed={handleProceedToArena}
          onSelectShowcaseCharacter={handleSelectShowcaseFromBrowse}
        />
      )}

      {/* 5. ARENA SELECT */}
      {currentScreen === 'arena_select' && (
        <ArenaSelect
          onBack={() => bridge.setScreen('character_select')}
          onStartFight={handleStartFight}
        />
      )}

      {/* 6. ACTIVE FIGHT */}
      {currentScreen === 'fighting' && (
        <div className="relative w-full h-full flex items-center justify-center">
          <GameCanvas />

          <FightHUD
            hudState={hudState}
            onPause={handlePauseFight}
            onToggleMute={handleToggleMute}
          />

          <MobileControls />

          {isPaused && (
            <PauseModal
              onResume={handleResumeFight}
              onRestart={handleRestartMatch}
              onOpenSettings={() => setShowSettings(true)}
              onMainMenu={handleReturnToTitle}
            />
          )}
        </div>
      )}

      {/* 7. RESULTS */}
      {currentScreen === 'results' && (
        <ResultsModal
          onRematch={handleRematch}
          onCharacterSelect={() => {
            bridge.characterSelectBrowseOnly = false;
            bridge.setScreen('character_select');
          }}
          onMainMenu={handleReturnToTitle}
        />
      )}

      {/* SETTINGS MODAL */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* MOBILE PORTRAIT ROTATE DEVICE PROMPT */}
      {isPortrait && currentScreen === 'fighting' && !dismissedPortraitPrompt && (
        <div className="fixed inset-0 bg-[#0D0C16]/95 z-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#BE123C] border-2 border-[#D6A447] flex items-center justify-center mb-4 text-[#FEF08A]">
            <RotateCcw size={32} />
          </div>
          <h2 className="font-['Bungee'] text-2xl text-[#FEF08A] mb-2 tracking-wider">
            ROTATE DEVICE
          </h2>
          <button
            type="button"
            onClick={() => setDismissedPortraitPrompt(true)}
            className="mt-3 px-5 py-2.5 bg-[#171526] hover:bg-[#231F38] text-[#FEF08A] font-['Cinzel'] font-bold text-xs rounded-lg border border-[#D6A447] cursor-pointer"
          >
            CONTINUE
          </button>
        </div>
      )}
    </div>
  );
}
