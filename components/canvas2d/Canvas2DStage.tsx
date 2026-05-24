"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Circle as KCircle,
  Group,
  Image as KImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { toast } from "sonner";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { useSimStore } from "@/lib/sim-store";
import type { Cable, Device, DeviceType, FurnitureItem, Vec2, Wall } from "@/types/design";
import { CABLE_COLORS, CABLE_LABELS } from "@/types/design";
import { getProduct } from "@/lib/catalog";
import { distance, screenToDesign, snapToNearestWall } from "@/lib/geometry";
import { useImage } from "./useImage";
import { DeviceShape } from "./DeviceShape";
import { AICursorOverlay } from "./AICursorOverlay";
import { AnnotationsLayer } from "./AnnotationsLayer";
import { CablingLayer } from "./CablingLayer";
import { planCabling } from "@/lib/cabling";

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
  const showCabling = useDesignStore((s) => s.showCabling);
  const visibility = useDesignStore((s) => s.visibility);
  const selectedId = useDesignStore((s) => s.selectedDeviceId);
  const selectDevice = useDesignStore((s) => s.selectDevice);
  const addDevice = useDesignStore((s) => s.addDevice);
  const updateDevice = useDesignStore((s) => s.updateDevice);
  const removeDevice = useDesignStore((s) => s.removeDevice);
  const addWall = useDesignStore((s) => s.addWall);
  const updateWall = useDesignStore((s) => s.updateWall);
  const updateFurniture = useDesignStore((s) => s.updateFurniture);
  const updateFloor = useDesignStore((s) => s.updateFloor);
  const surveyCheck = useDesignStore((s) => s.surveyCheck);
  const setSurveyCheck = useDesignStore((s) => s.setSurveyCheck);
  const viewTransform = useDesignStore((s) => s.viewTransform);
  const setViewTransform = useDesignStore((s) => s.setViewTransform);

  const planImage = useImage(floor?.planImage ?? null);

  // Wall-correction mode UI state. The slider lets the user lift the
  // traced walls off the floor-plan image so they can see misalignments.
  const [imageOpacity, setImageOpacity] = useState(0.85);
  const isCorrecting = tool === "correct-walls";

  // Wall drawing transient state
  const [wallPoints, setWallPoints] = useState<Vec2[]>([]);
  const [pendingCursor, setPendingCursor] = useState<Vec2 | null>(null);

  // Calibration transient state
  const [calibrationPoints, setCalibrationPoints] = useState<Vec2[]>([]);
  const [pendingCalibration, setPendingCalibration] = useState<
    { a: Vec2; b: Vec2 } | null
  >(null);

  // Wire-tool transient state. Once the user clicks a source device,
  // we hold the source id + any intermediate waypoints (added by
  // Shift-click on empty canvas). Clicking a second device closes the
  // cable. Esc cancels.
  const [wireSourceId, setWireSourceId] = useState<string | null>(null);
  const [wireWaypoints, setWireWaypoints] = useState<Vec2[]>([]);
  const isWiring = tool === "wire";
  const addCable = useDesignStore((s) => s.addCable);
  const removeCable = useDesignStore((s) => s.removeCable);
  const updateCable = useDesignStore((s) => s.updateCable);
  const selectedCableId = useDesignStore((s) => s.selectedCableId);
  const selectCable = useDesignStore((s) => s.selectCable);

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

    if (tool === "wire" && wireSourceId) {
      // Shift-click on empty canvas adds an intermediate waypoint to
      // the in-progress cable. Without shift, the click is ignored —
      // the cable closes only on a device click.
      if (e.evt.shiftKey) {
        setWireWaypoints((wp) => [...wp, point]);
      }
      return;
    }

    if (tool === "door" && floor) {
      // Snap to the nearest wall: project the click onto each wall segment
      // and pick the closest one. If nothing is within range, drop the door
      // at the cursor with rotation = 0 so the user still sees something.
      const snapPx = Math.max(40, floor.scale * 1.5);
      let bestDist = Infinity;
      let bestPos = point;
      let bestRotation = 0;
      let bestWallId = floor.walls[0]?.id ?? "";
      for (const w of floor.walls) {
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
        const d = Math.hypot(point.x - cx, point.y - cy);
        if (d < bestDist && d < snapPx) {
          bestDist = d;
          bestPos = { x: cx, y: cy };
          bestRotation = Math.atan2(dy, dx);
          bestWallId = w.id;
        }
      }
      const store = useDesignStore.getState();
      const door = store.addDoor(floor.id, {
        position: bestPos,
        rotation: bestRotation,
        widthMeters: 0.9,
        wallId: bestWallId,
        locked: false,
        label: `Door ${(floor.doors?.length ?? 0) + 1}`,
        notes: "",
      });
      // Auto-select for quick editing
      selectDevice(door.id);
      toast.success("Door placed", {
        description: "Drag to a wall, link a reader, or tap to edit.",
      });
      setTool("select");
      return;
    }

    // Select tool: clicking background clears selection
    selectDevice(null);
  }

  function onStageMouseMove(e: KonvaEventObject<MouseEvent>) {
    if (tool === "wall" && wallPoints.length > 0) {
      const p = getDesignPoint(e.evt.clientX, e.evt.clientY);
      setPendingCursor(p);
    } else if (tool === "wire" && wireSourceId) {
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
      const payload = JSON.parse(raw) as { type: DeviceType; catalogId?: string };
      const point = getDesignPoint(e.clientX, e.clientY);
      const product = payload.catalogId ? getProduct(payload.catalogId) : undefined;

      // Wall-snap on drop: if the user dropped near a wall and the device
      // type is wall-mountable, place it on the wall and orient it perpendicular.
      const wallMountable =
        payload.type === "camera" ||
        payload.type === "reader" ||
        payload.type === "sensor";
      let finalPoint = point;
      let finalRotation: number | undefined = undefined;
      if (wallMountable && floor.walls.length > 0) {
        const snapThresholdPx = Math.max(28, floor.scale * 0.7);
        const snap = snapToNearestWall(
          point,
          floor.walls,
          snapThresholdPx,
          Math.max(8, floor.scale * 0.18),
        );
        if (snap) {
          finalPoint = snap.position;
          finalRotation = snap.rotation;
        }
      }

      const created = addDevice(floor.id, payload.type, finalPoint, product);
      if (finalRotation !== undefined && created?.id) {
        updateDevice(floor.id, created.id, { rotation: finalRotation });
      }
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
        setWireSourceId(null);
        setWireWaypoints([]);
        selectDevice(null);
      } else if (e.key === "x" || e.key === "X") {
        setTool("wire");
        toast.message("Wire tool", {
          description:
            "Click a source device, then a target device. Shift-click empty space to add a bend. Esc to cancel.",
        });
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

  // Bounding box of the wall network, in floor-plan pixel coords.
  // Used to draw a warm cream "interior floor" rectangle so the floor
  // visually reads as the inside of the building (matching the 3D scene's
  // cream tone) while the surrounding grid stays a cool neutral.
  // Padded slightly so the fill extends to the wall centerlines.
  const interiorBox = useMemo(() => {
    if (!floor || floor.walls.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const w of floor.walls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      minY = Math.min(minY, w.start.y, w.end.y);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      maxY = Math.max(maxY, w.start.y, w.end.y);
    }
    if (!Number.isFinite(minX)) return null;
    const pad = 2; // bleed slightly under the wall stroke width
    return {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
  }, [floor]);

  const cursorStyle = useMemo(() => {
    if (tool === "wall" || tool === "calibrate" || tool === "door")
      return "crosshair";
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
      {/* Subtle atmospheric wash so the canvas doesn't read as flat
          graph paper. (Interior cream fill is drawn separately, inside
          the Konva Stage, scoped to the wall bounding box.) */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 95% 95% at 50% 50%, transparent 55%, rgba(0,0,0,0.04) 100%)",
        }}
        aria-hidden="true"
      />

      {/* Self-check banner. Appears in correct-walls mode when the AI
          Survey has produced a check result. Pinned top-center, can be
          dismissed (clears the check) — non-blocking so the user can
          still drag walls while reading. */}
      {isCorrecting && surveyCheck && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-30 w-[min(90%,640px)] -translate-x-1/2">
          <SurveyCheckBanner
            confidence={surveyCheck.overallConfidence}
            summary={surveyCheck.summary}
            issues={surveyCheck.issues}
            onDismiss={() => setSurveyCheck(null)}
          />
        </div>
      )}

      {/* Floating wall-correction control strip. Shows the opacity slider
          for the floor-plan image (so you can dial down the walls / image
          to spot misalignment) and a Done button to return to Select. */}
      {isCorrecting && planImage && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <span className="text-[0.72rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Floor plan
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(imageOpacity * 100)}
                onChange={(e) =>
                  setImageOpacity(Number(e.target.value) / 100)
                }
                className="h-1.5 w-44 cursor-pointer accent-amber-500"
                aria-label="Floor plan image opacity"
              />
              <span className="w-10 text-right font-mono text-[0.72rem] tabular-nums text-muted-foreground">
                {Math.round(imageOpacity * 100)}%
              </span>
            </div>
            <div className="h-5 w-px bg-border" />
            <span className="text-[0.7rem] text-muted-foreground">
              Drag the yellow dots to align walls with the image
            </span>
            <button
              type="button"
              onClick={() => setTool("select")}
              className="rounded-md bg-foreground px-3 py-1 text-[0.74rem] font-medium text-background hover:bg-foreground/85"
            >
              Done
            </button>
          </div>
        </div>
      )}
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
              // In correction mode the slider drives opacity (so the
              // user can lift walls off the image). In normal mode the
              // image is the primary visual reference, rendered fully
              // opaque; walls draw as a thin colored overlay on top.
              opacity={isCorrecting ? imageOpacity : 1}
              listening={false}
            />
          )}

          {/* Interior floor fill — warm cream rectangle inside the wall
              bounding box so the floor reads as a real interior surface
              (matching the 3D scene's cream floor) while the surrounding
              grid stays a cool neutral. Drawn beneath walls.
              SUPPRESSED when:
                • Correction mode is active (so the user can see the
                  underlying floor-plan image at the chosen opacity), OR
                • A floor-plan image has been uploaded (the image IS the
                  floor representation; the cream fill would hide it). */}
          {interiorBox && !isCorrecting && !planImage && (
            <Rect
              x={interiorBox.x}
              y={interiorBox.y}
              width={interiorBox.width}
              height={interiorBox.height}
              fill="#f3eee5"
              opacity={0.85}
              listening={false}
            />
          )}

          {/* Walls — render style depends on context:
              • Correction mode: thicker + dark for editability
              • With uploaded image: high-contrast dark overlay so the
                trace pops on top of the image
              • Otherwise: standard slate stroke */}
          {floor.walls.map((wall) => (
            <Line
              key={wall.id}
              points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
              stroke={
                isCorrecting
                  ? "#0f172a"
                  : planImage
                    ? "#1e3a8a"
                    : "#94a3b8"
              }
              strokeWidth={isCorrecting ? 4 : planImage ? 2.5 : 3}
              lineCap="round"
              opacity={isCorrecting ? 0.95 : planImage ? 0.8 : 0.85}
              listening={false}
            />
          ))}

          {/* Endpoint correction handles — only in correct-walls mode.
              Each wall gets two draggable circles (start, end). On drag-
              end, we (a) right-angle snap if the resulting wall is within
              5° of horizontal/vertical, and (b) snap to any other wall
              endpoint within 12px. Both heuristics greatly reduce manual
              precision needed and match how integrators actually want to
              align AI-traced walls to a floor plan. */}
          {isCorrecting &&
            floor.walls.flatMap((wall) => [
              <WallEndpointHandle
                key={`${wall.id}-start`}
                wall={wall}
                end="start"
                allWalls={floor.walls}
                onChange={(p) =>
                  updateWall(floor.id, wall.id, { start: p })
                }
              />,
              <WallEndpointHandle
                key={`${wall.id}-end`}
                wall={wall}
                end="end"
                allWalls={floor.walls}
                onChange={(p) =>
                  updateWall(floor.id, wall.id, { end: p })
                }
              />,
            ])}

          {/* Furniture — draggable rotated rectangles. Each piece is a
              Group with a fill rect + a corner rotation handle so users
              can re-arrange whatever the AI Survey places. */}
          {(floor.furniture ?? []).map((item) => (
            <FurnitureShape
              key={item.id}
              item={item}
              scalePxPerMeter={scalePxPerMeter}
              onMove={(p) =>
                updateFurniture(floor.id, item.id, { position: p })
              }
              onRotate={(r) =>
                updateFurniture(floor.id, item.id, { rotation: r })
              }
            />
          ))}

          {/* Doors — architectural symbol: short opening line + 90° swing arc */}
          {(floor.doors ?? []).map((door) => {
            const widthPx = door.widthMeters * scalePxPerMeter;
            const half = widthPx / 2;
            const cos = Math.cos(door.rotation);
            const sin = Math.sin(door.rotation);
            const hingeX = door.position.x - cos * half;
            const hingeY = door.position.y - sin * half;
            // The swing arc starts at the hinge and arcs 90° toward the room.
            // We approximate with 8 line segments — Konva doesn't have a
            // first-class arc primitive that works for our needs cheaply.
            const arcPoints: number[] = [];
            const segments = 12;
            for (let i = 0; i <= segments; i++) {
              const t = (i / segments) * (Math.PI / 2);
              const px = hingeX + Math.cos(door.rotation + t) * widthPx;
              const py = hingeY + Math.sin(door.rotation + t) * widthPx;
              arcPoints.push(px, py);
            }
            // Lock state drives color — red for locked, neutral for unlocked.
            const stroke = door.locked ? "#ef4444" : "#475569";
            return (
              <Group
                key={door.id}
                listening
                onClick={(e: KonvaEventObject<MouseEvent>) => {
                  e.cancelBubble = true;
                  selectDevice(door.id);
                }}
                onTap={(e: KonvaEventObject<TouchEvent>) => {
                  e.cancelBubble = true;
                  selectDevice(door.id);
                }}
              >
                {/* The door opening itself — a thicker line in the wall */}
                <Line
                  points={[
                    hingeX,
                    hingeY,
                    hingeX + cos * widthPx,
                    hingeY + sin * widthPx,
                  ]}
                  stroke={stroke}
                  strokeWidth={2}
                  lineCap="round"
                  opacity={0.95}
                />
                {/* Swing arc */}
                <Line
                  points={arcPoints}
                  stroke={stroke}
                  strokeWidth={1}
                  dash={[3, 3]}
                  opacity={0.7}
                  listening={false}
                />
                {/* Hinge dot */}
                <Circle
                  x={hingeX}
                  y={hingeY}
                  radius={2}
                  fill={stroke}
                  listening={false}
                />
              </Group>
            );
          })}

          {/* Wall drawing preview */}
          {tool === "wall" && wallPoints.length > 0 && pendingCursor && (
            <Line
              points={[
                wallPoints[wallPoints.length - 1].x,
                wallPoints[wallPoints.length - 1].y,
                pendingCursor.x,
                pendingCursor.y,
              ]}
              stroke="#3b82f6"
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
              fill="#3b82f6"
              listening={false}
            />
          )}

          {/* Cable runs — drawn beneath devices so the L-bend lines read
              as conduit on the floor. */}
          {showCabling && (
            <CablingLayer runs={planCabling(floor).runs} />
          )}

          {/* Manual / user-authored cables. Drawn on top of the auto-
              route layer (when both are visible) so the integrator's
              explicit choice reads as the source-of-truth. */}
          {(floor.cables ?? []).map((cable) => (
            <ManualCableShape
              key={cable.id}
              cable={cable}
              devices={floor.devices}
              scalePxPerMeter={scalePxPerMeter}
              selected={cable.id === selectedCableId}
              onSelect={() => selectCable(cable.id)}
              onDelete={() => removeCable(floor.id, cable.id)}
              onWaypointMove={(idx, p) => {
                const next = cable.waypoints.map((w, i) =>
                  i === idx ? p : w,
                );
                updateCable(floor.id, cable.id, { waypoints: next });
              }}
            />
          ))}

          {/* In-progress wire preview — a dashed line from source +
              waypoints to the cursor while the user is mid-draw. */}
          {isWiring && wireSourceId && (() => {
            const src = floor.devices.find((d) => d.id === wireSourceId);
            if (!src) return null;
            const pts: number[] = [src.position.x, src.position.y];
            for (const w of wireWaypoints) {
              pts.push(w.x, w.y);
            }
            if (pendingCursor) pts.push(pendingCursor.x, pendingCursor.y);
            return (
              <Line
                points={pts}
                stroke="#2563eb"
                strokeWidth={2}
                dash={[8, 6]}
                opacity={0.7}
                listening={false}
              />
            );
          })()}

          {/* Devices — filtered through layer visibility */}
          {floor.devices
            .filter(
              (d) =>
                visibility.byType[d.type] &&
                visibility.byStatus[d.installStatus ?? "proposed"],
            )
            .map((device) => (
              <DeviceShape
                key={device.id}
                device={device}
                scalePxPerMeter={scalePxPerMeter}
                selected={device.id === selectedId}
                showCoverage={showCoverage}
                walls={floor.walls}
                onSelect={() => {
                  // Wire-tool: clicking a device either starts or
                  // closes a cable. First click = source. Second click
                  // (on a different device) = target → addCable + reset.
                  if (isWiring) {
                    if (!wireSourceId) {
                      setWireSourceId(device.id);
                      toast.message("Source set", {
                        description:
                          "Now click the target device. Shift-click empty space to add a bend.",
                        duration: 3500,
                      });
                    } else if (device.id !== wireSourceId) {
                      // Close cable from source → waypoints → this target.
                      const sourceDev = floor.devices.find(
                        (d) => d.id === wireSourceId,
                      );
                      // Auto-pick cable type from source-device type —
                      // matches the rule-of-thumb integrator chooses.
                      const cableType: import("@/types/design").CableType =
                        sourceDev?.type === "camera" ||
                        (sourceDev?.type === "network" &&
                          (sourceDev as Extract<Device, { type: "network" }>)
                            .networkType === "access-point")
                          ? "cat6"
                          : sourceDev?.type === "reader"
                            ? "22-4"
                            : "18-2";
                      addCable(floor.id, {
                        sourceDeviceId: wireSourceId,
                        targetDeviceId: device.id,
                        type: cableType,
                        waypoints: wireWaypoints,
                      });
                      setWireSourceId(null);
                      setWireWaypoints([]);
                      toast.success("Cable added");
                    }
                    return;
                  }
                  selectDevice(device.id);
                }}
                onMove={(x, y) =>
                  updateDevice(floor.id, device.id, { position: { x, y } })
                }
                onRotate={(r) =>
                  updateDevice(floor.id, device.id, { rotation: r })
                }
              />
            ))}

          {/* Sticky-note style annotations — read-only on canvas, the AI
              chat or properties panel manages create/delete. */}
          <AnnotationsLayer
            annotations={floor.annotations ?? []}
            selectedId={selectedId}
            onSelect={(id) => selectDevice(id)}
          />
        </Layer>
      </Stage>

      {/* AI agent cursor — labelled marker that pings on every chat-driven
          edit. Lives above the Konva Stage so it overlays the canvas
          without participating in pointer events. */}
      <AICursorOverlay viewTransform={viewTransform} />

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
      {/* Decorative blueprint outline — establishes context without a "card" */}
      <svg
        viewBox="0 0 600 360"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto h-[68%] max-h-[460px] w-auto opacity-[0.18] dark:opacity-[0.22]"
      >
        <defs>
          <linearGradient id="bp-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {/* outer walls */}
        <path
          d="M40 60 L40 320 L560 320 L560 60 Z"
          stroke="url(#bp-stroke)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* interior walls */}
        <path
          d="M240 60 L240 200 M40 200 L240 200 M340 200 L560 200 M340 200 L340 320 M440 60 L440 200"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />
        {/* a door swing */}
        <path
          d="M240 180 A20 20 0 0 1 260 200"
          stroke="currentColor"
          strokeWidth="1"
          strokeOpacity="0.55"
          fill="none"
        />
        {/* devices as small circles */}
        <circle cx="140" cy="130" r="3.5" fill="currentColor" opacity="0.7" />
        <circle cx="380" cy="120" r="3.5" fill="currentColor" opacity="0.7" />
        <circle cx="500" cy="260" r="3.5" fill="currentColor" opacity="0.7" />
        <circle cx="150" cy="270" r="3.5" fill="currentColor" opacity="0.7" />
        {/* faint FOV cone */}
        <path
          d="M140 130 L80 80 A78 78 0 0 1 200 80 Z"
          fill="currentColor"
          opacity="0.08"
        />
      </svg>

      {/* Content — clean heading + two equal-weight CTAs. */}
      <div className="pointer-events-auto relative flex max-w-md flex-col items-center gap-6 px-8 text-center">
        <div className="text-[1.35rem] font-semibold tracking-[-0.02em] text-foreground">
          Your canvas is ready
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-[0.92rem] font-medium text-foreground btn-lift hover:bg-foreground/[0.04]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12l7-7 7 7" />
            </svg>
            Upload plan
          </button>
          <button
            type="button"
            onClick={onLoadDemo}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[0.92rem] font-medium text-primary-foreground btn-lift shadow-[0_10px_28px_-10px_oklch(0.55_0.17_245/55%)] hover:bg-primary/90"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M12 2l2.39 5.69L20 8.59l-4 4.13.96 5.78L12 15.77 7.04 18.5 8 12.72l-4-4.13 5.61-.9L12 2z" />
            </svg>
            Try demo
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

/**
 * Draggable circle on a wall endpoint. Snaps to:
 *   1. Another wall's endpoint within 12px (so two walls join cleanly).
 *   2. Horizontal / vertical if the resulting wall is within 5° of
 *      orthogonal (since most real floor plans are right-angled).
 *
 * Calls `onChange` with the snapped position on each drag-move so the
 * line and the handle stay in lockstep visually.
 */
function WallEndpointHandle({
  wall,
  end,
  allWalls,
  onChange,
}: {
  wall: Wall;
  end: "start" | "end";
  allWalls: Wall[];
  onChange: (p: Vec2) => void;
}) {
  const pos = end === "start" ? wall.start : wall.end;
  const otherEnd = end === "start" ? wall.end : wall.start;

  function snap(p: Vec2): Vec2 {
    // 1) Snap to another wall's endpoint if close enough.
    const SNAP_PX = 12;
    let best: Vec2 | null = null;
    let bestDist = SNAP_PX;
    for (const w of allWalls) {
      if (w.id === wall.id) continue;
      for (const ep of [w.start, w.end]) {
        const d = Math.hypot(ep.x - p.x, ep.y - p.y);
        if (d < bestDist) {
          best = ep;
          bestDist = d;
        }
      }
    }
    if (best) return { x: best.x, y: best.y };

    // 2) Right-angle snap. Project the new wall onto horizontal /
    // vertical if it's within ~5° of either.
    const dx = p.x - otherEnd.x;
    const dy = p.y - otherEnd.y;
    const angle = Math.atan2(dy, dx);
    const TOL = (5 * Math.PI) / 180;
    const closest = [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI].reduce(
      (acc, target) => {
        const diff = Math.abs(angularDiff(angle, target));
        return diff < acc.diff ? { target, diff } : acc;
      },
      { target: angle, diff: Infinity },
    );
    if (closest.diff < TOL) {
      const len = Math.hypot(dx, dy);
      return {
        x: otherEnd.x + Math.cos(closest.target) * len,
        y: otherEnd.y + Math.sin(closest.target) * len,
      };
    }

    return p;
  }

  return (
    <KCircle
      x={pos.x}
      y={pos.y}
      radius={7}
      fill="#fbbf24"
      stroke="#0f172a"
      strokeWidth={1.5}
      shadowColor="#0f172a"
      shadowBlur={4}
      shadowOpacity={0.4}
      draggable
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "grab";
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "default";
      }}
      onDragMove={(e) => {
        const p = snap({ x: e.target.x(), y: e.target.y() });
        // Keep the handle visually pinned to the snap result.
        e.target.x(p.x);
        e.target.y(p.y);
        onChange(p);
      }}
      onDragEnd={(e) => {
        const p = snap({ x: e.target.x(), y: e.target.y() });
        e.target.x(p.x);
        e.target.y(p.y);
        onChange(p);
      }}
    />
  );
}

/** Color-coded fills / strokes for furniture rectangles in 2D plan view. */
const FURNITURE_FILL: Record<string, string> = {
  desk: "#fde68a",
  chair: "#a7f3d0",
  "conference-table": "#bae6fd",
  "kitchen-island": "#fbcfe8",
  sofa: "#ddd6fe",
  toilet: "#e0f2fe",
  sink: "#cffafe",
  refrigerator: "#e2e8f0",
  bed: "#fed7aa",
  bookshelf: "#fef3c7",
  "tv-display": "#cbd5e1",
};
const FURNITURE_STROKE: Record<string, string> = {
  desk: "#b45309",
  chair: "#047857",
  "conference-table": "#0369a1",
  "kitchen-island": "#9d174d",
  sofa: "#5b21b6",
  toilet: "#0369a1",
  sink: "#0e7490",
  refrigerator: "#475569",
  bed: "#c2410c",
  bookshelf: "#a16207",
  "tv-display": "#0f172a",
};

/**
 * Furniture footprint on the 2D plan, with drag-to-move + a corner
 * rotation handle. Dragging the body moves the center; dragging the
 * small chevron handle at the long-axis end rotates around the center.
 */
function FurnitureShape({
  item,
  scalePxPerMeter,
  onMove,
  onRotate,
}: {
  item: FurnitureItem;
  scalePxPerMeter: number;
  onMove: (p: Vec2) => void;
  onRotate: (r: number) => void;
}) {
  const lPx = item.lengthM * scalePxPerMeter;
  const wPx = item.widthM * scalePxPerMeter;
  return (
    <Group
      x={item.position.x}
      y={item.position.y}
      rotation={(item.rotation * 180) / Math.PI}
      draggable
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "grab";
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "default";
      }}
      onDragEnd={(e) => {
        onMove({ x: e.target.x(), y: e.target.y() });
      }}
    >
      {/* Body fill */}
      <Rect
        x={-lPx / 2}
        y={-wPx / 2}
        width={lPx}
        height={wPx}
        fill={FURNITURE_FILL[item.type]}
        stroke={FURNITURE_STROKE[item.type]}
        strokeWidth={1.5}
        cornerRadius={4}
        opacity={0.7}
      />
      {/* Tiny label dot on the long-axis "front" so orientation is
          obvious at a glance — the arrow at +X tells you which way the
          piece is facing in the 3D scene. */}
      <Line
        points={[
          lPx / 2 - 6,
          0,
          lPx / 2 - 14,
          -5,
          lPx / 2 - 14,
          5,
        ]}
        closed
        fill={FURNITURE_STROKE[item.type]}
        listening={false}
      />
      {/* Rotation handle — small circle ~10px past the front of the
          piece, draggable independently of the body. */}
      <FurnitureRotateHandle
        x={lPx / 2 + 14}
        y={0}
        onRotate={(localAngle) => onRotate(item.rotation + localAngle)}
      />
    </Group>
  );
}

function FurnitureRotateHandle({
  x,
  y,
  onRotate,
}: {
  x: number;
  y: number;
  onRotate: (deltaRadians: number) => void;
}) {
  return (
    <Group x={x} y={y}>
      <Circle
        radius={6}
        fill="#fbbf24"
        stroke="#0f172a"
        strokeWidth={1.2}
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
          // dx/dy from the original handle position → angle delta
          // around the piece's local origin (the parent Group's 0,0).
          const dx = e.target.x();
          const dy = e.target.y();
          const angle = Math.atan2(dy, dx);
          onRotate(angle);
          // Snap the handle back to its anchor so the user can keep
          // dragging incrementally; parent re-renders with new rotation.
          e.target.x(0);
          e.target.y(0);
        }}
        onDragEnd={(e) => {
          e.target.x(0);
          e.target.y(0);
        }}
      />
    </Group>
  );
}

/**
 * Manually-authored cable run between two devices. Color-coded by type,
 * length-labeled, click to delete. Polyline goes source → waypoints →
 * target so users can route around obstacles.
 */
function ManualCableShape({
  cable,
  devices,
  scalePxPerMeter,
  selected,
  onSelect,
  onDelete,
  onWaypointMove,
}: {
  cable: Cable;
  devices: Device[];
  scalePxPerMeter: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onWaypointMove: (index: number, p: Vec2) => void;
}) {
  // Sim-mode glow pulse — when running, the cable shadow + opacity
  // oscillate so it reads as "current is flowing" rather than dead
  // copper. Pure cosmetic, low CPU (one timer per cable).
  const simRunning = useSimStore((s) => s.running);
  const [pulsePhase, setPulsePhase] = useState(0);
  useEffect(() => {
    if (!simRunning) return;
    const id = window.setInterval(() => {
      setPulsePhase((p) => (p + 0.18) % (Math.PI * 2));
    }, 80);
    return () => window.clearInterval(id);
  }, [simRunning]);
  const cableOpacity = simRunning
    ? 0.7 + Math.sin(pulsePhase) * 0.25
    : 0.85;

  const src = devices.find((d) => d.id === cable.sourceDeviceId);
  const tgt = devices.find((d) => d.id === cable.targetDeviceId);
  if (!src || !tgt) return null;
  const color = cable.color ?? CABLE_COLORS[cable.type];
  const label = cable.label ?? CABLE_LABELS[cable.type];

  // Flat polyline points: src → waypoints → tgt
  const points: number[] = [src.position.x, src.position.y];
  for (const w of cable.waypoints) points.push(w.x, w.y);
  points.push(tgt.position.x, tgt.position.y);

  // Cable length in meters, summed over all segments.
  let lenPx = 0;
  for (let i = 0; i < points.length - 2; i += 2) {
    const dx = points[i + 2] - points[i];
    const dy = points[i + 3] - points[i + 1];
    lenPx += Math.hypot(dx, dy);
  }
  const lenM = lenPx / scalePxPerMeter;

  // Midpoint of the longest segment for the label anchor.
  let bestIdx = 0;
  let bestLen = 0;
  for (let i = 0; i < points.length - 2; i += 2) {
    const dx = points[i + 2] - points[i];
    const dy = points[i + 3] - points[i + 1];
    const seg = Math.hypot(dx, dy);
    if (seg > bestLen) {
      bestLen = seg;
      bestIdx = i;
    }
  }
  const midX = (points[bestIdx] + points[bestIdx + 2]) / 2;
  const midY = (points[bestIdx + 1] + points[bestIdx + 3]) / 2;

  return (
    <Group
      onClick={(e) => {
        e.cancelBubble = true;
        // Shift-click quickly deletes; plain click selects + opens the
        // properties panel where the user can change type / color / notes.
        if (e.evt.shiftKey) {
          onDelete();
        } else {
          onSelect();
        }
      }}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "pointer";
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "default";
      }}
    >
      {/* Wider invisible hit-target so the user doesn't need pixel-
          precise aim to click the cable. */}
      <Line
        points={points}
        stroke="transparent"
        strokeWidth={14}
      />
      {/* The visible cable itself — thicker dashed line, pulses during
          sim mode, brighter halo when selected so the user knows which
          cable they're editing. */}
      <Line
        points={points}
        stroke={color}
        strokeWidth={selected ? 5 : 4}
        lineCap="round"
        lineJoin="round"
        dash={[10, 6]}
        opacity={cableOpacity}
        shadowColor={selected ? "#3b82f6" : color}
        shadowBlur={selected ? 14 : simRunning ? 12 : 0}
        shadowOpacity={selected ? 0.9 : simRunning ? 0.85 : 0}
        listening={false}
      />
      {/* Type + length label — small dark pill at the midpoint */}
      <Group x={midX} y={midY} listening={false}>
        <Rect
          x={-44}
          y={-9}
          width={88}
          height={18}
          cornerRadius={9}
          fill="#0f172a"
          opacity={0.88}
        />
        <Text
          text={`${label} · ${lenM.toFixed(1)} m`}
          fontSize={9}
          fontFamily="Inter, system-ui, sans-serif"
          fontStyle="500"
          fill="#f8fafc"
          align="center"
          width={88}
          x={-44}
          y={-4}
          letterSpacing={-0.1}
        />
      </Group>
      {/* Waypoint handles — draggable, so the integrator can reroute
          a cable without redrawing. Slightly larger when not in sim so
          they're easy to grab; smaller + dimmer during sim so they
          don't compete with the glow. */}
      {cable.waypoints.map((w, i) => (
        <Circle
          key={i}
          x={w.x}
          y={w.y}
          radius={simRunning ? 4 : 6}
          fill={color}
          stroke="#0f172a"
          strokeWidth={1.5}
          shadowColor="#0f172a"
          shadowBlur={3}
          shadowOpacity={0.4}
          draggable
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = "grab";
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = "default";
          }}
          onDragEnd={(e) => {
            onWaypointMove(i, { x: e.target.x(), y: e.target.y() });
          }}
        />
      ))}
    </Group>
  );
}

/** Shortest signed angular difference between two angles in radians. */
function angularDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Self-check banner shown after the AI Survey. Surfaces the second-pass
 * AI's assessment of whether the trace matches the floor plan — overall
 * confidence chip + a short summary + an expandable list of concrete
 * issues to act on.
 */
function SurveyCheckBanner({
  confidence,
  summary,
  issues,
  onDismiss,
}: {
  confidence: "high" | "medium" | "low";
  summary: string;
  issues: { kind: string; severity: "info" | "warning" | "critical"; description: string }[];
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tone = confidence === "high"
    ? { bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-300/60", chip: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", label: "High confidence" }
    : confidence === "medium"
      ? { bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-300/60", chip: "bg-amber-500/20 text-amber-700 dark:text-amber-300", dot: "bg-amber-500", label: "Medium confidence" }
      : { bg: "bg-rose-50 dark:bg-rose-950/40", border: "border-rose-300/60", chip: "bg-rose-500/20 text-rose-700 dark:text-rose-300", dot: "bg-rose-500", label: "Low confidence" };
  return (
    <div
      className={`rounded-xl border ${tone.border} ${tone.bg} p-3 shadow-2xl backdrop-blur`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] ${tone.chip}`}
        >
          <span className={`size-1.5 rounded-full ${tone.dot}`} />
          {tone.label}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.82rem] font-medium leading-snug text-foreground">
            AI self-check
          </div>
          <div className="mt-0.5 text-[0.74rem] leading-snug text-muted-foreground">
            {summary}
          </div>
          {issues.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-1.5 text-[0.7rem] font-medium text-foreground/70 hover:text-foreground"
            >
              {open ? "Hide" : "Show"} {issues.length} issue{issues.length === 1 ? "" : "s"}
            </button>
          )}
          {open && issues.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-t border-foreground/10 pt-2">
              {issues.map((issue, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[0.72rem] leading-snug"
                >
                  <span
                    className={`mt-0.5 inline-flex shrink-0 rounded-sm px-1 py-px font-mono text-[0.58rem] font-bold uppercase tracking-wider ${
                      issue.severity === "critical"
                        ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                        : issue.severity === "warning"
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                          : "bg-foreground/10 text-foreground/70"
                    }`}
                  >
                    {issue.severity}
                  </span>
                  <span className="text-foreground/85">{issue.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
