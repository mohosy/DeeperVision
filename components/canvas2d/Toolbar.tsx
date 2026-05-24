"use client";

import {
  DoorOpen,
  Eye,
  EyeOff,
  Cable as CableIcon,
  Maximize,
  MousePointer2,
  Move,
  Ruler,
  Square,
  Undo2,
  Redo2,
  ImagePlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDesignStore } from "@/lib/store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDesignStoreUndo, useDesignStoreRedo } from "@/lib/use-history";

interface ToolbarProps {
  onFit: () => void;
  onUpload: () => void;
}

/**
 * Floating toolbar — refined as a single column rail with subtle
 * background instead of a hard "card on canvas" look. Tools group
 * by purpose with gentle whitespace, not visible dividers.
 */
export function Canvas2DToolbar({ onFit, onUpload }: ToolbarProps) {
  const tool = useDesignStore((s) => s.tool);
  const setTool = useDesignStore((s) => s.setTool);
  const showCoverage = useDesignStore((s) => s.showCoverage);
  const toggleCoverage = useDesignStore((s) => s.toggleCoverage);
  const { undo, canUndo } = useDesignStoreUndo();
  const { redo, canRedo } = useDesignStoreRedo();

  return (
    <div className="absolute left-3 top-3 z-20 flex flex-col gap-0.5 rounded-2xl bg-background/55 p-1 backdrop-blur-xl ring-1 ring-black/[0.04] dark:ring-white/[0.05] shadow-[0_4px_24px_-12px_rgba(0,0,0,0.18)]">
      <ToolButton
        icon={MousePointer2}
        label="Select"
        shortcut="V"
        active={tool === "select"}
        onClick={() => setTool("select")}
      />
      <ToolButton
        icon={Square}
        label="Draw wall"
        shortcut="W"
        active={tool === "wall"}
        onClick={() => setTool("wall")}
      />
      <ToolButton
        icon={DoorOpen}
        label="Place door (click a wall)"
        shortcut="D"
        active={tool === "door"}
        onClick={() => setTool("door")}
      />
      <ToolButton
        icon={Ruler}
        label="Calibrate scale"
        shortcut="C"
        active={tool === "calibrate"}
        onClick={() => setTool("calibrate")}
      />
      <ToolButton
        icon={Move}
        label="Adjust walls (drag endpoints to match the floor plan)"
        shortcut="E"
        active={tool === "correct-walls"}
        onClick={() => setTool("correct-walls")}
      />
      <ToolButton
        icon={CableIcon}
        label="Wire (click source device, click target — Shift-click to bend)"
        shortcut="X"
        active={tool === "wire"}
        onClick={() => setTool("wire")}
      />

      <Spacer />

      <ToolButton
        icon={ImagePlus}
        label="Upload floor plan"
        onClick={onUpload}
      />
      <ToolButton
        icon={Maximize}
        label="Fit to content"
        shortcut="F"
        onClick={onFit}
      />
      <ToolButton
        icon={showCoverage ? Eye : EyeOff}
        label={showCoverage ? "Hide coverage" : "Show coverage"}
        onClick={toggleCoverage}
        muted={!showCoverage}
      />

      <Spacer />

      <ToolButton
        icon={Undo2}
        label="Undo"
        shortcut="⌘Z"
        onClick={undo}
        disabled={!canUndo}
      />
      <ToolButton
        icon={Redo2}
        label="Redo"
        shortcut="⌘⇧Z"
        onClick={redo}
        disabled={!canRedo}
      />
    </div>
  );
}

function Spacer() {
  return <div className="h-2" aria-hidden="true" />;
}

function ToolButton({
  icon: Icon,
  label,
  shortcut,
  active,
  onClick,
  disabled,
  muted,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
            className={cn(
              "flex size-9 items-center justify-center rounded-xl transition-all duration-150",
              "disabled:opacity-30 disabled:cursor-not-allowed",
              active
                ? "bg-primary/15 text-primary ring-1 ring-primary/30 shadow-[inset_0_1px_0_oklch(1_0_0/8%)]"
                : muted
                  ? "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.06]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
            )}
          >
            <Icon className="size-[17px]" strokeWidth={1.7} />
          </button>
        }
      />
      <TooltipContent side="right" sideOffset={8}>
        <span className="flex items-center gap-2">
          <span>{label}</span>
          {shortcut && (
            <kbd className="rounded border border-border/40 bg-background/40 px-1 py-px font-mono text-[10px] text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
