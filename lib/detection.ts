import type { CameraDevice, SensorDevice, Vec2, Wall } from "@/types/design";
import { distance, pointNearSegment, pointToSegment } from "./geometry";

/**
 * Push a point out of every wall it's penetrating (in floor-plan pixel
 * space). `radiusPx` is the actor's circular collider radius in pixels.
 * Runs two passes so corner cases — being inside two walls at once — settle.
 */
export function collideAgainstWalls(
  pos: Vec2,
  walls: Wall[],
  radiusPx: number
): Vec2 {
  let x = pos.x;
  let y = pos.y;
  for (let pass = 0; pass < 2; pass++) {
    for (const w of walls) {
      const r = pointToSegment(x, y, w.start.x, w.start.y, w.end.x, w.end.y);
      if (r.dist < radiusPx) {
        const push = radiusPx - r.dist + 0.5;
        x += r.nx * push;
        y += r.nz * push;
      }
    }
  }
  return { x, y };
}

/**
 * Returns true if the line segment from a to b is clear of every wall.
 * Walls are treated as line segments. Uses standard 2D segment-segment
 * intersection.
 */
export function lineOfSight(a: Vec2, b: Vec2, walls: Wall[]): boolean {
  for (const wall of walls) {
    if (segmentsIntersect(a, b, wall.start, wall.end)) return false;
  }
  return true;
}

function segmentsIntersect(p: Vec2, p2: Vec2, q: Vec2, q2: Vec2): boolean {
  const r = { x: p2.x - p.x, y: p2.y - p.y };
  const s = { x: q2.x - q.x, y: q2.y - q.y };
  const denom = r.x * s.y - r.y * s.x;
  if (denom === 0) return false; // parallel
  const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / denom;
  const u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / denom;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

export interface DetectionInput {
  cameras: CameraDevice[];
  sensors: SensorDevice[];
  walls: Wall[];
  actorPosition: Vec2;
  scalePxPerMeter: number;
}

export interface DetectionResult {
  /** ids of cameras currently seeing the actor */
  detectingCameras: Set<string>;
  /** ids of sensors currently triggered */
  triggeredSensors: Set<string>;
}

export function computeDetection({
  cameras,
  sensors,
  walls,
  actorPosition,
  scalePxPerMeter,
}: DetectionInput): DetectionResult {
  const detectingCameras = new Set<string>();
  const triggeredSensors = new Set<string>();

  for (const cam of cameras) {
    const dxPx = actorPosition.x - cam.position.x;
    const dyPx = actorPosition.y - cam.position.y;
    const toActorLen = Math.hypot(dxPx, dyPx);

    // For multi-sensor cameras, check each lens independently
    if (cam.lenses && cam.lenses.length > 0) {
      let anyLensDetects = false;
      for (const lens of cam.lenses) {
        const distM = toActorLen / scalePxPerMeter;
        if (distM > lens.rangeMeters) continue;

        const lensRotation = cam.rotation + lens.rotationOffset;
        const lensDir = { x: Math.cos(lensRotation), y: Math.sin(lensRotation) };
        if (toActorLen === 0) { anyLensDetects = true; break; }
        const cosAngle = (lensDir.x * dxPx + lensDir.y * dyPx) / toActorLen;
        const halfFov = (lens.fovDegrees / 2) * (Math.PI / 180);
        if (cosAngle < Math.cos(halfFov)) continue;

        if (!lineOfSight(cam.position, actorPosition, walls)) continue;
        anyLensDetects = true;
        break;
      }
      if (anyLensDetects) detectingCameras.add(cam.id);
      continue;
    }

    // Single-lens camera (original logic)
    const distM = toActorLen / scalePxPerMeter;
    if (distM > cam.rangeMeters) continue;

    const camDir = { x: Math.cos(cam.rotation), y: Math.sin(cam.rotation) };
    if (toActorLen === 0) {
      detectingCameras.add(cam.id);
      continue;
    }
    const cosAngle = (camDir.x * dxPx + camDir.y * dyPx) / toActorLen;
    const halfFov = (cam.fovDegrees / 2) * (Math.PI / 180);
    if (cosAngle < Math.cos(halfFov)) continue;

    // Vertical check — only enforced when the camera has an explicit tilt
    // set, so the default (level) behavior is unchanged. Compares the
    // camera's pitch direction against the angle to the actor's center
    // (chest height ~0.85m above floor); a tilt that aims the camera
    // away from that angle by more than its vertical half-FOV misses.
    const tilt = cam.tilt;
    if (tilt != null && tilt !== 0) {
      const ACTOR_BODY_Y = 0.85;
      const verticalDrop = cam.mountHeight - ACTOR_BODY_Y;
      // Angle BELOW horizontal at which the actor sits, from camera POV.
      // distM > 0 here because we'd have hit the toActorLen===0 case above.
      const angleToActor = Math.atan2(verticalDrop, distM);
      // Surveillance cameras typically have a wide vertical FOV — use a
      // generous floor so narrow-lens (PTZ) cameras don't accidentally
      // become impossibly picky just because they have low fovDegrees.
      const halfVerticalFov = Math.max(halfFov, (25 * Math.PI) / 180);
      if (Math.abs(angleToActor - tilt) > halfVerticalFov) continue;
    }

    if (!lineOfSight(cam.position, actorPosition, walls)) continue;
    detectingCameras.add(cam.id);
  }

  for (const sensor of sensors) {
    const distM =
      distance(sensor.position, actorPosition) / scalePxPerMeter;
    if (distM > sensor.rangeMeters) continue;
    // Glass-break ignores walls; motion sensors are blocked by them.
    if (
      sensor.sensorType !== "glass-break" &&
      !lineOfSight(sensor.position, actorPosition, walls)
    ) {
      continue;
    }
    triggeredSensors.add(sensor.id);
  }

  return { detectingCameras, triggeredSensors };
}

/**
 * Walk along a sequence of waypoints at a constant speed (in meters per
 * second). t is sim time in seconds; returns the actor's position in
 * floor-plan pixel space along with the index of the leg they're on.
 */
export function positionOnPath(
  path: Vec2[],
  t: number,
  speedMs: number,
  scalePxPerMeter: number,
): { position: Vec2; legIndex: number; doneAt: number } {
  if (path.length === 0) return { position: { x: 0, y: 0 }, legIndex: 0, doneAt: 0 };
  if (path.length === 1)
    return { position: path[0], legIndex: 0, doneAt: 0 };

  let elapsed = 0;
  const totalDistanceM =
    pathLengthPx(path) / scalePxPerMeter;
  const doneAt = totalDistanceM / speedMs;

  for (let i = 0; i < path.length - 1; i++) {
    const segDistM =
      Math.hypot(
        path[i + 1].x - path[i].x,
        path[i + 1].y - path[i].y
      ) / scalePxPerMeter;
    const segTime = segDistM / speedMs;
    if (t <= elapsed + segTime) {
      const segT = (t - elapsed) / Math.max(segTime, 1e-9);
      const clamped = Math.max(0, Math.min(1, segT));
      return {
        position: {
          x: path[i].x + (path[i + 1].x - path[i].x) * clamped,
          y: path[i].y + (path[i + 1].y - path[i].y) * clamped,
        },
        legIndex: i,
        doneAt,
      };
    }
    elapsed += segTime;
  }

  // Beyond the path — clamp to the last waypoint
  return {
    position: path[path.length - 1],
    legIndex: path.length - 2,
    doneAt,
  };
}

function pathLengthPx(path: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += Math.hypot(
      path[i + 1].x - path[i].x,
      path[i + 1].y - path[i].y
    );
  }
  return total;
}

// Re-export geometry helpers callers might want from this module
export { pointNearSegment };
