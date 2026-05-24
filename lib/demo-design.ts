import type {
  CameraDevice,
  CameraLens,
  CameraSubtype,
  Device,
  Door,
  Floor,
  NetworkDeviceBase,
  NetworkSubtype,
  ReaderDevice,
  ReaderSubtype,
  SensorDevice,
  SensorSubtype,
  Vec2,
  Wall,
} from "@/types/design";
import { getProduct } from "./catalog";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Wall segments for the demo office.
 *
 * Floor envelope is 1600 × 1100 pixels at scale 50 px/m → 32 m × 22 m.
 *
 * Layout deliberately irregular — rooms are different sizes, two rooms
 * are L-shaped, and there's a small entry vestibule that juts out from
 * the lobby. None of the interior walls run uninterrupted from one side
 * of the building to the other, so the floor reads as a real building
 * instead of a 3-bay grid.
 *
 * Shape per room:
 *  • CONFERENCE   x=0–440,    y=0–300        (8.8 × 6.0m)
 *  • BREAK ROOM   x=0–200,    y=300–500      (4.0 × 4.0m) — tucked in
 *                                              the NW corner of Reception
 *  • RECEPTION    L-shape, wraps around the break room and the vestibule
 *                  occupies x=0–440, y=300–1100 minus the cut-outs
 *  • VESTIBULE    x=180–380,  y=1000–1100    (4.0 × 2.0m) — entry alcove
 *  • OPEN OFFICE  L-shape, x=440–1200, y=0–1100 minus the kitchen bar
 *                  carved out of its west side
 *  • KITCHEN BAR  x=440–680,  y=500–700      (4.8 × 4.0m) — notch inside
 *                  the open office, creating its L-shape
 *  • SERVER       x=1200–1600, y=0–300       (8.0 × 6.0m) — small, secure
 *  • LOUNGE       x=1200–1600, y=300–1100    (8.0 × 16.0m) — long
 */
function demoWalls(): Wall[] {
  const segments: Array<[number, number, number, number]> = [
    // 0–3: outer envelope (N, E, S, W)
    [0, 0, 1600, 0],
    [1600, 0, 1600, 1100],
    [1600, 1100, 0, 1100],
    [0, 1100, 0, 0],
    // 4: left bay vertical (full height) — separates left rooms from
    //    Open Office.
    [440, 0, 440, 1100],
    // 5: right bay vertical (full height) — separates Open Office from
    //    Server + Lounge.
    [1200, 0, 1200, 1100],
    // 6: conference room bottom — runs the full width of the left bay.
    [0, 300, 440, 300],
    // 7–8: break room east + south walls. The break room is a small
    //    cube tucked into the NW corner of Reception, leaving the rest
    //    of Reception as an L-shape that wraps around it.
    [200, 300, 200, 500],
    [0, 500, 200, 500],
    // 9–11: vestibule. A tiny alcove cut out of Reception's south wall
    //    so the front door opens into a vestibule, not straight into
    //    the lobby. Walls form three sides of the alcove; the fourth
    //    side is the south outer wall (which has the entry door).
    [180, 1000, 380, 1000], // vestibule north
    [180, 1000, 180, 1100], // vestibule west
    [380, 1000, 380, 1100], // vestibule east
    // 12–14: kitchen bar carved INTO the open office's west side. Three
    //    walls form the kitchen (its fourth side is wall_4 at x=440).
    //    This is what makes the open office L-shaped — the kitchen
    //    notch eats into the bay's southwest area.
    [440, 500, 680, 500], // kitchen north
    [680, 500, 680, 700], // kitchen east
    [440, 700, 680, 700], // kitchen south
    // 15: server ↕ lounge divider (right bay only).
    [1200, 300, 1600, 300],
  ];
  return segments.map(([x1, y1, x2, y2], i) => ({
    id: `wall_demo_${i}`,
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    height: 2.7,
  }));
}

/* ── Door placement ────────────────────────────────────────────────────
   Each door sits ON an actual wall segment, snapped to a sensible spot.
   Rotation = wall tangent. Stable IDs let the devices below link readers
   to specific doors via `controlsDoorId`. */

const DOOR_IDS = {
  entry: "door_demo_entry",
  sideExit: "door_demo_side_exit",
  vestibule: "door_demo_vestibule",
  conference: "door_demo_conference",
  break: "door_demo_break",
  reception: "door_demo_reception",
  kitchen: "door_demo_kitchen",
  server: "door_demo_server",
  lounge: "door_demo_lounge",
} as const;

function demoDoors(): Door[] {
  return [
    {
      id: DOOR_IDS.entry,
      // Front entry — south outer wall (wall_demo_2). Opens into the
      // small vestibule alcove, not directly into the lobby.
      position: { x: 280, y: 1100 },
      rotation: Math.PI,
      widthMeters: 1.4,
      wallId: "wall_demo_2",
      locked: false,
      label: "Front entry",
      notes: "Main public entrance. Opens into the vestibule alcove.",
    },
    {
      id: DOOR_IDS.vestibule,
      // Vestibule ↔ Reception — wall_demo_9 is the vestibule's north wall.
      position: { x: 280, y: 1000 },
      rotation: Math.PI,
      widthMeters: 1.0,
      wallId: "wall_demo_9",
      locked: false,
      label: "Vestibule door",
      notes: "Inner door — opens from vestibule into the main lobby.",
    },
    {
      id: DOOR_IDS.sideExit,
      // East side exit — outer east wall (wall_demo_1). Lounge patio +
      // emergency exit.
      position: { x: 1600, y: 750 },
      rotation: Math.PI / 2,
      widthMeters: 1.2,
      wallId: "wall_demo_1",
      locked: false,
      label: "Side exit (patio)",
      notes: "Lounge patio + emergency exit. Push-bar only from inside.",
    },
    {
      id: DOOR_IDS.conference,
      // Conference ↔ Open Office (wall_demo_4, x=440, top).
      position: { x: 440, y: 150 },
      rotation: Math.PI / 2,
      widthMeters: 0.9,
      wallId: "wall_demo_4",
      locked: false,
      label: "Conference door",
      notes: "Conference room ↔ open office.",
    },
    {
      id: DOOR_IDS.break,
      // Break Room ↔ Reception — break room east wall (wall_demo_7).
      position: { x: 200, y: 400 },
      rotation: Math.PI / 2,
      widthMeters: 0.9,
      wallId: "wall_demo_7",
      locked: false,
      label: "Break room door",
      notes: "Break room ↔ reception.",
    },
    {
      id: DOOR_IDS.reception,
      // Reception ↔ Open Office (wall_demo_4, x=440, south end).
      position: { x: 440, y: 850 },
      rotation: Math.PI / 2,
      widthMeters: 1.0,
      wallId: "wall_demo_4",
      locked: false,
      label: "Lobby door",
      notes: "Reception ↔ open office.",
    },
    {
      id: DOOR_IDS.kitchen,
      // Kitchen bar ↔ Open Office — opens off the south side of the
      // kitchen carve-out.
      position: { x: 560, y: 700 },
      rotation: Math.PI,
      widthMeters: 0.9,
      wallId: "wall_demo_14",
      locked: false,
      label: "Kitchen bar",
      notes: "Tiny coffee/kitchen bar ↔ open office.",
    },
    {
      id: DOOR_IDS.server,
      // Server ↔ Open Office (wall_demo_5, x=1200, top — locked).
      position: { x: 1200, y: 150 },
      rotation: Math.PI / 2,
      widthMeters: 0.9,
      wallId: "wall_demo_5",
      locked: true,
      label: "Server room",
      notes: "Restricted — biometric required 24/7.",
    },
    {
      id: DOOR_IDS.lounge,
      // Lounge ↔ Open Office (wall_demo_5, x=1200, mid).
      position: { x: 1200, y: 700 },
      rotation: Math.PI / 2,
      widthMeters: 1.0,
      wallId: "wall_demo_5",
      locked: false,
      label: "Lounge door",
      notes: "Open office ↔ lounge & café.",
    },
  ];
}

/* ── Catalog-backed device builders ────────────────────────────────────
   Demo devices pull real specs (vendor, model, FOV, IR range, resolution)
   from the product catalog so the BoM, the 3D mesh subtype, and the
   on-canvas labels all line up with a real installable layout. */

interface CameraOpts {
  catalogId: string;
  position: Vec2;
  rotation: number;
  mountHeight?: number;
  rangeMeters: number;
  notes?: string;
}

function cameraFromCatalog(opts: CameraOpts): CameraDevice | null {
  const p = getProduct(opts.catalogId);
  if (!p) {
    console.warn(
      `[DeeperVision demo] Unknown camera catalog id: ${opts.catalogId} — skipping device.`,
    );
    return null;
  }

  // Multi-sensor cameras spread evenly around the device. We replicate the
  // same auto-lens logic the store uses for newly-dropped devices so the
  // 2D wedges and 3D FOV cones render correctly out of the box.
  let lenses: CameraLens[] | undefined;
  if (p.subcategory === "multi-sensor" && p.specs.lensCount) {
    const count = p.specs.lensCount;
    const fov = p.specs.fovDegrees ?? 90;
    lenses = [];
    for (let i = 0; i < count; i++) {
      lenses.push({
        id: uid("lens"),
        label: `Lens ${i + 1}`,
        fovDegrees: fov,
        rangeMeters: opts.rangeMeters,
        rotationOffset: (i * 2 * Math.PI) / count,
        irRange: p.specs.irRange,
        resolution: p.specs.resolution,
      });
    }
  }

  return {
    id: uid("dev"),
    catalogId: p.id,
    position: opts.position,
    rotation: opts.rotation,
    mountHeight: opts.mountHeight ?? 2.8,
    label: `${p.manufacturer} ${p.model}`,
    notes: opts.notes ?? "",
    installStatus: "installed",
    photos: [],
    type: "camera",
    cameraType: p.subcategory as CameraSubtype,
    model: p.fullName,
    fovDegrees: p.specs.fovDegrees ?? 90,
    rangeMeters: opts.rangeMeters,
    irRange: p.specs.irRange,
    resolution: p.specs.resolution,
    lenses,
  };
}

interface ReaderOpts {
  catalogId: string;
  position: Vec2;
  rotation: number;
  mountHeight?: number;
  controlsDoorId?: string;
  notes?: string;
}

function readerFromCatalog(opts: ReaderOpts): ReaderDevice | null {
  const p = getProduct(opts.catalogId);
  if (!p) {
    console.warn(
      `[DeeperVision demo] Unknown reader catalog id: ${opts.catalogId} — skipping device.`,
    );
    return null;
  }
  return {
    id: uid("dev"),
    catalogId: p.id,
    position: opts.position,
    rotation: opts.rotation,
    mountHeight: opts.mountHeight ?? 1.2,
    label: `${p.manufacturer} ${p.model}`,
    notes: opts.notes ?? "",
    installStatus: "installed",
    photos: [],
    type: "reader",
    readerType: p.subcategory as ReaderSubtype,
    controlsDoorId: opts.controlsDoorId,
  };
}

interface SensorOpts {
  catalogId: string;
  position: Vec2;
  rotation?: number;
  mountHeight?: number;
  rangeMeters: number;
  notes?: string;
}

function sensorFromCatalog(opts: SensorOpts): SensorDevice | null {
  const p = getProduct(opts.catalogId);
  if (!p) {
    console.warn(
      `[DeeperVision demo] Unknown sensor catalog id: ${opts.catalogId} — skipping device.`,
    );
    return null;
  }
  return {
    id: uid("dev"),
    catalogId: p.id,
    position: opts.position,
    rotation: opts.rotation ?? 0,
    mountHeight: opts.mountHeight ?? 2.4,
    label: `${p.manufacturer} ${p.model}`,
    notes: opts.notes ?? "",
    installStatus: "installed",
    photos: [],
    type: "sensor",
    sensorType: p.subcategory as SensorSubtype,
    rangeMeters: opts.rangeMeters,
  };
}

interface NetworkOpts {
  catalogId: string;
  position: Vec2;
  mountHeight?: number;
  notes?: string;
  coverageMeters?: number;
  portCount?: number;
  poeBudgetW?: number;
  storageTb?: number;
  retentionDays?: number;
  wifiStandard?: string;
}

function networkFromCatalog(opts: NetworkOpts): NetworkDeviceBase | null {
  const p = getProduct(opts.catalogId);
  if (!p) {
    console.warn(
      `[DeeperVision demo] Unknown network catalog id: ${opts.catalogId} — skipping device.`,
    );
    return null;
  }
  return {
    id: uid("dev"),
    catalogId: p.id,
    position: opts.position,
    rotation: 0,
    mountHeight: opts.mountHeight ?? 2.6,
    label: `${p.manufacturer} ${p.model}`,
    notes: opts.notes ?? "",
    installStatus: "installed",
    photos: [],
    type: "network",
    networkType: p.subcategory as NetworkSubtype,
    coverageMeters: opts.coverageMeters ?? p.specs.coverageMeters,
    portCount: opts.portCount ?? p.specs.portCount,
    poeBudgetW: opts.poeBudgetW,
    storageTb: opts.storageTb,
    retentionDays: opts.retentionDays,
    wifiStandard: opts.wifiStandard,
  };
}

/* ── The demo floor itself ──────────────────────────────────────────── */

function demoDevices(): Device[] {
  // Each builder returns `Device | null` so a missing/renamed catalog id
  // can't take the whole demo (and therefore the page) down.
  //
  // Room coords for reference (32 × 22m building):
  //   CONFERENCE   x=0–440,    y=0–300        (8.8 × 6m)
  //   BREAK ROOM   x=0–200,    y=300–500      (4 × 4m, NW corner of Recep.)
  //   RECEPTION    L-shape around break room + vestibule
  //   VESTIBULE    x=180–380,  y=1000–1100    (4 × 2m entry alcove)
  //   OPEN OFFICE  L-shape, x=440–1200, y=0–1100 minus kitchen carve-out
  //   KITCHEN BAR  x=440–680,  y=500–700      (4.8 × 4m notch in open office)
  //   SERVER       x=1200–1600, y=0–300       (8 × 6m, secured)
  //   LOUNGE       x=1200–1600, y=300–1100    (8 × 16m, long)
  const built: (Device | null)[] = [
    // ────────────── CONFERENCE ROOM (top-left) ──────────────
    cameraFromCatalog({
      catalogId: "axis-m3116-lve",
      position: { x: 400, y: 50 },
      rotation: 2.4, // facing SW into the room
      rangeMeters: 11,
      notes: "Conference room corner — covers table + door.",
    }),
    sensorFromCatalog({
      catalogId: "honeywell-fg1625",
      position: { x: 220, y: 40 },
      rotation: Math.PI / 2,
      mountHeight: 2.6,
      rangeMeters: 7,
      notes: "Glass-break — north window wall in conference.",
    }),

    // ────────────── BREAK ROOM (tiny, NW corner of Reception) ──────────────
    sensorFromCatalog({
      catalogId: "system-sensor-2wtr-b",
      position: { x: 100, y: 400 },
      mountHeight: 2.8,
      rangeMeters: 6,
      notes: "Break-room smoke detector — over the coffee bar.",
    }),

    // ────────────── RECEPTION / LOBBY (L-shape wrapping break room) ──────────────
    cameraFromCatalog({
      catalogId: "verkada-cm42",
      position: { x: 400, y: 600 },
      rotation: 2.55, // facing SW across the lobby
      rangeMeters: 12,
      notes: "Reception dome — wide view of front desk + lobby.",
    }),
    readerFromCatalog({
      catalogId: "hid-signo-40",
      position: { x: 380, y: 1050 },
      rotation: Math.PI, // facing south, mounted on the vestibule's east wall
      controlsDoorId: DOOR_IDS.entry,
      notes:
        "Front-entry reader — mobile + smart card. Mounted on the vestibule wall just inside the entry door.",
    }),

    // ────────────── OPEN OFFICE (big L-shape) ──────────────
    cameraFromCatalog({
      catalogId: "hanwha-pnm-9085rqz",
      position: { x: 850, y: 350 },
      rotation: 0, // multi-sensor — lenses spread automatically
      mountHeight: 2.7,
      rangeMeters: 18,
      notes:
        "Open office centerpiece — 4-lens multi-sensor covers all four quadrants of the bay.",
    }),
    cameraFromCatalog({
      catalogId: "verkada-cb52",
      position: { x: 820, y: 1060 },
      rotation: -Math.PI / 2, // bullet facing north up the bay
      rangeMeters: 32,
      notes:
        "South-wall bullet — covers the full 22m length of the open office.",
    }),
    networkFromCatalog({
      catalogId: "ubiquiti-u6-enterprise",
      position: { x: 850, y: 850 },
      mountHeight: 2.7,
      coverageMeters: 18,
      wifiStandard: "Wi-Fi 6E",
      notes: "Open office Wi-Fi access point.",
    }),
    sensorFromCatalog({
      catalogId: "bosch-bdl2-wp12g",
      position: { x: 1000, y: 200 },
      mountHeight: 2.4,
      rangeMeters: 12,
      notes: "Open office PIR — after-hours intrusion detection.",
    }),

    // ────────────── SERVER ROOM (top-right, secured) ──────────────
    cameraFromCatalog({
      catalogId: "bosch-flexidome-5100i",
      position: { x: 1560, y: 50 },
      rotation: 2.4, // facing SW, covers the locked door + racks
      rangeMeters: 11,
      notes: "Server room — covers the only door and full row of racks.",
    }),
    readerFromCatalog({
      catalogId: "suprema-bioentry-w2",
      position: { x: 1215, y: 150 },
      rotation: 0, // facing east toward the locked server door
      controlsDoorId: DOOR_IDS.server,
      notes:
        "Server-room reader — biometric (fingerprint + card). Mounted on the open-office side of the door.",
    }),
    networkFromCatalog({
      catalogId: "hanwha-xrn-1620b",
      position: { x: 1500, y: 200 },
      mountHeight: 0.1,
      portCount: 16,
      storageTb: 8,
      retentionDays: 45,
      notes: "16-channel NVR — 8 TB, 45-day retention. Floor-mounted on rack.",
    }),
    networkFromCatalog({
      catalogId: "ubiquiti-usw-pro-24-poe",
      position: { x: 1500, y: 250 },
      mountHeight: 0.32,
      portCount: 24,
      poeBudgetW: 400,
      notes:
        "Core PoE switch — feeds every camera + reader. Rack-stacked above the NVR.",
    }),

    // ────────────── LOUNGE & CAFÉ (long room east) ──────────────
    cameraFromCatalog({
      catalogId: "axis-p3265-lve",
      position: { x: 1560, y: 1050 },
      rotation: -2.4, // dome at SE corner facing NW into the lounge
      rangeMeters: 22,
      notes: "Lounge dome — wide view of seating + café counter.",
    }),
    sensorFromCatalog({
      catalogId: "honeywell-is3016",
      position: { x: 1380, y: 800 },
      mountHeight: 2.4,
      rangeMeters: 14,
      notes: "Lounge PIR — after-hours coverage.",
    }),
  ];
  return built.filter((d): d is Device => d !== null);
}

/**
 * A walking path the simulation subject follows. Threads through every
 * door so the subject visits every room in the irregular layout. Doors:
 *   • Front entry (south outer): x=280, y=1100
 *   • Vestibule ↔ Reception:     x=280, y=1000
 *   • Conference ↔ Office:        x=440, y=150
 *   • Break ↔ Reception:          x=200, y=400
 *   • Reception ↔ Office:         x=440, y=850
 *   • Kitchen bar ↔ Office:       x=560, y=700
 *   • Server ↔ Office (locked):   x=1200, y=150
 *   • Lounge ↔ Office:            x=1200, y=700
 *   • Side patio exit (east):     x=1600, y=750
 */
function demoSimPath() {
  return [
    { x: 280, y: 1060 }, // Just inside the entry, in the vestibule
    { x: 280, y: 960 },  // Through the vestibule into the lobby
    { x: 320, y: 800 },  // Reception, walking north
    { x: 320, y: 420 },  // Reception north, approach Break door
    { x: 100, y: 420 },  // Inside the break room (coffee bar)
    { x: 320, y: 420 },  // Back through the break door
    { x: 480, y: 850 },  // Through the lobby door into Open Office (south)
    { x: 850, y: 850 },  // Open Office south
    { x: 850, y: 500 },  // Open Office center
    { x: 560, y: 760 },  // Approach Kitchen Bar from south
    { x: 560, y: 600 },  // Inside Kitchen Bar
    { x: 560, y: 760 },  // Back out
    { x: 850, y: 350 },  // Open Office mid-north
    { x: 480, y: 150 },  // Approach Conference door
    { x: 200, y: 150 },  // Inside Conference
    { x: 480, y: 150 },  // Back to door
    { x: 1000, y: 200 }, // Open Office NE
    { x: 1240, y: 150 }, // Through Server door (secured)
    { x: 1500, y: 150 }, // Inside Server room (front of racks)
    { x: 1240, y: 150 }, // Back out
    { x: 1240, y: 700 }, // South to Lounge door
    { x: 1480, y: 700 }, // Inside Lounge
  ];
}

/**
 * Furniture placement for the demo. Scaled to each room's footprint —
 * conference table runs the long axis of the conference room, desks
 * line the open office bays, kitchen island sits in the kitchen bar,
 * sofa anchors the lounge.
 *
 * Coordinates are floor-plan pixels (scale = 50 px/m), so 1m = 50px.
 * Furniture defaults: desk 1.5×0.75m, chair 0.6×0.6m, conf table 3.0×1.2m,
 * kitchen island 2.4×1.0m, sofa 2.2×0.95m.
 */
function demoFurniture(): import("@/types/design").FurnitureItem[] {
  let counter = 0;
  const mk = (
    item: Omit<import("@/types/design").FurnitureItem, "id">,
  ): import("@/types/design").FurnitureItem => ({
    ...item,
    id: `furn_demo_${++counter}`,
  });

  return [
    // ────────────── CONFERENCE ROOM (x=0–440, y=0–300) ──────────────
    // Table centered, runs along the long axis. Real conf table 3.0 × 1.2 m.
    mk({
      type: "conference-table",
      position: { x: 220, y: 150 },
      rotation: 0, // long axis along +X
      lengthM: 3.0,
      widthM: 1.2,
      label: "Conference Table",
    }),
    // 8 chairs tucked around the conference table (4 per long side).
    ...[0, 1, 2, 3].map((i) =>
      mk({
        type: "chair",
        position: { x: 110 + i * 70, y: 100 },
        rotation: Math.PI / 2,
        lengthM: 0.6,
        widthM: 0.6,
        label: "Chair",
      }),
    ),
    ...[0, 1, 2, 3].map((i) =>
      mk({
        type: "chair",
        position: { x: 110 + i * 70, y: 200 },
        rotation: -Math.PI / 2,
        lengthM: 0.6,
        widthM: 0.6,
        label: "Chair",
      }),
    ),
    // Wall-mounted display at the HEAD of the conference room (west
    // wall, x=0). East wall has the door — TVs can't go there.
    mk({
      type: "tv-display",
      position: { x: 12, y: 150 },
      rotation: -Math.PI / 2, // long axis along Y, faces east into room
      lengthM: 1.8,
      widthM: 0.1,
      label: "Conference Display",
    }),

    // ────────────── BREAK ROOM (x=0–200, y=300–500) ──────────────
    // 4×4m kitchenette — fridge + sink along the west wall. No shelf:
    // the room is too small to fit one without it blocking the door.
    mk({
      type: "refrigerator",
      position: { x: 40, y: 340 },
      rotation: 0,
      lengthM: 0.7,
      widthM: 0.7,
      label: "Refrigerator",
    }),
    mk({
      type: "sink",
      position: { x: 40, y: 460 },
      rotation: 0,
      lengthM: 0.6,
      widthM: 0.5,
      label: "Break-room Sink",
    }),

    // ────────────── RECEPTION / LOBBY ──────────────
    // Waiting-area sofa + brochure shelving flush against the WEST
    // outer wall (x=0). The L-shaped reception runs x=0–440 in this
    // band, so the west wall is the natural spot for shelving.
    mk({
      type: "sofa",
      position: { x: 360, y: 600 },
      rotation: -Math.PI / 2, // facing the reception desk
      lengthM: 2.2,
      widthM: 0.95,
      label: "Lobby Sofa",
    }),
    mk({
      type: "bookshelf",
      position: { x: 15, y: 700 },
      rotation: Math.PI / 2, // long axis vertical along the west wall
      lengthM: 1.2,
      widthM: 0.3,
      label: "Lobby Shelving",
    }),

    // ────────────── OPEN OFFICE ──────────────
    // Two rows of three desks along the south stretch (the long
    // horizontal bay). Each desk is 1.5×0.75m, so 6 desks total = nice
    // bullpen feel. Each desk gets a chair on the inside.
    ...[0, 1, 2].map((i) =>
      mk({
        type: "desk",
        position: { x: 600 + i * 170, y: 250 },
        rotation: 0,
        lengthM: 1.5,
        widthM: 0.75,
        label: `Workstation ${i + 1}`,
      }),
    ),
    ...[0, 1, 2].map((i) =>
      mk({
        type: "chair",
        position: { x: 600 + i * 170, y: 320 },
        rotation: -Math.PI / 2,
        lengthM: 0.6,
        widthM: 0.6,
        label: "Office Chair",
      }),
    ),
    ...[0, 1, 2].map((i) =>
      mk({
        type: "desk",
        position: { x: 600 + i * 170, y: 420 },
        rotation: Math.PI, // facing the opposite row
        lengthM: 1.5,
        widthM: 0.75,
        label: `Workstation ${i + 4}`,
      }),
    ),
    ...[0, 1, 2].map((i) =>
      mk({
        type: "chair",
        position: { x: 600 + i * 170, y: 350 },
        rotation: Math.PI / 2,
        lengthM: 0.6,
        widthM: 0.6,
        label: "Office Chair",
      }),
    ),
    // Bookshelf flush against the EAST wall of the open office (x=1200).
    // Long axis runs vertical along the wall.
    mk({
      type: "bookshelf",
      position: { x: 1192, y: 600 },
      rotation: -Math.PI / 2, // long axis along Y, against east wall
      lengthM: 1.6,
      widthM: 0.3,
      label: "Office Shelving",
    }),
    // North end of open office — small huddle spot with a sofa.
    mk({
      type: "sofa",
      position: { x: 1050, y: 80 },
      rotation: 0,
      lengthM: 2.0,
      widthM: 0.95,
      label: "Huddle Sofa",
    }),

    // ────────────── KITCHEN BAR (x=440–680, y=500–700) ──────────────
    // Island in the middle, plus a sink and fridge along the back wall.
    mk({
      type: "kitchen-island",
      position: { x: 560, y: 620 },
      rotation: 0,
      lengthM: 2.4,
      widthM: 1.0,
      label: "Kitchen Island",
    }),
    mk({
      type: "sink",
      position: { x: 480, y: 520 },
      rotation: 0,
      lengthM: 0.7,
      widthM: 0.5,
      label: "Kitchen Sink",
    }),
    mk({
      type: "refrigerator",
      position: { x: 650, y: 520 },
      rotation: 0,
      lengthM: 0.7,
      widthM: 0.7,
      label: "Refrigerator",
    }),

    // ────────────── SERVER ROOM ──────────────
    // Single bookshelf flush against the WEST wall (x=1200) for
    // documentation binders. Room is mostly racks otherwise.
    mk({
      type: "bookshelf",
      position: { x: 1207, y: 260 },
      rotation: Math.PI / 2, // long axis vertical along west wall
      lengthM: 0.9,
      widthM: 0.3,
      label: "Rack Documentation",
    }),

    // ────────────── LOUNGE (x=1200–1600, y=300–1100) ──────────────
    // Two sofas plus a large wall-mounted TV at the north end.
    mk({
      type: "sofa",
      position: { x: 1400, y: 1000 },
      rotation: 0,
      lengthM: 2.2,
      widthM: 0.95,
      label: "Lounge Sofa",
    }),
    mk({
      type: "sofa",
      position: { x: 1400, y: 600 },
      rotation: Math.PI, // facing south, mirroring the first
      lengthM: 2.2,
      widthM: 0.95,
      label: "Lounge Sofa",
    }),
    mk({
      type: "tv-display",
      position: { x: 1400, y: 308 }, // flush with north wall y=300
      rotation: Math.PI, // mounted on the north wall, facing south
      lengthM: 2.0,
      widthM: 0.1,
      label: "Lounge TV",
    }),
    mk({
      type: "bookshelf",
      position: { x: 1592, y: 500 }, // flush with east wall x=1600
      rotation: -Math.PI / 2, // long axis vertical along east wall
      lengthM: 1.4,
      widthM: 0.3,
      label: "Lounge Library",
    }),
  ];
}

export function buildDemoFloor(): Omit<Floor, "id" | "index"> {
  return {
    name: "Ground floor — demo office",
    // No background SVG — the walls + interior fill carry the floor plan
    // visually, and the layout no longer matches the old SVG anyway.
    planImage: null,
    scale: 50,
    ceilingHeight: 3.0,
    walls: demoWalls(),
    devices: demoDevices(),
    doors: demoDoors(),
    annotations: [],
    furniture: demoFurniture(),
    simPath: demoSimPath(),
  };
}
