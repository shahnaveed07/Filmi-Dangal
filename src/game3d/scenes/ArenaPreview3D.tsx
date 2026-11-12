import React, { useEffect, useRef } from 'react';
import { Engine, NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { ArenaId } from '../../types/fighter';
import { ArenaBuilder3D, ArenaSceneHandle3D } from '../arenas/ArenaBuilder3D';
import { detectSoftwareWebGL } from '../engine/BabylonFightEngine';

interface ArenaPreview3DProps {
  arenaId: ArenaId;
  className?: string;
}

/**
 * Real-time 3D Babylon.js Arena Preview Viewport for the Arena Select screen.
 * Renders the actual 3D Award Night or Film City stage with animated spotlights/cranes
 * and a gentle cinematic camera sweep.
 */
export const ArenaPreview3D: React.FC<ArenaPreview3DProps> = ({
  arenaId,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const arenaHandleRef = useRef<ArenaSceneHandle3D | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const isSoftwareRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: Engine;
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
    } catch {
      engine = new NullEngine();
    }

    const scene = new Scene(engine);
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

    engine.runRenderLoop(() => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      sweepElapsed += dt;

      camera.position.x = Math.sin(sweepElapsed * 0.42) * 1.65;
      camera.position.y = 2.3 + Math.sin(sweepElapsed * 0.28) * 0.15;
      camera.setTarget(new Vector3(0, 1.5, 1.8));

      arenaHandleRef.current?.update(dt);
      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => engine.resize());
      resizeObserver.observe(canvas);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      arenaHandleRef.current?.dispose();
      arenaHandleRef.current = null;
      scene.dispose();
      sceneRef.current = null;
      engine.dispose();
    };
    // Initialize WebGL engine once; arenaId switches are handled in the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (arenaHandleRef.current?.arenaId === arenaId) return;

    arenaHandleRef.current?.dispose();
    arenaHandleRef.current = ArenaBuilder3D.buildArena(
      scene,
      arenaId,
      isSoftwareRef.current
    );
  }, [arenaId]);

  return (
    <div
      data-testid="arena-preview-3d-container"
      data-arena-id={arenaId}
      className={`relative rounded-xl overflow-hidden border border-[#D6A447]/45 bg-[#0A0913] shadow-2xl ${
        className || 'w-full h-56 sm:h-72 md:h-80'
      }`}
    >
      <canvas
        ref={canvasRef}
        data-testid="arena-preview-3d-canvas"
        width={800}
        height={450}
        className="w-full h-full object-cover block"
      />
    </div>
  );
};
