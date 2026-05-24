import type { Device, Floor } from "@/types/design";
import { distance } from "./geometry";

/**
 * Cabling estimator.
 *
 * Each "drop" device (camera, reader) needs a cable run to the nearest
 * "head-end" device (NVR for cameras; controller/switch for readers).
 * If no head-end exists, fall back to the floor's centroid as a generic
 * "IDF/MDF closet" stand-in so the user still gets a useful estimate.
 *
 * The path is L-shaped (Manhattan distance × scale) plus 15% slack for
 * service loops, conduit bends, and termination headroom — same rule of
 * thumb most low-voltage estimators use in the field. The result feeds
 * the Quote drawer's cabling subtotal in place of the old flat
 * `cablingPerCamera` / `cablingPerReader` rates when available.
 */

/** A 2D point in floor-plan pixel space — same coordinate system as walls and
 *  devices. Used to describe cable path geometry for rendering. */
export interface PointPx {
  x: number;
  y: number;
}

export interface CableRun {
  deviceId: string;
  /** What the cable terminates at — "nvr", "switch", or "centroid" (fallback). */
  headEnd: "nvr" | "switch" | "centroid";
  /** ID of the device the cable terminates at. `null` for centroid fallback. */
  headEndDeviceId: string | null;
  /** Real-world length in meters, including service-loop slack. */
  lengthM: number;
  /** Manhattan L-path in floor-plan pixels — `from` at the device, `bend`
   *  is the single corner of the L, `to` at the head-end. Renderers stroke
   *  the polyline from→bend→to. */
  fromPx: PointPx;
  bendPx: PointPx;
  toPx: PointPx;
}

export interface CablingSummary {
  runs: CableRun[];
  totalLengthM: number;
  cameraRuns: number;
  readerRuns: number;
  /** True when we substituted the floor centroid because no head-end exists. */
  fellBackToCentroid: boolean;
}

/** Multiplier applied to the raw Manhattan path length for real-world slack. */
const SLACK_MULTIPLIER = 1.15;

/**
 * Build a cable run plan for the floor. Cameras → nearest NVR (or switch),
 * readers → nearest controller (modeled as "switch"). If no head-end exists,
 * we fall back to the floor's bounding-box centroid as a generic IDF point.
 */
export function planCabling(floor: Floor): CablingSummary {
  const nvrs = floor.devices.filter(
    (d) => d.type === "network" && d.networkType === "nvr",
  );
  const switches = floor.devices.filter(
    (d) => d.type === "network" && d.networkType === "switch",
  );

  // Fallback centroid in floor-plan pixels — only used if no head-ends.
  let fellBackToCentroid = false;
  const centroid = computeFloorCentroid(floor);

  const runs: CableRun[] = [];
  let cameraRuns = 0;
  let readerRuns = 0;

  for (const dev of floor.devices) {
    if (dev.type !== "camera" && dev.type !== "reader" && !isAccessPoint(dev))
      continue;
    if ((dev.installStatus ?? "proposed") === "decommissioned") continue;

    // Cameras + APs prefer NVR/switch (network spine); readers prefer switch
    // (treated as a controller stand-in).
    const preferred: Device[] =
      dev.type === "camera"
        ? [...nvrs, ...switches]
        : isAccessPoint(dev)
          ? [...switches, ...nvrs]
          : [...switches, ...nvrs];

    let endPx: PointPx;
    let headEnd: CableRun["headEnd"];
    let headEndDeviceId: string | null;
    if (preferred.length > 0) {
      const nearest = nearestDevice(dev, preferred);
      endPx = nearest.position;
      headEnd =
        nearest.type === "network" && nearest.networkType === "nvr"
          ? "nvr"
          : "switch";
      headEndDeviceId = nearest.id;
    } else {
      endPx = centroid;
      headEnd = "centroid";
      headEndDeviceId = null;
      fellBackToCentroid = true;
    }

    const startPx: PointPx = { x: dev.position.x, y: dev.position.y };
    const bendPx = chooseBend(startPx, endPx, floor);
    const lengthPx = manhattanPx(startPx, endPx);
    const lengthM = (lengthPx / floor.scale) * SLACK_MULTIPLIER;

    runs.push({
      deviceId: dev.id,
      headEnd,
      headEndDeviceId,
      lengthM,
      fromPx: startPx,
      bendPx,
      toPx: endPx,
    });
    if (dev.type === "camera") cameraRuns++;
    else if (dev.type === "reader") readerRuns++;
    // APs aren't counted as either camera or reader runs — they're just
    // shown on the canvas. Quote labor math is unaffected.
  }

  const totalLengthM = runs.reduce((sum, r) => sum + r.lengthM, 0);

  return { runs, totalLengthM, cameraRuns, readerRuns, fellBackToCentroid };
}

/** Manhattan distance (|Δx| + |Δy|) in floor-plan pixels. */
function manhattanPx(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Pick the bend point for the L-shaped Manhattan path between `from` and
 * `to`. There are two candidates — bend at (to.x, from.y) or at (from.x,
 * to.y). Both have identical length; we deterministically pick the one
 * that travels horizontally first (so all cables fan out in the same
 * visual pattern). `floor` is unused for now but kept in the signature
 * so we can later prefer routes that hug walls. */
function chooseBend(from: PointPx, to: PointPx, _floor: Floor): PointPx {
  return { x: to.x, y: from.y };
}

function isAccessPoint(d: Device): boolean {
  return d.type === "network" && d.networkType === "access-point";
}

function nearestDevice(from: Device, candidates: Device[]): Device {
  let best = candidates[0];
  let bestDist = distance(from.position, best.position);
  for (const c of candidates.slice(1)) {
    const d = distance(from.position, c.position);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Auto-route waypoints from `src` to `tgt` so the cable hugs the wall
 * perimeter instead of cutting diagonally across rooms. Mimics how
 * real low-voltage installs run cables: up to the nearest wall, along
 * the ceiling/wall edge, around the perimeter to the target's wall,
 * down to the target.
 *
 * Returns an empty array if no walls — the cable degrades to a single
 * straight segment in that case.
 *
 * Strategy:
 *   1. Compute the wall bounding box (inset slightly so cables track
 *      JUST inside the perimeter, not on top of the walls).
 *   2. Project src + tgt onto their nearest perimeter edge.
 *   3. If both endpoints land on the same edge: 2 waypoints (project, project).
 *   4. If on different edges: 3 waypoints (srcProj → corner → tgtProj),
 *      picking the corner that doesn't backtrack.
 */
export function autoRouteCableWaypoints(
  src: { x: number; y: number },
  tgt: { x: number; y: number },
  walls: { start: { x: number; y: number }; end: { x: number; y: number } }[],
): { x: number; y: number }[] {
  // No walls — just an L-bend so the cable at least zigzags.
  if (walls.length === 0) {
    return [{ x: tgt.x, y: src.y }];
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  // Inset by ~0.6 m (30 px at the typical 50 px/m scale) so cables ride
  // just inside the walls — looks like ceiling cable tray rather than
  // running through the wall.
  const inset = 30;
  const innerMinX = minX + inset;
  const innerMaxX = maxX - inset;
  const innerMinY = minY + inset;
  const innerMaxY = maxY - inset;

  // Degenerate floors (single-room small space) — fall back to L-bend.
  if (innerMaxX <= innerMinX || innerMaxY <= innerMinY) {
    return [{ x: tgt.x, y: src.y }];
  }

  type Edge = "north" | "south" | "east" | "west";
  function nearestEdge(p: { x: number; y: number }): Edge {
    const dN = Math.abs(p.y - innerMinY);
    const dS = Math.abs(p.y - innerMaxY);
    const dE = Math.abs(p.x - innerMaxX);
    const dW = Math.abs(p.x - innerMinX);
    const m = Math.min(dN, dS, dE, dW);
    if (m === dN) return "north";
    if (m === dS) return "south";
    if (m === dE) return "east";
    return "west";
  }
  function project(p: { x: number; y: number }, edge: Edge): { x: number; y: number } {
    const x = Math.max(innerMinX, Math.min(innerMaxX, p.x));
    const y = Math.max(innerMinY, Math.min(innerMaxY, p.y));
    switch (edge) {
      case "north": return { x, y: innerMinY };
      case "south": return { x, y: innerMaxY };
      case "east":  return { x: innerMaxX, y };
      case "west":  return { x: innerMinX, y };
    }
  }

  const srcEdge = nearestEdge(src);
  const tgtEdge = nearestEdge(tgt);
  const srcProj = project(src, srcEdge);
  const tgtProj = project(tgt, tgtEdge);

  if (srcEdge === tgtEdge) {
    return [srcProj, tgtProj];
  }

  // Different edges — route via the corner between them.
  // For N/S edges, corner X comes from the other edge's projection.
  // For E/W edges, corner Y comes from the other edge's projection.
  const corner: { x: number; y: number } = {
    x:
      srcEdge === "north" || srcEdge === "south"
        ? tgtProj.x
        : srcProj.x,
    y:
      srcEdge === "north" || srcEdge === "south"
        ? srcProj.y
        : tgtProj.y,
  };
  return [srcProj, corner, tgtProj];
}

function computeFloorCentroid(floor: Floor): { x: number; y: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of floor.walls) {
    xs.push(w.start.x, w.end.x);
    ys.push(w.start.y, w.end.y);
  }
  if (xs.length === 0) return { x: 200, y: 200 };
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
