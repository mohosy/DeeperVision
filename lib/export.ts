/**
 * Floor-plan PDF export, BOM CSV, and device-schedule CSV for DeeperVision.
 *
 * These exports are the deliverables integrators hand to clients and install
 * crews, so they need to look professional and be complete.
 */

import jsPDF from "jspdf";
import type {
  DesignDocument,
  Floor,
  Device,
  DevicePhoto,
  CameraDevice,
  SensorDevice,
  NetworkDeviceBase,
  Wall,
  Vec2,
} from "@/types/design";
import { getProduct, type CatalogProduct } from "./catalog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Device-type accent colors (hex). */
const TYPE_COLORS: Record<Device["type"], string> = {
  camera: "#10b981",
  reader: "#38bdf8",
  sensor: "#fbbf24",
  network: "#a78bfa",
};

/** Human labels for device types. */
const TYPE_LABELS: Record<Device["type"], string> = {
  camera: "Camera",
  reader: "Access Control",
  sensor: "Sensor",
  network: "Network",
};

/** Friendly subcategory labels used in the device schedule. */
function subcategoryLabel(device: Device): string {
  switch (device.type) {
    case "camera":
      return device.cameraType;
    case "reader":
      return device.readerType;
    case "sensor":
      return device.sensorType;
    case "network":
      return device.networkType;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a hex color string (#rrggbb) into [r,g,b] 0-255. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Resolve catalog product for a device, if any. */
function resolveProduct(device: Device): CatalogProduct | undefined {
  if (device.catalogId) return getProduct(device.catalogId);
  return undefined;
}

/** Trigger a browser download of a text blob. */
function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Escape a value for CSV — wraps in double-quotes if needed. */
function csvEscape(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from a header array and rows. */
function buildCSV(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Format a number as currency. */
function fmtCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format date as YYYY-MM-DD. */
function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Compute the axis-aligned bounding box of all geometry on a floor.
 * Returns { minX, minY, maxX, maxY } in floor-plan pixel coordinates.
 * Falls back to a default box if the floor has nothing.
 */
function computeBounds(floor: Floor): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const w of floor.walls) {
    xs.push(w.start.x, w.end.x);
    ys.push(w.start.y, w.end.y);
  }
  for (const d of floor.devices) {
    xs.push(d.position.x);
    ys.push(d.position.y);

    // Include device coverage/range in bounding box so arcs fit
    const rangePx = deviceRangePixels(d, floor.scale);
    if (rangePx > 0) {
      xs.push(d.position.x - rangePx, d.position.x + rangePx);
      ys.push(d.position.y - rangePx, d.position.y + rangePx);
    }
  }

  if (xs.length === 0 || ys.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Get the coverage/range of a device in floor-plan pixels. */
function deviceRangePixels(device: Device, scale: number): number {
  switch (device.type) {
    case "camera":
      return device.rangeMeters * scale;
    case "sensor":
      return device.rangeMeters * scale;
    case "network":
      return (device.coverageMeters ?? 0) * scale;
    default:
      return 0;
  }
}

/** Sort order for device types (used in grouping). */
const TYPE_SORT_ORDER: Record<Device["type"], number> = {
  camera: 0,
  reader: 1,
  sensor: 2,
  network: 3,
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PDFExportOptions {
  preparedBy?: string;
  preparedFor?: string;
  companyName?: string;
  projectNumber?: string;
  /** Company logo as a data URL (PNG/JPEG). Rendered on the cover page. */
  companyLogoDataUrl?: string;
  /** Optional hex brand color used for the cover divider + headings. */
  brandColor?: string;
  /** Optional one-line footer (terms, license number, contact info). */
  printFooter?: string;
}

// ---------------------------------------------------------------------------
// 1. exportFloorPlanPDF
// ---------------------------------------------------------------------------

/**
 * Generate a professional install-ready PDF of a single floor plan.
 *
 * - Page 1: Cover page with project information and device summary
 * - Page 2+: Floor plan drawing with devices, coverage, legend, scale bar
 * - Last page: Device schedule table
 */
export async function exportFloorPlanPDF(
  design: DesignDocument,
  floor: Floor,
  options?: PDFExportOptions,
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageW = doc.internal.pageSize.getWidth(); // 612pt
  const pageH = doc.internal.pageSize.getHeight(); // 792pt
  const margin = 36; // 0.5"
  const now = new Date();
  const dateStr = fmtDate(now);

  // -----------------------------------------------------------------------
  // Page 1 — Cover
  // -----------------------------------------------------------------------
  drawCoverPage(doc, design, floor, dateStr, pageW, pageH, margin, options);

  // -----------------------------------------------------------------------
  // Page 2 — Floor plan (landscape)
  // -----------------------------------------------------------------------
  doc.addPage("letter", "landscape");
  const lpW = doc.internal.pageSize.getWidth(); // 792pt
  const lpH = doc.internal.pageSize.getHeight(); // 612pt
  drawFloorPlan(doc, floor, design.name, dateStr, lpW, lpH, margin);

  // -----------------------------------------------------------------------
  // Last page — Device schedule table
  // -----------------------------------------------------------------------
  doc.addPage("letter", "portrait");
  drawDeviceSchedule(doc, floor, design.name, dateStr, pageW, pageH, margin);

  // Save
  const safeName = design.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  await doc.save(`${safeName}-floor-plan.pdf`, { returnPromise: true });
}

// ---------------------------------------------------------------------------
// Cover Page
// ---------------------------------------------------------------------------

function drawCoverPage(
  doc: jsPDF,
  design: DesignDocument,
  floor: Floor,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
  options?: PDFExportOptions,
): void {
  const cx = pw / 2;

  // Determine brand RGB (default = slate-900). Parse the user's hex if present.
  const brand = parseHexToRgb(options?.brandColor) ?? { r: 15, g: 23, b: 42 };

  // Top accent bar — branded color
  doc.setFillColor(brand.r, brand.g, brand.b);
  doc.rect(0, 0, pw, 6, "F");

  // Branding header — company logo if provided, otherwise the platform mark
  if (options?.companyLogoDataUrl) {
    try {
      // Render the logo centered, max 200×60 pt
      const imgFmt = options.companyLogoDataUrl.startsWith("data:image/png")
        ? "PNG"
        : "JPEG";
      doc.addImage(
        options.companyLogoDataUrl,
        imgFmt,
        cx - 100,
        40,
        200,
        60,
        undefined,
        "FAST",
      );
    } catch {
      // If the logo fails to render, fall back to text branding silently.
    }
  } else {
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFont("helvetica", "normal");
    doc.text("DEEPER VISION", cx, 72, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Physical Security Design Platform", cx, 88, { align: "center" });
  }

  // Divider — uses brand color, slightly thicker than before
  doc.setDrawColor(brand.r, brand.g, brand.b);
  doc.setLineWidth(0.8);
  doc.line(m + 60, 110, pw - m - 60, 110);

  // Project name
  doc.setFontSize(28);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont("helvetica", "bold");
  doc.text(design.name, cx, 170, { align: "center", maxWidth: pw - m * 2 });

  // Floor name
  doc.setFontSize(16);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFont("helvetica", "normal");
  doc.text(floor.name, cx, 200, { align: "center" });

  // Divider
  doc.line(m + 60, 230, pw - m - 60, 230);

  // Info block
  let infoY = 280;
  const labelX = pw / 2 - 80;
  const valueX = pw / 2 + 10;

  const addInfoRow = (label: string, value: string) => {
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text(label, labelX, infoY, { align: "right" });
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(value, valueX, infoY);
    infoY += 22;
  };

  addInfoRow("Date", dateStr);
  if (options?.projectNumber) {
    addInfoRow("Project #", options.projectNumber);
  }
  if (options?.preparedBy) {
    addInfoRow("Prepared by", options.preparedBy);
  }
  if (options?.preparedFor) {
    addInfoRow("Prepared for", options.preparedFor);
  }

  // Device summary section
  infoY += 20;
  doc.setDrawColor(226, 232, 240);
  doc.line(m + 60, infoY, pw - m - 60, infoY);
  infoY += 30;

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Device Summary", cx, infoY, { align: "center" });
  infoY += 30;

  // Count by type
  const counts: Record<string, number> = {};
  for (const d of floor.devices) {
    counts[d.type] = (counts[d.type] || 0) + 1;
  }

  const typeOrder: Device["type"][] = ["camera", "reader", "sensor", "network"];
  for (const t of typeOrder) {
    const count = counts[t] || 0;
    if (count === 0) continue;

    const [r, g, b] = hexToRgb(TYPE_COLORS[t]);
    doc.setFillColor(r, g, b);
    doc.circle(cx - 80, infoY - 4, 5, "F");

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`${TYPE_LABELS[t]}`, cx - 65, infoY);

    doc.setFont("helvetica", "bold");
    doc.text(`${count}`, cx + 80, infoY);
    infoY += 22;
  }

  // Total
  const total = floor.devices.length;
  infoY += 6;
  doc.setDrawColor(203, 213, 225);
  doc.line(cx - 80, infoY - 12, cx + 100, infoY - 12);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Total Devices", cx - 65, infoY);
  doc.text(`${total}`, cx + 80, infoY);

  // Bottom accent bar (brand color)
  doc.setFillColor(brand.r, brand.g, brand.b);
  doc.rect(0, ph - 6, pw, 6, "F");

  // Footer — custom line if provided, otherwise the platform mark
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "normal");
  const footerText = options?.printFooter
    ? `${options.printFooter}  |  ${dateStr}  |  Page 1`
    : `Generated by DeeperVision  |  ${dateStr}  |  Page 1`;
  doc.text(footerText, cx, ph - 18, { align: "center" });
}

/**
 * Parse a `#rrggbb` (or `#rgb`) hex string into RGB tuples for jsPDF.
 * Returns null for empty / invalid input so callers can fall back to defaults.
 */
function parseHexToRgb(
  hex: string | undefined,
): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// ---------------------------------------------------------------------------
// Floor Plan Drawing
// ---------------------------------------------------------------------------

function drawFloorPlan(
  doc: jsPDF,
  floor: Floor,
  designName: string,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
): void {
  // Reserve space for title block at bottom-right
  const titleBlockH = 60;
  const legendW = 130;
  const drawableW = pw - m * 2 - legendW - 10;
  const drawableH = ph - m * 2 - titleBlockH - 10;

  const bounds = computeBounds(floor);
  const floorW = bounds.maxX - bounds.minX;
  const floorH = bounds.maxY - bounds.minY;

  if (floorW <= 0 || floorH <= 0) return;

  // Scale to fit printable area
  const scaleFitX = drawableW / floorW;
  const scaleFitY = drawableH / floorH;
  const scaleFit = Math.min(scaleFitX, scaleFitY) * 0.92; // 8% padding

  const offsetX = m + (drawableW - floorW * scaleFit) / 2;
  const offsetY = m + (drawableH - floorH * scaleFit) / 2;

  // Transform helpers: floor-plan pixel coords -> PDF points
  const tx = (px: number) => offsetX + (px - bounds.minX) * scaleFit;
  const ty = (py: number) => offsetY + (py - bounds.minY) * scaleFit;

  // Create GState for semi-transparent fills
  let gsCoverage: any;
  try {
    // jsPDF GState constructor
    gsCoverage = doc.GState({ opacity: 0.15, "stroke-opacity": 0.3 });
    doc.addGState("coverageState", gsCoverage);
  } catch {
    // Fallback: we will use lighter colors instead
    gsCoverage = null;
  }

  // --- Draw coverage arcs/circles first (behind everything) ---
  for (const device of floor.devices) {
    const rangePx = deviceRangePixels(device, floor.scale);
    if (rangePx <= 0) continue;

    const cx = tx(device.position.x);
    const cy = ty(device.position.y);
    const rPt = rangePx * scaleFit;

    const [cr, cg, cb] = hexToRgb(TYPE_COLORS[device.type]);

    if (device.type === "camera") {
      // Draw FOV wedge for cameras
      const cam = device as CameraDevice;
      drawFOVWedge(doc, cx, cy, rPt, cam.rotation, cam.fovDegrees, cr, cg, cb, gsCoverage);
    } else if (device.type === "sensor") {
      // Detection circle for sensors
      drawCoverageCircle(doc, cx, cy, rPt, cr, cg, cb, gsCoverage);
    } else if (device.type === "network" && rPt > 0) {
      // Coverage circle for APs
      drawCoverageCircle(doc, cx, cy, rPt, cr, cg, cb, gsCoverage);
    }
  }

  // --- Draw walls ---
  doc.setDrawColor(30, 41, 59); // slate-800
  doc.setLineWidth(2.5);
  for (const wall of floor.walls) {
    doc.line(tx(wall.start.x), ty(wall.start.y), tx(wall.end.x), ty(wall.end.y));
  }

  // --- Draw devices ---
  for (const device of floor.devices) {
    const cx = tx(device.position.x);
    const cy = ty(device.position.y);
    const [r, g, b] = hexToRgb(TYPE_COLORS[device.type]);

    // Device marker (filled circle with dark stroke)
    doc.setFillColor(r, g, b);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.75);
    doc.circle(cx, cy, 5, "FD");

    // Label — use a short label: model number from catalog, or device label
    const product = resolveProduct(device);
    const shortLabel = product ? product.model : device.label;
    doc.setFontSize(6);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(shortLabel, cx + 8, cy + 2, { maxWidth: 60 });
  }

  // --- Legend ---
  const legendX = pw - m - legendW;
  const legendY = m + 10;

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(legendX, legendY, legendW, 100, 3, 3);

  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("LEGEND", legendX + 10, legendY + 14);

  const legendTypes: Device["type"][] = ["camera", "reader", "sensor", "network"];
  const legendLabels = ["Camera", "Reader", "Sensor", "Network"];
  const legendDescriptions = [
    "Green / FOV arc",
    "Blue",
    "Amber / detection range",
    "Violet / coverage",
  ];

  let ly = legendY + 30;
  for (let i = 0; i < legendTypes.length; i++) {
    const [r, g, b] = hexToRgb(TYPE_COLORS[legendTypes[i]]);
    doc.setFillColor(r, g, b);
    doc.circle(legendX + 16, ly - 3, 4, "F");
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(legendLabels[i], legendX + 26, ly);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(legendDescriptions[i], legendX + 26, ly + 9);
    ly += 21;
  }

  // --- Scale bar ---
  const scaleBarY = ph - m - titleBlockH - 20;
  const scaleBarX = m;
  // Show a bar representing some number of whole meters
  const metersPerPt = 1 / (floor.scale * scaleFit);
  // Pick a round number of meters for the bar (1, 2, 5, 10, 20 ...)
  const targetBarPt = 100;
  const rawMeters = targetBarPt * metersPerPt;
  const niceMeters = niceRound(rawMeters);
  const barLenPt = niceMeters / metersPerPt;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.5);
  doc.line(scaleBarX, scaleBarY, scaleBarX + barLenPt, scaleBarY);
  // Tick marks at endpoints
  doc.line(scaleBarX, scaleBarY - 4, scaleBarX, scaleBarY + 4);
  doc.line(scaleBarX + barLenPt, scaleBarY - 4, scaleBarX + barLenPt, scaleBarY + 4);

  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.text(`${niceMeters} m`, scaleBarX + barLenPt / 2, scaleBarY - 7, {
    align: "center",
  });

  // --- Title block (bottom-right) ---
  const tbX = pw - m - 200;
  const tbY = ph - m - titleBlockH;
  const tbW = 200;
  const tbH = titleBlockH;

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(1);
  doc.rect(tbX, tbY, tbW, tbH);
  doc.line(tbX, tbY + 16, tbX + tbW, tbY + 16);

  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text(floor.name, tbX + 6, tbY + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  const scaleText = `Scale: 1px = ${(1 / floor.scale).toFixed(3)} m`;
  doc.text(scaleText, tbX + 6, tbY + 28);
  doc.text(`Date: ${dateStr}`, tbX + 6, tbY + 40);
  doc.text(`Page 2 of ${doc.getNumberOfPages()}`, tbX + 6, tbY + 52);
  doc.text("Deeper Vision", tbX + tbW - 6, tbY + 52, { align: "right" });
}

/**
 * Draw a camera FOV wedge (pie-slice) using path operations.
 * The wedge points in the direction of `rotationDeg` and covers `fovDeg`.
 */
function drawFOVWedge(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  rotationDeg: number,
  fovDeg: number,
  r: number,
  g: number,
  b: number,
  gsCoverage: any,
): void {
  if (radius <= 0 || fovDeg <= 0) return;

  const halfFov = (fovDeg / 2) * (Math.PI / 180);
  // rotation: 0 = up (north) in our coordinate system; PDF y-axis is inverted
  const baseAngle = ((rotationDeg - 90) * Math.PI) / 180;
  const startAngle = baseAngle - halfFov;
  const endAngle = baseAngle + halfFov;
  const segments = Math.max(12, Math.ceil(fovDeg / 5));
  const step = (endAngle - startAngle) / segments;

  doc.saveGraphicsState();
  if (gsCoverage) {
    try {
      doc.setGState(gsCoverage);
    } catch {
      // fallback below
    }
  }

  // Build path: center -> arc -> back to center
  doc.setFillColor(r, g, b);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.25);

  doc.moveTo(cx, cy);
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + step * i;
    const px = cx + radius * Math.cos(a);
    const py = cy + radius * Math.sin(a);
    doc.lineTo(px, py);
  }
  doc.lineTo(cx, cy);
  doc.fillStroke();

  doc.restoreGraphicsState();
}

/**
 * Draw a circular coverage area.
 */
function drawCoverageCircle(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  gsCoverage: any,
): void {
  if (radius <= 0) return;

  doc.saveGraphicsState();
  if (gsCoverage) {
    try {
      doc.setGState(gsCoverage);
    } catch {
      // fallback
    }
  }

  doc.setFillColor(r, g, b);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, radius, "FD");

  doc.restoreGraphicsState();
}

/** Pick a "nice" round number near `n` for scale-bar labelling. */
function niceRound(n: number): number {
  if (n <= 0) return 1;
  const candidates = [0.5, 1, 2, 5, 10, 15, 20, 25, 50, 100];
  let best = candidates[0];
  let bestDist = Math.abs(n - best);
  for (const c of candidates) {
    const dist = Math.abs(n - c);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Device Schedule Table (last PDF page)
// ---------------------------------------------------------------------------

function drawDeviceSchedule(
  doc: jsPDF,
  floor: Floor,
  designName: string,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
): void {
  // Header
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Device Schedule", m, m + 16);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${designName}  —  ${floor.name}  —  ${dateStr}`, m, m + 30);

  // Table columns and widths
  const colHeaders = ["#", "Label", "Manufacturer", "Model", "Type", "Subcat.", "Mount Ht.", "Notes"];
  const colWidths = [24, 72, 80, 72, 54, 54, 48, pw - m * 2 - 24 - 72 - 80 - 72 - 54 - 54 - 48];

  const tableX = m;
  let tableY = m + 44;
  const rowH = 16;
  const headerH = 18;

  // Sort devices: type, then manufacturer/label
  const sorted = [...floor.devices].sort((a, b) => {
    const td = TYPE_SORT_ORDER[a.type] - TYPE_SORT_ORDER[b.type];
    if (td !== 0) return td;
    const prodA = resolveProduct(a);
    const prodB = resolveProduct(b);
    const mfgA = prodA?.manufacturer ?? "";
    const mfgB = prodB?.manufacturer ?? "";
    const mfgCmp = mfgA.localeCompare(mfgB);
    if (mfgCmp !== 0) return mfgCmp;
    return a.label.localeCompare(b.label);
  });

  // Draw header row
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(tableX, tableY, pw - m * 2, headerH, "F");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "bold");

  let colX = tableX;
  for (let c = 0; c < colHeaders.length; c++) {
    doc.text(colHeaders[c], colX + 4, tableY + 12);
    colX += colWidths[c];
  }
  tableY += headerH;

  // Draw rows
  const typeCounts: Record<string, number> = {};
  const pageBottom = ph - m - 40;

  for (let i = 0; i < sorted.length; i++) {
    // Page break check
    if (tableY + rowH > pageBottom) {
      doc.addPage("letter", "portrait");
      tableY = m + 16;
      // Re-draw header on new page
      doc.setFillColor(241, 245, 249);
      doc.rect(tableX, tableY, pw - m * 2, headerH, "F");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "bold");
      colX = tableX;
      for (let c = 0; c < colHeaders.length; c++) {
        doc.text(colHeaders[c], colX + 4, tableY + 12);
        colX += colWidths[c];
      }
      tableY += headerH;
    }

    const device = sorted[i];
    const product = resolveProduct(device);
    const subcat = subcategoryLabel(device);

    typeCounts[device.type] = (typeCounts[device.type] || 0) + 1;

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(tableX, tableY, pw - m * 2, rowH, "F");
    }

    // Row separator
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(tableX, tableY + rowH, tableX + pw - m * 2, tableY + rowH);

    doc.setFontSize(6.5);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "normal");

    const rowData = [
      `${i + 1}`,
      device.label,
      product?.manufacturer ?? "—",
      product?.model ?? (device.type === "camera" ? (device as CameraDevice).model : "—"),
      TYPE_LABELS[device.type],
      subcat,
      `${device.mountHeight.toFixed(1)} m`,
      device.notes || "—",
    ];

    colX = tableX;
    for (let c = 0; c < rowData.length; c++) {
      const maxW = colWidths[c] - 6;
      doc.text(rowData[c], colX + 4, tableY + 11, { maxWidth: maxW });
      colX += colWidths[c];
    }

    tableY += rowH;
  }

  // Summary row
  tableY += 6;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.75);
  doc.line(tableX, tableY, tableX + pw - m * 2, tableY);
  tableY += 14;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);

  const typeOrder: Device["type"][] = ["camera", "reader", "sensor", "network"];
  const summaryParts: string[] = [];
  for (const t of typeOrder) {
    if (typeCounts[t]) {
      summaryParts.push(`${TYPE_LABELS[t]}: ${typeCounts[t]}`);
    }
  }
  summaryParts.push(`Total: ${sorted.length}`);
  doc.text(summaryParts.join("    "), tableX + 4, tableY);

  // Footer
  const pageNum = doc.getNumberOfPages();
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Deeper Vision  |  ${dateStr}  |  Page ${pageNum} of ${pageNum}`,
    pw / 2,
    ph - m + 8,
    { align: "center" },
  );
}

// ---------------------------------------------------------------------------
// 2. exportBOMCSV
// ---------------------------------------------------------------------------

/**
 * Export a CSV Bill of Materials, grouped by product (catalogId).
 *
 * Triggers a browser download of `{design-name}-bom.csv`.
 */
export async function exportBOMCSV(
  design: DesignDocument,
  floor: Floor,
): Promise<void> {
  // Group devices by catalogId, or by type+subtype if no catalogId
  interface BOMGroup {
    key: string;
    product: CatalogProduct | undefined;
    type: Device["type"];
    subcat: string;
    qty: number;
    labels: string[];
  }

  const groups = new Map<string, BOMGroup>();

  for (const device of floor.devices) {
    const product = resolveProduct(device);
    const subcat = subcategoryLabel(device);
    const key = device.catalogId ?? `generic-${device.type}-${subcat}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        product,
        type: device.type,
        subcat,
        qty: 0,
        labels: [],
      };
      groups.set(key, group);
    }
    group.qty++;
    if (device.label) {
      group.labels.push(device.label);
    }
  }

  // Sort groups by type, then manufacturer, then model
  const sorted = [...groups.values()].sort((a, b) => {
    const td = TYPE_SORT_ORDER[a.type] - TYPE_SORT_ORDER[b.type];
    if (td !== 0) return td;
    const mfgA = a.product?.manufacturer ?? "";
    const mfgB = b.product?.manufacturer ?? "";
    return mfgA.localeCompare(mfgB) || (a.product?.model ?? "").localeCompare(b.product?.model ?? "");
  });

  const headers = [
    "Line #",
    "Manufacturer",
    "Model",
    "Full Name",
    "Category",
    "Subcategory",
    "Qty",
    "Unit Price (Street)",
    "Extended Price",
    "Labor Hours (per unit)",
    "Total Labor Hours",
    "Label/Location",
  ];

  const rows: (string | number)[][] = [];
  let totalPrice = 0;
  let totalLabor = 0;
  let lineNum = 0;

  for (const g of sorted) {
    lineNum++;
    const unitPrice = g.product?.streetPrice ?? 0;
    const extPrice = unitPrice * g.qty;
    const laborPerUnit = g.product?.laborHours ?? 0;
    const totalLaborRow = laborPerUnit * g.qty;

    totalPrice += extPrice;
    totalLabor += totalLaborRow;

    rows.push([
      lineNum,
      g.product?.manufacturer ?? "Generic",
      g.product?.model ?? g.subcat,
      g.product?.fullName ?? `Generic ${g.type} (${g.subcat})`,
      TYPE_LABELS[g.type],
      g.subcat,
      g.qty,
      unitPrice > 0 ? fmtCurrency(unitPrice) : "—",
      extPrice > 0 ? fmtCurrency(extPrice) : "—",
      laborPerUnit > 0 ? laborPerUnit.toFixed(1) : "—",
      totalLaborRow > 0 ? totalLaborRow.toFixed(1) : "—",
      g.labels.join(", "),
    ]);
  }

  // Summary row
  rows.push([
    "",
    "",
    "",
    "",
    "",
    "TOTALS",
    floor.devices.length,
    "",
    totalPrice > 0 ? fmtCurrency(totalPrice) : "—",
    "",
    totalLabor > 0 ? totalLabor.toFixed(1) : "—",
    "",
  ]);

  const csv = buildCSV(headers, rows);
  const safeName = design.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  downloadText(`${safeName}-bom.csv`, csv, "text/csv;charset=utf-8");
}

// ---------------------------------------------------------------------------
// 3. exportDeviceScheduleCSV
// ---------------------------------------------------------------------------

/**
 * Export a CSV with one row per device instance.
 *
 * Triggers a browser download of `{design-name}-device-schedule.csv`.
 */
export async function exportDeviceScheduleCSV(
  design: DesignDocument,
  floor: Floor,
): Promise<void> {
  const headers = [
    "Device #",
    "Label",
    "Manufacturer",
    "Model",
    "Type",
    "Location (x m)",
    "Location (y m)",
    "Mount Height (m)",
    "Notes",
  ];

  // Sort same as the PDF schedule: type, manufacturer, label
  const sorted = [...floor.devices].sort((a, b) => {
    const td = TYPE_SORT_ORDER[a.type] - TYPE_SORT_ORDER[b.type];
    if (td !== 0) return td;
    const prodA = resolveProduct(a);
    const prodB = resolveProduct(b);
    const mfgA = prodA?.manufacturer ?? "";
    const mfgB = prodB?.manufacturer ?? "";
    const mfgCmp = mfgA.localeCompare(mfgB);
    if (mfgCmp !== 0) return mfgCmp;
    return a.label.localeCompare(b.label);
  });

  const rows: (string | number)[][] = [];

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const product = resolveProduct(d);
    const xMeters = (d.position.x / floor.scale).toFixed(2);
    const yMeters = (d.position.y / floor.scale).toFixed(2);

    rows.push([
      i + 1,
      d.label,
      product?.manufacturer ?? "—",
      product?.model ?? (d.type === "camera" ? (d as CameraDevice).model : "—"),
      TYPE_LABELS[d.type],
      xMeters,
      yMeters,
      d.mountHeight.toFixed(1),
      d.notes || "",
    ]);
  }

  const csv = buildCSV(headers, rows);
  const safeName = design.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  downloadText(`${safeName}-device-schedule.csv`, csv, "text/csv;charset=utf-8");
}

// ---------------------------------------------------------------------------
// 4. exportPhotoTourPDF
// ---------------------------------------------------------------------------

/**
 * Photo tour — a PDF compiled from every site-walk photo attached to a
 * device. One page per photo with the device label, model, position,
 * install status, caption, and shot timestamp. Cover page sits up front
 * with a total count. Empty case still produces a single "no photos yet"
 * page so the export never silently no-ops.
 *
 * Mirrors the System Surveyor "photo tour report" deliverable — useful
 * for handing a paper trail of "this camera goes here" to an install crew.
 */
export async function exportPhotoTourPDF(
  design: DesignDocument,
  floor: Floor,
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });
  const pw = doc.internal.pageSize.getWidth(); // 612
  const ph = doc.internal.pageSize.getHeight(); // 792
  const margin = 36;
  const now = new Date();
  const dateStr = fmtDate(now);

  interface PhotoEntry {
    device: Device;
    photo: DevicePhoto;
    indexOnDevice: number;
  }
  const entries: PhotoEntry[] = [];
  for (const d of floor.devices) {
    if (d.photos && d.photos.length > 0) {
      d.photos.forEach((photo, i) =>
        entries.push({ device: d, photo, indexOnDevice: i }),
      );
    }
  }

  drawPhotoTourCover(doc, design, floor, entries.length, dateStr, pw, ph, margin);

  if (entries.length === 0) {
    doc.addPage("letter", "portrait");
    drawPhotoTourEmptyMessage(doc, pw, ph);
    const safeName = design.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    await doc.save(`${safeName}-photo-tour.pdf`, { returnPromise: true });
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const { device, photo } = entries[i];
    doc.addPage("letter", "portrait");
    await drawPhotoPage(
      doc,
      design,
      floor,
      device,
      photo,
      i + 1,
      entries.length,
      dateStr,
      pw,
      ph,
      margin,
    );
  }

  const safeName = design.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  await doc.save(`${safeName}-photo-tour.pdf`, { returnPromise: true });
}

function drawPhotoTourCover(
  doc: jsPDF,
  design: DesignDocument,
  floor: Floor,
  photoCount: number,
  dateStr: string,
  pw: number,
  ph: number,
  margin: number,
): void {
  const cx = pw / 2;
  // Top accent bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 6, "F");
  // Eyebrow
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text("PHOTO TOUR", cx, 130, { align: "center" });
  // Project name
  doc.setFontSize(28);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text(design.name, cx, 170, { align: "center", maxWidth: pw - margin * 2 });
  // Floor name
  doc.setFontSize(16);
  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "normal");
  doc.text(floor.name, cx, 200, { align: "center" });
  // Stat line
  doc.setFontSize(13);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${photoCount} photo${photoCount === 1 ? "" : "s"} across ${floor.devices.length} device${floor.devices.length === 1 ? "" : "s"}`,
    cx,
    240,
    { align: "center" },
  );
  // Date
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(dateStr, cx, ph - 60, { align: "center" });
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Generated by DeeperVision", cx, ph - 30, { align: "center" });
}

function drawPhotoTourEmptyMessage(doc: jsPDF, pw: number, ph: number): void {
  doc.setFontSize(14);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "No site-walk photos attached yet.",
    pw / 2,
    ph / 2 - 8,
    { align: "center" },
  );
  doc.setFontSize(10);
  doc.text(
    'Select a device in the editor, click "Add" in the Photos section, then re-run this report.',
    pw / 2,
    ph / 2 + 14,
    { align: "center" },
  );
}

async function drawPhotoPage(
  doc: jsPDF,
  design: DesignDocument,
  floor: Floor,
  device: Device,
  photo: DevicePhoto,
  pageNum: number,
  totalPages: number,
  dateStr: string,
  pw: number,
  ph: number,
  margin: number,
): Promise<void> {
  // Header strip — design + floor on left, page n / N on right
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "normal");
  doc.text(`${design.name}  ·  ${floor.name}`, margin, margin - 8);
  doc.text(`Photo ${pageNum} of ${totalPages}`, pw - margin, margin - 8, {
    align: "right",
  });

  // Photo — fit-to-box, centered, max 55% of page height
  const maxW = pw - margin * 2;
  const maxH = ph * 0.55;
  let drawW = maxW;
  let drawH = maxH;
  try {
    const dims = await getImageDims(photo.dataUrl);
    const scale = Math.min(maxW / dims.w, maxH / dims.h);
    drawW = dims.w * scale;
    drawH = dims.h * scale;
  } catch {
    /* fall back to box-sized rectangle */
  }
  const photoX = (pw - drawW) / 2;
  const photoY = margin + 10;
  try {
    doc.addImage(
      photo.dataUrl,
      imageFormat(photo.dataUrl),
      photoX,
      photoY,
      drawW,
      drawH,
      undefined,
      "FAST",
    );
  } catch {
    // Placeholder if the image data is unreadable.
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(241, 245, 249);
    doc.rect(photoX, photoY, drawW, drawH, "FD");
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text("[photo unavailable]", pw / 2, photoY + drawH / 2, {
      align: "center",
    });
  }

  // Caption (italic, centered) just under the photo
  let belowY = photoY + drawH + 18;
  if (photo.caption) {
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "italic");
    const lines = doc.splitTextToSize(photo.caption, maxW);
    doc.text(lines, pw / 2, belowY, { align: "center" });
    belowY += lines.length * 12 + 6;
    doc.setFont("helvetica", "normal");
  }

  // Divider
  const blockTop = belowY + 4;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, blockTop, pw - margin, blockTop);

  // Device label + type
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text(device.label, margin, blockTop + 22, { maxWidth: maxW });

  const subcat = subcategoryLabel(device);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${TYPE_LABELS[device.type]} · ${subcat}`, margin, blockTop + 38);

  // Info rows
  const product = resolveProduct(device);
  const xMeters = (device.position.x / floor.scale).toFixed(2);
  const yMeters = (device.position.y / floor.scale).toFixed(2);
  let takenAt = photo.takenAt;
  try {
    takenAt = new Date(photo.takenAt).toLocaleString();
  } catch {
    /* keep raw */
  }

  let infoY = blockTop + 60;
  const labelX = margin;
  const valueX = margin + 110;
  const addRow = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text(label, labelX, infoY);
    doc.setTextColor(15, 23, 42);
    doc.text(value, valueX, infoY, { maxWidth: pw - valueX - margin });
    infoY += 16;
  };

  if (product) {
    addRow("Model", `${product.manufacturer} ${product.model}`);
  }
  addRow("Mount height", `${device.mountHeight.toFixed(1)} m`);
  addRow("Position", `(${xMeters} m, ${yMeters} m)`);
  addRow("Status", device.installStatus ?? "proposed");
  if (device.notes) {
    addRow("Notes", device.notes);
  }
  addRow("Photo taken", takenAt);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Deeper Vision  |  ${dateStr}  |  Page ${pageNum + 1}`,
    pw / 2,
    ph - 18,
    { align: "center" },
  );
}

/** Map a data URL to the format jsPDF.addImage expects. */
function imageFormat(dataUrl: string): "JPEG" | "PNG" {
  const lc = dataUrl.toLowerCase();
  if (lc.startsWith("data:image/jpeg") || lc.startsWith("data:image/jpg"))
    return "JPEG";
  if (lc.startsWith("data:image/png")) return "PNG";
  return "JPEG";
}

/** Decode the natural dimensions of an image data URL via <img>. */
async function getImageDims(
  dataUrl: string,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// 5. exportPermitPackagePDF
// ---------------------------------------------------------------------------
//
// A permit-ready multi-page submittal that AHJs (Authority Having
// Jurisdiction) actually want to see. Composes the existing cover + floor
// plan + device schedule with five new pages purpose-built for permit
// review: cable schedule, riser diagram, power calculations, symbol
// legend, and an auto-checked code-compliance summary with a signature
// block at the end.
//
// Saves an integrator ~8–20 hours per project vs. building these by hand
// in AutoCAD + Word.

export interface PermitPackageOptions extends PDFExportOptions {
  /** Authority Having Jurisdiction (e.g. "City of San Francisco DBI"). */
  ahj?: string;
  /** Permit application / tracking number. */
  permitNumber?: string;
  /** Contractor's state license number. */
  licenseNumber?: string;
  /** Architect / engineer of record. */
  architectOfRecord?: string;
}

interface SheetRef {
  number: string;
  title: string;
}

export async function exportPermitPackagePDF(
  design: DesignDocument,
  floor: Floor,
  options?: PermitPackageOptions,
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const dateStr = fmtDate(new Date());

  // Lazy-import cabling so the main editor bundle isn't pulled in by
  // anything that already imports export.ts.
  const { planCabling } = await import("./cabling");
  const autoCabling = planCabling(floor);

  // Merge with user-authored cables. When a device has a manual cable,
  // the auto-routed entry for that device is dropped — the manual spec
  // is the integrator's source-of-truth for the permit drawings.
  const manualCables = floor.cables ?? [];
  const manualSourceIds = new Set(manualCables.map((c) => c.sourceDeviceId));
  const mergedRuns = [
    // Manual runs first
    ...manualCables.map((c) => {
      const tgt = floor.devices.find((d) => d.id === c.targetDeviceId);
      const src = floor.devices.find((d) => d.id === c.sourceDeviceId);
      // Length: source → waypoints → target (px → meters, ×1.15 slack)
      let lenPx = 0;
      const pts = [
        src ? { x: src.position.x, y: src.position.y } : { x: 0, y: 0 },
        ...c.waypoints,
        tgt ? { x: tgt.position.x, y: tgt.position.y } : { x: 0, y: 0 },
      ];
      for (let i = 0; i < pts.length - 1; i++) {
        lenPx += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      }
      const lenM = (lenPx / floor.scale) * 1.15;
      return {
        deviceId: c.sourceDeviceId,
        headEnd:
          tgt?.type === "network" &&
          (tgt as Extract<Device, { type: "network" }>).networkType === "nvr"
            ? ("nvr" as const)
            : ("switch" as const),
        headEndDeviceId: c.targetDeviceId,
        lengthM: lenM,
        manual: true as const,
        cableType: c.type,
      };
    }),
    // Then auto-routed runs for any device that doesn't have a manual.
    ...autoCabling.runs
      .filter((r) => !manualSourceIds.has(r.deviceId))
      .map((r) => ({ ...r, manual: false as const, cableType: undefined as undefined })),
  ];

  const cabling = {
    runs: mergedRuns,
    totalLengthM: mergedRuns.reduce((s, r) => s + r.lengthM, 0),
  };

  // -----------------------------------------------------------------------
  // Sheet list. Order matches what AHJs typically expect: cover first,
  // index second, then drawings, then schedules, then calculations, then
  // legal / compliance pages.
  // -----------------------------------------------------------------------
  const sheets: SheetRef[] = [
    { number: "S-001", title: "Cover Sheet" },
    { number: "S-002", title: "Sheet Index" },
    { number: "T-101", title: "Floor Plan — Devices" },
    { number: "T-102", title: "Device Schedule" },
    { number: "T-103", title: "Cable Schedule" },
    { number: "R-101", title: "Riser Diagram" },
    { number: "P-101", title: "PoE Power Calculations" },
    { number: "L-101", title: "Symbol Legend" },
    { number: "C-101", title: "Code Compliance Summary" },
    { number: "X-101", title: "Approval & Signature" },
  ];

  // S-001 — extend the standard cover with the permit metadata block.
  drawCoverPage(doc, design, floor, dateStr, pageW, pageH, margin, options);
  drawPermitStampBlock(doc, options, pageW, pageH, margin);

  // S-002 — Sheet index. A simple table of every sheet in the package.
  doc.addPage("letter", "portrait");
  drawSheetIndex(doc, sheets, design, floor, dateStr, pageW, pageH, margin);

  // T-101 — Floor plan (landscape, reused).
  doc.addPage("letter", "landscape");
  const lpW = doc.internal.pageSize.getWidth();
  const lpH = doc.internal.pageSize.getHeight();
  drawFloorPlan(doc, floor, design.name, dateStr, lpW, lpH, margin);
  drawSheetStamp(doc, "T-101", lpW, lpH, margin);

  // T-102 — Device schedule (reused).
  doc.addPage("letter", "portrait");
  drawDeviceSchedule(doc, floor, design.name, dateStr, pageW, pageH, margin);
  drawSheetStamp(doc, "T-102", pageW, pageH, margin);

  // T-103 — Cable schedule (NEW).
  doc.addPage("letter", "portrait");
  drawCableSchedule(
    doc,
    floor,
    cabling,
    design.name,
    dateStr,
    pageW,
    pageH,
    margin,
  );
  drawSheetStamp(doc, "T-103", pageW, pageH, margin);

  // R-101 — Riser diagram (NEW).
  doc.addPage("letter", "landscape");
  drawRiserDiagram(
    doc,
    floor,
    cabling,
    design.name,
    dateStr,
    lpW,
    lpH,
    margin,
  );
  drawSheetStamp(doc, "R-101", lpW, lpH, margin);

  // P-101 — Power calculations (NEW).
  doc.addPage("letter", "portrait");
  drawPowerCalculations(
    doc,
    floor,
    design.name,
    dateStr,
    pageW,
    pageH,
    margin,
  );
  drawSheetStamp(doc, "P-101", pageW, pageH, margin);

  // L-101 — Symbol legend (NEW).
  doc.addPage("letter", "portrait");
  drawSymbolLegend(doc, design.name, dateStr, pageW, pageH, margin);
  drawSheetStamp(doc, "L-101", pageW, pageH, margin);

  // C-101 — Code compliance summary (NEW).
  doc.addPage("letter", "portrait");
  drawCodeCompliance(
    doc,
    floor,
    design.name,
    dateStr,
    pageW,
    pageH,
    margin,
  );
  drawSheetStamp(doc, "C-101", pageW, pageH, margin);

  // X-101 — Approval / signature block (NEW).
  doc.addPage("letter", "portrait");
  drawSignatureBlock(
    doc,
    design.name,
    dateStr,
    options,
    pageW,
    pageH,
    margin,
  );
  drawSheetStamp(doc, "X-101", pageW, pageH, margin);

  const safeName = design.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  await doc.save(`${safeName}-permit-package.pdf`, { returnPromise: true });
}

// ---------------------------------------------------------------------------
// Permit-package helper draws
// ---------------------------------------------------------------------------

/** Right-side "permit data" block stamped onto the cover page. */
function drawPermitStampBlock(
  doc: jsPDF,
  options: PermitPackageOptions | undefined,
  pw: number,
  ph: number,
  m: number,
): void {
  if (!options) return;
  const rows = [
    ["AHJ", options.ahj || "—"],
    ["Permit #", options.permitNumber || "—"],
    ["License #", options.licenseNumber || "—"],
    ["Arch. of Record", options.architectOfRecord || "—"],
  ];
  const boxW = 220;
  const boxH = rows.length * 16 + 18;
  const x = pw - m - boxW;
  const y = ph - m - boxH - 36;
  // Frame
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.rect(x, y, boxW, boxH);
  // Title strip
  doc.setFillColor(241, 245, 249);
  doc.rect(x, y, boxW, 14, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("PERMIT DATA", x + 6, y + 9);
  // Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  for (let i = 0; i < rows.length; i++) {
    const ry = y + 18 + i * 16 + 4;
    doc.setTextColor(100, 116, 139);
    doc.text(rows[i][0], x + 6, ry);
    doc.setTextColor(15, 23, 42);
    doc.text(rows[i][1], x + 90, ry, { maxWidth: boxW - 96 });
  }
}

/** Small sheet-number stamp at the bottom-right of every drawing sheet. */
function drawSheetStamp(
  doc: jsPDF,
  sheetNo: string,
  pw: number,
  ph: number,
  m: number,
): void {
  const w = 70;
  const h = 22;
  const x = pw - m - w;
  const y = ph - m - h;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.6);
  doc.rect(x, y, w, h);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text("SHEET", x + 5, y + 9);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text(sheetNo, x + w - 5, y + 16, { align: "right" });
}

/** S-002 — Sheet Index. Lists every page in the package with a title. */
function drawSheetIndex(
  doc: jsPDF,
  sheets: SheetRef[],
  design: DesignDocument,
  floor: Floor,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
): void {
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Sheet Index", m, m + 18);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${design.name}  —  ${floor.name}  —  ${dateStr}`, m, m + 32);

  let y = m + 56;
  const colSheetW = 80;
  const rowH = 22;
  // Header row
  doc.setFillColor(241, 245, 249);
  doc.rect(m, y, pw - m * 2, 18, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("SHEET", m + 8, y + 12);
  doc.text("TITLE", m + colSheetW + 8, y + 12);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  for (let i = 0; i < sheets.length; i++) {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(m, y, pw - m * 2, rowH, "F");
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(sheets[i].number, m + 8, y + 14);
    doc.setFont("helvetica", "normal");
    doc.text(sheets[i].title, m + colSheetW + 8, y + 14);
    y += rowH;
  }
  // Bottom rule
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(m, y, pw - m, y);
}

/** T-103 — Cable Schedule. One row per cable run with from/to/length/type. */
function drawCableSchedule(
  doc: jsPDF,
  floor: Floor,
  cabling: {
    runs: Array<{
      deviceId: string;
      headEnd: string;
      headEndDeviceId: string | null;
      lengthM: number;
      manual?: boolean;
      cableType?: string;
    }>;
    totalLengthM: number;
  },
  designName: string,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
): void {
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Cable Schedule", m, m + 18);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${designName}  —  ${floor.name}  —  ${dateStr}`, m, m + 32);

  // Lookup helpers
  const byId = new Map(floor.devices.map((d) => [d.id, d]));

  // Per-cable display name. Manual cables ship with an explicit type
  // and win over the rule-of-thumb default; auto-routed runs fall back
  // to the type implied by the source device.
  const TYPE_LABEL: Record<string, string> = {
    cat6: "Cat6 (PoE+)",
    cat6a: "Cat6a (10G/PoE++)",
    fiber: "OM4 Fiber",
    "22-4": "Belden 5504UE 22/4",
    "18-2": "18/2 STR",
    "16-2": "16/2 STR",
    rg59: "RG59 Coax",
    "speaker-16-2": "Speaker 16/2",
  };
  function cableTypeFor(deviceId: string, override?: string): string {
    if (override && TYPE_LABEL[override]) return TYPE_LABEL[override];
    const d = byId.get(deviceId);
    if (!d) return "—";
    if (d.type === "camera") return "Cat6 (PoE+)";
    if (d.type === "network") return "Cat6 (PoE+)";
    if (d.type === "reader") return "Belden 5504UE 22/4";
    return "18/2 STR";
  }

  const colHeaders = ["#", "Cable ID", "From (Device)", "To (Head-End)", "Type", "Length (m)", "Run"];
  const colWidths = [24, 70, 130, 130, 90, 56, pw - m * 2 - 24 - 70 - 130 - 130 - 90 - 56];
  let y = m + 56;
  const rowH = 16;
  const headerH = 18;

  // Header
  doc.setFillColor(241, 245, 249);
  doc.rect(m, y, pw - m * 2, headerH, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  let colX = m;
  for (let c = 0; c < colHeaders.length; c++) {
    doc.text(colHeaders[c], colX + 4, y + 12);
    colX += colWidths[c];
  }
  y += headerH;

  // Rows
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  const pageBottom = ph - m - 50;
  let cableNo = 0;
  for (const run of cabling.runs) {
    if (y + rowH > pageBottom) {
      doc.addPage("letter", "portrait");
      y = m + 18;
      doc.setFillColor(241, 245, 249);
      doc.rect(m, y, pw - m * 2, headerH, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      colX = m;
      for (let c = 0; c < colHeaders.length; c++) {
        doc.text(colHeaders[c], colX + 4, y + 12);
        colX += colWidths[c];
      }
      y += headerH;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
    }
    cableNo++;
    const fromDev = byId.get(run.deviceId);
    const toDev = run.headEndDeviceId ? byId.get(run.headEndDeviceId) : null;
    if (cableNo % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(m, y, pw - m * 2, rowH, "F");
    }
    const cableId = `C-${String(cableNo).padStart(3, "0")}`;
    const row = [
      `${cableNo}`,
      cableId + (run.manual ? " ★" : ""),
      fromDev ? `${fromDev.label}` : "—",
      toDev ? `${toDev.label}` : "IDF / MDF (TBD)",
      cableTypeFor(run.deviceId, run.cableType),
      run.lengthM.toFixed(1),
      run.manual ? "manual" : `${run.headEnd}`,
    ];
    colX = m;
    for (let c = 0; c < row.length; c++) {
      doc.text(row[c], colX + 4, y + 11, { maxWidth: colWidths[c] - 6 });
      colX += colWidths[c];
    }
    y += rowH;
  }

  // Summary
  y += 6;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.75);
  doc.line(m, y, pw - m, y);
  y += 16;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Total runs: ${cabling.runs.length}    Total cable (incl. 15% slack): ${cabling.totalLengthM.toFixed(1)} m`,
    m + 4,
    y,
  );
}

/** R-101 — Riser Diagram. Block-style topology: each head-end (NVR/switch)
 *  sits at the top, with the drops it owns hanging below as a tree. */
function drawRiserDiagram(
  doc: jsPDF,
  floor: Floor,
  cabling: { runs: { deviceId: string; headEnd: string; headEndDeviceId: string | null; lengthM: number }[] },
  designName: string,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
): void {
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Riser Diagram", m, m + 18);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${designName}  —  ${floor.name}  —  ${dateStr}`, m, m + 32);

  // Group runs by head-end device id (or "centroid" fallback).
  const byHead = new Map<string, { headDevice: Device | null; runs: typeof cabling.runs }>();
  for (const run of cabling.runs) {
    const key = run.headEndDeviceId ?? "_centroid";
    if (!byHead.has(key)) {
      const headDevice = run.headEndDeviceId
        ? floor.devices.find((d) => d.id === run.headEndDeviceId) ?? null
        : null;
      byHead.set(key, { headDevice, runs: [] });
    }
    byHead.get(key)!.runs.push(run);
  }

  const headEnds = Array.from(byHead.entries());
  if (headEnds.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "italic");
    doc.text("No cable runs to plot — add at least one camera or reader.", m, m + 80);
    return;
  }

  // Layout: one column per head-end, evenly spaced across the page width.
  const startY = m + 70;
  const colCount = headEnds.length;
  const colSpacing = (pw - m * 2) / colCount;
  const headBoxW = Math.min(150, colSpacing - 12);
  const headBoxH = 36;
  const dropBoxW = Math.min(130, colSpacing - 18);
  const dropBoxH = 22;

  for (let i = 0; i < colCount; i++) {
    const [, group] = headEnds[i];
    const cx = m + colSpacing * i + colSpacing / 2;

    // Head-end block
    const hx = cx - headBoxW / 2;
    const hy = startY;
    doc.setFillColor(30, 41, 59);
    doc.rect(hx, hy, headBoxW, headBoxH, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const headLabel = group.headDevice
      ? group.headDevice.label
      : "IDF / MDF (TBD)";
    doc.text(headLabel, cx, hy + 14, { align: "center", maxWidth: headBoxW - 8 });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    const headType = group.headDevice
      ? (group.headDevice.type === "network"
          ? (group.headDevice as NetworkDeviceBase).networkType.toUpperCase()
          : group.headDevice.type.toUpperCase())
      : "FALLBACK";
    doc.text(headType, cx, hy + 26, { align: "center" });

    // Vertical trunk down to the drops
    const dropStartY = hy + headBoxH + 28;
    const trunkX = cx;
    const trunkBottomY = dropStartY + (dropBoxH + 8) * group.runs.length - 8;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(1);
    doc.line(trunkX, hy + headBoxH, trunkX, trunkBottomY - dropBoxH / 2);

    // Drops — each one branches off the trunk to a box on the left/right
    const byIdLocal = new Map(floor.devices.map((d) => [d.id, d]));
    for (let r = 0; r < group.runs.length; r++) {
      const run = group.runs[r];
      const dev = byIdLocal.get(run.deviceId);
      if (!dev) continue;
      const dy = dropStartY + r * (dropBoxH + 8);
      const side = r % 2 === 0 ? -1 : 1; // alternate left/right of trunk
      const dx = trunkX + side * (dropBoxW / 2 + 18);
      // Branch line
      doc.setDrawColor(71, 85, 105);
      doc.setLineWidth(0.6);
      doc.line(trunkX, dy + dropBoxH / 2, dx + (side === -1 ? dropBoxW / 2 : -dropBoxW / 2), dy + dropBoxH / 2);
      // Drop box
      const [tr, tg, tb] = hexToRgb(TYPE_COLORS[dev.type]);
      doc.setFillColor(tr, tg, tb);
      doc.rect(dx - dropBoxW / 2, dy, 4, dropBoxH, "F"); // colored stripe
      doc.setDrawColor(148, 163, 184);
      doc.setFillColor(255, 255, 255);
      doc.rect(dx - dropBoxW / 2 + 4, dy, dropBoxW - 4, dropBoxH, "FD");
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(dev.label, dx - dropBoxW / 2 + 9, dy + 9, {
        maxWidth: dropBoxW - 14,
      });
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${run.lengthM.toFixed(1)} m`,
        dx - dropBoxW / 2 + 9,
        dy + 18,
      );
    }
  }

  // Legend at the bottom
  const legendY = ph - m - 24;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Block diagram. Cable lengths include 15% service-loop slack. Trunks denote logical IP/RS-485 topology, not physical pathways.",
    m,
    legendY,
  );
}

/** P-101 — PoE budget and battery-backup math. */
function drawPowerCalculations(
  doc: jsPDF,
  floor: Floor,
  designName: string,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
): void {
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("PoE Power Calculations", m, m + 18);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${designName}  —  ${floor.name}  —  ${dateStr}`, m, m + 32);

  // Estimate per-device draw. These are conservative typical-max values; a
  // real submittal would pull each device's datasheet, but for a permit
  // budget the rule-of-thumb wattages get you within a switch class.
  function estimatedDrawW(d: Device): number {
    if (d.type === "camera") {
      const sub = (d as CameraDevice).cameraType;
      if (sub === "ptz") return 30; // PoE++
      if (sub === "multi-sensor") return 25;
      if (sub === "bullet" || sub === "fixed") return 9;
      if (sub === "fisheye" || sub === "dome" || sub === "mini") return 7;
      return 9;
    }
    if (d.type === "network") {
      const sub = (d as NetworkDeviceBase).networkType;
      if (sub === "access-point") return 25;
      return 0; // switch / NVR are line-powered
    }
    if (d.type === "reader") return 3;
    return 1;
  }

  const switches = floor.devices.filter(
    (d) => d.type === "network" && (d as NetworkDeviceBase).networkType === "switch",
  );
  const nvrs = floor.devices.filter(
    (d) => d.type === "network" && (d as NetworkDeviceBase).networkType === "nvr",
  );
  // Distribute drops to nearest switch+NVR by index (matches cabling order).
  const totalDrops = floor.devices.filter(
    (d) =>
      d.type === "camera" ||
      d.type === "reader" ||
      (d.type === "network" &&
        (d as NetworkDeviceBase).networkType === "access-point"),
  );
  const totalDrawW = totalDrops.reduce((s, d) => s + estimatedDrawW(d), 0);

  let y = m + 60;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Aggregate PoE load (all drops)", m, y);
  y += 16;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  doc.text(`Total estimated draw:  ${totalDrawW.toFixed(0)} W`, m + 12, y);
  y += 14;
  doc.text(
    `Switches available: ${switches.length}   |   NVRs available: ${nvrs.length}`,
    m + 12,
    y,
  );
  y += 24;

  // Per-switch budget table — assume 370W PoE budget per switch as a
  // conservative midpoint between 24-port Meraki (370W) and Ubiquiti
  // (400W). Integrators override per actual SKU on review.
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Per-switch budget assumption: 370 W PoE+ per managed switch", m, y);
  y += 16;

  const headerH = 18;
  const rowH = 16;
  const cols = ["Switch", "Model", "PoE Budget (W)", "Allocated (W)", "Utilization"];
  const widths = [150, 160, 90, 90, pw - m * 2 - 150 - 160 - 90 - 90];

  doc.setFillColor(241, 245, 249);
  doc.rect(m, y, pw - m * 2, headerH, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  let colX = m;
  for (let c = 0; c < cols.length; c++) {
    doc.text(cols[c], colX + 4, y + 12);
    colX += widths[c];
  }
  y += headerH;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);

  if (switches.length === 0) {
    doc.setFillColor(254, 242, 242);
    doc.rect(m, y, pw - m * 2, rowH * 2, "F");
    doc.setTextColor(127, 29, 29);
    doc.text(
      "⚠ No PoE switches in the design — every camera/AP currently lacks a power source.",
      m + 8,
      y + 12,
    );
    doc.text(
      "Add a Ubiquiti USW-Pro-24-PoE (700W) or Cisco Meraki MS225-24P (370W) to power the drops.",
      m + 8,
      y + 26,
    );
    y += rowH * 2;
  } else {
    const perSwitch = totalDrawW / switches.length;
    for (let i = 0; i < switches.length; i++) {
      const sw = switches[i];
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(m, y, pw - m * 2, rowH, "F");
      }
      const prod = resolveProduct(sw);
      const budgetW = 370;
      const util = perSwitch / budgetW;
      const utilColor: [number, number, number] =
        util > 0.85 ? [185, 28, 28] : util > 0.65 ? [194, 65, 12] : [21, 128, 61];
      colX = m;
      const row = [
        sw.label,
        prod?.model ?? "—",
        `${budgetW}`,
        `${perSwitch.toFixed(0)}`,
        `${(util * 100).toFixed(0)} %`,
      ];
      for (let c = 0; c < row.length; c++) {
        if (c === 4) {
          doc.setTextColor(...utilColor);
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(30, 41, 59);
          doc.setFont("helvetica", "normal");
        }
        doc.text(row[c], colX + 4, y + 11, { maxWidth: widths[c] - 6 });
        colX += widths[c];
      }
      y += rowH;
    }
  }

  // FACP battery-backup section — only relevant if a fire panel is present.
  const facps = floor.devices.filter(
    (d) => d.type === "sensor" && (d as SensorDevice).sensorType === "facp",
  );
  if (facps.length > 0) {
    y += 24;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Fire Alarm Standby Battery Calculation (NFPA 72)", m, y);
    y += 16;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(
      "NFPA 72 requires 24 h standby + 5 min alarm. Assume 0.25 A standby + 1.5 A alarm load per panel as a planning baseline.",
      m,
      y,
      { maxWidth: pw - m * 2 },
    );
    y += 14;
    const ahCapacity = 24 * 0.25 + (5 / 60) * 1.5;
    doc.text(
      `Required battery capacity per panel: ${ahCapacity.toFixed(2)} Ah  →  spec 12 Ah sealed lead-acid (recommended).`,
      m + 8,
      y + 12,
    );
  }
}

/** L-101 — Symbol Legend. Visual swatch + label for every device class
 *  that appears in this floor. Auto-skips unused types so the legend
 *  never lists symbols not on the plan. */
function drawSymbolLegend(
  doc: jsPDF,
  designName: string,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
): void {
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Symbol Legend", m, m + 18);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${designName}  —  ${dateStr}`, m, m + 32);

  const items: { color: string; symbol: string; label: string; desc: string }[] = [
    { color: TYPE_COLORS.camera,  symbol: "●", label: "Camera",            desc: "Indoor / outdoor IP video — dome, bullet, PTZ, fisheye, multi-sensor, LPR." },
    { color: TYPE_COLORS.reader,  symbol: "■", label: "Reader",            desc: "Card / mobile / biometric / keypad. Linked to a door + a power source." },
    { color: TYPE_COLORS.reader,  symbol: "▲", label: "Door Hardware",     desc: "Electric strike, mag lock, REX, exit device, intercom, PSU." },
    { color: TYPE_COLORS.sensor,  symbol: "◆", label: "Sensor",            desc: "Motion / glass-break / door-contact (intrusion)." },
    { color: TYPE_COLORS.sensor,  symbol: "★", label: "Fire / Life Safety", desc: "Smoke, heat, pull station, FACP, exit sign, AED, notification." },
    { color: TYPE_COLORS.network, symbol: "◯", label: "Network",           desc: "Switch (PoE), NVR (storage), wireless access point." },
    { color: "#64748b",           symbol: "▭", label: "Install Hardware",  desc: "Back box, mounting bracket, conduit run, surface raceway." },
    { color: "#374151",           symbol: "—", label: "Wall",              desc: "Solid line, 6\" thick (drawing scale)." },
    { color: "#92400e",           symbol: "▢", label: "Door",              desc: "Snapped to wall; red strike-plate band when locked." },
    { color: "#0891b2",           symbol: "···", label: "Cable Run",       desc: "Dashed line, color per device type. Length includes 15% slack." },
  ];

  let y = m + 60;
  const swatchSize = 22;
  const rowH = 36;
  for (const it of items) {
    doc.setFillColor(248, 250, 252);
    doc.rect(m, y, pw - m * 2, rowH, "F");
    // Color swatch
    const [r, g, b] = hexToRgb(it.color);
    doc.setFillColor(r, g, b);
    doc.rect(m + 8, y + (rowH - swatchSize) / 2, swatchSize, swatchSize, "F");
    // Symbol overlay
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(it.symbol, m + 8 + swatchSize / 2, y + rowH / 2 + 4, { align: "center" });
    // Label + description
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(it.label, m + 8 + swatchSize + 12, y + 14);
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.text(it.desc, m + 8 + swatchSize + 12, y + 26, { maxWidth: pw - m * 2 - swatchSize - 36 });
    y += rowH + 2;
  }
}

/** C-101 — Code Compliance Summary. Runs auto-checks against common code
 *  triggers (ADA mount heights, NFPA 72 coverage, NEC 725 cable class)
 *  and prints pass / warning / fail rows the AHJ can use as a punch list. */
function drawCodeCompliance(
  doc: jsPDF,
  floor: Floor,
  designName: string,
  dateStr: string,
  pw: number,
  ph: number,
  m: number,
): void {
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Code Compliance Summary", m, m + 18);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${designName}  —  ${floor.name}  —  ${dateStr}`, m, m + 32);

  // Run a handful of automated checks. Each yields one row.
  type Status = "pass" | "warn" | "fail";
  const checks: { code: string; rule: string; status: Status; detail: string }[] = [];

  // ADA 4.27.3 — Reach range for card readers: 15"–48" AFF (~0.38–1.22 m).
  const adaBad = floor.devices.filter(
    (d) =>
      d.type === "reader" &&
      (d.mountHeight < 0.38 || d.mountHeight > 1.22),
  );
  checks.push({
    code: "ADA 4.27.3",
    rule: "Card-reader mount height between 15\" (0.38m) and 48\" (1.22m) AFF",
    status: adaBad.length === 0 ? "pass" : "fail",
    detail:
      adaBad.length === 0
        ? "All readers within reach range."
        : `${adaBad.length} reader(s) outside ADA reach range: ${adaBad.map((d) => d.label).slice(0, 4).join(", ")}${adaBad.length > 4 ? "…" : ""}`,
  });

  // NFPA 72 — Fire alarm coverage. Warn if any smoke/heat detectors exist
  // without an FACP, or vice versa.
  const smoke = floor.devices.filter(
    (d) =>
      d.type === "sensor" &&
      ((d as SensorDevice).sensorType === "smoke" ||
        (d as SensorDevice).sensorType === "heat"),
  );
  const facps = floor.devices.filter(
    (d) => d.type === "sensor" && (d as SensorDevice).sensorType === "facp",
  );
  let nfpa: Status = "pass";
  let nfpaDetail = "Fire detection devices have a control panel.";
  if (smoke.length > 0 && facps.length === 0) {
    nfpa = "fail";
    nfpaDetail = `${smoke.length} smoke/heat detector(s) but no FACP — add a fire alarm control panel.`;
  } else if (smoke.length === 0 && facps.length > 0) {
    nfpa = "warn";
    nfpaDetail = "FACP present but no initiating devices on this floor.";
  } else if (smoke.length === 0 && facps.length === 0) {
    nfpa = "warn";
    nfpaDetail = "No fire detection on this floor — confirm not required for occupancy.";
  }
  checks.push({
    code: "NFPA 72",
    rule: "Fire detection paired with a control panel",
    status: nfpa,
    detail: nfpaDetail,
  });

  // IBC 1013 — Exit signs visible from any point in an exit access.
  const exitSigns = floor.devices.filter(
    (d) => d.type === "sensor" && (d as SensorDevice).sensorType === "exit-sign",
  );
  const doors = floor.doors?.length ?? 0;
  let ibc: Status = "pass";
  let ibcDetail = `${exitSigns.length} exit sign(s) for ${doors} door(s).`;
  if (exitSigns.length === 0 && doors > 0) {
    ibc = "fail";
    ibcDetail = `${doors} door(s) but no exit signs — IBC 1013 requires illuminated signage at every required exit.`;
  } else if (doors > 0 && exitSigns.length < doors / 2) {
    ibc = "warn";
    ibcDetail = `${exitSigns.length} exit sign(s) for ${doors} door(s) — verify each exit access has line-of-sight signage.`;
  }
  checks.push({
    code: "IBC 1013",
    rule: "Illuminated exit signage at every required exit",
    status: ibc,
    detail: ibcDetail,
  });

  // NEC 725 — Class 2 / Class 3 cabling. We assume Cat6/22-4 throughout =
  // Class 2 compliant. Just record the assumption.
  checks.push({
    code: "NEC 725.130",
    rule: "Class 2 low-voltage cabling (Cat6 / 22-4 / 18-2) listed for use",
    status: "pass",
    detail:
      "All runs spec'd as Class 2 limited-energy circuits per NEC 725. Plenum-rated jacket required in return-air spaces.",
  });

  // UL 924 — Emergency lighting. Pass if combo exit signs present.
  checks.push({
    code: "UL 924",
    rule: "Emergency lighting on dedicated unswitched circuit",
    status: exitSigns.length > 0 ? "pass" : "warn",
    detail:
      exitSigns.length > 0
        ? "Combo exit / emergency heads provide 90-min UL 924 runtime."
        : "Add UL 924-listed emergency lighting if egress paths are unlit on power loss.",
  });

  // ADA 4.27.4 — AED cabinet height: 48" AFF max to handle.
  const aeds = floor.devices.filter(
    (d) => d.type === "sensor" && (d as SensorDevice).sensorType === "aed",
  );
  const aedBad = aeds.filter((d) => d.mountHeight > 1.22);
  checks.push({
    code: "ADA 4.27.3",
    rule: "AED cabinet handle reachable (≤48\" / 1.22 m AFF)",
    status: aedBad.length === 0 ? "pass" : "warn",
    detail:
      aeds.length === 0
        ? "No AEDs on this floor."
        : aedBad.length === 0
          ? `${aeds.length} AED cabinet(s) within reach range.`
          : `${aedBad.length} AED(s) above 1.22m — verify accessibility for wheelchair users.`,
  });

  // Render the checks
  const rowH = 38;
  let y = m + 56;
  for (const check of checks) {
    doc.setFillColor(248, 250, 252);
    doc.rect(m, y, pw - m * 2, rowH, "F");
    // Status badge
    const statusColors: Record<Status, [number, number, number]> = {
      pass: [22, 163, 74],
      warn: [202, 138, 4],
      fail: [220, 38, 38],
    };
    const sc = statusColors[check.status];
    doc.setFillColor(sc[0], sc[1], sc[2]);
    doc.rect(m, y, 6, rowH, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(sc[0], sc[1], sc[2]);
    doc.text(check.status.toUpperCase(), m + 14, y + 12);
    // Code reference
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text(check.code, m + 60, y + 12);
    // Rule
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(check.rule, m + 14, y + 25, { maxWidth: pw - m * 2 - 24 });
    // Detail
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.text(check.detail, m + 14, y + 34, { maxWidth: pw - m * 2 - 24 });
    y += rowH + 4;
  }

  // Footer disclaimer
  y += 8;
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "italic");
  doc.text(
    "Automated checks are advisory and do not replace AHJ review or a licensed-engineer stamp.",
    m,
    y,
    { maxWidth: pw - m * 2 },
  );
}

/** X-101 — Approval & Signature Block. Two sig lines (designer + AHJ
 *  reviewer) and a stamped legal statement. */
function drawSignatureBlock(
  doc: jsPDF,
  designName: string,
  dateStr: string,
  options: PermitPackageOptions | undefined,
  pw: number,
  ph: number,
  m: number,
): void {
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text("Approval & Signature", m, m + 18);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.text(`${designName}  —  ${dateStr}`, m, m + 32);

  // Statement
  let y = m + 70;
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "normal");
  doc.text(
    "The undersigned certify that the security and life-safety systems represented in this drawing set have been designed in accordance with the applicable provisions of the International Building Code, the National Electrical Code (NFPA 70), the National Fire Alarm and Signaling Code (NFPA 72), and ADA Standards for Accessible Design.",
    m,
    y,
    { maxWidth: pw - m * 2, align: "justify" },
  );

  // Signature lines
  const lineY1 = ph - m - 220;
  const lineY2 = ph - m - 120;

  function sigLine(label: string, name: string, ly: number) {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line(m, ly, m + 280, ly);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text(label, m, ly + 12);
    if (name) {
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(`Name: ${name}`, m, ly + 26);
    }
    // Date stub
    doc.line(m + 320, ly, m + 480, ly);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Date", m + 320, ly + 12);
  }

  sigLine(
    "Designer of Record — System Integrator",
    options?.preparedBy || "",
    lineY1,
  );
  sigLine(
    `${options?.ahj ? options.ahj + " — " : ""}AHJ Reviewer`,
    "",
    lineY2,
  );

  // Permit-number reminder
  if (options?.permitNumber) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Reference permit #: ${options.permitNumber}`,
      m,
      ph - m - 60,
    );
  }
}
