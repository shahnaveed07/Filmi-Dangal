import React, { useEffect, useState } from 'react';
import { CHARACTERS } from '../data/characters';
import { AudioManager } from '../engine/AudioManager';
import { GameBridge } from '../engine/GameBridge';
import { CharacterPreview3D } from '../game3d/scenes/CharacterPreview3D';
import { FighterId } from '../types/fighter';
import {
  CharacterStats,
  FightFunLogo,
  WindowUtilityControls,
} from './ui/FightFunUI';
import { Gamepad2, Settings, Users } from 'lucide-react';

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
  const [showcaseId] = useState<FighterId>(bridge.p1CharacterId || 'action_sultan');
  const showcaseCharacter = CHARACTERS[showcaseId] || CHARACTERS.action_sultan;

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
      aria-label="FIGHT FUN Home Screen"
      className="relative w-full h-full min-h-screen bg-[#070406] flex flex-col justify-between px-5 py-4 sm:px-8 sm:py-6 md:px-12 md:py-7 overflow-y-auto overflow-x-hidden select-none"
    >
      {/* AMBIENT GOLDEN STAGE SPOTLIGHT & FLOOR GLOW */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 46% 52% at 50% 54%, rgba(245, 158, 11, 0.14) 0%, rgba(180, 83, 9, 0.06) 45%, rgba(7, 4, 6, 0.98) 80%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-32 opacity-70"
          style={{
            background:
              'radial-gradient(ellipse 38% 60% at 50% 95%, rgba(245, 158, 11, 0.25) 0%, rgba(7, 4, 6, 0) 75%)',
          }}
        />
      </div>

      {/* TOP BAR: FIGHT FUN EMBLEM LEFT, REAL BROWSER CONTROLS RIGHT */}
      <div className="relative z-20 w-full max-w-[1440px] mx-auto flex items-start justify-between shrink-0">
        <div className="pt-1">
          <span className="sr-only">FIGHT FUN</span>
          <FightFunLogo size="lg" />
        </div>

        <WindowUtilityControls />
      </div>

      {/* 3-ZONE HOME SCREEN STAGE: LEFT NAVIGATION | CENTRE 3D HERO | RIGHT CHARACTER ATTRIBUTES */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center py-2">
        {/* LEFT COLUMN: 3 ANGULAR GAMING NAVIGATION BUTTONS */}
        <div className="lg:col-span-3 flex flex-col items-center lg:items-start order-2 lg:order-1">
          <nav
            aria-label="Main Menu"
            className="w-full max-w-[310px] flex flex-col gap-4"
          >
            {/* PLAY BUTTON (Highlighted Gold/Amber Angular Card) */}
            <button
              type="button"
              data-start="true"
              data-testid="menu-play-btn"
              onClick={() => {
                audio.playSound('click');
                onPlay();
              }}
              className="group relative w-full h-16 sm:h-[68px] px-6 rounded-xl border-2 border-[#FEF08A] bg-gradient-to-r from-[#92400E]/95 via-[#B45309]/85 to-[#D97706]/90 hover:brightness-110 shadow-[0_0_28px_rgba(245,158,11,0.55),inset_0_1px_12px_rgba(254,240,138,0.35)] transform -skew-x-6 transition-all flex items-center gap-4 cursor-pointer active:scale-98"
            >
              <span className="transform skew-x-6 flex items-center gap-4 w-full">
                <span className="w-11 h-11 rounded-lg bg-amber-400/20 border border-amber-300/50 flex items-center justify-center text-[#FACC15] shrink-0 shadow-inner">
                  <Gamepad2 size={26} />
                </span>
                <span className="font-display font-black italic uppercase text-xl sm:text-2xl text-white tracking-wider drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  PLAY
                </span>
              </span>
            </button>

            {/* CHARACTERS BUTTON */}
            <button
              type="button"
              data-testid="menu-fighters-btn"
              onClick={() => {
                audio.playSound('click');
                onOpenFighters();
              }}
              className="group relative w-full h-15 sm:h-[62px] px-6 rounded-xl border border-amber-500/55 hover:border-[#FEF08A] bg-[#0D090B]/90 hover:bg-[#191114] shadow-[0_0_18px_rgba(0,0,0,0.85)] transform -skew-x-6 transition-all flex items-center gap-4 cursor-pointer active:scale-98"
            >
              <span className="transform skew-x-6 flex items-center gap-4 w-full">
                <span className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-400/35 flex items-center justify-center text-[#FACC15] shrink-0">
                  <Users size={22} />
                </span>
                <span className="font-display font-extrabold italic uppercase text-lg sm:text-xl text-white group-hover:text-[#FEF08A] tracking-wider">
                  CHARACTERS
                </span>
              </span>
            </button>

            {/* SETTINGS BUTTON */}
            <button
              type="button"
              data-testid="menu-settings-btn"
              onClick={() => {
                audio.playSound('click');
                onOpenSettings();
              }}
              className="group relative w-full h-15 sm:h-[62px] px-6 rounded-xl border border-amber-500/55 hover:border-[#FEF08A] bg-[#0D090B]/90 hover:bg-[#191114] shadow-[0_0_18px_rgba(0,0,0,0.85)] transform -skew-x-6 transition-all flex items-center gap-4 cursor-pointer active:scale-98"
            >
              <span className="transform skew-x-6 flex items-center gap-4 w-full">
                <span className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-400/35 flex items-center justify-center text-[#FACC15] shrink-0">
                  <Settings size={22} />
                </span>
                <span className="font-display font-extrabold italic uppercase text-lg sm:text-xl text-white group-hover:text-[#FEF08A] tracking-wider">
                  SETTINGS
                </span>
              </span>
            </button>
          </nav>
        </div>

        {/* CENTRE COLUMN: FULL-BODY 3D CHARACTER SHOWCASE ON GLOWING RING PEDESTAL */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center order-1 lg:order-2">
          <CharacterPreview3D
            characterId={showcaseId}
            variant="hero"
            frameless={true}
            showAnimationBar={false}
            className="w-full h-72 sm:h-96 md:h-[470px] lg:h-[520px]"
          />
        </div>

        {/* RIGHT COLUMN: SELECTED CHARACTER NAME, ARCHETYPE & SEGMENTED STATS */}
        <div
          data-testid="hero-character-attributes"
          className="lg:col-span-4 flex flex-col items-center lg:items-start text-center lg:text-left order-3 max-w-sm mx-auto lg:mx-0 w-full"
        >
          <h2
            data-testid="hero-character-name"
            className="font-display font-black italic uppercase text-3xl sm:text-4xl md:text-[42px] text-transparent bg-clip-text bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#F59E0B] tracking-wide leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]"
          >
            {showcaseCharacter.name}
          </h2>
          <p
            data-testid="hero-character-archetype"
            className="font-display font-bold italic text-sm sm:text-base text-zinc-200 tracking-wide mt-0.5 mb-4"
          >
            {showcaseCharacter.archetype}
          </p>

          <CharacterStats character={showcaseCharacter} borderVariant="gold" />
        </div>
      </div>

      <div className="h-2 shrink-0" />
    </div>
  );
};
