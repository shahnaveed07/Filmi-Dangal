import React, { useEffect, useState } from 'react';
import { GameBridge, GameHUDState } from '../engine/GameBridge';
import { SettingsManager } from '../engine/SettingsManager';
import { Volume2, VolumeX, Pause, RotateCcw, Target } from 'lucide-react';

interface FightHUDProps {
  hudState: GameHUDState;
  onPause: () => void;
  onToggleMute: () => void;
}

export const FightHUD: React.FC<FightHUDProps> = ({
  hudState,
  onPause,
  onToggleMute,
}) => {
  const bridge = GameBridge.getInstance();
  const [p1GhostHp, setP1GhostHp] = useState(hudState.p1Health);
  const [p2GhostHp, setP2GhostHp] = useState(hudState.p2Health);
  const [hudScale, setHudScale] = useState(
    SettingsManager.getInstance().getSettings().hudScale
  );

  useEffect(() => {
    return SettingsManager.getInstance().subscribe((s) => setHudScale(s.hudScale));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setP1GhostHp((prev) =>
        prev > hudState.p1Health
          ? prev - (prev - hudState.p1Health) * 0.2
          : hudState.p1Health
      );
    }, 40);
    return () => clearTimeout(timer);
  }, [hudState.p1Health, p1GhostHp]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setP2GhostHp((prev) =>
        prev > hudState.p2Health
          ? prev - (prev - hudState.p2Health) * 0.2
          : hudState.p2Health
      );
    }, 40);
    return () => clearTimeout(timer);
  }, [hudState.p2Health, p2GhostHp]);

  const p1Pct = Math.max(
    0,
    Math.min(100, (hudState.p1Health / hudState.p1MaxHealth) * 100)
  );
  const p1GhostPct = Math.max(
    0,
    Math.min(100, (p1GhostHp / hudState.p1MaxHealth) * 100)
  );

  const p2Pct = Math.max(
    0,
    Math.min(100, (hudState.p2Health / hudState.p2MaxHealth) * 100)
  );
  const p2GhostPct = Math.max(
    0,
    Math.min(100, (p2GhostHp / hudState.p2MaxHealth) * 100)
  );

  const p1SuperPct = Math.min(100, hudState.p1Meter);
  const p2SuperPct = Math.min(100, hudState.p2Meter);

  const p1CanSuperShot = p1SuperPct >= 25 && !hudState.p1SuperShotCooldown;
  const isTraining = hudState.gameMode === 'training';

  const barHeightClass =
    hudScale === 'compact'
      ? 'h-4 sm:h-5'
      : hudScale === 'large'
      ? 'h-6 sm:h-8'
      : 'h-5 sm:h-7';

  return (
    <div
      data-testid="fight-hud"
      className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-2.5 sm:p-4 md:p-5"
    >
      {/* TOP PERIMETER: P1 HEALTH, TIMER, P2 HEALTH */}
      <div className="flex items-start justify-between w-full max-w-6xl mx-auto gap-2 sm:gap-4">
        {/* PLAYER 1 HEALTH & SUPER METER */}
        <div className="flex-1 min-w-0 flex flex-col items-start">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-['Bungee'] text-xs sm:text-base tracking-wide text-[#F1E7D0] truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
              {hudState.p1Name}
            </span>
            {!isTraining && (
              <div className="flex gap-1 shrink-0">
                {[1, 2].map((w) => (
                  <div
                    key={w}
                    className={`w-3 h-3 rounded-full border border-[#D6A447] ${
                      hudState.p1Wins >= w
                        ? 'bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]'
                        : 'bg-[#10111B]/80'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div
            className={`w-full ${barHeightClass} bg-[#0D0C16] border-2 border-[#D6A447] rounded relative overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.9)]`}
          >
            <div
              className="absolute top-0 right-0 bottom-0 bg-[#BE123C] transition-all duration-300"
              style={{ width: `${p1GhostPct}%` }}
            />
            <div
              className="absolute top-0 right-0 bottom-0 bg-gradient-to-l from-[#EAB308] to-[#22C55E] transition-all duration-75"
              style={{ width: `${p1Pct}%` }}
            />
          </div>

          {/* COMPACT SPECIAL / SUPER METER BAR */}
          <div className="w-full mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-2.5 bg-[#0D0C16] border border-[#D6A447]/75 rounded overflow-hidden shadow">
              <div
                className={`h-full transition-all duration-100 ${
                  p1SuperPct >= 100
                    ? 'bg-gradient-to-r from-[#F59E0B] via-[#EF4444] to-[#FEF08A]'
                    : 'bg-gradient-to-r from-[#0284C7] to-[#38BDF8]'
                }`}
                style={{ width: `${p1SuperPct}%` }}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0 text-[9px] sm:text-[10px] font-['Rajdhani'] font-black uppercase tracking-wider">
              {p1CanSuperShot && (
                <span className="px-1.5 py-0.5 rounded bg-[#0284C7]/90 text-white border border-[#38BDF8]">
                  SHOT
                </span>
              )}
              {p1SuperPct >= 100 && (
                <span className="px-1.5 py-0.5 rounded bg-[#BE123C] text-[#FEF08A] border border-[#FEF08A]">
                  SUPER
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CENTER MATCH TIMER & PAUSE/MUTE */}
        <div className="flex flex-col items-center px-1 sm:px-3 shrink-0">
          <div className="bg-[#0D0C16]/95 border-2 border-[#D6A447] rounded-lg px-3 sm:px-4 py-1 text-center shadow-[0_4px_16px_rgba(0,0,0,0.95)]">
            <span className="font-mono font-black text-xl sm:text-3xl md:text-4xl text-[#FEF08A] tabular-nums tracking-tight">
              {isTraining
                ? '∞'
                : hudState.roundTimer.toString().padStart(2, '0')}
            </span>
            <div className="text-[9px] sm:text-[10px] font-['Rajdhani'] font-black tracking-widest text-[#D6A447] uppercase">
              {isTraining ? 'TRAINING' : `ROUND ${hudState.currentRound}`}
            </div>
          </div>

          <div className="flex gap-1.5 mt-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={onToggleMute}
              className="p-1.5 bg-[#0D0C16]/85 hover:bg-[#171526] border border-[#D6A447]/60 text-[#D6A447] rounded hover:border-[#FEF08A] transition-colors cursor-pointer"
              title="Toggle Audio [M]"
              aria-label="Toggle Audio"
            >
              {hudState.isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button
              type="button"
              data-testid="hud-pause-btn"
              onClick={onPause}
              className="p-1.5 bg-[#0D0C16]/85 hover:bg-[#171526] border border-[#D6A447]/60 text-[#D6A447] rounded hover:border-[#FEF08A] transition-colors cursor-pointer"
              title="Pause Game [ESC / P]"
              aria-label="Pause Game"
            >
              <Pause size={14} />
            </button>
          </div>

          {isTraining && (
            <div className="mt-1 flex items-center gap-1 pointer-events-auto">
              <button
                type="button"
                onClick={() => bridge.cycleTrainingDummyBehavior()}
                className="px-2 py-0.5 bg-[#141D2E]/90 hover:bg-[#1E2D47] border border-[#38BDF8] rounded text-[9px] font-mono text-[#38BDF8] uppercase flex items-center gap-1 cursor-pointer"
              >
                <Target size={10} />
                <span>{(hudState.trainingDummyBehavior || 'stand').toUpperCase()}</span>
              </button>
              <button
                type="button"
                onClick={() => bridge.resetTrainingState()}
                className="px-2 py-0.5 bg-[#171526]/90 hover:bg-[#25203B] border border-[#D6A447]/60 rounded text-[9px] font-mono text-[#FEF08A] uppercase flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={10} />
                <span>RESET</span>
              </button>
            </div>
          )}
        </div>

        {/* PLAYER 2 HEALTH & SUPER METER */}
        <div className="flex-1 min-w-0 flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1">
            {!isTraining && (
              <div className="flex gap-1 shrink-0">
                {[2, 1].map((w) => (
                  <div
                    key={w}
                    className={`w-3 h-3 rounded-full border border-[#D6A447] ${
                      hudState.p2Wins >= w
                        ? 'bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]'
                        : 'bg-[#10111B]/80'
                    }`}
                  />
                ))}
              </div>
            )}
            <span className="font-['Bungee'] text-xs sm:text-base tracking-wide text-[#F1E7D0] truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
              {hudState.p2Name}
            </span>
          </div>

          <div
            className={`w-full ${barHeightClass} bg-[#0D0C16] border-2 border-[#D6A447] rounded relative overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.9)]`}
          >
            <div
              className="absolute top-0 left-0 bottom-0 bg-[#BE123C] transition-all duration-300"
              style={{ width: `${p2GhostPct}%` }}
            />
            <div
              className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-[#EAB308] to-[#22C55E] transition-all duration-75"
              style={{ width: `${p2Pct}%` }}
            />
          </div>

          {/* P2 COMPACT SUPER METER */}
          <div className="w-full mt-1.5 flex items-center justify-end gap-2">
            {p2SuperPct >= 100 && (
              <span className="px-1.5 py-0.5 rounded bg-[#BE123C] text-[#FEF08A] border border-[#FEF08A] text-[9px] sm:text-[10px] font-['Rajdhani'] font-black uppercase tracking-wider shrink-0">
                SUPER
              </span>
            )}
            <div className="flex-1 h-2.5 bg-[#0D0C16] border border-[#D6A447]/75 rounded overflow-hidden shadow">
              <div
                className={`h-full transition-all duration-100 ${
                  p2SuperPct >= 100
                    ? 'bg-gradient-to-l from-[#F59E0B] via-[#EF4444] to-[#FEF08A]'
                    : 'bg-gradient-to-l from-[#0284C7] to-[#38BDF8]'
                }`}
                style={{ width: `${p2SuperPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* CENTER ROUND / KO ANNOUNCEMENT */}
      {hudState.announcementText && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
          <h1 className="font-['Bungee'] text-3xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FEF08A] via-[#F59E0B] to-[#BE123C] drop-shadow-[0_6px_16px_rgba(0,0,0,0.95)] tracking-wider text-center">
            {hudState.announcementText}
          </h1>
        </div>
      )}

      {/* COMBO INDICATORS */}
      <div className="flex justify-between w-full max-w-6xl mx-auto px-2">
        {hudState.comboP1 >= 2 ? (
          <div className="bg-[#BE123C]/95 border-l-4 border-[#FEF08A] px-3 py-1 rounded shadow-lg">
            <span className="font-['Bungee'] text-base sm:text-2xl text-[#FEF08A]">
              {hudState.comboP1} HITS
            </span>
          </div>
        ) : (
          <div />
        )}

        {hudState.comboP2 >= 2 ? (
          <div className="bg-[#BE123C]/95 border-r-4 border-[#FEF08A] px-3 py-1 rounded shadow-lg">
            <span className="font-['Bungee'] text-base sm:text-2xl text-[#FEF08A]">
              {hudState.comboP2} HITS
            </span>
          </div>
        ) : (
          <div />
        )}
      </div>

      <div className="h-1 shrink-0" />
    </div>
  );
};
