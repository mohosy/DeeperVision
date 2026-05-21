"use client";

import { useMemo } from "react";
import type { Door } from "@/types/design";
import { doorTexture } from "./textures";

/**
 * Renders a single door as a thin wooden slab standing in the wall plane.
 *
 * Position + rotation come from the door's data. We don't actually cut a
 * hole in the wall geometry (boolean CSG is expensive), but the door is
 * positioned slightly proud of the wall so it visually reads as "the
 * door is here, in this wall" — same visual approach the floor plan view
 * uses on the 2D canvas.
 *
 * Door height is hard-coded to 2.05 m (about 6'9", standard interior).
 * Width and rotation come from the model.
 */
export function Door3D({
  door,
  scale,
  isLight,
}: {
  door: Door;
  scale: number;
  isLight: boolean;
}) {
  // World-space center of the door.
  const x = door.position.x / scale;
  const z = door.position.y / scale;

  // The model stores the door width in meters directly.
  const widthM = door.widthMeters;
  const heightM = 2.05;
  const thicknessM = 0.045;

  const texture = useMemo(
    () =>
      doorTexture({
        base: isLight ? "#7a5232" : "#3b271a", // warmer mahogany / espresso
      }),
    [isLight],
  );

  // Lock state cue — a thin brass strike-plate band when unlocked, deep
  // red bead when locked. Implemented as a small inset on the side.
  const strikeColor = door.locked ? "#b91c1c" : "#c9a45a";

  return (
    <group
      position={[x, heightM / 2, z]}
      rotation={[0, -door.rotation, 0]}
    >
      {/* The door slab itself. Slightly thicker than the wall's 0.15m so
          it reads as the door, not a wall section. */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[widthM, heightM, thicknessM]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.55}
          metalness={0.04}
        />
      </mesh>

      {/* Strike-plate indicator on the right edge — small vertical bar */}
      <mesh position={[widthM / 2 - 0.012, 0, thicknessM / 2 + 0.001]}>
        <boxGeometry args={[0.018, 0.12, 0.005]} />
        <meshStandardMaterial
          color={strikeColor}
          roughness={0.4}
          metalness={door.locked ? 0.2 : 0.6}
        />
      </mesh>

      {/* Hinge stripes on the left edge — two small dark rectangles */}
      <mesh position={[-widthM / 2 + 0.01, heightM * 0.32 - heightM / 2, thicknessM / 2 + 0.001]}>
        <boxGeometry args={[0.012, 0.08, 0.004]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[-widthM / 2 + 0.01, heightM * 0.72 - heightM / 2, thicknessM / 2 + 0.001]}>
        <boxGeometry args={[0.012, 0.08, 0.004]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  );
}
