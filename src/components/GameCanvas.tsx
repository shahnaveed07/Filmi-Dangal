import React, { useEffect, useRef, useState } from 'react';
import { BabylonFightEngine } from '../game3d/engine/BabylonFightEngine';
import { SecondaryButton } from './ui/FightFunUI';
import { RotateCcw } from 'lucide-react';

/**
 * Hosts the Babylon.js 3D WebGL fighting game canvas and simulation lifecycle.
 * Provides clean recovery UI if WebGL context is lost or unavailable.
 */
export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setContextError(null);
    let fightEngine: BabylonFightEngine | null = null;
    try {
      fightEngine = new BabylonFightEngine(canvas, (lost) => {
        setContextError(
          lost ? '3D graphics context was interrupted. Click below to restore.' : null
        );
      });
    } catch (err) {
      setContextError(
        err instanceof Error
          ? `3D renderer unavailable: ${err.message}`
          : '3D renderer unavailable on this device.'
      );
    }

    return () => {
      fightEngine?.dispose();
    };
  }, [reloadKey]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#10111B] overflow-hidden select-none">
      <canvas
        key={reloadKey}
        ref={canvasRef}
        data-testid="fight-canvas"
        width={1280}
        height={720}
        className="w-full h-full max-h-screen max-h-dvh object-contain aspect-video shadow-2xl outline-none"
      />
      {contextError && (
        <div
          data-testid="fight-canvas-error-overlay"
          className="absolute inset-0 bg-[#0D0C16]/95 z-40 flex flex-col items-center justify-center p-6 text-center gap-4"
        >
          <p className="font-['Rajdhani'] font-bold text-sm sm:text-base text-[#FEF08A] max-w-md">
            {contextError}
          </p>
          <SecondaryButton
            data-testid="fight-canvas-reload-btn"
            icon={<RotateCcw size={16} />}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            RELOAD 3D STAGE
          </SecondaryButton>
        </div>
      )}
    </div>
  );
};
