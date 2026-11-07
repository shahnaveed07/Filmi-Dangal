import React, { useEffect, useState } from 'react';
import { InputManager } from '../engine/InputManager';
import { SettingsManager } from '../engine/SettingsManager';

/**
 * MobileControls
 *
 * Responsive multi-touch arcade overlay for mobile and tablet devices (Section 6.5).
 * Features:
 * - Left, Right, Jump, Crouch, Block, Grab, Punch, Kick, SuperShot, and SuperMove buttons
 * - High-contrast active visual feedback when pressed
 * - Configurable button size (`compact`, `standard`, `large`) and opacity (`40%–100%`)
 * - Multi-touch pointer tracking without duplicate mouse-compatibility events
 * - Safe-area inset support and automatic release on pointercancel / blur / visibilitychange
 */
export const MobileControls: React.FC = () => {
  const input = InputManager.getInstance();
  const settingsMgr = SettingsManager.getInstance();

  const [activeControls, setActiveControls] = useState<Record<string, boolean>>({});
  const [controlSize, setControlSize] = useState(settingsMgr.getSettings().mobileControlSize);
  const [opacity, setOpacity] = useState(settingsMgr.getSettings().mobileControlOpacity);

  useEffect(() => {
    const unsub = settingsMgr.subscribe((s) => {
      setControlSize(s.mobileControlSize);
      setOpacity(s.mobileControlOpacity);
    });
    return () => {
      unsub();
      input.clearTouchInputs();
    };
  }, [input, settingsMgr]);

  const syncActiveState = () => {
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
  };

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
      style={{ opacity: opacity / 100 }}
      className="fixed inset-x-0 bottom-0 z-30 pointer-events-none flex justify-between items-end px-2.5 pb-2.5 sm:px-5 sm:pb-4 lg:hidden select-none touch-none"
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
