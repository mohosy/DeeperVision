"use client";

import { Eye, MousePointer2, Play } from "lucide-react";
import { useDesignStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const modes = [
  { value: "3d" as const, label: "3D", icon: Eye },
  { value: "2d" as const, label: "2D", icon: MousePointer2 },
  { value: "sim" as const, label: "Sim", icon: Play },
];

/**
 * Refined segmented control. Uses a single sliding pill behind the
 * active button so transitions feel smooth, not snappy. Frosted
 * background, subtle ring instead of a hard border.
 */
export function ModeSwitcher() {
  const mode = useDesignStore((s) => s.viewMode);
  const setMode = useDesignStore((s) => s.setViewMode);

  const activeIndex = modes.findIndex((m) => m.value === mode);

  return (
    <div
      data-tour="mode-switcher"
      className="relative inline-flex items-center rounded-full bg-foreground/[0.04] p-0.5 ring-1 ring-black/[0.04] dark:ring-white/[0.05]"
    >
      {/* Sliding pill — sits behind the active button */}
      <div
        className="absolute top-0.5 bottom-0.5 rounded-full bg-card shadow-[0_1px_2px_-1px_rgba(0,0,0,0.18),inset_0_1px_0_oklch(1_0_0/12%)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] transition-transform duration-[280ms] ease-[cubic-bezier(0.22,0.68,0.35,1)]"
        style={{
          width: `calc((100% - 0.25rem) / ${modes.length})`,
          transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 0}px))`,
        }}
        aria-hidden="true"
      />
      {modes.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.82rem] font-medium tracking-[-0.005em] transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground/80 hover:text-foreground"
            )}
            type="button"
          >
            <m.icon className="size-3.5" strokeWidth={1.8} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
