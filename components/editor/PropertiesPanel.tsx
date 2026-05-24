"use client";

import { Eye, Lightbulb, StickyNote, Trash2, TriangleAlert } from "lucide-react";
import {
  useActiveFloor,
  useCurrentDesign,
  useDesignStore,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import type {
  Annotation,
  Cable,
  CableType,
  CameraDevice,
  Device,
  DevicePhoto,
  Door,
  DoorLock,
  InstallStatus,
  LockFailMode,
  LockType,
} from "@/types/design";
import { CABLE_COLORS, CABLE_LABELS } from "@/types/design";
import { getProduct } from "@/lib/catalog";
import { formatUSD } from "@/lib/pricing";
import { DevicePhotoStrip } from "./DevicePhotoStrip";
import { CameraDORIPanel } from "./CameraDORIPanel";
import { cn } from "@/lib/utils";

function pickValue(v: number | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number);
}

export function PropertiesPanel() {
  const selectedId = useDesignStore((s) => s.selectedDeviceId);
  const selectedCableId = useDesignStore((s) => s.selectedCableId);
  const floor = useActiveFloor();
  const design = useCurrentDesign();
  const updateDevice = useDesignStore((s) => s.updateDevice);
  const updateFloor = useDesignStore((s) => s.updateFloor);
  const removeDevice = useDesignStore((s) => s.removeDevice);
  const updateDoor = useDesignStore((s) => s.updateDoor);
  const removeDoor = useDesignStore((s) => s.removeDoor);
  const updateAnnotation = useDesignStore((s) => s.updateAnnotation);
  const removeAnnotation = useDesignStore((s) => s.removeAnnotation);
  const updateCable = useDesignStore((s) => s.updateCable);
  const removeCable = useDesignStore((s) => s.removeCable);
  const selectCable = useDesignStore((s) => s.selectCable);
  const selectedCable =
    selectedCableId && floor
      ? (floor.cables ?? []).find((c) => c.id === selectedCableId) ?? null
      : null;

  const selected: Device | null =
    floor?.devices.find((d) => d.id === selectedId) ?? null;
  // Doors AND annotations share the `selectedDeviceId` slot so the canvas can
  // highlight either entity uniformly. Look them up here when no device matched.
  const selectedDoor: Door | null = selected
    ? null
    : (floor?.doors ?? []).find((d) => d.id === selectedId) ?? null;
  const selectedAnnotation: Annotation | null =
    selected || selectedDoor
      ? null
      : (floor?.annotations ?? []).find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex h-full w-full flex-col bg-sidebar">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3.5">
        <div className="flex flex-col">
          <div className="text-[0.92rem] font-semibold tracking-[-0.01em] text-foreground">
            {selected
              ? selected.type === "camera"
                ? "Camera"
                : selected.type === "reader"
                  ? "Reader"
                  : selected.type === "sensor"
                    ? "Sensor"
                    : "Network device"
              : selectedDoor
                ? "Door"
                : selectedAnnotation
                  ? selectedAnnotation.kind === "warning"
                    ? "Warning"
                    : selectedAnnotation.kind === "idea"
                      ? "Idea"
                      : "Note"
                  : selectedCable
                    ? "Cable run"
                    : floor
                      ? "Floor settings"
                      : "Properties"}
          </div>
          {(selected || selectedDoor) && (
            <div className="mt-0.5 text-[0.74rem] text-muted-foreground">
              {(selected?.label || selectedDoor?.label) ?? "Untitled"}
            </div>
          )}
        </div>
        {selected && (
          <div
            className="size-2 rounded-full"
            style={{
              backgroundColor:
                selected.type === "camera"
                  ? "#3b82f6"
                  : selected.type === "reader"
                    ? "#0ea5e9"
                    : selected.type === "sensor"
                      ? "#f59e0b"
                      : "#a78bfa",
            }}
            aria-hidden="true"
          />
        )}
        {selectedDoor && (
          <div
            className={cn(
              "size-2 rounded-full",
              selectedDoor.locked ? "bg-rose-500" : "bg-emerald-500",
            )}
            aria-hidden="true"
          />
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {selected ? (
            <DeviceForm
              device={selected}
              onChange={(partial) =>
                floor && updateDevice(floor.id, selected.id, partial)
              }
              onDelete={() => floor && removeDevice(floor.id, selected.id)}
            />
          ) : selectedDoor && floor ? (
            <DoorForm
              door={selectedDoor}
              onChange={(partial) =>
                updateDoor(floor.id, selectedDoor.id, partial)
              }
              onDelete={() => removeDoor(floor.id, selectedDoor.id)}
            />
          ) : selectedAnnotation && floor ? (
            <AnnotationForm
              annotation={selectedAnnotation}
              onChange={(partial) =>
                updateAnnotation(floor.id, selectedAnnotation.id, partial)
              }
              onDelete={() => removeAnnotation(floor.id, selectedAnnotation.id)}
            />
          ) : selectedCable && floor ? (
            <CableForm
              cable={selectedCable}
              devices={floor.devices}
              onChange={(partial) =>
                updateCable(floor.id, selectedCable.id, partial)
              }
              onDelete={() => {
                removeCable(floor.id, selectedCable.id);
                selectCable(null);
              }}
            />
          ) : floor && design ? (
            <FloorForm
              name={floor.name}
              scale={floor.scale}
              ceilingHeight={floor.ceilingHeight}
              wallStyle={floor.wallStyle ?? "plain"}
              onChange={(partial) => updateFloor(floor.id, partial)}
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              Loading…
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function FloorForm({
  name,
  scale,
  ceilingHeight,
  wallStyle,
  onChange,
}: {
  name: string;
  scale: number;
  ceilingHeight: number;
  wallStyle: import("@/types/design").WallStyle;
  onChange: (partial: {
    name?: string;
    scale?: number;
    ceilingHeight?: number;
    wallStyle?: import("@/types/design").WallStyle;
  }) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Floor name</Label>
        <Input
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Scale (pixels per meter)
        </Label>
        <div className="flex items-center gap-3">
          <Slider
            min={10}
            max={200}
            step={1}
            value={[scale]}
            onValueChange={(v) => onChange({ scale: pickValue(v) })}
            className="flex-1"
          />
          <div className="font-mono text-sm w-12 text-right">{scale}</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Used to convert floor-plan pixels into real-world meters.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Ceiling height (m)
        </Label>
        <div className="flex items-center gap-3">
          <Slider
            min={2.2}
            max={6}
            step={0.1}
            value={[ceilingHeight]}
            onValueChange={(v) => onChange({ ceilingHeight: pickValue(v) })}
            className="flex-1"
          />
          <div className="font-mono text-sm w-12 text-right">
            {ceilingHeight.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Wall style
        </Label>
        <select
          value={wallStyle}
          onChange={(e) =>
            onChange({
              wallStyle: e.target.value as import("@/types/design").WallStyle,
            })
          }
          className="w-full rounded-md border border-border bg-background/40 px-2 py-1.5 text-[0.85rem] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        >
          <option value="plain">Plain drywall (default)</option>
          <option value="painted">Painted drywall (richer texture)</option>
          <option value="concrete">Polished concrete</option>
          <option value="brick">Exposed brick</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Applied to all walls in the 3D view.
        </p>
      </div>

      <Separator />

      <div className="flex gap-2.5 rounded-lg bg-primary/[0.06] border border-primary/15 p-3 text-[0.78rem] text-foreground/75 leading-relaxed">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 mt-0.5 shrink-0 text-primary"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <span>
          Drag a device from the left to place it. Click any placed device to
          edit its properties.
        </span>
      </div>
    </div>
  );
}

function DeviceForm({
  device,
  onChange,
  onDelete,
}: {
  device: Device;
  onChange: (partial: Partial<Device>) => void;
  onDelete: () => void;
}) {
  const catalogProduct = device.catalogId ? getProduct(device.catalogId) : null;

  return (
    <div className="space-y-5">
      {catalogProduct && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary/70">
            {catalogProduct.manufacturer}
          </div>
          <div className="mt-0.5 text-[0.88rem] font-medium tracking-[-0.01em]">
            {catalogProduct.model}
          </div>
          <div className="mt-0.5 text-[0.72rem] text-muted-foreground">
            {catalogProduct.description}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 text-[0.7rem]">
            <span className="font-mono font-medium">{formatUSD(catalogProduct.streetPrice)}</span>
            <span className="text-muted-foreground/60">street</span>
            <span className="font-mono text-muted-foreground/50">{formatUSD(catalogProduct.msrp)}</span>
            <span className="text-muted-foreground/60">MSRP</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Label</Label>
        <Input
          value={device.label}
          onChange={(e) =>
            onChange({ label: e.target.value } as Partial<Device>)
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Input
          value={device.notes}
          onChange={(e) =>
            onChange({ notes: e.target.value } as Partial<Device>)
          }
          placeholder="Anything to remember…"
        />
      </div>

      {/* Orientation block — pulled up to the top because rotation + tilt
          are the controls users reach for most often when placing devices.
          Anything below this (status, photos, dates) is reference info
          that gets less per-session traffic. */}
      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Rotation (degrees)
        </Label>
        <div className="flex items-center gap-3">
          <Slider
            min={0}
            max={360}
            step={1}
            value={[Math.round((device.rotation * 180) / Math.PI) % 360]}
            onValueChange={(v) =>
              onChange({
                rotation: (pickValue(v) * Math.PI) / 180,
              } as Partial<Device>)
            }
            className="flex-1"
          />
          <div className="font-mono text-sm w-12 text-right">
            {Math.round((device.rotation * 180) / Math.PI) % 360}°
          </div>
        </div>
      </div>

      {/* Tilt — only meaningful for cameras, since they're the only devices
          whose pitch changes what's actually visible to them. Slider is
          centered at 0 so the user can grab the midpoint to "level" the
          camera. Range −60° (looking up) to +60° (looking down). */}
      {device.type === "camera" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Tilt (degrees)
            </Label>
            {(device.tilt ?? 0) !== 0 && (
              <button
                type="button"
                onClick={() =>
                  onChange({ tilt: 0 } as Partial<Device>)
                }
                className="text-[0.65rem] font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="Reset tilt to level"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Slider
              min={-60}
              max={60}
              step={1}
              value={[Math.round(((device.tilt ?? 0) * 180) / Math.PI)]}
              onValueChange={(v) =>
                onChange({
                  tilt: (pickValue(v) * Math.PI) / 180,
                } as Partial<Device>)
              }
              className="flex-1"
            />
            <div className="font-mono text-sm w-12 text-right">
              {Math.round(((device.tilt ?? 0) * 180) / Math.PI)}°
            </div>
          </div>
          <p className="text-[0.66rem] text-muted-foreground/80 leading-relaxed">
            Positive = aim down, negative = aim up. Matters for wall-mounted
            cameras — a camera tilted up won&apos;t see people on the floor in
            front of it.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Mount height (m)
        </Label>
        <div className="flex items-center gap-3">
          <Slider
            min={0.1}
            max={6}
            step={0.1}
            value={[device.mountHeight]}
            onValueChange={(v) =>
              onChange({ mountHeight: pickValue(v) } as Partial<Device>)
            }
            className="flex-1"
          />
          <div className="font-mono text-sm w-12 text-right">
            {device.mountHeight.toFixed(1)}
          </div>
        </div>
      </div>

      {device.type === "camera" && (
        <CameraExtras
          device={device}
          onChange={(partial) =>
            onChange(partial as Partial<Device>)
          }
        />
      )}

      {device.type === "sensor" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Detection range (m)
          </Label>
          <div className="flex items-center gap-3">
            <Slider
              min={1}
              max={30}
              step={0.5}
              value={[device.rangeMeters]}
              onValueChange={(v) =>
                onChange({ rangeMeters: pickValue(v) } as Partial<Device>)
              }
              className="flex-1"
            />
            <div className="font-mono text-sm w-12 text-right">
              {device.rangeMeters.toFixed(1)}
            </div>
          </div>
        </div>
      )}

      {device.type === "network" && (
        <NetworkDeviceFields device={device} onChange={onChange} />
      )}

      <Separator />

      {/* Lifecycle metadata — moved BELOW the orientation + coverage
          fields because they're reference info, not the controls users
          reach for during placement. */}
      <InstallStatusPicker device={device} onChange={onChange} />

      <CriticalDatesFields device={device} onChange={onChange} />

      <DevicePhotosSection device={device} />

      <Separator />

      <AppearanceFields device={device} onChange={onChange} />

      <Separator />

      {device.type === "camera" && (
        <Button
          variant="outline"
          className="w-full border-rose-500/30 text-rose-600 hover:bg-rose-500/[0.06] hover:text-rose-600"
          onClick={() => useDesignStore.getState().enterCameraPov(device.id)}
        >
          <Eye className="size-4" />
          View from this camera
        </Button>
      )}

      <Button
        variant="outline"
        className="w-full text-destructive hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
        Remove device
      </Button>
    </div>
  );
}

function CameraExtras({
  device,
  onChange,
}: {
  device: CameraDevice;
  onChange: (partial: Partial<CameraDevice>) => void;
}) {
  const hasLenses = device.lenses && device.lenses.length > 0;

  function updateLens(lensId: string, partial: Record<string, number>) {
    if (!device.lenses) return;
    const updated = device.lenses.map((l) =>
      l.id === lensId ? { ...l, ...partial } : l
    );
    onChange({ lenses: updated });
  }

  if (hasLenses) {
    return (
      <>
        <Separator />
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Lenses ({device.lenses!.length})
        </div>
        {device.lenses!.map((lens, i) => (
          <div
            key={lens.id}
            className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3"
          >
            <div className="text-[0.72rem] font-medium">
              <span
                className="mr-1.5 inline-block size-2 rounded-full"
                style={{ backgroundColor: LENS_COLORS[i % LENS_COLORS.length] }}
              />
              {lens.label}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">FOV (°)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  min={20}
                  max={180}
                  step={1}
                  value={[lens.fovDegrees]}
                  onValueChange={(v) =>
                    updateLens(lens.id, { fovDegrees: pickValue(v) })
                  }
                  className="flex-1"
                />
                <div className="font-mono text-[0.75rem] w-10 text-right">
                  {lens.fovDegrees}°
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Range (m)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  min={1}
                  max={60}
                  step={0.5}
                  value={[lens.rangeMeters]}
                  onValueChange={(v) =>
                    updateLens(lens.id, { rangeMeters: pickValue(v) })
                  }
                  className="flex-1"
                />
                <div className="font-mono text-[0.75rem] w-10 text-right">
                  {lens.rangeMeters.toFixed(1)}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Direction offset (°)
              </Label>
              <div className="flex items-center gap-3">
                <Slider
                  min={0}
                  max={360}
                  step={5}
                  value={[Math.round((lens.rotationOffset * 180) / Math.PI) % 360]}
                  onValueChange={(v) =>
                    updateLens(lens.id, {
                      rotationOffset: (pickValue(v) * Math.PI) / 180,
                    })
                  }
                  className="flex-1"
                />
                <div className="font-mono text-[0.75rem] w-10 text-right">
                  {Math.round((lens.rotationOffset * 180) / Math.PI) % 360}°
                </div>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Field of view (°)</Label>
        <div className="flex items-center gap-3">
          <Slider
            min={20}
            max={360}
            step={1}
            value={[device.fovDegrees]}
            onValueChange={(v) => onChange({ fovDegrees: pickValue(v) })}
            className="flex-1"
          />
          <div className="font-mono text-sm w-12 text-right">
            {device.fovDegrees}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Range (m)</Label>
        <div className="flex items-center gap-3">
          <Slider
            min={1}
            max={60}
            step={0.5}
            value={[device.rangeMeters]}
            onValueChange={(v) => onChange({ rangeMeters: pickValue(v) })}
            className="flex-1"
          />
          <div className="font-mono text-sm w-12 text-right">
            {device.rangeMeters.toFixed(1)}
          </div>
        </div>
      </div>

      {/* DORI calculator — only shown for single-lens cameras at the moment */}
      <CameraDORIPanel
        fovDegrees={device.fovDegrees}
        rangeMeters={device.rangeMeters}
        resolution={device.resolution}
      />
    </>
  );
}

/* ── Install status picker (segmented control) ─────────────────────────── */

const STATUS_OPTIONS: { value: InstallStatus; label: string; tone: string }[] = [
  { value: "proposed", label: "Proposed", tone: "bg-foreground/60" },
  { value: "installed", label: "Installed", tone: "bg-emerald-500" },
  { value: "decommissioned", label: "Retired", tone: "bg-rose-500" },
];

function InstallStatusPicker({
  device,
  onChange,
}: {
  device: Device;
  onChange: (partial: Partial<Device>) => void;
}) {
  const current = device.installStatus ?? "proposed";
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Install status</Label>
      <div className="flex items-center gap-px rounded-md bg-foreground/[0.05] p-0.5">
        {STATUS_OPTIONS.map(({ value, label, tone }) => {
          const active = current === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() =>
                onChange({ installStatus: value } as Partial<Device>)
              }
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 text-[0.74rem] font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-[0_1px_2px_-1px_rgba(0,0,0,0.18)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", tone)} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Critical dates ────────────────────────────────────────────────────── */

function CriticalDatesFields({
  device,
  onChange,
}: {
  device: Device;
  onChange: (partial: Partial<Device>) => void;
}) {
  return (
    <details className="group rounded-lg border border-border/60 bg-card/30">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[0.78rem] font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.03]">
        <span>Critical dates</span>
        <span className="text-[0.7rem] text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-2.5 px-3 pb-3 pt-1">
        <DateField
          label="Warranty until"
          value={device.warrantyUntil ?? ""}
          onChange={(v) =>
            onChange({ warrantyUntil: v || undefined } as Partial<Device>)
          }
        />
        <DateField
          label="Last inspection"
          value={device.lastInspectionAt ?? ""}
          onChange={(v) =>
            onChange({ lastInspectionAt: v || undefined } as Partial<Device>)
          }
        />
        <DateField
          label="End of life"
          value={device.endOfLifeAt ?? ""}
          onChange={(v) =>
            onChange({ endOfLifeAt: v || undefined } as Partial<Device>)
          }
        />
      </div>
    </details>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[0.74rem] text-muted-foreground">{label}</Label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-background/40 px-2 py-1 text-[0.78rem] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
      />
    </div>
  );
}

/* ── Photos attached to a device ───────────────────────────────────────── */

function DevicePhotosSection({ device }: { device: Device }) {
  const floor = useActiveFloor();
  const addDevicePhoto = useDesignStore((s) => s.addDevicePhoto);
  const removeDevicePhoto = useDesignStore((s) => s.removeDevicePhoto);
  const updateDevice = useDesignStore((s) => s.updateDevice);
  if (!floor) return null;
  return (
    <DevicePhotoStrip
      photos={device.photos ?? []}
      onAdd={(photo) => addDevicePhoto(floor.id, device.id, photo)}
      onRemove={(photoId) => removeDevicePhoto(floor.id, device.id, photoId)}
      onUpdateCaption={(photoId, caption) => {
        const updatedPhotos: DevicePhoto[] = (device.photos ?? []).map((p) =>
          p.id === photoId ? { ...p, caption } : p,
        );
        updateDevice(floor.id, device.id, {
          photos: updatedPhotos,
        } as Partial<Device>);
      }}
    />
  );
}

const LENS_COLORS = ["#3b82f6", "#06b6d4", "#f97316", "#e879f9", "#facc15", "#10b981"];

/* ── Appearance overrides (custom color + coverage opacity) ──────────────
   Lets a user paint a single device a custom color (overrides the type
   default in BOTH the 2D marker and the 3D mesh accent) and dial the
   visibility of its coverage area. Mirrors System Surveyor's per-element
   color + AOC opacity controls. */

/** Defaults the color picker swatch falls back to when no override is set. */
const TYPE_DEFAULT_COLOR: Record<Device["type"], string> = {
  camera: "#3b82f6",
  reader: "#0ea5e9",
  sensor: "#f59e0b",
  network: "#a78bfa",
};

function AppearanceFields({
  device,
  onChange,
}: {
  device: Device;
  onChange: (partial: Partial<Device>) => void;
}) {
  const defaultColor = TYPE_DEFAULT_COLOR[device.type];
  // Only show the opacity slider for devices whose coverage area is
  // actually visible on the canvas. Readers have no coverage visualization.
  const hasCoverage =
    device.type === "camera" ||
    device.type === "sensor" ||
    (device.type === "network" && device.networkType === "access-point");
  // Type-specific defaults so the slider isn't visually empty before the
  // user touches it (cameras read at 9%, sensors at 25%).
  const defaultOpacity = device.type === "camera" ? 0.09 : 0.25;
  const currentOpacityPct = Math.round(
    (device.customOpacity ?? defaultOpacity) * 100,
  );
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Marker color</Label>
          {device.customColor && (
            <button
              type="button"
              onClick={() =>
                onChange({ customColor: undefined } as Partial<Device>)
              }
              className="text-[0.7rem] text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={device.customColor ?? defaultColor}
            onChange={(e) =>
              onChange({ customColor: e.target.value } as Partial<Device>)
            }
            className="size-9 cursor-pointer rounded-md border border-border bg-transparent p-1"
            aria-label="Pick marker color"
          />
          <input
            type="text"
            value={device.customColor ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              onChange({
                customColor: v ? v : undefined,
              } as Partial<Device>);
            }}
            placeholder={defaultColor}
            className="flex-1 rounded-md border border-border bg-background/40 px-2 py-1.5 font-mono text-[0.78rem] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <p className="text-[0.7rem] text-muted-foreground/70">
          Overrides the type-default color in both the 2D marker and the 3D
          mesh accent.
        </p>
      </div>

      {hasCoverage && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Coverage opacity
            </Label>
            {device.customOpacity !== undefined && (
              <button
                type="button"
                onClick={() =>
                  onChange({ customOpacity: undefined } as Partial<Device>)
                }
                className="text-[0.7rem] text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Slider
              min={0}
              max={100}
              step={1}
              value={[currentOpacityPct]}
              onValueChange={(v) =>
                onChange({
                  customOpacity: pickValue(v) / 100,
                } as Partial<Device>)
              }
              className="flex-1"
            />
            <div className="font-mono text-sm w-12 text-right">
              {currentOpacityPct}%
            </div>
          </div>
          <p className="text-[0.7rem] text-muted-foreground/70">
            Visibility of the FOV / detection area. 0% hides it; the actual
            detection logic is unaffected.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Door form ─────────────────────────────────────────────────────────
   Properties for a placed door: width, lock state, label, notes, and the
   reader it's controlled by. */
function DoorForm({
  door,
  onChange,
  onDelete,
}: {
  door: Door;
  onChange: (partial: Partial<Door>) => void;
  onDelete: () => void;
}) {
  const floor = useActiveFloor();
  const updateDeviceFn = useDesignStore((s) => s.updateDevice);
  const readers = (floor?.devices ?? []).filter((d) => d.type === "reader");
  const controllingReader = readers.find(
    (r) => r.type === "reader" && r.controlsDoorId === door.id,
  );

  function setControllingReader(readerId: string | null) {
    if (!floor) return;
    // Clear any existing reader that controls this door
    for (const r of readers) {
      if (
        r.type === "reader" &&
        r.controlsDoorId === door.id &&
        r.id !== readerId
      ) {
        updateDeviceFn(floor.id, r.id, { controlsDoorId: undefined });
      }
    }
    if (readerId) {
      updateDeviceFn(floor.id, readerId, { controlsDoorId: door.id });
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Label</Label>
        <Input
          value={door.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="e.g. Front entry"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Lock state
        </Label>
        <div className="flex items-center gap-px rounded-md bg-foreground/[0.05] p-0.5">
          <button
            type="button"
            onClick={() => onChange({ locked: false })}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 text-[0.74rem] font-medium transition-colors",
              !door.locked
                ? "bg-card text-foreground shadow-[0_1px_2px_-1px_rgba(0,0,0,0.18)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Unlocked
          </button>
          <button
            type="button"
            onClick={() => onChange({ locked: true })}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 text-[0.74rem] font-medium transition-colors",
              door.locked
                ? "bg-card text-foreground shadow-[0_1px_2px_-1px_rgba(0,0,0,0.18)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="size-1.5 rounded-full bg-rose-500" />
            Locked
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Width (m)
        </Label>
        <div className="flex items-center gap-3">
          <Slider
            min={0.6}
            max={2.4}
            step={0.05}
            value={[door.widthMeters]}
            onValueChange={(v) => onChange({ widthMeters: pickValue(v) })}
            className="flex-1"
          />
          <div className="font-mono text-sm w-12 text-right">
            {door.widthMeters.toFixed(2)}
          </div>
        </div>
      </div>

      <Separator />

      <DoorLockSection
        lock={door.lock}
        onChange={(lock) => onChange({ lock })}
      />

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Controlled by reader
        </Label>
        <select
          value={controllingReader?.id ?? ""}
          onChange={(e) =>
            setControllingReader(e.target.value ? e.target.value : null)
          }
          className="w-full rounded-md border border-border bg-background/40 px-2 py-1.5 text-[0.85rem] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        >
          <option value="">— None —</option>
          {readers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label || `Reader ${r.id.slice(-4)}`}
            </option>
          ))}
        </select>
        {readers.length === 0 && (
          <div className="text-[0.7rem] text-muted-foreground/70">
            Drop a card or biometric reader onto the canvas to link it here.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Input
          value={door.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Anything to remember…"
        />
      </div>

      <Separator />

      <Button
        variant="outline"
        className="w-full text-destructive hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
        Remove door
      </Button>
    </div>
  );
}

/* ── Door lock spec ────────────────────────────────────────────────────
   Hardware spec for the lock on a door: mechanism type, brand, model,
   voltage, fail mode, etc. Optional — empty type means "no spec". When
   the user picks a type, the relevant follow-up fields appear. */
const LOCK_TYPE_OPTIONS: { value: LockType; label: string }[] = [
  { value: "mag-lock", label: "Mag lock (electromagnetic)" },
  { value: "electric-strike", label: "Electric strike" },
  { value: "electric-bolt", label: "Electric drop-bolt" },
  { value: "magnetic-shear", label: "Magnetic shear (recessed)" },
  { value: "smart-deadbolt", label: "Smart deadbolt (Schlage, Yale…)" },
  { value: "smart-mortise", label: "Smart mortise (Salto, dormakaba…)" },
  { value: "exit-device", label: "Exit device (crash bar)" },
];

function DoorLockSection({
  lock,
  onChange,
}: {
  lock: DoorLock | undefined;
  onChange: (lock: DoorLock | undefined) => void;
}) {
  function patch(partial: Partial<DoorLock>) {
    // Don't overwrite required fields with empty strings when patching;
    // brand and model can be empty while the user is filling them in.
    const base: DoorLock = lock ?? { type: "mag-lock", brand: "", model: "" };
    onChange({ ...base, ...partial });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          Lock hardware
        </Label>
        {lock && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[0.68rem] text-muted-foreground hover:text-destructive transition-colors"
            title="Clear lock spec"
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-2">
        <select
          value={lock?.type ?? ""}
          onChange={(e) => {
            const v = e.target.value as LockType | "";
            if (!v) onChange(undefined);
            else patch({ type: v });
          }}
          className="w-full rounded-md border border-border bg-background/40 px-2 py-1.5 text-[0.85rem] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        >
          <option value="">— No lock hardware —</option>
          {LOCK_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {lock && (
        <div className="space-y-3 rounded-md border border-border/60 bg-background/30 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[0.68rem] text-muted-foreground">
                Brand
              </Label>
              <Input
                value={lock.brand}
                onChange={(e) => patch({ brand: e.target.value })}
                placeholder="HID, Schlage, Salto…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.68rem] text-muted-foreground">
                Model
              </Label>
              <Input
                value={lock.model}
                onChange={(e) => patch({ model: e.target.value })}
                placeholder="HES 9600, Encode…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[0.68rem] text-muted-foreground">
                Voltage
              </Label>
              <select
                value={lock.voltage ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  patch({ voltage: v === "12" ? 12 : v === "24" ? 24 : undefined });
                }}
                className="w-full rounded-md border border-border bg-background/40 px-2 py-1.5 text-[0.82rem] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
              >
                <option value="">—</option>
                <option value="12">12 VDC</option>
                <option value="24">24 VDC</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[0.68rem] text-muted-foreground">
                Current draw (A)
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.05"
                min="0"
                value={lock.currentDrawA ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patch({
                    currentDrawA: Number.isFinite(n) && n > 0 ? n : undefined,
                  });
                }}
                placeholder="0.50"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[0.68rem] text-muted-foreground">
              Fail mode
            </Label>
            <div className="flex items-center gap-px rounded-md bg-foreground/[0.05] p-0.5">
              {(["fail-safe", "fail-secure"] as LockFailMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => patch({ failMode: m })}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 text-[0.72rem] font-medium transition-colors",
                    lock.failMode === m
                      ? "bg-card text-foreground shadow-[0_1px_2px_-1px_rgba(0,0,0,0.18)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "fail-safe" ? "Fail-safe (unlock on power loss)" : "Fail-secure (stay locked)"}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
            <input
              type="checkbox"
              checked={lock.weatherRated === true}
              onChange={(e) =>
                patch({ weatherRated: e.target.checked ? true : undefined })
              }
              className="rounded border-border"
            />
            Weather-rated (exterior)
          </label>

          <div className="space-y-1">
            <Label className="text-[0.68rem] text-muted-foreground">
              Notes
            </Label>
            <Input
              value={lock.notes ?? ""}
              onChange={(e) =>
                patch({ notes: e.target.value || undefined })
              }
              placeholder="Compatible with… / power-supply note"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Network device fields ─────────────────────────────────────────────
   Subtype-aware: access-points get coverage radius + Wi-Fi standard,
   switches get port count + PoE budget, NVRs get channels + storage +
   retention. Replaces the previous bare "coverage only" block. */
function NetworkDeviceFields({
  device,
  onChange,
}: {
  device: Extract<Device, { type: "network" }>;
  onChange: (partial: Partial<Device>) => void;
}) {
  const subtype = device.networkType;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[0.78rem] font-medium text-foreground/85">
          {subtype === "nvr"
            ? "Recorder specs"
            : subtype === "switch"
              ? "Switch specs"
              : "Wireless coverage"}
        </div>
        <span className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[0.62rem] uppercase tracking-wider text-muted-foreground">
          {subtype === "access-point" ? "AP" : subtype === "nvr" ? "NVR" : "Switch"}
        </span>
      </div>

      {subtype === "access-point" && (
        <>
          <NumberSlider
            label="Coverage radius (m)"
            min={1}
            max={50}
            step={0.5}
            value={device.coverageMeters ?? 15}
            display={(v) => v.toFixed(1)}
            onChange={(v) =>
              onChange({ coverageMeters: v } as Partial<Device>)
            }
          />
          <SelectField
            label="Wi-Fi standard"
            value={device.wifiStandard ?? "Wi-Fi 6"}
            options={["Wi-Fi 5", "Wi-Fi 6", "Wi-Fi 6E", "Wi-Fi 7"]}
            onChange={(v) =>
              onChange({ wifiStandard: v } as Partial<Device>)
            }
          />
        </>
      )}

      {subtype === "switch" && (
        <>
          <NumberSlider
            label="Port count"
            min={4}
            max={48}
            step={4}
            value={device.portCount ?? 24}
            display={(v) => `${Math.round(v)}`}
            onChange={(v) =>
              onChange({ portCount: Math.round(v) } as Partial<Device>)
            }
          />
          <NumberSlider
            label="PoE budget (W)"
            min={0}
            max={1000}
            step={30}
            value={device.poeBudgetW ?? 370}
            display={(v) => `${Math.round(v)} W`}
            onChange={(v) =>
              onChange({ poeBudgetW: Math.round(v) } as Partial<Device>)
            }
          />
          <PoeSummary
            portCount={device.portCount ?? 24}
            poeBudgetW={device.poeBudgetW ?? 370}
          />
        </>
      )}

      {subtype === "nvr" && (
        <>
          <NumberSlider
            label="Channels"
            min={4}
            max={128}
            step={4}
            value={device.portCount ?? 32}
            display={(v) => `${Math.round(v)} ch`}
            onChange={(v) =>
              onChange({ portCount: Math.round(v) } as Partial<Device>)
            }
          />
          <NumberSlider
            label="Storage (TB)"
            min={1}
            max={120}
            step={1}
            value={device.storageTb ?? 16}
            display={(v) => `${Math.round(v)} TB`}
            onChange={(v) =>
              onChange({ storageTb: Math.round(v) } as Partial<Device>)
            }
          />
          <NumberSlider
            label="Retention (days)"
            min={7}
            max={180}
            step={1}
            value={device.retentionDays ?? 30}
            display={(v) => `${Math.round(v)} d`}
            onChange={(v) =>
              onChange({ retentionDays: Math.round(v) } as Partial<Device>)
            }
          />
        </>
      )}
    </div>
  );
}

function NumberSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="font-mono text-[0.78rem] text-foreground/90 tabular-nums">
          {display(value)}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(pickValue(v))}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background/40 px-2 py-1.5 text-[0.85rem] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Quick "is this switch realistic?" summary for the user.
 *  - Estimates average power per PoE+ camera (~25 W) so the user sees
 *    "supports ~14 PoE+ cameras" rather than just a raw 370 W number.
 */
function PoeSummary({
  portCount,
  poeBudgetW,
}: {
  portCount: number;
  poeBudgetW: number;
}) {
  const poeCameras = Math.floor(poeBudgetW / 25);
  const usableCameras = Math.min(poeCameras, portCount);
  return (
    <div className="rounded-md bg-foreground/[0.04] px-2.5 py-1.5 text-[0.72rem] leading-snug text-muted-foreground">
      Supports ~{usableCameras} PoE+ cameras (25 W ea) ·{" "}
      {portCount - usableCameras > 0
        ? `${portCount - usableCameras} ports left for non-PoE`
        : "all ports loaded"}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Edit a single annotation — change kind, text, or delete. Selected via the
 * canvas marker or via the AI chat's `add_annotation` tool (which sets the
 * marker and then leaves the user to refine).
 */
function AnnotationForm({
  annotation,
  onChange,
  onDelete,
}: {
  annotation: Annotation;
  onChange: (partial: Partial<Annotation>) => void;
  onDelete: () => void;
}) {
  const Icon =
    annotation.kind === "warning"
      ? TriangleAlert
      : annotation.kind === "idea"
        ? Lightbulb
        : StickyNote;
  const accent =
    annotation.kind === "warning"
      ? "text-orange-600 dark:text-orange-300 bg-orange-500/15 ring-orange-500/30"
      : annotation.kind === "idea"
        ? "text-violet-700 dark:text-violet-300 bg-violet-500/15 ring-violet-500/30"
        : "text-yellow-800 dark:text-yellow-200 bg-yellow-500/20 ring-yellow-500/30";
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.72rem] font-medium ring-1",
          accent,
        )}
      >
        <Icon className="size-3" strokeWidth={2.2} />
        {annotation.kind === "warning"
          ? "Warning"
          : annotation.kind === "idea"
            ? "Idea"
            : "Note"}
        {annotation.author === "ai" && (
          <span className="ml-1 text-[0.62rem] opacity-70">✦ AI</span>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-[0.78rem]">Text</Label>
        <textarea
          rows={4}
          value={annotation.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-[0.82rem] leading-relaxed outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[0.78rem]">Kind</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {(["note", "warning", "idea"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ kind: k })}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[0.74rem] capitalize transition-colors",
                annotation.kind === k
                  ? "border-foreground/40 bg-foreground/[0.06] font-medium"
                  : "border-border/50 text-muted-foreground hover:bg-foreground/[0.04]",
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div className="text-[0.7rem] text-muted-foreground">
        Pinned at ({annotation.position.x.toFixed(0)},{" "}
        {annotation.position.y.toFixed(0)})
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onDelete}
        className="w-full text-rose-600 hover:bg-rose-500/[0.08] hover:text-rose-600"
      >
        <Trash2 className="size-3.5" />
        Delete annotation
      </Button>
    </div>
  );
}

/**
 * Cable properties form. Lets a pro change the cable type (Cat6 ↔
 * Cat6a ↔ 22/4 ↔ fiber etc.), override the auto-picked color for
 * run-grouping in the permit drawings, add notes ("plenum-rated; via
 * IDF-2 riser"), and delete the run.
 */
function CableForm({
  cable,
  devices,
  onChange,
  onDelete,
}: {
  cable: Cable;
  devices: Device[];
  onChange: (partial: Partial<Cable>) => void;
  onDelete: () => void;
}) {
  const src = devices.find((d) => d.id === cable.sourceDeviceId);
  const tgt = devices.find((d) => d.id === cable.targetDeviceId);
  const color = cable.color ?? CABLE_COLORS[cable.type];

  // Total length for display (source → waypoints → target in pixels,
  // then we need a scale — we DON'T have it here, so just show segment
  // count + waypoint count instead. Length appears in the cable label
  // on the canvas already.)
  const segCount = cable.waypoints.length + 1;

  // Friendly cable-type options
  const TYPE_OPTS: CableType[] = [
    "cat6",
    "cat6a",
    "fiber",
    "22-4",
    "18-2",
    "16-2",
    "rg59",
    "speaker-16-2",
  ];

  return (
    <div className="space-y-4">
      {/* Endpoints summary — read-only since drag-to-rewire would
          duplicate the wire tool. */}
      <div className="rounded-lg border border-border/60 bg-card/40 p-3">
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Endpoints
        </div>
        <div className="mt-1.5 space-y-1 text-[0.78rem]">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <span className="text-muted-foreground">From</span>
            <span className="font-medium text-foreground/95 truncate">
              {src?.label ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="ml-[7px] inline-block h-3 w-px bg-border/70" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <span className="text-muted-foreground">To</span>
            <span className="font-medium text-foreground/95 truncate">
              {tgt?.label ?? "—"}
            </span>
          </div>
        </div>
        <div className="mt-2 text-[0.7rem] text-muted-foreground/75">
          {segCount} segment{segCount === 1 ? "" : "s"}
          {cable.waypoints.length > 0 &&
            ` · ${cable.waypoints.length} bend${cable.waypoints.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {/* Cable type */}
      <div>
        <Label
          htmlFor="cable-type"
          className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          Cable type
        </Label>
        <select
          id="cable-type"
          value={cable.type}
          onChange={(e) =>
            onChange({
              type: e.target.value as CableType,
              // Reset any color override when changing type so the new
              // type's default color takes effect — the user can pick a
              // new override below if they still want one.
              color: undefined,
            })
          }
          className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-2 text-[0.82rem] focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
        >
          {TYPE_OPTS.map((t) => (
            <option key={t} value={t}>
              {CABLE_LABELS[t]}
            </option>
          ))}
        </select>
        <div className="mt-1 text-[0.66rem] text-muted-foreground/70">
          Drives the cable schedule + bill of materials line.
        </div>
      </div>

      {/* Color override */}
      <div>
        <Label className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Color
        </Label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-md border border-border bg-background"
            aria-label="Cable display color"
          />
          <Input
            value={color}
            onChange={(e) => onChange({ color: e.target.value })}
            placeholder="#2563eb"
            className="h-9 flex-1 font-mono text-[0.78rem]"
          />
          {cable.color && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ color: undefined })}
              className="h-9 px-2 text-[0.72rem]"
            >
              Reset
            </Button>
          )}
        </div>
        <div className="mt-1 text-[0.66rem] text-muted-foreground/70">
          Useful for grouping runs by zone (e.g. all 1st-floor cameras green).
        </div>
      </div>

      {/* Label override */}
      <div>
        <Label
          htmlFor="cable-label"
          className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          Label
        </Label>
        <Input
          id="cable-label"
          value={cable.label ?? ""}
          onChange={(e) =>
            onChange({ label: e.target.value || undefined })
          }
          placeholder={CABLE_LABELS[cable.type]}
          className="mt-1.5"
        />
      </div>

      {/* Notes */}
      <div>
        <Label
          htmlFor="cable-notes"
          className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-muted-foreground"
        >
          Notes
        </Label>
        <textarea
          id="cable-notes"
          value={cable.notes ?? ""}
          onChange={(e) =>
            onChange({ notes: e.target.value || undefined })
          }
          placeholder="e.g. plenum-rated jacket; via IDF-2 riser; pull with #4 messenger"
          rows={3}
          className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[0.78rem] outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <Separator />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="w-full justify-start gap-2 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400"
      >
        <Trash2 className="size-3.5" />
        Delete cable
      </Button>
    </div>
  );
}
