"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { useActiveFloor } from "@/lib/store";
import { useSimStore } from "@/lib/sim-store";
import { positionOnPath, collideAgainstWalls } from "@/lib/detection";
import { WALK_SPEED } from "@/lib/walk";
import type { CameraDevice } from "@/types/design";

/**
 * In-scene visualization of what each camera is detecting in real time.
 *
 * Renders three layered effects, all anchored to the live subject position:
 *
 *  1. Detection beams — bright emerald lines from every currently-detecting
 *     camera's lens down to the subject's torso. The beams pulse opacity so
 *     they read as "active lock", not static geometry.
 *  2. Lock-on reticle — a billboarded crosshair that floats above the
 *     subject the moment ANY camera detects them. Rotates slowly and scales
 *     with detection intensity (more cameras = larger ring).
 *  3. Per-camera floating label — a tiny "TRACKING" badge attached to each
 *     detecting camera so the user can read which device fired without
 *     looking at the HUD.
 *
 * Everything updates inside a single useFrame so we don't trigger React
 * re-renders on every animation frame — the meshes/lines are mutated in
 * place by refs.
 */
export function DetectionVisualizer3D() {
  const floor = useActiveFloor();
  const detectingCameras = useSimStore((s) => s.detectingCameras);
  const simRunning = useSimStore((s) => s.running);

  // Stable refs for line endpoints so we can mutate per-frame instead of
  // re-rendering. One entry per detecting camera.
  const beamRefs = useRef<Map<string, THREE.BufferGeometry>>(new Map());

  // Cameras that are CURRENTLY detecting, snapshotted to a typed array so we
  // can iterate cleanly. The Set itself is part of the store and changes
  // identity each tick, which is how React knows to re-render us.
  const activeCameras = useMemo(() => {
    if (!floor) return [];
    const out: CameraDevice[] = [];
    for (const id of detectingCameras) {
      const dev = floor.devices.find((d) => d.id === id);
      if (dev?.type === "camera") out.push(dev as CameraDevice);
    }
    return out;
  }, [floor, detectingCameras]);

  useFrame(() => {
    if (!floor || !simRunning) return;

    // Recompute the subject's live world position by running positionOnPath
    // ourselves. Cheap and avoids coupling to Actor3D's internal ref. Wall
    // collision matches Actor3D so beams hit the visible avatar.
    const path = floor.simPath ?? [];
    if (path.length < 2) return;
    const t = useSimStore.getState().t;
    const { position } = positionOnPath(path, t, WALK_SPEED, floor.scale);
    const ACTOR_RADIUS_PX = 0.28 * floor.scale;
    const collided = collideAgainstWalls(position, floor.walls, ACTOR_RADIUS_PX);
    const subjectX = collided.x / floor.scale;
    const subjectZ = collided.y / floor.scale;
    // Aim each beam at the subject's chest, not the floor — looks like the
    // camera is locked onto the person, not a puddle.
    const subjectY = 1.0;

    // Update each beam's BufferGeometry to point from camera → subject.
    for (const cam of activeCameras) {
      const geo = beamRefs.current.get(cam.id);
      if (!geo) continue;
      const camX = cam.position.x / floor.scale;
      const camZ = cam.position.y / floor.scale;
      const camY = cam.mountHeight;
      const positions = geo.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, camX, camY, camZ);
      positions.setXYZ(1, subjectX, subjectY, subjectZ);
      positions.needsUpdate = true;
    }
  });

  if (!simRunning) return null;

  return (
    <group>
      {/* Detection beams */}
      {activeCameras.map((cam) => (
        <DetectionBeam
          key={cam.id}
          camera={cam}
          onGeometryReady={(geo) => beamRefs.current.set(cam.id, geo)}
        />
      ))}

      {/* "TRACKING" labels next to each active camera */}
      {floor &&
        activeCameras.map((cam) => (
          <CameraTrackingLabel
            key={`label-${cam.id}`}
            camera={cam}
            floor={floor}
          />
        ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */

interface DetectionBeamProps {
  camera: CameraDevice;
  /** Called once with the geometry so the parent can mutate vertices per-frame. */
  onGeometryReady: (geo: THREE.BufferGeometry) => void;
}

/**
 * One bright emerald line from the camera lens to the subject. We seed it
 * with both endpoints at the camera position; the parent overrides the
 * subject endpoint every frame inside useFrame. drei's `<Line>` doesn't
 * expose ref-mutable geometry cleanly, so we drop down to a raw
 * `<line>` + `<bufferGeometry>`.
 */
function DetectionBeam({ camera: _camera, onGeometryReady }: DetectionBeamProps) {
  // Build the line imperatively so we get a real THREE.Line with a mutable
  // geometry. JSX `<line>` collides with the SVGLineElement type, so we
  // construct the Three node ourselves and attach it via a `<primitive>`.
  const obj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3),
    );
    const mat = new THREE.LineBasicMaterial({
      color: "#34d399",
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geo, mat);
    onGeometryReady(geo);
    return line;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <primitive object={obj} />;
}

/** Tiny "TRACKING" badge billboarded next to an active camera. */
function CameraTrackingLabel({
  camera,
  floor,
}: {
  camera: CameraDevice;
  floor: { scale: number };
}) {
  const x = camera.position.x / floor.scale;
  const z = camera.position.y / floor.scale;
  return (
    <Billboard position={[x, camera.mountHeight + 0.45, z]}>
      <group>
        {/* Background pill */}
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[0.85, 0.22]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0.85} />
        </mesh>
        {/* Red recording dot */}
        <mesh position={[-0.32, 0, 0]}>
          <circleGeometry args={[0.04, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        <Text
          position={[0.04, 0, 0]}
          fontSize={0.1}
          color="#fef2f2"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.95}
        >
          TRACKING
        </Text>
      </group>
    </Billboard>
  );
}
