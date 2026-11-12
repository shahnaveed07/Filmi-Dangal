import React, { useEffect, useRef, useState } from 'react';
import { FighterId, FighterStateName } from '../../types/fighter';
import {
  CharacterPreviewScene,
  PreviewAudioTimerManager,
  PreviewTelemetrySnapshot,
  PreviewViewportVariant,
} from './CharacterPreviewScene';
import { getCharacterAssetConfig } from '../../config/characterAssets';
import { AudioManager } from '../../engine/AudioManager';
import { RotateCcw, RotateCw } from 'lucide-react';

interface CharacterPreview3DProps {
  characterId: FighterId;
  variant?: PreviewViewportVariant;
  showAnimationBar?: boolean;
  className?: string;
}

const PREVIEW_STATES: Array<{
  state: FighterStateName;
  label: string;
  accent?: 'gold' | 'cyan' | 'crimson';
}> = [
  { state: 'idle', label: 'Idle', accent: 'gold' },
  { state: 'walk', label: 'Walk', accent: 'gold' },
  { state: 'punch', label: 'Punch', accent: 'gold' },
  { state: 'kick', label: 'Kick', accent: 'gold' },
  { state: 'super_shot', label: 'SuperShot', accent: 'cyan' },
  { state: 'super_move', label: 'SuperMove', accent: 'crimson' },
];

/**
 * Real-time interactive 3D Babylon.js character turntable & animation preview viewport.
 * Supports drag-to-rotate, rotation buttons, and clean animation triggers.
 */
export const CharacterPreview3D: React.FC<CharacterPreview3DProps> = ({
  characterId,
  variant = 'select',
  showAnimationBar = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneControllerRef = useRef<CharacterPreviewScene | null>(null);
  const audioTimerMgrRef = useRef<PreviewAudioTimerManager>(
    new PreviewAudioTimerManager(characterId)
  );
  const dragStartXRef = useRef<number | null>(null);

  const [selectedState, setSelectedState] = useState<FighterStateName>('idle');
  const [telemetry, setTelemetry] = useState<PreviewTelemetrySnapshot | null>(null);
  const lastTelemetryRef = useRef<number>(0);

  const assetConfig = getCharacterAssetConfig(characterId);
  const audio = AudioManager.getInstance();
  const prevCharacterIdRef = useRef<FighterId>(characterId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const timerMgr = new PreviewAudioTimerManager(characterId);
    audioTimerMgrRef.current = timerMgr;

    const previewScene = new CharacterPreviewScene(
      canvas,
      characterId,
      (snap) => {
        const now = performance.now();
        if (!snap.isLoading || now - lastTelemetryRef.current > 90) {
          lastTelemetryRef.current = now;
          setTelemetry(snap);
        }
      },
      undefined,
      variant
    );
    sceneControllerRef.current = previewScene;

    return () => {
      timerMgr.dispose();
      previewScene.dispose();
      sceneControllerRef.current = null;
    };
    // Initialize WebGL preview scene once per mount; character changes use loadCharacterAsset below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prevCharacterIdRef.current === characterId) {
      return;
    }
    prevCharacterIdRef.current = characterId;

    audioTimerMgrRef.current.setCharacterId(characterId);
    audioTimerMgrRef.current.clearAll();

    const controller = sceneControllerRef.current;
    if (!controller) return;
    setSelectedState('idle');
    void controller.loadCharacterAsset(characterId);
  }, [characterId]);

  const handleTriggerState = (state: FighterStateName) => {
    const timerMgr = audioTimerMgrRef.current;
    timerMgr.setCharacterId(characterId);
    timerMgr.clearAll();

    setSelectedState(state);
    sceneControllerRef.current?.triggerAnimationState(state);

    if (state === 'super_shot') {
      const shotFrames = assetConfig.specialAttackEvents.superShot;
      const releaseDelayMs = Math.round((shotFrames.projectileReleaseFrame / 60) * 1000);
      const impactDelayMs = Math.round((shotFrames.specialImpactFrame / 60) * 1000);
      audio.playCharacterEvent(characterId, 'supershot-charge');
      timerMgr.schedule(releaseDelayMs, characterId, () => {
        audio.playCharacterEvent(characterId, 'supershot-release');
      });
      timerMgr.schedule(impactDelayMs, characterId, () => {
        audio.playCharacterEvent(characterId, 'supershot-impact');
      });
    } else if (state === 'super_move') {
      audio.playCharacterEvent(characterId, 'supermove-charge');
      timerMgr.schedule(360, characterId, () => {
        audio.playCharacterEvent(characterId, 'supermove-impact');
      });
    } else if (state === 'punch' || state === 'kick') {
      audio.playCharacterEvent(characterId, 'normal-attack');
    } else {
      audio.playSound('click');
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragStartXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStartXRef.current === null) return;
    const dx = e.clientX - dragStartXRef.current;
    dragStartXRef.current = e.clientX;
    sceneControllerRef.current?.rotateModel(dx * 0.012);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragStartXRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const matchingTelemetry =
    telemetry && telemetry.characterId === characterId ? telemetry : null;

  const renderState =
    matchingTelemetry?.renderState ||
    matchingTelemetry?.diagnostics?.renderState ||
    (matchingTelemetry?.loadError
      ? 'LOAD_FAILED'
      : assetConfig.isTemporaryPlaceholder
      ? 'TEMPORARY_PLACEHOLDER'
      : 'PRODUCTION_SKINNED');

  const heightClass =
    className ||
    (variant === 'overview'
      ? 'w-full h-72 sm:h-96 md:h-[440px]'
      : variant === 'hero'
      ? 'w-full h-64 sm:h-80 md:h-[380px]'
      : 'w-full h-60 sm:h-72 md:h-80');

  return (
    <div
      data-testid="character-preview-3d-container"
      data-preview-character-id={characterId}
      data-loaded-rig-id={matchingTelemetry?.characterId ?? ''}
      data-render-state={renderState}
      className={`relative rounded-xl overflow-hidden border border-[#D6A447]/40 bg-[#0B0A14] shadow-2xl ${heightClass}`}
    >
      <canvas
        ref={canvasRef}
        data-testid="character-preview-3d-canvas"
        width={640}
        height={480}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full object-cover block cursor-grab active:cursor-grabbing"
      />

      {/* SUBTLE LOADING INDICATOR */}
      {(!matchingTelemetry || matchingTelemetry.isLoading) && (
        <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded bg-black/75 border border-[#D6A447]/50 text-[10px] font-['Rajdhani'] font-bold uppercase tracking-widest text-[#FEF08A] pointer-events-none">
          Loading...
        </div>
      )}

      {/* TOP RIGHT: INTERACTIVE TURNTABLE ROTATION CONTROLS */}
      {variant !== 'hero' && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => sceneControllerRef.current?.rotateModel(-0.45)}
            className="p-1.5 rounded bg-black/70 hover:bg-black text-[#F1E7D0] border border-[#D6A447]/40 hover:border-[#FEF08A] transition-colors cursor-pointer"
            title="Rotate Left"
            aria-label="Rotate Left"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={() => sceneControllerRef.current?.resetRotation()}
            className="px-2 py-1 rounded bg-black/70 hover:bg-black text-[#D6A447] hover:text-[#FEF08A] border border-[#D6A447]/40 hover:border-[#FEF08A] text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider transition-colors cursor-pointer"
            title="Reset Turntable"
          >
            360°
          </button>
          <button
            type="button"
            onClick={() => sceneControllerRef.current?.rotateModel(0.45)}
            className="p-1.5 rounded bg-black/70 hover:bg-black text-[#F1E7D0] border border-[#D6A447]/40 hover:border-[#FEF08A] transition-colors cursor-pointer"
            title="Rotate Right"
            aria-label="Rotate Right"
          >
            <RotateCw size={13} />
          </button>
        </div>
      )}

      {/* BOTTOM: CLEAN POSE / MOVE PREVIEW BAR */}
      {showAnimationBar && (
        <div className="absolute bottom-2.5 inset-x-2.5 flex flex-wrap items-center justify-center gap-1.5">
          {PREVIEW_STATES.map((item) => {
            const isActive =
              (telemetry?.activeState || selectedState) === item.state;
            let styleClass =
              'bg-black/75 text-[#F1E7D0] border-[#D6A447]/35 hover:border-[#D6A447]';
            if (item.accent === 'cyan') {
              styleClass = isActive
                ? 'bg-[#0284C7] text-white border-[#38BDF8]'
                : 'bg-black/75 text-[#38BDF8] border-[#38BDF8]/40 hover:border-[#38BDF8]';
            } else if (item.accent === 'crimson') {
              styleClass = isActive
                ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
                : 'bg-black/75 text-[#FEF08A] border-[#BE123C]/60 hover:border-[#FEF08A]';
            } else if (isActive) {
              styleClass = 'bg-[#D6A447] text-black border-[#FEF08A]';
            }

            return (
              <button
                key={item.state}
                type="button"
                onClick={() => handleTriggerState(item.state)}
                className={`px-2.5 py-1 text-[10px] font-['Rajdhani'] font-black uppercase tracking-wider rounded border cursor-pointer transition-colors ${styleClass}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
