"use client";

import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Zap,
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
      <DetectionFeed />
    </div>
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

  const doneAt = useMemo(() => {
    if (!floor || !floor.simPath) return 0;
    const { doneAt } = positionOnPath(
      floor.simPath,
      0,
      1.4,
      floor.scale
    );
    return doneAt;
  }, [floor?.simPath, floor?.scale, floor]);

  const progress = doneAt > 0 ? Math.min(1, t / doneAt) : 0;
  const detectionCount = detectingCameras.size;

  return (
    <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
      <div className="flex min-w-[420px] flex-col gap-2.5 rounded-2xl border border-border bg-card/90 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (running ? pause() : play())}
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg btn-lift",
              "bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/14%),0_4px_16px_-6px_oklch(0.78_0.135_158/55%)] hover:bg-primary/90"
            )}
            aria-label={running ? "Pause" : "Play"}
          >
            {running ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/40 text-muted-foreground btn-lift hover:text-foreground hover:bg-card/70"
            aria-label="Restart"
          >
            <RotateCcw className="size-4" />
          </button>
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center justify-between text-[0.72rem] font-mono text-muted-foreground">
              <span>
                <span className="uppercase tracking-[0.08em] opacity-70">t </span>
                <span className="text-foreground/90">{t.toFixed(1)}s</span>
              </span>
              <span>
                <span className="uppercase tracking-[0.08em] opacity-70">total </span>
                <span className="text-foreground/90">{doneAt.toFixed(1)}s</span>
              </span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-background/60">
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-100"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[0.7rem] font-mono transition-colors",
                  speed === s
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-[0.78rem]">
          <div className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Activity className="size-3.5 text-primary" />
            <span>
              Subject walking the demo path. Cameras turn green when they pick them up.
            </span>
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-mono",
              detectionCount > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-rose-500/40 bg-rose-500/10 text-rose-400"
            )}
          >
            {detectionCount > 0 ? (
              <>
                <Zap className="size-3" />
                {detectionCount} camera{detectionCount === 1 ? "" : "s"} on subject
              </>
            ) : (
              <>
                <ShieldAlert className="size-3" />
                Blind spot — no camera
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetectionFeed() {
  const events = useSimStore((s) => s.events);
  const floor = useActiveFloor();
  if (events.length === 0) return null;
  const recent = events.slice(-8).reverse();
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-30 w-72 space-y-1.5">
      <div className="rounded-lg border border-border bg-card/85 px-3 py-2 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Live detection feed
          </div>
          <span className="font-mono text-[0.65rem] text-muted-foreground">
            {events.length}
          </span>
        </div>
        <div className="space-y-1">
          {recent.map((ev, idx) => {
            const device = floor?.devices.find((d) => d.id === ev.deviceId);
            const tone =
              ev.type === "detected"
                ? "text-emerald-400"
                : ev.type === "lost"
                  ? "text-amber-400"
                  : "text-rose-400";
            return (
              <div
                key={`${ev.deviceId}-${idx}-${ev.timestamp}`}
                className="flex items-baseline gap-2 text-[0.78rem]"
              >
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {ev.timestamp.toFixed(1)}s
                </span>
                <span className={cn("font-medium", tone)}>
                  {ev.type === "detected" && "detected"}
                  {ev.type === "lost" && "lost"}
                  {ev.type === "triggered" && "triggered"}
                </span>
                <span className="truncate text-muted-foreground">
                  {device?.label ?? ev.deviceId}
                </span>
              </div>
            );
          })}
        </div>
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
          <span className="font-serif-italic text-foreground/80">demo office</span>{" "}
          (Switch to 2D and press &ldquo;Load demo office&rdquo;) to see a
          subject walk a preset path through the building with cameras picking
          them up in real time. Custom path drawing comes in the next
          milestone.
        </p>
      </div>
    </div>
  );
}
