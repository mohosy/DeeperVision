"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Material-lightening pass: traverse the device mesh once on first frame,
 * find any non-emissive MeshStandardMaterials with a near-black housing
 * color, and lift them into a mid-grey. This is preview-only — each R3F
 * canvas has its own material instances so the main 3D scene keeps its
 * darker, more realistic housings while the 56px library cards get
 * legible silhouettes.
 */
function LightenHousings({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const doneRef = useRef(false);
  useFrame(() => {
    if (doneRef.current || !groupRef.current) return;
    const seen = new Set<THREE.Material>();
    groupRef.current.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (seen.has(mat)) return;
      seen.add(mat);
      const e = mat.emissive;
      const isEmissive = e.r > 0.05 || e.g > 0.05 || e.b > 0.05;
      if (isEmissive) return; // keep lens iris and LEDs as-is
      const hsl = { h: 0, s: 0, l: 0 };
      mat.color.getHSL(hsl);
      if (hsl.l < 0.4) {
        // Lift dark housings into the 0.65-0.78 lightness range so they
        // read against any preview background, but desaturate slightly so
        // they don't compete with the accent color.
        mat.color.setHSL(
          hsl.h,
          hsl.s * 0.55,
          Math.min(0.78, hsl.l + 0.55)
        );
      }
    });
    doneRef.current = true;
  });
  return <group ref={groupRef}>{children}</group>;
}
import { DeviceMesh } from "@/components/scene3d/DeviceMesh";
import type {
  CameraDevice,
  Device,
  NetworkDeviceBase,
  ReaderDevice,
  SensorDevice,
} from "@/types/design";

/**
 * Small auto-rotating 3D preview of a device, used in the device-library
 * sidebar. Uses the exact same DeviceMesh that gets placed in the building
 * so the library preview never lies about what you're dropping.
 *
 * Framing is hand-picked per subtype rather than using drei's <Bounds>:
 * each device kind has its own "hero angle" + camera distance + initial
 * yaw so the most-recognizable face — dome bottom, bullet lens, reader
 * pad, NVR front — faces the viewer when the rotation starts.
 */

export type PreviewKind =
  | { type: "camera"; subtype: "dome" | "ptz" | "fixed" | "fisheye" }
  | { type: "reader"; subtype: "card" | "biometric" | "keypad" }
  | {
      type: "sensor";
      subtype: "motion" | "glass-break" | "door-contact" | "smoke";
    }
  | { type: "network"; subtype: "switch" | "access-point" | "nvr" };

const ACCENT_COLORS = {
  camera: "#10b981",
  reader: "#0ea5e9",
  sensor: "#f59e0b",
  network: "#8b5cf6",
} as const;

const BACKGROUND_TINTS = {
  camera: "#c5ecd4", // emerald 200-ish
  reader: "#bee0fa", // sky 200
  sensor: "#fde2a0", // amber 200
  network: "#d3c4f7", // violet 200
} as const;

interface PreviewLayout {
  /** Camera eye position in world space */
  cameraPos: [number, number, number];
  /** Where the camera looks */
  lookAt: [number, number, number];
  /** Initial yaw of the device so its interesting face starts toward camera */
  initialYaw: number;
  /** Uniform scale applied to the device — bigger = fills more of the card */
  scale: number;
  /** Field-of-view in degrees */
  fov: number;
}

const LAYOUTS: Record<string, PreviewLayout> = {
  // Cameras
  dome: {
    cameraPos: [0.55, 0.2, 0.85],
    lookAt: [0, -0.05, 0],
    initialYaw: 0,
    scale: 1.6,
    fov: 32,
  },
  fisheye: {
    cameraPos: [0.55, 0.2, 0.85],
    lookAt: [0, -0.05, 0],
    initialYaw: 0,
    scale: 1.6,
    fov: 32,
  },
  ptz: {
    cameraPos: [0.65, 0.15, 0.95],
    lookAt: [0, -0.05, 0],
    initialYaw: -0.45,
    scale: 1.55,
    fov: 32,
  },
  fixed: {
    cameraPos: [0.7, 0.2, 0.95],
    lookAt: [0, 0, 0],
    initialYaw: -0.55,
    scale: 1.35,
    fov: 32,
  },
  // Readers (wall-mount, deep along -X)
  card: {
    cameraPos: [0.85, 0.05, 0.55],
    lookAt: [0, 0, 0],
    initialYaw: -0.2,
    scale: 1.9,
    fov: 32,
  },
  biometric: {
    cameraPos: [0.85, 0.05, 0.55],
    lookAt: [0, 0, 0],
    initialYaw: -0.2,
    scale: 1.9,
    fov: 32,
  },
  keypad: {
    cameraPos: [0.85, 0.05, 0.55],
    lookAt: [0, 0, 0],
    initialYaw: -0.2,
    scale: 1.9,
    fov: 32,
  },
  // Sensors
  motion: {
    cameraPos: [0.4, 0.35, 0.6],
    lookAt: [0, 0, 0],
    initialYaw: 0,
    scale: 2.0,
    fov: 32,
  },
  "glass-break": {
    cameraPos: [0.7, 0.05, 0.45],
    lookAt: [0, 0, 0],
    initialYaw: -0.25,
    scale: 2.0,
    fov: 32,
  },
  "door-contact": {
    cameraPos: [0.7, 0.05, 0.45],
    lookAt: [0, 0, 0],
    initialYaw: -0.3,
    scale: 2.4,
    fov: 32,
  },
  smoke: {
    cameraPos: [0.4, 0.35, 0.6],
    lookAt: [0, 0, 0],
    initialYaw: 0,
    scale: 2.0,
    fov: 32,
  },
  // Network
  "access-point": {
    cameraPos: [0.45, 0.55, 0.55],
    lookAt: [0, 0, 0],
    initialYaw: 0,
    scale: 1.7,
    fov: 32,
  },
  switch: {
    cameraPos: [0.45, 0.4, 0.7],
    lookAt: [0, 0, 0],
    initialYaw: -0.3,
    scale: 1.2,
    fov: 32,
  },
  nvr: {
    cameraPos: [0.45, 0.4, 0.7],
    lookAt: [0, 0, 0],
    initialYaw: -0.3,
    scale: 1.2,
    fov: 32,
  },
};

function buildPreviewDevice(kind: PreviewKind): Device {
  const base = {
    id: `preview-${kind.type}-${kind.subtype}`,
    position: { x: 0, y: 0 },
    rotation: 0,
    mountHeight: 0,
    label: "",
    notes: "",
  };
  if (kind.type === "camera") {
    return {
      ...base,
      type: "camera",
      cameraType: kind.subtype,
      model: "Preview",
      fovDegrees: 90,
      rangeMeters: 12,
    } as CameraDevice;
  }
  if (kind.type === "reader") {
    return {
      ...base,
      type: "reader",
      readerType: kind.subtype,
    } as ReaderDevice;
  }
  if (kind.type === "sensor") {
    return {
      ...base,
      type: "sensor",
      sensorType: kind.subtype,
      rangeMeters: 8,
    } as SensorDevice;
  }
  return {
    ...base,
    type: "network",
    networkType: kind.subtype,
  } as NetworkDeviceBase;
}

function Rotator({
  children,
  initialYaw,
  speed = 0.3,
}: {
  children: React.ReactNode;
  initialYaw: number;
  speed?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * speed;
    }
  });
  return (
    <group ref={ref} rotation={[0, initialYaw, 0]}>
      {children}
    </group>
  );
}

export function DevicePreview3DCanvas({ kind }: { kind: PreviewKind }) {
  const device = buildPreviewDevice(kind);
  const accent = ACCENT_COLORS[device.type];
  const bg = BACKGROUND_TINTS[device.type];
  const layout = LAYOUTS[kind.subtype];

  // Wrap in an absolute-inset div so R3F's internal canvas always knows it
  // has 100% of the parent's size to fill. Without this wrapper the small
  // 56×56 container can fail to trigger R3F's ResizeObserver in time and the
  // canvas defaults to 300×150 — at which point our scene renders correctly
  // but at the wrong scale and gets cropped to almost nothing visible.
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        dpr={[1, 1.8]}
        camera={{
          position: layout.cameraPos,
          fov: layout.fov,
          near: 0.1,
          far: 10,
        }}
        gl={{ antialias: true }}
        onCreated={({ camera, gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.25;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          camera.lookAt(layout.lookAt[0], layout.lookAt[1], layout.lookAt[2]);
          camera.updateMatrixWorld(true);
        }}
        style={{ pointerEvents: "none" }}
      >
      <color attach="background" args={[bg]} />

      {/* Studio-grade lighting: strong ambient + warm key + cool fill +
         accent rim from behind. Whole thing tuned for small (~56px) previews
         viewed against light or dark sidebars. */}
      <ambientLight intensity={1.05} />
      <directionalLight
        position={[2, 3, 2.5]}
        intensity={1.7}
        color="#fff5d8"
      />
      <directionalLight
        position={[-2, 1.5, -1]}
        intensity={0.55}
        color="#cfe2ff"
      />
      <pointLight
        position={[0, 0.4, -1.2]}
        intensity={1.2}
        distance={3.5}
        color={accent}
      />
      <hemisphereLight args={["#ffffff", "#d4d4d8", 0.45]} />

        <Rotator initialYaw={layout.initialYaw} speed={0.28}>
          <group scale={layout.scale}>
            <LightenHousings>
              <DeviceMesh
                device={device}
                accent={accent}
                emissiveIntensity={1.25}
              />
            </LightenHousings>
          </group>
        </Rotator>
      </Canvas>
    </div>
  );
}
