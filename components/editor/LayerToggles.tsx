"use client";

import { Camera, Cable, KeyRound, Radar, Wifi } from "lucide-react";
import { useDesignStore } from "@/lib/store";
import { useActiveFloor } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { DeviceType, InstallStatus } from "@/types/design";

/**
 * Floating chip strip at the top-center of the canvas. Lets the user toggle
 * visibility by device category and by install status (Proposed / Installed
 * / Decommissioned). The strip auto-shows the live count of each filter so
 * you can see at a glance how many of each are on the floor.
 */
export function LayerToggles() {
  const visibility = useDesignStore((s) => s.visibility);
  const toggleType = useDesignStore((s) => s.toggleDeviceTypeVisible);
  const toggleStatus = useDesignStore((s) => s.toggleInstallStatusVisible);
  const showCabling = useDesignStore((s) => s.showCabling);
  const toggleCabling = useDesignStore((s) => s.toggleCabling);
  const floor = useActiveFloor();

  if (!floor) return null;

  const counts = countDevices(floor.devices);

  const TYPE_ITEMS: {
    key: DeviceType;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    color: string;
  }[] = [
    { key: "camera", label: "Cameras", icon: Camera, color: "bg-blue-500" },
    { key: "reader", label: "Access", icon: KeyRound, color: "bg-sky-500" },
    { key: "sensor", label: "Sensors", icon: Radar, color: "bg-amber-500" },
    { key: "network", label: "Network", icon: Wifi, color: "bg-violet-500" },
  ];

  const STATUS_ITEMS: {
    key: InstallStatus;
    label: string;
    dot: string;
  }[] = [
    { key: "proposed", label: "Proposed", dot: "bg-foreground/30" },
    { key: "installed", label: "Installed", dot: "bg-emerald-500" },
    { key: "decommissioned", label: "Retired", dot: "bg-rose-400" },
  ];

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1.5">
      {/* Category toggles */}
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-background/65 p-0.5 backdrop-blur-xl ring-1 ring-black/[0.04] dark:ring-white/[0.05] shadow-[0_4px_18px_-10px_rgba(0,0,0,0.18)]">
        {TYPE_ITEMS.map(({ key, label, icon: Icon, color }) => {
          const on = visibility.byType[key];
          const n = counts.byType[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleType(key)}
              title={`${on ? "Hide" : "Show"} ${label.toLowerCase()}`}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.74rem] font-medium transition-colors",
                on
                  ? "text-foreground"
                  : "text-muted-foreground/55 hover:text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  on ? color : "bg-muted-foreground/40",
                )}
                aria-hidden="true"
              />
              <Icon className="size-3.5" strokeWidth={1.7} />
              <span className="tabular-nums text-muted-foreground/85">
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cabling toggle — single pill, mirrors the visual language of the
          category chips. Lives between category + status so the eye groups
          it with "what's drawn on the canvas". */}
      <div className="pointer-events-auto flex items-center rounded-full bg-background/65 p-0.5 backdrop-blur-xl ring-1 ring-black/[0.04] dark:ring-white/[0.05] shadow-[0_4px_18px_-10px_rgba(0,0,0,0.18)]">
        <button
          type="button"
          onClick={toggleCabling}
          title={`${showCabling ? "Hide" : "Show"} cable runs`}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.74rem] font-medium transition-colors",
            showCabling
              ? "text-foreground"
              : "text-muted-foreground/55 hover:text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              showCabling ? "bg-teal-500" : "bg-muted-foreground/40",
            )}
            aria-hidden="true"
          />
          <Cable className="size-3.5" strokeWidth={1.7} />
          <span>Wiring</span>
        </button>
      </div>

      {/* Status toggles */}
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-background/65 p-0.5 backdrop-blur-xl ring-1 ring-black/[0.04] dark:ring-white/[0.05] shadow-[0_4px_18px_-10px_rgba(0,0,0,0.18)]">
        {STATUS_ITEMS.map(({ key, label, dot }) => {
          const on = visibility.byStatus[key];
          const n = counts.byStatus[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleStatus(key)}
              title={`${on ? "Hide" : "Show"} ${label.toLowerCase()} devices`}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.74rem] font-medium transition-colors",
                on
                  ? "text-foreground"
                  : "text-muted-foreground/55 hover:text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  on ? dot : "bg-muted-foreground/40",
                )}
                aria-hidden="true"
              />
              <span>{label}</span>
              <span className="tabular-nums text-muted-foreground/85">
                {n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function countDevices(
  devices: { type: DeviceType; installStatus?: InstallStatus }[],
): {
  byType: Record<DeviceType, number>;
  byStatus: Record<InstallStatus, number>;
} {
  const byType: Record<DeviceType, number> = {
    camera: 0,
    reader: 0,
    sensor: 0,
    network: 0,
  };
  const byStatus: Record<InstallStatus, number> = {
    proposed: 0,
    installed: 0,
    decommissioned: 0,
  };
  for (const d of devices) {
    byType[d.type] = (byType[d.type] ?? 0) + 1;
    const s = d.installStatus ?? "proposed";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  return { byType, byStatus };
}
