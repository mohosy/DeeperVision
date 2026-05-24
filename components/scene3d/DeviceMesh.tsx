"use client";

import { Outlines, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type {
  CameraDevice,
  Device,
  NetworkDeviceBase,
  ReaderDevice,
  SensorDevice,
} from "@/types/design";

/**
 * Detailed 3D meshes for each device kind. Goal: when you flip into 3D and
 * look at one of these from a typical orbit distance, the silhouette + the
 * obvious details (lens, IR ring, sunshade, port row, etc.) immediately
 * read as the real-world object.
 *
 * Geometry budgets are kept modest (a few dozen meshes per device with
 * 16–24-segment cylinders/spheres) so we can place a couple dozen on one
 * floor without the framerate tanking.
 */

/**
 * Realistic security-gear palette. Real cameras are mostly white/eggshell
 * plastic (Verkada, Axis, Hanwha) with brushed-aluminum or silver accents
 * and a dark lens. Old palette was all zinc-700-to-900 which read as
 * uniformly black on the floor plan.
 *
 *   HOUSING_LIGHT  off-white dome covers, ceiling-mount bodies
 *   HOUSING_MID    light gray bullet camera bodies
 *   HOUSING_DARK   neutral charcoal — used sparingly for hardware accents
 *   METAL          brushed aluminum mounts + bezels
 *   POLISHED       chrome / mirror caps on PTZ heads
 *   GLASS          near-black lens
 *   PORCELAIN      reader / smoke-detector body
 *   READER_PANEL   the dark glass face of card readers
 *   OUTLINE        edge-detect outline on shapes for legibility
 */
const HOUSING_DARK = "#3f3f46"; // zinc-700 — accents only
const HOUSING_MID = "#d4d4d8"; // zinc-300 — light gray bodies
const HOUSING_LIGHT = "#f4f4f5"; // zinc-100 — off-white domes
const METAL = "#a1a1aa"; // zinc-400 — brushed aluminum
const POLISHED = "#e4e4e7"; // zinc-200 — bright chrome highlight
const GLASS = "#18181b"; // dark glass lens
const PORCELAIN = "#fafaf9"; // stone-50 — reader / smoke face
const READER_PANEL = "#1f2937"; // slate-800 — reader display glass
const OUTLINE = "#71717a"; // zinc-500 — softer outline

interface DeviceMeshProps {
  device: Device;
  accent: string;
  emissiveIntensity: number;
  /**
   * Room ceiling height in meters. When provided, ceiling-mount devices
   * (domes, multi-sensors, APs, ceiling motion sensors) render a thin
   * vertical mount stem from the top of the device up to the ceiling so
   * they don't look like they're floating in midair. Optional so the tiny
   * library preview canvases (which have no room context) skip the stem.
   */
  ceilingHeight?: number;
}

export function DeviceMesh({
  device,
  accent,
  emissiveIntensity,
  ceilingHeight,
}: DeviceMeshProps) {
  // Distance (in meters) from the device's local origin to the ceiling.
  // Devices are rendered with their origin at world y = device.mountHeight,
  // so the ceiling sits at local y = (ceilingHeight − mountHeight).
  const ceilingLocalY =
    ceilingHeight != null
      ? Math.max(0, ceilingHeight - device.mountHeight)
      : null;

  const meshBody =
    device.type === "camera" ? (
      <CameraMesh
        device={device}
        accent={accent}
        emissiveIntensity={emissiveIntensity}
      />
    ) : device.type === "reader" ? (
      <ReaderMesh device={device} accent={accent} />
    ) : device.type === "sensor" ? (
      <SensorMesh
        device={device}
        accent={accent}
        emissiveIntensity={emissiveIntensity}
      />
    ) : (
      <NetworkMesh
        device={device}
        accent={accent}
        emissiveIntensity={emissiveIntensity}
      />
    );

  // Which device kinds physically attach to the ceiling? Anything else
  // (bullet, PTZ wall-mount, readers, NVRs, switches) sits flush against
  // a wall or floor and doesn't get a stem.
  const isCeilingMount =
    (device.type === "camera" &&
      (device.cameraType === "dome" ||
        device.cameraType === "fisheye" ||
        device.cameraType === "mini" ||
        device.cameraType === "multi-sensor")) ||
    (device.type === "network" && device.networkType === "access-point") ||
    (device.type === "sensor" &&
      (device.sensorType === "motion" ||
        device.sensorType === "smoke" ||
        device.sensorType === "heat"));

  // PTZ cameras are pendant-mount — they hang BELOW the ceiling on a
  // longer stem. For these we draw a thicker drop column.
  const isPendantMount =
    device.type === "camera" && device.cameraType === "ptz";

  // Top-of-device local Y per kind so the stem starts at the actual top
  // of the mesh, not buried inside it.
  const stemStartY =
    device.type === "camera" && device.cameraType === "ptz"
      ? 0.21 // top of PTZ mount plate
      : device.type === "camera" &&
          (device.cameraType === "dome" ||
            device.cameraType === "fisheye" ||
            device.cameraType === "multi-sensor" ||
            device.cameraType === "mini")
        ? 0.025 // top of dome plate
        : 0.04;

  return (
    <group>
      {meshBody}
      {ceilingLocalY != null &&
        ceilingLocalY > stemStartY + 0.02 &&
        (isCeilingMount || isPendantMount) && (
          <CeilingStem
            ceilingY={ceilingLocalY}
            startY={stemStartY}
            thicker={isPendantMount}
          />
        )}
    </group>
  );
}

/**
 * Visible mount hardware connecting a ceiling-mount device to the
 * (implied) ceiling. Renders a thin metallic cylinder from `startY` up
 * to `ceilingY`, capped with a small disc that suggests the bolt plate
 * mounted into the ceiling. Without this, dome cameras and APs read
 * as floating spheres in mid-air.
 */
function CeilingStem({
  ceilingY,
  startY,
  thicker = false,
}: {
  ceilingY: number;
  startY: number;
  thicker?: boolean;
}) {
  const len = Math.max(0, ceilingY - startY);
  if (len <= 0.001) return null;
  const r = thicker ? 0.025 : 0.015;
  return (
    <group>
      {/* Stem itself */}
      <mesh position={[0, startY + len / 2, 0]} castShadow>
        <cylinderGeometry args={[r, r, len, 10]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.55} metalness={0.5} />
      </mesh>
      {/* Bolt plate at the ceiling — small disc with a faint dark center
          ring so it reads as an anchor, not a flat sticker. */}
      <mesh position={[0, ceilingY - 0.004, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.008, 18]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, ceilingY - 0.0035, 0]}>
        <torusGeometry args={[0.035, 0.003, 8, 24]} />
        <meshStandardMaterial color="#6b7280" roughness={0.45} metalness={0.7} />
      </mesh>
    </group>
  );
}

/**
 * Phillips-head screw — small metallic disc with a "+" indent.
 * Replaces the bare cylinder we used before so the screws actually read
 * as fastener heads when you're orbiting close to a camera.
 *
 * Pass `axis="y"` for ceiling-plate screws (head facing down/up) or
 * `axis="x"` for wall-plate screws (head facing forward along +X).
 */
function PhillipsScrew({
  position,
  axis = "y",
  radius = 0.009,
  height = 0.004,
}: {
  position: [number, number, number];
  axis?: "x" | "y" | "z";
  radius?: number;
  height?: number;
}) {
  const rotation: [number, number, number] =
    axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  // Slot inset: a darker thin box across the head, plus a second crossed
  // box, gives the unmistakable "+" of a Phillips driver.
  const slotLen = radius * 1.6;
  const slotWidth = radius * 0.18;
  const slotDepth = height * 0.55;
  const slotOffset = height / 2 - slotDepth / 2 + 0.0002;
  const slotPos: [number, number, number] =
    axis === "x"
      ? [position[0] + slotOffset, position[1], position[2]]
      : axis === "z"
        ? [position[0], position[1], position[2] + slotOffset]
        : [position[0], position[1] + slotOffset, position[2]];
  const slotRotA: [number, number, number] = rotation;
  const slotRotB: [number, number, number] =
    axis === "x"
      ? [Math.PI / 2, 0, Math.PI / 2]
      : axis === "z"
        ? [Math.PI / 2, 0, Math.PI / 2]
        : [0, Math.PI / 2, 0];
  return (
    <group>
      <mesh position={position} rotation={rotation}>
        <cylinderGeometry args={[radius, radius, height, 14]} />
        <meshStandardMaterial color={POLISHED} roughness={0.28} metalness={0.92} />
      </mesh>
      {/* Cross slot — two thin dark boxes on the screw face */}
      <mesh position={slotPos} rotation={slotRotA}>
        <boxGeometry args={[slotLen, slotDepth, slotWidth]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={slotPos} rotation={slotRotB}>
        <boxGeometry args={[slotLen, slotDepth, slotWidth]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.6} metalness={0.5} />
      </mesh>
    </group>
  );
}

// ───────────────────────── Cameras ─────────────────────────

function CameraMesh({
  device,
  accent,
  emissiveIntensity,
}: {
  device: CameraDevice;
  accent: string;
  emissiveIntensity: number;
}) {
  switch (device.cameraType) {
    case "multi-sensor":
      // 4-lens sensor cluster radiating around a central body. Distinct
      // mesh so it doesn't look like a regular dome at a glance — the
      // four pods make the 360° coverage obvious.
      return (
        <MultiSensorCamera
          accent={accent}
          emissiveIntensity={emissiveIntensity}
        />
      );
    case "fisheye":
      // Flatter "puck"-style camera with a single prominent center lens.
      // Real fisheye / panoramic cameras (Verkada CF82, Axis M3077) sit
      // much closer to the ceiling than a hemispheric dome.
      return (
        <FisheyeCamera
          accent={accent}
          emissiveIntensity={emissiveIntensity}
        />
      );
    case "dome":
    case "mini":
      return <DomeCamera accent={accent} emissiveIntensity={emissiveIntensity} />;
    case "ptz":
      return (
        <PTZCamera
          accent={accent}
          emissiveIntensity={emissiveIntensity}
        />
      );
    case "bullet":
    case "fixed":
    case "modular":
    default:
      return (
        <BulletCamera
          accent={accent}
          emissiveIntensity={emissiveIntensity}
        />
      );
  }
}

/**
 * Hikvision-style cylindrical bullet camera:
 *   wall plate → swivel mount → housing barrel (with heatsink ribs) →
 *   sunshade visor → front cap → IR LED ring → glass lens face.
 *
 * NOTE: the parent (`Device3D` in Scene3DCanvas) now applies yaw + tilt,
 * so this mesh draws in its local frame where +X is the lens direction.
 * The `rotation` prop is kept for backwards compatibility with the small
 * library-preview canvases but ignored in the main scene (passes 0).
 */
function BulletCamera({
  accent,
  emissiveIntensity,
}: {
  rotation?: number;
  accent: string;
  emissiveIntensity: number;
}) {
  // Cylinder body axis is along X (so we can lay it flat horizontally).
  // Local frame: +X is "lens direction"; -X is "wall-mount side".
  return (
    <group>
      {/* Wall plate */}
      <RoundedBox
        args={[0.04, 0.18, 0.18]}
        radius={0.014}
        smoothness={4}
        position={[-0.28, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_MID} roughness={0.55} metalness={0.3} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.5} transparent />
      </RoundedBox>
      {/* Phillips screws on the wall plate (face forward along -X) */}
      {[-0.06, 0.06].map((dy) => (
        <PhillipsScrew
          key={dy}
          position={[-0.3, dy, 0.06]}
          axis="x"
          radius={0.0095}
          height={0.005}
        />
      ))}

      {/* Mount arm — short cylinder coming out of the wall plate */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.21, 0, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 0.13, 12]} />
        <meshStandardMaterial color={HOUSING_LIGHT} roughness={0.45} metalness={0.5} />
      </mesh>

      {/* Swivel joint (where the bracket meets the housing) */}
      <mesh position={[-0.13, 0, 0]} castShadow>
        <sphereGeometry args={[0.035, 16, 12]} />
        <meshStandardMaterial color={POLISHED} roughness={0.35} metalness={0.85} />
      </mesh>

      {/* Bracket arm (angles down to the underside of the housing) */}
      <RoundedBox
        args={[0.1, 0.05, 0.06]}
        radius={0.012}
        smoothness={3}
        position={[-0.07, -0.04, 0]}
        rotation={[0, 0, 0.5]}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_LIGHT} roughness={0.5} metalness={0.4} />
      </RoundedBox>

      {/* Housing barrel — main cylinder lying along X */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.04, 0, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.085, 0.34, 24]} />
        <meshStandardMaterial color={HOUSING_DARK} roughness={0.55} metalness={0.3} />
      </mesh>
      {/* Heatsink ribs (3 thin fins along the top of the barrel) */}
      {[-0.06, 0, 0.06].map((dx) => (
        <RoundedBox
          key={dx}
          args={[0.015, 0.013, 0.18]}
          radius={0.003}
          smoothness={2}
          position={[0.04 + dx, 0.085, 0]}
        >
          <meshStandardMaterial color={HOUSING_MID} roughness={0.45} metalness={0.4} />
        </RoundedBox>
      ))}

      {/* Brand strip on side */}
      <mesh position={[0.04, -0.02, 0.0855]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.16, 0.02]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity * 0.55}
          roughness={0.4}
        />
      </mesh>

      {/* Rear cap with cable conduit */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.14, 0, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.085, 0.02, 24]} />
        <meshStandardMaterial color={HOUSING_MID} roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Cable port (small cylinder out the rear) */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.18, -0.04, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.05, 8]} />
        <meshStandardMaterial color={HOUSING_LIGHT} roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Front cap (slightly larger than the barrel — the IR ring lives on this face) */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.225, 0, 0]} castShadow>
        <cylinderGeometry args={[0.095, 0.095, 0.04, 24]} />
        <meshStandardMaterial color={HOUSING_DARK} roughness={0.5} metalness={0.35} />
      </mesh>

      {/* Sunshade visor — wedge on top extending past the front cap */}
      <mesh position={[0.18, 0.085, 0]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.16, 0.02, 0.22]} />
        <meshStandardMaterial color={HOUSING_MID} roughness={0.6} />
      </mesh>

      {/* IR LED ring — 10 small emissive dots around the lens */}
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const r = 0.07;
        return (
          <mesh key={i} position={[0.246, Math.sin(a) * r, Math.cos(a) * r]}>
            <sphereGeometry args={[0.007, 10, 8]} />
            <meshStandardMaterial
              color="#fef3c7"
              emissive="#fde68a"
              emissiveIntensity={0.55}
            />
          </mesh>
        );
      })}

      {/* Lens barrel — protrudes from the front cap */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.27, 0, 0]} castShadow>
        <cylinderGeometry args={[0.048, 0.052, 0.06, 24]} />
        <meshStandardMaterial color={HOUSING_DARK} roughness={0.4} metalness={0.55} />
      </mesh>
      {/* Focus ring (knurled torus) */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.298, 0, 0]}>
        <torusGeometry args={[0.052, 0.008, 12, 24]} />
        <meshStandardMaterial color={POLISHED} roughness={0.25} metalness={0.85} />
      </mesh>
      {/* Glass iris — clearcoat physical material for the wet-glass look */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.31, 0, 0]}>
        <circleGeometry args={[0.04, 32]} />
        <meshPhysicalMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity * 0.9}
          roughness={0.12}
          metalness={0.35}
          clearcoat={0.85}
          clearcoatRoughness={0.08}
        />
      </mesh>
      {/* Tiny glass inner reflection */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.311, 0.012, -0.012]}>
        <circleGeometry args={[0.012, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>

      {/* Top status LED */}
      <mesh position={[-0.04, 0.095, 0.04]}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
    </group>
  );
}

/**
 * PTZ camera: pan yoke + tilt motor + spherical head with a protruding lens.
 *
 * Parent applies yaw + tilt. `rotation` prop ignored in the main scene.
 */
function PTZCamera({
  accent,
  emissiveIntensity,
}: {
  rotation?: number;
  accent: string;
  emissiveIntensity: number;
}) {
  return (
    <group>
      {/* Ceiling/wall mount plate */}
      <RoundedBox
        args={[0.28, 0.05, 0.28]}
        radius={0.018}
        smoothness={4}
        position={[0, 0.18, 0]}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_MID} roughness={0.55} metalness={0.3} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.45} transparent />
      </RoundedBox>
      {/* Phillips screws on plate corners */}
      {[
        [-0.1, 0.21, -0.1],
        [0.1, 0.21, -0.1],
        [-0.1, 0.21, 0.1],
        [0.1, 0.21, 0.1],
      ].map((p, i) => (
        <PhillipsScrew key={i} position={p as [number, number, number]} axis="y" radius={0.0095} height={0.005} />
      ))}

      {/* Pan column (vertical cylinder hanging from plate) */}
      <mesh position={[0, 0.105, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.075, 0.1, 20]} />
        <meshStandardMaterial color={HOUSING_LIGHT} roughness={0.5} metalness={0.4} />
      </mesh>

      {/* Pan ring (slightly polished) */}
      <mesh position={[0, 0.05, 0]}>
        <torusGeometry args={[0.075, 0.008, 12, 24]} />
        <meshStandardMaterial color={POLISHED} roughness={0.3} metalness={0.9} />
      </mesh>

      {/* Yoke arms (two short verticals running from pan column down to head pivot) */}
      {[-0.085, 0.085].map((dx) => (
        <RoundedBox
          key={dx}
          args={[0.025, 0.13, 0.06]}
          radius={0.008}
          smoothness={3}
          position={[dx, -0.01, 0]}
          castShadow
        >
          <meshStandardMaterial color={HOUSING_MID} roughness={0.5} metalness={0.35} />
        </RoundedBox>
      ))}

      {/* Spherical head */}
      <mesh position={[0, -0.07, 0]} castShadow>
        <sphereGeometry args={[0.1, 32, 24]} />
        <meshStandardMaterial color={HOUSING_DARK} roughness={0.45} metalness={0.4} />
      </mesh>

      {/* Tilt motor pivot caps on the sides of the head */}
      {[-0.1, 0.1].map((dx) => (
        <mesh key={dx} position={[dx, -0.07, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.015, 16]} />
          <meshStandardMaterial color={POLISHED} roughness={0.3} metalness={0.85} />
        </mesh>
      ))}

      {/* Lens barrel protruding from front */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.1, -0.07, 0]} castShadow>
        <cylinderGeometry args={[0.052, 0.058, 0.08, 24]} />
        <meshStandardMaterial color={GLASS} roughness={0.4} metalness={0.55} />
      </mesh>
      {/* Lens focus ring */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.135, -0.07, 0]}>
        <torusGeometry args={[0.058, 0.008, 12, 24]} />
        <meshStandardMaterial color={POLISHED} roughness={0.25} metalness={0.9} />
      </mesh>
      {/* Iris — clearcoat physical material for the wet-glass look */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.147, -0.07, 0]}>
        <circleGeometry args={[0.046, 32]} />
        <meshPhysicalMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity * 0.9}
          roughness={0.12}
          metalness={0.35}
          clearcoat={0.85}
          clearcoatRoughness={0.08}
        />
      </mesh>
      {/* Glass highlight */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.148, -0.06, -0.012]}>
        <circleGeometry args={[0.014, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
      </mesh>

      {/* IR ring around lens (8 dots) */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const r = 0.075;
        return (
          <mesh
            key={i}
            position={[0.118, -0.07 + Math.sin(a) * r, Math.cos(a) * r]}
          >
            <sphereGeometry args={[0.006, 10, 8]} />
            <meshStandardMaterial
              color="#fef3c7"
              emissive="#fde68a"
              emissiveIntensity={0.5}
            />
          </mesh>
        );
      })}

      {/* Status LED on top of head */}
      <mesh position={[0, 0.02, 0.05]}>
        <sphereGeometry args={[0.008, 10, 10]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
    </group>
  );
}

/**
 * Dome camera: visible IR ring + tinted glass dome with the lens body visible
 * inside through transmission. Sits flush against a ceiling/wall plate.
 */
function DomeCamera({
  accent,
  emissiveIntensity,
}: {
  accent: string;
  emissiveIntensity: number;
}) {
  return (
    <group>
      {/* Wall / ceiling plate */}
      <RoundedBox
        args={[0.42, 0.05, 0.42]}
        radius={0.02}
        smoothness={4}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_MID} roughness={0.55} metalness={0.3} />
        <Outlines thickness={0.014} color={OUTLINE} opacity={0.55} transparent />
      </RoundedBox>
      {/* Tamper screws — Phillips heads */}
      {[
        [-0.16, 0.025, -0.16],
        [0.16, 0.025, -0.16],
        [-0.16, 0.025, 0.16],
        [0.16, 0.025, 0.16],
      ].map((p, i) => (
        <PhillipsScrew key={i} position={p as [number, number, number]} axis="y" radius={0.011} />
      ))}

      {/* Inner IR illuminator ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.045, 0]}>
        <ringGeometry args={[0.135, 0.175, 48]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} />
      </mesh>
      {/* IR LED dots on the ring */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r = 0.156;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, -0.043, Math.sin(a) * r]}
          >
            <sphereGeometry args={[0.008, 10, 8]} />
            <meshStandardMaterial
              color="#fef3c7"
              emissive="#fde68a"
              emissiveIntensity={0.4}
            />
          </mesh>
        );
      })}

      {/* Tinted glass dome */}
      <mesh position={[0, -0.04, 0]} castShadow>
        <sphereGeometry
          args={[0.19, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2]}
        />
        <meshPhysicalMaterial
          color="#0a0a0a"
          transparent
          opacity={0.5}
          roughness={0.1}
          metalness={0.5}
          transmission={0.3}
          ior={1.45}
        />
      </mesh>

      {/* Inner gimbal mount */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.04, 16]} />
        <meshStandardMaterial color={HOUSING_LIGHT} roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Inner camera body (visible through tint) */}
      <mesh position={[0, -0.14, 0]}>
        <boxGeometry args={[0.09, 0.06, 0.07]} />
        <meshStandardMaterial color={HOUSING_DARK} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Inner lens */}
      <mesh position={[0, -0.16, 0]}>
        <cylinderGeometry args={[0.022, 0.024, 0.025, 16]} />
        <meshStandardMaterial color={GLASS} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Inner iris */}
      <mesh position={[0, -0.175, 0]}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {/* External status LED on the plate edge */}
      <mesh position={[0.17, 0.012, 0]}>
        <sphereGeometry args={[0.012, 10, 10]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {/* Brand badge — small white plate on the underside ring with a
          brand-color stripe. Reads as "this is a real product with
          markings" rather than a generic gray puck. */}
      <mesh position={[-0.13, -0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.07, 0.022]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.45} />
      </mesh>
      <mesh position={[-0.13, -0.004, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.05, 0.005]} />
        <meshStandardMaterial color={accent} roughness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Multi-sensor camera — central body with 4 lens pods at 90° increments.
 * Mimics a Hanwha PNM / Avigilon H6A 360° unit. Each pod has its own
 * IR ring + glass iris so the "4 cameras in one" reading is immediate.
 */
function MultiSensorCamera({
  accent,
  emissiveIntensity,
}: {
  accent: string;
  emissiveIntensity: number;
}) {
  const podPositions: [number, number, number][] = [
    [0.18, -0.045, 0],   // east
    [-0.18, -0.045, 0],  // west
    [0, -0.045, 0.18],   // south
    [0, -0.045, -0.18],  // north
  ];
  const podRotations: number[] = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

  return (
    <group>
      {/* Ceiling plate — bigger than a single-lens dome since it carries
          four heads. */}
      <RoundedBox
        args={[0.52, 0.05, 0.52]}
        radius={0.022}
        smoothness={4}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_MID} roughness={0.55} metalness={0.3} />
        <Outlines thickness={0.014} color={OUTLINE} opacity={0.55} transparent />
      </RoundedBox>
      {/* Tamper screws — eight Phillips heads around the plate edge */}
      {[
        [-0.21, 0.025, -0.21], [0.21, 0.025, -0.21],
        [-0.21, 0.025, 0.21],  [0.21, 0.025, 0.21],
        [0, 0.025, -0.22],     [0, 0.025, 0.22],
        [-0.22, 0.025, 0],     [0.22, 0.025, 0],
      ].map((p, i) => (
        <PhillipsScrew key={i} position={p as [number, number, number]} axis="y" radius={0.011} />
      ))}

      {/* Central core — short cylinder housing the shared electronics. */}
      <mesh position={[0, -0.04, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 28]} />
        <meshStandardMaterial color={HOUSING_DARK} roughness={0.45} metalness={0.4} />
      </mesh>
      {/* Vent slots ring around the central core. */}
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const r = 0.142;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, -0.04, Math.sin(a) * r]}
            rotation={[0, -a, 0]}
          >
            <boxGeometry args={[0.004, 0.04, 0.018]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.6} />
          </mesh>
        );
      })}

      {/* Four lens pods radiating outward — each is a mini bullet head. */}
      {podPositions.map((pos, i) => {
        const yaw = podRotations[i];
        return (
          <group key={i} position={pos} rotation={[0, yaw, 0]}>
            {/* Pod housing — short cylinder with the lens on the +X end */}
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.05, 0.055, 0.08, 20]} />
              <meshStandardMaterial color={HOUSING_DARK} roughness={0.45} metalness={0.45} />
            </mesh>
            {/* Front cap */}
            <mesh rotation={[0, 0, Math.PI / 2]} position={[0.05, 0, 0]} castShadow>
              <cylinderGeometry args={[0.058, 0.058, 0.012, 20]} />
              <meshStandardMaterial color={HOUSING_MID} roughness={0.4} metalness={0.5} />
            </mesh>
            {/* Glass iris */}
            <mesh rotation={[0, 0, Math.PI / 2]} position={[0.058, 0, 0]}>
              <circleGeometry args={[0.028, 24]} />
              <meshStandardMaterial
                color={accent}
                emissive={accent}
                emissiveIntensity={emissiveIntensity * 0.8}
                roughness={0.18}
                metalness={0.5}
              />
            </mesh>
            {/* Mini IR ring (4 LED dots around the lens) */}
            {Array.from({ length: 4 }).map((_, j) => {
              const a = (j / 4) * Math.PI * 2 + Math.PI / 4;
              const r = 0.04;
              return (
                <mesh
                  key={j}
                  position={[0.057, Math.sin(a) * r, Math.cos(a) * r]}
                >
                  <sphereGeometry args={[0.005, 8, 6]} />
                  <meshStandardMaterial
                    color="#fef3c7"
                    emissive="#fde68a"
                    emissiveIntensity={0.4}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* Center status LED on the bottom face of the core. */}
      <mesh position={[0, -0.082, 0]}>
        <sphereGeometry args={[0.012, 10, 10]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {/* Brand badge on the plate edge */}
      <mesh position={[0.17, 0.026, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.09, 0.022]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.45} />
      </mesh>
    </group>
  );
}

/**
 * Fisheye / panoramic camera — flat ceiling-flush "puck" with a single
 * big center lens and a thin IR ring. Sits much closer to the ceiling
 * than a hemispheric dome (fisheye lenses don't need the dome volume).
 */
function FisheyeCamera({
  accent,
  emissiveIntensity,
}: {
  accent: string;
  emissiveIntensity: number;
}) {
  return (
    <group>
      {/* Flat puck body — thin disc flush against the ceiling. */}
      <mesh castShadow>
        <cylinderGeometry args={[0.21, 0.21, 0.05, 36]} />
        <meshStandardMaterial color={HOUSING_LIGHT} roughness={0.5} metalness={0.35} />
      </mesh>

      {/* Outer trim ring — slightly recessed for a finished bezel look. */}
      <mesh position={[0, -0.026, 0]}>
        <torusGeometry args={[0.2, 0.012, 12, 48]} />
        <meshStandardMaterial color={HOUSING_MID} roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Tamper screws — Phillips heads around the bezel */}
      {[
        [0.16, 0.026, 0], [-0.16, 0.026, 0],
        [0, 0.026, 0.16], [0, 0.026, -0.16],
      ].map((p, i) => (
        <PhillipsScrew key={i} position={p as [number, number, number]} axis="y" radius={0.011} />
      ))}

      {/* IR ring around the center lens */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.027, 0]}>
        <ringGeometry args={[0.085, 0.12, 36]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} />
      </mesh>
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const r = 0.1;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, -0.026, Math.sin(a) * r]}
          >
            <sphereGeometry args={[0.007, 10, 8]} />
            <meshStandardMaterial
              color="#fef3c7"
              emissive="#fde68a"
              emissiveIntensity={0.45}
            />
          </mesh>
        );
      })}

      {/* Big center fisheye lens — convex bulging glass. */}
      <mesh position={[0, -0.05, 0]} castShadow>
        <sphereGeometry args={[0.07, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#0a0a0a"
          transparent
          opacity={0.6}
          roughness={0.08}
          metalness={0.5}
          transmission={0.4}
          ior={1.5}
        />
      </mesh>
      {/* Center iris glow visible inside the bulge. */}
      <mesh position={[0, -0.085, 0]}>
        <sphereGeometry args={[0.035, 16, 12]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity * 0.85}
          roughness={0.2}
          metalness={0.45}
        />
      </mesh>

      {/* Status LED on the bezel edge */}
      <mesh position={[0.185, -0.025, 0]}>
        <sphereGeometry args={[0.011, 10, 10]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>

      {/* Brand badge on the bezel */}
      <mesh position={[-0.16, -0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.06, 0.018]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.45} />
      </mesh>
    </group>
  );
}

// ───────────────────────── Readers ─────────────────────────

function ReaderMesh({
  device,
  accent,
}: {
  device: ReaderDevice;
  accent: string;
}) {
  // Door-hardware + perimeter family: each subtype has its own purpose-
  // built mesh so the silhouette in 3D matches the real-world object.
  switch (device.readerType) {
    case "electric-strike":
      return <ElectricStrikeMesh accent={accent} />;
    case "mag-lock":
      return <MagLockMesh accent={accent} />;
    case "rex-button":
      return <RexButtonMesh accent={accent} />;
    case "exit-device":
      return <ExitDeviceMesh accent={accent} />;
    case "intercom":
      return <IntercomMesh accent={accent} />;
    case "power-supply":
      return <PowerSupplyMesh accent={accent} />;
    case "turnstile":
      return <TurnstileMesh accent={accent} />;
    case "bollard":
      return <BollardMesh accent={accent} />;
    case "gate-operator":
      return <GateOperatorMesh accent={accent} />;
  }

  const isBio = device.readerType === "biometric";
  const isKeypad = device.readerType === "keypad";
  // Parent (Device3D) applies yaw + tilt. This mesh draws in its local frame.
  return (
    <group>
      {/* Wall plate (raised back) */}
      <RoundedBox
        args={[0.04, 0.26, 0.18]}
        radius={0.012}
        smoothness={4}
        position={[-0.025, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color={READER_PANEL} roughness={0.55} metalness={0.25} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.55} transparent />
      </RoundedBox>
      {/* Beveled face */}
      <RoundedBox
        args={[0.03, 0.22, 0.14]}
        radius={0.01}
        smoothness={4}
        position={[0.005, 0, 0]}
      >
        <meshStandardMaterial color="#0b1220" roughness={0.5} metalness={0.4} />
      </RoundedBox>

      {/* Indicator strip (vertical) */}
      <mesh position={[0.022, 0.06, 0]}>
        <planeGeometry args={[0.08, 0.012]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.85}
          roughness={0.4}
        />
      </mesh>

      {isBio && (
        <>
          {/* Fingerprint pad (oval glass) */}
          <mesh position={[0.024, 0, 0]}>
            <sphereGeometry
              args={[0.045, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
            <meshPhysicalMaterial
              color="#1e293b"
              roughness={0.15}
              metalness={0.3}
              transmission={0.15}
            />
          </mesh>
          {/* Pad active glow */}
          <mesh position={[0.024, 0, 0]}>
            <circleGeometry args={[0.022, 24]} />
            <meshBasicMaterial color={accent} transparent opacity={0.35} />
          </mesh>
        </>
      )}

      {isKeypad && (
        <group>
          {[0, 1, 2, 3].map((row) =>
            [-0.025, 0, 0.025].map((dz) => (
              <RoundedBox
                key={`${row}-${dz}`}
                args={[0.01, 0.022, 0.022]}
                radius={0.005}
                smoothness={3}
                position={[0.022, 0.045 - row * 0.035, dz]}
              >
                <meshStandardMaterial color="#1f2937" roughness={0.5} />
              </RoundedBox>
            ))
          )}
        </group>
      )}

      {!isBio && !isKeypad && (
        <>
          {/* Card swipe area / proximity zone */}
          <RoundedBox
            args={[0.01, 0.09, 0.1]}
            radius={0.006}
            smoothness={3}
            position={[0.022, -0.045, 0]}
          >
            <meshStandardMaterial color="#0a0f1c" roughness={0.4} />
          </RoundedBox>
          {/* Inner glow when active */}
          <mesh position={[0.027, -0.045, 0]}>
            <planeGeometry args={[0.06, 0.06]} />
            <meshBasicMaterial color={accent} transparent opacity={0.2} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ───────────────────────── Sensors ─────────────────────────

function SensorMesh({
  device,
  accent,
  emissiveIntensity,
}: {
  device: SensorDevice;
  accent: string;
  emissiveIntensity: number;
}) {
  // Fire / life-safety subtypes have their own purpose-built meshes.
  if (device.sensorType === "pull-station") return <PullStationMesh accent={accent} />;
  if (device.sensorType === "facp") return <FacpMesh accent={accent} />;
  if (device.sensorType === "exit-sign") return <ExitSignMesh accent={accent} />;
  if (device.sensorType === "aed") return <AedMesh accent={accent} />;
  // Install hardware — back boxes, mounts, conduit, raceway.
  if (device.sensorType === "back-box") return <BackBoxMesh accent={accent} />;
  if (device.sensorType === "mount-bracket") return <MountBracketMesh accent={accent} />;
  if (device.sensorType === "conduit") return <ConduitMesh accent={accent} />;
  if (device.sensorType === "raceway") return <RacewayMesh accent={accent} />;

  if (device.sensorType === "motion") {
    return (
      <group>
        {/* Mounting plate */}
        <RoundedBox
          args={[0.22, 0.04, 0.22]}
          radius={0.012}
          smoothness={4}
          position={[0, -0.015, 0]}
          castShadow
        >
          <meshStandardMaterial color={PORCELAIN} roughness={0.7} />
          <Outlines thickness={0.012} color="#a8a29e" opacity={0.4} transparent />
        </RoundedBox>
        {/* PIR dome with subtle horizontal facets */}
        <mesh castShadow position={[0, 0.005, 0]}>
          <sphereGeometry args={[0.11, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#f5f5f4" roughness={0.55} />
        </mesh>
        {/* Three subtle horizontal "ribs" on the dome (typical PIR lens segmentation) */}
        {[0.7, 1.0, 1.3].map((y) => (
          <mesh key={y} position={[0, 0.005 + Math.sin(y) * 0.02, 0]}>
            <torusGeometry args={[0.105 * Math.cos(y * 0.7), 0.002, 8, 32]} />
            <meshStandardMaterial color="#d6d3d1" roughness={0.7} />
          </mesh>
        ))}
        {/* Indicator LED */}
        <mesh position={[0, -0.005, 0.107]}>
          <sphereGeometry args={[0.01, 10, 10]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      </group>
    );
  }
  if (device.sensorType === "glass-break") {
    return (
      <group>
        {/* Square plate */}
        <RoundedBox
          args={[0.04, 0.18, 0.18]}
          radius={0.012}
          smoothness={4}
          castShadow
        >
          <meshStandardMaterial color={PORCELAIN} roughness={0.65} />
          <Outlines thickness={0.012} color="#a8a29e" opacity={0.45} transparent />
        </RoundedBox>
        {/* Microphone hole */}
        <mesh position={[0.022, 0.04, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.002, 16]} />
          <meshStandardMaterial color="#1f2937" roughness={0.7} />
        </mesh>
        {/* Speaker grid (8 small holes) */}
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const r = 0.04;
          return (
            <mesh
              key={i}
              position={[0.022, -0.02 + Math.sin(a) * r, Math.cos(a) * r]}
            >
              <cylinderGeometry args={[0.006, 0.006, 0.002, 8]} />
              <meshStandardMaterial color="#374151" roughness={0.7} />
            </mesh>
          );
        })}
        {/* LED */}
        <mesh position={[0.023, -0.07, 0]}>
          <sphereGeometry args={[0.008, 8, 8]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      </group>
    );
  }
  // door-contact / smoke (small)
  return (
    <group>
      <RoundedBox args={[0.06, 0.08, 0.18]} radius={0.012} smoothness={3} castShadow>
        <meshStandardMaterial color={PORCELAIN} roughness={0.7} />
        <Outlines thickness={0.01} color="#a8a29e" opacity={0.4} transparent />
      </RoundedBox>
      <mesh position={[0.035, 0, 0]}>
        <sphereGeometry args={[0.006, 8, 8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
    </group>
  );
}

// ───────────────────────── Network ─────────────────────────

function NetworkMesh({
  device,
  accent,
  emissiveIntensity,
}: {
  device: NetworkDeviceBase;
  accent: string;
  emissiveIntensity: number;
}) {
  if (device.networkType === "access-point") {
    return (
      <group>
        {/* Flat hexagonal puck */}
        <mesh castShadow position={[0, -0.005, 0]}>
          <cylinderGeometry args={[0.18, 0.2, 0.05, 24]} />
          <meshStandardMaterial color="#f5f5f4" roughness={0.55} />
          <Outlines thickness={0.012} color="#a8a29e" opacity={0.35} transparent />
        </mesh>
        {/* Branded logo dot */}
        <mesh position={[0, -0.032, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.005, 24]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={emissiveIntensity * 0.6}
          />
        </mesh>
        {/* Ring detail */}
        <mesh position={[0, -0.028, 0]}>
          <torusGeometry args={[0.06, 0.003, 8, 32]} />
          <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.7} />
        </mesh>
      </group>
    );
  }
  if (device.networkType === "nvr") {
    return (
      <group>
        {/* 2U chassis */}
        <RoundedBox
          args={[0.5, 0.18, 0.32]}
          radius={0.018}
          smoothness={4}
          castShadow
        >
          <meshStandardMaterial color={HOUSING_MID} roughness={0.45} metalness={0.35} />
          <Outlines thickness={0.012} color={OUTLINE} opacity={0.55} transparent />
        </RoundedBox>
        {/* Front bezel plate */}
        <RoundedBox
          args={[0.46, 0.14, 0.01]}
          radius={0.01}
          smoothness={3}
          position={[0, 0, 0.165]}
        >
          <meshStandardMaterial color={HOUSING_DARK} roughness={0.5} />
        </RoundedBox>
        {/* Power LCD strip */}
        <mesh position={[0, 0.03, 0.171]}>
          <planeGeometry args={[0.22, 0.04]} />
          <meshStandardMaterial
            color="#0891B2"
            emissive="#0891B2"
            emissiveIntensity={0.6}
          />
        </mesh>
        {/* Drive bay indicators (4) */}
        {[-0.16, -0.05, 0.05, 0.16].map((x) => (
          <mesh key={x} position={[x, -0.04, 0.171]}>
            <planeGeometry args={[0.06, 0.04]} />
            <meshStandardMaterial color="#0a0f1c" />
          </mesh>
        ))}
        {[-0.16, -0.05, 0.05, 0.16].map((x) => (
          <mesh key={`led-${x}`} position={[x + 0.024, -0.04, 0.172]}>
            <sphereGeometry args={[0.005, 8, 8]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={emissiveIntensity * 0.8}
            />
          </mesh>
        ))}
      </group>
    );
  }
  // switch
  return (
    <group>
      <RoundedBox
        args={[0.5, 0.1, 0.24]}
        radius={0.014}
        smoothness={4}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_MID} roughness={0.45} metalness={0.35} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.55} transparent />
      </RoundedBox>
      {/* Port row */}
      <mesh position={[0, 0.005, 0.125]}>
        <planeGeometry args={[0.4, 0.05]} />
        <meshStandardMaterial color={GLASS} />
      </mesh>
      {/* Individual port slots (12) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const x = -0.18 + i * 0.033;
        return (
          <RoundedBox
            key={i}
            args={[0.025, 0.03, 0.005]}
            radius={0.003}
            smoothness={2}
            position={[x, 0.005, 0.128]}
          >
            <meshStandardMaterial color="#1f2937" />
          </RoundedBox>
        );
      })}
      {/* Status LEDs */}
      {[-0.18, -0.12, -0.06, 0, 0.06, 0.12, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.04, 0.126]}>
          <sphereGeometry args={[0.005, 8, 8]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={emissiveIntensity * 0.7}
          />
        </mesh>
      ))}
      {/* Brand label */}
      <mesh position={[-0.2, 0.005, 0.128]}>
        <planeGeometry args={[0.06, 0.04]} />
        <meshBasicMaterial color={POLISHED} />
      </mesh>
    </group>
  );
}

// ───────────────────────── Door Hardware ─────────────────────────
//
// These meshes share the reader's local frame (+X = "face direction"). They
// all sit on the wall at their `mountHeight`, with the wall behind at -X.

/**
 * Electric strike: stainless faceplate on the door jamb with a hinged
 * keeper cavity that releases the latch when energized.
 */
function ElectricStrikeMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Tall stainless faceplate on the jamb */}
      <RoundedBox
        args={[0.02, 0.28, 0.05]}
        radius={0.004}
        smoothness={4}
        position={[0, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#cbd5e1" roughness={0.35} metalness={0.85} />
        <Outlines thickness={0.01} color={OUTLINE} opacity={0.5} transparent />
      </RoundedBox>
      {/* Keeper cavity — the cutout where the latch sits */}
      <mesh position={[0.011, 0.005, 0]}>
        <boxGeometry args={[0.005, 0.085, 0.028]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      {/* Brass-colored ramp inside the keeper */}
      <mesh position={[0.013, -0.012, 0]} rotation={[0, 0, -0.25]}>
        <boxGeometry args={[0.003, 0.04, 0.024]} />
        <meshStandardMaterial color="#b45309" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Mounting screws (top + bottom) */}
      {[0.115, -0.115].map((dy) => (
        <mesh key={dy} position={[0.011, dy, 0]}>
          <cylinderGeometry args={[0.007, 0.007, 0.003, 12]} />
          <meshStandardMaterial color={METAL} roughness={0.3} metalness={0.9} />
        </mesh>
      ))}
      {/* Wire pigtail running out the back/top */}
      <mesh position={[-0.012, 0.13, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.004, 0.004, 0.05, 6]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>
      {/* Status LED — glows accent color when energized */}
      <mesh position={[0.012, -0.075, 0]}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Magnetic lock: long aluminum extrusion mounted across the top of the
 * door frame, with a steel armature plate that sticks to it when 24VDC
 * is applied. Visible mounting hardware + small status LED.
 */
function MagLockMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Main lock body — long horizontal extrusion */}
      <RoundedBox
        args={[0.04, 0.06, 0.34]}
        radius={0.006}
        smoothness={4}
        position={[0.02, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_MID} roughness={0.4} metalness={0.75} />
        <Outlines thickness={0.01} color={OUTLINE} opacity={0.55} transparent />
      </RoundedBox>
      {/* Heatsink ribs along the top */}
      {Array.from({ length: 5 }).map((_, i) => {
        const z = -0.13 + i * 0.065;
        return (
          <RoundedBox
            key={i}
            args={[0.005, 0.015, 0.05]}
            radius={0.001}
            smoothness={2}
            position={[0.04, 0.03, z]}
          >
            <meshStandardMaterial color={HOUSING_DARK} roughness={0.5} metalness={0.4} />
          </RoundedBox>
        );
      })}
      {/* Armature plate — what sticks to the door */}
      <RoundedBox
        args={[0.012, 0.05, 0.26]}
        radius={0.003}
        smoothness={3}
        position={[0.055, 0, 0]}
      >
        <meshStandardMaterial color="#71717a" roughness={0.45} metalness={0.85} />
      </RoundedBox>
      {/* Mounting bolts (two large hex bolts visible on the face) */}
      {[-0.13, 0.13].map((dz) => (
        <mesh key={dz} position={[0.041, 0, dz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.009, 0.009, 0.005, 6]} />
          <meshStandardMaterial color={POLISHED} roughness={0.3} metalness={0.9} />
        </mesh>
      ))}
      {/* Power LED — small bright dot on the face */}
      <mesh position={[0.041, 0.015, 0.155]}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.0} />
      </mesh>
    </group>
  );
}

/**
 * Request-to-exit button: stainless single-gang plate with a mushroom-style
 * push button labeled "EXIT". Wall-mounted at ~1.1m next to the door.
 */
function RexButtonMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Stainless single-gang plate */}
      <RoundedBox
        args={[0.015, 0.12, 0.08]}
        radius={0.004}
        smoothness={3}
        castShadow
      >
        <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.8} />
        <Outlines thickness={0.01} color={OUTLINE} opacity={0.5} transparent />
      </RoundedBox>
      {/* Mounting screws (4 corners) */}
      {[
        [0.008, 0.05, 0.032],
        [0.008, -0.05, 0.032],
        [0.008, 0.05, -0.032],
        [0.008, -0.05, -0.032],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <cylinderGeometry args={[0.004, 0.004, 0.002, 8]} />
          <meshStandardMaterial color={METAL} roughness={0.3} metalness={0.9} />
        </mesh>
      ))}
      {/* Mushroom button — convex top */}
      <mesh
        position={[0.018, 0.012, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.024, 0.026, 0.012, 24]} />
        <meshStandardMaterial color="#16a34a" roughness={0.55} metalness={0.25} />
      </mesh>
      {/* Glossy top dome on the button */}
      <mesh position={[0.026, 0.012, 0]}>
        <sphereGeometry args={[0.022, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
        <meshPhysicalMaterial
          color="#22c55e"
          roughness={0.18}
          metalness={0.15}
          clearcoat={0.7}
          clearcoatRoughness={0.1}
        />
      </mesh>
      {/* "EXIT" label patch on the plate below the button */}
      <mesh position={[0.009, -0.03, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.04, 0.012]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>
      {/* Indicator LED */}
      <mesh position={[0.009, -0.05, 0.018]}>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Exit device / crash bar: long horizontal pressure bar mounted across the
 * inside face of an egress door. Touch the bar → latch retracts → door
 * opens. We render the chassis + the pressure bar + a small dogging hex.
 */
function ExitDeviceMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Wall/door plate behind the chassis */}
      <RoundedBox
        args={[0.012, 0.06, 0.6]}
        radius={0.003}
        smoothness={3}
        position={[-0.006, 0, 0]}
      >
        <meshStandardMaterial color={HOUSING_DARK} roughness={0.5} metalness={0.45} />
      </RoundedBox>
      {/* End caps — the two black housings at each end of the bar */}
      {[-0.27, 0.27].map((dz) => (
        <RoundedBox
          key={dz}
          args={[0.05, 0.075, 0.08]}
          radius={0.008}
          smoothness={3}
          position={[0.025, 0, dz]}
          castShadow
        >
          <meshStandardMaterial color="#27272a" roughness={0.45} metalness={0.55} />
          <Outlines thickness={0.008} color={OUTLINE} opacity={0.45} transparent />
        </RoundedBox>
      ))}
      {/* Pressure bar — main rounded horizontal tube */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0.04, 0, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.5, 18]} />
        <meshStandardMaterial color="#a8a29e" roughness={0.4} metalness={0.7} />
      </mesh>
      {/* "PUSH" label patch on the bar */}
      <mesh position={[0.058, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.18, 0.018]} />
        <meshStandardMaterial color="#e7e5e4" roughness={0.55} />
      </mesh>
      {/* Dogging hex (allows the bar to be held depressed for free egress) */}
      <mesh position={[0.05, 0, 0.27]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.005, 6]} />
        <meshStandardMaterial color={POLISHED} roughness={0.3} metalness={0.9} />
      </mesh>
      {/* Status LED — bright dot on the right end cap */}
      <mesh position={[0.052, 0.025, 0.27]}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.95} />
      </mesh>
    </group>
  );
}

/**
 * Video intercom / door station: vertical aluminum face with a small wide
 * camera lens, a speaker grille, and a single call button. Reads as a
 * "doorbell with a camera" at a glance.
 */
function IntercomMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Recessed back box behind the face */}
      <RoundedBox
        args={[0.025, 0.3, 0.13]}
        radius={0.006}
        smoothness={3}
        position={[-0.012, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#1f2937" roughness={0.55} metalness={0.4} />
      </RoundedBox>
      {/* Brushed aluminum face plate */}
      <RoundedBox
        args={[0.012, 0.28, 0.12]}
        radius={0.008}
        smoothness={3}
        position={[0.008, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#cbd5e1" roughness={0.35} metalness={0.85} />
        <Outlines thickness={0.01} color={OUTLINE} opacity={0.55} transparent />
      </RoundedBox>
      {/* Camera lens housing — small black dome near the top */}
      <mesh position={[0.014, 0.1, 0]}>
        <sphereGeometry
          args={[0.02, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]}
        />
        <meshPhysicalMaterial
          color="#0a0a0a"
          roughness={0.12}
          metalness={0.5}
          transmission={0.25}
        />
      </mesh>
      {/* Lens center iris */}
      <mesh position={[0.018, 0.1, 0]}>
        <circleGeometry args={[0.008, 16]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} />
      </mesh>
      {/* Speaker grille — small holes in a rectangular grid */}
      {Array.from({ length: 6 }).map((_, i) =>
        Array.from({ length: 3 }).map((_, j) => (
          <mesh
            key={`${i}-${j}`}
            position={[
              0.014,
              0.04 - i * 0.012,
              -0.025 + j * 0.025,
            ]}
          >
            <cylinderGeometry args={[0.0035, 0.0035, 0.003, 8]} />
            <meshStandardMaterial color="#1f2937" roughness={0.7} />
          </mesh>
        )),
      )}
      {/* Big round call button near the bottom */}
      <mesh position={[0.014, -0.08, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.022, 0.024, 0.008, 24]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0.019, -0.08, 0]}>
        <circleGeometry args={[0.015, 16]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.5}
          roughness={0.3}
        />
      </mesh>
      {/* Mic pinhole below the lens */}
      <mesh position={[0.014, 0.062, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 0.003, 10]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.7} />
      </mesh>
    </group>
  );
}

/**
 * Access-control power supply: metal enclosure mounted in an electrical
 * room or above the ceiling. Shows the front cover with status LEDs and
 * a small key lock — the kind of box every access install needs.
 */
function PowerSupplyMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Steel enclosure */}
      <RoundedBox
        args={[0.14, 0.34, 0.26]}
        radius={0.008}
        smoothness={3}
        castShadow
      >
        <meshStandardMaterial color="#9ca3af" roughness={0.5} metalness={0.7} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.55} transparent />
      </RoundedBox>
      {/* Door seam down the right side */}
      <mesh position={[0.072, 0, 0]}>
        <boxGeometry args={[0.002, 0.3, 0.004]} />
        <meshStandardMaterial color="#4b5563" roughness={0.7} />
      </mesh>
      {/* Key lock cylinder */}
      <mesh position={[0.075, 0.13, 0.06]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.012, 16]} />
        <meshStandardMaterial color={POLISHED} roughness={0.25} metalness={0.9} />
      </mesh>
      {/* Knockouts on the top — punch-outs for conduit */}
      {[-0.05, 0, 0.05].map((dz) => (
        <mesh key={dz} position={[0, 0.171, dz]}>
          <cylinderGeometry args={[0.012, 0.012, 0.003, 16]} />
          <meshStandardMaterial color="#6b7280" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      {/* Status LEDs along the bottom of the door — AC OK / DC OK / Battery / Fault */}
      {[-0.045, -0.015, 0.015, 0.045].map((dz, i) => (
        <group key={dz}>
          <mesh position={[0.073, -0.12, dz]}>
            <cylinderGeometry args={[0.005, 0.005, 0.003, 12]} />
            <meshStandardMaterial color="#1f2937" roughness={0.6} />
          </mesh>
          <mesh position={[0.076, -0.12, dz]}>
            <sphereGeometry args={[0.0035, 8, 8]} />
            <meshStandardMaterial
              color={i === 3 ? "#ef4444" : accent}
              emissive={i === 3 ? "#ef4444" : accent}
              emissiveIntensity={i === 3 ? 0.35 : 0.9}
            />
          </mesh>
        </group>
      ))}
      {/* Manufacturer label patch */}
      <mesh position={[0.072, 0.05, -0.04]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.07, 0.04]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ───────────────────────── Perimeter ─────────────────────────

/**
 * Optical turnstile: two parallel pedestals with swing barriers that
 * pivot to open. Renders as two satin-stainless cabinets with a glass
 * top, plus card-reader pads at the entry end.
 */
function TurnstileMesh({ accent }: { accent: string }) {
  const pedestal = (zOffset: number) => (
    <group position={[0, 0, zOffset]}>
      {/* Main cabinet — long stainless box */}
      <RoundedBox
        args={[0.16, 1.0, 0.18]}
        radius={0.012}
        smoothness={3}
        position={[0, -0.5, 0]}
        castShadow
      >
        <meshStandardMaterial color="#cbd5e1" roughness={0.35} metalness={0.85} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.45} transparent />
      </RoundedBox>
      {/* Frosted glass top panel */}
      <RoundedBox
        args={[0.16, 0.015, 0.18]}
        radius={0.006}
        smoothness={3}
        position={[0, 0.0, 0]}
      >
        <meshPhysicalMaterial
          color="#e0f2fe"
          roughness={0.25}
          transmission={0.35}
          metalness={0.1}
        />
      </RoundedBox>
      {/* Swing barrier — translucent acrylic wing */}
      <RoundedBox
        args={[0.005, 0.55, 0.5]}
        radius={0.003}
        smoothness={3}
        position={[0, -0.3, 0.28]}
      >
        <meshPhysicalMaterial
          color="#bae6fd"
          roughness={0.15}
          transmission={0.55}
          metalness={0.2}
        />
      </RoundedBox>
      {/* Card-reader pad on the entry end (the top face nearest the user) */}
      <mesh position={[0.08, 0.005, -0.05]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.004, 24]} />
        <meshStandardMaterial color="#0a0f1c" roughness={0.55} metalness={0.3} />
      </mesh>
      {/* Indicator strip along the top showing pass/deny */}
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[0.14, 0.003, 0.14]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.7}
        />
      </mesh>
    </group>
  );
  return (
    <group>
      {pedestal(-0.32)}
      {pedestal(0.32)}
      {/* Floor inset between the two pedestals (the walking path) */}
      <mesh position={[0, -0.998, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, 0.45]} />
        <meshStandardMaterial color="#27272a" roughness={0.7} />
      </mesh>
    </group>
  );
}

/**
 * Security bollard: short steel cylinder rising from the pavement, with a
 * domed cap and a reflective stripe near the top. K-rated bollards are
 * deceptively simple but unmistakable in 3D.
 */
function BollardMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Concrete base flange — small disc embedded in the pavement */}
      <mesh position={[0, -0.005, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.02, 32]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.85} />
      </mesh>
      {/* Main bollard column */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.09, 0.9, 32]} />
        <meshStandardMaterial color="#52525b" roughness={0.55} metalness={0.6} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.5} transparent />
      </mesh>
      {/* Domed steel cap */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <sphereGeometry args={[0.085, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* High-vis reflective stripe near the top */}
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.088, 0.088, 0.06, 32]} />
        <meshStandardMaterial
          color="#fde047"
          emissive="#facc15"
          emissiveIntensity={0.45}
          roughness={0.35}
        />
      </mesh>
      {/* Brand/inspection placard — small dark plate near the base */}
      <mesh position={[0.092, 0.18, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.05, 0.05]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      {/* Tiny accent LED on the cap edge — pulses if integrated with alarm */}
      <mesh position={[0.07, 0.86, 0]}>
        <sphereGeometry args={[0.006, 8, 8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.85}
        />
      </mesh>
    </group>
  );
}

/**
 * Swing gate operator: arm-style motor housing that mounts on a pier and
 * pushes the gate leaf. Renders as a horizontal arm with a motor cube
 * and a visible pivot point.
 */
function GateOperatorMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Mounting pier — concrete/steel block on the ground */}
      <RoundedBox
        args={[0.16, 0.35, 0.16]}
        radius={0.012}
        smoothness={3}
        position={[0, 0.18, 0]}
        castShadow
      >
        <meshStandardMaterial color="#71717a" roughness={0.75} />
      </RoundedBox>
      {/* Motor housing — boxy enclosure on top of the pier */}
      <RoundedBox
        args={[0.2, 0.12, 0.18]}
        radius={0.012}
        smoothness={3}
        position={[0.04, 0.42, 0]}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_DARK} roughness={0.5} metalness={0.5} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.5} transparent />
      </RoundedBox>
      {/* Cooling vent slots on the side */}
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh key={i} position={[0.105, 0.42, -0.04 + i * 0.025]}>
          <boxGeometry args={[0.005, 0.04, 0.005]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.7} />
        </mesh>
      ))}
      {/* Pivot pin where the arm joins the motor */}
      <mesh position={[0.16, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.04, 18]} />
        <meshStandardMaterial color={POLISHED} roughness={0.3} metalness={0.92} />
      </mesh>
      {/* Linear arm extending toward the gate */}
      <RoundedBox
        args={[0.55, 0.05, 0.06]}
        radius={0.01}
        smoothness={3}
        position={[0.45, 0.42, 0]}
        castShadow
      >
        <meshStandardMaterial color={HOUSING_MID} roughness={0.5} metalness={0.55} />
      </RoundedBox>
      {/* Bracket clamp at the end of the arm (where it grabs the gate) */}
      <RoundedBox
        args={[0.04, 0.1, 0.1]}
        radius={0.008}
        smoothness={3}
        position={[0.74, 0.42, 0]}
      >
        <meshStandardMaterial color={POLISHED} roughness={0.35} metalness={0.85} />
      </RoundedBox>
      {/* Status LED on the motor face */}
      <mesh position={[-0.06, 0.46, 0.091]}>
        <sphereGeometry args={[0.006, 8, 8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.9}
        />
      </mesh>
      {/* Conduit running down the back of the pier */}
      <mesh position={[-0.078, 0.18, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.36, 8]} />
        <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  );
}

// ───────────────────────── Fire / Life Safety ─────────────────────────

/**
 * Manual fire pull station: red plastic box on the wall with a vertical
 * pull handle and "FIRE" lettering. The mesh emphasizes the iconic
 * silhouette so it scans as a pull station from across the floor.
 */
function PullStationMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Recessed back-box behind the face */}
      <RoundedBox
        args={[0.025, 0.18, 0.12]}
        radius={0.006}
        smoothness={3}
        position={[-0.012, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#7f1d1d" roughness={0.55} />
      </RoundedBox>
      {/* Red front face */}
      <RoundedBox
        args={[0.012, 0.16, 0.1]}
        radius={0.008}
        smoothness={3}
        position={[0.008, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.1} />
        <Outlines thickness={0.01} color="#7f1d1d" opacity={0.5} transparent />
      </RoundedBox>
      {/* White "FIRE" label band */}
      <mesh position={[0.014, 0.05, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.08, 0.025]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.6} />
      </mesh>
      {/* Pull handle — vertical white bar */}
      <RoundedBox
        args={[0.012, 0.075, 0.022]}
        radius={0.004}
        smoothness={3}
        position={[0.022, -0.012, 0]}
      >
        <meshStandardMaterial color="#f8fafc" roughness={0.4} metalness={0.2} />
      </RoundedBox>
      {/* Black arrow indicator pointing down on the handle */}
      <mesh position={[0.029, -0.012, 0]}>
        <boxGeometry args={[0.002, 0.04, 0.012]} />
        <meshStandardMaterial color="#111827" roughness={0.7} />
      </mesh>
      {/* Status LED — addressable models have one */}
      <mesh position={[0.014, -0.06, 0.03]}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Fire alarm control panel (FACP): wall-mount cabinet with a small LCD
 * display, status LEDs, and an access door. The hero artifact in any
 * fire-life-safety bid.
 */
function FacpMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Steel enclosure */}
      <RoundedBox
        args={[0.1, 0.5, 0.36]}
        radius={0.008}
        smoothness={3}
        position={[0, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.25} />
        <Outlines thickness={0.012} color="#7f1d1d" opacity={0.55} transparent />
      </RoundedBox>
      {/* Door seam down the right side */}
      <mesh position={[0.052, 0, 0]}>
        <boxGeometry args={[0.003, 0.45, 0.004]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.7} />
      </mesh>
      {/* Key lock cylinder */}
      <mesh position={[0.055, 0.2, 0.13]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.012, 16]} />
        <meshStandardMaterial color={POLISHED} roughness={0.25} metalness={0.9} />
      </mesh>
      {/* LCD display — the iconic blue screen */}
      <mesh position={[0.053, 0.1, 0]}>
        <planeGeometry args={[0.18, 0.07]} />
        <meshStandardMaterial color="#1e40af" emissive="#1e40af" emissiveIntensity={0.55} />
      </mesh>
      {/* Display bezel */}
      <RoundedBox
        args={[0.004, 0.085, 0.2]}
        radius={0.003}
        smoothness={2}
        position={[0.052, 0.1, 0]}
      >
        <meshStandardMaterial color="#1f2937" roughness={0.6} />
      </RoundedBox>
      {/* Status LED column — Alarm / Trouble / Supervisory / Silence */}
      {[
        { y: 0.0, color: "#ef4444", label: "Alarm" },
        { y: -0.04, color: "#f59e0b", label: "Trouble" },
        { y: -0.08, color: "#facc15", label: "Supervisory" },
        { y: -0.12, color: accent, label: "AC" },
      ].map((l, i) => (
        <group key={i}>
          <mesh position={[0.053, l.y, -0.08]}>
            <sphereGeometry args={[0.005, 8, 8]} />
            <meshStandardMaterial
              color={l.color}
              emissive={l.color}
              emissiveIntensity={i === 3 ? 0.95 : 0.25}
            />
          </mesh>
          {/* Label strip next to each LED */}
          <mesh position={[0.053, l.y, -0.045]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.06, 0.012]} />
            <meshStandardMaterial color="#f3f4f6" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* Keypad grid — 4×3 buttons */}
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2].map((col) => (
          <RoundedBox
            key={`${row}-${col}`}
            args={[0.004, 0.018, 0.022]}
            radius={0.003}
            smoothness={2}
            position={[0.053, -0.16 - row * 0.026, -0.05 + col * 0.028]}
          >
            <meshStandardMaterial color="#1f2937" roughness={0.55} />
          </RoundedBox>
        )),
      )}
    </group>
  );
}

/**
 * Exit sign: edge-lit "EXIT" sign mounted near a doorway or hung from the
 * ceiling. Bright red lettering on a slim acrylic panel.
 */
function ExitSignMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Slim back box (where the LEDs + battery live) */}
      <RoundedBox
        args={[0.04, 0.12, 0.28]}
        radius={0.006}
        smoothness={3}
        position={[-0.02, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#e7e5e4" roughness={0.6} />
        <Outlines thickness={0.01} color={OUTLINE} opacity={0.45} transparent />
      </RoundedBox>
      {/* Acrylic face panel */}
      <RoundedBox
        args={[0.012, 0.1, 0.26]}
        radius={0.006}
        smoothness={3}
        position={[0.006, 0, 0]}
      >
        <meshPhysicalMaterial
          color="#fef2f2"
          roughness={0.2}
          transmission={0.3}
          metalness={0.05}
        />
      </RoundedBox>
      {/* Red "EXIT" panel — the glowing front lettering */}
      <mesh position={[0.013, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.24, 0.08]} />
        <meshStandardMaterial
          color="#dc2626"
          emissive="#ef4444"
          emissiveIntensity={1.1}
          roughness={0.35}
        />
      </mesh>
      {/* Two black "EXIT" letter rectangles — silhouette of the lettering */}
      {[-0.06, 0.06].map((dz, i) => (
        <mesh key={i} position={[0.014, 0, dz]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.08, 0.06]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.6} />
        </mesh>
      ))}
      {/* Two emergency-light heads pop out the bottom (combo unit) */}
      {[-0.07, 0.07].map((dz, i) => (
        <mesh key={i} position={[0.01, -0.07, dz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.018, 0.022, 0.025, 18]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.55} metalness={0.4} />
        </mesh>
      ))}
      {/* Test button — small green dot */}
      <mesh position={[0.013, -0.05, 0.115]}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.75} />
      </mesh>
    </group>
  );
}

/**
 * AED cabinet: white wall cabinet with a glass-fronted door, the
 * unmistakable green heart-and-lightning AED symbol, and an alarm
 * trim around the perimeter.
 */
function AedMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Cabinet body */}
      <RoundedBox
        args={[0.13, 0.34, 0.3]}
        radius={0.012}
        smoothness={3}
        position={[0, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#f8fafc" roughness={0.55} />
        <Outlines thickness={0.012} color={OUTLINE} opacity={0.5} transparent />
      </RoundedBox>
      {/* Red alarm border trim around the front */}
      <mesh position={[0.067, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.3, 0.34]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} />
      </mesh>
      {/* Glass door inside the red trim */}
      <RoundedBox
        args={[0.005, 0.28, 0.24]}
        radius={0.006}
        smoothness={3}
        position={[0.07, 0, 0]}
      >
        <meshPhysicalMaterial
          color="#dbeafe"
          roughness={0.1}
          transmission={0.6}
          metalness={0.2}
        />
      </RoundedBox>
      {/* The AED inside (a glimpse of the device through the glass) */}
      <RoundedBox
        args={[0.012, 0.18, 0.16]}
        radius={0.012}
        smoothness={3}
        position={[0.06, -0.02, 0]}
      >
        <meshStandardMaterial color="#16a34a" roughness={0.55} metalness={0.15} />
      </RoundedBox>
      {/* Heart-+-lightning symbol patch on the door (green on white) */}
      <mesh position={[0.073, 0.12, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.06, 0.05]} />
        <meshStandardMaterial color="#16a34a" roughness={0.55} />
      </mesh>
      {/* Door handle */}
      <mesh position={[0.073, -0.12, -0.08]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.04, 14]} />
        <meshStandardMaterial color={POLISHED} roughness={0.3} metalness={0.9} />
      </mesh>
      {/* Alarm strobe LED on the top trim */}
      <mesh position={[0.073, 0.17, 0]}>
        <sphereGeometry args={[0.008, 10, 10]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.95} />
      </mesh>
    </group>
  );
}

// ───────────────────────── Install Hardware ─────────────────────────
//
// Simple but recognizable meshes for the rough-in / mounting items GCs
// and electricians spec. Each is small (geometry-budget friendly) and
// gets a brushed-steel finish so they scan as "install hardware" rather
// than a device.

/**
 * Electrical back box: drawn-steel rectangular box, slightly recessed
 * into the wall surface, with a knock-out punch on the side.
 */
function BackBoxMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Main box body */}
      <RoundedBox
        args={[0.06, 0.115, 0.075]}
        radius={0.004}
        smoothness={3}
        position={[0, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#6b7280" roughness={0.55} metalness={0.7} />
        <Outlines thickness={0.008} color={OUTLINE} opacity={0.55} transparent />
      </RoundedBox>
      {/* Mounting tabs on top and bottom */}
      {[0.058, -0.058].map((dy) => (
        <RoundedBox
          key={dy}
          args={[0.012, 0.005, 0.045]}
          radius={0.002}
          smoothness={2}
          position={[0.005, dy, 0]}
        >
          <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.6} />
        </RoundedBox>
      ))}
      {/* Knock-out punch on the back */}
      <mesh position={[-0.031, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 0.002, 14]} />
        <meshStandardMaterial color="#374151" roughness={0.55} />
      </mesh>
      {/* Small accent dot indicating "tagged" / surveyed */}
      <mesh position={[0.031, -0.04, 0.02]}>
        <sphereGeometry args={[0.0035, 8, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

/**
 * Universal wall-arm mounting bracket: stainless arm extending from the
 * wall with a pivot ring at the end where a camera housing would attach.
 */
function MountBracketMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Wall plate */}
      <RoundedBox
        args={[0.025, 0.14, 0.14]}
        radius={0.006}
        smoothness={3}
        position={[-0.012, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#cbd5e1" roughness={0.4} metalness={0.85} />
        <Outlines thickness={0.008} color={OUTLINE} opacity={0.5} transparent />
      </RoundedBox>
      {/* Four corner mount screws */}
      {[
        [-0.001, 0.052, 0.052], [-0.001, -0.052, 0.052],
        [-0.001, 0.052, -0.052], [-0.001, -0.052, -0.052],
      ].map((p, i) => (
        <PhillipsScrew key={i} position={p as [number, number, number]} axis="x" radius={0.008} height={0.003} />
      ))}
      {/* Arm extending forward */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.08, 0, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.18, 14]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.85} />
      </mesh>
      {/* Pivot ring at the end (where the camera attaches) */}
      <mesh position={[0.18, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.025, 20]} />
        <meshStandardMaterial color="#64748b" roughness={0.45} metalness={0.8} />
      </mesh>
      {/* Pivot lock bolt on top of the ring */}
      <mesh position={[0.18, 0.035, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.012, 6]} />
        <meshStandardMaterial color={POLISHED} roughness={0.3} metalness={0.92} />
      </mesh>
      {/* Spec sticker on the arm */}
      <mesh position={[0.085, -0.018, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, 0.014]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} roughness={0.55} />
      </mesh>
    </group>
  );
}

/**
 * Conduit run: a section of EMT (or flex) conduit lying along the
 * surface. Shown as a single straight pipe with two compression fittings
 * on each end so it reads as a conduit, not a generic cylinder.
 */
function ConduitMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Main conduit body */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.6, 18]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.4} metalness={0.85} />
      </mesh>
      {/* Compression fittings (hex collars) at each end */}
      {[-0.28, 0.28].map((dx) => (
        <mesh key={dx} rotation={[0, 0, Math.PI / 2]} position={[dx, 0, 0]}>
          <cylinderGeometry args={[0.024, 0.024, 0.025, 6]} />
          <meshStandardMaterial color={POLISHED} roughness={0.3} metalness={0.9} />
        </mesh>
      ))}
      {/* Two strap clamps holding it to the surface */}
      {[-0.12, 0.12].map((dx) => (
        <group key={dx} position={[dx, -0.012, 0]}>
          <mesh>
            <torusGeometry args={[0.022, 0.0025, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#52525b" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.024, 0]}>
            <boxGeometry args={[0.055, 0.005, 0.012]} />
            <meshStandardMaterial color="#52525b" roughness={0.55} metalness={0.5} />
          </mesh>
        </group>
      ))}
      {/* Spec label */}
      <mesh position={[0, 0.02, 0]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.06, 0.012]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}

/**
 * Surface raceway: low-profile rectangular channel that mounts to a wall
 * and carries cabling without fishing. Has a snap-on cover.
 */
function RacewayMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Base channel */}
      <RoundedBox
        args={[0.022, 0.024, 0.6]}
        radius={0.003}
        smoothness={3}
        position={[-0.005, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#f5f5f4" roughness={0.55} />
        <Outlines thickness={0.006} color="#a8a29e" opacity={0.5} transparent />
      </RoundedBox>
      {/* Snap-on cover (slightly proud of the base) */}
      <RoundedBox
        args={[0.014, 0.02, 0.6]}
        radius={0.003}
        smoothness={3}
        position={[0.012, 0, 0]}
      >
        <meshStandardMaterial color="#e7e5e4" roughness={0.5} />
      </RoundedBox>
      {/* Hint of cabling visible inside one end where the cover lifts */}
      <mesh position={[0.002, 0, -0.27]}>
        <boxGeometry args={[0.012, 0.014, 0.04]} />
        <meshStandardMaterial color="#1e3a8a" roughness={0.6} />
      </mesh>
      {/* Mounting screws spaced along the length */}
      {[-0.22, -0.07, 0.07, 0.22].map((dz, i) => (
        <PhillipsScrew
          key={i}
          position={[-0.016, 0, dz]}
          axis="x"
          radius={0.005}
          height={0.0025}
        />
      ))}
      {/* Tiny accent dot near one end */}
      <mesh position={[0.02, 0, 0.26]}>
        <sphereGeometry args={[0.0035, 8, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}
