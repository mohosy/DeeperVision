"use client";

import {
  Eye,
  EyeOff,
  Maximize,
  MousePointer2,
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

export function Canvas2DToolbar({ onFit, onUpload }: ToolbarProps) {
  const tool = useDesignStore((s) => s.tool);
  const setTool = useDesignStore((s) => s.setTool);
  const showCoverage = useDesignStore((s) => s.showCoverage);
  const toggleCoverage = useDesignStore((s) => s.toggleCoverage);
  const { undo, canUndo } = useDesignStoreUndo();
  const { redo, canRedo } = useDesignStoreRedo();

  return (
    <div className="absolute left-3 top-3 z-20 flex flex-col gap-1.5 rounded-xl border border-border bg-card/85 p-1.5 shadow-2xl backdrop-blur">
      <ToolGroup>
        <ToolButton
          icon={MousePointer2}
          label="Select (V)"
          active={tool === "select"}
          onClick={() => setTool("select")}
        />
        <ToolButton
          icon={Square}
          label="Draw wall (W)"
          active={tool === "wall"}
          onClick={() => setTool("wall")}
        />
        <ToolButton
          icon={Ruler}
          label="Calibrate scale (C)"
          active={tool === "calibrate"}
          onClick={() => setTool("calibrate")}
        />
      </ToolGroup>

      <Divider />

      <ToolGroup>
        <ToolButton icon={ImagePlus} label="Upload floor plan" onClick={onUpload} />
        <ToolButton icon={Maximize} label="Fit to content (F)" onClick={onFit} />
        <ToolButton
          icon={showCoverage ? Eye : EyeOff}
          label={showCoverage ? "Hide coverage" : "Show coverage"}
          onClick={toggleCoverage}
          highlighted={!showCoverage}
        />
      </ToolGroup>

      <Divider />

      <ToolGroup>
        <ToolButton
          icon={Undo2}
          label="Undo (⌘Z)"
          onClick={undo}
          disabled={!canUndo}
        />
        <ToolButton
          icon={Redo2}
          label="Redo (⌘⇧Z)"
          onClick={redo}
          disabled={!canRedo}
        />
      </ToolGroup>
    </div>
  );
}

function ToolGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function Divider() {
  return <div className="h-px w-full bg-border/60" />;
}

function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
  disabled,
  highlighted,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              active
                ? "border-primary bg-primary/20 text-primary"
                : highlighted
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
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
