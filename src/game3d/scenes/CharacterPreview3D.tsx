import React, { useEffect, useRef, useState } from 'react';
import { FighterId, FighterStateName } from '../../types/fighter';
import {
  CharacterPreviewScene,
  PreviewAudioTimerManager,
  PreviewTelemetrySnapshot,
} from './CharacterPreviewScene';
import { getCharacterAssetConfig } from '../../config/characterAssets';
import { AudioManager } from '../../engine/AudioManager';

interface CharacterPreview3DProps {
  characterId: FighterId;
}

const VERIFICATION_STATES: Array<{
  state: FighterStateName;
  label: string;
  accent?: 'gold' | 'cyan' | 'crimson';
}> = [
  { state: 'idle', label: 'Idle', accent: 'gold' },
  { state: 'walk', label: 'Walk', accent: 'gold' },
  { state: 'punch', label: 'Punch [J]', accent: 'gold' },
  { state: 'kick', label: 'Kick [K]', accent: 'gold' },
  { state: 'block', label: 'Block', accent: 'gold' },
  { state: 'jump', label: 'Jump', accent: 'gold' },
  { state: 'super_shot', label: 'SuperShot [U]', accent: 'cyan' },
  { state: 'super_move', label: 'SuperMove [L]', accent: 'crimson' },
];

/**
 * Real-time interactive 3D Babylon.js character turntable & animation preview deck.
 * Clearly distinguishes temporary placeholder rigs from drop-in production GLB models.
 */
export const CharacterPreview3D: React.FC<CharacterPreview3DProps> = ({
  characterId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneControllerRef = useRef<CharacterPreviewScene | null>(null);
  const audioTimerMgrRef = useRef<PreviewAudioTimerManager>(
    new PreviewAudioTimerManager(characterId)
  );

  const [selectedState, setSelectedState] = useState<FighterStateName>('idle');
  const [lodLevel, setLodLevel] = useState<0 | 1 | 2>(0);
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
      }
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

    // Cancel any pending audio timers from previous character before loading new character
    audioTimerMgrRef.current.setCharacterId(characterId);
    audioTimerMgrRef.current.clearAll();

    const controller = sceneControllerRef.current;
    if (!controller) return;
    setSelectedState('idle');
    void controller.loadCharacterAsset(characterId);
  }, [characterId]);

  const handleTriggerState = (state: FighterStateName) => {
    // Cancel any pending special-attack audio timers from a previous state trigger
    const timerMgr = audioTimerMgrRef.current;
    timerMgr.setCharacterId(characterId);
    timerMgr.clearAll();

    setSelectedState(state);
    sceneControllerRef.current?.triggerAnimationState(state);

    // Play character-specific audio preview for special attacks & melee
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

  const handleCycleLod = () => {
    const next = ((lodLevel + 1) % 3) as 0 | 1 | 2;
    setLodLevel(next);
    sceneControllerRef.current?.setLODLevel(next);
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

  return (
    <div
      data-testid="character-preview-3d-container"
      data-preview-character-id={characterId}
      data-loaded-rig-id={matchingTelemetry?.characterId ?? ''}
      data-render-state={renderState}
      className="relative w-full h-48 sm:h-60 rounded-lg overflow-hidden border border-[#D6A447]/60 bg-[#0D0B18] shadow-inner"
    >
      <canvas
        ref={canvasRef}
        data-testid="character-preview-3d-canvas"
        width={460}
        height={260}
        className="w-full h-full object-cover block"
      />

      {/* TOP LEFT: ASSET PIPELINE STATUS & ANIMATION TELEMETRY */}
      <div className="absolute top-1.5 left-1.5 flex flex-wrap items-center gap-1 pointer-events-none">
        {(!matchingTelemetry || matchingTelemetry.isLoading) && (
          <div className="px-1.5 py-0.5 rounded border text-[8px] font-mono uppercase tracking-wider bg-sky-950/90 border-sky-400/70 text-sky-200">
            LOADING 3D RIG...
          </div>
        )}
        {renderState === 'PRODUCTION_SKINNED' ? (
          <div className="px-1.5 py-0.5 rounded border text-[8px] font-mono uppercase tracking-wider bg-[#14532D]/90 border-[#4ADE80] text-[#BBF7D0]">
            PRODUCTION GLB ACTIVE
          </div>
        ) : renderState === 'VISUAL_ONLY' ? (
          <div
            title="Imported 3D mesh active with genuine geometry and textures. Awaiting skinned skeletal rig for full production animations."
            className="px-1.5 py-0.5 rounded border text-[8px] font-mono uppercase tracking-wider bg-cyan-950/90 border-cyan-400/80 text-cyan-200"
          >
            VISUAL-ONLY MODEL ACTIVE · NO SKELETON
          </div>
        ) : renderState === 'LOAD_FAILED' || matchingTelemetry?.loadError ? (
          <div
            title={matchingTelemetry?.loadError || 'Failed to load GLB model; procedural fallback rig active'}
            className="px-1.5 py-0.5 rounded border text-[8px] font-mono uppercase tracking-wider bg-rose-950/90 border-rose-400/70 text-rose-200"
          >
            LOAD FAILED · FALLBACK RIG ACTIVE
          </div>
        ) : (
          <div
            title={`Drop production GLB into public${assetConfig.modelPath}`}
            className="px-1.5 py-0.5 rounded border text-[8px] font-mono uppercase tracking-wider bg-amber-950/90 border-amber-400/70 text-amber-200"
          >
            TEMPORARY PLACEHOLDER · PRODUCTION MODEL NOT INSTALLED
          </div>
        )}
        {matchingTelemetry && (
          <div className="px-1.5 py-0.5 rounded bg-black/80 border border-white/15 text-[8px] font-mono text-[#E2E8F0] flex items-center gap-1">
            <span>{matchingTelemetry.activeClipName}</span>
            <span className="text-[#F59E0B]">{matchingTelemetry.phase}</span>
          </div>
        )}
      </div>

      {/* TOP RIGHT: 3D LEVEL OF DETAIL TOGGLE */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={handleCycleLod}
          className="px-2 py-0.5 rounded border bg-black/75 text-[#FEF08A] border-[#D6A447]/40 hover:border-[#D6A447] text-[9px] font-mono uppercase cursor-pointer"
          title="Cycle 3D Level of Detail (LOD0 / LOD1 / LOD2)"
        >
          LOD{lodLevel}
        </button>
      </div>

      {/* BOTTOM: 8-STATE ANIMATION & SFX VERIFICATION DECK */}
      <div className="absolute bottom-1.5 inset-x-1.5 flex flex-wrap items-center justify-center gap-1">
        {VERIFICATION_STATES.map((item) => {
          const isActive =
            (telemetry?.activeState || selectedState) === item.state;
          let styleClass =
            'bg-black/80 text-[#F1E7D0] border-[#D6A447]/40 hover:border-[#D6A447]';
          if (item.accent === 'cyan') {
            styleClass = isActive
              ? 'bg-[#0284C7] text-white border-[#38BDF8]'
              : 'bg-black/80 text-[#38BDF8] border-[#38BDF8]/40 hover:border-[#38BDF8]';
          } else if (item.accent === 'crimson') {
            styleClass = isActive
              ? 'bg-[#BE123C] text-[#FEF08A] border-[#FEF08A]'
              : 'bg-black/80 text-[#FEF08A] border-[#BE123C]/60 hover:border-[#FEF08A]';
          } else if (isActive) {
            styleClass = 'bg-[#D6A447] text-black border-[#FEF08A]';
          }

          return (
            <button
              key={item.state}
              type="button"
              onClick={() => handleTriggerState(item.state)}
              className={`px-1.5 py-0.5 text-[9px] font-['Rajdhani'] font-black uppercase rounded border cursor-pointer transition-colors ${styleClass}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
