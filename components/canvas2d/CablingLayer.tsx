"use client";

import { useEffect, useState } from "react";
import { Group, Line, Circle } from "react-konva";
import type { CableRun, PointPx } from "@/lib/cabling";
import { useSimStore } from "@/lib/sim-store";

interface CablingLayerProps {
  runs: CableRun[];
}

/** Per–head-end color so the eye can immediately tell what each cable feeds:
 *  violet = NVR (video), teal = switch (data), amber = centroid fallback. */
const COLOR_FOR_HEAD: Record<CableRun["headEnd"], string> = {
  nvr: "#8b5cf6",
  switch: "#14b8a6",
  centroid: "#f59e0b",
};

/**
 * Konva overlay that strokes the auto-routed cable runs as L-shaped polylines.
 * Sits above walls and beneath device shapes so cables read as conduit on the
 * floor without obscuring the devices themselves.
 *
 * In simulation mode, cables whose source camera/reader is currently
 * triggered light up brighter — same green-means-active language used by the
 * device shapes themselves.
 */
export function CablingLayer({ runs }: CablingLayerProps) {
  const detectingCameras = useSimStore((s) => s.detectingCameras);
  const triggeredSensors = useSimStore((s) => s.triggeredSensors);
  const simRunning = useSimStore((s) => s.running);

  // Pulse animation — a value in [0, 1] that loops every ~1.2s while the sim
  // is running. Used to position the moving "data packet" dot along each
  // active cable. The loop is gated on simRunning so we don't burn frames
  // when nothing is going on.
  const t = usePulseT(simRunning);

  return (
    <Group listening={false}>
      {runs.map((run) => {
        const active =
          simRunning &&
          (detectingCameras.has(run.deviceId) ||
            triggeredSensors.has(run.deviceId));
        const color = active ? "#10b981" : COLOR_FOR_HEAD[run.headEnd];
        return (
          <Group key={run.deviceId}>
            <Line
              points={[
                run.fromPx.x,
                run.fromPx.y,
                run.bendPx.x,
                run.bendPx.y,
                run.toPx.x,
                run.toPx.y,
              ]}
              stroke={color}
              strokeWidth={active ? 2 : 1.4}
              opacity={active ? 0.95 : 0.55}
              lineCap="round"
              lineJoin="round"
              dash={active ? undefined : [6, 4]}
              listening={false}
            />
            {/* Small terminator dot at the head-end so the line reads as
                "lands on this device" rather than floating. */}
            <Circle
              x={run.toPx.x}
              y={run.toPx.y}
              radius={3}
              fill={color}
              opacity={active ? 0.95 : 0.7}
              listening={false}
            />
            {active && (() => {
              const pos = pointAlongPath(run.fromPx, run.bendPx, run.toPx, t);
              return (
                <>
                  {/* Outer glow halo */}
                  <Circle
                    x={pos.x}
                    y={pos.y}
                    radius={9}
                    fill="#34d399"
                    opacity={0.18}
                    listening={false}
                  />
                  {/* The data packet itself */}
                  <Circle
                    x={pos.x}
                    y={pos.y}
                    radius={4}
                    fill="#34d399"
                    listening={false}
                  />
                </>
              );
            })()}
          </Group>
        );
      })}
    </Group>
  );
}

/**
 * Drive a [0,1] t value that loops every ~1.2 seconds when `active`. Cleans
 * up its RAF on unmount or when toggled off.
 */
function usePulseT(active: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - start) % 1200;
      setT(elapsed / 1200);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return t;
}

/**
 * Lerp a point along the L-shaped path from→bend→to as a single
 * normalized parameter t. The L is split into two legs in proportion to
 * their lengths so the pulse moves at a constant visual speed regardless
 * of which leg is longer.
 */
function pointAlongPath(
  from: PointPx,
  bend: PointPx,
  to: PointPx,
  t: number,
): PointPx {
  const leg1 = Math.hypot(bend.x - from.x, bend.y - from.y);
  const leg2 = Math.hypot(to.x - bend.x, to.y - bend.y);
  const total = leg1 + leg2;
  if (total === 0) return from;
  const cut = leg1 / total;
  if (t <= cut) {
    const k = t / cut;
    return {
      x: from.x + (bend.x - from.x) * k,
      y: from.y + (bend.y - from.y) * k,
    };
  }
  const k = (t - cut) / (1 - cut);
  return {
    x: bend.x + (to.x - bend.x) * k,
    y: bend.y + (to.y - bend.y) * k,
  };
}
