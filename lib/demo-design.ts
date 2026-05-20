import type {
  CameraDevice,
  Floor,
  NetworkDeviceBase,
  ReaderDevice,
  SensorDevice,
  Wall,
} from "@/types/design";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Wall segments that mirror the lines drawn in /public/demo/office-floor.svg.
 * Coordinates are in floor-plan pixel space (SVG is 1200×800 at scale 50 px/m
 * → 24 m × 16 m office). When the demo floor loads, the SVG image gives the
 * 2D visual, and these walls give the 3D extrusion.
 */
function demoWalls(): Wall[] {
  const segments: Array<[number, number, number, number]> = [
    // Outer walls
    [40, 40, 1160, 40],
    [1160, 40, 1160, 760],
    [1160, 760, 40, 760],
    [40, 760, 40, 40],
    // Interior verticals
    [500, 40, 500, 320],
    [500, 420, 500, 760],
    [820, 40, 820, 380],
    [700, 380, 700, 760],
    // Interior horizontals
    [40, 320, 280, 320],
    [380, 320, 500, 320],
    [500, 380, 700, 380],
    [780, 380, 1160, 380],
  ];
  return segments.map(([x1, y1, x2, y2]) => ({
    id: uid("wall"),
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    height: 2.7,
  }));
}

/**
 * Sample devices placed across the rooms. Coordinates are in floor-plan pixels.
 * Rotations are in radians, 0 = facing +X. Mount heights in meters.
 */
function demoDevices(): Array<
  CameraDevice | ReaderDevice | SensorDevice | NetworkDeviceBase
> {
  return [
    // PTZ camera covering reception entrance
    {
      id: uid("dev"),
      type: "camera",
      cameraType: "ptz",
      model: "PTZ-4K",
      fovDegrees: 70,
      rangeMeters: 14,
      irRange: 18,
      resolution: "4K",
      position: { x: 460, y: 90 },
      rotation: Math.PI * 0.65,
      mountHeight: 2.8,
      label: "PTZ — Lobby",
      notes: "Covers main entrance",
    },
    // Dome camera in the open office, ceiling-mount
    {
      id: uid("dev"),
      type: "camera",
      cameraType: "dome",
      model: "Dome-2K",
      fovDegrees: 110,
      rangeMeters: 11,
      irRange: 12,
      resolution: "1080p",
      position: { x: 270, y: 540 },
      rotation: -Math.PI / 2,
      mountHeight: 2.7,
      label: "Office East",
      notes: "",
    },
    // Fixed camera in conference room
    {
      id: uid("dev"),
      type: "camera",
      cameraType: "fixed",
      model: "Fixed-2K",
      fovDegrees: 85,
      rangeMeters: 9,
      resolution: "1080p",
      position: { x: 780, y: 95 },
      rotation: Math.PI * 0.85,
      mountHeight: 2.7,
      label: "Conference",
      notes: "",
    },
    // Server room dome
    {
      id: uid("dev"),
      type: "camera",
      cameraType: "dome",
      model: "Dome-4K",
      fovDegrees: 100,
      rangeMeters: 8,
      irRange: 10,
      resolution: "4K",
      position: { x: 990, y: 210 },
      rotation: 0,
      mountHeight: 2.6,
      label: "Server Room",
      notes: "Critical asset",
    },
    // Card reader at main entrance
    {
      id: uid("dev"),
      type: "reader",
      readerType: "card",
      position: { x: 220, y: 740 },
      rotation: -Math.PI / 2,
      mountHeight: 1.2,
      label: "Entry reader",
      notes: "Main entrance",
    },
    // Card reader at server room
    {
      id: uid("dev"),
      type: "reader",
      readerType: "biometric",
      position: { x: 820, y: 230 },
      rotation: 0,
      mountHeight: 1.2,
      label: "Server door",
      notes: "Biometric, after-hours only",
    },
    // Motion sensor in the lounge
    {
      id: uid("dev"),
      type: "sensor",
      sensorType: "motion",
      rangeMeters: 9,
      position: { x: 930, y: 580 },
      rotation: 0,
      mountHeight: 2.4,
      label: "Lounge motion",
      notes: "",
    },
    // Glass-break in the conference room window wall
    {
      id: uid("dev"),
      type: "sensor",
      sensorType: "glass-break",
      rangeMeters: 6,
      position: { x: 660, y: 110 },
      rotation: 0,
      mountHeight: 2.4,
      label: "Window glass-break",
      notes: "",
    },
    // WiFi access point in the open office (PoE)
    {
      id: uid("dev"),
      type: "network",
      networkType: "access-point",
      coverageMeters: 16,
      position: { x: 360, y: 600 },
      rotation: 0,
      mountHeight: 2.7,
      label: "AP — Office",
      notes: "Wi-Fi 6",
    },
    // NVR in server room
    {
      id: uid("dev"),
      type: "network",
      networkType: "nvr",
      position: { x: 1050, y: 280 },
      rotation: 0,
      mountHeight: 1.4,
      label: "NVR",
      notes: "32 channels",
    },
  ];
}

export function buildDemoFloor(): Omit<Floor, "id" | "index"> {
  return {
    name: "Ground floor — demo office",
    planImage: "/demo/office-floor.svg",
    scale: 50,
    ceilingHeight: 3.0,
    walls: demoWalls(),
    devices: demoDevices(),
  };
}
