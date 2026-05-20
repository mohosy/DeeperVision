"use client";

import { useActiveFloor, useDesignStore } from "@/lib/store";
import { FloorSwitcher } from "./FloorSwitcher";

export function StatusBar() {
  const floor = useActiveFloor();
  const mode = useDesignStore((s) => s.viewMode);

  return (
    <div className="flex h-10 items-center justify-between gap-3 border-t border-border/70 bg-sidebar px-3">
      <FloorSwitcher />
      <div className="flex items-center gap-3 text-[0.72rem] text-muted-foreground font-mono">
        <Stat label="Devices" value={floor?.devices.length ?? 0} />
        <Dot />
        <Stat label="Walls" value={floor?.walls.length ?? 0} />
        <Dot />
        <Stat label="Scale" value={`${floor?.scale ?? 0} px/m`} />
        <Dot />
        <Stat label="Mode" value={mode.toUpperCase()} accent />
      </div>
    </div>
  );
}

function Dot() {
  return <span className="opacity-50">·</span>;
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="uppercase tracking-[0.08em] opacity-70">{label}</span>
      <span
        className={
          accent ? "text-primary" : "text-foreground/90"
        }
      >
        {value}
      </span>
    </span>
  );
}
