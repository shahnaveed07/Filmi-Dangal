import React, { useState } from 'react';
import { Play, RotateCcw, Home, Settings, Dumbbell } from 'lucide-react';
import { AudioManager } from '../engine/AudioManager';
import { GameBridge } from '../engine/GameBridge';
import { TrainingDummyBehavior } from '../types/fighter';
import { Modal, PrimaryButton, SecondaryButton } from './ui/FightFunUI';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onMainMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenSettings,
  onMainMenu,
}) => {
  const audio = AudioManager.getInstance();
  const bridge = GameBridge.getInstance();
  const isTraining = bridge.gameMode === 'training';
  const [dummyBehavior, setDummyBehavior] = useState<TrainingDummyBehavior>(
    bridge.trainingDummyBehavior
  );

  const [confirmingRestart, setConfirmingRestart] = useState(false);

  const handleDummyBehavior = (behavior: TrainingDummyBehavior) => {
    audio.playSound('click');
    setDummyBehavior(behavior);
    bridge.setTrainingDummyBehavior(behavior);
  };

  return (
    <Modal title="PAUSED" onClose={onResume} maxWidthClass="max-w-sm">
      {isTraining && (
        <div className="w-full bg-black/40 border border-[#38BDF8]/35 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-1.5 text-xs font-['Rajdhani'] font-bold text-[#38BDF8] uppercase mb-2">
            <Dumbbell size={14} />
            <span>Dummy Behavior</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                { id: 'stand', label: 'Stand' },
                { id: 'block', label: 'Block' },
                { id: 'crouch', label: 'Crouch' },
                { id: 'jump', label: 'Jump' },
                { id: 'cpu_spar', label: 'Spar' },
              ] as Array<{ id: TrainingDummyBehavior; label: string }>
            ).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => handleDummyBehavior(b.id)}
                className={`py-1.5 px-1 rounded text-[10px] font-['Rajdhani'] font-black uppercase border transition-colors cursor-pointer ${
                  dummyBehavior === b.id
                    ? 'bg-[#0284C7] border-[#FEF08A] text-white'
                    : 'bg-[#171526] border-[#38BDF8]/30 text-[#38BDF8] hover:text-white'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <PrimaryButton
          data-testid="pause-resume-btn"
          fullWidth
          icon={<Play size={18} />}
          onClick={() => {
            audio.playSound('click');
            onResume();
          }}
        >
          RESUME
        </PrimaryButton>

        {!confirmingRestart ? (
          <SecondaryButton
            data-testid="pause-restart-match-btn"
            fullWidth
            icon={<RotateCcw size={16} />}
            onClick={() => {
              audio.playSound('click');
              if (isTraining) {
                onRestart();
              } else {
                setConfirmingRestart(true);
              }
            }}
          >
            RESTART MATCH
          </SecondaryButton>
        ) : (
          <div
            data-testid="pause-restart-confirm-group"
            className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-black/50 border border-[#BE123C]"
          >
            <PrimaryButton
              data-testid="pause-confirm-restart-btn"
              fullWidth
              onClick={() => {
                audio.playSound('click');
                setConfirmingRestart(false);
                onRestart();
              }}
              className="py-2.5 px-3 text-xs"
            >
              CONFIRM RESTART
            </PrimaryButton>
            <SecondaryButton
              data-testid="pause-cancel-restart-btn"
              fullWidth
              onClick={() => {
                audio.playSound('click');
                setConfirmingRestart(false);
              }}
              className="py-2.5 px-3 text-xs"
            >
              CANCEL
            </SecondaryButton>
          </div>
        )}

        <SecondaryButton
          data-testid="pause-settings-btn"
          fullWidth
          icon={<Settings size={16} />}
          onClick={() => {
            audio.playSound('click');
            onOpenSettings();
          }}
        >
          SETTINGS
        </SecondaryButton>

        <SecondaryButton
          data-testid="pause-main-menu-btn"
          fullWidth
          icon={<Home size={16} />}
          onClick={() => {
            audio.playSound('click');
            onMainMenu();
          }}
        >
          MAIN MENU
        </SecondaryButton>
      </div>
    </Modal>
  );
};
