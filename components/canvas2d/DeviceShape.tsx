"use client";

import { Circle, Group, Line, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { Device, Wall } from "@/types/design";
import type { KonvaEventObject } from "konva/lib/Node";
import { clippedFovPolygon, snapToNearestWall } from "@/lib/geometry";

/**
 * Lighten a hex color by mixing toward white. Used to derive the highlight
 * stop of the radial gradient on a custom-colored marker so the body still
 * reads as a physical pin instead of a flat disk.
 */
function lightenHex(hex: string, amount: number): string {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

/**
 * Devices that physically mount on a wall — when dragged near one,
 * the device snaps perpendicular to it. Ceiling-only devices (e.g.
 * domes hanging in mid-room) get no snap.
 */
const WALL_MOUNTABLE: Record<Device["type"], boolean> = {
  camera: true,
  reader: true,
  sensor: true,
  network: false, // APs ceiling-mounted, switches/NVRs rack-mounted
};

interface DeviceShapeProps {
  device: Device;
  scalePxPerMeter: number;
  selected: boolean;
  showCoverage: boolean;
  walls: Wall[];
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onRotate: (radians: number) => void;
}

/**
 * Per-type palette. `base` is the body color; `light` is the top-highlight
 * stop used in the marker's radial gradient so the disk reads as a physical
 * pin instead of a flat circle.
 */
const COLORS = {
  camera: { base: "#3b82f6", light: "#bfdbfe" }, // blue-500 → blue-200
  reader: { base: "#0ea5e9", light: "#bae6fd" }, // sky-500 → sky-200
  sensor: { base: "#f59e0b", light: "#fde68a" }, // amber-500 → amber-200
  network: { base: "#a78bfa", light: "#ddd6fe" }, // violet-400 → violet-200
} as const;

/** Distinct colors for each lens in a multi-sensor camera */
const MULTI_SENSOR_COLORS = [
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#f97316", // orange
  "#e879f9", // pink
  "#facc15", // yellow
  "#10b981", // emerald
] as const;

export function DeviceShape({
  device,
  scalePxPerMeter,
  selected,
  showCoverage,
  walls,
  onSelect,
  onMove,
  onRotate,
}: DeviceShapeProps) {
  const palette = COLORS[device.type];
  // Per-element override → marker color + 3D-feel gradient + arrow + halo.
  const color = device.customColor ?? palette.base;
  const lightColor = device.customColor
    ? lightenHex(device.customColor, 0.6)
    : palette.light;
  // Type-default coverage opacities (cameras read at 0.09 idle; sensors at
  // 0.25 because their ring stroke needs more body). User can override per
  // device via the properties panel.
  const defaultCameraOpacity = 0.09;
  const defaultSensorOpacity = 0.25;
  const cameraIdleOpacity = device.customOpacity ?? defaultCameraOpacity;
  const cameraSelectedOpacity = Math.min(1, cameraIdleOpacity * 1.8);
  const sensorIdleOpacity = device.customOpacity ?? defaultSensorOpacity;
  const sensorSelectedOpacity = Math.min(1, sensorIdleOpacity * 1.8);
  // Lifecycle stage drives a subtle opacity treatment so an installed
  // floor reads at full strength and proposed/retired devices look like
  // overlays. (Filtering happens upstream in Canvas2DStage via visibility.)
  const status = device.installStatus ?? "proposed";
  const groupOpacity =
    status === "decommissioned" ? 0.35 : status === "proposed" ? 0.78 : 1;
  const { x, y } = device.position;
  const rotation = device.rotation;
  const canSnap = WALL_MOUNTABLE[device.type] && walls.length > 0;
  // Snap threshold: ~0.7 m in design pixels. Walls within this distance
  // capture the cursor; anywhere else the device drags freely.
  const snapThresholdPx = Math.max(28, scalePxPerMeter * 0.7);
  const snapOffsetPx = Math.max(8, scalePxPerMeter * 0.18);

  function handleDragEnd(e: KonvaEventObject<DragEvent>) {
    const finalX = e.target.x();
    const finalY = e.target.y();
    if (canSnap) {
      const snap = snapToNearestWall(
        { x: finalX, y: finalY },
        walls,
        snapThresholdPx,
        snapOffsetPx,
      );
      if (snap) {
        // Position is already snapped via dragBoundFunc; just lock rotation.
        onMove(snap.position.x, snap.position.y);
        onRotate(snap.rotation);
        return;
      }
    }
    onMove(finalX, finalY);
  }

  return (
    <Group
      x={x}
      y={y}
      opacity={groupOpacity}
      draggable
      dragBoundFunc={
        canSnap
          ? (pos) => {
              const snap = snapToNearestWall(
                pos,
                walls,
                snapThresholdPx,
                snapOffsetPx,
              );
              return snap ? snap.position : pos;
            }
          : undefined
      }
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDragEnd={handleDragEnd}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "grab";
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "default";
      }}
    >
      {showCoverage && device.type === "camera" && device.lenses && device.lenses.length > 0
        ? device.lenses.map((lens, i) => (
            <Line
              key={lens.id}
              // Wall-clipped polygon — the FOV stops at the first wall it
              // hits, so cameras don't appear to "see through" walls.
              // For 360° lenses (rare on multi-sensor), the clipped path
              // becomes a full disc with the apex coincident; that still
              // renders correctly via Konva's even-odd fill.
              points={clippedFovPolygon({
                origin: { x, y },
                rotation: rotation + lens.rotationOffset,
                fovDegrees: lens.fovDegrees,
                rangeMeters: lens.rangeMeters,
                scalePxPerMeter,
                walls,
                // Bump arc resolution for ≥180° lenses so a half-disc
                // doesn't look polygonal.
                segments: lens.fovDegrees >= 180 ? 48 : 32,
              })}
              closed
              fill={MULTI_SENSOR_COLORS[i % MULTI_SENSOR_COLORS.length]}
              opacity={selected ? cameraSelectedOpacity : cameraIdleOpacity}
              listening={false}
            />
          ))
        : showCoverage && device.type === "camera" && (
        // True 360° cameras (panoramic / fisheye with full coverage):
        // render as a clean circle so the visual reads as "sees in every
        // direction" instead of relying on the clipped-polygon kludge.
        device.fovDegrees >= 359 ? (
          <Circle
            x={0}
            y={0}
            radius={device.rangeMeters * scalePxPerMeter}
            fill={color}
            opacity={selected ? cameraSelectedOpacity : cameraIdleOpacity}
            listening={false}
          />
        ) : (
          <Line
            // Wall-clipped polygon — single-lens FOV cone stops at walls.
            points={clippedFovPolygon({
              origin: { x, y },
              rotation,
              fovDegrees: device.fovDegrees,
              rangeMeters: device.rangeMeters,
              scalePxPerMeter,
              walls,
              segments: device.fovDegrees >= 180 ? 48 : 32,
            })}
            closed
            fill={color}
            opacity={selected ? cameraSelectedOpacity : cameraIdleOpacity}
            listening={false}
          />
        )
      )}

      {showCoverage && device.type === "sensor" && (
        <Circle
          x={0}
          y={0}
          radius={device.rangeMeters * scalePxPerMeter}
          stroke={color}
          strokeWidth={1.2}
          dash={[5, 4]}
          opacity={selected ? sensorSelectedOpacity : sensorIdleOpacity}
          listening={false}
        />
      )}

      {showCoverage &&
        device.type === "network" &&
        device.networkType === "access-point" && (
          <Circle
            x={0}
            y={0}
            radius={(device.coverageMeters ?? 15) * scalePxPerMeter}
            fillRadialGradientStartPoint={{ x: 0, y: 0 }}
            fillRadialGradientEndPoint={{ x: 0, y: 0 }}
            fillRadialGradientStartRadius={0}
            fillRadialGradientEndRadius={
              (device.coverageMeters ?? 15) * scalePxPerMeter
            }
            fillRadialGradientColorStops={[0, `${color}55`, 1, `${color}00`]}
            listening={false}
          />
        )}

      {/* Soft outer halo on selection */}
      {selected && (
        <Circle
          x={0}
          y={0}
          radius={18}
          fill={color}
          opacity={0.12}
          listening={false}
        />
      )}
      {selected && (
        <Circle
          x={0}
          y={0}
          radius={16}
          stroke={color}
          strokeWidth={1.5}
          opacity={0.7}
          listening={false}
        />
      )}

      {/* Soft drop shadow — gives the marker physical weight on the canvas */}
      <Circle
        x={0}
        y={2.5}
        radius={11}
        fill="#0f172a"
        opacity={0.22}
        listening={false}
      />
      {/* Direction indicator — filled arrowhead pointing along rotation.
          Drawn UNDER the white ring so the body looks like it's sitting on
          top of an arrow. */}
      <Line
        points={[
          Math.cos(rotation) * 16,
          Math.sin(rotation) * 16,
          Math.cos(rotation + 0.42) * 9.5,
          Math.sin(rotation + 0.42) * 9.5,
          Math.cos(rotation - 0.42) * 9.5,
          Math.sin(rotation - 0.42) * 9.5,
        ]}
        closed={true}
        fill={color}
        listening={false}
      />
      {/* Outer white ring — separates marker from any background */}
      <Circle
        x={0}
        y={0}
        radius={11}
        fill="#ffffff"
        opacity={0.98}
        listening={false}
      />
      {/* Body — radial gradient from a top-left highlight to base color, so
          the disk reads as a physical pin rather than a flat dot. */}
      <Circle
        x={0}
        y={0}
        radius={9.5}
        fillRadialGradientStartPoint={{ x: -1.5, y: -3 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 1 }}
        fillRadialGradientEndRadius={9.5}
        fillRadialGradientColorStops={[0, lightColor, 1, color]}
        listening={false}
      />
      {/* Subtle top highlight — small white blur ~north-west */}
      <Circle
        x={-1}
        y={-3}
        radius={2.8}
        fill="#ffffff"
        opacity={0.32}
        listening={false}
      />

      {/* Icon glyph - simple shape per type, now on colored body */}
      <DeviceGlyph type={device.type} />

      {/* Label — refined, smaller, more elegant */}
      <Group y={16}>
        {(() => {
          const padding = 7;
          const charWidth = 5.4;
          const textWidth = device.label.length * charWidth;
          const w = Math.max(40, textWidth + padding * 2);
          return (
            <>
              <Rect
                x={-w / 2}
                y={0}
                width={w}
                height={15}
                cornerRadius={4}
                fill="#1c1d20"
                opacity={0.92}
                listening={false}
              />
              <Text
                text={device.label}
                fontSize={9.5}
                fontStyle="500"
                fontFamily="Inter, system-ui, sans-serif"
                fill="#f4f4f5"
                align="center"
                width={w}
                x={-w / 2}
                y={3}
                letterSpacing={-0.1}
                listening={false}
              />
            </>
          );
        })()}
      </Group>

      {selected && (
        <RotationHandle
          rotation={rotation}
          onRotate={onRotate}
          color={color}
        />
      )}
    </Group>
  );
}

function DeviceGlyph({ type }: { type: Device["type"] }) {
  const fg = "#ffffff";
  if (type === "camera") {
    // Tiny lens dot at center
    return (
      <Group listening={false}>
        <Circle x={0} y={0} radius={2.4} fill={fg} opacity={0.95} />
        <Circle x={0} y={0} radius={1.1} fill="#1c1d20" />
      </Group>
    );
  }
  if (type === "reader") {
    // Card-shape inside
    return (
      <Group listening={false}>
        <Rect x={-2} y={-3} width={4} height={6} cornerRadius={0.8} fill={fg} opacity={0.95} />
      </Group>
    );
  }
  if (type === "sensor") {
    // Concentric pulse rings
    return (
      <Group listening={false}>
        <Circle x={0} y={0} radius={3.6} stroke={fg} strokeWidth={1} opacity={0.85} />
        <Circle x={0} y={0} radius={1.5} fill={fg} />
      </Group>
    );
  }
  // network — wifi dot
  return (
    <Group listening={false}>
      <Circle x={0} y={0} radius={1.6} fill={fg} />
      <Circle x={0} y={0} radius={3.6} stroke={fg} strokeWidth={1} opacity={0.7} />
    </Group>
  );
}

function RotationHandle({
  rotation,
  onRotate,
  color,
}: {
  rotation: number;
  onRotate: (radians: number) => void;
  color: string;
}) {
  const handleRadius = 32;
  const hx = Math.cos(rotation) * handleRadius;
  const hy = Math.sin(rotation) * handleRadius;

  return (
    <Group
      x={hx}
      y={hy}
      draggable
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "ew-resize";
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "default";
      }}
      onDragMove={(e) => {
        const node = e.target as Konva.Group;
        const px = node.x();
        const py = node.y();
        const newRotation = Math.atan2(py, px);
        node.position({
          x: Math.cos(newRotation) * handleRadius,
          y: Math.sin(newRotation) * handleRadius,
        });
        onRotate(newRotation);
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
      }}
      onClick={(e) => {
        e.cancelBubble = true;
      }}
    >
      <Line
        points={[-hx, -hy, 0, 0]}
        stroke={color}
        strokeWidth={1}
        opacity={0.5}
        dash={[3, 3]}
        listening={false}
      />
      <Circle radius={6} fill="#0f0f10" stroke={color} strokeWidth={1.5} />
      <Circle radius={2} fill={color} />
    </Group>
  );
}
