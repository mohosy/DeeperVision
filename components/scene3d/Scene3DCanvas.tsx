"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  AdaptiveDpr,
  ContactShadows,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "next-themes";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { useSimStore } from "@/lib/sim-store";
import type { Device, DeviceType, Floor, Wall } from "@/types/design";
import { getProduct } from "@/lib/catalog";
import { WalkController } from "./WalkController";
import { CameraPovController } from "./CameraPovController";
import { SimController } from "@/components/simulation/SimController";
import { Actor3D } from "@/components/simulation/Actor3D";
import { SubjectTrail3D } from "@/components/simulation/SubjectTrail3D";
import { CameraFOV3D } from "@/components/simulation/CameraFOV3D";
import { useSimStore as useSimStoreLib } from "@/lib/sim-store";
import { DeviceMesh } from "./DeviceMesh";
import { Door3D } from "./Door3D";
import { Annotation3D } from "./Annotation3D";
import { drywallTexture, woodFloorTexture } from "./textures";

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

interface CameraHandles {
  camera: THREE.PerspectiveCamera | null;
  gl: THREE.WebGLRenderer | null;
}

export function Scene3DCanvas({
  width,
  height,
  showSim = false,
}: Scene3DCanvasProps & { showSim?: boolean }) {
  const floor = useActiveFloor();
  const showCoverage = useDesignStore((s) => s.showCoverage);
  const visibility = useDesignStore((s) => s.visibility);
  const threeDMode = useDesignStore((s) => s.threeDMode);
  const setThreeDMode = useDesignStore((s) => s.setThreeDMode);
  const cameraPovTargetId = useDesignStore((s) => s.cameraPovTargetId);
  const addDevice = useDesignStore((s) => s.addDevice);
  const selectedDeviceId = useDesignStore((s) => s.selectedDeviceId);
  const selectDevice = useDesignStore((s) => s.selectDevice);
  const updateDevice = useDesignStore((s) => s.updateDevice);

  const { resolvedTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    setMountedTheme(resolvedTheme === "light" ? "light" : "dark");
  }, [resolvedTheme]);
  const isLight = mountedTheme === "light";
  // Warmer "designed building" palette instead of warehouse grey. Light mode
  // reads as natural wood + cream walls; dark mode reads as a tinted modern
  // office at dusk, still legible but never neutral.
  const bgColor = isLight ? "#f3eee5" : "#0e0d0c";
  const floorColor = isLight ? "#d4bf95" : "#3a322a"; // warm tan / walnut
  const wallColor = isLight ? "#f0e7d8" : "#3a3530"; // eggshell / warm dark
  const baseboardColor = isLight ? "#5a4530" : "#1a1612";
  const gridCell = isLight ? "#b8a98a" : "#4a3f33";
  const gridSection = isLight ? "#8a7a5b" : "#6b5b48";

  const frame = useMemo(() => floor && computeFrame(floor), [floor]);

  // Camera + renderer handles, captured from inside the Canvas via the
  // <SceneExporter /> component below so the wrapper can raycast for drops.
  const handlesRef = useRef<CameraHandles>({ camera: null, gl: null });
  const containerRef = useRef<HTMLDivElement>(null);

  // Used to temporarily disable OrbitControls while a device is being dragged
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  if (!floor || !frame) return null;
  const currentFloor = floor;

  // Resolve the camera-POV target device, if any. We narrow to the camera
  // type because POV positions itself using camera-only fields (FOV, range).
  const povTarget =
    cameraPovTargetId && threeDMode === "pov"
      ? (floor.devices.find(
          (d) => d.id === cameraPovTargetId && d.type === "camera",
        ) as import("@/types/design").CameraDevice | undefined)
      : undefined;

  const { center, span, cameraPos } = frame;
  const maxDim = Math.max(span.x, span.z, 6);

  // Walk spawn — uses the Pegman-drop override if the user dropped the
  // character on the scene, otherwise a sensible default near the corner
  // of the floor's bounding box.
  const walkSpawnOverride = useDesignStore((s) => s.walkSpawnOverride);
  const walkSpawn: [number, number, number] = walkSpawnOverride ?? [
    center.x - span.x * 0.3,
    1.65,
    center.z + span.z * 0.3,
  ];
  const walkLookAt: [number, number, number] = [center.x, 1.5, center.z];

  /**
   * Raycast a (clientX, clientY) into the scene, return the hit point on the
   * floor (y=0) in floor-plan pixel coords, or null if camera not ready.
   */
  function dropPointToPx(clientX: number, clientY: number): {
    x: number;
    y: number;
  } | null {
    const { camera } = handlesRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!camera || !rect) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x * currentFloor.scale, y: hit.z * currentFloor.scale };
  }

  /**
   * Same as dropPointToPx, but returns world-space coordinates (the 3D
   * scene's units) instead of floor-plan pixels. Used by the Pegman drop.
   */
  function dropPointWorld(
    clientX: number,
    clientY: number,
  ): { x: number; z: number } | null {
    const { camera } = handlesRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!camera || !rect) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  function onContainerDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    // Library devices still use the HTML5 drag-and-drop API.
    const raw = e.dataTransfer.getData("application/x-dv-device");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { type: DeviceType; catalogId?: string };
      const px = dropPointToPx(e.clientX, e.clientY);
      if (!px) return;
      const product = payload.catalogId ? getProduct(payload.catalogId) : undefined;
      addDevice(currentFloor.id, payload.type, px, product);
    } catch {
      // ignore
    }
  }

  // Pegman uses pointer events (not HTML5 DnD) so the cursor can carry a
  // live 3D character. The Pegman button dispatches `dv-pegman-drop` on
  // pointerup if the cursor was over this container. We listen for the
  // event here and run the same raycast → walk-mode flow.
  useEffect(() => {
    function onPegmanDrop(e: Event) {
      const detail = (e as CustomEvent<{ clientX: number; clientY: number }>)
        .detail;
      if (!detail) return;
      const world = dropPointWorld(detail.clientX, detail.clientY);
      if (!world) return;
      useDesignStore
        .getState()
        .setWalkSpawnOverride([world.x, 1.65, world.z]);
      useDesignStore.getState().setThreeDMode("walk");
    }
    window.addEventListener("dv-pegman-drop", onPegmanDrop);
    return () => window.removeEventListener("dv-pegman-drop", onPegmanDrop);
    // dropPointWorld closes over handlesRef + containerRef + currentFloor,
    // which are stable refs / read live — no extra deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      data-dv-scene3d-drop="true"
      className="absolute inset-0"
      style={{ width, height }}
      onDrop={onContainerDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: cameraPos,
          fov: 38,
          near: 0.1,
          far: maxDim * 12,
        }}
        onCreated={({ camera, gl }) => {
          handlesRef.current.camera = camera as THREE.PerspectiveCamera;
          handlesRef.current.gl = gl;
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
        onPointerMissed={() => {
          // Clicking empty floor area in orbit mode deselects whatever was selected
          if (threeDMode === "orbit") selectDevice(null);
        }}
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

        {/* Floor — light oak plank texture when in light mode, walnut
            grain in dark mode. Texture repeat scales with span so the
            plank size reads as ~1m per plank regardless of room size. */}
        <FloorPlane
          center={[center.x, center.z]}
          width={span.x * 1.1}
          depth={span.z * 1.1}
          isLight={isLight}
          floorColor={floorColor}
        />


        <ContactShadows
          position={[center.x, 0.005, center.z]}
          opacity={isLight ? 0.28 : 0.42}
          scale={Math.max(span.x, span.z) * 1.4}
          blur={2.6}
          far={6}
          resolution={1024}
          color="#000000"
        />

        {floor.walls.map((wall) => (
          <Wall3D
            key={wall.id}
            wall={wall}
            scale={floor.scale}
            ceilingHeight={floor.ceilingHeight}
            color={wallColor}
            baseboardColor={baseboardColor}
            isLight={isLight}
          />
        ))}

        {/* Doors — rendered as wood-textured slabs at the wall position
            indicated in the design. Doesn't cut the wall geometry; the
            door reads as "this is the door on this wall" via positioning
            + texture. */}
        {(floor.doors ?? []).map((door) => (
          <Door3D
            key={door.id}
            door={door}
            scale={floor.scale}
            isLight={isLight}
          />
        ))}

        {/* Annotations rendered in 3D as floating sticky-note billboards
            so AI commentary stays visible whether the user is in 2D or
            3D. Selecting one routes through selectDevice (annotations
            share that slot in the store, same as doors). */}
        {(floor.annotations ?? []).map((a) => (
          <Annotation3D
            key={a.id}
            annotation={a}
            scale={floor.scale}
            selected={a.id === selectedDeviceId}
            onSelect={() => selectDevice(a.id)}
          />
        ))}

        {floor.devices
          .filter(
            (d) =>
              visibility.byType[d.type] &&
              visibility.byStatus[d.installStatus ?? "proposed"],
          )
          .map((device) => (
            <Device3D
              key={device.id}
              device={device}
              scale={floor.scale}
              showCoverage={showCoverage}
              selected={selectedDeviceId === device.id}
              editable={threeDMode === "orbit" && !showSim}
              onSelect={() => selectDevice(device.id)}
              onDragStateChange={(dragging) => setOrbitEnabled(!dragging)}
              onMove={(positionPx) =>
                updateDevice(floor.id, device.id, { position: positionPx })
              }
            />
          ))}

        {showSim && floor.simPath && floor.simPath.length >= 2 && (
          <SimulationOverlay
            cameras={floor.devices.filter((d) => d.type === "camera") as never}
            scale={floor.scale}
            path={floor.simPath}
          />
        )}

        {threeDMode === "orbit" ? (
          <>
            <OrbitControls
              makeDefault
              enabled={orbitEnabled}
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
        ) : threeDMode === "pov" && povTarget ? (
          <CameraPovController device={povTarget} scale={floor.scale} />
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

function SimulationOverlay({
  cameras,
  scale,
  path,
}: {
  cameras: import("@/types/design").CameraDevice[];
  scale: number;
  path: import("@/types/design").Vec2[];
}) {
  const detectingIds = useSimStoreLib((s) => s.detectingCameras);
  return (
    <>
      <CameraFOV3D
        cameras={cameras}
        scale={scale}
        detectingIds={detectingIds}
      />
      <SubjectTrail3D path={path} scale={scale} />
      <Actor3D />
      <SimController />
    </>
  );
}

/**
 * Floor plane with a tiling wood texture. Repeats are computed so each
 * "plank" reads as ~1m long regardless of how big the room is — keeps
 * the perceived grain density consistent.
 */
function FloorPlane({
  center,
  width,
  depth,
  isLight,
  floorColor,
}: {
  center: [number, number];
  width: number;
  depth: number;
  isLight: boolean;
  floorColor: string;
}) {
  const texture = useMemo(() => {
    const base = woodFloorTexture({
      base: floorColor,
      grain: isLight ? "#8a6634" : "#1f1812",
    });
    const tex = base.clone();
    // Each tile of the canvas (4 planks tall) covers ~4m, so divide by 4
    // to get one plank per meter.
    tex.repeat.set(Math.max(1, width / 4), Math.max(1, depth / 4));
    tex.needsUpdate = true;
    return tex;
  }, [floorColor, isLight, width, depth]);

  return (
    <mesh
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={[center[0], 0, center[1]]}
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial
        map={texture}
        color={floorColor}
        roughness={0.7}
        metalness={0.04}
      />
    </mesh>
  );
}

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
  const cameraPos: [number, number, number] = [
    center.x + maxDim * 0.55,
    Math.max(maxDim * 0.75, 9),
    center.z + maxDim * 0.85,
  ];
  return { center, span, cameraPos };
}

function Wall3D({
  wall,
  scale,
  ceilingHeight,
  color = "#3a3530",
  baseboardColor = "#1a1612",
  isLight = true,
}: {
  wall: Wall;
  scale: number;
  ceilingHeight: number;
  color?: string;
  baseboardColor?: string;
  isLight?: boolean;
}) {
  const start = { x: wall.start.x / scale, z: wall.start.y / scale };
  const end = { x: wall.end.x / scale, z: wall.end.y / scale };
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const cx = (start.x + end.x) / 2;
  const cz = (start.z + end.z) / 2;
  const wallThickness = 0.15;
  const baseboardThickness = 0.18;
  const baseboardHeight = 0.1;

  // Cloned per-wall texture so we can set independent `.repeat` based on
  // this wall's length (longer walls get more grain repeats so the noise
  // density stays consistent regardless of wall size).
  const wallTex = useMemo(() => {
    const base = drywallTexture({ base: color, grain: isLight ? 0.09 : 0.14 });
    const clone = base.clone();
    clone.repeat.set(
      Math.max(1, length / 1.6),
      Math.max(1, ceilingHeight / 1.6),
    );
    clone.needsUpdate = true;
    return clone;
  }, [color, isLight, length, ceilingHeight]);

  return (
    <group position={[cx, 0, cz]} rotation={[0, -angle, 0]}>
      {/* Main wall */}
      <mesh
        castShadow
        receiveShadow
        position={[0, ceilingHeight / 2, 0]}
      >
        <boxGeometry args={[length, ceilingHeight, wallThickness]} />
        <meshStandardMaterial map={wallTex} color={color} roughness={0.82} />
      </mesh>
      {/* Baseboard trim — slightly proud of the wall so it reads as a
         distinct band of dark wood/paint at the floor */}
      <mesh
        receiveShadow
        position={[0, baseboardHeight / 2, 0]}
      >
        <boxGeometry args={[length, baseboardHeight, baseboardThickness]} />
        <meshStandardMaterial color={baseboardColor} roughness={0.55} metalness={0.05} />
      </mesh>
    </group>
  );
}

interface Device3DProps {
  device: Device;
  scale: number;
  showCoverage: boolean;
  selected: boolean;
  editable: boolean;
  onSelect: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onMove: (positionPx: { x: number; y: number }) => void;
}

function Device3D({
  device,
  scale,
  showCoverage,
  selected,
  editable,
  onSelect,
  onDragStateChange,
  onMove,
}: Device3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const dragOffsetRef = useRef<{ x: number; z: number } | null>(null);

  const px = device.position.x / scale;
  const pz = device.position.y / scale;
  const py = device.mountHeight;
  const baseColor = DEVICE_COLORS[device.type];
  const detecting = useSimStore((s) =>
    device.type === "camera"
      ? s.detectingCameras.has(device.id)
      : device.type === "sensor"
        ? s.triggeredSensors.has(device.id)
        : false
  );
  const accent = detecting ? "#34d399" : baseColor;
  const emissiveIntensity = detecting ? 1.2 : 0.55;

  function intersectFloor(e: ThreeEvent<PointerEvent>): {
    wx: number;
    wz: number;
  } | null {
    const ray = e.ray;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(plane, hit)) return null;
    return { wx: hit.x, wz: hit.z };
  }

  function handlePointerDown(e: ThreeEvent<PointerEvent>) {
    if (!editable) return;
    e.stopPropagation();
    onSelect();
    const target = e.target as Element | null;
    if (target && "setPointerCapture" in target) {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // ignore — capture is best-effort
      }
    }
    const hit = intersectFloor(e);
    if (!hit) return;
    dragOffsetRef.current = { x: hit.wx - px, z: hit.wz - pz };
    onDragStateChange(true);
  }

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    if (!dragOffsetRef.current) return;
    e.stopPropagation();
    const hit = intersectFloor(e);
    if (!hit) return;
    const newWx = hit.wx - dragOffsetRef.current.x;
    const newWz = hit.wz - dragOffsetRef.current.z;
    onMove({ x: newWx * scale, y: newWz * scale });
  }

  function handlePointerUp(e: ThreeEvent<PointerEvent>) {
    if (!dragOffsetRef.current) return;
    e.stopPropagation();
    dragOffsetRef.current = null;
    onDragStateChange(false);
    const target = e.target as Element | null;
    if (target && "releasePointerCapture" in target) {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  }

  // `raycast` set to a no-op makes a mesh visually present but invisible
  // to pointer events — clicks pass through to OrbitControls. We use this
  // on every floor decal so the user can drag-to-orbit anywhere without
  // accidentally grabbing the device.
  const noPick = () => null;

  return (
    <group ref={groupRef} position={[px, py, pz]}>
      {/* Interactive part — only the device body itself catches pointer
          events. Floor decals are siblings outside this group, so a click
          on the floor ring just dismisses through to OrbitControls. */}
      <group
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(e) => {
          if (!editable) return;
          e.stopPropagation();
          onSelect();
        }}
      >
        <DeviceMesh
          device={device}
          accent={accent}
          emissiveIntensity={emissiveIntensity}
        />
      </group>

      {detecting && (
        <pointLight
          position={[0, 0, 0]}
          color={accent}
          intensity={1.4}
          distance={4}
        />
      )}

      {/* Selection halo on the floor — only shown when this device is the
          selected one. Non-pickable so the user can drag-to-orbit through
          the halo without losing selection or accidentally moving the
          device. */}
      {selected && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -py + 0.01, 0]}
          raycast={noPick}
        >
          <ringGeometry args={[0.45, 0.55, 48]} />
          <meshBasicMaterial
            color="#34d399"
            transparent
            opacity={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Sensor detection radius (semi-transparent ring on ground) — visible
          when coverage layer is on. Non-pickable. */}
      {showCoverage && device.type === "sensor" && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -py + 0.005, 0]}
          raycast={noPick}
        >
          <ringGeometry
            args={[device.rangeMeters - 0.06, device.rangeMeters, 64]}
          />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* AP coverage disc — non-pickable. */}
      {showCoverage &&
        device.type === "network" &&
        device.networkType === "access-point" && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -py + 0.005, 0]}
            raycast={noPick}
          >
            <circleGeometry args={[device.coverageMeters ?? 15, 64]} />
            <meshBasicMaterial color={accent} transparent opacity={0.08} />
          </mesh>
        )}
    </group>
  );
}
