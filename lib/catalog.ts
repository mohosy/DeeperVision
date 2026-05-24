/**
 * Product catalog — real manufacturer products with realistic distributor
 * pricing.  Street prices are typical US distributor-to-integrator numbers
 * (~60-75 % of MSRP).  Specs are drawn from published datasheets.
 *
 * The catalog is intentionally a flat array so it can be filtered, searched,
 * and extended without fighting nested structures.  Helper functions at the
 * bottom cover the most common access patterns.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Closed-vs-open positioning of a product. Drives the chat agent's
 * mixed-vendor warnings — pairing a Verkada camera ("proprietary-cloud")
 * with an Axis NVR ("onvif") won't work natively.
 */
export type ProductEcosystem =
  | "proprietary-cloud"   // closed cloud (Verkada, Rhombus, Meraki MV)
  | "proprietary-onprem"  // closed on-prem (Avigilon ACC, Genetec)
  | "onvif"               // standards-based — works across most VMS
  | "open"                // fully open / SDK-friendly
  | "consumer";           // residential / DIY (Reolink, Lorex, Ring)

export interface CatalogProduct {
  id: string;
  manufacturer: string;
  model: string;
  name: string;
  fullName: string;
  category: "camera" | "reader" | "sensor" | "network";
  subcategory:
    | "dome"
    | "bullet"
    | "ptz"
    | "fixed"
    | "fisheye"
    | "multi-sensor"
    | "mini"
    | "modular"
    | "lpr"
    | "card"
    | "biometric"
    | "keypad"
    | "controller"
    | "lock"
    | "electric-strike"
    | "mag-lock"
    | "rex-button"
    | "exit-device"
    | "intercom"
    | "power-supply"
    | "turnstile"
    | "bollard"
    | "gate-operator"
    | "motion"
    | "glass-break"
    | "door-contact"
    | "smoke"
    | "heat"
    | "notification"
    | "pull-station"
    | "facp"
    | "exit-sign"
    | "aed"
    | "back-box"
    | "mount-bracket"
    | "conduit"
    | "raceway"
    | "switch"
    | "access-point"
    | "nvr";

  // Pricing
  msrp: number;
  streetPrice: number;
  laborHours: number;

  // Specs — category-specific, all optional
  specs: {
    resolution?: string;
    fovDegrees?: number;
    rangeMeters?: number;
    irRange?: number;
    zoomFactor?: number;
    mounting?: "ceiling" | "wall" | "surface" | "pendant";
    indoor?: boolean;
    outdoor?: boolean;
    poe?: boolean;
    lensCount?: number;
    portCount?: number;
    storageCapacity?: string;
    channelCount?: number;
    coverageMeters?: number;
    wireless?: boolean;
  };

  description: string;
  tags: string[];

  /** Closed-vs-open positioning. Auto-defaulted from manufacturer when
   *  not set on a specific entry — see DEFAULT_ECOSYSTEM below. */
  ecosystem?: ProductEcosystem;
  /** Brands, products, or ecosystem tags this product natively works with.
   *  Used by the chat agent to flag mixed-vendor incompatibility and
   *  recommend bridge products. Auto-defaulted from manufacturer when
   *  not set on a specific entry. */
  compatibility?: string[];
}

// ---------------------------------------------------------------------------
// Catalog data
// ---------------------------------------------------------------------------

/**
 * Per-manufacturer default ecosystem when an individual entry doesn't
 * override. Keeps the raw catalog tidy — only set ecosystem on a
 * product if it differs from its vendor's norm.
 */
function defaultEcosystem(manufacturer: string): ProductEcosystem {
  const m = manufacturer.toLowerCase();
  if (m === "verkada" || m === "rhombus" || m === "meraki" || m === "cisco meraki")
    return "proprietary-cloud";
  if (m === "avigilon" || m === "genetec") return "proprietary-onprem";
  if (
    m === "reolink" ||
    m === "lorex" ||
    m === "ring" ||
    m === "wyze" ||
    m === "amcrest"
  )
    return "consumer";
  return "onvif";
}

/**
 * Per-manufacturer default compatibility tags. Tags are lower-kebab and
 * intentionally fuzzy — the agent matches them loosely when flagging
 * mixed-vendor risks ("device A is verkada-cloud, device B's
 * compatibility doesn't include verkada-cloud → flag").
 */
function defaultCompatibility(manufacturer: string): string[] {
  const m = manufacturer.toLowerCase();
  switch (m) {
    case "verkada":
      return ["verkada-cloud", "verkada-command"];
    case "rhombus":
      return ["rhombus-console"];
    case "axis":
      return [
        "onvif",
        "axis-camera-station",
        "milestone",
        "genetec",
        "exacqvision",
        "digital-watchdog",
      ];
    case "bosch":
      return ["onvif", "bvms", "bosch-vrm", "milestone", "genetec"];
    case "hanwha":
    case "hanwha vision":
      return [
        "onvif",
        "wisenet-wave",
        "milestone",
        "genetec",
        "exacqvision",
      ];
    case "avigilon":
      return ["avigilon-acc", "avigilon-alta-cloud"];
    case "genetec":
      return ["genetec-security-center", "onvif"];
    case "dahua":
      return [
        "onvif",
        "dahua-dss",
        "dahua-smartpss",
        "milestone",
        "blue-iris",
      ];
    case "hikvision":
      return [
        "onvif",
        "hikcentral",
        "ivms-4200",
        "milestone",
        "blue-iris",
      ];
    case "reolink":
      return [
        "reolink-app",
        "onvif",
        "blue-iris",
        "synology-surveillance",
      ];
    case "lorex":
      return ["lorex-cloud", "onvif", "blue-iris"];
    case "uniview":
      return ["onvif", "uniview-ezstation", "milestone"];
    default:
      return ["onvif"];
  }
}

export const PRODUCT_CATALOG: CatalogProduct[] = [
  // =======================================================================
  // CAMERAS — Verkada
  // =======================================================================
  {
    id: "verkada-cm42",
    manufacturer: "Verkada",
    model: "CM42",
    name: "Mini Camera",
    fullName: "Verkada CM42 Mini Camera",
    category: "camera",
    subcategory: "mini",
    msrp: 500,
    streetPrice: 350,
    laborHours: 1.0,
    specs: {
      resolution: "5MP",
      fovDegrees: 95,
      irRange: 15,
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "5MP indoor mini camera, 95° FOV, 15m IR, PoE",
    tags: ["indoor", "5mp", "mini", "compact", "cloud", "verkada", "poe"],
  },
  {
    id: "verkada-cd32",
    manufacturer: "Verkada",
    model: "CD32",
    name: "Mini Dome Camera",
    fullName: "Verkada CD32 Mini Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 570,
    streetPrice: 400,
    laborHours: 1.25,
    specs: {
      resolution: "5MP",
      fovDegrees: 95,
      irRange: 15,
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "5MP indoor mini dome, 95° FOV, 15m IR, PoE",
    tags: ["indoor", "5mp", "dome", "mini", "cloud", "verkada", "ir", "poe"],
  },
  {
    id: "verkada-cd42",
    manufacturer: "Verkada",
    model: "CD42",
    name: "Indoor Dome Camera",
    fullName: "Verkada CD42 Indoor Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 715,
    streetPrice: 500,
    laborHours: 1.5,
    specs: {
      resolution: "5MP",
      fovDegrees: 110,
      irRange: 30,
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "5MP indoor dome, 110° FOV, 30m IR, PoE",
    tags: ["indoor", "5mp", "dome", "cloud", "verkada", "ir", "poe", "wide-angle"],
  },
  {
    id: "verkada-cd52",
    manufacturer: "Verkada",
    model: "CD52",
    name: "Outdoor Dome Camera",
    fullName: "Verkada CD52 Outdoor Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 860,
    streetPrice: 600,
    laborHours: 2.0,
    specs: {
      resolution: "5MP",
      fovDegrees: 100,
      irRange: 30,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "5MP outdoor dome, 100° FOV, 30m IR, IK10, PoE",
    tags: ["outdoor", "5mp", "dome", "cloud", "verkada", "ir", "poe", "vandal-resistant"],
  },
  {
    id: "verkada-cd62",
    manufacturer: "Verkada",
    model: "CD62",
    name: "4K Outdoor Dome Camera",
    fullName: "Verkada CD62 Outdoor Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 1140,
    streetPrice: 800,
    laborHours: 2.0,
    specs: {
      resolution: "4K",
      fovDegrees: 100,
      irRange: 40,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP/4K outdoor dome, 100° FOV, 40m IR, IK10, PoE",
    tags: ["outdoor", "4k", "8mp", "dome", "cloud", "verkada", "ir", "poe", "vandal-resistant"],
  },
  {
    id: "verkada-cb52",
    manufacturer: "Verkada",
    model: "CB52",
    name: "Outdoor Bullet Camera",
    fullName: "Verkada CB52 Bullet",
    category: "camera",
    subcategory: "bullet",
    msrp: 785,
    streetPrice: 550,
    laborHours: 1.75,
    specs: {
      resolution: "5MP",
      fovDegrees: 95,
      irRange: 50,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "5MP outdoor bullet, 95° FOV, 50m IR, PoE",
    tags: ["outdoor", "5mp", "bullet", "fixed", "cloud", "verkada", "ir", "long-range", "poe"],
  },
  {
    id: "verkada-cb62",
    manufacturer: "Verkada",
    model: "CB62",
    name: "4K Outdoor Bullet Camera",
    fullName: "Verkada CB62 Bullet",
    category: "camera",
    subcategory: "bullet",
    msrp: 1070,
    streetPrice: 750,
    laborHours: 1.75,
    specs: {
      resolution: "4K",
      fovDegrees: 95,
      irRange: 60,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP/4K outdoor bullet, 95° FOV, 60m IR, PoE",
    tags: ["outdoor", "4k", "8mp", "bullet", "fixed", "cloud", "verkada", "ir", "long-range", "poe"],
  },
  {
    id: "verkada-cp62",
    manufacturer: "Verkada",
    model: "CP62",
    name: "PTZ Camera",
    fullName: "Verkada CP62 PTZ",
    category: "camera",
    subcategory: "ptz",
    msrp: 3140,
    streetPrice: 2200,
    laborHours: 3.0,
    specs: {
      resolution: "4K",
      fovDegrees: 62,
      irRange: 100,
      zoomFactor: 36,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP PTZ, 36x optical zoom, 100m IR, cloud-managed",
    tags: ["outdoor", "indoor", "4k", "8mp", "ptz", "zoom", "cloud", "verkada", "ir", "poe"],
  },
  {
    id: "verkada-cf82",
    manufacturer: "Verkada",
    model: "CF82",
    name: "Fisheye Camera",
    fullName: "Verkada CF82 Fisheye",
    category: "camera",
    subcategory: "fisheye",
    msrp: 1000,
    streetPrice: 700,
    laborHours: 1.5,
    specs: {
      resolution: "12MP",
      fovDegrees: 180,
      irRange: 10,
      mounting: "ceiling",
      indoor: true,
      outdoor: true,
      poe: true,
    },
    description: "12MP fisheye, 180° panoramic, dewarping, PoE",
    tags: ["indoor", "outdoor", "12mp", "fisheye", "panoramic", "360", "cloud", "verkada", "poe"],
  },

  // =======================================================================
  // CAMERAS — Axis Communications
  // =======================================================================
  {
    id: "axis-m3116-lve",
    manufacturer: "Axis",
    model: "M3116-LVE",
    name: "Mini Dome Camera",
    fullName: "Axis M3116-LVE Mini Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 460,
    streetPrice: 320,
    laborHours: 1.25,
    specs: {
      resolution: "4MP",
      fovDegrees: 97,
      irRange: 20,
      mounting: "ceiling",
      indoor: true,
      outdoor: true,
      poe: true,
    },
    description: "4MP mini dome, 97° FOV, 20m IR, IK08, PoE",
    tags: ["indoor", "outdoor", "4mp", "dome", "mini", "axis", "ir", "poe"],
  },
  {
    id: "axis-p3265-lve",
    manufacturer: "Axis",
    model: "P3265-LVE",
    name: "Dome Camera",
    fullName: "Axis P3265-LVE Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 640,
    streetPrice: 450,
    laborHours: 1.75,
    specs: {
      resolution: "2MP",
      fovDegrees: 108,
      irRange: 40,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "2MP outdoor dome, 108° FOV, 40m IR, Lightfinder 2.0",
    tags: ["outdoor", "2mp", "1080p", "dome", "axis", "ir", "poe", "wide-angle", "lightfinder"],
  },
  {
    id: "axis-p3268-lve",
    manufacturer: "Axis",
    model: "P3268-LVE",
    name: "4K Dome Camera",
    fullName: "Axis P3268-LVE 4K Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 930,
    streetPrice: 650,
    laborHours: 1.75,
    specs: {
      resolution: "4K",
      fovDegrees: 100,
      irRange: 40,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP/4K outdoor dome, 100° FOV, 40m IR, Lightfinder 2.0",
    tags: ["outdoor", "4k", "8mp", "dome", "axis", "ir", "poe", "lightfinder"],
  },
  {
    id: "axis-p1468-le",
    manufacturer: "Axis",
    model: "P1468-LE",
    name: "Bullet Camera",
    fullName: "Axis P1468-LE Bullet",
    category: "camera",
    subcategory: "bullet",
    msrp: 1000,
    streetPrice: 700,
    laborHours: 1.75,
    specs: {
      resolution: "4K",
      fovDegrees: 100,
      irRange: 50,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP/4K outdoor bullet, 100° FOV, 50m OptimizedIR",
    tags: ["outdoor", "4k", "8mp", "bullet", "fixed", "axis", "ir", "long-range", "poe"],
  },
  {
    id: "axis-q6135-le",
    manufacturer: "Axis",
    model: "Q6135-LE",
    name: "PTZ Camera",
    fullName: "Axis Q6135-LE PTZ",
    category: "camera",
    subcategory: "ptz",
    msrp: 5000,
    streetPrice: 3500,
    laborHours: 3.5,
    specs: {
      resolution: "2MP",
      fovDegrees: 59,
      irRange: 200,
      zoomFactor: 32,
      mounting: "pendant",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "2MP PTZ, 32x zoom, 200m IR, HDTV 1080p, Autotracking 2",
    tags: ["outdoor", "2mp", "1080p", "ptz", "zoom", "axis", "ir", "long-range", "poe", "autotracking"],
  },
  {
    id: "axis-m3077-plve",
    manufacturer: "Axis",
    model: "M3077-PLVE",
    name: "Panoramic Camera",
    fullName: "Axis M3077-PLVE Panoramic",
    category: "camera",
    subcategory: "fisheye",
    msrp: 1285,
    streetPrice: 900,
    laborHours: 1.5,
    specs: {
      resolution: "6MP",
      fovDegrees: 180,
      irRange: 15,
      mounting: "ceiling",
      indoor: true,
      outdoor: true,
      poe: true,
    },
    description: "6MP panoramic, 180° FOV, dewarping, Lightfinder",
    tags: ["indoor", "outdoor", "6mp", "fisheye", "panoramic", "360", "axis", "poe", "lightfinder"],
  },
  {
    id: "axis-fa54",
    manufacturer: "Axis",
    model: "FA54",
    name: "Modular Sensor Unit",
    fullName: "Axis FA54 Modular Sensor",
    category: "camera",
    subcategory: "modular",
    msrp: 400,
    streetPrice: 280,
    laborHours: 1.0,
    specs: {
      resolution: "2MP",
      fovDegrees: 87,
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: false,
    },
    description: "1080p modular pinhole sensor, 87° FOV, covert mount",
    tags: ["indoor", "2mp", "1080p", "modular", "pinhole", "covert", "discreet", "axis"],
  },

  // =======================================================================
  // CAMERAS — Hanwha Vision (Samsung)
  // =======================================================================
  {
    id: "hanwha-xnd-8080r",
    manufacturer: "Hanwha Vision",
    model: "XND-8080R",
    name: "Dome Camera",
    fullName: "Hanwha XND-8080R Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 540,
    streetPrice: 380,
    laborHours: 1.5,
    specs: {
      resolution: "5MP",
      fovDegrees: 104,
      irRange: 30,
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "5MP indoor dome, 104° FOV, 30m IR, WiseStream II",
    tags: ["indoor", "5mp", "dome", "hanwha", "samsung", "ir", "poe"],
  },
  {
    id: "hanwha-xno-8080r",
    manufacturer: "Hanwha Vision",
    model: "XNO-8080R",
    name: "Bullet Camera",
    fullName: "Hanwha XNO-8080R Bullet",
    category: "camera",
    subcategory: "bullet",
    msrp: 570,
    streetPrice: 400,
    laborHours: 1.75,
    specs: {
      resolution: "5MP",
      fovDegrees: 104,
      irRange: 30,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "5MP outdoor bullet, 104° FOV, 30m IR, WiseStream II",
    tags: ["outdoor", "5mp", "bullet", "fixed", "hanwha", "samsung", "ir", "poe"],
  },
  {
    id: "hanwha-xnp-9300rw",
    manufacturer: "Hanwha Vision",
    model: "XNP-9300RW",
    name: "4K PTZ Camera",
    fullName: "Hanwha XNP-9300RW PTZ",
    category: "camera",
    subcategory: "ptz",
    msrp: 4570,
    streetPrice: 3200,
    laborHours: 3.5,
    specs: {
      resolution: "4K",
      fovDegrees: 58,
      irRange: 200,
      zoomFactor: 30,
      mounting: "pendant",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "4K PTZ, 30x zoom, 200m IR, AI auto-tracking",
    tags: ["outdoor", "4k", "8mp", "ptz", "zoom", "hanwha", "samsung", "ir", "long-range", "poe", "ai"],
  },
  {
    id: "hanwha-pnm-9085rqz",
    manufacturer: "Hanwha Vision",
    model: "PNM-9085RQZ",
    name: "4-Directional Multi-Sensor Camera",
    fullName: "Hanwha PNM-9085RQZ Multi-Sensor",
    category: "camera",
    subcategory: "multi-sensor",
    msrp: 2570,
    streetPrice: 1800,
    laborHours: 3.0,
    specs: {
      resolution: "2MP",
      fovDegrees: 108,
      irRange: 30,
      lensCount: 4,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "4x 2MP multi-directional, 4 adjustable lenses, 30m IR",
    tags: ["outdoor", "2mp", "multi-sensor", "multi-directional", "hanwha", "samsung", "ir", "poe"],
  },
  {
    id: "hanwha-pnm-c34404rqpz",
    manufacturer: "Hanwha Vision",
    model: "PNM-C34404RQPZ",
    name: "Multi-Sensor + PTZ Camera",
    fullName: "Hanwha PNM-C34404RQPZ Multi-Sensor PTZ",
    category: "camera",
    subcategory: "multi-sensor",
    msrp: 4000,
    streetPrice: 2800,
    laborHours: 3.5,
    specs: {
      resolution: "4MP",
      fovDegrees: 108,
      irRange: 30,
      zoomFactor: 12,
      lensCount: 4,
      mounting: "pendant",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "4x 4MP multi-sensor + PTZ, 12x zoom, 30m IR",
    tags: ["outdoor", "4mp", "multi-sensor", "ptz", "zoom", "hanwha", "samsung", "ir", "poe"],
  },
  {
    id: "hanwha-xnf-8010r",
    manufacturer: "Hanwha Vision",
    model: "XNF-8010R",
    name: "Fisheye Camera",
    fullName: "Hanwha XNF-8010R Fisheye",
    category: "camera",
    subcategory: "fisheye",
    msrp: 740,
    streetPrice: 520,
    laborHours: 1.5,
    specs: {
      resolution: "6MP",
      fovDegrees: 360,
      irRange: 15,
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "6MP 360° fisheye, dewarping, 15m IR, PoE",
    tags: ["indoor", "6mp", "fisheye", "360", "panoramic", "hanwha", "samsung", "ir", "poe"],
  },

  // =======================================================================
  // CAMERAS — Avigilon (Motorola Solutions)
  // =======================================================================
  {
    id: "avigilon-h5a-dome",
    manufacturer: "Avigilon",
    model: "H5A",
    name: "Dome Camera",
    fullName: "Avigilon H5A Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 860,
    streetPrice: 600,
    laborHours: 2.0,
    specs: {
      resolution: "5MP",
      fovDegrees: 95,
      irRange: 30,
      mounting: "ceiling",
      indoor: true,
      outdoor: true,
      poe: true,
    },
    description: "5MP dome, 95° FOV, 30m IR, self-learning analytics",
    tags: ["indoor", "outdoor", "5mp", "dome", "avigilon", "motorola", "ir", "poe", "analytics"],
  },
  {
    id: "avigilon-h6a-bullet",
    manufacturer: "Avigilon",
    model: "H6A",
    name: "4K Bullet Camera",
    fullName: "Avigilon H6A Bullet",
    category: "camera",
    subcategory: "bullet",
    msrp: 1210,
    streetPrice: 850,
    laborHours: 2.0,
    specs: {
      resolution: "4K",
      fovDegrees: 95,
      irRange: 50,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP/4K bullet, 95° FOV, 50m IR, object classification",
    tags: ["outdoor", "4k", "8mp", "bullet", "fixed", "avigilon", "motorola", "ir", "long-range", "poe", "analytics"],
  },
  {
    id: "avigilon-h5a-ptz",
    manufacturer: "Avigilon",
    model: "H5A PTZ",
    name: "PTZ Camera",
    fullName: "Avigilon H5A PTZ",
    category: "camera",
    subcategory: "ptz",
    msrp: 5430,
    streetPrice: 3800,
    laborHours: 4.0,
    specs: {
      resolution: "2MP",
      fovDegrees: 62,
      irRange: 250,
      zoomFactor: 36,
      mounting: "pendant",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "2MP PTZ, 36x zoom, 250m IR, self-learning analytics",
    tags: ["outdoor", "2mp", "1080p", "ptz", "zoom", "avigilon", "motorola", "ir", "long-range", "poe", "analytics"],
  },
  {
    id: "avigilon-h5a-multisensor",
    manufacturer: "Avigilon",
    model: "H5A Multisensor",
    name: "Multi-Sensor Camera",
    fullName: "Avigilon H5A Multisensor",
    category: "camera",
    subcategory: "multi-sensor",
    msrp: 3430,
    streetPrice: 2400,
    laborHours: 3.0,
    specs: {
      resolution: "5MP",
      fovDegrees: 180,
      irRange: 30,
      lensCount: 4,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "4x 5MP multi-sensor, 4-directional, 30m IR, analytics",
    tags: ["outdoor", "5mp", "multi-sensor", "multi-directional", "panoramic", "avigilon", "motorola", "ir", "poe", "analytics"],
  },

  // =======================================================================
  // CAMERAS — Bosch
  // =======================================================================
  {
    id: "bosch-flexidome-5100i",
    manufacturer: "Bosch",
    model: "FLEXIDOME IP 5100i",
    name: "Dome Camera",
    fullName: "Bosch FLEXIDOME IP 5100i",
    category: "camera",
    subcategory: "dome",
    msrp: 600,
    streetPrice: 420,
    laborHours: 1.5,
    specs: {
      resolution: "5MP",
      fovDegrees: 116,
      irRange: 30,
      mounting: "ceiling",
      indoor: true,
      outdoor: true,
      poe: true,
    },
    description: "5MP dome, 116° FOV, 30m IR, built-in AI analytics",
    tags: ["indoor", "outdoor", "5mp", "dome", "bosch", "ir", "poe", "wide-angle", "analytics"],
  },
  {
    id: "bosch-dinion-5100i",
    manufacturer: "Bosch",
    model: "DINION IP 5100i",
    name: "Bullet Camera",
    fullName: "Bosch DINION IP 5100i Bullet",
    category: "camera",
    subcategory: "bullet",
    msrp: 860,
    streetPrice: 600,
    laborHours: 1.75,
    specs: {
      resolution: "4K",
      fovDegrees: 95,
      irRange: 50,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP/4K bullet, 95° FOV, 50m IR, Intelligent Video Analytics",
    tags: ["outdoor", "4k", "8mp", "bullet", "fixed", "bosch", "ir", "long-range", "poe", "analytics"],
  },
  {
    id: "bosch-autodome-5100i",
    manufacturer: "Bosch",
    model: "AUTODOME IP 5100i",
    name: "PTZ Camera",
    fullName: "Bosch AUTODOME IP 5100i PTZ",
    category: "camera",
    subcategory: "ptz",
    msrp: 4000,
    streetPrice: 2800,
    laborHours: 3.0,
    specs: {
      resolution: "2MP",
      fovDegrees: 63,
      irRange: 150,
      zoomFactor: 20,
      mounting: "pendant",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "2MP PTZ, 20x zoom, 150m IR, Intelligent Tracking",
    tags: ["outdoor", "2mp", "1080p", "ptz", "zoom", "bosch", "ir", "long-range", "poe", "analytics"],
  },

  // =======================================================================
  // ACCESS CONTROL — HID Global (Readers)
  // =======================================================================
  {
    id: "hid-r10",
    manufacturer: "HID Global",
    model: "iCLASS SE R10",
    name: "Contactless Card Reader",
    fullName: "HID iCLASS SE R10",
    category: "reader",
    subcategory: "card",
    msrp: 135,
    streetPrice: 95,
    laborHours: 1.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Contactless smart card reader, iCLASS SE platform",
    tags: ["indoor", "card", "contactless", "hid", "iclass", "reader", "access-control"],
  },
  {
    id: "hid-r40",
    manufacturer: "HID Global",
    model: "iCLASS SE R40",
    name: "Multi-Format Card Reader",
    fullName: "HID iCLASS SE R40",
    category: "reader",
    subcategory: "card",
    msrp: 205,
    streetPrice: 145,
    laborHours: 1.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: true,
    },
    description: "Multi-format card reader, iCLASS SE, weatherized",
    tags: ["indoor", "outdoor", "card", "multi-format", "hid", "iclass", "reader", "access-control"],
  },
  {
    id: "hid-rk40",
    manufacturer: "HID Global",
    model: "iCLASS SE RK40",
    name: "Reader with Keypad",
    fullName: "HID iCLASS SE RK40",
    category: "reader",
    subcategory: "keypad",
    msrp: 255,
    streetPrice: 180,
    laborHours: 1.25,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: true,
    },
    description: "Multi-format card reader + keypad combo, iCLASS SE",
    tags: ["indoor", "outdoor", "card", "keypad", "multi-format", "hid", "iclass", "reader", "access-control"],
  },
  {
    id: "hid-signo-40",
    manufacturer: "HID Global",
    model: "Signo 40",
    name: "Mobile + Smart Card Reader",
    fullName: "HID Signo 40 Reader",
    category: "reader",
    subcategory: "card",
    msrp: 240,
    streetPrice: 170,
    laborHours: 1.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: true,
      wireless: true,
    },
    description: "Mobile-ready + smart card reader, BLE, NFC, OSDP",
    tags: ["indoor", "outdoor", "card", "mobile", "bluetooth", "nfc", "hid", "signo", "reader", "access-control", "osdp"],
  },
  {
    id: "hid-signo-40k",
    manufacturer: "HID Global",
    model: "Signo 40K",
    name: "Mobile + Smart Card Reader with Keypad",
    fullName: "HID Signo 40K Reader",
    category: "reader",
    subcategory: "keypad",
    msrp: 300,
    streetPrice: 210,
    laborHours: 1.25,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: true,
      wireless: true,
    },
    description: "Mobile + smart card + keypad, BLE, NFC, OSDP",
    tags: ["indoor", "outdoor", "card", "keypad", "mobile", "bluetooth", "nfc", "hid", "signo", "reader", "access-control", "osdp"],
  },

  // =======================================================================
  // ACCESS CONTROL — Mercury Security (Controllers)
  // =======================================================================
  {
    id: "mercury-lp4502",
    manufacturer: "Mercury Security",
    model: "LP4502",
    name: "2-Door Intelligent Controller",
    fullName: "Mercury LP4502 Controller",
    category: "reader",
    subcategory: "controller",
    msrp: 970,
    streetPrice: 680,
    laborHours: 3.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "2-door intelligent controller, PoE, embedded Linux",
    tags: ["indoor", "controller", "2-door", "mercury", "poe", "access-control", "panel"],
  },
  {
    id: "mercury-lp1502",
    manufacturer: "Mercury Security",
    model: "LP1502",
    name: "Single-Door Controller",
    fullName: "Mercury LP1502 Controller",
    category: "reader",
    subcategory: "controller",
    msrp: 600,
    streetPrice: 420,
    laborHours: 2.5,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "Single-door intelligent controller, PoE, compact",
    tags: ["indoor", "controller", "single-door", "mercury", "poe", "access-control", "panel"],
  },
  {
    id: "mercury-mr62e",
    manufacturer: "Mercury Security",
    model: "MR62e",
    name: "Reader Interface Module",
    fullName: "Mercury MR62e Reader Interface",
    category: "reader",
    subcategory: "controller",
    msrp: 255,
    streetPrice: 180,
    laborHours: 1.5,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Reader interface board, RS-485, OSDP-ready",
    tags: ["indoor", "controller", "interface", "mercury", "access-control", "osdp"],
  },

  // =======================================================================
  // ACCESS CONTROL — Suprema (Biometric)
  // =======================================================================
  {
    id: "suprema-bioentry-w2",
    manufacturer: "Suprema",
    model: "BioEntry W2",
    name: "Fingerprint + Card Reader",
    fullName: "Suprema BioEntry W2",
    category: "reader",
    subcategory: "biometric",
    msrp: 740,
    streetPrice: 520,
    laborHours: 2.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: true,
    },
    description: "Fingerprint + card reader, IP67, IK08, OSDP",
    tags: ["indoor", "outdoor", "biometric", "fingerprint", "card", "suprema", "reader", "access-control", "osdp"],
  },
  {
    id: "suprema-facestation-f2",
    manufacturer: "Suprema",
    model: "FaceStation F2",
    name: "Facial Recognition Terminal",
    fullName: "Suprema FaceStation F2",
    category: "reader",
    subcategory: "biometric",
    msrp: 1710,
    streetPrice: 1200,
    laborHours: 2.5,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Facial recognition + card, fusion matching, live detection",
    tags: ["indoor", "biometric", "facial-recognition", "face", "card", "suprema", "reader", "access-control"],
  },

  // =======================================================================
  // ACCESS CONTROL — ASSA ABLOY (Locks)
  // =======================================================================
  {
    id: "assa-abloy-aperio-h100",
    manufacturer: "ASSA ABLOY",
    model: "Aperio H100",
    name: "Wireless Lock",
    fullName: "ASSA ABLOY Aperio H100",
    category: "reader",
    subcategory: "lock",
    msrp: 640,
    streetPrice: 450,
    laborHours: 2.5,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
      wireless: true,
    },
    description: "Wireless lock, integrates with existing ACS, BLE",
    tags: ["indoor", "lock", "wireless", "bluetooth", "assa-abloy", "aperio", "access-control"],
  },
  {
    id: "assa-abloy-in120",
    manufacturer: "ASSA ABLOY",
    model: "IN120",
    name: "WiFi Lock",
    fullName: "ASSA ABLOY IN120 WiFi Lock",
    category: "reader",
    subcategory: "lock",
    msrp: 540,
    streetPrice: 380,
    laborHours: 2.0,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
      wireless: true,
    },
    description: "WiFi-networked lock, real-time monitoring, audit trail",
    tags: ["indoor", "lock", "wireless", "wifi", "assa-abloy", "access-control", "networked"],
  },

  // =======================================================================
  // DOOR HARDWARE — Electric strikes, mag locks, REX, exit devices,
  // intercoms, and power supplies. Type-wise these still live under
  // `reader` (access-control loop wiring) but the library surfaces them
  // under their own "Door Hardware" tab.
  // =======================================================================
  {
    id: "hes-1006",
    manufacturer: "HES",
    model: "1006",
    name: "Heavy-Duty Electric Strike",
    fullName: "HES 1006 Heavy-Duty Electric Strike",
    category: "reader",
    subcategory: "electric-strike",
    msrp: 470,
    streetPrice: 330,
    laborHours: 1.5,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: true,
    },
    description: "Stainless heavy-duty strike, 12/24VDC field-selectable, fail-safe/fail-secure",
    tags: ["door-hardware", "electric-strike", "strike", "hes", "12vdc", "24vdc", "fail-safe"],
  },
  {
    id: "hes-9600",
    manufacturer: "HES",
    model: "9600",
    name: "Surface-Mount Electric Strike",
    fullName: "HES 9600 Surface-Mount Electric Strike",
    category: "reader",
    subcategory: "electric-strike",
    msrp: 380,
    streetPrice: 265,
    laborHours: 1.25,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
    },
    description: "Surface-mount strike for rim exit devices, low-current 12/24VDC, ANSI grade 1",
    tags: ["door-hardware", "electric-strike", "surface-mount", "hes", "rim-exit", "low-current"],
  },
  {
    id: "securitron-m62",
    manufacturer: "Securitron",
    model: "M62",
    name: "1,200 lb Magnetic Lock",
    fullName: "Securitron M62 Magnalock 1,200 lb",
    category: "reader",
    subcategory: "mag-lock",
    msrp: 500,
    streetPrice: 350,
    laborHours: 2.0,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
    },
    description: "1,200 lb single-door magnetic lock, instant release, 12/24VDC, MagnaCare lifetime warranty",
    tags: ["door-hardware", "mag-lock", "magnalock", "securitron", "1200lb", "fail-safe"],
  },
  {
    id: "dortronics-1109",
    manufacturer: "Dortronics",
    model: "1109",
    name: "600 lb Mini Magnetic Lock",
    fullName: "Dortronics 1109 Mini Magnetic Lock 600 lb",
    category: "reader",
    subcategory: "mag-lock",
    msrp: 270,
    streetPrice: 190,
    laborHours: 1.5,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
    },
    description: "600 lb mini mag for interior or cabinet doors, 12/24VDC, low-profile housing",
    tags: ["door-hardware", "mag-lock", "mini-mag", "dortronics", "600lb", "fail-safe", "cabinet"],
  },
  {
    id: "bosch-ds150i",
    manufacturer: "Bosch",
    model: "DS150i",
    name: "Request-to-Exit Sensor",
    fullName: "Bosch DS150i Request-to-Exit PIR",
    category: "reader",
    subcategory: "rex-button",
    msrp: 95,
    streetPrice: 68,
    laborHours: 0.75,
    specs: {
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
    },
    description: "Ceiling-mount PIR REX with form C relay, adjustable lens mask, anti-tamper",
    tags: ["door-hardware", "rex-button", "rex", "request-to-exit", "pir", "bosch", "form-c"],
  },
  {
    id: "alarm-controls-ts14",
    manufacturer: "Alarm Controls",
    model: "TS-14",
    name: "Push-to-Exit Button",
    fullName: "Alarm Controls TS-14 Push-to-Exit Button",
    category: "reader",
    subcategory: "rex-button",
    msrp: 65,
    streetPrice: 45,
    laborHours: 0.5,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Stainless steel mushroom push button, single-gang plate, DPDT contacts",
    tags: ["door-hardware", "rex-button", "push-button", "mushroom", "alarm-controls", "stainless"],
  },
  {
    id: "detex-v40",
    manufacturer: "Detex",
    model: "V40",
    name: "Rim Exit Device (Crash Bar)",
    fullName: "Detex V40 Rim Exit Device",
    category: "reader",
    subcategory: "exit-device",
    msrp: 720,
    streetPrice: 510,
    laborHours: 2.5,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
    },
    description: "ANSI grade 1 rim exit device, 36\" crash bar, optional latch monitor switch",
    tags: ["door-hardware", "exit-device", "crash-bar", "panic-bar", "detex", "rim", "ansi-grade-1"],
  },
  {
    id: "vonduprin-99-el",
    manufacturer: "Von Duprin",
    model: "99-EL",
    name: "Electric Latch Retraction Crash Bar",
    fullName: "Von Duprin 99-EL Electric Latch Retraction Exit",
    category: "reader",
    subcategory: "exit-device",
    msrp: 1450,
    streetPrice: 1020,
    // Electric latch retraction needs a dedicated power supply + door
    // prep + transfer hinge wiring — runs 4-6h vs. 2.5h for a mechanical
    // crash bar.
    laborHours: 4.5,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
    },
    description: "Electrified rim exit with latch retraction, 24VDC, dogging for free-egress windows",
    tags: ["door-hardware", "exit-device", "crash-bar", "electric-latch", "von-duprin", "el", "24vdc"],
  },
  {
    id: "aiphone-ix-dv",
    manufacturer: "Aiphone",
    model: "IX-DV",
    name: "Video Door Station",
    fullName: "Aiphone IX-DV IP Video Door Station",
    category: "reader",
    subcategory: "intercom",
    msrp: 1100,
    streetPrice: 770,
    // Cat6 pull + PoE + SIP/IX provisioning + door release wiring runs
    // ~3h on a typical commercial entry.
    laborHours: 3.0,
    specs: {
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "SIP/IP video door station, 1.3 MP wide-angle camera, IK10 vandal, PoE",
    tags: ["door-hardware", "intercom", "video-intercom", "doorstation", "aiphone", "sip", "poe", "ik10"],
  },
  {
    id: "2n-ip-verso",
    manufacturer: "2N",
    model: "IP Verso",
    name: "Modular IP Intercom",
    fullName: "2N IP Verso Modular Door Intercom",
    category: "reader",
    subcategory: "intercom",
    msrp: 1300,
    streetPrice: 920,
    // Modular intercom + per-module config + reader integration ~4h.
    laborHours: 4.0,
    specs: {
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "Modular SIP intercom, HD camera, keypad + card reader add-ons, PoE",
    tags: ["door-hardware", "intercom", "video-intercom", "modular", "2n", "sip", "poe", "card-reader"],
  },
  {
    id: "altronix-al400ulpd8",
    manufacturer: "Altronix",
    model: "AL400ULPD8",
    name: "8-Output Access Power Supply",
    fullName: "Altronix AL400ULPD8 Access Power Supply",
    category: "reader",
    subcategory: "power-supply",
    msrp: 410,
    streetPrice: 290,
    laborHours: 1.5,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
    },
    description: "12/24VDC 4A access-control PSU, 8 fused outputs, fire-alarm interface, battery backup",
    tags: ["door-hardware", "power-supply", "psu", "altronix", "12vdc", "24vdc", "battery-backup", "fire-interface"],
  },
  {
    id: "lifesafety-flx150",
    manufacturer: "LifeSafety Power",
    model: "FlexPower FPO150",
    name: "Single-Output Lock PSU",
    fullName: "LifeSafety Power FlexPower FPO150",
    category: "reader",
    subcategory: "power-supply",
    msrp: 230,
    streetPrice: 160,
    laborHours: 1.0,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
    },
    description: "Compact 12/24VDC 1.5A lock supply, status LEDs, fire-trigger input",
    tags: ["door-hardware", "power-supply", "psu", "lifesafety", "compact", "12vdc", "24vdc"],
  },

  // =======================================================================
  // PERIMETER — LPR cameras, turnstiles, bollards, gate operators.
  // LPR is filed under `camera` so the FOV cone math still works. The
  // access-control items (turnstile / bollard / gate) live under `reader`
  // alongside door hardware. All four show up under the Perimeter tab.
  // =======================================================================
  {
    id: "axis-p1455-le-3",
    manufacturer: "Axis",
    model: "P1455-LE-3 LPR Kit",
    name: "License Plate Reader Kit",
    fullName: "Axis P1455-LE-3 License Plate Verifier Kit",
    category: "camera",
    subcategory: "lpr",
    msrp: 1850,
    streetPrice: 1295,
    laborHours: 2.5,
    specs: {
      resolution: "2MP",
      fovDegrees: 35,
      rangeMeters: 25,
      irRange: 40,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "Pre-tuned LPR bullet kit with on-camera plate verifier, 25m read range, IR illuminator, IP66",
    tags: ["outdoor", "lpr", "license-plate", "anpr", "axis", "ir", "poe", "perimeter"],
  },
  {
    id: "hikvision-ids-tcm203",
    manufacturer: "Hikvision",
    model: "iDS-TCM203-A",
    name: "ANPR Bullet Camera",
    fullName: "Hikvision iDS-TCM203-A ANPR Bullet",
    category: "camera",
    subcategory: "lpr",
    msrp: 980,
    streetPrice: 690,
    laborHours: 2.0,
    specs: {
      resolution: "2MP",
      fovDegrees: 30,
      rangeMeters: 30,
      irRange: 50,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "DeepInView ANPR bullet, two-vehicle-per-lane reads, supplemental white-light + IR, IP67",
    tags: ["outdoor", "lpr", "anpr", "license-plate", "hikvision", "ir", "poe", "perimeter", "deepinview"],
  },
  {
    id: "boon-edam-speedlane-swing",
    manufacturer: "Boon Edam",
    model: "Speedlane Swing",
    name: "Optical Turnstile",
    fullName: "Boon Edam Speedlane Swing Optical Turnstile",
    category: "reader",
    subcategory: "turnstile",
    // Optical turnstiles are 20+ hours to install + commission with reader
    // integration; original 10h was install-only and unrealistic.
    msrp: 24500,
    streetPrice: 18900,
    laborHours: 20,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
    },
    description: "Optical swing-barrier turnstile, 90 ppm throughput, tailgating detection, integrates with any reader",
    tags: ["indoor", "turnstile", "optical", "boon-edam", "tailgating", "access-control", "lobby"],
  },
  {
    id: "dormakaba-argus-hsb",
    manufacturer: "dormakaba",
    model: "Argus HSB",
    name: "High-Security Turnstile",
    fullName: "dormakaba Argus HSB Full-Height Turnstile",
    category: "reader",
    subcategory: "turnstile",
    msrp: 18200,
    streetPrice: 13900,
    laborHours: 18,
    specs: {
      mounting: "surface",
      indoor: false,
      outdoor: true,
    },
    description: "Full-height 3-arm tripod turnstile, IP54, anti-passback, weatherproof for fence-line entry",
    tags: ["outdoor", "turnstile", "full-height", "dormakaba", "anti-passback", "perimeter", "fence-line"],
  },
  {
    id: "delta-scientific-tt203",
    manufacturer: "Delta Scientific",
    model: "TT203",
    name: "Shallow-Foundation Bollard",
    fullName: "Delta Scientific TT203 Shallow-Foundation Bollard",
    category: "reader",
    subcategory: "bollard",
    // K12-rated shallow-mount bollards run $7-12k each at street; bumped
    // from a too-low initial estimate.
    msrp: 10500,
    streetPrice: 7500,
    laborHours: 12,
    specs: {
      mounting: "surface",
      indoor: false,
      outdoor: true,
    },
    description: "K12-rated fixed crash bollard, 14\" shallow foundation, stops 15,000 lb @ 50 mph",
    tags: ["outdoor", "bollard", "crash-rated", "k12", "delta-scientific", "perimeter", "anti-ram"],
  },
  {
    id: "calpipe-fixed-bollard",
    manufacturer: "Calpipe",
    model: "CPB-6OD",
    name: "Fixed Steel Bollard",
    fullName: "Calpipe CPB-6OD Fixed Steel Bollard",
    category: "reader",
    subcategory: "bollard",
    msrp: 320,
    streetPrice: 225,
    laborHours: 2,
    specs: {
      mounting: "surface",
      indoor: false,
      outdoor: true,
    },
    description: "6\" OD schedule-40 steel bollard, concrete-filled, hot-dip galvanized, decorative cover available",
    tags: ["outdoor", "bollard", "steel", "calpipe", "perimeter", "fixed", "galvanized"],
  },
  {
    id: "liftmaster-la500",
    manufacturer: "LiftMaster",
    model: "LA500",
    name: "Swing Gate Operator",
    fullName: "LiftMaster LA500 Residential/Light-Commercial Swing Operator",
    category: "reader",
    subcategory: "gate-operator",
    // Includes operator mount + limit/force tuning + UL 325 entrapment
    // protection wiring — 6h was just the mechanical hang.
    msrp: 1450,
    streetPrice: 1050,
    laborHours: 10,
    specs: {
      mounting: "surface",
      indoor: false,
      outdoor: true,
    },
    description: "DC swing gate operator, 18 ft / 1,000 lb leaf, integrated solar option, UL 325 compliant",
    tags: ["outdoor", "gate-operator", "swing-gate", "liftmaster", "dc", "solar", "ul-325"],
  },
  {
    id: "faac-412",
    manufacturer: "FAAC",
    model: "412",
    name: "Underground Swing Operator",
    fullName: "FAAC 412 Underground Hydraulic Swing Operator",
    category: "reader",
    subcategory: "gate-operator",
    msrp: 2100,
    streetPrice: 1490,
    laborHours: 14,
    specs: {
      mounting: "surface",
      indoor: false,
      outdoor: true,
    },
    description: "Underground hydraulic operator, 8 ft leaf, hidden install for architectural gates",
    tags: ["outdoor", "gate-operator", "swing-gate", "faac", "hydraulic", "underground", "hidden"],
  },

  // =======================================================================
  // FIRE / LIFE SAFETY — pull stations, fire alarm control panels,
  // exit signs, AED cabinets. All filed under `sensor` for consistency
  // with existing smoke / heat / notification entries.
  // =======================================================================
  {
    id: "notifier-nbg-12lx",
    manufacturer: "Notifier",
    model: "NBG-12LX",
    name: "Addressable Pull Station",
    fullName: "Notifier NBG-12LX Addressable Pull Station",
    category: "sensor",
    subcategory: "pull-station",
    msrp: 165,
    streetPrice: 115,
    laborHours: 0.75,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Dual-action addressable pull, key-reset, captive screw terminals, SLC loop powered",
    tags: ["indoor", "pull-station", "fire", "addressable", "notifier", "slc", "dual-action"],
  },
  {
    id: "honeywell-bg-12",
    manufacturer: "Honeywell",
    model: "BG-12",
    name: "Conventional Pull Station",
    fullName: "Honeywell BG-12 Conventional Pull Station",
    category: "sensor",
    subcategory: "pull-station",
    msrp: 95,
    streetPrice: 65,
    laborHours: 0.5,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Single-action conventional pull station, key reset, English/Spanish labeling",
    tags: ["indoor", "pull-station", "fire", "conventional", "honeywell", "single-action"],
  },
  {
    id: "notifier-nfs2-3030",
    manufacturer: "Notifier",
    model: "NFS2-3030",
    name: "Fire Alarm Control Panel",
    fullName: "Notifier NFS2-3030 Intelligent FACP",
    category: "sensor",
    subcategory: "facp",
    // A real intelligent FACP install includes panel mount + SLC wiring +
    // initial programming + AHJ acceptance test — typically 20-30 hours
    // even before the field devices. 8h was just bracket-on-the-wall.
    msrp: 6800,
    streetPrice: 4750,
    laborHours: 24,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Networkable intelligent FACP, up to 318 points per SLC, dual-channel voice evac ready",
    tags: ["indoor", "facp", "fire", "control-panel", "addressable", "notifier", "voice-evac"],
  },
  {
    id: "silent-knight-5808",
    manufacturer: "Silent Knight",
    model: "5808",
    name: "Conventional FACP",
    fullName: "Silent Knight 5808 8-Zone Conventional FACP",
    category: "sensor",
    subcategory: "facp",
    msrp: 1100,
    streetPrice: 780,
    laborHours: 12,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "8-zone conventional fire alarm control panel, UL 864, modem + IP dialer ready",
    tags: ["indoor", "facp", "fire", "conventional", "8-zone", "silent-knight", "ul-864"],
  },
  {
    id: "lithonia-lhqm",
    manufacturer: "Lithonia Lighting",
    model: "LHQM LED",
    name: "Combo Exit / Emergency Sign",
    fullName: "Lithonia LHQM LED Combo Exit + Emergency Light",
    category: "sensor",
    subcategory: "exit-sign",
    msrp: 95,
    streetPrice: 65,
    laborHours: 1.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "LED combo exit + dual emergency heads, NiCad battery backup, UL 924 listed",
    tags: ["indoor", "exit-sign", "emergency-light", "led", "lithonia", "ul-924", "battery-backup"],
  },
  {
    id: "hubbell-edge-elxp",
    manufacturer: "Hubbell",
    model: "Edge ELXP",
    name: "Edge-Lit Exit Sign",
    fullName: "Hubbell Edge ELXP Edge-Lit Exit Sign",
    category: "sensor",
    subcategory: "exit-sign",
    msrp: 145,
    streetPrice: 100,
    laborHours: 0.75,
    specs: {
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
    },
    description: "Architectural edge-lit acrylic exit sign, red or green LEDs, NiMH battery",
    tags: ["indoor", "exit-sign", "edge-lit", "architectural", "hubbell", "led"],
  },
  {
    id: "zoll-aed-plus",
    manufacturer: "ZOLL",
    model: "AED Plus",
    name: "AED + Wall Cabinet",
    fullName: "ZOLL AED Plus with Surface Wall Cabinet",
    category: "sensor",
    subcategory: "aed",
    msrp: 2200,
    streetPrice: 1650,
    laborHours: 1.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Semi-automatic AED with Real CPR Help feedback, 5-yr battery, surface alarm cabinet included",
    tags: ["indoor", "aed", "defibrillator", "zoll", "wall-cabinet", "life-safety", "cpr-feedback"],
  },
  {
    id: "cardiac-science-g5",
    manufacturer: "Cardiac Science",
    model: "Powerheart G5",
    name: "AED + Wall Cabinet",
    fullName: "Cardiac Science Powerheart G5 with Wall Cabinet",
    category: "sensor",
    subcategory: "aed",
    msrp: 2050,
    streetPrice: 1495,
    laborHours: 1.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Fully-automatic AED, Intellisense CPR feedback, 4-yr battery, recessed wall cabinet",
    tags: ["indoor", "aed", "defibrillator", "cardiac-science", "wall-cabinet", "life-safety", "auto-shock"],
  },

  // =======================================================================
  // INSTALL HARDWARE — what GCs / electricians / low-voltage installers
  // spec alongside the devices. Back boxes, mounting brackets, conduit
  // runs, surface raceway. Real distributor pricing (Anixter / Graybar /
  // big-box electrical lines).
  // =======================================================================
  {
    id: "raco-232",
    manufacturer: "Raco",
    model: "232",
    name: "4\" Octagon Ceiling Box",
    fullName: "Raco 232 4\" Octagon Steel Ceiling Box",
    category: "sensor",
    subcategory: "back-box",
    msrp: 6,
    streetPrice: 4,
    laborHours: 0.4,
    specs: {
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
    },
    description: "4\" octagon steel ceiling box, 1/2\" KO, for camera/AP rough-in",
    tags: ["install", "back-box", "ceiling", "rough-in", "raco", "octagon", "steel"],
  },
  {
    id: "raco-690",
    manufacturer: "Raco",
    model: "690",
    name: "Single-Gang Steel Box",
    fullName: "Raco 690 Single-Gang Drawn Steel Box",
    category: "sensor",
    subcategory: "back-box",
    msrp: 8,
    streetPrice: 5,
    laborHours: 0.35,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Single-gang 4\" deep steel device box, 1/2\" KO, NM/MC ready",
    tags: ["install", "back-box", "wall", "rough-in", "single-gang", "raco", "steel"],
  },
  {
    id: "raco-696",
    manufacturer: "Raco",
    model: "696",
    name: "Double-Gang Steel Box",
    fullName: "Raco 696 Double-Gang Drawn Steel Box",
    category: "sensor",
    subcategory: "back-box",
    msrp: 12,
    streetPrice: 8,
    laborHours: 0.45,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Double-gang 4\" deep steel device box, perfect for keypad + reader combo",
    tags: ["install", "back-box", "wall", "rough-in", "double-gang", "raco", "steel"],
  },
  {
    id: "raco-660",
    manufacturer: "Raco",
    model: "660WPSP",
    name: "Weatherproof Junction Box",
    fullName: "Raco 660WPSP Weatherproof Aluminum Junction Box",
    category: "sensor",
    subcategory: "back-box",
    msrp: 38,
    streetPrice: 25,
    laborHours: 0.6,
    specs: {
      mounting: "wall",
      indoor: false,
      outdoor: true,
    },
    description: "Weatherproof aluminum junction box, IP54, two 1/2\" hubs, exterior camera rough-in",
    tags: ["install", "back-box", "outdoor", "weatherproof", "ip54", "rough-in", "raco", "aluminum"],
  },
  {
    id: "axis-t91a64",
    manufacturer: "Axis",
    model: "T91A64",
    name: "Corner Mount",
    fullName: "Axis T91A64 Corner Wall Mount",
    category: "sensor",
    subcategory: "mount-bracket",
    msrp: 145,
    streetPrice: 100,
    laborHours: 0.75,
    specs: {
      mounting: "wall",
      indoor: false,
      outdoor: true,
    },
    description: "Corner wall mount for bullet/dome cameras, aluminum, IP66, cable management",
    tags: ["install", "mount-bracket", "corner", "wall-mount", "axis", "aluminum", "ip66"],
  },
  {
    id: "axis-t91k61",
    manufacturer: "Axis",
    model: "T91K61",
    name: "Pendant Mount Kit",
    fullName: "Axis T91K61 Pendant Mount Kit",
    category: "sensor",
    subcategory: "mount-bracket",
    msrp: 110,
    streetPrice: 75,
    laborHours: 0.6,
    specs: {
      mounting: "ceiling",
      indoor: true,
      outdoor: true,
    },
    description: "Pendant adapter for dome / PTZ cameras, includes 1.5m drop pipe, IP65",
    tags: ["install", "mount-bracket", "pendant", "ceiling-drop", "axis", "ptz", "ip65"],
  },
  {
    id: "vivotek-am-516",
    manufacturer: "Vivotek",
    model: "AM-516",
    name: "Universal Wall Arm Bracket",
    fullName: "Vivotek AM-516 Universal Wall Arm Bracket",
    category: "sensor",
    subcategory: "mount-bracket",
    msrp: 95,
    streetPrice: 60,
    laborHours: 0.5,
    specs: {
      mounting: "wall",
      indoor: false,
      outdoor: true,
    },
    description: "Heavy-duty wall arm bracket, fits most bullet + PTZ housings, hidden cable channel",
    tags: ["install", "mount-bracket", "wall-arm", "universal", "vivotek", "outdoor", "cable-hidden"],
  },
  {
    id: "axis-t91d61",
    manufacturer: "Axis",
    model: "T91D61",
    name: "Pole Mount Bracket",
    fullName: "Axis T91D61 Pole Mount with Strapping",
    category: "sensor",
    subcategory: "mount-bracket",
    msrp: 170,
    streetPrice: 120,
    laborHours: 1.25,
    specs: {
      mounting: "surface",
      indoor: false,
      outdoor: true,
    },
    description: "Universal pole mount, fits 3-15\" diameter, stainless strap, IP66 cable seal",
    tags: ["install", "mount-bracket", "pole-mount", "axis", "stainless", "outdoor", "ip66"],
  },
  {
    id: "emt-075-10ft",
    manufacturer: "Allied Tube",
    model: "EMT 3/4\" × 10ft",
    name: "3/4\" EMT Conduit (10 ft)",
    fullName: "Allied Tube 3/4\" EMT Steel Conduit, 10 ft Stick",
    category: "sensor",
    subcategory: "conduit",
    msrp: 18,
    streetPrice: 12,
    laborHours: 0.5,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: true,
    },
    description: "3/4\" EMT steel conduit, 10-ft stick, UL listed, exposed-run cable protection",
    tags: ["install", "conduit", "emt", "steel", "3/4-inch", "10ft", "ul-listed", "allied-tube"],
  },
  {
    id: "emt-100-10ft",
    manufacturer: "Allied Tube",
    model: "EMT 1\" × 10ft",
    name: "1\" EMT Conduit (10 ft)",
    fullName: "Allied Tube 1\" EMT Steel Conduit, 10 ft Stick",
    category: "sensor",
    subcategory: "conduit",
    msrp: 26,
    streetPrice: 18,
    laborHours: 0.6,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: true,
    },
    description: "1\" EMT steel conduit, 10-ft stick, fits up to ~25 Cat6 runs",
    tags: ["install", "conduit", "emt", "steel", "1-inch", "10ft", "ul-listed", "allied-tube"],
  },
  {
    id: "carflex-075-25ft",
    manufacturer: "Southwire",
    model: "Carflex 3/4\" × 25ft",
    name: "3/4\" Flex Conduit (25 ft)",
    fullName: "Southwire Carflex 3/4\" Liquidtight Flex Conduit, 25 ft Coil",
    category: "sensor",
    subcategory: "conduit",
    msrp: 48,
    streetPrice: 32,
    laborHours: 0.4,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: true,
    },
    description: "3/4\" liquidtight flex conduit, 25-ft coil, UL 360, motor/whip connections",
    tags: ["install", "conduit", "flex", "liquidtight", "carflex", "southwire", "ul-360"],
  },
  {
    id: "wiremold-v500-5ft",
    manufacturer: "Wiremold",
    model: "V500",
    name: "Surface Raceway (5 ft)",
    fullName: "Wiremold V500 Metal Surface Raceway, 5 ft Section",
    category: "sensor",
    subcategory: "raceway",
    msrp: 16,
    streetPrice: 11,
    laborHours: 0.5,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "V500 metal surface raceway, 5-ft section, paintable, retrofit cable runs without wall fishing",
    tags: ["install", "raceway", "wiremold", "v500", "surface-mount", "retrofit", "paintable"],
  },
  {
    id: "panduit-lds10-6",
    manufacturer: "Panduit",
    model: "LDS10-6",
    name: "Snap-On Raceway (6 ft)",
    fullName: "Panduit LDS10-6 Snap-On PVC Surface Raceway, 6 ft",
    category: "sensor",
    subcategory: "raceway",
    msrp: 22,
    streetPrice: 15,
    laborHours: 0.45,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Snap-on PVC raceway, 6-ft section, low-voltage cable management, ivory or white",
    tags: ["install", "raceway", "panduit", "snap-on", "pvc", "low-voltage", "office-retrofit"],
  },

  // =======================================================================
  // SENSORS — Bosch Security
  // =======================================================================
  {
    id: "bosch-bdl2-wp12g",
    manufacturer: "Bosch",
    model: "ISC-BDL2-WP12G",
    name: "Blue Line Gen2 PIR Sensor",
    fullName: "Bosch Blue Line Gen2 PIR",
    category: "sensor",
    subcategory: "motion",
    msrp: 65,
    streetPrice: 45,
    laborHours: 0.75,
    specs: {
      rangeMeters: 12,
      fovDegrees: 90,
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "PIR motion sensor, 12m range, wide-angle, pet-immune",
    tags: ["indoor", "motion", "pir", "bosch", "sensor", "blue-line", "intrusion"],
  },
  {
    id: "bosch-ds938z",
    manufacturer: "Bosch",
    model: "DS938Z",
    name: "Long-Range PIR Sensor",
    fullName: "Bosch DS938Z PIR",
    category: "sensor",
    subcategory: "motion",
    msrp: 92,
    streetPrice: 65,
    laborHours: 0.75,
    specs: {
      rangeMeters: 18,
      fovDegrees: 60,
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Long-range PIR sensor, 18m, narrow curtain pattern",
    tags: ["indoor", "motion", "pir", "bosch", "sensor", "long-range", "intrusion"],
  },
  {
    id: "bosch-cdl1-wa12g",
    manufacturer: "Bosch",
    model: "ISC-CDL1-WA12G",
    name: "Ceiling-Mount PIR Sensor",
    fullName: "Bosch Ceiling-Mount PIR",
    category: "sensor",
    subcategory: "motion",
    msrp: 78,
    streetPrice: 55,
    laborHours: 0.75,
    specs: {
      rangeMeters: 12,
      fovDegrees: 360,
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
    },
    description: "360° ceiling-mount PIR, 12m radius, walk-test LED",
    tags: ["indoor", "motion", "pir", "bosch", "sensor", "ceiling", "360", "intrusion"],
  },

  // =======================================================================
  // SENSORS — Honeywell
  // =======================================================================
  {
    id: "honeywell-is3016",
    manufacturer: "Honeywell",
    model: "IS3016",
    name: "PIR Motion Sensor",
    fullName: "Honeywell IS3016 PIR",
    category: "sensor",
    subcategory: "motion",
    msrp: 57,
    streetPrice: 40,
    laborHours: 0.75,
    specs: {
      rangeMeters: 16,
      fovDegrees: 90,
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "PIR motion sensor, 16m range, 90° coverage",
    tags: ["indoor", "motion", "pir", "honeywell", "sensor", "intrusion"],
  },
  {
    id: "honeywell-fg1625",
    manufacturer: "Honeywell",
    model: "FG-1625",
    name: "Acoustic Glass-Break Sensor",
    fullName: "Honeywell FG-1625 Glass-Break",
    category: "sensor",
    subcategory: "glass-break",
    msrp: 85,
    streetPrice: 60,
    laborHours: 0.5,
    specs: {
      rangeMeters: 7.6,
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
    },
    description: "Acoustic glass-break, 7.6m range, FlexGuard technology",
    tags: ["indoor", "glass-break", "acoustic", "honeywell", "sensor", "intrusion"],
  },
  {
    id: "honeywell-5816",
    manufacturer: "Honeywell",
    model: "5816",
    name: "Door/Window Transmitter",
    fullName: "Honeywell 5816 Door/Window",
    category: "sensor",
    subcategory: "door-contact",
    msrp: 36,
    streetPrice: 25,
    laborHours: 0.25,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
      wireless: true,
    },
    description: "Wireless door/window contact, 345 MHz, slim profile",
    tags: ["indoor", "door-contact", "wireless", "magnetic", "honeywell", "sensor", "intrusion"],
  },

  // =======================================================================
  // SENSORS — System Sensor (Fire)
  // =======================================================================
  {
    id: "system-sensor-2wtr-b",
    manufacturer: "System Sensor",
    model: "2WTR-B",
    name: "Smoke Detector",
    fullName: "System Sensor 2WTR-B Smoke Detector",
    category: "sensor",
    subcategory: "smoke",
    msrp: 50,
    streetPrice: 35,
    laborHours: 0.75,
    specs: {
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
    },
    description: "Conventional 2-wire photoelectric smoke detector",
    tags: ["indoor", "smoke", "fire", "photoelectric", "system-sensor", "sensor", "conventional"],
  },
  {
    id: "system-sensor-spsr",
    manufacturer: "System Sensor",
    model: "SPSR",
    name: "Speaker/Strobe",
    fullName: "System Sensor SPSR Speaker/Strobe",
    category: "sensor",
    subcategory: "notification",
    msrp: 120,
    streetPrice: 85,
    laborHours: 1.0,
    specs: {
      mounting: "wall",
      indoor: true,
      outdoor: false,
    },
    description: "Wall-mount speaker/strobe, selectable candela, fire alarm",
    tags: ["indoor", "notification", "speaker", "strobe", "fire", "system-sensor", "sensor", "alarm"],
  },
  {
    id: "system-sensor-p2rh",
    manufacturer: "System Sensor",
    model: "P2RH",
    name: "Heat Detector",
    fullName: "System Sensor P2RH Heat Detector",
    category: "sensor",
    subcategory: "heat",
    msrp: 42,
    streetPrice: 30,
    laborHours: 0.75,
    specs: {
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
    },
    description: "Rate-of-rise heat detector, 135°F fixed temp, low-profile",
    tags: ["indoor", "heat", "fire", "rate-of-rise", "system-sensor", "sensor", "conventional"],
  },

  // =======================================================================
  // NETWORK — Ubiquiti
  // =======================================================================
  {
    id: "ubiquiti-u6-enterprise",
    manufacturer: "Ubiquiti",
    model: "U6 Enterprise",
    name: "WiFi 6E Access Point",
    fullName: "Ubiquiti U6 Enterprise AP",
    category: "network",
    subcategory: "access-point",
    msrp: 500,
    streetPrice: 350,
    laborHours: 1.0,
    specs: {
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
      poe: true,
      coverageMeters: 30,
      wireless: true,
    },
    description: "WiFi 6E access point, 2.5G uplink, PoE, UniFi managed",
    tags: ["indoor", "access-point", "wifi", "wifi-6e", "ubiquiti", "unifi", "poe", "network"],
  },
  {
    id: "ubiquiti-usw-pro-24-poe",
    manufacturer: "Ubiquiti",
    model: "USW-Pro-24-PoE",
    name: "24-Port Managed PoE Switch",
    fullName: "Ubiquiti USW-Pro-24-PoE Switch",
    category: "network",
    subcategory: "switch",
    msrp: 1000,
    streetPrice: 700,
    laborHours: 2.0,
    specs: {
      portCount: 24,
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "24-port L2/L3 managed PoE+ switch, 400W PoE budget",
    tags: ["indoor", "switch", "poe", "24-port", "managed", "ubiquiti", "unifi", "network", "layer-3"],
  },

  // =======================================================================
  // NETWORK — Cisco Meraki
  // =======================================================================
  {
    id: "meraki-ms225-24p",
    manufacturer: "Cisco Meraki",
    model: "MS225-24P",
    name: "24-Port PoE Switch",
    fullName: "Cisco Meraki MS225-24P Switch",
    category: "network",
    subcategory: "switch",
    msrp: 2570,
    streetPrice: 1800,
    laborHours: 2.0,
    specs: {
      portCount: 24,
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "24-port PoE L2 switch, cloud-managed, 370W PoE",
    tags: ["indoor", "switch", "poe", "24-port", "managed", "cisco", "meraki", "cloud", "network"],
  },
  {
    id: "meraki-mr46",
    manufacturer: "Cisco Meraki",
    model: "MR46",
    name: "WiFi 6 Access Point",
    fullName: "Cisco Meraki MR46 AP",
    category: "network",
    subcategory: "access-point",
    msrp: 1285,
    streetPrice: 900,
    laborHours: 1.0,
    specs: {
      mounting: "ceiling",
      indoor: true,
      outdoor: false,
      poe: true,
      coverageMeters: 35,
      wireless: true,
    },
    description: "WiFi 6 AP, cloud-managed, 802.11ax, enterprise",
    tags: ["indoor", "access-point", "wifi", "wifi-6", "cisco", "meraki", "cloud", "poe", "network", "enterprise"],
  },

  // =======================================================================
  // NETWORK — NVRs
  // =======================================================================
  {
    id: "axis-s3008",
    manufacturer: "Axis",
    model: "S3008",
    name: "8-Channel Recorder",
    fullName: "Axis S3008 Recorder",
    category: "network",
    subcategory: "nvr",
    msrp: 1210,
    streetPrice: 850,
    laborHours: 2.5,
    specs: {
      channelCount: 8,
      storageCapacity: "4TB",
      portCount: 8,
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "8-channel recorder, 4TB, built-in PoE switch, AXIS Camera Station",
    tags: ["indoor", "nvr", "recorder", "8-channel", "4tb", "axis", "poe", "network"],
  },
  {
    id: "verkada-vx52",
    manufacturer: "Verkada",
    model: "VX52",
    name: "Cloud-Managed NVR",
    fullName: "Verkada VX52 NVR",
    category: "network",
    subcategory: "nvr",
    msrp: 3430,
    streetPrice: 2400,
    laborHours: 3.0,
    specs: {
      channelCount: 32,
      storageCapacity: "10TB",
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: false,
    },
    description: "Cloud-managed NVR, 32-channel, 10TB, Verkada Command",
    tags: ["indoor", "nvr", "recorder", "32-channel", "10tb", "verkada", "cloud", "network"],
  },
  {
    id: "hanwha-xrn-1620b",
    manufacturer: "Hanwha Vision",
    model: "XRN-1620B",
    name: "16-Channel NVR",
    fullName: "Hanwha XRN-1620B NVR",
    category: "network",
    subcategory: "nvr",
    msrp: 1570,
    streetPrice: 1100,
    laborHours: 2.5,
    specs: {
      channelCount: 16,
      storageCapacity: "8TB",
      portCount: 16,
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "16-channel NVR, 8TB, built-in PoE, Wisenet WAVE",
    tags: ["indoor", "nvr", "recorder", "16-channel", "8tb", "hanwha", "samsung", "poe", "network"],
  },
  {
    id: "hanwha-xrn-3210b2",
    manufacturer: "Hanwha Vision",
    model: "XRN-3210B2",
    name: "32-Channel NVR",
    fullName: "Hanwha XRN-3210B2 NVR",
    category: "network",
    subcategory: "nvr",
    msrp: 2570,
    streetPrice: 1800,
    laborHours: 3.0,
    specs: {
      channelCount: 32,
      storageCapacity: "16TB",
      portCount: 16,
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "32-channel NVR, 16TB, RAID, Wisenet WAVE",
    tags: ["indoor", "nvr", "recorder", "32-channel", "16tb", "hanwha", "samsung", "poe", "network", "raid"],
  },
  // ---------------------------------------------------------------------------
  // Hikvision — high-volume ColorVu lineup, integrator favorite
  // ---------------------------------------------------------------------------
  {
    id: "hikvision-ds-2cd2387g2-lu",
    manufacturer: "Hikvision",
    model: "DS-2CD2387G2-LU",
    name: "8MP ColorVu Turret",
    fullName: "Hikvision DS-2CD2387G2-LU ColorVu Turret",
    category: "camera",
    subcategory: "dome",
    msrp: 320,
    streetPrice: 195,
    laborHours: 1.5,
    specs: {
      resolution: "8MP",
      fovDegrees: 105,
      irRange: 30,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP ColorVu turret, 24/7 color in low light, 30m smart IR, built-in mic, PoE",
    tags: ["outdoor", "8mp", "4k", "turret", "dome", "colorvu", "hikvision", "ir", "poe", "audio"],
  },
  {
    id: "hikvision-ds-2cd2087g2-l",
    manufacturer: "Hikvision",
    model: "DS-2CD2087G2-L",
    name: "8MP ColorVu Bullet",
    fullName: "Hikvision DS-2CD2087G2-L ColorVu Bullet",
    category: "camera",
    subcategory: "bullet",
    msrp: 290,
    streetPrice: 175,
    laborHours: 1.75,
    specs: {
      resolution: "8MP",
      fovDegrees: 102,
      irRange: 40,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP ColorVu bullet, 40m white-light range, AcuSense intrusion/line-cross, PoE",
    tags: ["outdoor", "8mp", "4k", "bullet", "colorvu", "hikvision", "ir", "poe", "ai"],
  },
  {
    id: "hikvision-ds-2de4a425iw-de",
    manufacturer: "Hikvision",
    model: "DS-2DE4A425IW-DE",
    name: "4MP IR PTZ",
    fullName: "Hikvision DS-2DE4A425IW-DE IR PTZ",
    category: "camera",
    subcategory: "ptz",
    msrp: 1380,
    streetPrice: 950,
    laborHours: 3.0,
    specs: {
      resolution: "4MP",
      fovDegrees: 64,
      irRange: 100,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "4MP outdoor PTZ, 25× optical zoom, 100m IR, IP66, PoE+",
    tags: ["outdoor", "4mp", "ptz", "hikvision", "ir", "long-range", "zoom", "poe"],
  },
  // ---------------------------------------------------------------------------
  // Dahua — value-tier WizSense lineup
  // ---------------------------------------------------------------------------
  {
    id: "dahua-ipc-hdw5442tm-as",
    manufacturer: "Dahua",
    model: "IPC-HDW5442TM-AS",
    name: "4MP Starlight Eyeball",
    fullName: "Dahua IPC-HDW5442TM-AS Starlight Eyeball",
    category: "camera",
    subcategory: "dome",
    msrp: 380,
    streetPrice: 225,
    laborHours: 1.5,
    specs: {
      resolution: "4MP",
      fovDegrees: 96,
      irRange: 50,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "4MP Starlight eyeball, WizMind AI, 50m IR, IP67/IK10, PoE",
    tags: ["outdoor", "4mp", "dome", "eyeball", "starlight", "dahua", "ir", "poe", "ai", "vandal-resistant"],
  },
  {
    id: "dahua-ipc-hfw3441e-as",
    manufacturer: "Dahua",
    model: "IPC-HFW3441E-AS",
    name: "4MP WizSense Bullet",
    fullName: "Dahua IPC-HFW3441E-AS WizSense Bullet",
    category: "camera",
    subcategory: "bullet",
    msrp: 220,
    streetPrice: 130,
    laborHours: 1.5,
    specs: {
      resolution: "4MP",
      fovDegrees: 95,
      irRange: 50,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "4MP WizSense bullet, SMD Plus people/vehicle detection, 50m IR, IP67, PoE",
    tags: ["outdoor", "4mp", "bullet", "wizsense", "dahua", "ir", "long-range", "poe", "ai"],
  },
  // ---------------------------------------------------------------------------
  // Reolink — DIY / small-business price point
  // ---------------------------------------------------------------------------
  {
    id: "reolink-rlc-820a",
    manufacturer: "Reolink",
    model: "RLC-820A",
    name: "4K PoE Dome",
    fullName: "Reolink RLC-820A 4K PoE Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 150,
    streetPrice: 110,
    laborHours: 1.25,
    specs: {
      resolution: "4K",
      fovDegrees: 87,
      irRange: 30,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP/4K PoE dome, person/vehicle detection, 30m IR, IP66",
    tags: ["outdoor", "8mp", "4k", "dome", "reolink", "ir", "poe", "ai", "budget"],
  },
  {
    id: "reolink-duo-2-poe",
    manufacturer: "Reolink",
    model: "Duo 2 PoE",
    name: "Dual-Lens 8MP PoE",
    fullName: "Reolink Duo 2 PoE Dual-Lens 8MP",
    category: "camera",
    subcategory: "multi-sensor",
    msrp: 250,
    streetPrice: 190,
    laborHours: 1.75,
    specs: {
      resolution: "8MP",
      fovDegrees: 180,
      irRange: 30,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "Dual-lens 8MP camera, stitched 180° panoramic, 30m IR, PoE",
    tags: ["outdoor", "8mp", "multi-sensor", "panoramic", "180", "reolink", "ir", "poe"],
  },
  // ---------------------------------------------------------------------------
  // Uniview — competitive enterprise dome
  // ---------------------------------------------------------------------------
  {
    id: "uniview-ipc3618sr3-dpf28m-f",
    manufacturer: "Uniview",
    model: "IPC3618SR3-DPF28M-F",
    name: "8MP IR Dome",
    fullName: "Uniview IPC3618SR3-DPF28M-F 8MP IR Dome",
    category: "camera",
    subcategory: "dome",
    msrp: 240,
    streetPrice: 145,
    laborHours: 1.5,
    specs: {
      resolution: "8MP",
      fovDegrees: 108,
      irRange: 30,
      mounting: "ceiling",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "8MP/4K IR dome, 108° FOV, 30m IR, IP67, IK10, PoE",
    tags: ["outdoor", "8mp", "4k", "dome", "uniview", "ir", "poe", "vandal-resistant", "wide-angle"],
  },
  // ---------------------------------------------------------------------------
  // Avigilon Alta — cloud-managed reader pulled from H4A motion + PTZ
  // ---------------------------------------------------------------------------
  {
    id: "avigilon-h6x-ptz",
    manufacturer: "Avigilon",
    model: "H6X-PTZ-DC-30",
    name: "H6X 4K PTZ",
    fullName: "Avigilon H6X 4K PTZ Dome",
    category: "camera",
    subcategory: "ptz",
    msrp: 4500,
    streetPrice: 2850,
    laborHours: 3.5,
    specs: {
      resolution: "4K",
      fovDegrees: 60,
      irRange: 250,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: true,
    },
    description: "4K outdoor PTZ, 30× optical zoom, self-learning analytics, IR up to 250m",
    tags: ["outdoor", "4k", "8mp", "ptz", "avigilon", "ir", "long-range", "zoom", "ai", "analytics"],
  },
  // ---------------------------------------------------------------------------
  // Access — HID Signo 20, STid encrypted reader, Schlage smart lock
  // ---------------------------------------------------------------------------
  {
    id: "hid-signo-20",
    manufacturer: "HID Global",
    model: "Signo 20",
    name: "Signo 20 Reader",
    fullName: "HID Signo 20 Multi-Class Reader",
    category: "reader",
    subcategory: "card",
    msrp: 365,
    streetPrice: 240,
    laborHours: 1.5,
    specs: {
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: false,
    },
    description: "Multi-tech card reader, Apple Wallet + mobile credentials, IP65",
    tags: ["outdoor", "card", "reader", "multi-class", "hid", "signo", "mobile-credential", "wallet"],
  },
  {
    id: "stid-architect-blue",
    manufacturer: "STid",
    model: "Architect Blue",
    name: "Architect Blue Reader",
    fullName: "STid Architect Blue BLE/NFC Reader",
    category: "reader",
    subcategory: "card",
    msrp: 580,
    streetPrice: 415,
    laborHours: 1.75,
    specs: {
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: false,
    },
    description: "AES/SCP-encrypted reader, BLE + NFC + MIFARE DESFire, customizable LED",
    tags: ["outdoor", "card", "reader", "ble", "nfc", "stid", "encrypted", "mobile-credential"],
  },
  {
    id: "schlage-engage-le",
    manufacturer: "Schlage",
    model: "LE Wireless Lock",
    name: "LE Mortise Lock",
    fullName: "Schlage LE Wireless Mortise Lock",
    category: "reader",
    subcategory: "lock",
    msrp: 1200,
    streetPrice: 820,
    laborHours: 2.5,
    specs: {
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: false,
    },
    description: "Wireless mortise lock, multi-class reader, ENGAGE cloud or wired-online",
    tags: ["indoor", "lock", "mortise", "schlage", "wireless", "engage", "battery"],
  },
  // ---------------------------------------------------------------------------
  // Sensors — Optex outdoor beam + Bosch microwave outdoor PIR
  // ---------------------------------------------------------------------------
  {
    id: "optex-ax-130tfr",
    manufacturer: "Optex",
    model: "AX-130TFR",
    name: "Photoelectric Beam",
    fullName: "Optex AX-130TFR Outdoor Photoelectric Beam",
    category: "sensor",
    subcategory: "motion",
    msrp: 410,
    streetPrice: 275,
    laborHours: 1.75,
    specs: {
      rangeMeters: 40,
      fovDegrees: 5,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: false,
    },
    description: "40m outdoor dual photoelectric beam, anti-mask, fence-line perimeter",
    tags: ["outdoor", "sensor", "beam", "perimeter", "optex", "fence-line"],
  },
  {
    id: "bosch-tritech-zx835",
    manufacturer: "Bosch",
    model: "ZX835",
    name: "Tritech Outdoor Sensor",
    fullName: "Bosch ZX835 TriTech Outdoor PIR/Microwave",
    category: "sensor",
    subcategory: "motion",
    msrp: 195,
    streetPrice: 115,
    laborHours: 1.25,
    specs: {
      rangeMeters: 25,
      fovDegrees: 110,
      mounting: "wall",
      indoor: false,
      outdoor: true,
      poe: false,
    },
    description: "Outdoor TriTech PIR + microwave, pet/animal immune, 25m × 25m coverage",
    tags: ["outdoor", "sensor", "motion", "pir", "microwave", "bosch", "tritech", "pet-immune"],
  },
  // ---------------------------------------------------------------------------
  // Network — Ubiquiti gateway + NETGEAR enterprise PoE switch
  // ---------------------------------------------------------------------------
  {
    id: "ubiquiti-udm-pro-max",
    manufacturer: "Ubiquiti",
    model: "UDM-Pro-Max",
    name: "UDM Pro Max Gateway",
    fullName: "Ubiquiti UniFi Dream Machine Pro Max",
    category: "network",
    subcategory: "switch",
    msrp: 599,
    streetPrice: 479,
    laborHours: 2.0,
    specs: {
      portCount: 8,
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: false,
    },
    description: "8-port enterprise gateway, dual 10G SFP+, UniFi Network/Protect/Access",
    tags: ["indoor", "gateway", "router", "ubiquiti", "unifi", "10g", "rack", "network"],
  },
  {
    id: "netgear-m4250-26g4xf",
    manufacturer: "NETGEAR",
    model: "M4250-26G4XF-PoE+",
    name: "26-Port AV PoE+ Switch",
    fullName: "NETGEAR M4250-26G4XF AV-Line PoE+ Switch",
    category: "network",
    subcategory: "switch",
    msrp: 1980,
    streetPrice: 1395,
    laborHours: 2.5,
    specs: {
      portCount: 26,
      mounting: "surface",
      indoor: true,
      outdoor: false,
      poe: true,
    },
    description: "26-port managed PoE+ switch (24× GbE + 4× 10G SFP+), 480W PoE budget",
    tags: ["indoor", "switch", "managed", "poe", "poe-plus", "netgear", "m4250", "10g", "rack", "av"],
  },

  // =======================================================================
  // CAMERAS — Pelco / Mobotix / additional Bosch + Hikvision PTZ
  // =======================================================================
  {
    id: "pelco-sarix-ibe332",
    manufacturer: "Pelco",
    model: "IBE332-1ER",
    name: "Sarix Enhanced Bullet",
    fullName: "Pelco Sarix Enhanced IBE332-1ER",
    category: "camera",
    subcategory: "bullet",
    msrp: 1400,
    streetPrice: 950,
    laborHours: 1.75,
    specs: {
      resolution: "3MP",
      fovDegrees: 95,
      rangeMeters: 25,
      irRange: 30,
      mounting: "wall",
      outdoor: true,
      poe: true,
    },
    description: "Outdoor 3MP IR bullet, IK10 vandal, smart-compression",
    tags: ["outdoor", "bullet", "3mp", "ir", "pelco", "sarix", "ik10", "poe"],
  },
  {
    id: "mobotix-m73",
    manufacturer: "Mobotix",
    model: "M73",
    name: "M73 Modular",
    fullName: "Mobotix M73 Modular Camera",
    category: "camera",
    subcategory: "modular",
    msrp: 3100,
    streetPrice: 2300,
    laborHours: 2.5,
    specs: {
      resolution: "6MP",
      fovDegrees: 90,
      rangeMeters: 30,
      irRange: 40,
      mounting: "wall",
      indoor: true,
      outdoor: true,
      poe: true,
    },
    description: "Modular 3-lens IP66 camera with edge AI, decentralized recording",
    tags: ["outdoor", "indoor", "6mp", "modular", "mobotix", "ip66", "edge-ai", "poe"],
  },
  {
    id: "hikvision-ds-2de7a432iw",
    manufacturer: "Hikvision",
    model: "DS-2DE7A432IW-AEB(T5)",
    name: "Ultra-Series PTZ",
    fullName: "Hikvision DS-2DE7A432IW Ultra PTZ",
    category: "camera",
    subcategory: "ptz",
    msrp: 2200,
    streetPrice: 1400,
    laborHours: 2.5,
    specs: {
      resolution: "4MP",
      fovDegrees: 60,
      rangeMeters: 50,
      irRange: 150,
      zoomFactor: 32,
      mounting: "pendant",
      outdoor: true,
      poe: true,
    },
    description: "4MP 32× zoom PTZ with 150m IR, auto-tracking, IP67",
    tags: ["outdoor", "ptz", "4mp", "32x", "ir", "hikvision", "ip67", "auto-tracking"],
  },
  {
    id: "bosch-flexidome-9000i",
    manufacturer: "Bosch",
    model: "NDE-9502-A",
    name: "FLEXIDOME IP 9000i",
    fullName: "Bosch FLEXIDOME IP 9000i NDE-9502-A",
    category: "camera",
    subcategory: "dome",
    msrp: 2700,
    streetPrice: 1900,
    laborHours: 2,
    specs: {
      resolution: "12MP",
      fovDegrees: 100,
      rangeMeters: 25,
      mounting: "ceiling",
      indoor: true,
      outdoor: true,
      poe: true,
    },
    description: "12MP outdoor dome with Intelligent Video Analytics, starlight X",
    tags: ["outdoor", "12mp", "dome", "iva", "starlight", "bosch", "poe", "analytics"],
  },

  // =======================================================================
  // ACCESS — Controllers + smart locks (Mercury / Allegion / Schlage)
  // =======================================================================
  {
    id: "mercury-lp4502",
    manufacturer: "HID",
    model: "LP4502",
    name: "Mercury LP4502 Controller",
    fullName: "HID Mercury LP4502 Intelligent Controller",
    category: "reader",
    subcategory: "controller",
    msrp: 1900,
    streetPrice: 1350,
    laborHours: 3,
    specs: {
      mounting: "surface",
      indoor: true,
      poe: false,
    },
    description: "2-door intelligent controller, OSDP, scalable to 64 doors via downstream",
    tags: ["controller", "mercury", "lp4502", "osdp", "hid", "2-door"],
  },
  {
    id: "schlage-ad-401",
    manufacturer: "Schlage",
    model: "AD-401",
    name: "AD-Series Networked Wireless Lock",
    fullName: "Schlage AD-401 Wireless Lock",
    category: "reader",
    subcategory: "lock",
    msrp: 2200,
    streetPrice: 1550,
    laborHours: 2,
    specs: {
      mounting: "surface",
      indoor: true,
      wireless: true,
    },
    description: "PoE-or-battery wireless lock with integrated reader, 900MHz mesh",
    tags: ["lock", "schlage", "ad-401", "wireless", "battery", "mesh", "integrated-reader"],
  },
  {
    id: "axis-a1601",
    manufacturer: "Axis",
    model: "A1601",
    name: "A1601 Network Door Controller",
    fullName: "Axis A1601 Network Door Controller",
    category: "reader",
    subcategory: "controller",
    msrp: 1400,
    streetPrice: 950,
    laborHours: 2.5,
    specs: {
      mounting: "surface",
      indoor: true,
      poe: true,
    },
    description: "Single-door IP controller, OSDP+Wiegand, integrates with Axis Camera Station",
    tags: ["controller", "axis", "a1601", "ip", "osdp", "poe", "edge"],
  },
  {
    id: "avigilon-alta-controller",
    manufacturer: "Avigilon",
    model: "ACM-COMHUB",
    name: "Alta ACM Communication Hub",
    fullName: "Avigilon Alta ACM Communication Hub",
    category: "reader",
    subcategory: "controller",
    msrp: 2100,
    streetPrice: 1500,
    laborHours: 2.5,
    specs: {
      mounting: "surface",
      indoor: true,
      poe: true,
    },
    description: "Cloud-managed door controller for Alta Access, supports 8 doors per hub",
    tags: ["controller", "avigilon", "alta", "cloud", "openpath", "poe"],
  },

  // =======================================================================
  // NETWORK — Enterprise VMS represented as NVR + access-point upgrades
  // =======================================================================
  {
    id: "milestone-xprotect-husky",
    manufacturer: "Milestone",
    model: "Husky IVO 700R",
    name: "XProtect Husky IVO 700R",
    fullName: "Milestone Husky IVO 700R Recorder",
    category: "network",
    subcategory: "nvr",
    msrp: 4900,
    streetPrice: 3800,
    laborHours: 4,
    specs: {
      mounting: "surface",
      portCount: 64,
      storageCapacity: "12TB",
      channelCount: 64,
      indoor: true,
    },
    description: "Pre-configured XProtect appliance, 64 channels, 12TB raw, ONVIF-everything",
    tags: ["nvr", "xprotect", "milestone", "husky", "vms", "onvif", "64ch", "12tb"],
  },
  {
    id: "genetec-streamvault-2200",
    manufacturer: "Genetec",
    model: "SV-2200E",
    name: "Streamvault 2200",
    fullName: "Genetec Streamvault SV-2200E Appliance",
    category: "network",
    subcategory: "nvr",
    msrp: 5600,
    streetPrice: 4400,
    laborHours: 4,
    specs: {
      mounting: "surface",
      portCount: 32,
      storageCapacity: "16TB",
      channelCount: 32,
      indoor: true,
    },
    description: "Genetec Security Center appliance, 32 channels, hardened OS, hybrid cloud",
    tags: ["nvr", "genetec", "streamvault", "security-center", "32ch", "16tb", "hardened"],
  },
];

/**
 * Get a product's ecosystem — either the explicit value on the entry,
 * or the per-vendor default. Exported so callers (chat agent, BoM
 * generators) can fetch it on demand without us pre-augmenting the
 * raw catalog (which caused a Turbopack bundling order issue).
 */
export function productEcosystem(p: CatalogProduct): ProductEcosystem {
  return p.ecosystem ?? defaultEcosystem(p.manufacturer);
}

/** Get a product's compatibility tags — explicit or per-vendor default. */
export function productCompatibility(p: CatalogProduct): string[] {
  return p.compatibility ?? defaultCompatibility(p.manufacturer);
}

// ---------------------------------------------------------------------------
// Default product per subtype — used to map the legacy generic subtypes to a
// sensible real product when no explicit selection has been made.
// ---------------------------------------------------------------------------

export const DEFAULT_PRODUCT_FOR_SUBTYPE: Record<string, string> = {
  dome: "verkada-cd52",
  bullet: "verkada-cb52",
  ptz: "axis-q6135-le",
  fixed: "verkada-cb52",
  fisheye: "verkada-cf82",
  "multi-sensor": "hanwha-pnm-9085rqz",
  mini: "verkada-cm42",
  modular: "axis-fa54",
  card: "hid-signo-40",
  biometric: "suprema-bioentry-w2",
  keypad: "hid-rk40",
  controller: "mercury-lp4502",
  lock: "assa-abloy-aperio-h100",
  "electric-strike": "hes-1006",
  "mag-lock": "securitron-m62",
  "rex-button": "bosch-ds150i",
  "exit-device": "detex-v40",
  intercom: "aiphone-ix-dv",
  "power-supply": "altronix-al400ulpd8",
  turnstile: "boon-edam-speedlane-swing",
  bollard: "calpipe-fixed-bollard",
  "gate-operator": "liftmaster-la500",
  lpr: "axis-p1455-le-3",
  motion: "bosch-bdl2-wp12g",
  "glass-break": "honeywell-fg1625",
  "door-contact": "honeywell-5816",
  smoke: "system-sensor-2wtr-b",
  heat: "system-sensor-p2rh",
  notification: "system-sensor-spsr",
  "pull-station": "notifier-nbg-12lx",
  facp: "notifier-nfs2-3030",
  "exit-sign": "lithonia-lhqm",
  aed: "zoll-aed-plus",
  "back-box": "raco-690",
  "mount-bracket": "axis-t91a64",
  conduit: "emt-075-10ft",
  raceway: "wiremold-v500-5ft",
  "access-point": "ubiquiti-u6-enterprise",
  switch: "ubiquiti-usw-pro-24-poe",
  nvr: "axis-s3008",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lazy index built on first call, then cached. */
let _byId: Map<string, CatalogProduct> | null = null;

function ensureIndex(): Map<string, CatalogProduct> {
  if (!_byId) {
    _byId = new Map(PRODUCT_CATALOG.map((p) => [p.id, p]));
  }
  return _byId;
}

/** Look up a single product by its unique id. */
export function getProduct(id: string): CatalogProduct | undefined {
  return ensureIndex().get(id);
}

/** Return all products in a given top-level category. */
export function getProductsByCategory(
  category: CatalogProduct["category"],
): CatalogProduct[] {
  return PRODUCT_CATALOG.filter((p) => p.category === category);
}

/** Return all products that match a given subcategory. */
export function getProductsBySubcategory(
  subcategory: CatalogProduct["subcategory"],
): CatalogProduct[] {
  return PRODUCT_CATALOG.filter((p) => p.subcategory === subcategory);
}

/**
 * Free-text search across name, model, manufacturer, description, and tags.
 * Case-insensitive.  Returns products sorted by relevance (number of matching
 * terms).
 */
export function searchProducts(query: string): CatalogProduct[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (terms.length === 0) return [];

  const scored = PRODUCT_CATALOG.map((p) => {
    const haystack = [
      p.name,
      p.model,
      p.manufacturer,
      p.fullName,
      p.description,
      p.subcategory,
      ...p.tags,
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += 1;
    }
    return { product: p, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.product);
}
