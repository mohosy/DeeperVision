"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Box, Camera, Compass, Move3d, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const Scene3DCanvas = dynamic(
  () => import("./Scene3DCanvas").then((m) => m.Scene3DCanvas),
  { ssr: false }
);

export function Scene3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const floor = useActiveFloor();
  const showCoverage = useDesignStore((s) => s.showCoverage);
  const toggleCoverage = useDesignStore((s) => s.toggleCoverage);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const isEmpty =
    !floor || (floor.devices.length === 0 && floor.walls.length === 0);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[oklch(0.115_0_0)]">
      {size.width > 0 && size.height > 0 && !isEmpty && (
        <Scene3DCanvas width={size.width} height={size.height} />
      )}

      {isEmpty && <EmptyState />}

      <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-1.5">
        <div className="pointer-events-auto rounded-xl border border-border bg-card/85 p-1.5 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-1">
            <ModeButton icon={Move3d} label="Orbit" active />
            <ModeButton
              icon={Camera}
              label="First-person walkthrough (coming in M4)"
              disabled
            />
          </div>
          <div className="my-1 h-px w-full bg-border/60" />
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleCoverage}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg border transition-colors",
                    showCoverage
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Sparkles className="size-4" />
                </button>
              }
            />
            <TooltipContent side="right">
              {showCoverage ? "Hide coverage" : "Show coverage"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
        <Compass className="size-3.5 text-primary" />
        <span>Drag to orbit · Scroll to zoom · Right-click to pan</span>
      </div>
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  active,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              active
                ? "border-primary bg-primary/20 text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <Icon className="size-4" />
          </button>
        }
      />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function EmptyState() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="max-w-md text-center px-8">
        <div className="inline-flex items-center justify-center rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
          <Box className="size-7 text-primary" />
        </div>
        <h3 className="mt-5 text-2xl font-semibold tracking-tight">
          Place something in 2D first
        </h3>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Switch back to <span className="font-mono">2D</span>, draw a wall or
          drag a camera onto the canvas, then come back here. Your design will
          extrude into the world in real time.
        </p>
      </div>
    </div>
  );
}
