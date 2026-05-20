"use client";

import { Circle, Group, Line, Rect, Text, Wedge } from "react-konva";
import type Konva from "konva";
import type { Device } from "@/types/design";
import type { KonvaEventObject } from "konva/lib/Node";

interface DeviceShapeProps {
  device: Device;
  scalePxPerMeter: number;
  selected: boolean;
  showCoverage: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onRotate: (radians: number) => void;
}

const COLORS = {
  camera: "#34d399",
  reader: "#38bdf8",
  sensor: "#fbbf24",
  network: "#a78bfa",
} as const;

export function DeviceShape({
  device,
  scalePxPerMeter,
  selected,
  showCoverage,
  onSelect,
  onMove,
  onRotate,
}: DeviceShapeProps) {
  const color = COLORS[device.type];
  const { x, y } = device.position;
  const rotation = device.rotation;

  function handleDragEnd(e: KonvaEventObject<DragEvent>) {
    onMove(e.target.x(), e.target.y());
  }

  return (
    <Group
      x={x}
      y={y}
      draggable
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
      {showCoverage && device.type === "camera" && (
        <Wedge
          x={0}
          y={0}
          radius={device.rangeMeters * scalePxPerMeter}
          angle={device.fovDegrees}
          rotation={(rotation * 180) / Math.PI - device.fovDegrees / 2}
          fill={color}
          opacity={selected ? 0.22 : 0.13}
          listening={false}
        />
      )}

      {showCoverage && device.type === "sensor" && (
        <Circle
          x={0}
          y={0}
          radius={device.rangeMeters * scalePxPerMeter}
          stroke={color}
          strokeWidth={1.5}
          dash={[6, 4]}
          opacity={selected ? 0.55 : 0.32}
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

      {selected && (
        <Circle
          x={0}
          y={0}
          radius={20}
          stroke={color}
          strokeWidth={2}
          opacity={0.85}
          listening={false}
        />
      )}

      {/* Body */}
      <Circle x={0} y={0} radius={12} fill="#0f0f10" stroke={color} strokeWidth={1.5} />

      {/* Direction indicator */}
      <Line
        points={[0, 0, Math.cos(rotation) * 16, Math.sin(rotation) * 16]}
        stroke={color}
        strokeWidth={2}
        lineCap="round"
        listening={false}
      />

      {/* Icon glyph - simple shape per type */}
      <DeviceGlyph type={device.type} color={color} />

      {/* Label */}
      <Group y={20}>
        <Rect
          x={-Math.max(36, device.label.length * 4.5)}
          y={0}
          width={Math.max(72, device.label.length * 9)}
          height={18}
          offsetX={0}
          cornerRadius={9}
          fill="#1a1a1c"
          stroke="#27272a"
          strokeWidth={0.5}
          opacity={0.95}
          listening={false}
        />
        <Text
          text={device.label}
          fontSize={11}
          fontFamily="Inter, system-ui, sans-serif"
          fill="#e5e7eb"
          align="center"
          width={Math.max(72, device.label.length * 9)}
          x={-Math.max(36, device.label.length * 4.5)}
          y={3}
          listening={false}
        />
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

function DeviceGlyph({
  type,
  color,
}: {
  type: Device["type"];
  color: string;
}) {
  if (type === "camera") {
    return (
      <Group listening={false}>
        <Rect x={-3} y={-3} width={6} height={6} cornerRadius={1} fill={color} />
      </Group>
    );
  }
  if (type === "reader") {
    return (
      <Group listening={false}>
        <Rect x={-3} y={-4} width={6} height={8} cornerRadius={1} fill={color} />
      </Group>
    );
  }
  if (type === "sensor") {
    return (
      <Group listening={false}>
        <Circle x={0} y={0} radius={3} fill={color} />
      </Group>
    );
  }
  return (
    <Group listening={false}>
      <Circle x={0} y={0} radius={3} fill={color} />
      <Circle x={0} y={0} radius={5} stroke={color} strokeWidth={1} />
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
