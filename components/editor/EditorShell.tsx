"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { useDesignStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { TopBar } from "./TopBar";
import { LibraryPanel } from "./LibraryPanel";
import { RightSidebar } from "./RightSidebar";
import { StatusBar } from "./StatusBar";
import { Canvas2D } from "@/components/canvas2d/Canvas2D";
import { Scene3D } from "@/components/scene3d/Scene3D";
import { SimView } from "@/components/simulation/SimView";
import { AISurveyDialog } from "@/components/ai/AISurveyDialog";
import { AIAdvisorPanel } from "@/components/ai/AIAdvisorPanel";
import { QuoteDrawer } from "@/components/quote/QuoteDrawer";
import { EditorTour } from "./EditorTour";

function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

/* Sidebar width clamps. The library + the right panel can both be resized
   by dragging a thin handle between them and the canvas. */
const LIBRARY_MIN = 200;
const LIBRARY_MAX = 420;
const LIBRARY_DEFAULT = 256;

const RIGHT_MIN = 280;
const RIGHT_MAX = 600;
const RIGHT_DEFAULT = 360;

/** Width of the thin rail shown when a sidebar is collapsed. */
const RAIL_WIDTH = 32;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Persisted sidebar widths — keyed independent of design id. */
function loadWidths(): { library: number; right: number } {
  if (typeof window === "undefined")
    return { library: LIBRARY_DEFAULT, right: RIGHT_DEFAULT };
  try {
    const l = parseInt(localStorage.getItem("dv-library-width") ?? "", 10);
    const r = parseInt(localStorage.getItem("dv-right-width") ?? "", 10);
    return {
      library: clamp(
        Number.isFinite(l) ? l : LIBRARY_DEFAULT,
        LIBRARY_MIN,
        LIBRARY_MAX,
      ),
      right: clamp(
        Number.isFinite(r) ? r : RIGHT_DEFAULT,
        RIGHT_MIN,
        RIGHT_MAX,
      ),
    };
  } catch {
    return { library: LIBRARY_DEFAULT, right: RIGHT_DEFAULT };
  }
}

/** Persisted collapsed states for each sidebar. */
function loadCollapsed(): { library: boolean; right: boolean } {
  if (typeof window === "undefined") return { library: false, right: false };
  try {
    return {
      library: localStorage.getItem("dv-library-collapsed") === "1",
      right: localStorage.getItem("dv-right-collapsed") === "1",
    };
  } catch {
    return { library: false, right: false };
  }
}

export function EditorShell({ designId }: { designId: string }) {
  const ensureDesign = useDesignStore((s) => s.ensureDesign);
  const setCurrent = useDesignStore((s) => s.setCurrentDesign);
  const setViewMode = useDesignStore((s) => s.setViewMode);
  const mode = useDesignStore((s) => s.viewMode);
  const aiSurveyOpen = useDesignStore((s) => s.aiSurveyOpen);
  const setAISurveyOpen = useDesignStore((s) => s.setAISurveyOpen);
  const aiAdvisorOpen = useDesignStore((s) => s.aiAdvisorOpen);
  const setAIAdvisorOpen = useDesignStore((s) => s.setAIAdvisorOpen);
  const quoteOpen = useDesignStore((s) => s.quoteOpen);
  const setQuoteOpen = useDesignStore((s) => s.setQuoteOpen);
  const rightTab = useDesignStore((s) => s.rightTab);
  const setRightTab = useDesignStore((s) => s.setRightTab);
  const hydrated = useHasHydrated();

  // Resizable sidebar widths.
  const [libraryWidth, setLibraryWidth] = useState<number>(LIBRARY_DEFAULT);
  const [rightWidth, setRightWidth] = useState<number>(RIGHT_DEFAULT);
  // Collapsed state — when true, the panel becomes a 32px rail with an
  // expand-button icon. Persisted alongside widths so the editor remembers
  // your layout between sessions.
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  // Hydrate from localStorage after mount to avoid SSR/CSR mismatch.
  useEffect(() => {
    const w = loadWidths();
    setLibraryWidth(w.library);
    setRightWidth(w.right);
    const c = loadCollapsed();
    setLibraryCollapsed(c.library);
    setRightCollapsed(c.right);
  }, []);
  // Persist on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("dv-library-width", String(libraryWidth));
  }, [libraryWidth]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("dv-right-width", String(rightWidth));
  }, [rightWidth]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("dv-library-collapsed", libraryCollapsed ? "1" : "0");
  }, [libraryCollapsed]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("dv-right-collapsed", rightCollapsed ? "1" : "0");
  }, [rightCollapsed]);

  useEffect(() => {
    if (!hydrated) return;
    ensureDesign(designId);
    setCurrent(designId);
    // Boot every editor session into 3D — the headline view of the product
    // and the one the marketing site shows. Users can flip to 2D from the
    // mode switcher at any time.
    setViewMode("3d");
  }, [designId, ensureDesign, setCurrent, setViewMode, hydrated]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setRightTab(rightTab === "ai" ? "properties" : "ai");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rightTab, setRightTab]);

  if (!hydrated) {
    return <div className="flex h-screen items-center justify-center" />;
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <div
          style={{ width: libraryCollapsed ? RAIL_WIDTH : libraryWidth }}
          className="shrink-0"
        >
          {libraryCollapsed ? (
            <CollapsedRail
              side="left"
              label="Show library"
              onExpand={() => setLibraryCollapsed(false)}
            />
          ) : (
            <LibraryPanel onCollapse={() => setLibraryCollapsed(true)} />
          )}
        </div>
        {!libraryCollapsed && (
          <ResizeHandle
            onDelta={(d) =>
              setLibraryWidth((w) => clamp(w + d, LIBRARY_MIN, LIBRARY_MAX))
            }
          />
        )}
        <div className="relative flex-1 min-w-0">
          {/* Crossfade when the user flips between 2D / 3D / Sim. Only one
              view is mounted at a time (we don't want two R3F canvases or
              two Konva stages alive simultaneously), so AnimatePresence
              mode="wait" runs exit-then-enter cleanly. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="absolute inset-0"
            >
              {mode === "2d" && <Canvas2D />}
              {mode === "3d" && <Scene3D />}
              {mode === "sim" && <SimView />}
            </motion.div>
          </AnimatePresence>
        </div>
        {!rightCollapsed && (
          <ResizeHandle
            onDelta={(d) =>
              setRightWidth((w) => clamp(w - d, RIGHT_MIN, RIGHT_MAX))
            }
          />
        )}
        <div
          style={{ width: rightCollapsed ? RAIL_WIDTH : rightWidth }}
          className="shrink-0"
        >
          {rightCollapsed ? (
            <CollapsedRail
              side="right"
              label="Show properties / AI"
              onExpand={() => setRightCollapsed(false)}
            />
          ) : (
            <RightSidebar onCollapse={() => setRightCollapsed(true)} />
          )}
        </div>
      </div>
      <StatusBar />
      <AISurveyDialog
        open={aiSurveyOpen}
        onClose={() => setAISurveyOpen(false)}
      />
      <AIAdvisorPanel
        open={aiAdvisorOpen}
        onClose={() => setAIAdvisorOpen(false)}
      />
      <QuoteDrawer open={quoteOpen} onClose={() => setQuoteOpen(false)} />
      {/* Onboarding tour — auto-launches on the user's first visit to the
          editor, can be replayed any time from the Project menu. */}
      <EditorTour />
    </div>
  );
}

/**
 * Thin vertical bar that lives between the canvas and a sidebar. Drag it
 * with the mouse to grow/shrink the sidebar — the parent owns the width
 * state and we just emit pointer-delta-x events.
 *
 * `onDelta` receives the cursor's `movementX` per pointermove frame. The
 * parent decides whether that should grow or shrink the panel (i.e. which
 * sign of delta widens the column).
 */
function ResizeHandle({ onDelta }: { onDelta: (deltaX: number) => void }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    function onMove(e: PointerEvent) {
      if (e.movementX === 0) return;
      onDelta(e.movementX);
    }
    function onUp() {
      setActive(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // Hint to the OS that we're resizing horizontally for the whole drag.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [active, onDelta]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      // 6px wide hit area for forgiving clicks; the visible strip is 1px
      // and only colorises on hover/active to stay out of the way.
      className="group/resize relative w-1.5 shrink-0 cursor-col-resize bg-transparent"
      style={{ touchAction: "none" }}
    >
      <div
        className={
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors " +
          (active ? "bg-primary" : "bg-border/60 group-hover/resize:bg-primary/60")
        }
      />
    </div>
  );
}

/**
 * Rail shown in place of a collapsed sidebar — the whole 32px column is one
 * clickable button that pops the sidebar back open. Chevron points into the
 * canvas (i.e. away from the screen edge) so the affordance reads as
 * "expand back out."
 */
function CollapsedRail({
  side,
  label,
  onExpand,
}: {
  side: "left" | "right";
  label: string;
  onExpand: () => void;
}) {
  const Icon = side === "left" ? PanelLeftOpen : PanelRightOpen;
  return (
    <button
      type="button"
      onClick={onExpand}
      title={label}
      aria-label={label}
      className={cn(
        "group flex h-full w-full items-start justify-center bg-sidebar pt-3 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
        side === "left"
          ? "border-r border-border/70"
          : "border-l border-border/70",
      )}
    >
      <Icon className="size-4" strokeWidth={1.8} />
    </button>
  );
}
