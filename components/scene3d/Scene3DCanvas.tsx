"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  ContactShadows,
  Grid,
  OrbitControls,
  Outlines,
  RoundedBox,
} from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "next-themes";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { useSimStore } from "@/lib/sim-store";
import type { Device, Floor, Wall } from "@/types/design";
import { WalkController } from "./WalkController";
import { SimController } from "@/components/simulation/SimController";
import { Actor3D } from "@/components/simulation/Actor3D";
import { SimPath3D } from "@/components/simulation/SimPath3D";

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

export function Scene3DCanvas({
  width,
  height,
  showSim = false,
}: Scene3DCanvasProps & { showSim?: boolean }) {
  const floor = useActiveFloor();
  const showCoverage = useDesignStore((s) => s.showCoverage);
  const threeDMode = useDesignStore((s) => s.threeDMode);
  const setThreeDMode = useDesignStore((s) => s.setThreeDMode);
  const { resolvedTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    setMountedTheme(resolvedTheme === "light" ? "light" : "dark");
  }, [resolvedTheme]);
  const isLight = mountedTheme === "light";
  const bgColor = isLight ? "#eef0f3" : "#0c0c0d";
  const floorColor = isLight ? "#dcdee2" : "#1a1a1d";
  const wallColor = isLight ? "#cbd0d6" : "#27272a";
  const gridCell = isLight ? "#cbd5e1" : "#1f2937";
  const gridSection = isLight ? "#94a3b8" : "#374151";

  const frame = useMemo(() => floor && computeFrame(floor), [floor]);

  if (!floor || !frame) {
    return null;
  }

  const { center, span, cameraPos } = frame;
  const maxDim = Math.max(span.x, span.z, 6);

  // Find a good walk spawn point: floor center at human eye height, with the
  // camera initially facing toward the building center (so the user is at the
  // edge looking in).
  const walkSpawn: [number, number, number] = [
    center.x - span.x * 0.3,
    1.65,
    center.z + span.z * 0.3,
  ];
  const walkLookAt: [number, number, number] = [center.x, 1.5, center.z];

  return (
    <div className="absolute inset-0" style={{ width, height }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: cameraPos,
          fov: 45,
          near: 0.1,
          far: maxDim * 12,
        }}
        onCreated={({ camera, gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          const eye = new THREE.Vector3(
            cameraPos[0],
            cameraPos[1],
            cameraPos[2]
          );
          const lookAt = new THREE.Vector3(center.x, 1, center.z);
          const up = new THREE.Vector3(0, 1, 0);
          const m = new THREE.Matrix4().lookAt(eye, lookAt, up);
          camera.position.copy(eye);
          camera.quaternion.setFromRotationMatrix(m);
          camera.updateMatrixWorld(true);
        }}
        gl={{ antialias: true }}
      >
        <AdaptiveDpr pixelated={false} />
        <color attach="background" args={[bgColor]} />
        <fog attach="fog" args={[bgColor, maxDim * 1.8, maxDim * 4]} />

        <ambientLight intensity={0.6} />
        <directionalLight
          castShadow
          position={[
            center.x + maxDim * 0.7,
            maxDim * 1.4,
            center.z + maxDim * 0.4,
          ]}
          intensity={1.1}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-maxDim}
          shadow-camera-right={maxDim}
          shadow-camera-top={maxDim}
          shadow-camera-bottom={-maxDim}
          shadow-camera-near={1}
          shadow-camera-far={maxDim * 4}
          shadow-bias={-0.0005}
        />

        <hemisphereLight args={["#bcd5ff", "#1a1a1a", 0.5]} />

        <Grid
          position={[center.x, 0.01, center.z]}
          args={[maxDim * 3, maxDim * 3]}
          cellColor={gridCell}
          sectionColor={gridSection}
          cellSize={1}
          sectionSize={5}
          fadeDistance={maxDim * 2.5}
          fadeStrength={1.2}
          infiniteGrid
        />

        {/* Floor */}
        <mesh
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          position={[center.x, 0, center.z]}
        >
          <planeGeometry args={[span.x * 1.1, span.z * 1.1]} />
          <meshStandardMaterial color={floorColor} roughness={0.85} metalness={0} />
        </mesh>

        {/* Soft contact shadows under everything */}
        <ContactShadows
          position={[center.x, 0.005, center.z]}
          opacity={isLight ? 0.28 : 0.42}
          scale={Math.max(span.x, span.z) * 1.4}
          blur={2.6}
          far={6}
          resolution={1024}
          color="#000000"
        />

        {/* Walls */}
        {floor.walls.map((wall) => (
          <Wall3D
            key={wall.id}
            wall={wall}
            scale={floor.scale}
            ceilingHeight={floor.ceilingHeight}
            color={wallColor}
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

        {/* Simulation overlay: actor + path */}
        {showSim && floor.simPath && floor.simPath.length >= 2 && (
          <>
            <SimPath3D path={floor.simPath} scale={floor.scale} />
            <Actor3D />
            <SimController />
          </>
        )}

        {threeDMode === "orbit" ? (
          <>
            <OrbitControls
              makeDefault
              enableDamping={false}
              minDistance={1}
              maxDistance={maxDim * 4}
              maxPolarAngle={Math.PI / 2.05}
              target={[center.x, 1, center.z]}
            />
            <FramingInit
              cameraPos={cameraPos}
              target={[center.x, 1, center.z]}
            />
          </>
        ) : (
          <WalkController
            walls={floor.walls}
            scale={floor.scale}
            spawn={walkSpawn}
            spawnLookAt={walkLookAt}
            onExit={() => setThreeDMode("orbit")}
          />
        )}
      </Canvas>
    </div>
  );
}

/**
 * Forces the camera to its initial framing on mount, AFTER OrbitControls is
 * registered. Passing `camera` + `target` as props alone is not enough —
 * OrbitControls' damping can lock the rotation in before the camera has had
 * a chance to look at the scene center, producing a black first frame.
 */
function FramingInit({
  cameraPos,
  target,
}: {
  cameraPos: [number, number, number];
  target: [number, number, number];
}) {
  const { camera, controls } = useThree();
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2]);
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();
    const c = controls as unknown as {
      target?: THREE.Vector3;
      update?: () => void;
    } | null;
    if (c && c.target) {
      c.target.set(target[0], target[1], target[2]);
      c.update?.();
    }
  }, [camera, controls, cameraPos, target]);
  return null;
}

/**
 * Compute scene bounds in meters from the floor's data, and a sensible camera
 * position framed on that center. Returns center (world point to look at),
 * span (extents in X and Z), and cameraPos (initial camera position).
 */
function computeFrame(floor: Floor) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const d of floor.devices) {
    xs.push(d.position.x);
    ys.push(d.position.y);
  }
  for (const w of floor.walls) {
    xs.push(w.start.x, w.end.x);
    ys.push(w.start.y, w.end.y);
  }
  // Default to a small room if there's nothing to bound on yet
  let minX = 0;
  let maxX = 400;
  let minY = 0;
  let maxY = 300;
  if (xs.length > 0) {
    minX = Math.min(...xs);
    maxX = Math.max(...xs);
    minY = Math.min(...ys);
    maxY = Math.max(...ys);
  }
  const center = {
    x: ((minX + maxX) / 2) / floor.scale,
    z: ((minY + maxY) / 2) / floor.scale,
  };
  const span = {
    x: Math.max((maxX - minX) / floor.scale, 6),
    z: Math.max((maxY - minY) / floor.scale, 6),
  };
  const maxDim = Math.max(span.x, span.z);
  // Stand high and offset along the SE diagonal so the whole building reads
  // top-down-ish from outside; the user can orbit from there. Walls are
  // 2.7m tall, so we lift the camera well above that.
  const cameraPos: [number, number, number] = [
    center.x + maxDim * 0.6,
    Math.max(maxDim * 1.1, 12),
    center.z + maxDim * 1.05,
  ];
  return { center, span, cameraPos };
}

function Wall3D({
  wall,
  scale,
  ceilingHeight,
  color = "#27272a",
}: {
  wall: Wall;
  scale: number;
  ceilingHeight: number;
  color?: string;
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
      <meshStandardMaterial color={color} roughness={0.7} />
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
  const baseColor = DEVICE_COLORS[device.type];
  const rotation = device.rotation;
  const detecting = useSimStore((s) =>
    device.type === "camera"
      ? s.detectingCameras.has(device.id)
      : device.type === "sensor"
        ? s.triggeredSensors.has(device.id)
        : false
  );
  const accent = detecting ? "#34d399" : baseColor;
  const emissiveIntensity = detecting ? 1.2 : 0.55;

  return (
    <group position={[px, py, pz]}>
      {/* Pole from floor to device */}
      <mesh position={[0, -py / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.025, py, 10]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.6} />
      </mesh>

      {/* Body — varies by device type, all wrapped in Outlines */}
      {device.type === "camera" && (
        <CameraBody
          accent={accent}
          rotation={rotation}
          emissiveIntensity={emissiveIntensity}
          cameraType={device.cameraType}
        />
      )}
      {device.type === "reader" && (
        <ReaderBody accent={accent} rotation={rotation} />
      )}
      {device.type === "sensor" && (
        <SensorBody accent={accent} emissiveIntensity={emissiveIntensity} />
      )}
      {device.type === "network" && (
        <NetworkBody accent={accent} networkType={device.networkType} />
      )}

      {detecting && (
        <pointLight
          position={[0, 0, 0]}
          color={accent}
          intensity={1.4}
          distance={4}
        />
      )}

      {/* Sensor detection radius (semi-transparent ring on ground) */}
      {showCoverage && device.type === "sensor" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -py + 0.005, 0]}>
          <ringGeometry args={[device.rangeMeters - 0.06, device.rangeMeters, 64]} />
          <meshBasicMaterial color={accent} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* AP coverage disc */}
      {showCoverage &&
        device.type === "network" &&
        device.networkType === "access-point" && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -py + 0.005, 0]}>
            <circleGeometry args={[device.coverageMeters ?? 15, 64]} />
            <meshBasicMaterial color={accent} transparent opacity={0.08} />
          </mesh>
        )}
    </group>
  );
}

function CameraBody({
  accent,
  rotation,
  emissiveIntensity,
  cameraType,
}: {
  accent: string;
  rotation: number;
  emissiveIntensity: number;
  cameraType: "fixed" | "ptz" | "dome" | "fisheye";
}) {
  // Dome cameras look like a hemisphere on a wall plate; others are a small
  // boxy housing with a lens cylinder facing rotation.
  if (cameraType === "dome" || cameraType === "fisheye") {
    return (
      <group>
        <RoundedBox args={[0.32, 0.06, 0.32]} radius={0.012} smoothness={4} castShadow>
          <meshStandardMaterial color="#27272a" roughness={0.65} />
          <Outlines thickness={0.012} color="#52525b" opacity={0.7} transparent />
        </RoundedBox>
        <mesh position={[0, -0.05, 0]} castShadow>
          <sphereGeometry args={[0.14, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.3} />
        </mesh>
        {/* Lens dot */}
        <mesh position={[0, -0.13, 0]}>
          <sphereGeometry args={[0.025, 16, 16]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      </group>
    );
  }
  // Fixed / PTZ — box body, lens facing the camera's rotation direction
  return (
    <group rotation={[0, -rotation, 0]}>
      <RoundedBox args={[0.18, 0.16, 0.28]} radius={0.025} smoothness={4} castShadow>
        <meshStandardMaterial color="#1f1f23" roughness={0.6} metalness={0.2} />
        <Outlines thickness={0.014} color="#52525b" opacity={0.7} transparent />
      </RoundedBox>
      {/* Lens barrel */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.2]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.12, 18]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Lens iris */}
      <mesh position={[0, 0, 0.27]}>
        <circleGeometry args={[0.05, 24]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
      {/* Top mount tab */}
      <RoundedBox
        args={[0.06, 0.05, 0.08]}
        radius={0.012}
        smoothness={3}
        position={[0, 0.105, -0.04]}
      >
        <meshStandardMaterial color="#27272a" roughness={0.7} />
      </RoundedBox>
    </group>
  );
}

function ReaderBody({ accent, rotation }: { accent: string; rotation: number }) {
  return (
    <group rotation={[0, -rotation, 0]}>
      <RoundedBox args={[0.16, 0.24, 0.04]} radius={0.018} smoothness={4} castShadow>
        <meshStandardMaterial color="#1f1f23" roughness={0.6} metalness={0.15} />
        <Outlines thickness={0.012} color="#52525b" opacity={0.7} transparent />
      </RoundedBox>
      {/* Reader screen */}
      <mesh position={[0, 0.04, 0.022]}>
        <planeGeometry args={[0.1, 0.06]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.7}
        />
      </mesh>
      {/* Card area */}
      <RoundedBox
        args={[0.1, 0.08, 0.012]}
        radius={0.012}
        smoothness={3}
        position={[0, -0.06, 0.022]}
      >
        <meshStandardMaterial color="#0a0a0a" roughness={0.5} />
      </RoundedBox>
    </group>
  );
}

function SensorBody({
  accent,
  emissiveIntensity,
}: {
  accent: string;
  emissiveIntensity: number;
}) {
  return (
    <group>
      {/* Hemispherical dome */}
      <mesh castShadow>
        <sphereGeometry args={[0.1, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f1f1ef" roughness={0.55} />
      </mesh>
      {/* Base plate */}
      <RoundedBox
        args={[0.24, 0.04, 0.24]}
        radius={0.01}
        smoothness={4}
        position={[0, -0.02, 0]}
        castShadow
      >
        <meshStandardMaterial color="#e7e5e4" roughness={0.7} />
        <Outlines thickness={0.012} color="#a8a29e" opacity={0.55} transparent />
      </RoundedBox>
      {/* Indicator LED */}
      <mesh position={[0, 0.02, 0.105]}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
    </group>
  );
}

function NetworkBody({
  accent,
  networkType,
}: {
  accent: string;
  networkType: "switch" | "access-point" | "nvr";
}) {
  if (networkType === "access-point") {
    return (
      <group>
        {/* Flat disc puck */}
        <mesh castShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.06, 24]} />
          <meshStandardMaterial color="#f5f5f4" roughness={0.6} />
        </mesh>
        {/* Bottom logo dot */}
        <mesh position={[0, -0.035, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.005, 16]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={0.6}
          />
        </mesh>
      </group>
    );
  }
  // switch / NVR — 1U rackmount-ish horizontal box
  return (
    <group>
      <RoundedBox args={[0.4, 0.12, 0.22]} radius={0.014} smoothness={4} castShadow>
        <meshStandardMaterial color="#27272a" roughness={0.55} metalness={0.25} />
        <Outlines thickness={0.012} color="#52525b" opacity={0.6} transparent />
      </RoundedBox>
      {/* Port row */}
      <mesh position={[0, 0.005, 0.11]}>
        <planeGeometry args={[0.32, 0.04]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>
      {/* Tiny status LEDs */}
      {[-0.14, -0.07, 0, 0.07, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.025, 0.111]}>
          <sphereGeometry args={[0.008, 8, 8]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

