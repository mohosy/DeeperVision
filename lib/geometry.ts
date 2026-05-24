import type { Vec2 } from "@/types/design";

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

export function angle(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function rad2deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface ScreenToDesignArgs {
  client: Vec2;
  containerRect: { left: number; top: number };
  transform: { scale: number; offset: Vec2 };
}

export function screenToDesign({
  client,
  containerRect,
  transform,
}: ScreenToDesignArgs): Vec2 {
  return {
    x: (client.x - containerRect.left - transform.offset.x) / transform.scale,
    y: (client.y - containerRect.top - transform.offset.y) / transform.scale,
  };
}

export function designToScreen(
  point: Vec2,
  transform: { scale: number; offset: Vec2 }
): Vec2 {
  return {
    x: point.x * transform.scale + transform.offset.x,
    y: point.y * transform.scale + transform.offset.y,
  };
}

/**
 * For a wall segment defined by (start, end), return whether a point is within
 * `thickness` of the segment in design pixels. Used for clicking near walls
 * and for raycast hit-tests later.
 */
export function pointNearSegment(
  point: Vec2,
  start: Vec2,
  end: Vec2,
  thickness: number
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(point, start) <= thickness;
  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2,
    0,
    1
  );
  const closest = { x: start.x + t * dx, y: start.y + t * dy };
  return distance(point, closest) <= thickness;
}

export function normalizeAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r;
}

export function shortestAngleDelta(from: number, to: number): number {
  const diff = (to - from + Math.PI) % (Math.PI * 2);
  return diff - Math.PI;
}

/**
 * Distance from point (px, pz) to the line segment (ax,az)-(bx,bz) in 2D,
 * along with the outward unit normal from the segment to the point. Used for
 * pushing a circular collider out of a wall.
 */
export function pointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { dist: number; nx: number; nz: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 0) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  }
  const cx = ax + t * dx;
  const cz = az + t * dz;
  const ox = px - cx;
  const oz = pz - cz;
  const d = Math.hypot(ox, oz);
  return {
    dist: d,
    nx: d > 0 ? ox / d : 1,
    nz: d > 0 ? oz / d : 0,
  };
}

/**
 * Intersect a ray (origin + t·dir, t ≥ 0) with a single line segment (a, b).
 * Returns the distance `t` along the ray to the hit, or `null` if the ray
 * misses the segment. `dir` should be a unit vector — the returned `t` is
 * a distance in the same units as `origin`.
 *
 * Standard 2D parametric solve of   P + t·D = A + s·(B − A)   for t ≥ 0
 * and s ∈ [0, 1].
 */
export function rayHitSegment(
  origin: Vec2,
  dir: Vec2,
  a: Vec2,
  b: Vec2,
): number | null {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denom = dir.x * sy - dir.y * sx;
  if (Math.abs(denom) < 1e-9) return null; // parallel / coincident
  const qx = a.x - origin.x;
  const qy = a.y - origin.y;
  const t = (qx * sy - qy * sx) / denom;
  const s = (qx * dir.y - qy * dir.x) / denom;
  if (t < 0 || s < 0 || s > 1) return null;
  return t;
}

/**
 * Build a closed-polygon FOV wedge for a camera that is clipped against a
 * set of walls. The polygon's apex is the camera position, and each arc
 * vertex is at the lesser of (range, distance to first wall hit) along
 * its angular direction.
 *
 * Returned points are RELATIVE to the camera origin, so they can be fed
 * straight into a Konva `<Line points={...} closed />` placed inside a
 * Group positioned at the device's coords.
 *
 * The result is a "shadow-cast" cone — exactly what you'd see if you
 * shone a flashlight from the camera, with the cone stopping at the
 * first wall it hits.
 */
export function clippedFovPolygon(opts: {
  /** Camera position in floor-plan pixel space. */
  origin: Vec2;
  /** Facing direction in radians (0 = +X, π/2 = +Y screen-south). */
  rotation: number;
  /** Horizontal FOV in degrees. */
  fovDegrees: number;
  /** Camera range in meters. */
  rangeMeters: number;
  /** Pixels-per-meter. */
  scalePxPerMeter: number;
  /** Walls in floor-plan pixel space. Anything ray-castable goes here. */
  walls: { start: Vec2; end: Vec2 }[];
  /** Angular resolution. 32 reads as a smooth cone at any sensible FOV. */
  segments?: number;
}): number[] {
  const {
    origin,
    rotation,
    fovDegrees,
    rangeMeters,
    scalePxPerMeter,
    walls,
    segments = 32,
  } = opts;
  const rangePx = rangeMeters * scalePxPerMeter;
  const halfFov = (fovDegrees / 2) * (Math.PI / 180);
  // Apex first, then segments+1 arc vertices.
  const pts: number[] = [0, 0];
  for (let i = 0; i <= segments; i++) {
    const a = rotation - halfFov + (2 * halfFov * i) / segments;
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    let hit = rangePx;
    for (const wall of walls) {
      const t = rayHitSegment(origin, dir, wall.start, wall.end);
      if (t !== null && t < hit) hit = t;
    }
    pts.push(dir.x * hit, dir.y * hit);
  }
  return pts;
}

/**
 * Signed-area of a polygon expressed as a flat point list
 * `[x0, y0, x1, y1, …]`, computed via the shoelace formula. Returns the
 * absolute area in the same squared units as the input coords (so
 * floor-plan pixels² unless you've scaled first). Returns 0 if fewer
 * than 3 vertices.
 *
 * Used by the AI route to compare a camera's *actual* wall-clipped
 * coverage against its nominal FOV cone area, so the agent can spot
 * cameras that are wasting most of their FOV behind a wall.
 */
export function polygonArea(points: number[]): number {
  const n = Math.floor(points.length / 2);
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x1 = points[i * 2];
    const y1 = points[i * 2 + 1];
    const j = (i + 1) % n;
    const x2 = points[j * 2];
    const y2 = points[j * 2 + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Snap a candidate point to the nearest wall if it's within `snapThresholdPx`.
 * Returns the snapped position (sitting on the wall, slightly offset along the
 * outward normal so the device renders next to — not on top of — the wall)
 * and a rotation in radians that points the device perpendicular to the wall,
 * facing into the room (along the outward normal).
 *
 * Returns null if no wall is within range.
 */
export function snapToNearestWall(
  point: { x: number; y: number },
  walls: { start: Vec2; end: Vec2 }[],
  snapThresholdPx: number,
  /** Distance off the wall the device should sit (in design pixels) */
  offsetPx = 6
): {
  position: Vec2;
  rotation: number;
  wallIndex: number;
  /** Projection point on the wall (for drawing a snap indicator) */
  contact: Vec2;
} | null {
  let best: {
    position: Vec2;
    rotation: number;
    wallIndex: number;
    contact: Vec2;
    dist: number;
  } | null = null;

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const dx = w.end.x - w.start.x;
    const dy = w.end.y - w.start.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - w.start.x) * dx + (point.y - w.start.y) * dy) / len2,
      ),
    );
    const cx = w.start.x + t * dx;
    const cy = w.start.y + t * dy;
    const ox = point.x - cx;
    const oy = point.y - cy;
    const d = Math.hypot(ox, oy);
    if (d > snapThresholdPx) continue;
    if (best && d >= best.dist) continue;

    // Outward normal from wall toward the dragged point (so the device sits on
    // the same side of the wall the user is dragging from).
    const nx = d > 0.001 ? ox / d : -dy / Math.sqrt(len2);
    const ny = d > 0.001 ? oy / d : dx / Math.sqrt(len2);

    best = {
      position: { x: cx + nx * offsetPx, y: cy + ny * offsetPx },
      rotation: Math.atan2(ny, nx),
      wallIndex: i,
      contact: { x: cx, y: cy },
      dist: d,
    };
  }

  return best;
}
