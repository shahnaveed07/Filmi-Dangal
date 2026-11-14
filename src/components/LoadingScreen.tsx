import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ALL_FIGHTER_IDS,
  CHARACTER_ASSET_MANIFEST,
  validateCharacterAssetManifestConfig,
} from '../config/characterAssets';
import { AudioManager } from '../engine/AudioManager';
import { SettingsManager } from '../engine/SettingsManager';
import { CharacterAssetValidator } from '../game3d/assets/CharacterAssetValidator';
import { FighterId } from '../types/fighter';

export interface StartupTaskItem {
  id: string;
  weight: number;
  run: () => Promise<void>;
}

export interface StartupProgressState {
  percentage: number;
  completedTasks: number;
  totalTasks: number;
  statusText: string;
  error: string | null;
  completed: boolean;
}

export interface StartupVerificationResult {
  success: boolean;
  finalPercentage: number;
  verifiedCharacters: FighterId[];
  glbValidated: boolean;
  errors: string[];
}

/**
 * Pure helper that computes a clamped integer percentage [0..100] from real completed task weights.
 */
export function computeStartupProgressPercentage(
  completedWeight: number,
  totalWeight: number
): number {
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return 0;
  }
  if (!Number.isFinite(completedWeight) || completedWeight <= 0) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(1, completedWeight / totalWeight));
  return Math.round(ratio * 100);
}

/**
 * Executes real, deterministic startup verification and browser-cache warming for Fight Fun:
 * 1. Validates all 4 character manifest configurations (`CHARACTER_ASSET_MANIFEST`).
 * 2. Initializes `SettingsManager` and `AudioManager`.
 * 3. Fetches and validates the active production fighter GLB (`/assets/characters/action-sultan/model.glb`)
 *    via `CharacterAssetValidator.validateGLBBuffer` so the binary is verified and cached in the browser.
 * 4. Verifies character manifest JSON endpoints (`/assets/characters/<slug>/manifest.json`).
 * 5. Pre-warms default fighter audio synthesis/buffers (`preloadCharacterAudio('action_sultan')`).
 */
export async function runStartupAssetVerification(options?: {
  fetchImpl?: typeof fetch;
  onProgress?: (state: StartupProgressState) => void;
}): Promise<StartupVerificationResult> {
  const fetchFn =
    options?.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);
  const verifiedCharacters: FighterId[] = [];
  const errors: string[] = [];
  let glbValidated = false;

  const tasks: StartupTaskItem[] = [
    {
      id: 'validate_manifests',
      weight: 20,
      run: async () => {
        for (const fighterId of ALL_FIGHTER_IDS) {
          const cfg = CHARACTER_ASSET_MANIFEST[fighterId];
          const res = validateCharacterAssetManifestConfig(cfg);
          if (!res.valid) {
            throw new Error(
              `Manifest validation failed for ${fighterId}: ${res.errors.join(', ')}`
            );
          }
          verifiedCharacters.push(fighterId);
        }
      },
    },
    {
      id: 'init_settings_and_audio',
      weight: 15,
      run: async () => {
        const settings = SettingsManager.getInstance().getSettings();
        const audio = AudioManager.getInstance();
        if (typeof settings.masterVolume !== 'number' || !audio) {
          throw new Error('Failed to initialize SettingsManager or AudioManager');
        }
      },
    },
    {
      id: 'verify_primary_glb',
      weight: 35,
      run: async () => {
        if (!fetchFn) {
          glbValidated = true;
          return;
        }
        const primaryPath = CHARACTER_ASSET_MANIFEST.action_sultan.modelPath;
        const response = await fetchFn(primaryPath, { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Unable to load fighter model at ${primaryPath} (HTTP ${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        const report = CharacterAssetValidator.validateGLBBuffer(buffer, 'action_sultan');
        if (!report.glbFileValid) {
          throw new Error(
            `Primary GLB validation failed: ${report.errors.join('; ') || 'Invalid GLB binary'}`
          );
        }
        glbValidated = true;
      },
    },
    {
      id: 'verify_character_descriptors',
      weight: 15,
      run: async () => {
        if (!fetchFn) return;
        const manifestPaths = ALL_FIGHTER_IDS.map(
          (id) => `/assets/characters/${CHARACTER_ASSET_MANIFEST[id].slug}/manifest.json`
        );
        await Promise.all(
          manifestPaths.map(async (url) => {
            const resp = await fetchFn(url, { method: 'GET' });
            if (!resp.ok) {
              throw new Error(`Missing character descriptor at ${url}`);
            }
          })
        );
      },
    },
    {
      id: 'preload_fighter_audio',
      weight: 15,
      run: async () => {
        await AudioManager.getInstance().preloadCharacterAudio('action_sultan');
      },
    },
  ];

  const totalWeight = tasks.reduce((sum, item) => sum + item.weight, 0);
  let completedWeight = 0;
  let completedTasks = 0;

  options?.onProgress?.({
    percentage: 0,
    completedTasks: 0,
    totalTasks: tasks.length,
    statusText: 'Loading Assets...',
    error: null,
    completed: false,
  });

  for (const task of tasks) {
    try {
      await task.run();
      completedWeight += task.weight;
      completedTasks += 1;
      const percentage = computeStartupProgressPercentage(completedWeight, totalWeight);
      options?.onProgress?.({
        percentage,
        completedTasks,
        totalTasks: tasks.length,
        statusText: 'Loading Assets...',
        error: null,
        completed: completedTasks === tasks.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      const percentage = computeStartupProgressPercentage(completedWeight, totalWeight);
      options?.onProgress?.({
        percentage,
        completedTasks,
        totalTasks: tasks.length,
        statusText: 'Asset Load Error',
        error: msg,
        completed: false,
      });
      return {
        success: false,
        finalPercentage: percentage,
        verifiedCharacters,
        glbValidated,
        errors,
      };
    }
  }

  return {
    success: true,
    finalPercentage: 100,
    verifiedCharacters,
    glbValidated,
    errors,
  };
}

interface LoadingScreenProps {
  onComplete: () => void;
  holdOnComplete?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onComplete,
  holdOnComplete = false,
}) => {
  const [progress, setProgress] = useState<StartupProgressState>({
    percentage: 0,
    completedTasks: 0,
    totalTasks: 5,
    statusText: 'Loading Assets...',
    error: null,
    completed: false,
  });
  const [runAttempt, setRunAttempt] = useState(0);
  const completedRef = useRef(false);

  const executeStartup = useCallback(async () => {
    completedRef.current = false;
    const result = await runStartupAssetVerification({
      onProgress: (nextState) => {
        setProgress(nextState);
      },
    });

    if (result.success && !holdOnComplete && !completedRef.current) {
      completedRef.current = true;
      // Brief visual frame so 100% state renders cleanly before transition
      window.setTimeout(() => {
        onComplete();
      }, 180);
    }
  }, [holdOnComplete, onComplete]);

  useEffect(() => {
    void executeStartup();
  }, [executeStartup, runAttempt]);

  const handleRetry = () => {
    setRunAttempt((prev) => prev + 1);
  };

  return (
    <div
      data-testid="loading-screen"
      className="relative w-full h-full overflow-hidden bg-[#060304] select-none"
    >
      {/* Full-bleed Hero Fighter Lineup & Stadium Arena Artwork */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('/assets/aistudio/LoadingScreen_9c709370.png')`,
        }}
        aria-hidden="true"
      />

      {/* Feathered dark arena mask over the static progress band so only the live progress bar & percentage are visible */}
      <div
        className="absolute left-[9%] right-[6%] top-[67.5%] bottom-[13%] rounded-3xl pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 74% 76% at 50% 55%, rgba(8, 4, 5, 0.99) 0%, rgba(8, 4, 5, 0.98) 76%, rgba(8, 4, 5, 0) 100%)',
          filter: 'blur(6px)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute left-[11%] right-[8%] top-[69.5%] bottom-[14.5%] rounded-2xl bg-[#080405] blur-sm pointer-events-none"
        aria-hidden="true"
      />

      {/* Live Progress Bar & Percentage Positioned at Reference Coordinates */}
      <div className="absolute inset-x-0 bottom-[15.5%] z-20 px-6 sm:px-12 flex flex-col items-center">
        {/* Loading Status Label */}
        <p
          data-testid="loading-status-text"
          className="relative z-10 text-white font-display font-extrabold italic tracking-wide text-lg sm:text-2xl md:text-[26px] mb-3 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
        >
          {progress.statusText}
        </p>

        {/* Horizontal Progress Bar + Percentage Row */}
        <div className="relative z-10 w-full max-w-[920px] flex items-center gap-4 sm:gap-5">
          <div
            data-testid="loading-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentage}
            className="relative flex-1 h-6 sm:h-7 md:h-8 rounded-full bg-[#120907]/95 border border-amber-400/80 p-[2px] shadow-[0_0_24px_rgba(245,158,11,0.35),inset_0_2px_8px_rgba(0,0,0,0.9)] overflow-hidden"
          >
            {/* Glowing Yellow-to-Orange Fill */}
            <div
              data-testid="loading-progress-fill"
              className="h-full rounded-full transition-[width] duration-200 ease-out relative"
              style={{
                width: `${progress.percentage}%`,
                background:
                  'linear-gradient(90deg, #FDE047 0%, #FACC15 45%, #F97316 80%, #EA580C 100%)',
                boxShadow:
                  '0 0 18px rgba(250, 204, 21, 0.85), 0 0 32px rgba(249, 115, 22, 0.65)',
              }}
            >
              {/* Top specular highlight along fill */}
              <div className="w-full h-[38%] rounded-t-full bg-gradient-to-b from-white/55 to-transparent" />
            </div>
          </div>

          {/* Live Percentage Readout */}
          <span
            data-testid="loading-percentage"
            className="w-16 sm:w-20 text-left font-display font-black italic text-xl sm:text-2xl md:text-3xl text-[#FEF08A] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] tabular-nums"
          >
            {progress.percentage}%
          </span>
        </div>

        {/* Error Recovery Controls if a Startup Task Fails */}
        {progress.error && (
          <div
            data-testid="loading-error-panel"
            className="relative z-10 mt-4 px-5 py-3 rounded-lg bg-red-950/90 border border-red-500/60 flex flex-wrap items-center justify-center gap-4 max-w-xl text-center"
          >
            <span className="text-xs sm:text-sm text-red-200 font-medium">
              {progress.error}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="loading-retry-btn"
                onClick={handleRetry}
                className="px-4 py-1.5 rounded bg-amber-400 text-black font-display font-black text-xs uppercase tracking-wider hover:bg-amber-300 transition cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                data-testid="loading-continue-btn"
                onClick={onComplete}
                className="px-4 py-1.5 rounded bg-zinc-800 border border-white/20 text-white font-display font-bold text-xs uppercase tracking-wider hover:bg-zinc-700 transition cursor-pointer"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
