"use client";

import { PanelRightClose, Sparkles, SlidersHorizontal } from "lucide-react";
import { useDesignStore } from "@/lib/store";
import { PropertiesPanel } from "./PropertiesPanel";
import { AIChatPanel } from "@/components/ai/AIChatPanel";
import { cn } from "@/lib/utils";

/**
 * The right column of the editor. Hosts a tiny tab strip at the top —
 * "Properties" and "AI Chat" — and renders the active tab below.
 *
 * The AI Chat lives inline here (no overlay, no backdrop). The user
 * toggles between Properties and Chat in the same column, which makes
 * the assistant feel like a built-in part of the editor rather than a
 * popup.
 *
 * Width is fixed at the parent level (currently w-80 in EditorShell);
 * both panels are responsible for fitting that width gracefully.
 */
export function RightSidebar({
  onCollapse,
}: { onCollapse?: () => void } = {}) {
  const tab = useDesignStore((s) => s.rightTab);
  const setTab = useDesignStore((s) => s.setRightTab);

  return (
    <aside className="flex h-full w-full flex-col border-l border-border/70 bg-sidebar">
      {/* Tab strip — the only structural divider in the panel. Kept
          subtle (border/40) so it doesn't feel like a hard horizontal
          line stacked under everything else below. */}
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border/40 bg-background/30 px-1.5">
        <TabButton
          active={tab === "properties"}
          onClick={() => setTab("properties")}
          icon={<SlidersHorizontal className="size-3.5" strokeWidth={1.9} />}
          label="Properties"
        />
        <span data-tour="ai-tab" className="inline-flex">
          <TabButton
            active={tab === "ai"}
            onClick={() => setTab("ai")}
            icon={
              <span className="relative inline-flex">
                <Sparkles className="size-3.5 text-primary" strokeWidth={1.9} />
                {tab !== "ai" && (
                  <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </span>
            }
            label="AI"
            accent
          />
        </span>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse panel"
            aria-label="Collapse panel"
            className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
          >
            <PanelRightClose className="size-3.5" strokeWidth={1.7} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "properties" ? <PropertiesPanel /> : <AIChatPanel />}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.76rem] font-medium tracking-[-0.005em] transition-colors",
        active
          ? accent
            ? "bg-primary/10 text-primary"
            : "bg-foreground/[0.07] text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
