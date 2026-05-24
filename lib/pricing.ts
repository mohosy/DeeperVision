import type {
  Device,
  Floor,
} from "@/types/design";
import { getProduct } from "./catalog";

export interface ModelEntry {
  id: string;
  displayName: string;
  vendor: string;
  unitPrice: number;
  laborHours: number;
}

const FALLBACK_MODELS: Record<string, ModelEntry> = {
  dome:           { id: "dome-generic",    displayName: "Dome Camera",           vendor: "Generic", unitPrice: 280,  laborHours: 1.5  },
  bullet:         { id: "bullet-generic",  displayName: "Bullet Camera",         vendor: "Generic", unitPrice: 320,  laborHours: 1.75 },
  ptz:            { id: "ptz-generic",     displayName: "PTZ Camera",            vendor: "Generic", unitPrice: 1480, laborHours: 2.5  },
  fixed:          { id: "fixed-generic",   displayName: "Fixed Camera",          vendor: "Generic", unitPrice: 320,  laborHours: 1.75 },
  fisheye:        { id: "fisheye-generic", displayName: "Fisheye Camera",        vendor: "Generic", unitPrice: 640,  laborHours: 1.5  },
  "multi-sensor": { id: "multi-generic",   displayName: "Multi-Sensor Camera",   vendor: "Generic", unitPrice: 1800, laborHours: 3.0  },
  mini:           { id: "mini-generic",    displayName: "Mini Camera",           vendor: "Generic", unitPrice: 350,  laborHours: 1.0  },
  modular:        { id: "modular-generic", displayName: "Modular Camera",        vendor: "Generic", unitPrice: 280,  laborHours: 1.0  },
  lpr:            { id: "lpr-generic",     displayName: "LPR Camera",            vendor: "Generic", unitPrice: 1100, laborHours: 2.5  },
  card:           { id: "card-generic",    displayName: "Card Reader",           vendor: "Generic", unitPrice: 170,  laborHours: 1.25 },
  biometric:      { id: "bio-generic",     displayName: "Biometric Reader",      vendor: "Generic", unitPrice: 520,  laborHours: 1.75 },
  keypad:         { id: "keypad-generic",  displayName: "Keypad Reader",         vendor: "Generic", unitPrice: 120,  laborHours: 1.25 },
  controller:     { id: "ctrl-generic",    displayName: "Door Controller",       vendor: "Generic", unitPrice: 680,  laborHours: 2.0  },
  lock:           { id: "lock-generic",    displayName: "Electronic Lock",       vendor: "Generic", unitPrice: 380,  laborHours: 1.5  },
  "electric-strike": { id: "strike-generic", displayName: "Electric Strike",     vendor: "Generic", unitPrice: 280,  laborHours: 1.5  },
  "mag-lock":     { id: "mag-generic",     displayName: "Magnetic Lock",         vendor: "Generic", unitPrice: 320,  laborHours: 2.0  },
  "rex-button":   { id: "rex-generic",     displayName: "Request-to-Exit",       vendor: "Generic", unitPrice: 55,   laborHours: 0.5  },
  "exit-device":  { id: "exit-generic",    displayName: "Exit Device (Crash Bar)", vendor: "Generic", unitPrice: 520, laborHours: 2.5 },
  intercom:       { id: "intercom-generic", displayName: "Video Intercom",       vendor: "Generic", unitPrice: 780,  laborHours: 2.0  },
  "power-supply": { id: "psu-generic",     displayName: "Access Power Supply",   vendor: "Generic", unitPrice: 240,  laborHours: 1.25 },
  turnstile:      { id: "turn-generic",    displayName: "Turnstile",             vendor: "Generic", unitPrice: 14000, laborHours: 18  },
  bollard:        { id: "bollard-generic", displayName: "Security Bollard",      vendor: "Generic", unitPrice: 1800, laborHours: 8   },
  "gate-operator": { id: "gate-generic",   displayName: "Gate Operator",         vendor: "Generic", unitPrice: 1300, laborHours: 12  },
  motion:         { id: "motion-generic",  displayName: "Motion Sensor",         vendor: "Generic", unitPrice: 45,   laborHours: 0.75 },
  "glass-break":  { id: "glass-generic",   displayName: "Glass-Break Sensor",    vendor: "Generic", unitPrice: 60,   laborHours: 0.5  },
  "door-contact": { id: "contact-generic", displayName: "Door Contact",          vendor: "Generic", unitPrice: 25,   laborHours: 0.25 },
  smoke:          { id: "smoke-generic",   displayName: "Smoke Detector",        vendor: "Generic", unitPrice: 35,   laborHours: 0.75 },
  heat:           { id: "heat-generic",    displayName: "Heat Detector",         vendor: "Generic", unitPrice: 30,   laborHours: 0.75 },
  notification:   { id: "notif-generic",   displayName: "Notification Appliance", vendor: "Generic", unitPrice: 85,   laborHours: 0.75 },
  "pull-station": { id: "pull-generic",    displayName: "Fire Pull Station",     vendor: "Generic", unitPrice: 90,   laborHours: 0.75 },
  facp:           { id: "facp-generic",    displayName: "Fire Alarm Control Panel", vendor: "Generic", unitPrice: 2500, laborHours: 18.0 },
  "exit-sign":    { id: "exit-sign-generic", displayName: "Exit Sign",           vendor: "Generic", unitPrice: 85,   laborHours: 1.0  },
  aed:            { id: "aed-generic",     displayName: "AED + Wall Cabinet",    vendor: "Generic", unitPrice: 1600, laborHours: 1.0  },
  "back-box":     { id: "box-generic",     displayName: "Back Box",              vendor: "Generic", unitPrice: 8,    laborHours: 0.4  },
  "mount-bracket": { id: "mount-generic",  displayName: "Mounting Bracket",      vendor: "Generic", unitPrice: 90,   laborHours: 0.75 },
  conduit:        { id: "conduit-generic", displayName: "Conduit (per stick)",   vendor: "Generic", unitPrice: 14,   laborHours: 0.5  },
  raceway:        { id: "raceway-generic", displayName: "Surface Raceway",       vendor: "Generic", unitPrice: 12,   laborHours: 0.45 },
  "access-point": { id: "ap-generic",      displayName: "Wi-Fi Access Point",    vendor: "Generic", unitPrice: 350,  laborHours: 1.0  },
  switch:         { id: "switch-generic",  displayName: "PoE Switch",            vendor: "Generic", unitPrice: 700,  laborHours: 2.0  },
  nvr:            { id: "nvr-generic",     displayName: "NVR",                   vendor: "Generic", unitPrice: 850,  laborHours: 3.0  },
};

function subtypeOf(device: Device): string {
  switch (device.type) {
    case "camera":  return device.cameraType;
    case "reader":  return device.readerType;
    case "sensor":  return device.sensorType;
    case "network": return device.networkType;
  }
}

export function modelFor(device: Device): ModelEntry {
  if (device.catalogId) {
    const product = getProduct(device.catalogId);
    if (product) {
      return {
        id: product.id,
        displayName: product.fullName,
        vendor: product.manufacturer,
        unitPrice: product.streetPrice,
        laborHours: product.laborHours,
      };
    }
  }
  return FALLBACK_MODELS[subtypeOf(device)] ?? FALLBACK_MODELS.dome;
}

export interface ExtraLineItem {
  description: string;
  quantity: number;
  unitCost: number;
  category: "labor" | "materials" | "permits" | "logistics" | "other";
}

export interface QuoteSettings {
  laborRate: number;
  cablingPerCamera: number;
  cablingPerReader: number;
  commissioningFee: number;
  markupPct: number;
  taxPct: number;
  preparedBy: string;
  clientName: string;
  /** Project location used by the AI Quote Assistant. Display + cost driver. */
  projectLocation: string;
  /** Company logo as a data URL — shown on the printed quote and PDF reports. */
  companyLogoDataUrl: string;
  /** Optional brand-accent color (hex) used for borders/headings in the print view. */
  brandColor: string;
  /** Footer line shown on printed pages (terms, license #, contact). */
  printFooter: string;
  /** Auto-routed cabling plan summary. When set + non-zero, used in place of
      the flat per-device cabling estimate. */
  autoCabling?: { totalLengthM: number; cameraRuns: number; readerRuns: number };
  /** Set when the AI Quote Assistant has overridden the rates above. */
  aiAdjusted: boolean;
  /** Short regional pricing note from the AI. Shown above the BoM. */
  regionalNotes: string;
  /** Benchmark sentence comparing this quote to local market median. */
  benchmark: string;
  /** Client-facing narrative paragraph injected into the printed quote. */
  narrative: string;
  /** Extra line items added by the AI (permits, lift rental, premiums, etc.) */
  extraLineItems: ExtraLineItem[];
}

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  laborRate: 95, // USD per hour
  cablingPerCamera: 240, // cable + connectors + terminations per camera run
  cablingPerReader: 150, // less than camera since reader is lower voltage
  commissioningFee: 850, // fixed system programming / testing
  markupPct: 0,
  taxPct: 8.5,
  preparedBy: "",
  clientName: "",
  projectLocation: "",
  companyLogoDataUrl: "",
  brandColor: "",
  printFooter: "",
  aiAdjusted: false,
  regionalNotes: "",
  benchmark: "",
  narrative: "",
  extraLineItems: [],
};

export interface BoMRow {
  modelId: string;
  displayName: string;
  vendor: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  /** Total install hours for this line (qty × laborHours) */
  laborHours: number;
}

export interface QuoteBreakdown {
  rows: BoMRow[];
  hardwareSubtotal: number;
  laborHoursTotal: number;
  laborSubtotal: number;
  cablingSubtotal: number;
  commissioningFee: number;
  /** Sum of AI-added line items, broken out so the UI can render them */
  extraLineItemsSubtotal: number;
  preTaxSubtotal: number;
  markupAmount: number;
  taxAmount: number;
  grandTotal: number;
}

/**
 * Compute a full quote breakdown for the active floor. Walks the device list,
 * groups by model id, multiplies, then layers in labor + cabling +
 * commissioning + markup + tax.
 */
export function computeQuote(
  floor: Floor,
  settings: QuoteSettings = DEFAULT_QUOTE_SETTINGS
): QuoteBreakdown {
  const byModel = new Map<string, BoMRow>();

  for (const device of floor.devices) {
    const model = modelFor(device);
    const row = byModel.get(model.id);
    if (row) {
      row.quantity += 1;
      row.subtotal = round2(row.unitPrice * row.quantity);
      row.laborHours = round2(model.laborHours * row.quantity);
    } else {
      byModel.set(model.id, {
        modelId: model.id,
        displayName: model.displayName,
        vendor: model.vendor,
        unitPrice: model.unitPrice,
        quantity: 1,
        subtotal: model.unitPrice,
        laborHours: model.laborHours,
      });
    }
  }

  const rows = Array.from(byModel.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  const hardwareSubtotal = round2(
    rows.reduce((sum, r) => sum + r.subtotal, 0)
  );
  const laborHoursTotal = round2(
    rows.reduce((sum, r) => sum + r.laborHours, 0)
  );
  const laborSubtotal = round2(laborHoursTotal * settings.laborRate);

  // Cabling: prefer the auto-routed cable plan (real lengths × per-meter cost)
  // when one is provided; otherwise fall back to the legacy flat per-device rates.
  // Per-meter rate is derived from the existing `cablingPerCamera` setting
  // assuming an average 12 m drop — keeps the user's pricing knob meaningful.
  const cameraCount = floor.devices.filter((d) => d.type === "camera").length;
  const readerCount = floor.devices.filter((d) => d.type === "reader").length;
  let cablingSubtotal: number;
  if (settings.autoCabling?.totalLengthM && settings.autoCabling.totalLengthM > 0) {
    const ratePerMeter = settings.cablingPerCamera / 12; // implied per-m rate
    cablingSubtotal = round2(
      settings.autoCabling.totalLengthM * ratePerMeter,
    );
  } else {
    cablingSubtotal = round2(
      cameraCount * settings.cablingPerCamera +
        readerCount * settings.cablingPerReader,
    );
  }

  const extraLineItemsSubtotal = round2(
    (settings.extraLineItems ?? []).reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    ),
  );

  const baseSubtotal = round2(
    hardwareSubtotal +
      laborSubtotal +
      cablingSubtotal +
      settings.commissioningFee +
      extraLineItemsSubtotal,
  );
  const markupAmount = round2((baseSubtotal * settings.markupPct) / 100);
  const preTaxSubtotal = round2(baseSubtotal + markupAmount);
  const taxAmount = round2((preTaxSubtotal * settings.taxPct) / 100);
  const grandTotal = round2(preTaxSubtotal + taxAmount);

  return {
    rows,
    hardwareSubtotal,
    laborHoursTotal,
    laborSubtotal,
    cablingSubtotal,
    commissioningFee: settings.commissioningFee,
    extraLineItemsSubtotal,
    preTaxSubtotal,
    markupAmount,
    taxAmount,
    grandTotal,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}
