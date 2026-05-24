"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { Door, DoorLock, LockType } from "@/types/design";
import { doorTexture } from "./textures";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { useSimStore } from "@/lib/sim-store";
import { positionOnPath } from "@/lib/detection";
import { WALK_SPEED } from "@/lib/walk";

/**
 * Brand-color accent applied to lock hardware. Matches the brand's
 * marketing palette loosely — enough that a Schlage lock reads as
 * "brass" and an HID lock reads as "orange" at a glance.
 */
function brandAccent(brand: string | undefined): string {
  const b = (brand ?? "").toLowerCase();
  if (b.includes("hid")) return "#ea580c"; // HID orange
  if (b.includes("schlage")) return "#b8860b"; // brass
  if (b.includes("yale")) return "#1d4ed8"; // Yale blue
  if (b.includes("salto")) return "#0891b2"; // teal
  if (b.includes("assa") || b.includes("allegion")) return "#475569"; // slate
  if (b.includes("dormakaba")) return "#7c3aed"; // violet
  if (b.includes("bosch")) return "#dc2626"; // red
  if (b.includes("mercury")) return "#9333ea"; // mercury purple
  if (b.includes("avigilon")) return "#0ea5e9"; // sky
  return "#94a3b8"; // neutral slate
}

/**
 * Short user-facing label for a lock type — fits inside the floating
 * billboard above the door. Kept terse since the model name follows.
 */
function lockTypeLabel(type: LockType): string {
  switch (type) {
    case "mag-lock": return "MAG LOCK";
    case "electric-strike": return "ELECTRIC STRIKE";
    case "electric-bolt": return "ELECTRIC BOLT";
    case "magnetic-shear": return "SHEAR LOCK";
    case "smart-deadbolt": return "SMART DEADBOLT";
    case "smart-mortise": return "SMART MORTISE";
    case "exit-device": return "EXIT DEVICE";
  }
}

/**
 * Renders a single door as a thin wooden slab inside the wall opening.
 *
 * The wall geometry around the door is cut to leave an actual gap (see
 * Wall3D), and the door slab fills that gap visually. Doors are hinged on
 * their LEFT edge: the inner `<swingGroup>` is offset to the hinge and
 * rotated around it so the slab pivots like a real door.
 *
 * During sim mode, the door watches the actor's live position and swings
 * open ~75° when the actor is within ~1.5m. Closes back smoothly when
 * they leave. Locked doors stay shut regardless (with a red strike-plate
 * cue on the side).
 *
 * Door height is hard-coded to 2.05 m (standard interior). Width comes
 * from the model.
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
  const floor = useActiveFloor();

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

  // The "swing" group pivots on the door's left edge. We position it at
  // (-widthM/2, 0, 0) in the parent's local space, then offset the slab
  // back to (+widthM/2, 0, 0) inside the swing group so visually the
  // door sits in the wall opening when angle=0.
  const swingRef = useRef<THREE.Group>(null);
  const openAngleRef = useRef(0); // current radians
  // Pull the camera so walk-mode auto-open can react to the walker's
  // real-time position (the camera IS the walker).
  const { camera } = useThree();

  useFrame(() => {
    if (!swingRef.current || !floor) return;
    if (door.locked) {
      // Locked doors never swing open from proximity.
      const cur = openAngleRef.current;
      const next = cur + (0 - cur) * 0.18;
      openAngleRef.current = next;
      swingRef.current.rotation.y = next;
      return;
    }
    const sim = useSimStore.getState();
    const path = floor.simPath ?? [];
    const threeDMode = useDesignStore.getState().threeDMode;

    let targetAngle = 0;

    // 1) Sim-mode trigger — actor walking the preset path.
    if (sim.running && path.length >= 2) {
      const { position } = positionOnPath(
        path,
        sim.t,
        WALK_SPEED,
        floor.scale,
      );
      const ax = position.x / floor.scale;
      const az = position.y / floor.scale;
      const dist = Math.hypot(ax - x, az - z);
      if (dist < 1.6) {
        const k = Math.max(0, Math.min(1, (1.6 - dist) / 1.0));
        targetAngle = Math.max(targetAngle, k * k * (Math.PI * 0.42));
      }
    }

    // 2) Walk-mode trigger — user is the camera. Trigger range is a hair
    // wider than the WalkController's pass-through radius so the door is
    // already swinging by the time they hit the threshold.
    if (threeDMode === "walk") {
      const cx = camera.position.x;
      const cz = camera.position.z;
      const dist = Math.hypot(cx - x, cz - z);
      if (dist < 2.0) {
        const k = Math.max(0, Math.min(1, (2.0 - dist) / 1.4));
        targetAngle = Math.max(targetAngle, k * k * (Math.PI * 0.5));
      }
    }

    const cur = openAngleRef.current;
    const next = cur + (targetAngle - cur) * 0.18;
    openAngleRef.current = next;
    swingRef.current.rotation.y = next;
  });

  return (
    <group
      position={[x, heightM / 2, z]}
      rotation={[0, -door.rotation, 0]}
    >
      {/* Hinge group — sits on the door's left edge, rotates the door
          around that hinge axis. */}
      <group ref={swingRef} position={[-widthM / 2, 0, 0]}>
        {/* The door slab itself, offset back into the opening so when
            rotation=0 it sits centered in the wall gap. */}
        <group position={[widthM / 2, 0, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[widthM, heightM, thicknessM]} />
            <meshStandardMaterial
              map={texture}
              roughness={0.55}
              metalness={0.04}
            />
          </mesh>

          {/* Strike-plate indicator on the right edge — small vertical bar */}
          <mesh
            position={[widthM / 2 - 0.012, 0, thicknessM / 2 + 0.001]}
          >
            <boxGeometry args={[0.018, 0.12, 0.005]} />
            <meshStandardMaterial
              color={strikeColor}
              roughness={0.4}
              metalness={door.locked ? 0.2 : 0.6}
            />
          </mesh>

          {/* Hinge stripes on the left edge — two small dark rectangles */}
          <mesh
            position={[
              -widthM / 2 + 0.01,
              heightM * 0.32 - heightM / 2,
              thicknessM / 2 + 0.001,
            ]}
          >
            <boxGeometry args={[0.012, 0.08, 0.004]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh
            position={[
              -widthM / 2 + 0.01,
              heightM * 0.72 - heightM / 2,
              thicknessM / 2 + 0.001,
            ]}
          >
            <boxGeometry args={[0.012, 0.08, 0.004]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.5} metalness={0.5} />
          </mesh>

          {/* Door knob — small chrome sphere on the strike-plate side so
              the closed door reads as a real door even with no animation. */}
          <mesh
            position={[widthM / 2 - 0.08, 0, thicknessM / 2 + 0.018]}
          >
            <sphereGeometry args={[0.03, 12, 12]} />
            <meshStandardMaterial
              color="#c9a45a"
              roughness={0.3}
              metalness={0.8}
            />
          </mesh>

          {/* Lock-hardware geometry — visible only when the door has a
              real lock spec set (door.lock.type). Different mesh per
              lock type so a mag lock reads completely differently from
              an exit bar at a glance. */}
          {door.lock && (
            <LockHardware3D
              lock={door.lock}
              widthM={widthM}
              heightM={heightM}
              thicknessM={thicknessM}
            />
          )}
        </group>
      </group>

      {/* Floating brand/model billboard above the door — only when a lock
          is spec'd. Makes the hardware identifiable at a glance from
          across the floor even before zooming in. */}
      {door.lock && (
        <LockLabel3D lock={door.lock} heightM={heightM} />
      )}
    </group>
  );
}

/**
 * The lock-hardware geometry mounted on the door slab. Lives inside the
 * swing group so it rotates with the door. Each lock type gets a
 * distinctive primitive so a glance tells you what's there.
 */
function LockHardware3D({
  lock,
  widthM,
  heightM,
  thicknessM,
}: {
  lock: DoorLock;
  widthM: number;
  heightM: number;
  thicknessM: number;
}) {
  const accent = brandAccent(lock.brand);
  // Handle / strike side is +X; hinge side is -X.
  // Door coords are centered: y in [-heightM/2, +heightM/2], z is door normal.
  const frontZ = thicknessM / 2 + 0.002;  // just in front of the slab
  const backZ = -thicknessM / 2 - 0.002;
  // Latch height = ~1.0 m from floor. heightM/2 = 1.025 → y ≈ -0.025.
  const latchY = -0.025;

  // Brushed-metal palette used for lock body geometry. Light enough to
  // read clearly against the dark mahogany door slab. Brand accents
  // (LED strips, faceplates) glow via emissive so they pop.
  const bodyLight = "#cbd5e1";   // brushed aluminum
  const bodyMid = "#94a3b8";     // slate steel
  const bodyDark = "#475569";    // accent shadow

  switch (lock.type) {
    case "mag-lock":
      return (
        <>
          {/* Body — large brushed-aluminum housing at the top of the
              door, spanning ~70% of its width. Reads as the iconic
              "big rectangular box bolted to the door frame". */}
          <mesh position={[widthM * 0.05, heightM / 2 - 0.07, frontZ + 0.05]}>
            <boxGeometry args={[widthM * 0.7, 0.12, 0.1]} />
            <meshStandardMaterial color={bodyLight} roughness={0.3} metalness={0.85} />
          </mesh>
          {/* Subtle dark trim line along the bottom edge for definition. */}
          <mesh position={[widthM * 0.05, heightM / 2 - 0.135, frontZ + 0.1]}>
            <boxGeometry args={[widthM * 0.7, 0.012, 0.004]} />
            <meshStandardMaterial color={bodyDark} roughness={0.5} metalness={0.5} />
          </mesh>
          {/* Brand-tinted status LED stripe — glowing across the face. */}
          <mesh position={[widthM * 0.05, heightM / 2 - 0.05, frontZ + 0.101]}>
            <boxGeometry args={[widthM * 0.62, 0.025, 0.003]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={1.4}
              roughness={0.4}
            />
          </mesh>
          {/* Armature plate on the door slab itself (visible when door is closed). */}
          <mesh position={[widthM * 0.05, heightM / 2 - 0.18, frontZ + 0.01]}>
            <boxGeometry args={[widthM * 0.55, 0.07, 0.018]} />
            <meshStandardMaterial color={bodyMid} roughness={0.35} metalness={0.9} />
          </mesh>
        </>
      );

    case "electric-strike":
      return (
        <>
          {/* Big visible strike housing on the latch side, brushed aluminum. */}
          <mesh position={[widthM / 2 - 0.02, latchY, frontZ + 0.025]}>
            <boxGeometry args={[0.075, 0.32, 0.05]} />
            <meshStandardMaterial color={bodyLight} roughness={0.28} metalness={0.85} />
          </mesh>
          {/* Inner cut-out (darker) where the latch enters. */}
          <mesh position={[widthM / 2 - 0.02, latchY, frontZ + 0.051]}>
            <boxGeometry args={[0.05, 0.12, 0.002]} />
            <meshStandardMaterial color={bodyDark} roughness={0.5} metalness={0.6} />
          </mesh>
          {/* Brand accent band across the face — glowing. */}
          <mesh position={[widthM / 2 - 0.02, latchY - 0.1, frontZ + 0.051]}>
            <boxGeometry args={[0.06, 0.025, 0.003]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={1.2}
            />
          </mesh>
          {/* Lever-style handle (replaces the small chrome ball). */}
          <mesh position={[widthM / 2 - 0.12, latchY, frontZ + 0.03]}>
            <boxGeometry args={[0.1, 0.025, 0.025]} />
            <meshStandardMaterial color={bodyLight} roughness={0.25} metalness={0.9} />
          </mesh>
          <mesh position={[widthM / 2 - 0.07, latchY, frontZ + 0.035]}>
            <cylinderGeometry args={[0.038, 0.038, 0.04, 18]} />
            <meshStandardMaterial color={bodyLight} roughness={0.25} metalness={0.9} />
          </mesh>
        </>
      );

    case "electric-bolt":
      return (
        <>
          {/* Top-of-door drop bolt — chunky chrome bolt protruding upward. */}
          <mesh position={[widthM / 2 - 0.08, heightM / 2 + 0.04, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.16, 16]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.95} />
          </mesh>
          {/* Housing body below the bolt — large + brushed aluminum. */}
          <mesh position={[widthM / 2 - 0.08, heightM / 2 - 0.13, frontZ + 0.025]}>
            <boxGeometry args={[0.14, 0.22, 0.05]} />
            <meshStandardMaterial color={bodyLight} roughness={0.3} metalness={0.85} />
          </mesh>
          {/* Brand accent strip across the housing face. */}
          <mesh position={[widthM / 2 - 0.08, heightM / 2 - 0.16, frontZ + 0.051]}>
            <boxGeometry args={[0.11, 0.025, 0.003]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={1.2}
            />
          </mesh>
          {/* Smaller status indicator at the top. */}
          <mesh position={[widthM / 2 - 0.08, heightM / 2 - 0.07, frontZ + 0.051]}>
            <cylinderGeometry args={[0.012, 0.012, 0.003, 12]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={1.6}
            />
          </mesh>
        </>
      );

    case "magnetic-shear":
      // Slim by design (these locks ARE recessed in reality), but now
      // bright brushed metal + glowing brand accent stripe so it reads.
      return (
        <>
          <mesh position={[widthM * 0.05, heightM / 2 - 0.02, 0]}>
            <boxGeometry args={[widthM * 0.55, 0.035, thicknessM + 0.01]} />
            <meshStandardMaterial color={bodyLight} roughness={0.3} metalness={0.9} />
          </mesh>
          {/* Glowing brand-color strip down the middle. */}
          <mesh position={[widthM * 0.05, heightM / 2 - 0.02, thicknessM / 2 + 0.006]}>
            <boxGeometry args={[widthM * 0.5, 0.014, 0.003]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={1.3}
            />
          </mesh>
        </>
      );

    case "smart-deadbolt":
      return (
        <>
          {/* Big front rosette — brand color with brushed-metal trim ring. */}
          <mesh
            position={[widthM / 2 - 0.12, latchY, frontZ + 0.035]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.085, 0.085, 0.05, 28]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.45}
              roughness={0.3}
              metalness={0.7}
            />
          </mesh>
          {/* Brushed metal trim ring around the rosette. */}
          <mesh
            position={[widthM / 2 - 0.12, latchY, frontZ + 0.061]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.095, 0.095, 0.008, 28]} />
            <meshStandardMaterial color={bodyLight} roughness={0.25} metalness={0.95} />
          </mesh>
          {/* Outer thumb-turn cylinder cap (brushed steel). */}
          <mesh
            position={[widthM / 2 - 0.12, latchY, frontZ + 0.075]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.04, 0.04, 0.04, 20]} />
            <meshStandardMaterial color={bodyLight} roughness={0.2} metalness={0.95} />
          </mesh>
          {/* Tactile thumb-turn slot. */}
          <mesh
            position={[widthM / 2 - 0.12, latchY, frontZ + 0.098]}
          >
            <boxGeometry args={[0.05, 0.012, 0.003]} />
            <meshStandardMaterial color={bodyDark} roughness={0.4} />
          </mesh>
          {/* Back-side rosette (visible through the door). */}
          <mesh
            position={[widthM / 2 - 0.12, latchY, backZ - 0.035]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.085, 0.085, 0.05, 28]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.45}
              roughness={0.3}
              metalness={0.7}
            />
          </mesh>
        </>
      );

    case "smart-mortise":
      return (
        <>
          {/* Tall vertical handle/grip — wider + thicker so it reads as
              hardware, not a stripe. Brand-colored, brushed finish. */}
          <mesh position={[widthM / 2 - 0.055, 0, frontZ + 0.04]}>
            <boxGeometry args={[0.08, heightM * 0.7, 0.05]} />
            <meshStandardMaterial color={accent} roughness={0.3} metalness={0.8} />
          </mesh>
          {/* Brushed metal trim down the long edge. */}
          <mesh position={[widthM / 2 - 0.055, 0, frontZ + 0.066]}>
            <boxGeometry args={[0.065, heightM * 0.7, 0.004]} />
            <meshStandardMaterial color={bodyLight} roughness={0.25} metalness={0.95} />
          </mesh>
          {/* Reader inset at the top of the bar — glowing read zone. */}
          <mesh position={[widthM / 2 - 0.055, heightM * 0.25, frontZ + 0.07]}>
            <boxGeometry args={[0.06, 0.12, 0.005]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={1.3}
              roughness={0.4}
            />
          </mesh>
          {/* Handle grip at the bottom (lever shape). */}
          <mesh position={[widthM / 2 - 0.13, latchY, frontZ + 0.06]}>
            <boxGeometry args={[0.18, 0.035, 0.035]} />
            <meshStandardMaterial color={bodyLight} roughness={0.25} metalness={0.95} />
          </mesh>
        </>
      );

    case "exit-device":
      return (
        <>
          {/* Big horizontal crash bar — wider + thicker so it screams
              "push to exit" from across the room. */}
          <mesh position={[0, latchY, frontZ + 0.06]}>
            <boxGeometry args={[widthM * 0.85, 0.1, 0.085]} />
            <meshStandardMaterial color={accent} roughness={0.3} metalness={0.7} />
          </mesh>
          {/* Brushed-metal accent strip running the length of the bar. */}
          <mesh position={[0, latchY + 0.025, frontZ + 0.103]}>
            <boxGeometry args={[widthM * 0.83, 0.012, 0.003]} />
            <meshStandardMaterial color={bodyLight} roughness={0.2} metalness={0.95} />
          </mesh>
          {/* End-cap mounts — chunky brushed steel cylinders. */}
          <mesh
            position={[-widthM * 0.42, latchY, frontZ + 0.06]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.055, 0.055, 0.09, 16]} />
            <meshStandardMaterial color={bodyLight} roughness={0.25} metalness={0.95} />
          </mesh>
          <mesh
            position={[widthM * 0.42, latchY, frontZ + 0.06]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.055, 0.055, 0.09, 16]} />
            <meshStandardMaterial color={bodyLight} roughness={0.25} metalness={0.95} />
          </mesh>
        </>
      );
  }
}

/**
 * Floating brand + model + lock-type label above the door. Billboard so
 * it always faces the camera, regardless of orbit angle.
 */
function LockLabel3D({
  lock,
  heightM,
}: {
  lock: DoorLock;
  heightM: number;
}) {
  const accent = brandAccent(lock.brand);
  const brandLine = [lock.brand, lock.model].filter(Boolean).join(" ").trim();
  const typeLine = lockTypeLabel(lock.type);
  return (
    <Billboard position={[0, heightM + 0.35, 0]} follow lockX={false} lockZ={false}>
      {/* Type chip — brand-colored background, white text. */}
      <mesh position={[0, 0.08, 0]}>
        <planeGeometry args={[Math.max(0.45, typeLine.length * 0.045), 0.13]} />
        <meshBasicMaterial color={accent} transparent opacity={0.92} />
      </mesh>
      <Text
        position={[0, 0.08, 0.001]}
        fontSize={0.07}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.005}
        outlineColor={accent}
      >
        🔒 {typeLine}
      </Text>
      {/* Brand + model line under the chip — darker, smaller. */}
      {brandLine && (
        <>
          <mesh position={[0, -0.05, 0]}>
            <planeGeometry args={[Math.max(0.5, brandLine.length * 0.04), 0.11]} />
            <meshBasicMaterial color="#0f172a" transparent opacity={0.85} />
          </mesh>
          <Text
            position={[0, -0.05, 0.001]}
            fontSize={0.06}
            color="#f1f5f9"
            anchorX="center"
            anchorY="middle"
          >
            {brandLine}
          </Text>
        </>
      )}
    </Billboard>
  );
}
