"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { CameraDevice } from "@/types/design";

/**
 * Renders camera FOV cones flat on the floor during simulation mode. The
 * mesh is a custom triangle-fan BufferGeometry rather than the built-in
 * CircleGeometry — that combination has been historically flaky in our
 * scene when mixed with other transparent meshes, so we lay out vertices
 * explicitly and keep the material parameters conservative.
 */
export function CameraFOV3D({
  cameras,
  scale,
  detectingIds,
}: {
  cameras: CameraDevice[];
  scale: number;
  detectingIds: Set<string>;
}) {
  return (
    <>
      {cameras.map((cam) => (
        <SingleFOV
          key={cam.id}
          camera={cam}
          scale={scale}
          detecting={detectingIds.has(cam.id)}
        />
      ))}
    </>
  );
}

function SingleFOV({
  camera,
  scale,
  detecting,
}: {
  camera: CameraDevice;
  scale: number;
  detecting: boolean;
}) {
  const geometry = useMemo(() => {
    const halfFov = (camera.fovDegrees / 2) * (Math.PI / 180);
    const segments = Math.max(10, Math.round(camera.fovDegrees / 3));
    const range = camera.rangeMeters;
    const positions: number[] = [];
    const indices: number[] = [];
    // Apex at origin, fan of arc points at range
    positions.push(0, 0, 0);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = -halfFov + t * halfFov * 2;
      positions.push(Math.cos(a) * range, 0, Math.sin(a) * range);
    }
    for (let i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3)
    );
    g.setIndex(indices);
    g.computeBoundingSphere();
    return g;
  }, [camera.fovDegrees, camera.rangeMeters]);

  const px = camera.position.x / scale;
  const pz = camera.position.y / scale;
  const color = detecting ? "#34d399" : "#fde68a";
  const opacity = detecting ? 0.42 : 0.18;
  // Inherit the device's pitch (tilt) so the FOV wedge visibly aims
  // up/down in 3D space. The yaw spins it horizontally as before.
  // Anchor the wedge at the camera's actual mount height when tilt is
  // non-zero so it pivots in the correct world location.
  const tilt = camera.tilt ?? 0;
  const anchorY = tilt !== 0 ? camera.mountHeight : 0.04;

  return (
    <group position={[px, anchorY, pz]} rotation={[0, -camera.rotation, 0]}>
      <group rotation={[0, 0, tilt]}>
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
