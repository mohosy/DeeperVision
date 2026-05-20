"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute inset-0 bg-noise pointer-events-none opacity-60" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.78 0.135 158 / 18%), transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-32 left-1/2 -translate-x-1/2 pointer-events-none size-[820px] rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, oklch(0.78 0.135 158 / 60%), transparent 65%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-28 sm:pt-44 sm:pb-36">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.65, 0.3, 1] }}
          className="flex flex-col items-start gap-9"
        >
          <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-primary animate-pulse-ring" />
              <span className="relative size-2 rounded-full bg-primary" />
            </span>
            <span className="tracking-[0.02em]">
              Now in early preview&nbsp;·&nbsp;v0.1
            </span>
          </div>

          <h1 className="text-[2.85rem] sm:text-[4.4rem] leading-[1.02] font-medium tracking-[-0.02em] text-foreground/95">
            Design security systems
            <br />
            the way you{" "}
            <span className="font-serif-italic text-primary text-glow-primary">
              actually experience
            </span>{" "}
            them.
          </h1>

          <p className="max-w-2xl text-base sm:text-lg text-muted-foreground leading-[1.6] tracking-[0.005em]">
            Deeper Vision is a modern site-survey platform. Drop a floor plan,
            drag in cameras and sensors, then flip to a 3D walkthrough — walk
            the building like a game, then simulate a threat to see exactly
            where your coverage holds and where it breaks.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="h-11 px-5 text-[0.95rem] font-medium btn-lift shadow-[0_8px_24px_-12px_oklch(0.78_0.135_158/55%)]"
              nativeButton={false}
              render={<Link href="/design/new" />}
            >
              Open the editor
              <ArrowRight className="ml-0.5 size-4" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 px-5 text-[0.95rem] font-medium btn-lift"
              nativeButton={false}
              render={<Link href="#features" />}
            >
              <Boxes className="mr-0.5 size-4" />
              See what it does differently
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-x-10 gap-y-2 pt-6">
            <Stat label="One toggle. Same design." value="2D ↔ 3D" />
            <Stat label="First-person walkthrough." value="Walk it" mono />
            <Stat label="Watch coverage in motion." value="Simulate" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        className={
          mono
            ? "font-mono text-[1.45rem] text-foreground/95 tracking-tight"
            : "text-[1.6rem] text-foreground/95 tracking-tight font-medium"
        }
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
