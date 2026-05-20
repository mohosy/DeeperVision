"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Image as KImage, Layer, Line, Stage, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { toast } from "sonner";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import type { DeviceType, Vec2 } from "@/types/design";
import { distance, screenToDesign } from "@/lib/geometry";
import { useImage } from "./useImage";
import { DeviceShape } from "./DeviceShape";

interface Canvas2DStageProps {
  width: number;
  height: number;
  onRequestUpload: () => void;
}

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5;
const WALL_HIT_RADIUS = 12;

export function Canvas2DStage({
  width,
  height,
  onRequestUpload,
}: Canvas2DStageProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const floor = useActiveFloor();
  const tool = useDesignStore((s) => s.tool);
  const setTool = useDesignStore((s) => s.setTool);
  const showCoverage = useDesignStore((s) => s.showCoverage);
  const selectedId = useDesignStore((s) => s.selectedDeviceId);
  const selectDevice = useDesignStore((s) => s.selectDevice);
  const addDevice = useDesignStore((s) => s.addDevice);
  const updateDevice = useDesignStore((s) => s.updateDevice);
  const removeDevice = useDesignStore((s) => s.removeDevice);
  const addWall = useDesignStore((s) => s.addWall);
  const updateFloor = useDesignStore((s) => s.updateFloor);
  const viewTransform = useDesignStore((s) => s.viewTransform);
  const setViewTransform = useDesignStore((s) => s.setViewTransform);

  const planImage = useImage(floor?.planImage ?? null);

  // Wall drawing transient state
  const [wallPoints, setWallPoints] = useState<Vec2[]>([]);
  const [pendingCursor, setPendingCursor] = useState<Vec2 | null>(null);

  // Calibration transient state
  const [calibrationPoints, setCalibrationPoints] = useState<Vec2[]>([]);
  const [pendingCalibration, setPendingCalibration] = useState<
    { a: Vec2; b: Vec2 } | null
  >(null);

  // Fit-on-load: when we load a floor or its image, center the content.
  useEffect(() => {
    if (!floor) return;
    if (viewTransform.scale === 1 && viewTransform.offset.x === 0 && viewTransform.offset.y === 0) {
      fitToContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor?.id, planImage]);

  function fitToContent() {
    if (!floor) return;
    let bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    if (planImage) {
      bounds = { minX: 0, minY: 0, maxX: planImage.naturalWidth, maxY: planImage.naturalHeight };
    } else if (floor.devices.length > 0 || floor.walls.length > 0) {
      const xs = [
        ...floor.devices.map((d) => d.position.x),
        ...floor.walls.flatMap((w) => [w.start.x, w.end.x]),
      ];
      const ys = [
        ...floor.devices.map((d) => d.position.y),
        ...floor.walls.flatMap((w) => [w.start.y, w.end.y]),
      ];
      if (xs.length) {
        bounds = {
          minX: Math.min(...xs) - 80,
          minY: Math.min(...ys) - 80,
          maxX: Math.max(...xs) + 80,
          maxY: Math.max(...ys) + 80,
        };
      }
    }
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;
    const scale = Math.min(
      width / Math.max(bw, 1),
      height / Math.max(bh, 1),
      1.5
    );
    setViewTransform({
      scale,
      offset: {
        x: width / 2 - (bounds.minX + bw / 2) * scale,
        y: height / 2 - (bounds.minY + bh / 2) * scale,
      },
    });
  }

  const getDesignPoint = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToDesign({
        client: { x: clientX, y: clientY },
        containerRect: rect,
        transform: viewTransform,
      });
    },
    [viewTransform]
  );

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const oldScale = viewTransform.scale;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - viewTransform.offset.x) / oldScale,
      y: (pointer.y - viewTransform.offset.y) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? 1 : -1;
    const factor = 1.1;
    const newScale = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, direction > 0 ? oldScale / factor : oldScale * factor)
    );
    setViewTransform({
      scale: newScale,
      offset: {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      },
    });
  }

  function onStageClick(e: KonvaEventObject<MouseEvent>) {
    if (e.target !== e.target.getStage()) return;
    const point = getDesignPoint(e.evt.clientX, e.evt.clientY);

    if (tool === "wall") {
      const next = [...wallPoints, point];
      setWallPoints(next);
      if (next.length >= 2 && floor) {
        const start = next[next.length - 2];
        const end = next[next.length - 1];
        addWall(floor.id, { start, end, height: 2.7 });
      }
      return;
    }

    if (tool === "calibrate") {
      const nextPoints = [...calibrationPoints, point];
      if (nextPoints.length === 2) {
        setCalibrationPoints([]);
        setPendingCalibration({ a: nextPoints[0], b: nextPoints[1] });
      } else {
        setCalibrationPoints(nextPoints);
      }
      return;
    }

    // Select tool: clicking background clears selection
    selectDevice(null);
  }

  function onStageMouseMove(e: KonvaEventObject<MouseEvent>) {
    if (tool === "wall" && wallPoints.length > 0) {
      const p = getDesignPoint(e.evt.clientX, e.evt.clientY);
      setPendingCursor(p);
    } else if (pendingCursor) {
      setPendingCursor(null);
    }
  }

  function onContainerDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!floor) return;
    const raw = e.dataTransfer.getData("application/x-dv-device");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { type: DeviceType };
      const point = getDesignPoint(e.clientX, e.clientY);
      addDevice(floor.id, payload.type, point);
    } catch {
      // ignore
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;

      if (e.key === "Escape") {
        if (tool !== "select") setTool("select");
        setWallPoints([]);
        setCalibrationPoints([]);
        selectDevice(null);
      } else if (e.key === "Enter" && tool === "wall") {
        setWallPoints([]);
        setTool("select");
      } else if (e.key === "v" || e.key === "V") {
        setTool("select");
      } else if (e.key === "w" || e.key === "W") {
        setTool("wall");
      } else if (e.key === "c" || e.key === "C") {
        setTool("calibrate");
        toast.message("Calibration", {
          description: "Click two points whose real distance you know.",
        });
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        if (floor) removeDevice(floor.id, selectedId);
      } else if (e.key === "f" || e.key === "F") {
        fitToContent();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId, floor?.id]);

  const scalePxPerMeter = floor?.scale ?? 50;

  const cursorStyle = useMemo(() => {
    if (tool === "wall" || tool === "calibrate") return "crosshair";
    return "default";
  }, [tool]);

  if (!floor) return null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-canvas bg-grid"
      style={{ cursor: cursorStyle }}
      onDrop={onContainerDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
    >
      {!planImage && floor.devices.length === 0 && floor.walls.length === 0 && (
        <FloorPlanEmptyState
          onUpload={onRequestUpload}
          onLoadDemo={() => {
            useDesignStore.getState().loadDemo();
            toast.success("Demo office loaded", {
              description:
                "Twelve walls, ten devices. Flip to 3D to see the building extrude.",
            });
          }}
        />
      )}

      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={viewTransform.scale}
        scaleY={viewTransform.scale}
        x={viewTransform.offset.x}
        y={viewTransform.offset.y}
        draggable={tool === "select"}
        onWheel={onWheel}
        onClick={onStageClick}
        onMouseMove={onStageMouseMove}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setViewTransform({
              scale: viewTransform.scale,
              offset: { x: e.target.x(), y: e.target.y() },
            });
          }
        }}
      >
        <Layer>
          {planImage && (
            <KImage
              image={planImage}
              x={0}
              y={0}
              opacity={0.85}
              listening={false}
            />
          )}

          {/* Walls */}
          {floor.walls.map((wall) => (
            <Line
              key={wall.id}
              points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
              stroke="#94a3b8"
              strokeWidth={3}
              lineCap="round"
              opacity={0.85}
              listening={false}
            />
          ))}

          {/* Wall drawing preview */}
          {tool === "wall" && wallPoints.length > 0 && pendingCursor && (
            <Line
              points={[
                wallPoints[wallPoints.length - 1].x,
                wallPoints[wallPoints.length - 1].y,
                pendingCursor.x,
                pendingCursor.y,
              ]}
              stroke="#34d399"
              strokeWidth={3}
              lineCap="round"
              dash={[6, 6]}
              opacity={0.7}
              listening={false}
            />
          )}

          {/* Calibration preview */}
          {tool === "calibrate" && calibrationPoints.length === 1 && (
            <Circle
              x={calibrationPoints[0].x}
              y={calibrationPoints[0].y}
              radius={6}
              fill="#34d399"
              listening={false}
            />
          )}

          {/* Devices */}
          {floor.devices.map((device) => (
            <DeviceShape
              key={device.id}
              device={device}
              scalePxPerMeter={scalePxPerMeter}
              selected={device.id === selectedId}
              showCoverage={showCoverage}
              onSelect={() => selectDevice(device.id)}
              onMove={(x, y) =>
                updateDevice(floor.id, device.id, { position: { x, y } })
              }
              onRotate={(r) =>
                updateDevice(floor.id, device.id, { rotation: r })
              }
            />
          ))}
        </Layer>
      </Stage>

      {pendingCalibration && (
        <CalibrationPrompt
          a={pendingCalibration.a}
          b={pendingCalibration.b}
          currentScale={floor.scale}
          onCancel={() => {
            setPendingCalibration(null);
            setTool("select");
          }}
          onApply={(meters) => {
            const px = distance(pendingCalibration.a, pendingCalibration.b);
            const newScale = px / meters;
            updateFloor(floor.id, { scale: newScale });
            setPendingCalibration(null);
            setTool("select");
            toast.success("Scale updated", {
              description: `${newScale.toFixed(1)} px / m`,
            });
          }}
        />
      )}
    </div>
  );
}

function FloorPlanEmptyState({
  onUpload,
  onLoadDemo,
}: {
  onUpload: () => void;
  onLoadDemo: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto flex max-w-md flex-col items-center gap-5 rounded-2xl border border-dashed border-border surface-card px-10 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-xl border border-border bg-background/40 shadow-[inset_0_1px_0_oklch(1_0_0/5%)]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6 text-primary"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </div>
        <div className="space-y-2">
          <div className="text-lg font-medium tracking-[-0.01em]">
            Start with a{" "}
            <span className="font-serif-italic text-primary">
              sample office
            </span>
            , or upload your own.
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed max-w-sm">
            The demo ships with a floor plan, traced walls, and ten devices —
            cameras, readers, sensors, network. Flip to 3D to see the rooms
            extrude.
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onLoadDemo}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-[0.92rem] font-medium text-primary-foreground btn-lift shadow-[inset_0_1px_0_oklch(1_0_0/14%),0_6px_18px_-8px_oklch(0.78_0.135_158/55%)] hover:bg-primary/90"
          >
            Load demo office
          </button>
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card/40 px-4 text-[0.92rem] font-medium text-foreground btn-lift hover:bg-card/70"
          >
            Upload my own plan
          </button>
        </div>
      </div>
    </div>
  );
}

function CalibrationPrompt({
  a,
  b,
  currentScale,
  onApply,
  onCancel,
}: {
  a: Vec2;
  b: Vec2;
  currentScale: number;
  onApply: (meters: number) => void;
  onCancel: () => void;
}) {
  const px = distance(a, b);
  const inferredMeters = px / currentScale;
  const [meters, setMeters] = useStateLocal(inferredMeters.toFixed(2));

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="w-[360px] rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="text-sm font-semibold tracking-tight">
          Set the scale
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          You picked two points {px.toFixed(1)} px apart. How far apart are they
          in real-world meters?
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={meters}
            onChange={(e) => setMeters(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
            autoFocus
          />
          <span className="font-mono text-sm text-muted-foreground">m</span>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const v = parseFloat(meters);
              if (!isNaN(v) && v > 0) onApply(v);
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply scale
          </button>
        </div>
      </div>
    </div>
  );
}

function useStateLocal(initial: string) {
  const [v, setV] = useState(initial);
  return [v, setV] as const;
}
