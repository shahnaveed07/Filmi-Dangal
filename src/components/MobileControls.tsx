import React, { useEffect } from 'react';
import { InputManager } from '../engine/InputManager';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Shield,
  Zap,
  Crosshair,
} from 'lucide-react';

export const MobileControls: React.FC = () => {
  const input = InputManager.getInstance();

  useEffect(() => {
    return () => {
      input.clearTouchInputs();
    };
  }, [input]);

  const handlePointerDown = (control: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported in synthetic test events
    }
    input.onVirtualPointerDown(e.pointerId, control);
  };

  const handlePointerUp = (_control: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
    input.onVirtualPointerUp(e.pointerId);
  };

  const handlePointerCancel = (_control: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    input.onVirtualPointerCancel(e.pointerId);
  };

  const handleLostPointerCapture = (_control: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    input.onVirtualPointerUp(e.pointerId);
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex items-end justify-between px-3 sm:px-6 pb-14 sm:pb-16 z-20">
      {/* LEFT: 2D XY PLANE VIRTUAL DIRECTIONAL PAD (JUMP, CROUCH, LEFT, RIGHT) */}
      <div className="pointer-events-auto flex items-end gap-2">
        <div className="flex flex-col items-center">
          {/* JUMP (UP / +Y) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('jump')}
            onPointerUp={handlePointerUp('jump')}
            onPointerCancel={handlePointerCancel('jump')}
            onLostPointerCapture={handleLostPointerCapture('jump')}
            className="w-11 h-11 bg-[#10111B]/85 active:bg-[#D6A447] active:text-[#10111B] border-2 border-[#D6A447] text-[#D6A447] rounded-md flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Jump"
          >
            <ChevronUp size={18} />
            <span className="text-[7px] font-mono font-bold -mt-1">JUMP</span>
          </button>

          <div className="flex gap-3 my-1">
            {/* LEFT (-X) */}
            <button
              type="button"
              onPointerDown={handlePointerDown('left')}
              onPointerUp={handlePointerUp('left')}
              onPointerCancel={handlePointerCancel('left')}
              onLostPointerCapture={handleLostPointerCapture('left')}
              className="w-11 h-11 bg-[#10111B]/85 active:bg-[#D6A447] active:text-[#10111B] border-2 border-[#D6A447] text-[#D6A447] rounded-md flex items-center justify-center shadow-lg active:scale-95 transition-transform touch-none"
              aria-label="Move Left"
            >
              <ChevronLeft size={22} />
            </button>

            {/* CROUCH (DOWN) */}
            <button
              type="button"
              onPointerDown={handlePointerDown('crouch')}
              onPointerUp={handlePointerUp('crouch')}
              onPointerCancel={handlePointerCancel('crouch')}
              onLostPointerCapture={handleLostPointerCapture('crouch')}
              className="w-11 h-11 bg-[#10111B]/85 active:bg-[#D6A447] active:text-[#10111B] border-2 border-[#D6A447] text-[#D6A447] rounded-md flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform touch-none"
              aria-label="Crouch"
            >
              <ChevronDown size={18} />
              <span className="text-[7px] font-mono font-bold -mt-1">CROUCH</span>
            </button>

            {/* RIGHT (+X) */}
            <button
              type="button"
              onPointerDown={handlePointerDown('right')}
              onPointerUp={handlePointerUp('right')}
              onPointerCancel={handlePointerCancel('right')}
              onLostPointerCapture={handleLostPointerCapture('right')}
              className="w-11 h-11 bg-[#10111B]/85 active:bg-[#D6A447] active:text-[#10111B] border-2 border-[#D6A447] text-[#D6A447] rounded-md flex items-center justify-center shadow-lg active:scale-95 transition-transform touch-none"
              aria-label="Move Right"
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: ARCADE ACTION BUTTONS (GUARD, PUNCH, KICK, GRAB, SUPERSHOT, SUPERMOVE) */}
      <div className="pointer-events-auto flex items-end gap-2">
        {/* GUARD / BLOCK */}
        <button
          type="button"
          onPointerDown={handlePointerDown('block')}
          onPointerUp={handlePointerUp('block')}
          onPointerCancel={handlePointerCancel('block')}
          onLostPointerCapture={handleLostPointerCapture('block')}
          className="w-11 h-11 bg-[#1E293B]/90 active:bg-[#38BDF8] active:text-[#0F172A] border-2 border-[#38BDF8] text-[#38BDF8] rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform touch-none mb-8"
          aria-label="Guard / Block"
        >
          <Shield size={14} />
          <span className="text-[8px] font-black">GUARD</span>
        </button>

        {/* 6-BUTTON ARCADE CLUSTER: PUNCH, KICK, GRAB, SHOT [U], SUPER [L] */}
        <div className="grid grid-cols-3 gap-1.5">
          {/* PUNCH (J) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('punch')}
            onPointerUp={handlePointerUp('punch')}
            onPointerCancel={handlePointerCancel('punch')}
            onLostPointerCapture={handleLostPointerCapture('punch')}
            className="w-12 h-12 bg-[#BE123C]/90 active:bg-[#F43F5E] text-white border-2 border-[#F43F5E] rounded-full flex flex-col items-center justify-center font-['Bungee'] shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Punch"
          >
            <span className="text-xs">J</span>
            <span className="text-[7px] font-mono -mt-0.5">PUNCH</span>
          </button>

          {/* KICK (K) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('kick')}
            onPointerUp={handlePointerUp('kick')}
            onPointerCancel={handlePointerCancel('kick')}
            onLostPointerCapture={handleLostPointerCapture('kick')}
            className="w-12 h-12 bg-[#D97706]/90 active:bg-[#F59E0B] text-white border-2 border-[#F59E0B] rounded-full flex flex-col items-center justify-center font-['Bungee'] shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Kick"
          >
            <span className="text-xs">K</span>
            <span className="text-[7px] font-mono -mt-0.5">KICK</span>
          </button>

          {/* GRAB (I) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('grab')}
            onPointerUp={handlePointerUp('grab')}
            onPointerCancel={handlePointerCancel('grab')}
            onLostPointerCapture={handleLostPointerCapture('grab')}
            className="w-12 h-12 bg-[#4C1D95]/90 active:bg-[#A855F7] text-white border-2 border-[#A855F7] rounded-full flex flex-col items-center justify-center font-['Bungee'] shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Grab"
          >
            <span className="text-xs">I</span>
            <span className="text-[7px] font-mono -mt-0.5">GRAB</span>
          </button>

          {/* SUPERSHOT (U) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('super_shot')}
            onPointerUp={handlePointerUp('super_shot')}
            onPointerCancel={handlePointerCancel('super_shot')}
            onLostPointerCapture={handleLostPointerCapture('super_shot')}
            className="w-12 h-12 bg-[#0284C7]/90 active:bg-[#38BDF8] text-white border-2 border-[#38BDF8] rounded-full flex flex-col items-center justify-center font-['Bungee'] shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="SuperShot"
          >
            <Crosshair size={13} />
            <span className="text-[7px] font-mono">SHOT [U]</span>
          </button>

          {/* SUPERMOVE (L) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('super_move')}
            onPointerUp={handlePointerUp('super_move')}
            onPointerCancel={handlePointerCancel('super_move')}
            onLostPointerCapture={handleLostPointerCapture('super_move')}
            className="col-span-2 h-12 bg-gradient-to-tr from-[#DC2626] to-[#F59E0B] text-white border-2 border-[#FEF08A] rounded-full flex items-center justify-center gap-1 font-['Bungee'] shadow-[0_0_12px_rgba(245,158,11,0.7)] active:scale-95 transition-transform touch-none px-2"
            aria-label="SuperMove"
          >
            <Zap size={14} />
            <span className="text-[9px] font-black">SUPERMOVE [L]</span>
          </button>
        </div>
      </div>
    </div>
  );
};
