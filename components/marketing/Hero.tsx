"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.74 0.18 152 / 18%), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-28 pb-24 sm:pt-36 sm:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-start gap-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="inline-block size-2 rounded-full bg-primary animate-pulse-ring" />
            Now in early preview
          </div>

          <h1 className="text-5xl sm:text-7xl font-semibold tracking-tight leading-[1.02] text-glow-primary">
            Design security systems
            <br />
            the way you{" "}
            <span className="text-primary">actually experience</span> them.
          </h1>

          <p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
            Deeper Vision is a modern site-survey platform. Drop a floor plan,
            drag in cameras and sensors, then toggle to a 3D walkthrough — walk
            the building like a game, then simulate a threat to see exactly
            where your coverage holds and where it breaks.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="h-12 px-6 text-base font-medium"
              nativeButton={false}
              render={<Link href="/design/new" />}
            >
              Open editor
              <ArrowRight className="ml-1 size-4" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-12 px-6 text-base font-medium"
              nativeButton={false}
              render={<Link href="#features" />}
            >
              <Boxes className="mr-1 size-4" />
              See what makes it different
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-8 pt-6 text-sm text-muted-foreground">
            <div>
              <div className="font-mono text-2xl text-foreground">2D ↔ 3D</div>
              <div>One toggle. Same design.</div>
            </div>
            <div>
              <div className="font-mono text-2xl text-foreground">Walk it</div>
              <div>First-person walkthrough.</div>
            </div>
            <div>
              <div className="font-mono text-2xl text-foreground">Simulate</div>
              <div>Watch coverage in motion.</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
