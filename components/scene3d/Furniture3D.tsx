"use client";

import { useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { FurnitureItem } from "@/types/design";

/**
 * High-detail furniture meshes for DeeperVision. Each piece is rendered
 * in the parent's local frame where +X is the piece's long axis. The
 * outer Furniture3D component handles world placement + rotation + scale
 * so the per-piece meshes can be authored at "unit" dimensions (the
 * default lengthM/widthM from FURNITURE_DEFAULTS) and stretched.
 *
 * Each piece is composed of multiple meshes — wood + metal + fabric +
 * accent colors — so they read as real objects from any orbit angle,
 * not as primitive boxes.
 */

// Shared material palette — picked to harmonize with the Japanese-warm
// scene palette (cream walls, light oak floors).
const WOOD_LIGHT = "#c89a6b"; // sand-oak top
const WOOD_MID = "#8a6234"; // walnut accents
const WOOD_DARK = "#3e2a1a"; // dark walnut feet / column
const FABRIC_DARK = "#374151"; // charcoal upholstery
const FABRIC_WARM = "#a08562"; // tan upholstery
const FABRIC_CREAM = "#f1ead9"; // off-white pillows
const METAL_BRUSHED = "#9aa3ad"; // brushed aluminum
const METAL_CHROME = "#dfe3e8"; // chrome
const METAL_DARK = "#2a2f36"; // black powdercoat
const GLASS_DARK = "#1f2937"; // monitor screen / table cutout
const MARBLE = "#e8e4dc"; // marble countertop base
const MARBLE_VEIN = "#c9c2b6"; // marble vein color
const ACCENT_GREEN = "#5b8260"; // plant / accent

interface Furniture3DProps {
  item: FurnitureItem;
  /** Pixels-per-meter for converting `item.position` to world meters. */
  scale: number;
  selected?: boolean;
  onSelect?: () => void;
}

export function Furniture3D({ item, scale, selected, onSelect }: Furniture3DProps) {
  // World position from floor-plan pixel coords. Y is up; floor at 0.
  const px = item.position.x / scale;
  const pz = item.position.y / scale;

  // Each mesh is authored at the piece type's DEFAULT lengthM/widthM,
  // then scaled to the user's actual dimensions via a group transform.
  // This keeps mesh details (legs, screws, monitor) at consistent
  // proportions even if the user resizes the footprint.
  const defaultDims = DEFAULT_DIMS[item.type];
  const sx = item.lengthM / defaultDims.lengthM;
  const sz = item.widthM / defaultDims.widthM;

  return (
    <group
      position={[px, 0, pz]}
      rotation={[0, -item.rotation, 0]}
      onPointerDown={
        onSelect
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
    >
      <group scale={[sx, 1, sz]}>{renderMesh(item.type)}</group>
      {/* Subtle selection ring on the floor */}
      {selected && (
        <mesh
          position={[0, 0.005, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <ringGeometry args={[
            Math.max(item.lengthM, item.widthM) * 0.55,
            Math.max(item.lengthM, item.widthM) * 0.6,
            32,
          ]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

const DEFAULT_DIMS: Record<FurnitureItem["type"], { lengthM: number; widthM: number }> = {
  desk: { lengthM: 1.5, widthM: 0.75 },
  chair: { lengthM: 0.6, widthM: 0.6 },
  "conference-table": { lengthM: 3.0, widthM: 1.2 },
  "kitchen-island": { lengthM: 2.4, widthM: 1.0 },
  sofa: { lengthM: 2.2, widthM: 0.95 },
  toilet: { lengthM: 0.7, widthM: 0.42 },
  sink: { lengthM: 0.6, widthM: 0.5 },
  refrigerator: { lengthM: 0.85, widthM: 0.72 },
  bed: { lengthM: 2.0, widthM: 1.5 },
  bookshelf: { lengthM: 1.0, widthM: 0.35 },
  "tv-display": { lengthM: 1.4, widthM: 0.1 },
};

function renderMesh(type: FurnitureItem["type"]) {
  switch (type) {
    case "desk":
      return <Desk />;
    case "chair":
      return <Chair />;
    case "conference-table":
      return <ConferenceTable />;
    case "kitchen-island":
      return <KitchenIsland />;
    case "sofa":
      return <Sofa />;
    case "toilet":
      return <Toilet />;
    case "sink":
      return <Sink />;
    case "refrigerator":
      return <Refrigerator />;
    case "bed":
      return <Bed />;
    case "bookshelf":
      return <Bookshelf />;
    case "tv-display":
      return <TvDisplay />;
  }
}

// ─────────────────────────────────────────────────────────────────
// DESK — sand-oak top, four black metal legs, monitor, keyboard, cable
// grommet hole. Sized 1.5 × 0.75 m × 0.74 m tall (standard desk).
// ─────────────────────────────────────────────────────────────────
function Desk() {
  return (
    <group>
      {/* Top — solid wood plank with a slight bevel via RoundedBox. */}
      <RoundedBox
        args={[1.5, 0.04, 0.75]}
        radius={0.008}
        smoothness={3}
        position={[0, 0.72, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={WOOD_LIGHT} roughness={0.55} metalness={0.05} />
      </RoundedBox>
      {/* Cable grommet — small dark circle near the back-right corner */}
      <mesh position={[0.45, 0.741, -0.25]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.035, 0.045, 18]} />
        <meshStandardMaterial color={METAL_DARK} />
      </mesh>
      <mesh position={[0.45, 0.74, -0.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.035, 18]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>

      {/* Four legs — square black tube */}
      {[
        [-0.7, -0.32],
        [0.7, -0.32],
        [-0.7, 0.32],
        [0.7, 0.32],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.36, z]} castShadow>
          <boxGeometry args={[0.04, 0.7, 0.04]} />
          <meshStandardMaterial color={METAL_DARK} roughness={0.4} metalness={0.55} />
        </mesh>
      ))}

      {/* Foot pads — slightly wider square base under each leg */}
      {[
        [-0.7, -0.32],
        [0.7, -0.32],
        [-0.7, 0.32],
        [0.7, 0.32],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.015, z]}>
          <boxGeometry args={[0.06, 0.03, 0.06]} />
          <meshStandardMaterial color="#1a1d22" roughness={0.7} />
        </mesh>
      ))}

      {/* Modesty panel — thin board at the back */}
      <mesh position={[0, 0.5, -0.36]} castShadow>
        <boxGeometry args={[1.38, 0.4, 0.012]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.65} />
      </mesh>

      {/* Monitor — stand + screen, centered toward the back */}
      <mesh position={[0, 0.78, -0.18]} castShadow>
        <boxGeometry args={[0.04, 0.08, 0.04]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.45} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.82, -0.18]}>
        <cylinderGeometry args={[0.03, 0.04, 0.02, 16]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.45} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.05, -0.16]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.62, 0.36, 0.02]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.55} />
      </mesh>
      {/* Screen glow patch — emissive dark blue */}
      <mesh position={[0, 1.05, -0.149]} rotation={[0.08, 0, 0]} raycast={() => null}>
        <planeGeometry args={[0.58, 0.32]} />
        <meshStandardMaterial
          color="#1e3a8a"
          emissive="#1e40af"
          emissiveIntensity={0.35}
          roughness={0.3}
        />
      </mesh>

      {/* Keyboard — slim black slab in front of monitor */}
      <mesh position={[0, 0.745, 0.1]} castShadow>
        <boxGeometry args={[0.45, 0.012, 0.14]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.55} metalness={0.4} />
      </mesh>
      {/* Mouse — tiny dome */}
      <mesh position={[0.3, 0.748, 0.1]} castShadow>
        <sphereGeometry args={[0.03, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Coffee mug — small white cylinder */}
      <mesh position={[-0.5, 0.79, 0.05]} castShadow>
        <cylinderGeometry args={[0.04, 0.045, 0.1, 18]} />
        <meshStandardMaterial color={FABRIC_CREAM} roughness={0.5} />
      </mesh>
      <mesh position={[-0.5, 0.84, 0.05]} raycast={() => null}>
        <cylinderGeometry args={[0.038, 0.038, 0.01, 18]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// CHAIR — ergonomic office chair: 5-star base with casters, gas
// cylinder, padded seat, mesh back, armrests. ~0.6 × 0.6 m × 0.9 m
// tall when seat is at typical height.
// ─────────────────────────────────────────────────────────────────
function Chair() {
  return (
    <group>
      {/* 5-star base — five small arms radiating out */}
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2;
        const len = 0.28;
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[len / 2, 0.04, 0]} castShadow>
              <boxGeometry args={[len, 0.04, 0.04]} />
              <meshStandardMaterial color={METAL_DARK} roughness={0.5} metalness={0.6} />
            </mesh>
            {/* Caster wheel at the end */}
            <mesh position={[len, 0.03, 0]} castShadow>
              <sphereGeometry args={[0.03, 12, 10]} />
              <meshStandardMaterial color="#1a1d22" roughness={0.5} metalness={0.3} />
            </mesh>
          </group>
        );
      })}

      {/* Gas cylinder — vertical chrome shaft */}
      <mesh position={[0, 0.27, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.42, 14]} />
        <meshStandardMaterial color={METAL_CHROME} roughness={0.3} metalness={0.85} />
      </mesh>
      {/* Mechanism box under the seat */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[0.18, 0.06, 0.18]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Seat cushion — rounded rectangle */}
      <RoundedBox
        args={[0.5, 0.08, 0.5]}
        radius={0.04}
        smoothness={3}
        position={[0, 0.55, 0]}
        castShadow
      >
        <meshStandardMaterial color={FABRIC_DARK} roughness={0.85} />
      </RoundedBox>
      {/* Subtle stitching detail line down center */}
      <mesh position={[0, 0.59, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[0.004, 0.42]} />
        <meshStandardMaterial color="#1f2229" />
      </mesh>

      {/* Mesh backrest — taller, slightly curved (we fake curve with a
          slight forward rotation on a thin rounded box) */}
      <group position={[0, 0.85, -0.21]} rotation={[0.12, 0, 0]}>
        <RoundedBox args={[0.46, 0.55, 0.06]} radius={0.035} smoothness={3} castShadow>
          <meshStandardMaterial color={METAL_DARK} roughness={0.6} metalness={0.35} />
        </RoundedBox>
        {/* Mesh inset — slightly inset darker patch to suggest woven mesh */}
        <mesh position={[0, 0, 0.032]} raycast={() => null}>
          <planeGeometry args={[0.36, 0.45]} />
          <meshStandardMaterial color="#1f2229" roughness={0.95} />
        </mesh>
      </group>

      {/* Two armrests */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.27, 0.62, 0]} castShadow>
            <boxGeometry args={[0.03, 0.16, 0.04]} />
            <meshStandardMaterial color={METAL_DARK} roughness={0.55} metalness={0.5} />
          </mesh>
          <RoundedBox
            args={[0.08, 0.025, 0.22]}
            radius={0.01}
            smoothness={3}
            position={[side * 0.27, 0.72, 0.04]}
            castShadow
          >
            <meshStandardMaterial color={METAL_DARK} roughness={0.7} />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// CONFERENCE TABLE — oval walnut top with subtle wood grain, glossy
// finish, chrome center column, cable cutout. 3.0 × 1.2 m × 0.74 m.
// ─────────────────────────────────────────────────────────────────
function ConferenceTable() {
  // Procedural wood-grain texture for the top.
  const woodTexture = useMemo(() => buildWoodTexture(), []);

  return (
    <group>
      {/* Top — flat oval. We approximate an oval with a slightly
          stretched cylinder for low geometry cost. */}
      <mesh position={[0, 0.74, 0]} scale={[1, 1, 0.4]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.05, 64]} />
        <meshStandardMaterial
          map={woodTexture}
          color={WOOD_MID}
          roughness={0.25}
          metalness={0.08}
        />
      </mesh>
      {/* Glossy clearcoat layer — thin disc just above the wood */}
      <mesh position={[0, 0.766, 0]} scale={[1, 1, 0.4]} raycast={() => null}>
        <cylinderGeometry args={[1.495, 1.495, 0.002, 64]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.06}
          roughness={0.05}
          clearcoat={1}
        />
      </mesh>

      {/* Center cable cutout — small dark oval in the middle */}
      <mesh position={[0, 0.77, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.07, 0.085, 32]} />
        <meshStandardMaterial color={METAL_DARK} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.769, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.07, 32]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>

      {/* Central chrome column — splayed at the floor */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 0.72, 24]} />
        <meshStandardMaterial color={METAL_CHROME} roughness={0.25} metalness={0.9} />
      </mesh>
      {/* Base plate — wide flat disc at the floor */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.55, 0.04, 32]} />
        <meshStandardMaterial color={METAL_BRUSHED} roughness={0.35} metalness={0.85} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// KITCHEN ISLAND — marble countertop on a wood cabinet base with
// brushed-metal drawer pulls. 2.4 × 1.0 m × 0.9 m tall.
// ─────────────────────────────────────────────────────────────────
function KitchenIsland() {
  const marbleTexture = useMemo(() => buildMarbleTexture(), []);

  return (
    <group>
      {/* Marble countertop — thick slab with bevel */}
      <RoundedBox
        args={[2.4, 0.05, 1.0]}
        radius={0.005}
        smoothness={3}
        position={[0, 0.92, 0]}
        castShadow
      >
        <meshStandardMaterial
          map={marbleTexture}
          color={MARBLE}
          roughness={0.25}
          metalness={0.1}
        />
      </RoundedBox>
      {/* Glossy top layer */}
      <mesh position={[0, 0.946, 0]} raycast={() => null}>
        <boxGeometry args={[2.39, 0.001, 0.99]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.04}
          roughness={0.02}
          clearcoat={1}
        />
      </mesh>

      {/* Cabinet base — large box with darker wood */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[2.3, 0.84, 0.9]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.65} />
      </mesh>

      {/* Drawer fronts — three on the long side, slightly recessed */}
      {[-0.75, 0, 0.75].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.7, 0.451]} castShadow>
            <boxGeometry args={[0.68, 0.28, 0.012]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.55} />
          </mesh>
          {/* Brushed-metal pull */}
          <mesh position={[x, 0.7, 0.46]} castShadow>
            <boxGeometry args={[0.32, 0.02, 0.012]} />
            <meshStandardMaterial color={METAL_BRUSHED} roughness={0.3} metalness={0.85} />
          </mesh>
        </group>
      ))}

      {/* Bottom cabinet doors — two big panels under the drawers */}
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.28, 0.451]} castShadow>
          <boxGeometry args={[1.05, 0.48, 0.012]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.55} />
        </mesh>
      ))}
      {/* Door pulls */}
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.28, 0.46]} castShadow>
          <boxGeometry args={[0.012, 0.18, 0.012]} />
          <meshStandardMaterial color={METAL_BRUSHED} roughness={0.3} metalness={0.85} />
        </mesh>
      ))}

      {/* Plant decor — small terracotta pot with green plant on one end */}
      <mesh position={[-1.0, 1.0, 0.1]} castShadow>
        <cylinderGeometry args={[0.08, 0.06, 0.1, 18]} />
        <meshStandardMaterial color="#b07a48" roughness={0.7} />
      </mesh>
      {/* Leaves — overlapping small spheres */}
      {[[0,1.1,0.1],[-0.06,1.16,0.08],[0.05,1.14,0.13],[-0.04,1.12,0.18]].map((p, i) => (
        <mesh key={i} position={[p[0] - 1.0 + 0, p[1], p[2]]} castShadow>
          <sphereGeometry args={[0.07 - i*0.005, 12, 10]} />
          <meshStandardMaterial color={ACCENT_GREEN} roughness={0.7} />
        </mesh>
      ))}

      {/* Fruit bowl — white shallow dish + a few apples */}
      <mesh position={[0.8, 0.97, 0.05]} castShadow>
        <cylinderGeometry args={[0.18, 0.14, 0.04, 24]} />
        <meshStandardMaterial color={FABRIC_CREAM} roughness={0.45} />
      </mesh>
      {[[-0.06,0,-0.04],[0.07,0,0.02],[0,0,0.06]].map((p, i) => (
        <mesh key={i} position={[0.8 + p[0], 1.03, 0.05 + p[2]]} castShadow>
          <sphereGeometry args={[0.04, 12, 10]} />
          <meshStandardMaterial
            color={i === 1 ? "#dc2626" : "#65a30d"}
            roughness={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// SOFA — 3-seat sofa with plush back cushions, throw pillows, low
// wood feet. 2.2 × 0.95 m × 0.85 m tall (cushion + back).
// ─────────────────────────────────────────────────────────────────
function Sofa() {
  return (
    <group>
      {/* Base frame — long low cube under the seat cushions */}
      <RoundedBox
        args={[2.2, 0.18, 0.95]}
        radius={0.025}
        smoothness={3}
        position={[0, 0.16, 0]}
        castShadow
      >
        <meshStandardMaterial color={FABRIC_WARM} roughness={0.85} />
      </RoundedBox>

      {/* Three seat cushions — slightly proud of the frame */}
      {[-0.72, 0, 0.72].map((x) => (
        <RoundedBox
          key={x}
          args={[0.7, 0.16, 0.85]}
          radius={0.045}
          smoothness={4}
          position={[x, 0.32, 0.02]}
          castShadow
        >
          <meshStandardMaterial color={FABRIC_WARM} roughness={0.82} />
        </RoundedBox>
      ))}

      {/* Three back cushions — slouchy plush, slightly leaned back */}
      {[-0.72, 0, 0.72].map((x) => (
        <group key={x} position={[x, 0.6, -0.3]} rotation={[0.18, 0, 0]}>
          <RoundedBox
            args={[0.66, 0.4, 0.28]}
            radius={0.08}
            smoothness={4}
            castShadow
          >
            <meshStandardMaterial color={FABRIC_WARM} roughness={0.85} />
          </RoundedBox>
        </group>
      ))}

      {/* Two armrests — slightly higher, rounded */}
      {[-1.08, 1.08].map((x) => (
        <RoundedBox
          key={x}
          args={[0.18, 0.5, 0.95]}
          radius={0.06}
          smoothness={4}
          position={[x, 0.33, 0]}
          castShadow
        >
          <meshStandardMaterial color={FABRIC_WARM} roughness={0.82} />
        </RoundedBox>
      ))}

      {/* Throw pillows — two contrasting cushions tucked into corners */}
      {[
        { x: -0.85, color: FABRIC_CREAM },
        { x: 0.85, color: FABRIC_DARK },
      ].map((p) => (
        <group key={p.x} position={[p.x, 0.5, -0.05]} rotation={[0.1, 0, 0.2]}>
          <RoundedBox
            args={[0.32, 0.3, 0.12]}
            radius={0.04}
            smoothness={4}
            castShadow
          >
            <meshStandardMaterial color={p.color} roughness={0.92} />
          </RoundedBox>
        </group>
      ))}

      {/* Four wood feet at the corners */}
      {[
        [-1.0, -0.4],
        [1.0, -0.4],
        [-1.0, 0.4],
        [1.0, 0.4],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.04, z]} castShadow>
          <boxGeometry args={[0.06, 0.08, 0.06]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// TOILET — porcelain bowl + tank + lid. Standard residential dims:
// 0.7 m (front-to-back along +X) × 0.42 m wide × 0.78 m tall to tank.
// ─────────────────────────────────────────────────────────────────
function Toilet() {
  return (
    <group>
      {/* Base pedestal — narrows toward the floor */}
      <mesh position={[-0.05, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.13, 0.3, 16]} />
        <meshStandardMaterial color="#fafafa" roughness={0.25} />
      </mesh>
      {/* Bowl — squat rounded box, slightly wider than the pedestal */}
      <RoundedBox
        args={[0.42, 0.18, 0.4]}
        radius={0.1}
        smoothness={4}
        position={[-0.05, 0.36, 0]}
        castShadow
      >
        <meshStandardMaterial color="#fafafa" roughness={0.22} />
      </RoundedBox>
      {/* Bowl water — slight inset dark patch */}
      <mesh position={[-0.05, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ellipseCurve args={[0, 0, 0.13, 0.11, 0, Math.PI * 2, false, 0]} />
        <circleGeometry args={[0.13, 24]} />
        <meshStandardMaterial color="#b8d4dc" roughness={0.15} metalness={0.05} />
      </mesh>
      {/* Lid (open style — sits flat on top) */}
      <RoundedBox
        args={[0.42, 0.025, 0.4]}
        radius={0.08}
        smoothness={4}
        position={[-0.05, 0.46, 0]}
      >
        <meshStandardMaterial color="#f0f0f0" roughness={0.35} />
      </RoundedBox>
      {/* Tank — rectangular box behind the bowl */}
      <RoundedBox
        args={[0.18, 0.42, 0.45]}
        radius={0.025}
        smoothness={3}
        position={[0.22, 0.6, 0]}
        castShadow
      >
        <meshStandardMaterial color="#fafafa" roughness={0.25} />
      </RoundedBox>
      {/* Flush handle — small chrome button on the tank side */}
      <mesh position={[0.18, 0.78, 0.18]} castShadow>
        <cylinderGeometry args={[0.015, 0.018, 0.014, 12]} />
        <meshStandardMaterial color={METAL_CHROME} roughness={0.25} metalness={0.9} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// SINK — pedestal + bowl + faucet + small mirror behind. Standard
// bathroom vanity dims: 0.6 m wide × 0.5 m deep × 0.85 m tall.
// ─────────────────────────────────────────────────────────────────
function Sink() {
  return (
    <group>
      {/* Pedestal — flared cylinder narrowing toward the floor */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.14, 0.64, 16]} />
        <meshStandardMaterial color="#fafafa" roughness={0.25} />
      </mesh>
      {/* Counter / bowl rim — rectangular slab on top */}
      <RoundedBox
        args={[0.6, 0.06, 0.5]}
        radius={0.025}
        smoothness={4}
        position={[0, 0.85, 0]}
        castShadow
      >
        <meshStandardMaterial color="#fafafa" roughness={0.22} />
      </RoundedBox>
      {/* Sink bowl — dark inset oval */}
      <mesh position={[0, 0.83, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.18, 0.21, 32]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.815, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 32]} />
        <meshStandardMaterial color="#a3a8ae" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Faucet — chrome arc rising from the back of the counter */}
      <mesh position={[0, 0.93, -0.15]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.13, 14]} />
        <meshStandardMaterial color={METAL_CHROME} roughness={0.2} metalness={0.95} />
      </mesh>
      <mesh position={[0, 0.99, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.05, 0.018, 12, 18, Math.PI]} />
        <meshStandardMaterial color={METAL_CHROME} roughness={0.2} metalness={0.95} />
      </mesh>
      <mesh position={[0, 1.0, -0.05]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.05, 14]} />
        <meshStandardMaterial color={METAL_CHROME} roughness={0.2} metalness={0.95} />
      </mesh>
      {/* Two faucet handles — small chrome knobs at the base */}
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, 0.92, -0.15]} castShadow>
          <cylinderGeometry args={[0.018, 0.022, 0.04, 12]} />
          <meshStandardMaterial color={METAL_CHROME} roughness={0.2} metalness={0.95} />
        </mesh>
      ))}
      {/* Mirror behind the sink — rectangular reflective panel */}
      <RoundedBox
        args={[0.55, 0.42, 0.02]}
        radius={0.012}
        smoothness={3}
        position={[0, 1.32, -0.24]}
      >
        <meshStandardMaterial color="#cbd5e1" roughness={0.15} metalness={0.6} />
      </RoundedBox>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// REFRIGERATOR — tall stainless box with two doors (top freezer +
// bottom fridge). Standard footprint 0.85 × 0.72 m, height ~1.78 m.
// ─────────────────────────────────────────────────────────────────
function Refrigerator() {
  return (
    <group>
      {/* Main body */}
      <RoundedBox
        args={[0.85, 1.78, 0.72]}
        radius={0.015}
        smoothness={3}
        position={[0, 0.89, 0]}
        castShadow
      >
        <meshStandardMaterial color={METAL_BRUSHED} roughness={0.4} metalness={0.78} />
      </RoundedBox>
      {/* Top freezer door — about top 1/3 */}
      <mesh position={[0, 1.5, 0.361]} castShadow>
        <boxGeometry args={[0.78, 0.45, 0.012]} />
        <meshStandardMaterial color="#aab1b8" roughness={0.35} metalness={0.8} />
      </mesh>
      {/* Bottom fridge door — about bottom 2/3 */}
      <mesh position={[0, 0.7, 0.361]} castShadow>
        <boxGeometry args={[0.78, 1.1, 0.012]} />
        <meshStandardMaterial color="#aab1b8" roughness={0.35} metalness={0.8} />
      </mesh>
      {/* Vertical handle on the freezer door — left side */}
      <mesh position={[-0.34, 1.5, 0.385]} castShadow>
        <boxGeometry args={[0.025, 0.34, 0.025]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Vertical handle on the fridge door — left side */}
      <mesh position={[-0.34, 0.85, 0.385]} castShadow>
        <boxGeometry args={[0.025, 0.85, 0.025]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.4} metalness={0.7} />
      </mesh>
      {/* Brand label — small black strip top-center */}
      <mesh position={[0, 1.72, 0.367]}>
        <planeGeometry args={[0.12, 0.04]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Subtle door seam */}
      <mesh position={[0, 1.255, 0.367]} raycast={() => null}>
        <planeGeometry args={[0.78, 0.004]} />
        <meshStandardMaterial color="#6b7280" roughness={0.6} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// BED — queen-size: 2.0 × 1.5 m. Wooden frame, mattress, headboard,
// two pillows, blanket folded across the bottom third.
// ─────────────────────────────────────────────────────────────────
function Bed() {
  return (
    <group>
      {/* Frame base — low wood platform */}
      <RoundedBox
        args={[2.0, 0.18, 1.5]}
        radius={0.02}
        smoothness={3}
        position={[0, 0.1, 0]}
        castShadow
      >
        <meshStandardMaterial color={WOOD_MID} roughness={0.65} />
      </RoundedBox>
      {/* Mattress — slightly inset and rounded */}
      <RoundedBox
        args={[1.92, 0.22, 1.42]}
        radius={0.06}
        smoothness={4}
        position={[0, 0.32, 0]}
        castShadow
      >
        <meshStandardMaterial color={FABRIC_CREAM} roughness={0.85} />
      </RoundedBox>
      {/* Folded blanket — across the bottom third of the bed */}
      <RoundedBox
        args={[1.85, 0.06, 0.55]}
        radius={0.025}
        smoothness={3}
        position={[0.5, 0.46, 0]}
      >
        <meshStandardMaterial color={FABRIC_WARM} roughness={0.88} />
      </RoundedBox>
      {/* Two pillows at the head end (-X direction) */}
      {[-0.32, 0.32].map((z) => (
        <RoundedBox
          key={z}
          args={[0.5, 0.1, 0.36]}
          radius={0.06}
          smoothness={4}
          position={[-0.65, 0.48, z]}
          rotation={[0.1, 0, 0]}
          castShadow
        >
          <meshStandardMaterial color="#ffffff" roughness={0.92} />
        </RoundedBox>
      ))}
      {/* Headboard — tall plank at the -X end */}
      <RoundedBox
        args={[0.08, 0.85, 1.5]}
        radius={0.018}
        smoothness={3}
        position={[-1.0, 0.5, 0]}
        castShadow
      >
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </RoundedBox>
      {/* Padded headboard inset — slightly proud fabric panel */}
      <RoundedBox
        args={[0.03, 0.6, 1.35]}
        radius={0.05}
        smoothness={4}
        position={[-0.96, 0.55, 0]}
      >
        <meshStandardMaterial color={FABRIC_DARK} roughness={0.9} />
      </RoundedBox>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// BOOKSHELF — tall narrow shelving unit with 5 shelves and stacks
// of colored books on each. 1.0 × 0.35 m × 1.8 m tall.
// ─────────────────────────────────────────────────────────────────
function Bookshelf() {
  const bookColors = [
    "#7c2d12", "#1e3a8a", "#065f46", "#854d0e", "#831843", "#1e1b4b",
    "#7f1d1d", "#365314", "#581c87", "#0c4a6e",
  ];
  const SHELVES = 5;
  return (
    <group>
      {/* Back panel */}
      <mesh position={[0, 0.9, -0.16]} castShadow>
        <boxGeometry args={[1.0, 1.78, 0.025]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.65} />
      </mesh>
      {/* Two vertical side panels */}
      {[-0.49, 0.49].map((x) => (
        <mesh key={x} position={[x, 0.9, -0.005]} castShadow>
          <boxGeometry args={[0.025, 1.78, 0.32]} />
          <meshStandardMaterial color={WOOD_MID} roughness={0.65} />
        </mesh>
      ))}
      {/* Top + bottom panels */}
      {[0.01, 1.79].map((y) => (
        <mesh key={y} position={[0, y, -0.005]} castShadow>
          <boxGeometry args={[1.0, 0.025, 0.32]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.65} />
        </mesh>
      ))}
      {/* Internal shelves + books on each */}
      {Array.from({ length: SHELVES }).map((_, s) => {
        const y = 0.32 + s * 0.32; // 5 shelves from y=0.32 to y=1.6
        return (
          <group key={s}>
            {/* Shelf board */}
            <mesh position={[0, y, -0.005]}>
              <boxGeometry args={[0.95, 0.018, 0.3]} />
              <meshStandardMaterial color={WOOD_MID} roughness={0.6} />
            </mesh>
            {/* 6 books per shelf, varying heights + colors */}
            {Array.from({ length: 6 }).map((_, b) => {
              const xStart = -0.45 + b * 0.15;
              const bookH = 0.18 + ((s + b) * 7) % 8 * 0.01;
              const bookT = 0.04 + ((b + s) * 3) % 5 * 0.01;
              const color = bookColors[(b + s * 2) % bookColors.length];
              return (
                <mesh
                  key={b}
                  position={[xStart, y + bookH / 2 + 0.009, 0]}
                  castShadow
                >
                  <boxGeometry args={[bookT, bookH, 0.22]} />
                  <meshStandardMaterial color={color} roughness={0.7} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      {/* A small green plant on the top shelf for life */}
      <mesh position={[0.35, 1.82, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.035, 0.06, 14]} />
        <meshStandardMaterial color="#a16207" roughness={0.7} />
      </mesh>
      {[[0,1.88,0],[0.03,1.92,0.02],[-0.03,1.9,-0.02]].map((p, i) => (
        <mesh key={i} position={[0.35 + p[0], p[1], p[2]]} castShadow>
          <sphereGeometry args={[0.04 - i*0.003, 10, 8]} />
          <meshStandardMaterial color={ACCENT_GREEN} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// TV / DISPLAY — slim wall-mounted screen with thin bezel + a small
// bracket on the back. Default 1.4 m wide (~55 inch), depth ~0.1 m.
// Sized so the long axis is along +X; the screen face is on +Y/+Z
// front so when placed against a wall the bezel is visible.
// ─────────────────────────────────────────────────────────────────
function TvDisplay() {
  return (
    <group position={[0, 1.4, 0]}>
      {/* Bezel — slim dark frame */}
      <RoundedBox
        args={[1.4, 0.78, 0.04]}
        radius={0.008}
        smoothness={3}
        castShadow
      >
        <meshStandardMaterial color="#0a0a0a" roughness={0.5} metalness={0.4} />
      </RoundedBox>
      {/* Screen — slightly inset, glowing dark blue */}
      <mesh position={[0, 0, 0.022]} raycast={() => null}>
        <planeGeometry args={[1.32, 0.72]} />
        <meshStandardMaterial
          color="#101828"
          emissive="#1e3a8a"
          emissiveIntensity={0.35}
          roughness={0.25}
        />
      </mesh>
      {/* Subtle on-screen content patches — a couple of brighter
          rectangles to suggest "this is on" without looking goofy */}
      <mesh position={[-0.35, 0.06, 0.023]} raycast={() => null}>
        <planeGeometry args={[0.45, 0.28]} />
        <meshStandardMaterial
          color="#475569"
          emissive="#94a3b8"
          emissiveIntensity={0.18}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0.32, -0.12, 0.023]} raycast={() => null}>
        <planeGeometry args={[0.4, 0.18]} />
        <meshStandardMaterial
          color="#1e3a8a"
          emissive="#3b82f6"
          emissiveIntensity={0.25}
          roughness={0.45}
        />
      </mesh>
      {/* Mount bracket on the back — small cross-shape */}
      <mesh position={[0, 0, -0.025]} castShadow>
        <boxGeometry args={[0.32, 0.06, 0.012]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0, -0.025]} castShadow>
        <boxGeometry args={[0.06, 0.32, 0.012]} />
        <meshStandardMaterial color={METAL_DARK} roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// Procedural textures — wood grain + marble vein
// ─────────────────────────────────────────────────────────────────

function buildWoodTexture(): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  // Base wood tone
  ctx.fillStyle = WOOD_MID;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Streaky grain — long horizontal varying-opacity lines
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * SIZE;
    ctx.strokeStyle = `rgba(${30 + Math.random() * 20}, ${20 + Math.random() * 15}, ${10}, ${0.07 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.5 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // Wavy line
    let cx = 0;
    while (cx < SIZE) {
      const next = cx + 12 + Math.random() * 24;
      const ny = y + (Math.random() - 0.5) * 4;
      ctx.lineTo(next, ny);
      cx = next;
    }
    ctx.stroke();
  }
  // A couple of darker knots
  for (let i = 0; i < 3; i++) {
    const cx = Math.random() * SIZE;
    const cy = Math.random() * SIZE;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
    grad.addColorStop(0, "rgba(30,15,5,0.55)");
    grad.addColorStop(1, "rgba(30,15,5,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildMarbleTexture(): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = MARBLE;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Wandering vein lines
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(${0xc9 - 40 + Math.random() * 30}, ${0xc2 - 40 + Math.random() * 30}, ${0xb6 - 40 + Math.random() * 30}, ${0.35 + Math.random() * 0.2})`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    let x = Math.random() * SIZE;
    let y = Math.random() * SIZE;
    ctx.moveTo(x, y);
    for (let s = 0; s < 18; s++) {
      x += (Math.random() - 0.5) * 50;
      y += (Math.random() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Faint marbled wash
  for (let i = 0; i < 30; i++) {
    const cx = Math.random() * SIZE;
    const cy = Math.random() * SIZE;
    const r = 20 + Math.random() * 40;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(${0xc9 + Math.random() * 20}, ${0xc2 + Math.random() * 20}, ${0xb6}, 0.06)`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  // Suppress unused-vars warning
  void MARBLE_VEIN;
  return tex;
}
