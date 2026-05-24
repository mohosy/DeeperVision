"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useSimStore } from "@/lib/sim-store";
import { planCabling } from "@/lib/cabling";
import type { Floor } from "@/types/design";

interface CablingLines3DProps {
  floor: Floor;
  /** Ceiling height in meters — cables route up to (ceilingHeight − 0.05)
   *  to sit just below the ceiling plane, the way real conduit does. */
  ceilingHeight: number;
}

/** Color per head-end type — matches the 2D layer so the eye links the two
 *  views visually (violet = NVR/video, teal = switch/data, amber = fallback). */
const HEAD_COLOR: Record<string, string> = {
  nvr: "#a78bfa",
  switch: "#2dd4bf",
  centroid: "#fbbf24",
};

/**
 * Cabling routed through the ceiling plenum: each cable rises from the
 * device up to just below the ceiling, runs horizontally over to a point
 * above the head-end, then drops down. This is how cabling actually
 * physically routes in a commercial install, and reading it as a 3D
 * "tree" makes the wiring topology immediately legible.
 *
 * In sim mode, cables sourced from a currently-detecting camera or a
 * triggered sensor are drawn emissive emerald so the user can watch
 * detections flow back to the recorder.
 */
export function CablingLines3D({ floor, ceilingHeight }: CablingLines3DProps) {
  const detectingCameras = useSimStore((s) => s.detectingCameras);
  const triggeredSensors = useSimStore((s) => s.triggeredSensors);
  const simRunning = useSimStore((s) => s.running);

  const segments = useMemo(() => {
    const { runs } = planCabling(floor);
    // Plenum y-coordinate is just under the ceiling — 5 cm of clearance
    // so the cable doesn't fight the ceiling plane during shadows.
    const plenumY = Math.max(0.1, ceilingHeight - 0.05);
    return runs.map((run) => {
      // Convert floor-plan pixel coords to world meters via floor.scale.
      const fromXZ = pxToWorld(run.fromPx, floor.scale);
      const toXZ = pxToWorld(run.toPx, floor.scale);
      // Where the head-end (NVR/switch) actually sits — find it so we can
      // anchor the cable to its top, not its base.
      const head = floor.devices.find((d) => d.id === run.headEndDeviceId);
      const headBaseY = head?.mountHeight ?? 1.5;
      const deviceY = (() => {
        const dev = floor.devices.find((d) => d.id === run.deviceId);
        return dev?.mountHeight ?? 2.4;
      })();
      // The path: device-top → up to plenum → over (L-shape) → above head-end → down to head-end-top.
      const a: [number, number, number] = [fromXZ[0], deviceY, fromXZ[1]];
      const b: [number, number, number] = [fromXZ[0], plenumY, fromXZ[1]];
      const c: [number, number, number] = [toXZ[0], plenumY, fromXZ[1]];
      const d: [number, number, number] = [toXZ[0], plenumY, toXZ[1]];
      const e: [number, number, number] = [toXZ[0], headBaseY, toXZ[1]];
      return {
        runDeviceId: run.deviceId,
        headEnd: run.headEnd,
        points: [a, b, c, d, e] as [number, number, number][],
      };
    });
  }, [floor, ceilingHeight]);

  return (
    <group>
      {segments.map((seg) => {
        const active =
          simRunning &&
          (detectingCameras.has(seg.runDeviceId) ||
            triggeredSensors.has(seg.runDeviceId));
        const baseColor = HEAD_COLOR[seg.headEnd] ?? "#888";
        const color = active ? "#34d399" : baseColor;
        return (
          <group key={seg.runDeviceId}>
            <Line
              points={seg.points}
              color={color}
              lineWidth={active ? 2.2 : 1.4}
              transparent
              opacity={active ? 0.95 : 0.7}
              dashed={!active}
              dashSize={0.18}
              gapSize={0.12}
            />
            {active && <CablePulse3D points={seg.points} />}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Stream of three staggered emissive packets traveling along the 5-point
 * polyline — they read as "data flowing" instead of a lone marble. Each
 * packet has a faint trailing glow sphere behind it so the eye sees motion
 * vectors, not just dots. Loops every ~1.6s.
 */
function CablePulse3D({
  points,
}: {
  points: [number, number, number][];
}) {
  const PULSE_COUNT = 3;
  // One mesh ref + one glow ref per pulse.
  const pulseRefs = useRef<(THREE.Mesh | null)[]>([]);
  const glowRefs = useRef<(THREE.Mesh | null)[]>([]);

  const segLengths = useMemo(() => {
    const lens: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay, az] = points[i];
      const [bx, by, bz] = points[i + 1];
      lens.push(Math.hypot(bx - ax, by - ay, bz - az));
    }
    const total = lens.reduce((s, n) => s + n, 0) || 1;
    return { lens, total };
  }, [points]);

  /** Lerp a normalized t∈[0,1] onto the polyline. */
  function positionAt(t: number, out: THREE.Vector3) {
    const target = t * segLengths.total;
    let walked = 0;
    for (let i = 0; i < segLengths.lens.length; i++) {
      const len = segLengths.lens[i];
      if (target <= walked + len || i === segLengths.lens.length - 1) {
        const k = len > 0 ? (target - walked) / len : 0;
        const [ax, ay, az] = points[i];
        const [bx, by, bz] = points[i + 1];
        out.set(ax + (bx - ax) * k, ay + (by - ay) * k, az + (bz - az) * k);
        return;
      }
      walked += len;
    }
  }

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const tmpGlow = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    for (let p = 0; p < PULSE_COUNT; p++) {
      // Phase-shift each pulse by 1/PULSE_COUNT of the loop so they're
      // evenly spaced along the cable at any moment.
      const t = ((elapsed / 1.6 + p / PULSE_COUNT) % 1);
      positionAt(t, tmp);
      pulseRefs.current[p]?.position.copy(tmp);
      // Trailing glow sits a hair behind the head packet.
      const trailT = (t - 0.06 + 1) % 1;
      positionAt(trailT, tmpGlow);
      glowRefs.current[p]?.position.copy(tmpGlow);
    }
  });

  return (
    <group>
      {Array.from({ length: PULSE_COUNT }).map((_, i) => (
        <group key={i}>
          {/* Trailing glow — bigger, softer, transparent. Renders BEFORE
              the head so the head reads as the leading edge. */}
          <mesh
            ref={(m) => {
              glowRefs.current[i] = m;
            }}
            raycast={() => null}
          >
            <sphereGeometry args={[0.075, 12, 12]} />
            <meshBasicMaterial
              color="#34d399"
              transparent
              opacity={0.22}
              depthWrite={false}
            />
          </mesh>
          {/* Head packet — bright, emissive, the visible "data". */}
          <mesh
            ref={(m) => {
              pulseRefs.current[i] = m;
            }}
            raycast={() => null}
          >
            <sphereGeometry args={[0.038, 14, 14]} />
            <meshStandardMaterial
              color="#34d399"
              emissive="#34d399"
              emissiveIntensity={2.2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function pxToWorld(p: { x: number; y: number }, scale: number): [number, number] {
  // Floor-plan y axis maps to world z. Scale is px-per-meter.
  return [p.x / scale, p.y / scale];
}

