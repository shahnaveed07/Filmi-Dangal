import React, { useEffect } from 'react';
import { InputManager } from '../engine/InputManager';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Shield, Zap } from 'lucide-react';

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
    <div className="absolute inset-0 pointer-events-none select-none flex items-end justify-between p-3 sm:p-6 z-20">
      {/* LEFT: 4-WAY VIRTUAL D-PAD */}
      <div className="pointer-events-auto flex flex-col items-center">
        {/* JUMP / UP */}
        <button
          type="button"
          onPointerDown={handlePointerDown('up')}
          onPointerUp={handlePointerUp('up')}
          onPointerCancel={handlePointerCancel('up')}
          onLostPointerCapture={handleLostPointerCapture('up')}
          className="w-12 h-12 bg-[#10111B]/80 active:bg-[#D6A447] active:text-[#10111B] border-2 border-[#D6A447] text-[#D6A447] rounded-md flex items-center justify-center shadow-lg active:scale-95 transition-transform touch-none"
          aria-label="Jump / Up"
        >
          <ChevronUp size={24} />
        </button>

        <div className="flex gap-4 my-1">
          {/* LEFT */}
          <button
            type="button"
            onPointerDown={handlePointerDown('left')}
            onPointerUp={handlePointerUp('left')}
            onPointerCancel={handlePointerCancel('left')}
            onLostPointerCapture={handleLostPointerCapture('left')}
            className="w-12 h-12 bg-[#10111B]/80 active:bg-[#D6A447] active:text-[#10111B] border-2 border-[#D6A447] text-[#D6A447] rounded-md flex items-center justify-center shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Move Left"
          >
            <ChevronLeft size={24} />
          </button>

          {/* CROUCH / DOWN */}
          <button
            type="button"
            onPointerDown={handlePointerDown('down')}
            onPointerUp={handlePointerUp('down')}
            onPointerCancel={handlePointerCancel('down')}
            onLostPointerCapture={handleLostPointerCapture('down')}
            className="w-12 h-12 bg-[#10111B]/80 active:bg-[#D6A447] active:text-[#10111B] border-2 border-[#D6A447] text-[#D6A447] rounded-md flex items-center justify-center shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Crouch / Down"
          >
            <ChevronDown size={24} />
          </button>

          {/* RIGHT */}
          <button
            type="button"
            onPointerDown={handlePointerDown('right')}
            onPointerUp={handlePointerUp('right')}
            onPointerCancel={handlePointerCancel('right')}
            onLostPointerCapture={handleLostPointerCapture('right')}
            className="w-12 h-12 bg-[#10111B]/80 active:bg-[#D6A447] active:text-[#10111B] border-2 border-[#D6A447] text-[#D6A447] rounded-md flex items-center justify-center shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Move Right"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      {/* RIGHT: ARCADE ACTION BUTTONS */}
      <div className="pointer-events-auto flex items-end gap-2.5">
        {/* GUARD / BLOCK */}
        <button
          type="button"
          onPointerDown={handlePointerDown('block')}
          onPointerUp={handlePointerUp('block')}
          onPointerCancel={handlePointerCancel('block')}
          onLostPointerCapture={handleLostPointerCapture('block')}
          className="w-12 h-12 bg-[#1E293B]/90 active:bg-[#38BDF8] active:text-[#0F172A] border-2 border-[#38BDF8] text-[#38BDF8] rounded-full flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform touch-none mb-10"
          aria-label="Guard / Block"
        >
          <Shield size={16} />
          <span className="text-[9px] font-black">GUARD</span>
        </button>

        {/* CLUSTER: PUNCH, KICK, GRAB, SUPER */}
        <div className="grid grid-cols-2 gap-2">
          {/* PUNCH (J) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('punch')}
            onPointerUp={handlePointerUp('punch')}
            onPointerCancel={handlePointerCancel('punch')}
            onLostPointerCapture={handleLostPointerCapture('punch')}
            className="w-13 h-13 bg-[#BE123C]/90 active:bg-[#F43F5E] text-white border-2 border-[#F43F5E] rounded-full flex flex-col items-center justify-center font-['Bungee'] shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Punch"
          >
            <span className="text-sm">J</span>
            <span className="text-[8px] font-mono -mt-1">PUNCH</span>
          </button>

          {/* KICK (K) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('kick')}
            onPointerUp={handlePointerUp('kick')}
            onPointerCancel={handlePointerCancel('kick')}
            onLostPointerCapture={handleLostPointerCapture('kick')}
            className="w-13 h-13 bg-[#D97706]/90 active:bg-[#F59E0B] text-white border-2 border-[#F59E0B] rounded-full flex flex-col items-center justify-center font-['Bungee'] shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Kick"
          >
            <span className="text-sm">K</span>
            <span className="text-[8px] font-mono -mt-1">KICK</span>
          </button>

          {/* GRAB (I) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('grab')}
            onPointerUp={handlePointerUp('grab')}
            onPointerCancel={handlePointerCancel('grab')}
            onLostPointerCapture={handleLostPointerCapture('grab')}
            className="w-13 h-13 bg-[#4C1D95]/90 active:bg-[#A855F7] text-white border-2 border-[#A855F7] rounded-full flex flex-col items-center justify-center font-['Bungee'] shadow-lg active:scale-95 transition-transform touch-none"
            aria-label="Grab"
          >
            <span className="text-sm">I</span>
            <span className="text-[8px] font-mono -mt-1">GRAB</span>
          </button>

          {/* SUPER (SPACE / L) */}
          <button
            type="button"
            onPointerDown={handlePointerDown('super')}
            onPointerUp={handlePointerUp('super')}
            onPointerCancel={handlePointerCancel('super')}
            onLostPointerCapture={handleLostPointerCapture('super')}
            className="w-13 h-13 bg-gradient-to-tr from-[#DC2626] to-[#F59E0B] text-white border-2 border-[#FEF08A] rounded-full flex flex-col items-center justify-center font-['Bungee'] shadow-[0_0_12px_rgba(245,158,11,0.7)] active:scale-95 transition-transform touch-none"
            aria-label="Super Attack"
          >
            <Zap size={14} />
            <span className="text-[9px] font-black -mt-0.5">SUPER</span>
          </button>
        </div>
      </div>
    </div>
  );
};
