import React from 'react';
import { X, ShieldAlert } from 'lucide-react';
import { AudioManager } from '../engine/AudioManager';

interface DisclaimerModalProps {
  onClose: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onClose }) => {
  const audio = AudioManager.getInstance();

  return (
    <div className="absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 select-none overflow-y-auto">
      <div className="w-full max-w-lg bg-[#161424] border-2 border-[#D6A447] rounded-xl p-5 sm:p-7 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#D6A447]/30 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={22} className="text-[#F59E0B]" />
            <h2 className="font-['Bungee'] text-lg sm:text-xl text-[#FEF08A] tracking-wider">
              PARODY &amp; LEGAL DISCLAIMER
            </h2>
          </div>
          <button
            onClick={() => {
              audio.playSound('click');
              onClose();
            }}
            className="p-1 text-[#D6A447] hover:text-white rounded bg-black/40 border border-[#D6A447]/40 cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-[#F1E7D0]/85 leading-relaxed font-['Rajdhani']">
          <p>
            <strong className="text-[#FEF08A]">FIGHT FUN</strong> is an original work of fictional
            arcade parody inspired by classic 1990s fighting games and celebratory cinema tropes.
          </p>
          <p>
            All characters (<em className="text-amber-200">Bhai Jaan</em>,{' '}
            <em className="text-amber-200">Romance Raja</em>,{' '}
            <em className="text-amber-200">Duggu</em>, and{' '}
            <em className="text-amber-200">Bhidu</em>), arenas, move names, and voice/dialogue
            lines are entirely fictional archetypes created for light-hearted comedic tribute.
          </p>
          <p>
            This game is not affiliated with, endorsed by, or sponsored by any real-world actor, film
            studio, award organization, or production house.
          </p>
          <div className="p-3 bg-black/40 border border-[#D6A447]/30 rounded text-xs text-[#D6A447]">
            <p className="font-bold text-[#FEF08A] mb-1">NOTICE ON LIKENESS &amp; AUDIO SYNTHESIS:</p>
            <p className="text-white/80">
              All 3D character models, skeletal rigs, arena props, and procedural Web Audio sound effects
              are generated programmatically using original code and geometry.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            audio.playSound('click');
            onClose();
          }}
          className="mt-6 w-full py-3 bg-[#BE123C] hover:bg-[#DC2626] text-white font-['Bungee'] text-sm tracking-wider rounded border border-[#FEF08A] cursor-pointer"
        >
          UNDERSTOOD
        </button>
      </div>
    </div>
  );
};
