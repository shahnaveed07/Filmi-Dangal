import React, { useEffect, useState } from 'react';
import { GameBridge } from '../engine/GameBridge';
import { FighterId } from '../types/fighter';
import { AudioManager } from '../engine/AudioManager';
import { CHARACTER_LIST } from '../data/characters';
import { CharacterPreview3D } from '../game3d/scenes/CharacterPreview3D';
import { PrimaryButton, SecondaryButton } from './ui/FightFunUI';
import { Volume2, VolumeX, Swords, Users, Settings } from 'lucide-react';

export interface TitleShortcutGuardContext {
  currentScreen: string;
  keyCode: string;
  isModalOpen: boolean;
  hasDialogInDom: boolean;
  defaultPrevented: boolean;
  repeat: boolean;
  activeElementTagName: string | null;
  activeElementRole?: string | null;
  isContentEditable?: boolean;
}

/**
 * Pure context guard determining whether a global Enter/Space press on the Title Screen
 * should trigger the default Play action.
 * Never triggers when a modal/dialog is open or when a button/input/interactive element has focus
 * (allowing native browser keyboard activation to activate whichever control is focused).
 */
export function shouldTriggerTitleShortcut(ctx: TitleShortcutGuardContext): boolean {
  if (ctx.currentScreen !== 'title') return false;
  if (ctx.keyCode !== 'Enter' && ctx.keyCode !== 'Space') return false;
  if (ctx.isModalOpen || ctx.hasDialogInDom) return false;
  if (ctx.defaultPrevented || ctx.repeat) return false;
  if (ctx.isContentEditable) return false;

  const tag = (ctx.activeElementTagName || '').toUpperCase();
  const interactiveTags = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']);
  if (interactiveTags.has(tag)) {
    return false;
  }
  if (ctx.activeElementRole === 'button' || ctx.activeElementRole === 'dialog') {
    return false;
  }

  return true;
}

interface TitleScreenProps {
  onPlay: () => void;
  onOpenFighters: () => void;
  onOpenSettings: () => void;
  isModalOpen?: boolean;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onPlay,
  onOpenFighters,
  onOpenSettings,
  isModalOpen = false,
}) => {
  const audio = AudioManager.getInstance();
  const bridge = GameBridge.getInstance();
  const [isMuted, setIsMuted] = useState(audio.isMuted);
  const [showcaseId, setShowcaseId] = useState<FighterId>(bridge.p1CharacterId);

  useEffect(() => {
    const unsubMute = audio.subscribeMute((m) => setIsMuted(m));
    return () => {
      unsubMute();
    };
  }, [audio]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const hasDialogInDom =
        typeof document !== 'undefined' &&
        Boolean(document.querySelector('[role="dialog"]'));

      const allowed = shouldTriggerTitleShortcut({
        currentScreen: bridge.screen,
        keyCode: e.code,
        isModalOpen,
        hasDialogInDom,
        defaultPrevented: e.defaultPrevented,
        repeat: e.repeat,
        activeElementTagName: activeEl ? activeEl.tagName : null,
        activeElementRole: activeEl ? activeEl.getAttribute('role') : null,
        isContentEditable:
          activeEl instanceof HTMLElement ? activeEl.isContentEditable : false,
      });

      if (allowed) {
        e.preventDefault();
        audio.playSound('click');
        onPlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bridge.screen, isModalOpen, onPlay, audio]);

  return (
    <div
      data-testid="main-menu-screen"
      className="relative w-full h-full min-h-screen bg-[#0D0C16] flex flex-col justify-between px-4 py-4 sm:p-6 md:p-8 overflow-y-auto overflow-x-hidden select-none"
    >
      {/* BACKGROUND CINEMATIC LIGHTING */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-16 left-1/4 w-96 h-96 bg-[#BE123C]/25 rounded-full blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#D6A447]/20 rounded-full blur-[140px]" />
      </div>

      {/* TOP BAR: AUDIO TOGGLE ONLY */}
      <div className="relative z-10 w-full max-w-6xl mx-auto flex items-center justify-end shrink-0">
        <button
          type="button"
          onClick={() => audio.toggleMute()}
          className="p-2.5 bg-[#171526] hover:bg-[#231F38] text-[#D6A447] border border-[#D6A447]/50 rounded-lg hover:border-[#FEF08A] transition-colors cursor-pointer"
          title="Toggle Audio [M]"
          aria-label="Toggle Audio"
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* MAIN VISUAL-FIRST HERO SPLIT: LOGO + NAVIGATION LEFT, 3D FIGHTER SHOWCASE RIGHT */}
      <div className="relative z-10 w-full max-w-6xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center py-2">
        {/* LEFT COLUMN: FIGHT FUN LOGO & CLEAN MENU NAVIGATION */}
        <div className="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left">
          <div className="relative mb-6 sm:mb-8">
            <h1 className="font-['Bungee'] text-5xl sm:text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFBEB] via-[#F59E0B] to-[#BE123C] drop-shadow-[0_8px_20px_rgba(0,0,0,0.95)] tracking-wider leading-none">
              FIGHT FUN
            </h1>
            <div className="mt-3 h-1 w-28 mx-auto lg:mx-0 bg-gradient-to-r from-[#BE123C] via-[#F59E0B] to-transparent rounded-full" />
          </div>

          <nav
            aria-label="Main Menu"
            className="w-full max-w-xs flex flex-col gap-3"
          >
            <PrimaryButton
              data-start="true"
              data-testid="menu-play-btn"
              fullWidth
              icon={<Swords size={20} />}
              onClick={() => {
                audio.playSound('click');
                onPlay();
              }}
            >
              PLAY
            </PrimaryButton>

            <SecondaryButton
              data-testid="menu-fighters-btn"
              fullWidth
              icon={<Users size={18} />}
              onClick={() => {
                audio.playSound('click');
                onOpenFighters();
              }}
            >
              FIGHTERS
            </SecondaryButton>

            <SecondaryButton
              data-testid="menu-settings-btn"
              fullWidth
              icon={<Settings size={18} />}
              onClick={() => {
                audio.playSound('click');
                onOpenSettings();
              }}
            >
              SETTINGS
            </SecondaryButton>
          </nav>
        </div>

        {/* RIGHT COLUMN: LARGE CINEMATIC 3D CHARACTER PRESENTATION */}
        <div className="lg:col-span-7 flex flex-col gap-2.5">
          <CharacterPreview3D
            characterId={showcaseId}
            variant="hero"
            showAnimationBar={false}
            className="w-full h-64 sm:h-80 md:h-[380px]"
          />

          {/* COMPACT FIGHTER SWITCHER PILLS BELOW 3D SHOWCASE */}
          <div className="flex items-center justify-center gap-2">
            {CHARACTER_LIST.map((char) => {
              const active = char.id === showcaseId;
              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => {
                    audio.playSound('click');
                    setShowcaseId(char.id);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-['Rajdhani'] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                    active
                      ? 'bg-[#D6A447] text-black border-[#FEF08A]'
                      : 'bg-[#171526] text-[#F1E7D0]/80 border-[#D6A447]/30 hover:border-[#D6A447]'
                  }`}
                >
                  {char.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-2 shrink-0" />
    </div>
  );
};
