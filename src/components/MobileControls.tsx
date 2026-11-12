import React, { useCallback, useEffect, useState } from 'react';
import { GameBridge } from '../engine/GameBridge';
import { InputManager } from '../engine/InputManager';
import {
  detectTouchCapability,
  MobileControlVisibilityOption,
  SettingsManager,
  shouldShowMobileControls,
} from '../engine/SettingsManager';

/**
 * MobileControls
 *
 * Capability-aware multi-touch arcade overlay for mobile phones, landscape tablets (including >= 1024px),
 * and hybrid touch devices.
 * Features:
 * - Left, Right, Jump, Crouch, Block, Grab, Punch, Kick, SuperShot, and SuperMove buttons
 * - High-contrast active visual feedback when pressed
 * - Configurable visibility ('auto' | 'always' | 'off'), size ('compact' | 'standard' | 'large'), and opacity ('40%–100%')
 * - Multi-touch pointer tracking without duplicate mouse-compatibility events
 * - Safe-area inset support and automatic release on pause / pointercancel / blur / visibilitychange
 */
export const MobileControls: React.FC = () => {
  const input = InputManager.getInstance();
  const settingsMgr = SettingsManager.getInstance();
  const bridge = GameBridge.getInstance();

  const [activeControls, setActiveControls] = useState<Record<string, boolean>>({});
  const [visibilityMode, setVisibilityMode] = useState<MobileControlVisibilityOption>(
    () => settingsMgr.getSettings().mobileControlVisibility
  );
  const [controlSize, setControlSize] = useState(
    () => settingsMgr.getSettings().mobileControlSize
  );
  const [opacity, setOpacity] = useState(
    () => settingsMgr.getSettings().mobileControlOpacity
  );
  const [isTouchCapable, setIsTouchCapable] = useState<boolean>(() =>
    detectTouchCapability()
  );

  const syncActiveState = useCallback(() => {
    const controls = [
      'left',
      'right',
      'jump',
      'crouch',
      'block',
      'grab',
      'punch',
      'kick',
      'supershot',
      'supermove',
    ];
    const next: Record<string, boolean> = {};
    for (const c of controls) {
      next[c] = input.isVirtualControlActive(c);
    }
    setActiveControls(next);
  }, [input]);

  useEffect(() => {
    const unsubSettings = settingsMgr.subscribe((s) => {
      setVisibilityMode(s.mobileControlVisibility);
      setControlSize(s.mobileControlSize);
      setOpacity(s.mobileControlOpacity);
    });

    const unsubPause = bridge.subscribePause((paused) => {
      if (paused) {
        input.clearTouchInputs();
        syncActiveState();
      }
    });

    const handleCapabilityOrOrientationChange = () => {
      setIsTouchCapable(detectTouchCapability());
    };

    const handleReleaseAllTouch = () => {
      input.clearTouchInputs();
      syncActiveState();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        handleReleaseAllTouch();
      }
    };

    let coarseMql: MediaQueryList | null = null;
    let anyCoarseMql: MediaQueryList | null = null;

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleCapabilityOrOrientationChange);
      window.addEventListener('orientationchange', handleCapabilityOrOrientationChange);
      window.addEventListener('blur', handleReleaseAllTouch);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window.matchMedia === 'function') {
        coarseMql = window.matchMedia('(pointer: coarse)');
        anyCoarseMql = window.matchMedia('(any-pointer: coarse)');
        coarseMql.addEventListener?.('change', handleCapabilityOrOrientationChange);
        anyCoarseMql.addEventListener?.('change', handleCapabilityOrOrientationChange);
      }
    }

    return () => {
      unsubSettings();
      unsubPause();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleCapabilityOrOrientationChange);
        window.removeEventListener('orientationchange', handleCapabilityOrOrientationChange);
        window.removeEventListener('blur', handleReleaseAllTouch);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      coarseMql?.removeEventListener?.('change', handleCapabilityOrOrientationChange);
      anyCoarseMql?.removeEventListener?.('change', handleCapabilityOrOrientationChange);
      input.clearTouchInputs();
    };
  }, [input, settingsMgr, bridge, syncActiveState]);

  const isVisible = shouldShowMobileControls(visibilityMode, isTouchCapable);
  if (!isVisible) {
    return null;
  }

  const bindPointer = (controlName: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if synthetic event lacks pointer capture support
      }
      input.onVirtualPointerDown(e.pointerId, controlName);
      syncActiveState();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      input.onVirtualPointerUp(e.pointerId);
      syncActiveState();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      input.onVirtualPointerCancel(e.pointerId);
      syncActiveState();
    },
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => {
      input.onVirtualPointerCancel(e.pointerId);
      syncActiveState();
    },
    onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
    },
  });

  const dpadBtnSize =
    controlSize === 'compact'
      ? 'w-11 h-11 text-[10px]'
      : controlSize === 'large'
      ? 'w-16 h-16 text-xs'
      : 'w-13 h-13 sm:w-14 sm:h-14 text-xs';

  const actionBtnSize =
    controlSize === 'compact'
      ? 'w-11 h-11 text-[10px]'
      : controlSize === 'large'
      ? 'w-15 h-15 text-xs'
      : 'w-13 h-13 sm:w-14 sm:h-14 text-xs';

  const specialBtnSize =
    controlSize === 'compact'
      ? 'h-9 px-2.5 text-[10px]'
      : controlSize === 'large'
      ? 'h-12 px-4 text-xs'
      : 'h-10 sm:h-11 px-3 text-[11px]';

  return (
    <div
      data-testid="mobile-controls-overlay"
      data-visibility-mode={visibilityMode}
      data-touch-capable={isTouchCapable ? 'true' : 'false'}
      style={{
        opacity: opacity / 100,
        paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(0.625rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.625rem, env(safe-area-inset-right, 0px))',
      }}
      className="fixed inset-x-0 bottom-0 z-30 pointer-events-none flex justify-between items-end px-2.5 pb-2.5 sm:px-5 sm:pb-4 select-none touch-none"
    >
      {/* LEFT CLUSTER: 2D XY DIRECTIONAL PAD (JUMP, LEFT, RIGHT, CROUCH) */}
      <div className="pointer-events-auto grid grid-cols-3 gap-1.5 items-center">
        <div />
        <button
          type="button"
          aria-label="Jump"
          {...bindPointer('jump')}
          className={`${dpadBtnSize} rounded-xl border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
            activeControls.jump
              ? 'bg-[#F59E0B] text-black border-white scale-95 shadow-[0_0_16px_#F59E0B]'
              : 'bg-[#10111B]/90 border-[#D6A447] text-[#FEF08A]'
          }`}
        >
          JUMP
        </button>
        <div />

        <button
          type="button"
          aria-label="Move Left"
          {...bindPointer('left')}
          className={`${dpadBtnSize} rounded-xl border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
            activeControls.left
              ? 'bg-[#F59E0B] text-black border-white scale-95 shadow-[0_0_16px_#F59E0B]'
              : 'bg-[#10111B]/90 border-[#D6A447] text-[#FEF08A]'
          }`}
        >
          LEFT
        </button>

        <button
          type="button"
          aria-label="Crouch"
          {...bindPointer('crouch')}
          className={`${dpadBtnSize} rounded-xl border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
            activeControls.crouch
              ? 'bg-[#F59E0B] text-black border-white scale-95 shadow-[0_0_16px_#F59E0B]'
              : 'bg-[#10111B]/90 border-[#D6A447] text-[#FEF08A]'
          }`}
        >
          DUCK
        </button>

        <button
          type="button"
          aria-label="Move Right"
          {...bindPointer('right')}
          className={`${dpadBtnSize} rounded-xl border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
            activeControls.right
              ? 'bg-[#F59E0B] text-black border-white scale-95 shadow-[0_0_16px_#F59E0B]'
              : 'bg-[#10111B]/90 border-[#D6A447] text-[#FEF08A]'
          }`}
        >
          RIGHT
        </button>
      </div>

      {/* RIGHT CLUSTER: SPECIALS (SUPERSHOT / SUPERMOVE) + MELEE (BLOCK, GRAB, PUNCH, KICK) */}
      <div className="pointer-events-auto flex flex-col items-end gap-1.5">
        {/* TOP ROW: SUPERSHOT [U] & SUPERMOVE [L] */}
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="SuperShot"
            {...bindPointer('supershot')}
            className={`${specialBtnSize} rounded-xl border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
              activeControls.supershot
                ? 'bg-[#38BDF8] text-black border-white scale-95 shadow-[0_0_18px_#38BDF8]'
                : 'bg-[#0284C7]/95 border-[#38BDF8] text-white'
            }`}
          >
            SHOT
          </button>

          <button
            type="button"
            aria-label="SuperMove"
            {...bindPointer('supermove')}
            className={`${specialBtnSize} rounded-xl border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
              activeControls.supermove
                ? 'bg-[#FEF08A] text-black border-white scale-95 shadow-[0_0_20px_#FEF08A]'
                : 'bg-gradient-to-r from-[#F59E0B] to-[#BE123C] border-[#FEF08A] text-white'
            }`}
          >
            SUPER!
          </button>
        </div>

        {/* MIDDLE ROW: GUARD & GRAB */}
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Block"
            {...bindPointer('block')}
            className={`${actionBtnSize} rounded-full border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
              activeControls.block
                ? 'bg-[#38BDF8] text-black border-white scale-95'
                : 'bg-[#1E293B]/90 border-[#94A3B8] text-white'
            }`}
          >
            GUARD
          </button>

          <button
            type="button"
            aria-label="Grab"
            {...bindPointer('grab')}
            className={`${actionBtnSize} rounded-full border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
              activeControls.grab
                ? 'bg-[#C084FC] text-black border-white scale-95'
                : 'bg-[#7C3AED]/90 border-[#C084FC] text-white'
            }`}
          >
            GRAB
          </button>
        </div>

        {/* BOTTOM ROW: PUNCH & KICK */}
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Punch"
            {...bindPointer('punch')}
            className={`${actionBtnSize} rounded-full border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
              activeControls.punch
                ? 'bg-[#FEF08A] text-black border-white scale-95 shadow-[0_0_16px_#FEF08A]'
                : 'bg-[#BE123C]/95 border-[#FEF08A] text-[#FEF08A]'
            }`}
          >
            PUNCH
          </button>

          <button
            type="button"
            aria-label="Kick"
            {...bindPointer('kick')}
            className={`${actionBtnSize} rounded-full border-2 font-['Bungee'] flex items-center justify-center shadow-lg transition-transform touch-none select-none ${
              activeControls.kick
                ? 'bg-[#FEF08A] text-black border-white scale-95 shadow-[0_0_16px_#FEF08A]'
                : 'bg-[#D97706]/95 border-[#FEF08A] text-white'
            }`}
          >
            KICK
          </button>
        </div>
      </div>
    </div>
  );
};
