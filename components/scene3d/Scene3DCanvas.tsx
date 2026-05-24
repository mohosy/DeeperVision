"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  AdaptiveDpr,
  ContactShadows,
  Grid,
  Html,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "next-themes";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { useSimStore } from "@/lib/sim-store";
import type { Device, DeviceType, Floor, Wall } from "@/types/design";
import { getProduct } from "@/lib/catalog";
import { snapToNearestWall } from "@/lib/geometry";
import { toast } from "sonner";
import { WalkController, WalkHUD, useWalkUIStore } from "./WalkController";
import { CameraPovController } from "./CameraPovController";
import { SimController } from "@/components/simulation/SimController";
import { Actor3D } from "@/components/simulation/Actor3D";
import { SubjectTrail3D } from "@/components/simulation/SubjectTrail3D";
import { DetectionVisualizer3D } from "@/components/simulation/DetectionVisualizer3D";
import { ActorFollowController } from "@/components/simulation/ActorFollowController";
import { CameraFOV3D } from "@/components/simulation/CameraFOV3D";
import { useSimStore as useSimStoreLib } from "@/lib/sim-store";
import { DeviceMesh } from "./DeviceMesh";
import { Door3D } from "./Door3D";
import { Furniture3D } from "./Furniture3D";
import { Annotation3D } from "./Annotation3D";
import { CablingLines3D } from "./CablingLines3D";
import { drywallTexture, woodFloorTexture } from "./textures";

interface Scene3DCanvasProps {
  width: number;
  height: number;
}

/**
 * Per-type accents for 3D meshes (emissive lens iris, brand strips, status
 * LEDs). Aligned with the 2D marker palette so a camera reads as the same
 * "blue" in both views. The "detecting" override in Device3D below temporarily
 * paints a camera/sensor emerald-400 during simulation — same green-means-active
 * cue as before.
 */
const DEVICE_COLORS = {
  camera: "#3b82f6", // blue-500 (matches 2D)
  reader: "#0ea5e9", // sky-500
  sensor: "#f59e0b", // amber-500
  network: "#a78bfa", // violet-400
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
  const showCabling = useDesignStore((s) => s.showCabling);
  const visibility = useDesignStore((s) => s.visibility);
  const threeDMode = useDesignStore((s) => s.threeDMode);
  const setThreeDMode = useDesignStore((s) => s.setThreeDMode);
  const cameraPovTargetId = useDesignStore((s) => s.cameraPovTargetId);
  const addDevice = useDesignStore((s) => s.addDevice);
  const selectedDeviceId = useDesignStore((s) => s.selectedDeviceId);
  const selectDevice = useDesignStore((s) => s.selectDevice);
  const updateDevice = useDesignStore((s) => s.updateDevice);
  const enterCameraPov = useDesignStore((s) => s.enterCameraPov);
  const tool = useDesignStore((s) => s.tool);
  const setTool = useDesignStore((s) => s.setTool);
  const addCable = useDesignStore((s) => s.addCable);

  // 3D wire-tool transient state — held locally so the workflow is
  // independent of the 2D editor (you can fully wire from 3D without
  // ever switching views).
  const [wireSourceId, setWireSourceId] = useState<string | null>(null);
  const [wireWaypoints, setWireWaypoints] = useState<{ x: number; y: number }[]>(
    [],
  );
  const isWiring = tool === "wire";

  // Esc cancels in-progress wiring + exits wire mode.
  useEffect(() => {
    if (!isWiring) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setWireSourceId(null);
        setWireWaypoints([]);
        setTool("select");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isWiring, setTool]);

  const { resolvedTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    setMountedTheme(resolvedTheme === "light" ? "light" : "dark");
  }, [resolvedTheme]);
  const isLight = mountedTheme === "light";
  // Time-of-day picks between two clean Japanese-garden palettes: a bright
  // late-morning daytime and a warm soft sunset. No "night" mode — the
  // brief experiment with deep navy + heavy bloom didn't suit the look.
  const timeOfDay = useDesignStore((s) => s.timeOfDay);
  const isDusk = timeOfDay === "dusk";
  // Warm Japanese palette: cream paper walls, light wood floor, soft sky.
  const baseBg = isLight ? "#f3eee5" : "#1a1612";
  const bgColor = isDusk
    ? "#f7d6b0" // peachy golden-hour sky
    : baseBg;
  const floorColor = isDusk
    ? (isLight ? "#c7a878" : "#3a2e22")
    : (isLight ? "#d4bf95" : "#3a322a");
  const wallColor = isDusk
    ? (isLight ? "#eddcc4" : "#3a2e25")
    : (isLight ? "#f4ecde" : "#3a3530");
  const baseboardColor = isLight ? "#5a4530" : "#1a1612";
  const gridCell = isDusk
    ? (isLight ? "#b09c7a" : "#4a3f33")
    : (isLight ? "#b8a98a" : "#4a3f33");
  const gridSection = isDusk
    ? (isLight ? "#8a7755" : "#6b5b48")
    : (isLight ? "#8a7a5b" : "#6b5b48");

  const frame = useMemo(() => floor && computeFrame(floor), [floor]);

  // Camera + renderer handles, captured from inside the Canvas via the
  // <SceneExporter /> component below so the wrapper can raycast for drops.
  const handlesRef = useRef<CameraHandles>({ camera: null, gl: null });
  const containerRef = useRef<HTMLDivElement>(null);

  // Used to temporarily disable OrbitControls while a device is being dragged
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  // True when the sim is in "follow the actor" mode — suppresses orbit
  // controls so the FollowCamera owns the camera.
  const simFollowing = useSimStoreLib((s) => s.following);
  // True while the user is holding `E` in walk mode — devices become
  // draggable/selectable just like in orbit.
  const walkInteract = useWalkUIStore((s) => s.interactMode);

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
          gl.toneMappingExposure = isDusk ? 1.18 : 1.05;
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
        <ToneMapKeeper exposure={isDusk ? 1.18 : 1.05} />
        <color attach="background" args={[bgColor]} />
        <fog attach="fog" args={[bgColor, maxDim * 1.8, maxDim * 4]} />

        {/* Lighting rig. Day uses a bright sun + sky hemi; sunset swaps the
            sun for a warm low orange + softer ambient. Both modes feel
            airy + naturally lit — no heavy post-processing needed. */}
        <ambientLight intensity={isDusk ? 0.55 : 0.6} />
        <directionalLight
          castShadow
          position={[
            center.x + maxDim * (isDusk ? 1.6 : 0.7),
            maxDim * (isDusk ? 0.7 : 1.4),
            center.z + maxDim * (isDusk ? 1.2 : 0.4),
          ]}
          intensity={isDusk ? 1.0 : 1.1}
          color={isDusk ? "#ffb87a" : "#fff5d8"}
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

        <hemisphereLight
          args={[
            isDusk ? "#ffd9b8" : "#bcd5ff",
            "#1a1a1a",
            isDusk ? 0.55 : 0.5,
          ]}
        />

        {/* Interior pendant lights — ONLY at sunset. In daytime the sun
            already lights everything; pendants would just clutter the
            ceiling with redundant glow patches. */}
        {isDusk && (
          <InteriorLights
            walls={floor.walls}
            scale={floor.scale}
            ceilingHeight={floor.ceilingHeight}
            intensity={0.45}
          />
        )}

        {/* Sakura petals drifting through the scene — pure ambient detail
            that gives the Japanese-garden vibe. Spawns above the wall
            bounding box and falls + drifts gently to the floor. */}
        <SakuraPetals
          walls={floor.walls}
          scale={floor.scale}
          ceilingHeight={floor.ceilingHeight}
          count={isDusk ? 90 : 70}
        />

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

        {/* Soft lantern-glow windows — only at sunset, only on longer
            walls, generously spaced so the building reads as having a few
            lit rooms (not every panel glowing). Skipped in day mode. */}
        {isDusk &&
          floor.walls.map((wall) => (
            <WindowGlow
              key={`wg-${wall.id}`}
              wall={wall}
              scale={floor.scale}
              ceilingHeight={floor.ceilingHeight}
              intensity={0.55}
            />
          ))}

        {floor.walls.map((wall) => (
          <Wall3D
            key={wall.id}
            wall={wall}
            scale={floor.scale}
            ceilingHeight={floor.ceilingHeight}
            color={wallColor}
            baseboardColor={baseboardColor}
            isLight={isLight}
            doorsOnWall={(floor.doors ?? []).filter((d) => d.wallId === wall.id)}
            wallStyle={floor.wallStyle ?? "plain"}
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

        {/* Furniture — desks, chairs, tables, sofas. Decorative only;
            doesn't affect coverage, quotes, or simulation. */}
        {(floor.furniture ?? []).map((item) => (
          <Furniture3D
            key={item.id}
            item={item}
            scale={floor.scale}
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
              ceilingHeight={floor.ceilingHeight}
              walls={floor.walls}
              showCoverage={showCoverage}
              selected={selectedDeviceId === device.id}
              editable={
                !showSim &&
                (threeDMode === "orbit" ||
                  (threeDMode === "walk" && walkInteract))
              }
              wireMode={isWiring}
              onSelect={() => {
                // Wire-tool: hijack the normal select so the click sets
                // a source / target endpoint instead of opening the
                // properties panel.
                if (isWiring) {
                  if (!wireSourceId) {
                    setWireSourceId(device.id);
                    toast.message("Source set", {
                      description:
                        "Click the target device. Shift-click the floor to add a bend. Esc to cancel.",
                      duration: 4000,
                    });
                  } else if (device.id !== wireSourceId) {
                    const src = floor.devices.find((d) => d.id === wireSourceId);
                    // Same rule-of-thumb cable picker as the 2D editor.
                    const cableType: import("@/types/design").CableType =
                      src?.type === "camera" ||
                      (src?.type === "network" &&
                        (src as Extract<Device, { type: "network" }>)
                          .networkType === "access-point")
                        ? "cat6"
                        : src?.type === "reader"
                          ? "22-4"
                          : "18-2";
                    addCable(floor.id, {
                      sourceDeviceId: wireSourceId,
                      targetDeviceId: device.id,
                      type: cableType,
                      waypoints: wireWaypoints,
                    });
                    setWireSourceId(null);
                    setWireWaypoints([]);
                    toast.success("Cable added");
                  }
                  return;
                }
                selectDevice(device.id);
              }}
              onDragStateChange={(dragging) => setOrbitEnabled(!dragging)}
              onMove={(positionPx) =>
                updateDevice(floor.id, device.id, { position: positionPx })
              }
              onRotate={(rotation) =>
                updateDevice(floor.id, device.id, { rotation })
              }
              onMountHeightChange={(mountHeight) =>
                updateDevice(floor.id, device.id, { mountHeight })
              }
              onEnterPov={() => enterCameraPov(device.id)}
              isPovTarget={device.id === cameraPovTargetId}
            />
          ))}

        {/* Cable runs through the ceiling plenum. Drawn after devices so
            the cables sit visually behind them when stacked, but they're
            up at ceiling height so they don't fight device placement. */}
        {showCabling && (
          <CablingLines3D
            floor={floor}
            ceilingHeight={floor.ceilingHeight}
          />
        )}

        {/* Manual / user-drawn cables — color-coded by type, route
            through ceiling at the specified waypoints. */}
        {showCabling &&
          (floor.cables ?? []).map((cable) => (
            <ManualCable3D
              key={cable.id}
              cable={cable}
              devices={floor.devices}
              scale={floor.scale}
              ceilingHeight={floor.ceilingHeight}
            />
          ))}

        {/* Wire-mode floor catcher — invisible plane that intercepts
            Shift-clicks anywhere on the floor and drops a waypoint at
            that world point. Only mounted when wiring is active so it
            doesn't interfere with normal orbit / device selection. */}
        {isWiring && wireSourceId && (
          <mesh
            position={[center.x, 0.01, center.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={(e) => {
              if (!e.shiftKey) return;
              e.stopPropagation();
              const wx = e.point.x;
              const wz = e.point.z;
              setWireWaypoints((wp) => [
                ...wp,
                { x: wx * floor.scale, y: wz * floor.scale },
              ]);
            }}
          >
            <planeGeometry args={[maxDim * 4, maxDim * 4]} />
            <meshBasicMaterial color="#000000" transparent opacity={0} />
          </mesh>
        )}

        {/* Live preview line — at ceiling height, source → waypoints,
            so the user can SEE where the cable will route as they
            shift-click. */}
        {isWiring && wireSourceId && (() => {
          const src = floor.devices.find((d) => d.id === wireSourceId);
          if (!src) return null;
          const cy = Math.max(0.2, floor.ceilingHeight - 0.2);
          const pts: THREE.Vector3[] = [
            new THREE.Vector3(
              src.position.x / floor.scale,
              src.mountHeight,
              src.position.y / floor.scale,
            ),
            new THREE.Vector3(
              src.position.x / floor.scale,
              cy,
              src.position.y / floor.scale,
            ),
          ];
          for (const w of wireWaypoints) {
            pts.push(
              new THREE.Vector3(w.x / floor.scale, cy, w.y / floor.scale),
            );
          }
          const geom = new THREE.BufferGeometry().setFromPoints(pts);
          return (
            <>
              <primitive
                object={
                  new THREE.Line(
                    geom,
                    new THREE.LineBasicMaterial({
                      color: "#60a5fa",
                      transparent: true,
                      opacity: 0.85,
                    }),
                  )
                }
              />
              {/* Waypoint sphere markers */}
              {wireWaypoints.map((w, i) => (
                <mesh
                  key={i}
                  position={[w.x / floor.scale, cy, w.y / floor.scale]}
                >
                  <sphereGeometry args={[0.06, 12, 10]} />
                  <meshBasicMaterial color="#2563eb" />
                </mesh>
              ))}
            </>
          );
        })()}

        {showSim && floor.simPath && floor.simPath.length >= 2 && (
          <SimulationOverlay
            cameras={floor.devices.filter((d) => d.type === "camera") as never}
            scale={floor.scale}
            path={floor.simPath}
          />
        )}

        {/* Camera FOV cones in the regular 3D scene (not just sim). Gated
            by the Show-coverage toggle so users can hide them when they
            want a clean architectural view. The component already handles
            single-lens, multi-sensor, and (after this fix) 360° cameras. */}
        {!showSim && showCoverage && (
          <CameraFOV3D
            cameras={floor.devices.filter((d) => d.type === "camera") as never}
            scale={floor.scale}
            detectingIds={new Set<string>()}
          />
        )}

        {threeDMode === "orbit" ? (
          <>
            <OrbitControls
              makeDefault
              // While following we still keep orbit ENABLED so the user
              // can click-and-drag to look around the actor. The
              // FollowCamera pins the orbit target to the actor every
              // frame, so dragging rotates around them as they walk.
              enabled={orbitEnabled}
              enableDamping={false}
              minDistance={1}
              maxDistance={maxDim * 4}
              maxPolarAngle={Math.PI / 2.05}
              target={[center.x, 1, center.z]}
              // Trackpad/wheel zoom homes in on whatever's under the
              // cursor instead of always pulling toward the scene center.
              zoomToCursor
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
            doors={floor.doors ?? []}
            scale={floor.scale}
            spawn={walkSpawn}
            spawnLookAt={walkLookAt}
            onExit={() => setThreeDMode("orbit")}
          />
        )}
      </Canvas>
      {threeDMode === "walk" && <WalkHUD />}
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
      <DetectionVisualizer3D />
      <ActorFollowController />
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
  doorsOnWall = [],
  wallStyle = "plain",
}: {
  wall: Wall;
  scale: number;
  ceilingHeight: number;
  color?: string;
  baseboardColor?: string;
  isLight?: boolean;
  /** Doors that physically sit on this wall — we cut openings for each. */
  doorsOnWall?: import("@/types/design").Door[];
  /** Visual style applied to the wall material. */
  wallStyle?: import("@/types/design").WallStyle;
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
  const doorHeight = 2.05;

  // Cloned per-wall texture so we can set independent `.repeat` based on
  // this wall's length (longer walls get more grain repeats so the noise
  // density stays consistent regardless of wall size).
  const wallTex = useMemo(() => {
    // For brick the natural tile is bigger (1 row × multiple bricks),
    // and for concrete the wash splotches read best at lower tile counts.
    // Adjust the base color sent to the texture per style so the user's
    // floor "color" still tints the result sensibly.
    const styleBase =
      wallStyle === "brick" ? "#8b4a32" : wallStyle === "concrete" ? "#9b9994" : color;
    const base = drywallTexture({
      base: styleBase,
      grain: isLight ? 0.09 : 0.14,
      style: wallStyle,
    });
    const clone = base.clone();
    // Brick + concrete prefer fewer repeats (bigger tiles read better);
    // plain + painted want denser tiles so the noise stays fine-grained.
    const tileSize = wallStyle === "brick" ? 2.4 : wallStyle === "concrete" ? 2.0 : 1.6;
    clone.repeat.set(
      Math.max(1, length / tileSize),
      Math.max(1, ceilingHeight / tileSize),
    );
    clone.needsUpdate = true;
    return clone;
  }, [color, isLight, length, ceilingHeight]);

  // Compute door openings along the wall in wall-local X (range [-length/2,
  // +length/2]). For each door: project its world position onto the wall's
  // direction, then convert to wall-local X.
  const wallDirX = length > 0 ? dx / length : 1;
  const wallDirZ = length > 0 ? dz / length : 0;
  const openings = doorsOnWall
    .map((d) => {
      const wx = d.position.x / scale - start.x;
      const wz = d.position.y / scale - start.z;
      const tAlong = wx * wallDirX + wz * wallDirZ; // distance from wall start
      const center = tAlong - length / 2;
      const half = d.widthMeters / 2;
      return {
        center,
        from: Math.max(-length / 2, center - half),
        to: Math.min(length / 2, center + half),
      };
    })
    // Drop any computed opening that ended up entirely outside the wall
    // (defensive — bad data shouldn't crash the render).
    .filter((o) => o.to > o.from)
    .sort((a, b) => a.from - b.from);

  // Walk along the wall, emitting solid segments between openings + transoms
  // above each opening. Coordinates are in wall-local X.
  type Seg = { centerX: number; len: number; transom?: boolean };
  const segs: Seg[] = [];
  let cursor = -length / 2;
  for (const op of openings) {
    if (op.from > cursor + 0.001) {
      const segLen = op.from - cursor;
      segs.push({ centerX: cursor + segLen / 2, len: segLen });
    }
    // Transom — wall above the opening, from doorHeight to ceiling.
    const transomLen = op.to - op.from;
    if (transomLen > 0.001) {
      segs.push({ centerX: op.center, len: transomLen, transom: true });
    }
    cursor = op.to;
  }
  if (length / 2 > cursor + 0.001) {
    const segLen = length / 2 - cursor;
    segs.push({ centerX: cursor + segLen / 2, len: segLen });
  }

  // Baseboard segments — same gaps as walls, but no transoms (baseboards
  // are floor-level, so the gap under the door is just empty).
  const baseSegs: { centerX: number; len: number }[] = [];
  let bCursor = -length / 2;
  for (const op of openings) {
    if (op.from > bCursor + 0.001) {
      const segLen = op.from - bCursor;
      baseSegs.push({ centerX: bCursor + segLen / 2, len: segLen });
    }
    bCursor = op.to;
  }
  if (length / 2 > bCursor + 0.001) {
    const segLen = length / 2 - bCursor;
    baseSegs.push({ centerX: bCursor + segLen / 2, len: segLen });
  }

  return (
    <group position={[cx, 0, cz]} rotation={[0, -angle, 0]}>
      {segs.map((seg, i) => {
        if (seg.transom) {
          // Transom: short box sitting at y > doorHeight, spanning the
          // opening width. Visually "the wall above the door".
          const transomHeight = ceilingHeight - doorHeight;
          if (transomHeight <= 0) return null;
          return (
            <mesh
              key={`transom-${i}`}
              castShadow
              receiveShadow
              position={[seg.centerX, doorHeight + transomHeight / 2, 0]}
            >
              <boxGeometry args={[seg.len, transomHeight, wallThickness]} />
              <meshStandardMaterial map={wallTex} color={color} roughness={0.82} />
            </mesh>
          );
        }
        return (
          <mesh
            key={`seg-${i}`}
            castShadow
            receiveShadow
            position={[seg.centerX, ceilingHeight / 2, 0]}
          >
            <boxGeometry args={[seg.len, ceilingHeight, wallThickness]} />
            <meshStandardMaterial map={wallTex} color={color} roughness={0.82} />
          </mesh>
        );
      })}
      {/* Baseboard trim — solid segments only, with gaps under each door. */}
      {baseSegs.map((seg, i) => (
        <mesh
          key={`base-${i}`}
          receiveShadow
          position={[seg.centerX, baseboardHeight / 2, 0]}
        >
          <boxGeometry args={[seg.len, baseboardHeight, baseboardThickness]} />
          <meshStandardMaterial
            color={baseboardColor}
            roughness={0.55}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  );
}

interface Device3DProps {
  device: Device;
  scale: number;
  /** Room ceiling height in meters — forwarded so ceiling-mount devices
   *  can render a mount stem that visually anchors them to the ceiling. */
  ceilingHeight: number;
  /** All walls on the floor. Used to snap-on-drag when a device is moved
   *  near a wall, matching the 2D canvas's wall-snap behavior. */
  walls: Wall[];
  /** Setter for the device's rotation — wall-snap also re-orients the
   *  device to face perpendicular to the wall. */
  onRotate: (radians: number) => void;
  /** Setter for the device's vertical mount height in meters. Updated
   *  when the user drags the green Y arrow on the transform gizmo. */
  onMountHeightChange: (mountHeight: number) => void;
  showCoverage: boolean;
  selected: boolean;
  editable: boolean;
  /** When true, clicking the device fires `onSelect` only — no drag, no
   *  gizmo. Used by the wire tool so the click sets a source/target
   *  endpoint instead of starting a position drag. */
  wireMode?: boolean;
  /** Switch the main scene into camera-POV mode looking through this
   *  device. Only relevant for cameras — the floating POV button is
   *  only rendered when the device is a camera. */
  onEnterPov: () => void;
  /** True iff this device is the current POV target. Hides the mesh so
   *  we're not staring at the inside of the camera's own dome. */
  isPovTarget?: boolean;
  onSelect: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onMove: (positionPx: { x: number; y: number }) => void;
}

function Device3D({
  device,
  scale,
  ceilingHeight,
  walls,
  onRotate,
  onMountHeightChange,
  showCoverage,
  selected,
  editable,
  wireMode,
  onEnterPov,
  isPovTarget,
  onSelect,
  onDragStateChange,
  onMove,
}: Device3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const dragOffsetRef = useRef<{ x: number; z: number } | null>(null);
  // Held in state (not just ref) so the TransformControls below remounts
  // once the group is actually in the scene graph — drei's
  // TransformControls needs a real THREE.Object3D, not null.
  const [groupNode, setGroupNode] = useState<THREE.Group | null>(null);

  const px = device.position.x / scale;
  const pz = device.position.y / scale;
  const py = device.mountHeight;
  // Respect the per-device color override (set in the Properties panel) so
  // the 3D mesh accent matches the 2D marker. Falls back to the type default.
  const baseColor = device.customColor ?? DEVICE_COLORS[device.type];
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
    // Wire mode: don't start a drag. The click is just for picking the
    // source / target device endpoint.
    if (wireMode) return;
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
    // Floor-plan pixel candidate
    const pxCandidate = { x: newWx * scale, y: newWz * scale };

    // Wall snap — only for wall-mountable kinds (matches the 2D behavior).
    // Threshold ~0.7m / offset ~0.18m in pixels.
    const wallMountable =
      device.type === "camera" ||
      device.type === "reader" ||
      device.type === "sensor";
    if (wallMountable && walls.length > 0) {
      const snapThresholdPx = Math.max(28, scale * 0.7);
      const offsetPx = Math.max(8, scale * 0.18);
      const snap = snapToNearestWall(pxCandidate, walls, snapThresholdPx, offsetPx);
      if (snap) {
        onMove(snap.position);
        onRotate(snap.rotation);
        return;
      }
    }
    onMove(pxCandidate);
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
    <>
    <group
      ref={(node) => {
        groupRef.current = node;
        setGroupNode(node);
      }}
      position={[px, py, pz]}
      userData={{ deviceId: device.id }}
    >
      {/* Interactive part — only the device body itself catches pointer
          events. Floor decals are siblings outside this group, so a click
          on the floor ring just dismisses through to OrbitControls.
          userData.deviceId is also set on the outer group above so the
          walk-mode crosshair raycaster can identify any descendant mesh
          as belonging to this device. */}
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
        {/* Yaw + tilt wrappers — yaw spins the device horizontally, tilt
            pitches it around its local X axis. We apply both at this
            wrapper level so the rotation order is well-defined and the
            FOV cone (drawn alongside the mesh in sim mode) inherits the
            same orientation. DeviceMesh subtypes that previously applied
            their own yaw now expect yaw=0 from outside. */}
        <group rotation={[0, -device.rotation, 0]}>
          <group rotation={[device.tilt ?? 0, 0, 0]}>
            {/* Hide this camera's mesh while we're looking through it —
                otherwise the virtual camera ends up inside the tinted-
                glass dome and the view is blocked by the dome's
                backface. Other devices' meshes still render. */}
            {!isPovTarget && (
              <DeviceMesh
                device={device}
                accent={accent}
                emissiveIntensity={emissiveIntensity}
                ceilingHeight={ceilingHeight}
              />
            )}
          </group>
        </group>
      </group>

      {/* Floating POV button — hovers above the camera body. Click to
          flip the scene into camera-POV mode (red viewfinder corners,
          framed by the camera's real FOV). Cameras only; hidden during
          walk/POV/sim and during wire mode. */}
      {device.type === "camera" && editable && !wireMode && (
        <Html
          position={[0, 0.5, 0]}
          center
          distanceFactor={6}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: "auto" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEnterPov();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="group flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-zinc-900/90 px-2.5 py-1 text-[0.7rem] font-medium text-white shadow-lg backdrop-blur transition-all hover:scale-105 hover:border-rose-400/60 hover:bg-zinc-900"
            aria-label="View through this camera"
            title="View through this camera"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-rose-400"
            >
              <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>POV</span>
          </button>
        </Html>
      )}

      {detecting && (
        <>
          <pointLight
            position={[0, 0, 0]}
            color={accent}
            intensity={1.4}
            distance={4}
          />
          {/* Detection pulse — a pair of pulsing rings under the camera body
              that breathe outwards. Reads from any angle, signals "this
              device is firing right now". */}
          <CameraDetectionPulse />
          {/* Cameras-only flourishes when actively detecting: a spinning
              scanner ring around the lens and a blinking REC dot above
              the body. Skipped for readers/sensors/network so each device
              type still has its own visual language. */}
          {device.type === "camera" && (
            <>
              <CameraLensScanner />
              <CameraRecDot />
            </>
          )}
        </>
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

    {/* TinkerCad-style transform gizmo on the SELECTED device — colored
        X/Z arrows for precision movement. Disables OrbitControls while
        being dragged (drei handles that via `dragging-changed`). Hidden
        in walk/POV, during sim, and during wire mode. */}
    {selected && editable && !wireMode && groupNode && (
      <TransformControls
        object={groupNode}
        mode="translate"
        // All three axes visible: red X (horizontal), green Y (vertical
        // mount height), blue Z (horizontal). The green arrow is what
        // pros use to dial in exact mount heights (1.2 m readers, 2.7 m
        // ceiling-mount cameras, etc.).
        showX
        showY
        showZ
        size={0.7}
        onMouseDown={() => onDragStateChange(true)}
        onMouseUp={() => onDragStateChange(false)}
        onObjectChange={() => {
          if (!groupNode) return;
          const wx = groupNode.position.x;
          const wy = groupNode.position.y;
          const wz = groupNode.position.z;
          // Always commit the vertical change first — Y maps directly to
          // mountHeight and is independent of wall snap.
          if (Math.abs(wy - device.mountHeight) > 0.001) {
            // Clamp to a sane range: floor + small clearance up to
            // ceiling + a bit (for pendant-style mounts that hang a hair
            // above the ceiling plane).
            const clamped = Math.max(0.05, Math.min(ceilingHeight + 0.3, wy));
            onMountHeightChange(Math.round(clamped * 100) / 100);
          }
          const pxCandidate = { x: wx * scale, y: wz * scale };
          const wallMountable =
            device.type === "camera" ||
            device.type === "reader" ||
            device.type === "sensor";
          if (wallMountable && walls.length > 0) {
            const snapThresholdPx = Math.max(28, scale * 0.7);
            const offsetPx = Math.max(8, scale * 0.18);
            const snap = snapToNearestWall(
              pxCandidate,
              walls,
              snapThresholdPx,
              offsetPx,
            );
            if (snap) {
              onMove(snap.position);
              onRotate(snap.rotation);
              // Pull the gizmo back to the snapped world position so the
              // arrows don't drift off the device while the user keeps
              // dragging.
              groupNode.position.x = snap.position.x / scale;
              groupNode.position.z = snap.position.y / scale;
              return;
            }
          }
          onMove(pxCandidate);
        }}
      />
    )}
    </>
  );
}

/**
 * Two concentric ground rings that breathe outward from a camera that's
 * currently detecting the subject. Lives below the camera so it's visible
 * from any orbit angle. Uses useFrame to mutate material opacity + ring
 * scale in place — no React re-renders per frame.
 */
function CameraDetectionPulse() {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const mat1 = useRef<THREE.MeshBasicMaterial>(null);
  const mat2 = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    // Two phased rings — second one is half a cycle ahead so the camera
    // never goes "blank" between pulses.
    const tA = (clock.elapsedTime * 1.3) % 1;
    const tB = (clock.elapsedTime * 1.3 + 0.5) % 1;
    const apply = (
      mesh: THREE.Mesh | null,
      mat: THREE.MeshBasicMaterial | null,
      t: number,
    ) => {
      if (!mesh || !mat) return;
      // Scale from 0.6 → 1.5, opacity from 0.65 → 0.
      mesh.scale.setScalar(0.6 + t * 0.9);
      mat.opacity = 0.65 * (1 - t);
    };
    apply(ring1.current, mat1.current, tA);
    apply(ring2.current, mat2.current, tB);
  });

  return (
    <group>
      <mesh
        ref={ring1}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        raycast={() => null}
      >
        <ringGeometry args={[0.22, 0.3, 32]} />
        <meshBasicMaterial
          ref={mat1}
          color="#ef4444"
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={ring2}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        raycast={() => null}
      >
        <ringGeometry args={[0.22, 0.3, 32]} />
        <meshBasicMaterial
          ref={mat2}
          color="#ef4444"
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Thin red ring spinning around the camera body — reads as a scanner
 * actively sweeping. Drawn slightly forward of the camera body so it's
 * visible from most orbit angles without z-fighting.
 */
function CameraLensScanner() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    // Tumble on two axes so the ring reads as 3D, not just a flat hoop.
    ref.current.rotation.z = clock.elapsedTime * 2.2;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 1.1) * 0.5;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0]} raycast={() => null}>
      <torusGeometry args={[0.18, 0.012, 8, 36]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.9} />
    </mesh>
  );
}

/**
 * Small blinking "REC" dot perched above the camera body. Pure emissive
 * sphere — no light bake, just a visible red bead that pulses opacity
 * like a real recording indicator.
 */
function CameraRecDot() {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    // Square wave-ish blink — strong on/off rather than sine fade.
    const phase = (clock.elapsedTime * 1.8) % 1;
    matRef.current.opacity = phase < 0.55 ? 1 : 0.25;
  });
  return (
    <mesh position={[0.08, 0.12, 0]} raycast={() => null}>
      <sphereGeometry args={[0.026, 12, 12]} />
      <meshBasicMaterial ref={matRef} color="#ef4444" transparent opacity={1} />
    </mesh>
  );
}

// ───────────────────────── Time-of-day helpers ─────────────────────────

/**
 * Keeps the renderer's tone-mapping exposure in sync with the current
 * time-of-day. Lives inside the Canvas tree so it has direct access to
 * the WebGLRenderer via useThree, but renders no geometry.
 *
 * Without this, the initial onCreated exposure baked in at first render
 * and switching modes wouldn't take effect until the next remount.
 */
function ToneMapKeeper({ exposure }: { exposure: number }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

/**
 * Auto-grids warm point lights along the ceiling of the wall bounding box.
 * Real ceiling pendants — light "fills" each room because walls occlude,
 * and the warm 0xffcc88 color reads as incandescent/2700K fixtures.
 *
 * One light per ~4m cell keeps the count low (10–20 lights for a typical
 * office floor) so we don't blow past WebGL's light-uniform limit.
 */
function InteriorLights({
  walls,
  scale,
  ceilingHeight,
  intensity,
}: {
  walls: Wall[];
  scale: number;
  ceilingHeight: number;
  intensity: number;
}) {
  if (walls.length === 0) return null;
  // Wall bounding box in world (meter) coordinates.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const w of walls) {
    const ax = w.start.x / scale;
    const az = w.start.y / scale;
    const bx = w.end.x / scale;
    const bz = w.end.y / scale;
    minX = Math.min(minX, ax, bx);
    maxX = Math.max(maxX, ax, bx);
    minZ = Math.min(minZ, az, bz);
    maxZ = Math.max(maxZ, az, bz);
  }
  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (width <= 0 || depth <= 0) return null;

  // Step ~4 meters, but cap the total grid so we never spawn more than
  // ~24 point lights (WebGL/three default uniform budget pain otherwise).
  const STEP_M = 4;
  let nx = Math.max(1, Math.floor(width / STEP_M));
  let nz = Math.max(1, Math.floor(depth / STEP_M));
  while (nx * nz > 24) {
    if (nx >= nz) nx = Math.max(1, nx - 1);
    else nz = Math.max(1, nz - 1);
  }
  const stepX = width / (nx + 1);
  const stepZ = depth / (nz + 1);
  const lightY = ceilingHeight - 0.15; // just below the ceiling

  const lights: React.ReactNode[] = [];
  for (let i = 1; i <= nx; i++) {
    for (let j = 1; j <= nz; j++) {
      const x = minX + i * stepX;
      const z = minZ + j * stepZ;
      lights.push(
        <pointLight
          key={`pl-${i}-${j}`}
          position={[x, lightY, z]}
          intensity={intensity}
          distance={6}
          decay={2}
          color="#ffcc88"
        />,
      );
      // Small emissive disc representing the visible fixture itself, so
      // the light source has a body when you look up.
      lights.push(
        <mesh key={`pf-${i}-${j}`} position={[x, lightY + 0.1, z]} raycast={() => null}>
          <cylinderGeometry args={[0.08, 0.08, 0.01, 16]} />
          <meshStandardMaterial
            color="#fff5cc"
            emissive="#ffcc88"
            emissiveIntensity={1.4}
          />
        </mesh>,
      );
    }
  }
  return <group>{lights}</group>;
}

/**
 * Glowing "window" strips along a wall, one per ~2.5 m of wall length on
 * each face. Pure emissive planes — they don't actually cast light, but
 * combined with the warmer tone-mapping exposure and the wall material's
 * own reflection at night, they read convincingly as lit windows when
 * the camera orbits around the building.
 */
function WindowGlow({
  wall,
  scale,
  ceilingHeight,
  intensity,
}: {
  wall: Wall;
  scale: number;
  ceilingHeight: number;
  intensity: number;
}) {
  const start = { x: wall.start.x / scale, z: wall.start.y / scale };
  const end = { x: wall.end.x / scale, z: wall.end.y / scale };
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  // Skip short walls entirely — windows on every closet wall looked
  // chaotic. Only longer walls (≥ 6m) get windows now, so they read
  // as "just a few rooms with lights on" instead of a fully-glassed
  // facade.
  if (length < 6) return null;
  const angle = Math.atan2(dz, dx);
  const cx = (start.x + end.x) / 2;
  const cz = (start.z + end.z) / 2;

  // Even sparser placement: one window per ~8 m, slightly smaller panes.
  const SPACING = 8;
  const winW = 0.65;
  const winH = 0.8;
  const winY = ceilingHeight * 0.55;
  const count = Math.max(1, Math.floor((length - 2) / SPACING));
  const totalSpan = (count - 1) * SPACING;
  const startOffset = -totalSpan / 2;

  // Push the panes a bit further off the wall surface so they don't
  // z-fight the wall mesh during orbit (which was making them flicker
  // black). Wall is 0.15 thick → half-thickness 0.075; we sit at 0.12
  // for clear separation.
  const wallThicknessHalf = 0.12;

  const panels: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const localX = startOffset + i * SPACING;
    // One pane on each side of the wall so the glow is visible from
    // inside AND outside as the camera orbits.
    for (const side of [+1, -1] as const) {
      panels.push(
        <mesh
          key={`win-${i}-${side}`}
          position={[localX, winY, side * wallThicknessHalf]}
          rotation={[0, side === 1 ? 0 : Math.PI, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[winW, winH]} />
          <meshStandardMaterial
            color="#fff2c8"
            emissive="#ffd07a"
            emissiveIntensity={intensity}
            roughness={0.65}
            // Double-sided so the pane stays visible at every orbit
            // angle (otherwise BackFace culling drops it for a frame
            // when the camera crosses the wall plane = the flicker).
            side={THREE.DoubleSide}
            // Polygon offset prevents z-fight with the wall mesh behind.
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>,
      );
      // Subtle frame around each window — a darker thin rectangle behind
      // the pane so it doesn't look like a floating yellow patch.
      panels.push(
        <mesh
          key={`winframe-${i}-${side}`}
          position={[localX, winY, side * (wallThicknessHalf - 0.005)]}
          rotation={[0, side === 1 ? 0 : Math.PI, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[winW + 0.08, winH + 0.08]} />
          <meshStandardMaterial
            color="#1f1812"
            roughness={0.7}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>,
      );
    }
  }
  return (
    <group position={[cx, 0, cz]} rotation={[0, -angle, 0]}>
      {panels}
    </group>
  );
}

/**
 * Cherry-blossom petals drifting through the scene. Pure ambient detail —
 * a small particle system of soft-pink petal sprites that spawn above the
 * wall bounding box and float downward with a gentle sway. Petals respawn
 * at the top when they hit the floor, so the effect is continuous.
 *
 * Each petal is a flat plane with a procedural petal-shaped texture, so
 * we don't need to ship a sprite image.
 */
function SakuraPetals({
  walls,
  scale,
  ceilingHeight,
  count = 30,
}: {
  walls: Wall[];
  scale: number;
  ceilingHeight: number;
  count?: number;
}) {
  // Spawn volume — much wider than the building so petals drift through
  // the orbit camera's field of view from any angle. The previous tight
  // wall bounding box meant most petals were hidden behind the building.
  const bounds = useMemo(() => {
    if (walls.length === 0) {
      return { minX: -15, maxX: 15, minZ: -15, maxZ: 15, cx: 0, cz: 0 };
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of walls) {
      const ax = w.start.x / scale;
      const az = w.start.y / scale;
      const bx = w.end.x / scale;
      const bz = w.end.y / scale;
      minX = Math.min(minX, ax, bx);
      maxX = Math.max(maxX, ax, bx);
      minZ = Math.min(minZ, az, bz);
      maxZ = Math.max(maxZ, az, bz);
    }
    // Modest overshoot — wide enough that petals fall outside the
    // building too, but not so wide that 90% of them are off-camera.
    const padX = Math.max(3, (maxX - minX) * 0.35);
    const padZ = Math.max(3, (maxZ - minZ) * 0.35);
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minZ: minZ - padZ,
      maxZ: maxZ + padZ,
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
    };
  }, [walls, scale]);
  // Spawn a bit above the building so petals visibly descend through
  // the camera view, but not so high they spend ages out-of-frame.
  const topY = Math.max(ceilingHeight + 5, 8);

  // Per-petal state — randomized once on mount, then re-randomized when
  // a petal lands on the floor. Petals are MUCH bigger now (0.18–0.32m
  // wide) so they actually read as petals from orbit distance instead of
  // single-pixel dots.
  const petals = useMemo(() => {
    const rng = () => Math.random();
    return Array.from({ length: count }).map(() => ({
      x: bounds.minX + rng() * (bounds.maxX - bounds.minX),
      // Start with petals already mid-fall so the scene looks alive
      // immediately, not "wait 5 seconds for first petal to appear".
      y: rng() * topY,
      z: bounds.minZ + rng() * (bounds.maxZ - bounds.minZ),
      vx: (rng() - 0.5) * 0.55,
      vy: -0.28 - rng() * 0.22, // slower fall = more visible drift time
      vz: (rng() - 0.5) * 0.55,
      swayPhase: rng() * Math.PI * 2,
      swaySpeed: 0.6 + rng() * 0.5,
      swayAmp: 0.45 + rng() * 0.55,
      rot: rng() * Math.PI * 2,
      rotSpeed: (rng() - 0.5) * 1.2,
      // Bumped from the original tiny petals so they actually catch the
      // eye at orbit distance — 0.16–0.28 half-size → 0.32–0.56m wide.
      size: 0.16 + rng() * 0.12,
    }));
  }, [count, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, topY]);

  const groupRef = useRef<THREE.Group>(null);
  // Shared petal texture — small canvas with a soft pink five-lobed shape.
  const petalTexture = useMemo(() => buildPetalTexture(), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.08);
    const grp = groupRef.current;
    if (!grp) return;
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      const child = grp.children[i] as THREE.Mesh | undefined;
      if (!child) continue;
      // Sway: x velocity oscillates around its base, so petals look like
      // they're catching the wind. z velocity stays constant.
      const sway =
        Math.sin(state.clock.elapsedTime * p.swaySpeed + p.swayPhase) *
        p.swayAmp;
      p.x += (p.vx + sway) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.rotSpeed * dt;
      if (p.y <= 0.05) {
        // Respawn at top in a random horizontal position.
        p.x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        p.y = topY + Math.random() * 2;
        p.z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
        p.vx = (Math.random() - 0.5) * 0.4;
        p.vy = -0.45 - Math.random() * 0.4;
        p.vz = (Math.random() - 0.5) * 0.4;
      }
      child.position.set(p.x, p.y, p.z);
      child.rotation.set(p.rot * 0.4, p.rot, p.rot * 0.3);
    }
  });

  return (
    <group ref={groupRef} raycast={() => null}>
      {petals.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <planeGeometry args={[p.size * 2, p.size * 2]} />
          <meshBasicMaterial
            map={petalTexture}
            transparent
            opacity={1}
            depthWrite={false}
            side={THREE.DoubleSide}
            color="#ffc4d8"
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Procedural 64×64 cherry-blossom petal sprite — a soft pink 5-lobed
 * cluster on a transparent background. Cached so all petals share one
 * texture instance.
 */
function buildPetalTexture(): THREE.CanvasTexture {
  const SIZE = 64;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, SIZE, SIZE);
  // Draw 5 overlapping petal-shaped ellipses around the center, each
  // with a soft pink radial gradient that fades to transparent.
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  // All-pink palette — no golden/peach center. Each petal has a soft
  // white tip fading through a strong sakura pink, with darker pink at
  // the petal base so the 5-petal "flower" shape reads clearly.
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * SIZE * 0.22;
    const py = cy + Math.sin(angle) * SIZE * 0.22;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, SIZE * 0.34);
    grad.addColorStop(0, "rgba(255, 240, 248, 1)");
    grad.addColorStop(0.5, "rgba(255, 170, 200, 1)");
    grad.addColorStop(0.85, "rgba(236, 110, 165, 0.7)");
    grad.addColorStop(1, "rgba(219, 70, 145, 0)");
    ctx.fillStyle = grad;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.beginPath();
    // Slight notch at the tip — real sakura petals are bilobed. Approx
    // with a teardrop ellipse + a tiny dark notch overlay.
    ctx.ellipse(0, 0, SIZE * 0.21, SIZE * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Soft pink center (instead of gold). Adds depth where petals overlap.
  const centerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, SIZE * 0.12);
  centerGrad.addColorStop(0, "rgba(255, 220, 235, 1)");
  centerGrad.addColorStop(1, "rgba(255, 200, 220, 0)");
  ctx.fillStyle = centerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, SIZE * 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Five tiny darker-pink stamens around the center for the iconic
  // sakura look.
  ctx.fillStyle = "rgba(220, 90, 140, 0.9)";
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sx = cx + Math.cos(a) * SIZE * 0.05;
    const sy = cy + Math.sin(a) * SIZE * 0.05;
    ctx.beginPath();
    ctx.arc(sx, sy, SIZE * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Manual cable rendered in 3D. Goes from source device, up to ceiling
 * plenum, along the waypoints (also at ceiling height), then down to
 * the target device. Color matches the 2D rendering.
 */
function ManualCable3D({
  cable,
  devices,
  scale,
  ceilingHeight,
}: {
  cable: import("@/types/design").Cable;
  devices: Device[];
  scale: number;
  ceilingHeight: number;
}) {
  const src = devices.find((d) => d.id === cable.sourceDeviceId);
  const tgt = devices.find((d) => d.id === cable.targetDeviceId);
  if (!src || !tgt) return null;
  const cableColors = (
    cable.color ? cable.color : undefined
  ) as string | undefined;
  const TYPE_TO_COLOR: Record<string, string> = {
    cat6: "#2563eb",
    cat6a: "#1d4ed8",
    fiber: "#f97316",
    "22-4": "#0f172a",
    "18-2": "#71717a",
    "16-2": "#52525b",
    rg59: "#dc2626",
    "speaker-16-2": "#84cc16",
  };
  const color = cableColors ?? TYPE_TO_COLOR[cable.type] ?? "#2563eb";

  // Ceiling-plenum routing: rise from source device → ceiling, traverse
  // through waypoints at ceiling height, drop to target device.
  const sx = src.position.x / scale;
  const sz = src.position.y / scale;
  const tx = tgt.position.x / scale;
  const tz = tgt.position.y / scale;
  const cy = Math.max(0.2, ceilingHeight - 0.2);
  const points: THREE.Vector3[] = [
    new THREE.Vector3(sx, src.mountHeight, sz),
    new THREE.Vector3(sx, cy, sz),
  ];
  for (const w of cable.waypoints) {
    points.push(new THREE.Vector3(w.x / scale, cy, w.y / scale));
  }
  points.push(new THREE.Vector3(tx, cy, tz));
  points.push(new THREE.Vector3(tx, tgt.mountHeight, tz));

  const geom = new THREE.BufferGeometry().setFromPoints(points);

  // Build a dashed line so 3D cables match the 2D dashed-and-thick
  // style. computeLineDistances() is required for LineDashedMaterial
  // to actually render the dashes correctly.
  const line = new THREE.Line(
    geom,
    new THREE.LineDashedMaterial({
      color,
      dashSize: 0.18,
      gapSize: 0.12,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
    }),
  );
  line.computeLineDistances();

  return <primitive object={line} />;
}

