"use client";

import { useMemo } from "react";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Annotation } from "@/types/design";

/**
 * Floating "sticky note" billboard rendered in 3D for each annotation.
 *
 * Why a billboard: the user can be at any orbit/walk angle. A flat
 * sticker on the floor would be illegible from most angles. A
 * camera-facing billboard floating above the pin point reads clearly
 * from anywhere.
 *
 * Visuals: small thread line from floor up to ~1.6m, a rounded plane
 * tinted by annotation kind (note/warning/idea), and the first line of
 * the annotation text rendered as MSDF text. AI-authored annotations
 * get a tiny ✦ in the corner.
 *
 * Positioning: the annotation's floor-plan (px) coords convert to
 * world units using the floor's scale. We don't show the full text
 * (it'd be unreadable at distance) — just a short preview.
 */
export function Annotation3D({
  annotation,
  scale,
  selected,
  onSelect,
}: {
  annotation: Annotation;
  scale: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const worldX = annotation.position.x / scale;
  const worldZ = annotation.position.y / scale;
  // Float the sticky note ~1.6m above the floor — head height, easy to
  // read without colliding with most cameras (which mount at 2.8m).
  const height = 1.6;
  // Anchor dot on the floor.

  const tone = TONES[annotation.kind];

  // Truncate to a single short line for the in-scene preview.
  const preview = useMemo(() => {
    const oneLine = annotation.text.split("\n")[0];
    return oneLine.length > 36 ? oneLine.slice(0, 34) + "…" : oneLine;
  }, [annotation.text]);

  return (
    <group position={[worldX, 0, worldZ]} onClick={onSelect} onPointerOver={() => {}}>
      {/* Anchor dot on the floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
      >
        <circleGeometry args={[0.07, 24]} />
        <meshBasicMaterial color={tone.dot} transparent opacity={0.85} />
      </mesh>
      {/* Thread line — thin vertical cylinder from floor to billboard. */}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, height, 8]} />
        <meshBasicMaterial color={tone.dot} transparent opacity={0.5} />
      </mesh>

      {/* Camera-facing sticky-note billboard */}
      <Billboard position={[0, height, 0]} follow lockX={false} lockY={false} lockZ={false}>
        {/* Background plate */}
        <mesh>
          <planeGeometry args={[1.6, 0.42]} />
          <meshBasicMaterial
            color={tone.bg}
            transparent
            opacity={selected ? 0.98 : 0.92}
          />
        </mesh>
        {/* Outline */}
        <mesh position={[0, 0, -0.001]}>
          <planeGeometry args={[1.66, 0.48]} />
          <meshBasicMaterial color={tone.border} transparent opacity={0.55} />
        </mesh>
        {/* Kind tag dot in top-left */}
        <mesh position={[-0.72, 0.13, 0.001]}>
          <circleGeometry args={[0.04, 16]} />
          <meshBasicMaterial color={tone.dot} />
        </mesh>
        {/* AI sparkle in top-right when AI-authored */}
        {annotation.author === "ai" && (
          <Text
            position={[0.7, 0.13, 0.001]}
            fontSize={0.09}
            color={tone.dot}
            anchorX="right"
            anchorY="middle"
          >
            ✦
          </Text>
        )}
        {/* Preview text */}
        <Text
          position={[-0.65, -0.02, 0.002]}
          fontSize={0.085}
          color={tone.text}
          anchorX="left"
          anchorY="middle"
          maxWidth={1.45}
          font={undefined}
        >
          {preview}
        </Text>
      </Billboard>
    </group>
  );
}

const TONES: Record<
  Annotation["kind"],
  { dot: string; bg: string; border: string; text: string }
> = {
  note: {
    dot: "#0ea5e9",
    bg: "#ffffff",
    border: "#0ea5e9",
    text: "#0f172a",
  },
  warning: {
    dot: "#f59e0b",
    bg: "#fef7e1",
    border: "#f59e0b",
    text: "#7c2d12",
  },
  idea: {
    dot: "#a855f7",
    bg: "#faf5ff",
    border: "#a855f7",
    text: "#581c87",
  },
};

// Avoid `Object3D` warning when drei's Billboard re-export changes —
// re-export THREE so future Annotation3D users don't need a separate import.
export type { Annotation };
const _keepThree = THREE; // eslint-disable-line @typescript-eslint/no-unused-vars
