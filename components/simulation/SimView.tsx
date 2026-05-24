"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import { Scene3D } from "@/components/scene3d/Scene3D";
import { useActiveFloor } from "@/lib/store";
import { useSimStore } from "@/lib/sim-store";
import { cn } from "@/lib/utils";
import { positionOnPath } from "@/lib/detection";

export function SimView() {
  const floor = useActiveFloor();
  const path = floor?.simPath ?? [];
  const hasPath = path.length >= 2;

  if (!floor || !hasPath) {
    return <NoPathState />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Scene3D showSim />
      <SimControls />
      <FollowExitButton />
      <AfterActionReport />
    </div>
  );
}

/**
 * Top-right pill that surfaces only when the camera is locked into the
 * actor's first-person follow mode. Lets the user pop back to orbit
 * without having to mouse-hunt for the 3D scene's other controls.
 */
function FollowExitButton() {
  const following = useSimStore((s) => s.following);
  const stopFollow = useSimStore((s) => s.stopFollow);
  if (!following) return null;
  return (
    <button
      type="button"
      onClick={stopFollow}
      className="pointer-events-auto absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[0.78rem] font-medium text-background shadow-lg hover:bg-foreground/85"
    >
      <X className="size-3.5" strokeWidth={2.2} />
      Exit follow
    </button>
  );
}

function SimControls() {
  const floor = useActiveFloor();
  const running = useSimStore((s) => s.running);
  const speed = useSimStore((s) => s.speed);
  const t = useSimStore((s) => s.t);
  const play = useSimStore((s) => s.play);
  const pause = useSimStore((s) => s.pause);
  const reset = useSimStore((s) => s.reset);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const detectingCameras = useSimStore((s) => s.detectingCameras);
  const coveredTime = useSimStore((s) => s.coveredTime);
  const blindTime = useSimStore((s) => s.blindTime);

  const doneAt = useMemo(() => {
    if (!floor || !floor.simPath) return 0;
    const { doneAt } = positionOnPath(floor.simPath, 0, 1.4, floor.scale);
    return doneAt;
  }, [floor?.simPath, floor?.scale, floor]);

  const progress = doneAt > 0 ? Math.min(1, t / doneAt) : 0;
  const detectionCount = detectingCameras.size;
  const totalElapsed = coveredTime + blindTime;
  const coveragePct =
    totalElapsed > 0.001 ? Math.round((coveredTime / totalElapsed) * 100) : 0;

  // Status indicator color — single dot that summarizes coverage at a glance
  const statusColor =
    detectionCount > 0
      ? "bg-primary"
      : coveragePct >= 50
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center gap-2.5 rounded-full bg-background/75 px-2 py-1.5 shadow-[0_12px_40px_-14px_rgba(0,0,0,0.35)] backdrop-blur-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
        {/* Play / Pause */}
        <button
          type="button"
          onClick={() => (running ? pause() : play())}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition-all",
            "bg-foreground text-background hover:scale-[1.04] active:scale-[0.97]"
          )}
          aria-label={running ? "Pause" : "Play"}
        >
          {running ? (
            <Pause className="size-3 fill-current" />
          ) : (
            <Play className="size-3 fill-current translate-x-px" />
          )}
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={reset}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label="Restart"
        >
          <RotateCcw className="size-3" strokeWidth={2} />
        </button>

        {/* Timeline */}
        <div className="flex w-[280px] items-center gap-2.5 px-1">
          <span className="text-[0.72rem] tabular-nums font-medium text-foreground/85 w-9 text-right">
            {t.toFixed(1)}s
          </span>
          <div className="relative h-1 flex-1 overflow-visible">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-foreground/[0.08]" />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-foreground/85 transition-[width] duration-100"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
          <span className="text-[0.72rem] tabular-nums text-muted-foreground/65 w-10">
            {doneAt.toFixed(1)}s
          </span>
        </div>

        {/* Speed — compact segmented control */}
        <div className="flex shrink-0 items-center gap-px rounded-full bg-foreground/[0.05] p-0.5">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.7rem] tabular-nums transition-colors",
                speed === s
                  ? "bg-card text-foreground shadow-[0_1px_2px_-1px_rgba(0,0,0,0.18)]"
                  : "text-muted-foreground/85 hover:text-foreground"
              )}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Status indicator — a single dot + concise label so the banner stays small */}
        <div className="flex shrink-0 items-center gap-1.5 pl-1.5 pr-2">
          <span className={cn("size-1.5 rounded-full", statusColor)} aria-hidden="true" />
          <span className="text-[0.72rem] font-medium tabular-nums text-foreground/85">
            {detectionCount > 0 ? `${detectionCount} on subject` : "blind"}
          </span>
          <span className="text-[0.7rem] tabular-nums text-muted-foreground/70">
            · {coveragePct}%
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Slim cinematic HUD at the top of the sim scene. Replaces the old chunky
 * top-right popup. Two pieces, side-by-side:
 *
 *  • Tracking badge — pulsing red dot + "N TRACKING" / "BLIND" depending on
 *    live state. Snaps the user's eye to coverage status at any moment.
 *  • Event ticker — the three most recent events render as small chips
 *    that slide IN from the right and AGE OUT to the left. Framer Motion
 *    handles the slide + fade, so events flow like a stock ticker.
 *
 * Everything 3D-related is handled by DetectionVisualizer3D + the camera
 * pulses + the actor aura, so this overlay can stay deliberately minimal.
 */
function DetectionFeed() {
  const events = useSimStore((s) => s.events);
  const detectingCameras = useSimStore((s) => s.detectingCameras);
  const triggeredSensors = useSimStore((s) => s.triggeredSensors);
  const running = useSimStore((s) => s.running);
  const floor = useActiveFloor();

  const trackingCount = detectingCameras.size + triggeredSensors.size;
  // The latest few events ride the ticker. Reverse so newest is leftmost.
  const recent = events.slice(-3).reverse();

  if (!running && events.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-2">
      {/* Tracking status pill */}
      <motion.div
        layout
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.74rem] font-medium backdrop-blur-xl ring-1 transition-colors",
          trackingCount > 0
            ? "bg-rose-500/15 text-rose-50 ring-rose-500/40 shadow-[0_10px_30px_-12px_rgba(244,63,94,0.6)]"
            : "bg-background/65 text-muted-foreground ring-black/[0.06] dark:ring-white/[0.06]",
        )}
      >
        {trackingCount > 0 ? (
          <>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-rose-400" />
            </span>
            <Radio className="size-3.5" strokeWidth={2} />
            <span className="tabular-nums">
              {trackingCount} tracking
            </span>
          </>
        ) : (
          <>
            <EyeOff className="size-3.5" strokeWidth={1.8} />
            <span>Blind</span>
          </>
        )}
      </motion.div>

      {/* Event ticker — latest detections flow in from the right and age out
          to the left. Keyed by event identity so AnimatePresence knows
          which chips are new. */}
      <div className="flex items-center gap-1.5">
        <AnimatePresence initial={false}>
          {recent.map((ev) => {
            const device = floor?.devices.find((d) => d.id === ev.deviceId);
            const tone =
              ev.type === "detected"
                ? {
                    icon: <Eye className="size-3" strokeWidth={2.2} />,
                    label: "saw",
                    cls: "bg-emerald-500/20 text-emerald-100 ring-emerald-500/40",
                  }
                : ev.type === "lost"
                  ? {
                      icon: <EyeOff className="size-3" strokeWidth={2} />,
                      label: "lost",
                      cls: "bg-amber-500/20 text-amber-100 ring-amber-500/40",
                    }
                  : {
                      icon: <Radio className="size-3" strokeWidth={2.2} />,
                      label: "triggered",
                      cls: "bg-rose-500/20 text-rose-100 ring-rose-500/40",
                    };
            return (
              <motion.div
                key={`${ev.deviceId}-${ev.timestamp}-${ev.type}`}
                layout
                initial={{ opacity: 0, x: 32, scale: 0.85 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.85 }}
                transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium backdrop-blur-xl ring-1",
                  tone.cls,
                )}
              >
                {tone.icon}
                <span className="font-mono tabular-nums opacity-80">
                  {ev.timestamp.toFixed(1)}s
                </span>
                <span className="opacity-90">{tone.label}</span>
                <span className="max-w-[110px] truncate opacity-95">
                  {device?.label ?? ev.deviceId}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AfterActionReport() {
  const finished = useSimStore((s) => s.finished);
  const reset = useSimStore((s) => s.reset);
  const play = useSimStore((s) => s.play);
  const floor = useActiveFloor();
  const coverageByCamera = useSimStore((s) => s.coverageByCamera);
  const coveredTime = useSimStore((s) => s.coveredTime);
  const blindTime = useSimStore((s) => s.blindTime);
  const firstDetectionAt = useSimStore((s) => s.firstDetectionAt);
  const longestBlindInterval = useSimStore((s) => s.longestBlindInterval);
  const events = useSimStore((s) => s.events);

  if (!finished || !floor) return null;

  const totalTime = coveredTime + blindTime;
  const coveragePct =
    totalTime > 0.001 ? Math.round((coveredTime / totalTime) * 100) : 0;
  const cameras = floor.devices.filter((d) => d.type === "camera");
  // Per-camera entries sorted by observed time desc
  const perCamera = cameras
    .map((c) => ({
      id: c.id,
      label: c.label,
      observed: coverageByCamera[c.id] ?? 0,
    }))
    .sort((a, b) => b.observed - a.observed);

  const verdict =
    coveragePct >= 85
      ? {
          label: "Strong coverage",
          tone: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
          icon: CheckCircle2,
        }
      : coveragePct >= 60
        ? {
            label: "Acceptable, with gaps",
            tone: "text-amber-400 border-amber-500/40 bg-amber-500/10",
            icon: AlertTriangle,
          }
        : {
            label: "Significant blind spots",
            tone: "text-rose-400 border-rose-500/40 bg-rose-500/10",
            icon: ShieldAlert,
          };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/65 backdrop-blur-sm">
      <div className="w-[640px] max-w-[92vw] rounded-2xl border border-border surface-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div>
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              After-action report
            </div>
            <div className="mt-1 text-xl font-medium tracking-[-0.01em]">
              <span className="font-medium text-foreground">{floor.name}</span>
              {" "}— subject walk-through
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="flex size-8 items-center justify-center rounded-md border border-border bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card/70"
            aria-label="Close report"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[0.85rem] font-medium",
              verdict.tone
            )}
          >
            <verdict.icon className="size-4" />
            {verdict.label} — <span className="font-mono">{coveragePct}%</span>
            <span className="opacity-70">covered</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Total run"
              value={`${totalTime.toFixed(1)}s`}
              mono
            />
            <Stat
              label="Time on subject"
              value={`${coveredTime.toFixed(1)}s`}
              mono
              tone="emerald"
            />
            <Stat
              label="Blind time"
              value={`${blindTime.toFixed(1)}s`}
              mono
              tone={blindTime > 0 ? "rose" : "neutral"}
            />
            <Stat
              label="First detect"
              value={
                firstDetectionAt !== null
                  ? `${firstDetectionAt.toFixed(1)}s`
                  : "never"
              }
              mono
              tone={firstDetectionAt === null ? "rose" : "neutral"}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Per-camera observation
              </div>
              <div className="font-mono text-[0.7rem] text-muted-foreground">
                {events.length} events
              </div>
            </div>
            <div className="space-y-1.5">
              {perCamera.map((c) => {
                const pctOfRun =
                  totalTime > 0
                    ? Math.round((c.observed / totalTime) * 100)
                    : 0;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-md border border-border/70 bg-card/40 px-3 py-1.5"
                  >
                    <div className="flex-1 truncate text-[0.85rem]">
                      {c.label}
                    </div>
                    <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-background/70">
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0",
                          pctOfRun >= 60
                            ? "bg-primary"
                            : pctOfRun >= 25
                              ? "bg-amber-500"
                              : "bg-rose-500/80"
                        )}
                        style={{ width: `${Math.min(100, pctOfRun)}%` }}
                      />
                    </div>
                    <div className="w-20 text-right font-mono text-[0.78rem] text-muted-foreground">
                      {c.observed.toFixed(1)}s
                    </div>
                    <div className="w-10 text-right font-mono text-[0.78rem] text-foreground/85">
                      {pctOfRun}%
                    </div>
                  </div>
                );
              })}
              {perCamera.length === 0 && (
                <div className="text-sm text-muted-foreground py-2">
                  No cameras placed in the design.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">
              Longest blind interval
            </div>
            <div className="font-mono text-foreground/90">
              {longestBlindInterval.toFixed(1)}s
            </div>
            <div className="mt-1 text-[0.78rem] text-muted-foreground">
              {longestBlindInterval > 5
                ? "A subject can move significantly without being observed. Consider repositioning a camera or adding coverage."
                : longestBlindInterval > 1.5
                  ? "Short gap in coverage; usually acceptable for non-critical zones."
                  : "Continuous coverage maintained throughout."}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-border bg-card/40 px-3 py-1.5 text-sm text-foreground hover:bg-card/70 btn-lift"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setTimeout(() => play(), 0);
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 btn-lift shadow-[0_4px_18px_-8px_oklch(0.78_0.135_158/55%)]"
          >
            Re-run simulation
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  tone = "neutral",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "emerald" | "rose";
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-2.5">
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          mono ? "font-mono" : "",
          "mt-0.5 text-[1.1rem] tracking-tight",
          tone === "emerald" && "text-emerald-400",
          tone === "rose" && "text-rose-400"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function NoPathState() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-canvas">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 50%, var(--canvas-accent), transparent 70%)",
        }}
      />
      <div className="absolute inset-0 bg-grid-fine pointer-events-none opacity-30" />
      <div className="relative max-w-md text-center px-8">
        <div className="inline-flex items-center justify-center rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
          <AlertTriangle className="size-7 text-primary" />
        </div>
        <h3 className="mt-5 text-2xl font-medium tracking-[-0.01em]">
          No simulation path on this floor
        </h3>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Load the{" "}
          <span className="font-medium text-foreground/80">demo office</span>{" "}
          (Switch to 2D and press &ldquo;Load demo office&rdquo;) to see a
          subject walk a preset path through the building with cameras picking
          them up in real time. Custom path drawing comes in the next
          milestone.
        </p>
      </div>
    </div>
  );
}
