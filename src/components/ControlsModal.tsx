import React from 'react';
import { X, Keyboard, Smartphone, Swords, Shield, Zap } from 'lucide-react';
import { AudioManager } from '../engine/AudioManager';
import { COMBO_DEFINITIONS } from '../engine/ComboSystem';

interface ControlsModalProps {
  onClose: () => void;
}

export const ControlsModal: React.FC<ControlsModalProps> = ({ onClose }) => {
  const audio = AudioManager.getInstance();

  return (
    <div className="absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 select-none overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#161424] border-2 border-[#D6A447] rounded-xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-[#D6A447]/30 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Swords size={22} className="text-[#F59E0B]" />
            <h2 className="font-['Bungee'] text-xl sm:text-2xl text-[#FEF08A] tracking-wider">
              HOW TO PLAY & COMBOS
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

        {/* CONTROLS SECTION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* DESKTOP KEYBOARD */}
          <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3.5">
            <div className="flex items-center gap-2 text-xs font-['Cinzel'] font-black text-[#D6A447] mb-2 uppercase">
              <Keyboard size={16} />
              <span>KEYBOARD CONTROLS</span>
            </div>
            <div className="space-y-1.5 text-xs font-mono text-[#F1E7D0]">
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span>MOVE / WALK</span>
                <span className="font-bold text-[#FDE047]">A / D or LEFT / RIGHT</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span>JUMP</span>
                <span className="font-bold text-[#FDE047]">W or UP</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span>CROUCH</span>
                <span className="font-bold text-[#FDE047]">S or DOWN</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span>PUNCH</span>
                <span className="font-bold text-[#FDE047]">J</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span>KICK</span>
                <span className="font-bold text-[#FDE047]">K</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span>GRAB / THROW</span>
                <span className="font-bold text-[#FDE047]">I</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span>SUPER ATTACK</span>
                <span className="font-bold text-[#FDE047]">SPACE or L (100 Meter)</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1">
                <span>BLOCK / GUARD</span>
                <span className="font-bold text-[#FDE047]">HOLD AWAY or B</span>
              </div>
              <div className="flex justify-between">
                <span>PAUSE / MUTE</span>
                <span className="font-bold text-[#FDE047]">ESC or P / M</span>
              </div>
            </div>
          </div>

          {/* MOBILE MULTITOUCH & TACTICS */}
          <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-['Cinzel'] font-black text-[#D6A447] mb-2 uppercase">
                <Smartphone size={16} />
                <span>MOBILE MULTITOUCH</span>
              </div>
              <p className="text-xs text-[#F1E7D0]/80 leading-relaxed mb-3">
                Seamless on-screen virtual controls. Left side provides full 4-directional movement, while right side exposes snappy Arcade Buttons with independent Pointer tracking for simultaneous multi-finger inputs!
              </p>
            </div>

            <div className="p-2.5 bg-[#BE123C]/20 border border-[#BE123C] rounded text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#FEF08A]">
                <Shield size={14} />
                <span>BLOCKING MECHANICS</span>
              </div>
              <p className="text-[11px] text-white/80">
                Hold AWAY from opponent or tap GUARD. Standing block stops High/Mid strikes. Crouch block stops Low Sweeps. Grabs bypass regular standing guard!
              </p>
            </div>
          </div>
        </div>

        {/* COMBO CHAINS LIST */}
        <div className="bg-black/40 border border-[#D6A447]/30 rounded-lg p-3.5 mb-5">
          <div className="flex items-center gap-2 text-xs font-['Cinzel'] font-black text-[#D6A447] mb-3 uppercase">
            <Zap size={16} />
            <span>OFFICIAL COMBO CHAINS</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {COMBO_DEFINITIONS.map((combo) => (
              <div key={combo.id} className="bg-[#10111B] p-2.5 rounded border border-[#D6A447]/20 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-['Rajdhani'] font-bold text-sm text-[#FEF08A]">
                    {combo.name}
                  </span>
                  <span className="text-[10px] font-mono text-[#F59E0B] uppercase">
                    CHAIN
                  </span>
                </div>
                <p className="text-[11px] text-white/70">
                  {combo.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CLOSE BUTTON */}
        <button
          onClick={() => {
            audio.playSound('click');
            onClose();
          }}
          className="w-full py-3 bg-[#BE123C] hover:bg-[#DC2626] text-white font-['Bungee'] text-sm tracking-wider rounded border border-[#FEF08A] cursor-pointer"
        >
          GOT IT, LET&apos;S FIGHT!
        </button>
      </div>
    </div>
  );
};
