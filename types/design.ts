export type Vec2 = { x: number; y: number };

export type ViewMode = "2d" | "3d" | "sim";
export type ThreeDMode = "orbit" | "walk" | "pov";

/** Lighting / atmosphere preset for the 3D scene. Pure visual treatment —
 *  doesn't affect device data. Night was removed: the scene reads as
 *  Japanese-garden-style daytime + a softer sunset. */
export type TimeOfDay = "day" | "dusk";

export type DeviceType = "camera" | "reader" | "sensor" | "network";

export type CameraSubtype =
  | "fixed"
  | "ptz"
  | "dome"
  | "fisheye"
  | "bullet"
  | "multi-sensor"
  | "mini"
  | "modular"
  // Perimeter / outdoor specialty cameras
  | "lpr";
export type ReaderSubtype =
  | "card"
  | "biometric"
  | "keypad"
  | "controller"
  | "lock"
  // Door-hardware family — share the reader type because they all wire into
  // the access-control loop, but the library surfaces them under a distinct
  // "Door Hardware" tab and each gets its own 3D mesh.
  | "electric-strike"
  | "mag-lock"
  | "rex-button"
  | "exit-device"
  | "intercom"
  | "power-supply"
  // Perimeter / exterior access hardware
  | "turnstile"
  | "bollard"
  | "gate-operator";
export type SensorSubtype =
  | "motion"
  | "glass-break"
  | "door-contact"
  | "smoke"
  | "heat"
  | "notification"
  // Fire / life safety devices
  | "pull-station"
  | "facp"
  | "exit-sign"
  | "aed"
  // Install hardware for GCs / electricians / low-voltage installers —
  // back boxes, mounting brackets, conduit runs, surface raceway. These
  // aren't sensing devices but they share the same lifecycle model so
  // filing them under sensor keeps the type system small.
  | "back-box"
  | "mount-bracket"
  | "conduit"
  | "raceway";
export type NetworkSubtype = "switch" | "access-point" | "nvr";

/**
 * Install lifecycle stage for a device.
 *  - "proposed":      planned but not yet installed (the default for new drops)
 *  - "installed":     physically mounted and commissioned
 *  - "decommissioned": removed/retired; kept on the plan for history
 */
export type InstallStatus = "proposed" | "installed" | "decommissioned";

/**
 * A photo captured during a site survey (or attached during desk design).
 * `dataUrl` keeps everything client-side so the design file is self-contained.
 */
export interface DevicePhoto {
  id: string;
  /** base64 data URL — keeps the design self-contained and offline-friendly */
  dataUrl: string;
  caption?: string;
  /** ISO timestamp when the photo was added */
  takenAt: string;
}

export interface DeviceBase {
  id: string;
  catalogId?: string;
  position: Vec2;
  /** Rotation around the vertical (yaw) axis, in radians. 0 points along
   *  the +Y floor-plan axis. This is the device's pan. */
  rotation: number;
  /** Optional rotation around the device's local horizontal (pitch / tilt)
   *  axis, in radians. Positive values tilt the camera DOWN, negative tilts
   *  UP. Default 0 (level). Matters most for wall-mounted cameras — a
   *  camera tilted up at 30° from a 2.7m mount won't see a person walking
   *  on the floor in front of it. */
  tilt?: number;
  mountHeight: number;
  label: string;
  notes: string;
  /** Lifecycle stage. Defaults to "proposed" on creation. */
  installStatus: InstallStatus;
  /** Site-walk + install photos attached to this device. */
  photos: DevicePhoto[];
  /** ISO date string (YYYY-MM-DD) when device warranty expires. */
  warrantyUntil?: string;
  /** ISO date string for the most recent inspection. */
  lastInspectionAt?: string;
  /** ISO date string for projected end-of-life / replacement. */
  endOfLifeAt?: string;
  /**
   * Optional override of the type-default marker color (hex, e.g. "#ef4444").
   * When set, replaces the per-type palette in both the 2D marker and the
   * 3D mesh accent. Leave unset to inherit the type default.
   */
  customColor?: string;
  /**
   * Optional override of the device's coverage-area opacity (0..1).
   * Applies to camera FOV wedges, sensor detection rings, and AP
   * coverage discs. Leave unset to use the type default (~0.09 for
   * cameras, ~0.25 for sensors).
   */
  customOpacity?: number;
}

/**
 * Individual lens on a multi-sensor camera. Each lens has its own FOV,
 * range, and rotation offset relative to the device's base rotation.
 * For single-lens cameras, the `lenses` array is omitted and the
 * top-level fovDegrees/rangeMeters are used directly.
 */
export interface CameraLens {
  id: string;
  label: string;
  fovDegrees: number;
  rangeMeters: number;
  /** Rotation offset in radians relative to the device's base rotation */
  rotationOffset: number;
  irRange?: number;
  resolution?: string;
}

export interface CameraDevice extends DeviceBase {
  type: "camera";
  cameraType: CameraSubtype;
  model: string;
  fovDegrees: number;
  rangeMeters: number;
  irRange?: number;
  resolution?: string;
  /** Multi-sensor cameras have multiple lenses with independent FOV/rotation */
  lenses?: CameraLens[];
}

export interface ReaderDevice extends DeviceBase {
  type: "reader";
  readerType: ReaderSubtype;
  controlsDoorId?: string;
}

export interface SensorDevice extends DeviceBase {
  type: "sensor";
  sensorType: SensorSubtype;
  rangeMeters: number;
}

export interface NetworkDeviceBase extends DeviceBase {
  type: "network";
  networkType: NetworkSubtype;
  /** Access-point only: wireless coverage radius in meters. */
  coverageMeters?: number;
  /** Switch or NVR: number of physical ports / camera channels. */
  portCount?: number;
  /** Switch only: total PoE power budget in watts. */
  poeBudgetW?: number;
  /** NVR only: storage capacity in TB and recording-retention days. */
  storageTb?: number;
  retentionDays?: number;
  /** Wi-Fi standard for APs ("Wi-Fi 6" / "Wi-Fi 7" / etc.) */
  wifiStandard?: string;
}

export type Device =
  | CameraDevice
  | ReaderDevice
  | SensorDevice
  | NetworkDeviceBase;

export interface Wall {
  id: string;
  start: Vec2;
  end: Vec2;
  height: number;
}

/**
 * Real-world door-lock hardware spec. Captures the things an integrator
 * needs to bid + install: type of locking mechanism, brand/model, power
 * requirements, and fail-mode (fail-safe locks unlock on power loss for
 * egress; fail-secure stay locked, used on storage / IT closets).
 */
export type LockType =
  | "mag-lock"          // electromagnetic, 600 / 1200 lb hold
  | "electric-strike"   // replaces strike plate, retrofits existing locksets
  | "electric-bolt"     // drop-bolt / mortise bolt
  | "magnetic-shear"    // recessed, no exposed hardware
  | "smart-deadbolt"    // Schlage Encode, Yale Assure, August
  | "smart-mortise"     // Salto, dormakaba, Allegion
  | "exit-device";      // crash bar / panic hardware

export type LockFailMode = "fail-safe" | "fail-secure";

export interface DoorLock {
  type: LockType;
  /** e.g. "HID", "Schlage", "Salto", "ASSA ABLOY". */
  brand: string;
  /** e.g. "HES 9600", "Schlage Encode", "Salto XS4". */
  model: string;
  /** Most field hardware is 12 or 24 VDC. */
  voltage?: 12 | 24;
  /** Current draw in amps — important for power-supply sizing. */
  currentDrawA?: number;
  /** Fail-safe = unlocks on power loss (egress). Fail-secure = stays locked. */
  failMode?: LockFailMode;
  /** Catalog ids (or vendor strings) this lock natively integrates with —
   *  used by the AI to flag mixed-vendor incompatibility. */
  compatibleWith?: string[];
  weatherRated?: boolean;
  notes?: string;
}

/**
 * A door is a real-world opening on a wall segment. We model it as a position
 * (snapped to a wall) plus a rotation (the wall's tangent direction), a width
 * in meters, and an optional lock spec.
 *
 * Readers can be linked to a door via `ReaderDevice.controlsDoorId` so the
 * design tracks 'which reader controls which door' — the System Surveyor
 * pattern.
 */
export interface Door {
  id: string;
  /** Position in floor-plan pixels, snapped to the wall it's mounted on. */
  position: Vec2;
  /** Rotation in radians — points along the wall the door is mounted on. */
  rotation: number;
  /** Door width in real-world meters. */
  widthMeters: number;
  /** Which wall this door sits on. */
  wallId: string;
  /** Whether the door is currently locked (state — for simulation + 3D rendering). */
  locked: boolean;
  /** Optional lock hardware specification — type, brand, model, fail mode, etc.
   *  Distinct from `locked` (state). Drives the AI's compatibility checks and
   *  the integrator's BoM / power calc. */
  lock?: DoorLock;
  /** Display label. */
  label: string;
  /** Free-form notes (hardware spec, fire rating, etc.). */
  notes: string;
}

/**
 * A manually-drawn cable run between two devices. Distinct from the
 * auto-routed `CableRun` in lib/cabling.ts — that's a per-render
 * estimate; THIS is a persistent, user-authored run that overrides the
 * estimate in the BoM + cable schedule + permit drawings.
 *
 * Source / target are device ids. Waypoints are optional intermediate
 * bends (in floor-plan pixel coords); the cable polyline goes
 * source → waypoint[0] → waypoint[1] → ... → target.
 */
export type CableType =
  | "cat6"
  | "cat6a"
  | "fiber"
  | "22-4" // Belden 22/4 — typical reader/keypad cable
  | "18-2" // 18/2 — door hardware power
  | "16-2" // 16/2 — heavier door hardware
  | "rg59" // analog video coax (legacy)
  | "speaker-16-2";

export interface Cable {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  /** Cable type spec — drives color, default thickness, BoM line. */
  type: CableType;
  /** Optional intermediate bends in floor-plan pixel coords. */
  waypoints: Vec2[];
  /** Optional override label (auto-derived from type if blank). */
  label?: string;
  /** Optional override color (hex). Falls back to CABLE_COLORS. */
  color?: string;
  notes?: string;
}

/** Display + permit-doc colors per cable type. Matches common
 *  integrator conventions: Cat6 blue, low-volt black/white. */
export const CABLE_COLORS: Record<CableType, string> = {
  cat6: "#2563eb",
  cat6a: "#1d4ed8",
  fiber: "#f97316",
  "22-4": "#0f172a",
  "18-2": "#71717a",
  "16-2": "#52525b",
  rg59: "#dc2626",
  "speaker-16-2": "#84cc16",
};

/** Human label per cable type — used in the schedule + properties UI. */
export const CABLE_LABELS: Record<CableType, string> = {
  cat6: "Cat6 (PoE+)",
  cat6a: "Cat6a (10G/PoE++)",
  fiber: "OM4 Fiber",
  "22-4": "Belden 22/4",
  "18-2": "18/2 stranded",
  "16-2": "16/2 stranded",
  rg59: "RG59 Coax",
  "speaker-16-2": "Speaker 16/2",
};

/**
 * Pinned annotation on the floor plan — a sticky note the AI (or user) can
 * drop at any point to flag a concern, note an idea, or warn about a
 * constraint. Renders as a small floating marker on the 2D canvas.
 */
export type AnnotationKind = "note" | "warning" | "idea";

export interface Annotation {
  id: string;
  position: Vec2;
  text: string;
  kind: AnnotationKind;
  /** Who created this. "ai" annotations get a small sparkle indicator. */
  author: "user" | "ai";
  createdAt: string;
}

/** Visual style applied to wall surfaces in the 3D scene.
 *  - "plain":    quiet drywall — the default, matches the original look
 *  - "painted":  richer brushed/layered drywall (introduced in v23)
 *  - "concrete": industrial polished concrete with aggregate speckle
 *  - "brick":    exposed running-bond brick with mortar lines */
export type WallStyle = "plain" | "painted" | "concrete" | "brick";

/**
 * Furniture placed on the floor. Pure visualization — never appears in
 * the BoM, quote, or security analysis. Each piece has a real-world
 * footprint in meters so the 3D mesh can scale to it.
 */
export type FurnitureType =
  | "desk"
  | "chair"
  | "conference-table"
  | "kitchen-island"
  | "sofa"
  | "toilet"
  | "sink"
  | "refrigerator"
  | "bed"
  | "bookshelf"
  | "tv-display";

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  /** Center point in floor-plan pixel coords (same system as walls + devices). */
  position: Vec2;
  /** Yaw rotation in radians. 0 = piece's "long axis" along +X. */
  rotation: number;
  /** Real-world footprint in meters. Length is along the piece's long axis,
   *  width is perpendicular. The 3D mesh scales to fit. */
  lengthM: number;
  widthM: number;
  /** Display label — defaults to the piece type. */
  label: string;
  notes?: string;
}

export interface Floor {
  id: string;
  name: string;
  index: number;
  planImage: string | null;
  scale: number;
  ceilingHeight: number;
  /** Visual style for walls in the 3D scene. Defaults to "plain". */
  wallStyle?: WallStyle;
  walls: Wall[];
  devices: Device[];
  /** Doors placed on walls. Readers can link to specific doors by id. */
  doors: Door[];
  /** Sticky-note annotations the AI or user can drop at any point. */
  annotations: Annotation[];
  /** Decorative furniture (desks, chairs, tables). Optional — older
   *  designs / dvjson files won't have it. */
  furniture?: FurnitureItem[];
  /** User-authored cable runs. Override the per-render auto-route in
   *  the BoM, cable schedule, and permit drawings. Optional — older
   *  designs default to auto-routed. */
  cables?: Cable[];
  /** Optional preset path used by simulation mode. Floor-plan pixel coords. */
  simPath?: Vec2[];
}

/** Real-world default footprints (meters) per furniture type. */
export const FURNITURE_DEFAULTS: Record<
  FurnitureType,
  { lengthM: number; widthM: number; label: string }
> = {
  desk: { lengthM: 1.5, widthM: 0.75, label: "Desk" },
  chair: { lengthM: 0.6, widthM: 0.6, label: "Chair" },
  "conference-table": { lengthM: 3.0, widthM: 1.2, label: "Conference Table" },
  "kitchen-island": { lengthM: 2.4, widthM: 1.0, label: "Kitchen Island" },
  sofa: { lengthM: 2.2, widthM: 0.95, label: "Sofa" },
  toilet: { lengthM: 0.7, widthM: 0.42, label: "Toilet" },
  sink: { lengthM: 0.6, widthM: 0.5, label: "Sink" },
  refrigerator: { lengthM: 0.85, widthM: 0.72, label: "Refrigerator" },
  bed: { lengthM: 2.0, widthM: 1.5, label: "Bed" },
  bookshelf: { lengthM: 1.0, widthM: 0.35, label: "Bookshelf" },
  "tv-display": { lengthM: 1.4, widthM: 0.1, label: "TV / Display" },
};

export interface DesignDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  floors: Floor[];
  activeFloorId: string;
}

export type SimEventType = "detected" | "lost" | "triggered";

export interface SimEvent {
  timestamp: number;
  type: SimEventType;
  deviceId: string;
  actorPosition: Vec2;
}

export interface SimulationScenario {
  id: string;
  name: string;
  actor: { startPosition: Vec2; speedMs: number };
  path: Vec2[];
  events: SimEvent[];
}

export interface DeviceDefaults {
  label: string;
  rotation: number;
  mountHeight: number;
  notes: string;
}

/** Defaults shared by every device kind — lifecycle, photos, dates. */
const BASE_LIFECYCLE_DEFAULTS = {
  installStatus: "proposed" as InstallStatus,
  photos: [] as DevicePhoto[],
};

export const CAMERA_DEFAULTS: Omit<CameraDevice, "id" | "position"> = {
  type: "camera",
  cameraType: "dome",
  model: "Generic Dome",
  fovDegrees: 90,
  rangeMeters: 12,
  irRange: 15,
  resolution: "4K",
  label: "Camera",
  rotation: 0,
  mountHeight: 2.8,
  notes: "",
  ...BASE_LIFECYCLE_DEFAULTS,
};

export const READER_DEFAULTS: Omit<ReaderDevice, "id" | "position"> = {
  type: "reader",
  readerType: "card",
  label: "Reader",
  rotation: 0,
  mountHeight: 1.2,
  notes: "",
  ...BASE_LIFECYCLE_DEFAULTS,
};

export const SENSOR_DEFAULTS: Omit<SensorDevice, "id" | "position"> = {
  type: "sensor",
  sensorType: "motion",
  rangeMeters: 8,
  label: "Sensor",
  rotation: 0,
  mountHeight: 2.4,
  notes: "",
  ...BASE_LIFECYCLE_DEFAULTS,
};

export const NETWORK_DEFAULTS: Omit<NetworkDeviceBase, "id" | "position"> = {
  type: "network",
  networkType: "access-point",
  coverageMeters: 15,
  label: "Access Point",
  rotation: 0,
  mountHeight: 2.6,
  notes: "",
  ...BASE_LIFECYCLE_DEFAULTS,
};
