"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import type { Device, Floor, Wall } from "@/types/design";

interface Scene3DCanvasProps {
  width: number;
  height: number;
}

const DEVICE_COLORS = {
  camera: "#34d399",
  reader: "#38bdf8",
  sensor: "#fbbf24",
  network: "#a78bfa",
} as const;

export function Scene3DCanvas({ width, height }: Scene3DCanvasProps) {
  const floor = useActiveFloor();
  const showCoverage = useDesignStore((s) => s.showCoverage);

  const meters = useMemo(() => floor && pixelsToMeters(floor), [floor]);

  if (!floor || !meters) {
    return null;
  }

  return (
    <div className="absolute inset-0" style={{ width, height }}>
      <Canvas
        shadows
        camera={{
          position: [
            meters.width * 0.5 + Math.max(meters.width, 6) * 0.8,
            Math.max(meters.width, meters.height, 6) * 0.7,
            meters.height * 0.5 + Math.max(meters.height, 6) * 0.8,
          ],
          fov: 50,
        }}
        onCreated={({ camera }) => {
          camera.lookAt(meters.width / 2, 1, meters.height / 2);
        }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0c0c0d"]} />
        <fog attach="fog" args={["#0c0c0d", meters.width * 1.2, meters.width * 3]} />

        <ambientLight intensity={0.55} />
        <directionalLight
          castShadow
          position={[meters.width * 0.8, meters.width * 1.2, meters.height * 0.4]}
          intensity={1.4}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-meters.width}
          shadow-camera-right={meters.width}
          shadow-camera-top={meters.height}
          shadow-camera-bottom={-meters.height}
        />

        <hemisphereLight args={["#bcd5ff", "#1a1a1a", 0.55]} />

        <Grid
          position={[meters.width / 2, 0.01, meters.height / 2]}
          args={[Math.max(meters.width, meters.height) * 2, Math.max(meters.width, meters.height) * 2]}
          cellColor="#1f2937"
          sectionColor="#374151"
          cellSize={1}
          sectionSize={5}
          fadeDistance={Math.max(meters.width, meters.height) * 2}
          fadeStrength={1}
          infiniteGrid
        />

        {/* Floor */}
        <mesh
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          position={[meters.width / 2, 0, meters.height / 2]}
        >
          <planeGeometry args={[meters.width, meters.height]} />
          <meshStandardMaterial color="#1a1a1d" roughness={0.85} metalness={0} />
        </mesh>

        {/* Walls */}
        {floor.walls.map((wall) => (
          <Wall3D
            key={wall.id}
            wall={wall}
            scale={floor.scale}
            ceilingHeight={floor.ceilingHeight}
          />
        ))}

        {/* Devices */}
        {floor.devices.map((device) => (
          <Device3D
            key={device.id}
            device={device}
            scale={floor.scale}
            showCoverage={showCoverage}
          />
        ))}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={1}
          maxDistance={meters.width * 4}
          maxPolarAngle={Math.PI / 2.05}
          target={[meters.width / 2, 1, meters.height / 2]}
        />
      </Canvas>
    </div>
  );
}

function pixelsToMeters(floor: Floor) {
  if (!floor) return null;
  // Use floor plan image bounds if available, else infer from device/wall bounds
  // Default room size in meters when no image:
  let widthPx = 800;
  let heightPx = 600;

  const xs = [
    ...floor.devices.map((d) => d.position.x),
    ...floor.walls.flatMap((w) => [w.start.x, w.end.x]),
  ];
  const ys = [
    ...floor.devices.map((d) => d.position.y),
    ...floor.walls.flatMap((w) => [w.start.y, w.end.y]),
  ];
  if (xs.length > 0) {
    widthPx = Math.max(...xs) + 100;
    heightPx = Math.max(...ys) + 100;
  }

  return {
    width: widthPx / floor.scale,
    height: heightPx / floor.scale,
  };
}

function Wall3D({
  wall,
  scale,
  ceilingHeight,
}: {
  wall: Wall;
  scale: number;
  ceilingHeight: number;
}) {
  // Convert from floor-plan pixels to world meters. The plan's +Y in pixel
  // space maps to world +Z so the design's top-down view still reads
  // top-down in 3D from a default camera looking down -Z.
  const start = { x: wall.start.x / scale, z: wall.start.y / scale };
  const end = { x: wall.end.x / scale, z: wall.end.y / scale };
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const cx = (start.x + end.x) / 2;
  const cz = (start.z + end.z) / 2;
  const wallThickness = 0.15;

  return (
    <mesh
      castShadow
      receiveShadow
      position={[cx, ceilingHeight / 2, cz]}
      rotation={[0, -angle, 0]}
    >
      <boxGeometry args={[length, ceilingHeight, wallThickness]} />
      <meshStandardMaterial color="#27272a" roughness={0.7} />
    </mesh>
  );
}

function Device3D({
  device,
  scale,
  showCoverage,
}: {
  device: Device;
  scale: number;
  showCoverage: boolean;
}) {
  const px = device.position.x / scale;
  const pz = device.position.y / scale;
  const py = device.mountHeight;
  const color = DEVICE_COLORS[device.type];
  const rotation = device.rotation;

  return (
    <group position={[px, py, pz]}>
      {/* Pole from floor to device */}
      <mesh position={[0, -py / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, py, 8]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.6} />
      </mesh>

      {/* Body */}
      <mesh castShadow>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.35}
          metalness={0.2}
          roughness={0.5}
        />
      </mesh>

      {/* Direction marker */}
      {(device.type === "camera" || device.type === "reader") && (
        <mesh
          rotation={[0, -rotation, 0]}
          position={[Math.cos(rotation) * 0.18, 0, Math.sin(rotation) * 0.18]}
        >
          <coneGeometry args={[0.05, 0.12, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* TODO: Camera FOV wedge in 3D (currently breaks the renderer when
         combined with the existing scene — see [Issue: 3D FOV wedge]).
         For now coverage cones are shown in 2D only. */}

      {/* Sensor detection radius (semi-transparent ring on ground) */}
      {showCoverage && device.type === "sensor" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -py + 0.005, 0]}>
          <ringGeometry args={[device.rangeMeters - 0.06, device.rangeMeters, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* AP coverage disc */}
      {showCoverage &&
        device.type === "network" &&
        device.networkType === "access-point" && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -py + 0.005, 0]}>
            <circleGeometry args={[device.coverageMeters ?? 15, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.08} />
          </mesh>
        )}
    </group>
  );
}

