"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Boxes,
  Layers,
  MessageSquareText,
  Receipt,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDesignStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Tour data                                                                  */
/* -------------------------------------------------------------------------- */

interface TourStep {
  /** CSS selector for the element to spotlight. The first match wins. */
  target?: string;
  title: string;
  body: string;
  icon: LucideIcon;
  /** Preferred placement of the tooltip relative to the target. The overlay
   *  flips this automatically if the chosen side would clip off-screen. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Padding (in px) around the target for the spotlight cutout. */
  pad?: number;
}

/** The six steps that introduce the editor. Each names a real DOM target via
 *  a `data-tour="…"` attribute on that element — easier to keep stable than
 *  class names. The first and last steps have no target and render as
 *  centered modals (welcome + finish). */
const STEPS: TourStep[] = [
  {
    title: "Welcome to DeeperVision",
    body: "A quick walkthrough. Skip anytime by pressing Esc.",
    icon: Sparkles,
  },
  {
    target: '[data-tour="mode-switcher"]',
    title: "Switch between 2D, 3D and Sim",
    body: "Design in 2D, walk through your building in 3D, or run a live threat simulation.",
    icon: Layers,
    placement: "bottom",
  },
  {
    target: '[data-tour="library"]',
    title: "Drag from a real catalog",
    body: "Hundreds of real devices from Verkada, Axis, Hikvision and more. Drag any onto the canvas.",
    icon: Boxes,
    placement: "right",
  },
  {
    target: '[data-tour="ai-tab"]',
    title: "Or just talk to it",
    body: "Ask in plain English. It edits the floor plan live and cites every source.",
    icon: MessageSquareText,
    placement: "left",
  },
  {
    target: '[data-tour="quote"]',
    title: "Live quote, always",
    body: "Every device adds a line to your BoM. Labor and tax auto compute.",
    icon: Receipt,
    placement: "bottom",
  },
  {
    target: '[data-tour="project-menu"]',
    title: "Save, import, export",
    body: "Save, import, or export your design as PDF, CSV, or JSON.",
    icon: Box,
    placement: "bottom",
  },
  {
    title: "You're ready",
    body: "Try the demo or start drawing. Replay this tour from the Project menu.",
    icon: Sparkles,
  },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Full-screen tour overlay. Renders through a portal so it sits above
 * everything in the editor (sidebars, drawers, dialogs).
 *
 * Layout strategy:
 *  - One SVG covers the viewport. We darken the whole thing with a black
 *    rect, then "punch a hole" by drawing a rounded white rect where the
 *    target is — exported as a `<mask>` so the dark layer reads through it.
 *  - A second pulsing ring around the cutout anchors the eye.
 *  - The tooltip card is positioned via inline style next to the target,
 *    flipped if it would clip the viewport.
 *  - Framer Motion animates everything: the cutout rect (layout transition),
 *    the ring (CSS pulse), the tooltip card (slide-in from its placement
 *    direction).
 */
export function EditorTour() {
  const active = useDesignStore((s) => s.tourActive);
  const step = useDesignStore((s) => s.tourStep);
  const setStep = useDesignStore((s) => s.setTourStep);
  const finish = useDesignStore((s) => s.finishTour);
  const seen = useDesignStore((s) => s.tourSeen);
  const startTour = useDesignStore((s) => s.startTour);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Auto-launch on the user's first visit to the editor. We wait a beat so
  // the layout settles (sidebars measure, library hydrates) before targeting.
  useEffect(() => {
    if (seen || active) return;
    const t = window.setTimeout(() => startTour(), 900);
    return () => window.clearTimeout(t);
  }, [seen, active, startTour]);

  // Recompute the spotlight rect on resize / scroll / step change so the
  // cutout always tracks its target.
  const [rect, setRect] = useState<Rect | null>(null);
  const current = STEPS[step];
  const measure = useCallback(() => {
    if (!current?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(current.target) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ x: r.left, y: r.top, width: r.width, height: r.height });
  }, [current?.target]);

  useEffect(() => {
    if (!active) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  // Keyboard nav.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  const next = () => {
    if (step >= STEPS.length - 1) finish();
    else setStep(step + 1);
  };
  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!mounted || !active || !current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] font-sans">
      {/* Backdrop with cutout. SVG mask carves a rounded rect hole around
          the target so the highlighted UI is fully interactive AND visually
          isolated. */}
      <SpotlightBackdrop rect={rect} pad={current.pad ?? 8} />

      {/* Pulsing ring around the cutout. Drawn in a separate absolute layer
          so it can overflow without affecting the mask math. */}
      {rect && (
        <motion.div
          key={`ring-${step}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.2, 0.7, 0.3, 1] }}
          className="pointer-events-none absolute"
          style={{
            left: rect.x - (current.pad ?? 8),
            top: rect.y - (current.pad ?? 8),
            width: rect.width + 2 * (current.pad ?? 8),
            height: rect.height + 2 * (current.pad ?? 8),
            borderRadius: 14,
          }}
        >
          <span className="absolute inset-0 animate-ping rounded-[14px] ring-2 ring-primary/70 opacity-50" />
          <span className="absolute inset-0 rounded-[14px] ring-2 ring-primary/80 shadow-[0_0_60px_-8px_oklch(0.55_0.17_245/60%)]" />
        </motion.div>
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <TourCard
          key={step}
          step={step}
          totalSteps={STEPS.length}
          data={current}
          rect={rect}
          onPrev={prev}
          onNext={next}
          onSkip={finish}
        />
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Backdrop with SVG mask                                                     */
/* -------------------------------------------------------------------------- */

function SpotlightBackdrop({ rect, pad }: { rect: Rect | null; pad: number }) {
  // `rect` is null on welcome/finish steps — show a uniformly dim backdrop
  // so the centered card reads against it.
  if (!rect) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />
    );
  }

  // Cutout coords with padding.
  const cx = rect.x - pad;
  const cy = rect.y - pad;
  const cw = rect.width + 2 * pad;
  const ch = rect.height + 2 * pad;

  return (
    <svg
      width="100%"
      height="100%"
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      <defs>
        <mask id="tour-spotlight">
          {/* White = visible (gets darkened). Black = transparent (hole). */}
          <rect width="100%" height="100%" fill="white" />
          {/* Animated cutout — motion.rect smoothly resizes/moves between
              steps, so the spotlight feels like one continuous light. */}
          <motion.rect
            initial={false}
            animate={{ x: cx, y: cy, width: cw, height: ch }}
            transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
            rx={12}
            ry={12}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgb(0 0 0 / 0.62)"
        mask="url(#tour-spotlight)"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip card                                                               */
/* -------------------------------------------------------------------------- */

function TourCard({
  step,
  totalSteps,
  data,
  rect,
  onPrev,
  onNext,
  onSkip,
}: {
  step: number;
  totalSteps: number;
  data: TourStep;
  rect: Rect | null;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const Icon = data.icon;
  const CARD_W = 360;
  const CARD_GAP = 18;

  // Position the card next to the target, flipping if it would clip. For
  // welcome/finish (no target), center it.
  const style = (() => {
    if (!rect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      } as const;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Resolve placement with auto-flip if it would clip.
    let placement = data.placement ?? "bottom";
    if (placement === "right" && rect.x + rect.width + CARD_GAP + CARD_W > vw)
      placement = "left";
    if (placement === "left" && rect.x - CARD_GAP - CARD_W < 0)
      placement = "right";
    if (placement === "bottom" && rect.y + rect.height + CARD_GAP + 220 > vh)
      placement = "top";
    if (placement === "top" && rect.y - CARD_GAP - 220 < 0) placement = "bottom";

    switch (placement) {
      case "right":
        return {
          left: rect.x + rect.width + CARD_GAP,
          top: clamp(rect.y + rect.height / 2 - 100, 16, vh - 240),
        };
      case "left":
        return {
          left: rect.x - CARD_GAP - CARD_W,
          top: clamp(rect.y + rect.height / 2 - 100, 16, vh - 240),
        };
      case "top":
        return {
          left: clamp(
            rect.x + rect.width / 2 - CARD_W / 2,
            16,
            vw - CARD_W - 16,
          ),
          top: rect.y - CARD_GAP - 220,
        };
      case "bottom":
      default:
        return {
          left: clamp(
            rect.x + rect.width / 2 - CARD_W / 2,
            16,
            vw - CARD_W - 16,
          ),
          top: rect.y + rect.height + CARD_GAP,
        };
    }
  })();

  // Slide direction matches placement so the card animates IN from the
  // target's direction.
  const slideFrom = (() => {
    if (!rect) return { y: 16 };
    switch (data.placement) {
      case "right":
        return { x: -24 };
      case "left":
        return { x: 24 };
      case "top":
        return { y: 24 };
      default:
        return { y: -24 };
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, ...slideFrom }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...slideFrom }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.3, 1] }}
      className="absolute w-[360px] rounded-2xl border border-border bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]"
      style={style}
    >
      {/* Header — accent strip + icon */}
      <div className="relative flex items-center gap-2.5 rounded-t-2xl bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent px-5 pt-4 pb-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
          <Icon className="size-[1.05rem]" strokeWidth={1.9} />
        </div>
        <div className="flex-1">
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-primary/85">
            Step {step + 1} of {totalSteps}
          </div>
          <h3 className="mt-0.5 text-[1.05rem] font-semibold tracking-[-0.01em] leading-tight">
            {data.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkip}
          title="Close tour (Esc)"
          aria-label="Close tour"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <X className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {/* Body */}
      <p className="px-5 pt-1 pb-4 text-[0.92rem] leading-[1.55] text-muted-foreground">
        {data.body}
      </p>

      {/* Progress dots + nav */}
      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-5 bg-primary" : "w-1.5 bg-foreground/15",
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrev}
            disabled={step === 0}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[0.78rem] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Previous step"
          >
            <ArrowLeft className="size-3.5" strokeWidth={2} />
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.82rem] font-medium text-primary-foreground shadow-[0_8px_22px_-10px_oklch(0.55_0.17_245/55%)] transition-colors hover:bg-primary/90"
            aria-label={step === totalSteps - 1 ? "Finish tour" : "Next step"}
          >
            {step === totalSteps - 1 ? "Finish" : "Next"}
            <ArrowRight className="size-3.5" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
