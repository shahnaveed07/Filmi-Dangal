/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
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
import { AudioManager } from './engine/AudioManager';
import { GameBridge, GameHUDState, GameScreen } from './engine/GameBridge';
import { RotateCcw } from 'lucide-react';

export default function App() {
  const bridge = GameBridge.getInstance();
  const audio = AudioManager.getInstance();

  const [currentScreen, setCurrentScreen] = useState<GameScreen>(bridge.screen);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  // HUD state pushed from 60fps simulation
  const [hudState, setHudState] = useState<GameHUDState>({
    p1Health: 1000,
    p1MaxHealth: 1000,
    p2Health: 1000,
    p2MaxHealth: 1000,
    p1Meter: 0,
    p2Meter: 0,
    p1Name: 'Action Sultan',
    p2Name: 'Romance Raja',
    p1Wins: 0,
    p2Wins: 0,
    roundTimer: 60,
    currentRound: 1,
    phase: 'round_intro',
    comboP1: 0,
    comboP2: 0,
    announcementText: '',
    isPaused: false,
    isMuted: audio.isMuted,
  });

  // Track screen orientation
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window !== 'undefined') {
        setIsPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 768);
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

  // Subscribe to GameBridge state changes
  useEffect(() => {
    const unsubScreen = bridge.subscribeScreen((s) => setCurrentScreen(s));
    const unsubHUD = bridge.subscribeHUD((h) => setHudState(h));
    return () => {
      unsubScreen();
      unsubHUD();
    };
  }, [bridge]);

  // Handle Pause shortcut from anywhere during fighting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.key.toLowerCase() === 'p') {
        if (currentScreen === 'fighting') {
          setIsPaused((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentScreen]);

  const handleStartGame = () => {
    bridge.setScreen('character_select');
  };

  const handleProceedToArena = () => {
    bridge.setScreen('arena_select');
  };

  const handleStartFight = () => {
    setIsPaused(false);
    bridge.setScreen('fighting');
    audio.startBgm();
  };

  const handleRematch = () => {
    setIsPaused(false);
    bridge.setScreen('fighting');
  };

  const handleRestartFight = () => {
    setIsPaused(false);
    bridge.setScreen('fighting');
  };

  const handleResumeFight = () => {
    setIsPaused(false);
  };

  const handleReturnToTitle = () => {
    setIsPaused(false);
    audio.stopBgm();
    bridge.setScreen('title');
  };

  return (
    <div className="relative w-screen h-screen bg-[#10111B] text-[#F1E7D0] overflow-hidden select-none font-sans">
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
          <GameCanvas onPause={() => setIsPaused(true)} />

          {/* RETRO ARCADE HUD OVERLAY */}
          <FightHUD
            hudState={hudState}
            onPause={() => setIsPaused(true)}
            onToggleMute={() => audio.toggleMute()}
          />

          {/* MULTITOUCH MOBILE CONTROLS OVERLAY */}
          <MobileControls />

          {/* PAUSE MODAL */}
          {isPaused && (
            <PauseModal
              onResume={handleResumeFight}
              onRestart={handleRestartFight}
              onOpenControls={() => setShowControls(true)}
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

      {/* MOBILE PORTRAIT ROTATE DEVICE OVERLAY */}
      {isPortrait && (
        <div className="fixed inset-0 bg-[#10111B]/95 z-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#BE123C] border-2 border-[#D6A447] flex items-center justify-center mb-4 animate-spin text-[#FEF08A]">
            <RotateCcw size={32} />
          </div>
          <h2 className="font-['Bungee'] text-2xl text-[#FEF08A] mb-2 tracking-wider">
            ROTATE TO LANDSCAPE
          </h2>
          <p className="text-xs text-[#F1E7D0]/80 max-w-xs leading-relaxed font-['Rajdhani'] font-bold">
            Filmi Dangal is designed for 16:9 widescreen arcade action. Please turn your mobile device sideways for full dual-stick combat controls!
          </p>
        </div>
      )}
    </div>
  );
}
