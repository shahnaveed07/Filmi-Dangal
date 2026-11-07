import React, { useEffect, useState } from 'react';
import { GameBridge, GameHUDState } from '../engine/GameBridge';
import { SettingsManager } from '../engine/SettingsManager';
import { Volume2, VolumeX, Pause, RotateCcw, Target } from 'lucide-react';

interface FightHUDProps {
  hudState: GameHUDState;
  onPause: () => void;
  onToggleMute: () => void;
}

export const FightHUD: React.FC<FightHUDProps> = ({ hudState, onPause, onToggleMute }) => {
  const bridge = GameBridge.getInstance();
  const [p1GhostHp, setP1GhostHp] = useState(hudState.p1Health);
  const [p2GhostHp, setP2GhostHp] = useState(hudState.p2Health);
  const [hudScale, setHudScale] = useState(SettingsManager.getInstance().getSettings().hudScale);

  useEffect(() => {
    return SettingsManager.getInstance().subscribe((s) => setHudScale(s.hudScale));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setP1GhostHp((prev) =>
        prev > hudState.p1Health ? prev - (prev - hudState.p1Health) * 0.2 : hudState.p1Health
      );
    }, 40);
    return () => clearTimeout(timer);
  }, [hudState.p1Health, p1GhostHp]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setP2GhostHp((prev) =>
        prev > hudState.p2Health ? prev - (prev - hudState.p2Health) * 0.2 : hudState.p2Health
      );
    }, 40);
    return () => clearTimeout(timer);
  }, [hudState.p2Health, p2GhostHp]);

  const p1Pct = Math.max(0, Math.min(100, (hudState.p1Health / hudState.p1MaxHealth) * 100));
  const p1GhostPct = Math.max(0, Math.min(100, (p1GhostHp / hudState.p1MaxHealth) * 100));

  const p2Pct = Math.max(0, Math.min(100, (hudState.p2Health / hudState.p2MaxHealth) * 100));
  const p2GhostPct = Math.max(0, Math.min(100, (p2GhostHp / hudState.p2MaxHealth) * 100));

  const p1SuperPct = Math.min(100, hudState.p1Meter);
  const p2SuperPct = Math.min(100, hudState.p2Meter);

  const p1ShotCooldownSec = hudState.p1SuperShotCooldown
    ? (hudState.p1SuperShotCooldown / 60).toFixed(1)
    : null;
  const p1CanSuperShot = p1SuperPct >= 25 && !hudState.p1SuperShotCooldown;
  const isTraining = hudState.gameMode === 'training';

  const barHeightClass =
    hudScale === 'compact'
      ? 'h-4 sm:h-5'
      : hudScale === 'large'
      ? 'h-6 sm:h-8'
      : 'h-5 sm:h-7';

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-2 sm:p-4 md:p-5">
      {/* TOP PERIMETER: HEALTH BARS & CLOCK */}
      <div className="flex items-start justify-between w-full max-w-6xl mx-auto gap-1.5 sm:gap-4">
        {/* P1 STATUS CLUSTER */}
        <div className="flex-1 min-w-0 flex flex-col items-start">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-extrabold text-xs sm:text-base tracking-wider text-[#F1E7D0] uppercase truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-['Rajdhani']">
              {hudState.p1Name}
            </span>
            {!isTraining && (
              <div className="flex gap-1 ml-1 shrink-0">
                <div
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border border-[#D6A447] ${
                    hudState.p1Wins >= 1
                      ? 'bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]'
                      : 'bg-[#10111B]/80'
                  }`}
                />
                <div
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border border-[#D6A447] ${
                    hudState.p1Wins >= 2
                      ? 'bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]'
                      : 'bg-[#10111B]/80'
                  }`}
                />
              </div>
            )}
          </div>

          {/* P1 HEALTH BAR */}
          <div
            className={`w-full ${barHeightClass} bg-[#10111B] border-2 border-[#D6A447] rounded-sm relative overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.9)]`}
          >
            <div
              className="absolute top-0 right-0 bottom-0 bg-[#BE123C] transition-all duration-300"
              style={{ width: `${p1GhostPct}%` }}
            />
            <div
              className="absolute top-0 right-0 bottom-0 bg-gradient-to-l from-[#EAB308] to-[#22C55E] transition-all duration-75"
              style={{ width: `${p1Pct}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-start px-2 font-mono text-[10px] sm:text-xs font-bold text-white/95 drop-shadow">
              {hudState.p1Health}
            </div>
          </div>

          {/* MOBILE / TABLET P1 SUPER METER (Docked cleanly under Health Bar to avoid touch controls) */}
          <div className="w-full mt-1 flex flex-col gap-0.5 lg:hidden">
            <div className="w-full h-2 bg-[#10111B] border border-[#D6A447]/80 rounded-sm overflow-hidden shadow">
              <div
                className={`h-full transition-all duration-100 ${
                  p1SuperPct >= 100
                    ? 'bg-gradient-to-r from-[#F59E0B] via-[#EF4444] to-[#FDE047]'
                    : 'bg-gradient-to-r from-[#0284C7] to-[#38BDF8]'
                }`}
                style={{ width: `${p1SuperPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[8px] font-mono font-bold">
              <span className={p1SuperPct >= 100 ? 'text-[#FDE047]' : 'text-[#D6A447]'}>
                {p1SuperPct >= 100 ? 'SUPER READY!' : `METER ${p1SuperPct}%`}
              </span>
              <span className={p1CanSuperShot ? 'text-[#38BDF8]' : 'text-white/50'}>
                {p1ShotCooldownSec ? `CD ${p1ShotCooldownSec}s` : p1CanSuperShot ? 'SHOT READY' : 'SHOT 25%'}
              </span>
            </div>
          </div>
        </div>

        {/* CENTER CLOCK & ROUND CLUSTER */}
        <div className="flex flex-col items-center px-1 sm:px-3 shrink-0">
          <div className="bg-[#10111B] border-2 border-[#D6A447] rounded-md px-2.5 sm:px-4 py-0.5 sm:py-1.5 text-center shadow-[0_4px_16px_rgba(0,0,0,0.95)]">
            <span className="font-mono font-black text-xl sm:text-3xl md:text-4xl text-[#FDE047] tabular-nums tracking-tighter drop-shadow-[0_2px_6px_rgba(234,179,8,0.7)]">
              {isTraining ? '∞' : hudState.roundTimer.toString().padStart(2, '0')}
            </span>
            <div className="text-[9px] sm:text-xs font-black tracking-widest text-[#D6A447] uppercase font-['Cinzel']">
              {isTraining
                ? 'TRAINING'
                : hudState.gameMode === 'arcade' && hudState.arcadeStageNumber
                ? `STAGE ${hudState.arcadeStageNumber}/${hudState.arcadeTotalStages ?? 3} · R${hudState.currentRound}`
                : `ROUND ${hudState.currentRound}`}
            </div>
          </div>

          <div className="flex gap-1.5 mt-1 pointer-events-auto">
            <button
              type="button"
              onClick={onToggleMute}
              className="p-1 sm:p-1.5 bg-[#10111B]/85 hover:bg-[#10111B] border border-[#D6A447]/60 text-[#D6A447] rounded hover:border-[#D6A447] transition-colors cursor-pointer"
              title="Toggle Audio [M]"
              aria-label="Toggle Audio"
            >
              {hudState.isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button
              type="button"
              onClick={onPause}
              className="p-1 sm:p-1.5 bg-[#10111B]/85 hover:bg-[#10111B] border border-[#D6A447]/60 text-[#D6A447] rounded hover:border-[#D6A447] transition-colors cursor-pointer"
              title="Pause Game [ESC / P]"
              aria-label="Pause Game"
            >
              <Pause size={14} />
            </button>
          </div>

          {/* TRAINING MODE QUICK CONTROLS */}
          {isTraining && (
            <div className="mt-1 flex items-center gap-1 pointer-events-auto">
              <button
                type="button"
                onClick={() => bridge.cycleTrainingDummyBehavior()}
                className="px-2 py-0.5 bg-[#162032]/90 hover:bg-[#1E2D47] border border-[#38BDF8] rounded text-[9px] sm:text-[10px] font-mono text-[#38BDF8] uppercase flex items-center gap-1 cursor-pointer"
                title="Cycle Training Dummy Behavior"
              >
                <Target size={10} />
                <span>DUMMY: {(hudState.trainingDummyBehavior || 'stand').toUpperCase()}</span>
              </button>
              <button
                type="button"
                onClick={() => bridge.resetTrainingState()}
                className="px-2 py-0.5 bg-[#1A1829]/90 hover:bg-[#25203B] border border-[#D6A447]/60 rounded text-[9px] sm:text-[10px] font-mono text-[#FEF08A] uppercase flex items-center gap-1 cursor-pointer"
                title="Reset Practice Positions"
              >
                <RotateCcw size={10} />
                <span>RESET</span>
              </button>
            </div>
          )}
        </div>

        {/* P2 STATUS CLUSTER */}
        <div className="flex-1 min-w-0 flex flex-col items-end">
          <div className="flex items-center gap-1.5 mb-1">
            {!isTraining && (
              <div className="flex gap-1 mr-1 shrink-0">
                <div
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border border-[#D6A447] ${
                    hudState.p2Wins >= 2
                      ? 'bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]'
                      : 'bg-[#10111B]/80'
                  }`}
                />
                <div
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border border-[#D6A447] ${
                    hudState.p2Wins >= 1
                      ? 'bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]'
                      : 'bg-[#10111B]/80'
                  }`}
                />
              </div>
            )}
            <span className="font-extrabold text-xs sm:text-base tracking-wider text-[#F1E7D0] uppercase truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-['Rajdhani']">
              {hudState.p2Name}
            </span>
          </div>

          {/* P2 HEALTH BAR */}
          <div
            className={`w-full ${barHeightClass} bg-[#10111B] border-2 border-[#D6A447] rounded-sm relative overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.9)]`}
          >
            <div
              className="absolute top-0 left-0 bottom-0 bg-[#BE123C] transition-all duration-300"
              style={{ width: `${p2GhostPct}%` }}
            />
            <div
              className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-[#EAB308] to-[#22C55E] transition-all duration-75"
              style={{ width: `${p2Pct}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-end px-2 font-mono text-[10px] sm:text-xs font-bold text-white/95 drop-shadow">
              {hudState.p2Health}
            </div>
          </div>

          {/* MOBILE / TABLET P2 SUPER METER (Docked cleanly under Health Bar) */}
          <div className="w-full mt-1 flex flex-col items-end gap-0.5 lg:hidden">
            <div className="w-full h-2 bg-[#10111B] border border-[#D6A447]/80 rounded-sm overflow-hidden shadow">
              <div
                className={`h-full transition-all duration-100 ${
                  p2SuperPct >= 100
                    ? 'bg-gradient-to-l from-[#F59E0B] via-[#EF4444] to-[#FDE047]'
                    : 'bg-gradient-to-l from-[#0284C7] to-[#38BDF8]'
                }`}
                style={{ width: `${p2SuperPct}%` }}
              />
            </div>
            <span
              className={`text-[8px] font-mono font-bold ${
                p2SuperPct >= 100 ? 'text-[#FDE047]' : 'text-[#D6A447]'
              }`}
            >
              {p2SuperPct >= 100 ? 'CPU SUPER READY' : `CPU METER ${p2SuperPct}%`}
            </span>
          </div>
        </div>
      </div>

      {/* CENTER POPUP ANNOUNCEMENTS (ROUND INTRO, KO, FIGHT!) */}
      {hudState.announcementText && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
          <div className="text-center transform scale-105">
            <h1 className="font-['Bungee'] text-3xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FEF08A] via-[#F59E0B] to-[#BE123C] drop-shadow-[0_6px_16px_rgba(0,0,0,0.95)] tracking-wider">
              {hudState.announcementText}
            </h1>
          </div>
        </div>
      )}

      {/* SIGNATURE SPECIAL CALLOUT BANNER */}
      {hudState.activeSpecialCallout && !hudState.announcementText && (
        <div className="w-full flex justify-center pointer-events-none px-2">
          <div className="px-3 sm:px-4 py-1 sm:py-1.5 bg-[#10111B]/95 border-2 border-[#FEF08A] rounded shadow-[0_0_20px_rgba(245,158,11,0.85)]">
            <span className="font-['Bungee'] text-xs sm:text-lg text-[#FEF08A] tracking-wider uppercase">
              {hudState.activeSpecialCallout}
            </span>
          </div>
        </div>
      )}

      {/* COMBO NOTIFICATION BANNERS */}
      <div className="flex justify-between w-full max-w-6xl mx-auto px-2 sm:px-4">
        {hudState.comboP1 >= 2 && (
          <div className="flex flex-col items-start bg-[#BE123C]/95 border-l-4 border-[#F59E0B] px-2.5 py-1 rounded shadow-[0_0_16px_rgba(245,158,11,0.8)]">
            <span className="font-['Bungee'] text-base sm:text-2xl text-[#FEF08A] tracking-wide">
              {hudState.comboP1} HITS!
            </span>
            <span className="text-[9px] sm:text-xs font-black text-white uppercase tracking-widest">
              CINEMA COMBO!
            </span>
          </div>
        )}

        <div className="flex-1" />

        {hudState.comboP2 >= 2 && (
          <div className="flex flex-col items-end bg-[#BE123C]/95 border-r-4 border-[#F59E0B] px-2.5 py-1 rounded shadow-[0_0_16px_rgba(245,158,11,0.8)]">
            <span className="font-['Bungee'] text-base sm:text-2xl text-[#FEF08A] tracking-wide">
              {hudState.comboP2} HITS!
            </span>
            <span className="text-[9px] sm:text-xs font-black text-white uppercase tracking-widest">
              CINEMA COMBO!
            </span>
          </div>
        )}
      </div>

      {/* DESKTOP BOTTOM PERIMETER: SUPER METERS & SUPERSHOT STATUS */}
      <div className="hidden lg:flex items-end justify-between w-full max-w-6xl mx-auto gap-3">
        {/* P1 SUPER METER */}
        <div className="flex-1 max-w-md flex flex-col items-start">
          <div className="flex items-center justify-between w-full gap-1 mb-1">
            <span
              className={`text-xs font-black tracking-wider uppercase font-['Cinzel'] truncate ${
                p1SuperPct >= 100
                  ? 'text-[#FDE047] drop-shadow-[0_0_8px_#FDE047]'
                  : 'text-[#D6A447]'
              }`}
            >
              {p1SuperPct >= 100
                ? `SUPERMOVE READY [L]: ${hudState.p1SuperMoveName || 'SUPER'}`
                : `FILMI METER (${p1SuperPct}%)`}
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                p1CanSuperShot
                  ? 'bg-[#0284C7]/80 text-white border-[#38BDF8]'
                  : 'bg-black/70 text-white/50 border-white/20'
              }`}
            >
              {p1ShotCooldownSec
                ? `SHOT CD: ${p1ShotCooldownSec}s`
                : p1CanSuperShot
                ? 'SHOT [U] READY'
                : 'SHOT [U]: 25%'}
            </span>
          </div>
          <div className="w-full h-4 bg-[#10111B] border border-[#D6A447] rounded-sm overflow-hidden shadow-md relative">
            <div
              className={`h-full transition-all duration-100 ${
                p1SuperPct >= 100
                  ? 'bg-gradient-to-r from-[#F59E0B] via-[#EF4444] to-[#FDE047] shadow-[0_0_10px_#FDE047]'
                  : 'bg-gradient-to-r from-[#0284C7] to-[#38BDF8]'
              }`}
              style={{ width: `${p1SuperPct}%` }}
            />
          </div>
        </div>

        {/* P2 SUPER METER */}
        <div className="flex-1 max-w-md flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-black tracking-widest uppercase font-['Cinzel'] ${
                p2SuperPct >= 100
                  ? 'text-[#FDE047] drop-shadow-[0_0_8px_#FDE047]'
                  : 'text-[#D6A447]'
              }`}
            >
              {p2SuperPct >= 100 ? 'CPU SUPERMOVE READY' : `CPU METER (${p2SuperPct}%)`}
            </span>
          </div>
          <div className="w-full h-4 bg-[#10111B] border border-[#D6A447] rounded-sm overflow-hidden shadow-md relative">
            <div
              className={`h-full transition-all duration-100 ${
                p2SuperPct >= 100
                  ? 'bg-gradient-to-l from-[#F59E0B] via-[#EF4444] to-[#FDE047] shadow-[0_0_10px_#FDE047]'
                  : 'bg-gradient-to-l from-[#0284C7] to-[#38BDF8]'
              }`}
              style={{ width: `${p2SuperPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
