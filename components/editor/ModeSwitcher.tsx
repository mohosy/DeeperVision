"use client";

import { Eye, MousePointer2, Play } from "lucide-react";
import { useDesignStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const modes = [
  { value: "2d" as const, label: "2D", icon: MousePointer2 },
  { value: "3d" as const, label: "3D", icon: Eye },
  { value: "sim" as const, label: "Sim", icon: Play },
];

export function ModeSwitcher() {
  const mode = useDesignStore((s) => s.viewMode);
  const setMode = useDesignStore((s) => s.setViewMode);

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-card/50 p-1 shadow-[inset_0_1px_0_oklch(1_0_0/4%)]">
      {modes.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.85rem] font-medium tracking-[-0.005em] transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/18%),0_2px_8px_-4px_oklch(0.78_0.135_158/55%)]"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
            )}
            type="button"
          >
            <m.icon className="size-3.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
