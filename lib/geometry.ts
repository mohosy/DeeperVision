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
