import React, { useEffect, useRef } from 'react';
import { BabylonFightEngine } from '../game3d/engine/BabylonFightEngine';

/**
 * Hosts the Babylon.js 3D WebGL fighting game canvas and simulation lifecycle.
 */
export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fightEngine = new BabylonFightEngine(canvas);

    return () => {
      fightEngine.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#10111B] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        data-testid="fight-canvas"
        width={1280}
        height={720}
        className="w-full h-full max-h-screen object-contain aspect-video shadow-2xl outline-none"
      />
    </div>
  );
};
