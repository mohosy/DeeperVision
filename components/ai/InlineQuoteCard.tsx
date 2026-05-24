"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  Printer,
  Sparkles,
} from "lucide-react";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { planCabling } from "@/lib/cabling";
import { computeQuote, formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Compact "live quote" card that sits at the top of the AI chat panel.
 *
 * Why: the user wants to discuss pricing with the agent WITHOUT leaving
 * the chat — so we surface the headline numbers (grand total + hero
 * breakdown) right inside the chat tab. The AI's tools already write
 * back to the same store, so as the agent edits rates, adds line items,
 * or removes devices, this card reanimates immediately.
 *
 * Three states:
 *   • collapsed (default) — single row with grand total + a chevron
 *   • expanded            — adds the three-stat hero + a BoM peek
 *   • prints the full standalone QuoteDrawer for export
 */
export function InlineQuoteCard({ onOpenFullQuote }: { onOpenFullQuote: () => void }) {
  const floor = useActiveFloor();
  const quoteSettings = useDesignStore((s) => s.quoteSettings);
  const [expanded, setExpanded] = useState(false);

  // Recompute on every render of the panel — cheap with memoization and
  // ensures the numbers always reflect the latest store mutations from
  // the AI's tool calls.
  const breakdown = useMemo(() => {
    if (!floor) return null;
    const cabling = planCabling(floor);
    return computeQuote(floor, {
      ...quoteSettings,
      autoCabling: {
        totalLengthM: cabling.totalLengthM,
        cameraRuns: cabling.cameraRuns,
        readerRuns: cabling.readerRuns,
      },
    });
  }, [floor, quoteSettings]);

  if (!floor || !breakdown) return null;

  // Hide the card until the user has placed at least one device. Before
  // that, the "grand total" is just commissioning + tax-on-commissioning
  // (~$900) which is confusing — there's no project to price yet.
  if (breakdown.rows.length === 0) return null;

  const deviceCount = breakdown.rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="mx-3 mt-3 rounded-xl bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent ring-1 ring-primary/15 shadow-[0_1px_3px_-1px_oklch(0_0_0/6%)]">
      {/* Compact header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-foreground/[0.02] rounded-xl transition-colors"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Banknote className="size-3.5" strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <div className="text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Live quote
            </div>
            <div className="text-[1.05rem] font-semibold tracking-[-0.01em] tabular-nums">
              <AnimatedTotal value={breakdown.grandTotal} />
              <span className="ml-1.5 text-[0.7rem] font-normal text-muted-foreground">
                · {deviceCount} device{deviceCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded body — hero stats + small BoM peek + actions.
          No internal divider — whitespace + the tinted card edge already
          read as "this is the same surface continuing below." */}
      {expanded && (
        <div className="px-3 pb-3 pt-1">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Hardware" value={formatUSD(breakdown.hardwareSubtotal)} />
            <Stat
              label="Labor"
              value={formatUSD(
                breakdown.laborSubtotal +
                  breakdown.cablingSubtotal +
                  breakdown.commissioningFee,
              )}
            />
            <Stat label="Tax" value={formatUSD(breakdown.taxAmount)} />
          </div>

          {breakdown.rows.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg bg-background/50 max-h-[180px] overflow-y-auto">
              <table className="w-full text-[0.72rem]">
                <tbody>
                  {breakdown.rows.map((r, i) => (
                    <tr
                      key={r.modelId}
                      className={cn(
                        "transition-colors",
                        i % 2 === 1 && "bg-foreground/[0.025]",
                      )}
                    >
                      <td className="px-2 py-1.5">
                        <div className="font-medium truncate">{r.displayName}</div>
                        <div className="text-[0.62rem] text-muted-foreground">
                          {r.vendor}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                        ×{r.quantity}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[0.7rem]">
                        {formatUSD(r.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {quoteSettings.extraLineItems.length > 0 && (
            <div className="mt-2 space-y-1 px-1">
              {quoteSettings.extraLineItems.map((li, i) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between text-[0.7rem]"
                >
                  <span className="inline-flex items-center gap-1.5 text-foreground/80">
                    <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-wider text-muted-foreground">
                      {li.category}
                    </span>
                    <span className="truncate">{li.description}</span>
                  </span>
                  <span className="font-mono text-foreground/80 tabular-nums">
                    {formatUSD(li.quantity * li.unitCost)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenFullQuote}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground/[0.04] px-2 py-1 text-[0.7rem] font-medium ring-1 ring-border/40 hover:bg-foreground/[0.08] hover:ring-border/60 transition-all"
            >
              <Printer className="size-3" strokeWidth={2.2} />
              Print quote
            </button>
            <div
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-medium",
                quoteSettings.aiAdjusted
                  ? "bg-primary/12 text-primary"
                  : "bg-muted/40 text-muted-foreground",
              )}
            >
              <Sparkles className="size-2.5" />
              {quoteSettings.aiAdjusted
                ? `AI tuned · ${quoteSettings.projectLocation || "region set"}`
                : "Ask AI to audit pricing"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-foreground/[0.04] px-2 py-1.5">
      <div className="text-[0.56rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[0.78rem] font-medium tabular-nums">
        {value}
      </div>
    </div>
  );
}

/**
 * Animated currency total. When the value changes:
 *  • The text color flashes emerald (up) or rose (down) for ~900 ms
 *    and fades back to neutral.
 *  • A short scale "pop" (1.0 → 1.06 → 1.0) draws the eye to the change
 *    without distorting the layout around it.
 *
 * Earlier iterations animated per-digit with absolute positioning and
 * AnimatePresence; that was visually nice but kept clipping the number
 * on small containers and glitching on rapid successive changes. The
 * simpler color-flash + scale pulse is bulletproof and still feels
 * "alive" when the AI is editing the quote.
 */
function AnimatedTotal({ value }: { value: number }) {
  const prevRef = useRef(value);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (value === prevRef.current) return;
    const dir = value > prevRef.current ? "up" : "down";
    prevRef.current = value;
    setDirection(dir);
    // Bump a re-mount key so the scale animation re-fires even if the
    // direction is unchanged between two rapid increases.
    setPulseKey((k) => k + 1);
    const t = window.setTimeout(() => setDirection(null), 900);
    return () => window.clearTimeout(t);
  }, [value]);

  return (
    <motion.span
      key={pulseKey}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.06, 1] }}
      transition={{ duration: 0.45, ease: [0.2, 0.7, 0.3, 1] }}
      className={cn(
        "inline-block origin-left tabular-nums transition-colors duration-300",
        direction === "up" && "text-emerald-500",
        direction === "down" && "text-rose-500",
      )}
    >
      {formatUSD(value)}
    </motion.span>
  );
}
