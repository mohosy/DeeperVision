"use client";

import { create } from "zustand";
import type { SimEvent } from "@/types/design";

interface SimState {
  running: boolean;
  speed: number; // playback multiplier
  /** sim time in seconds */
  t: number;
  /** ids of cameras currently detecting */
  detectingCameras: Set<string>;
  /** ids of sensors currently triggered */
  triggeredSensors: Set<string>;
  events: SimEvent[];

  /** Aggregated per-camera observation time in seconds */
  coverageByCamera: Record<string, number>;
  /** Total time the subject was visible to ≥ 1 camera */
  coveredTime: number;
  /** Total time the subject was in a blind spot */
  blindTime: number;
  /** Time of first detection event, or null if never seen */
  firstDetectionAt: number | null;
  /** Longest continuous blind interval seen so far */
  longestBlindInterval: number;
  /** Internal: when did the current blind interval start? null if not blind */
  blindIntervalStart: number | null;
  /** True once the sim has finished playing this run */
  finished: boolean;
  /** When true, the camera is locked to the actor's first-person view
   *  ("follow mode"). Orbit controls are suppressed and the FollowCamera
   *  controller updates the camera every frame. */
  following: boolean;

  play(): void;
  pause(): void;
  reset(): void;
  setSpeed(speed: number): void;
  tick(dt: number): void;
  setDetection(
    detectingCameras: Set<string>,
    triggeredSensors: Set<string>
  ): void;
  pushEvent(event: SimEvent): void;
  recordFrameCoverage(dt: number): void;
  markFinished(): void;
  startFollow(): void;
  stopFollow(): void;
}

export const useSimStore = create<SimState>((set, get) => ({
  running: false,
  speed: 1,
  t: 0,
  detectingCameras: new Set(),
  triggeredSensors: new Set(),
  events: [],
  coverageByCamera: {},
  coveredTime: 0,
  blindTime: 0,
  firstDetectionAt: null,
  longestBlindInterval: 0,
  blindIntervalStart: null,
  finished: false,
  following: false,

  play() {
    set({ running: true, finished: false });
  },
  pause() {
    set({ running: false });
  },
  reset() {
    set({
      running: false,
      t: 0,
      detectingCameras: new Set(),
      triggeredSensors: new Set(),
      events: [],
      coverageByCamera: {},
      coveredTime: 0,
      blindTime: 0,
      firstDetectionAt: null,
      longestBlindInterval: 0,
      blindIntervalStart: null,
      finished: false,
    });
  },
  setSpeed(speed) {
    set({ speed });
  },
  tick(dt) {
    set((s) => ({ t: s.t + dt * s.speed }));
  },
  setDetection(detectingCameras, triggeredSensors) {
    set({ detectingCameras, triggeredSensors });
  },
  pushEvent(event) {
    set((s) => {
      const next: Partial<SimState> = {
        events: [...s.events.slice(-49), event],
      };
      if (event.type === "detected" && s.firstDetectionAt === null) {
        next.firstDetectionAt = event.timestamp;
      }
      return next;
    });
  },
  recordFrameCoverage(dt) {
    const s = get();
    if (!s.running) return;
    const scaledDt = dt * s.speed;
    if (s.detectingCameras.size > 0) {
      const next: Partial<SimState> = {
        coveredTime: s.coveredTime + scaledDt,
      };
      // Add scaledDt to every camera that's currently seeing
      const cov = { ...s.coverageByCamera };
      for (const id of s.detectingCameras) {
        cov[id] = (cov[id] ?? 0) + scaledDt;
      }
      next.coverageByCamera = cov;
      // Close any currently-running blind interval
      if (s.blindIntervalStart !== null) {
        const interval = s.t - s.blindIntervalStart;
        if (interval > s.longestBlindInterval) {
          next.longestBlindInterval = interval;
        }
        next.blindIntervalStart = null;
      }
      set(next);
    } else {
      const next: Partial<SimState> = {
        blindTime: s.blindTime + scaledDt,
      };
      if (s.blindIntervalStart === null) {
        next.blindIntervalStart = s.t;
      }
      set(next);
    }
  },
  markFinished() {
    set((s) => {
      const next: Partial<SimState> = { finished: true, running: false };
      // Close any open blind interval
      if (s.blindIntervalStart !== null) {
        const interval = s.t - s.blindIntervalStart;
        if (interval > s.longestBlindInterval) {
          next.longestBlindInterval = interval;
        }
        next.blindIntervalStart = null;
      }
      return next;
    });
  },
  startFollow() {
    set({ following: true });
  },
  stopFollow() {
    set({ following: false });
  },
}));
