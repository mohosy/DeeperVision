"use client";

import { useEffect, useState } from "react";
import { useDesignStore } from "@/lib/store";
import { TopBar } from "./TopBar";
import { LibraryPanel } from "./LibraryPanel";
import { RightSidebar } from "./RightSidebar";
import { StatusBar } from "./StatusBar";
import { Canvas2D } from "@/components/canvas2d/Canvas2D";
import { Scene3D } from "@/components/scene3d/Scene3D";
import { SimView } from "@/components/simulation/SimView";
import { AISurveyDialog } from "@/components/ai/AISurveyDialog";
import { AIAdvisorPanel } from "@/components/ai/AIAdvisorPanel";

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

export function EditorShell({ designId }: { designId: string }) {
  const ensureDesign = useDesignStore((s) => s.ensureDesign);
  const setCurrent = useDesignStore((s) => s.setCurrentDesign);
  const setViewMode = useDesignStore((s) => s.setViewMode);
  const mode = useDesignStore((s) => s.viewMode);
  const aiSurveyOpen = useDesignStore((s) => s.aiSurveyOpen);
  const setAISurveyOpen = useDesignStore((s) => s.setAISurveyOpen);
  const aiAdvisorOpen = useDesignStore((s) => s.aiAdvisorOpen);
  const setAIAdvisorOpen = useDesignStore((s) => s.setAIAdvisorOpen);
  const rightTab = useDesignStore((s) => s.rightTab);
  const setRightTab = useDesignStore((s) => s.setRightTab);
  const hydrated = useHasHydrated();

  // Resizable sidebar widths.
  const [libraryWidth, setLibraryWidth] = useState<number>(LIBRARY_DEFAULT);
  const [rightWidth, setRightWidth] = useState<number>(RIGHT_DEFAULT);
  // Hydrate from localStorage after mount to avoid SSR/CSR mismatch.
  useEffect(() => {
    const w = loadWidths();
    setLibraryWidth(w.library);
    setRightWidth(w.right);
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
    if (!hydrated) return;
    ensureDesign(designId);
    setCurrent(designId);
    setViewMode("2d");
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
        <div style={{ width: libraryWidth }} className="shrink-0">
          <LibraryPanel />
        </div>
        <ResizeHandle
          onDelta={(d) =>
            setLibraryWidth((w) => clamp(w + d, LIBRARY_MIN, LIBRARY_MAX))
          }
        />
        <div className="relative flex-1 min-w-0">
          {mode === "2d" && <Canvas2D />}
          {mode === "3d" && <Scene3D />}
          {mode === "sim" && <SimView />}
        </div>
        <ResizeHandle
          onDelta={(d) =>
            setRightWidth((w) => clamp(w - d, RIGHT_MIN, RIGHT_MAX))
          }
        />
        <div style={{ width: rightWidth }} className="shrink-0">
          <RightSidebar />
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
