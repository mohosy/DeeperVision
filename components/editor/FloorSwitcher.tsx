"use client";

import { Plus } from "lucide-react";
import { useCurrentDesign, useDesignStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function FloorSwitcher() {
  const design = useCurrentDesign();
  const setActive = useDesignStore((s) => s.setActiveFloor);
  const addFloor = useDesignStore((s) => s.addFloor);

  if (!design) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {design.floors.map((floor) => {
        const active = design.activeFloorId === floor.id;
        return (
          <button
            key={floor.id}
            type="button"
            onClick={() => setActive(floor.id)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[0.75rem] font-medium tracking-[-0.005em] transition-colors",
              active
                ? "bg-primary/15 text-primary border border-primary/40"
                : "border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {floor.name}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => addFloor()}
        className="ml-1 inline-flex items-center gap-1 rounded-md border border-dashed border-border/70 px-2 py-1 text-[0.72rem] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      >
        <Plus className="size-3" />
        Add floor
      </button>
    </div>
  );
}
