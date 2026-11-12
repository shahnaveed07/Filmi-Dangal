import React, { useEffect, useRef, useState } from 'react';
import { Engine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { ARENAS } from '../../data/arenas';
import { ArenaId } from '../../types/fighter';
import { ArenaBuilder3D, ArenaSceneHandle3D } from '../arenas/ArenaBuilder3D';
import { detectSoftwareWebGL } from '../engine/BabylonFightEngine';
import { Award, Film, RotateCcw } from 'lucide-react';

interface ArenaPreview3DProps {
  arenaId: ArenaId;
  className?: string;
  forceWebGLFailure?: boolean;
}

export interface ArenaPreviewFallbackState {
  arenaId: ArenaId;
  arenaName: string;
  arenaSubtitle: string;
  hasWebGLError: boolean;
  errorMessage: string | null;
}

export function buildArenaPreviewFallbackState(
  arenaId: ArenaId,
  error: unknown
): ArenaPreviewFallbackState {
  const arena = ARENAS[arenaId] || ARENAS.award_night;
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : '3D stage preview unavailable on this browser context.';
  return {
    arenaId: arena.id,
    arenaName: arena.name,
    arenaSubtitle: arena.subtitle,
    hasWebGLError: true,
    errorMessage: msg,
  };
}

/**
 * Real-time 3D Babylon.js Arena Preview Viewport for the Arena Select screen.
 * Renders the actual 3D Award Night or Film City stage with animated spotlights/cranes
 * and a gentle cinematic camera sweep.
 * If browser WebGL initialization fails, displays an explicit visual stage preview card
 * with a Retry action (never silently falling back to a blank NullEngine canvas).
 */
export const ArenaPreview3D: React.FC<ArenaPreview3DProps> = ({
  arenaId,
  className = '',
  forceWebGLFailure = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const arenaHandleRef = useRef<ArenaSceneHandle3D | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const isSoftwareRef = useRef<boolean>(false);

  const [webglError, setWebglError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (forceWebGLFailure) {
      setWebglError('3D stage preview unavailable in current graphics mode.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setWebglError(null);
    let engine: Engine | null = null;
    let scene: Scene | null = null;

    try {
      const isSoftwareGL = detectSoftwareWebGL(canvas);
      isSoftwareRef.current = isSoftwareGL;
      engine = new Engine(canvas, !isSoftwareGL, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      if (isSoftwareGL) {
        engine.setHardwareScalingLevel(1);
      }

      scene = new Scene(engine);
      sceneRef.current = scene;

      const camera = new UniversalCamera(
        'arenaPreviewCam',
        new Vector3(0, 2.35, -9.2),
        scene
      );
      camera.fov = 0.68;
      camera.setTarget(new Vector3(0, 1.55, 1.8));

      arenaHandleRef.current = ArenaBuilder3D.buildArena(
        scene,
        arenaId,
        isSoftwareRef.current
      );

      let lastTime = performance.now();
      let sweepElapsed = 0;
      const activeScene = scene;

      engine.runRenderLoop(() => {
        if (typeof document !== 'undefined' && document.hidden) {
          lastTime = performance.now();
          return;
        }
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        sweepElapsed += dt;

        camera.position.x = Math.sin(sweepElapsed * 0.42) * 1.65;
        camera.position.y = 2.3 + Math.sin(sweepElapsed * 0.28) * 0.15;
        camera.setTarget(new Vector3(0, 1.5, 1.8));

        arenaHandleRef.current?.update(dt);
        activeScene.render();
      });
    } catch (err) {
      arenaHandleRef.current?.dispose();
      arenaHandleRef.current = null;
      scene?.dispose();
      sceneRef.current = null;
      engine?.dispose();
      engine = null;
      const fallback = buildArenaPreviewFallbackState(arenaId, err);
      setWebglError(fallback.errorMessage);
      return;
    }

    const activeEngine = engine;
    let lastW = 0;
    let lastH = 0;
    const handleResize = () => {
      const w = canvas.clientWidth || canvas.width;
      const h = canvas.clientHeight || canvas.height;
      if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
        lastW = w;
        lastH = h;
        activeEngine.resize();
      }
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost during stage preview.');
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    canvas.addEventListener('webglcontextlost', handleContextLost, false);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(canvas);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      resizeObserver?.disconnect();
      activeEngine.stopRenderLoop();
      arenaHandleRef.current?.dispose();
      arenaHandleRef.current = null;
      scene?.dispose();
      sceneRef.current = null;
      activeEngine.dispose();
    };
    // Initialize WebGL engine once per mount/retry; arenaId switches are handled in the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount, forceWebGLFailure]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || webglError) return;
    if (arenaHandleRef.current?.arenaId === arenaId) return;

    arenaHandleRef.current?.dispose();
    arenaHandleRef.current = ArenaBuilder3D.buildArena(
      scene,
      arenaId,
      isSoftwareRef.current
    );
  }, [arenaId, webglError]);

  const arenaDef = ARENAS[arenaId] || ARENAS.award_night;
  const isAward = arenaDef.id === 'award_night';

  return (
    <div
      data-testid="arena-preview-3d-container"
      data-arena-id={arenaId}
      data-preview-mode={webglError ? 'fallback' : 'webgl'}
      className={`relative rounded-xl overflow-hidden border border-[#D6A447]/45 bg-[#0A0913] shadow-2xl ${
        className || 'w-full h-56 sm:h-72 md:h-80'
      }`}
    >
      {!webglError ? (
        <canvas
          ref={canvasRef}
          data-testid="arena-preview-3d-canvas"
          width={800}
          height={450}
          className="w-full h-full object-cover block"
        />
      ) : (
        <div
          data-testid="arena-preview-fallback"
          className={`w-full h-full flex flex-col items-center justify-center p-6 text-center gap-3 ${
            isAward
              ? 'bg-gradient-to-b from-[#2A1424] via-[#151022] to-[#0A0913]'
              : 'bg-gradient-to-b from-[#102336] via-[#111827] to-[#0A0913]'
          }`}
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 ${
              isAward
                ? 'bg-[#BE123C]/25 border-[#F59E0B] text-[#FEF08A]'
                : 'bg-[#0284C7]/25 border-[#38BDF8] text-[#38BDF8]'
            }`}
          >
            {isAward ? <Award size={28} /> : <Film size={28} />}
          </div>
          <div>
            <h3 className="font-['Bungee'] text-lg sm:text-xl text-[#FEF08A] tracking-wider">
              {arenaDef.name}
            </h3>
            <p className="text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[#D6A447]">
              {arenaDef.subtitle}
            </p>
          </div>
          <button
            type="button"
            data-testid="arena-preview-retry-btn"
            onClick={() => {
              setWebglError(null);
              setRetryCount((c) => c + 1);
            }}
            className="mt-1 px-3.5 py-1.5 rounded-lg bg-[#171526] hover:bg-[#231F38] text-[#FEF08A] border border-[#D6A447] text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>RETRY PREVIEW</span>
          </button>
        </div>
      )}
    </div>
  );
};
