"use client";

import { motion } from "framer-motion";
import {
  Boxes,
  Eye,
  Footprints,
  Layers,
  Play,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
}

const features: Feature[] = [
  {
    icon: Layers,
    title: "2D ↔ 3D toggle",
    description:
      "Design in clean top-down 2D, then press one key and your plan inflates into a real 3D world. Same data, two views, zero friction.",
    accent: "from-emerald-400/20 via-emerald-400/5 to-transparent",
  },
  {
    icon: Footprints,
    title: "First-person walkthrough",
    description:
      "WASD through the building you just designed. See exactly what each camera sees, find dead zones with your own eyes.",
    accent: "from-sky-400/20 via-sky-400/5 to-transparent",
  },
  {
    icon: Play,
    title: "Threat simulation",
    description:
      "Drop a threat actor, draw their path, hit play. Cameras light up green when they see, red when they don't. After-action report at the end.",
    accent: "from-rose-400/20 via-rose-400/5 to-transparent",
  },
  {
    icon: Eye,
    title: "Live camera POV",
    description:
      "Hover any camera in 3D to see its actual point of view. Picture-in-picture monitoring wall, in your browser.",
    accent: "from-amber-400/20 via-amber-400/5 to-transparent",
  },
  {
    icon: Wifi,
    title: "Coverage heatmaps",
    description:
      "Color the floor by camera redundancy and WiFi signal strength. Spot blind spots and weak coverage instantly.",
    accent: "from-violet-400/20 via-violet-400/5 to-transparent",
  },
  {
    icon: Boxes,
    title: "BoM & PDF export",
    description:
      "One click for a branded survey report with the device list, floor plans, and a simulation summary. Built for your customer, not for you.",
    accent: "from-teal-400/20 via-teal-400/5 to-transparent",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl mb-16">
          <div className="text-xs uppercase tracking-[0.16em] text-primary/80 mb-3 font-medium">
            What&apos;s in the box
          </div>
          <h2 className="text-3xl sm:text-[2.6rem] font-medium tracking-[-0.018em] leading-[1.1]">
            Built for the way modern security teams{" "}
            <span className="font-serif-italic text-foreground/85">
              actually
            </span>{" "}
            work.
          </h2>
          <p className="mt-5 text-muted-foreground text-base sm:text-[1.05rem] leading-[1.6]">
            Six things the old tools either don&apos;t do or do badly.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.5,
                ease: [0.2, 0.65, 0.3, 1],
                delay: i * 0.05,
              }}
              className="group relative overflow-hidden rounded-2xl border border-border surface-card p-6 transition-all hover:border-primary/30 hover:-translate-y-0.5"
            >
              <div
                className={`pointer-events-none absolute -top-16 -right-16 size-44 rounded-full blur-3xl opacity-70 bg-gradient-to-br ${feature.accent}`}
              />
              <div className="relative">
                <div className="inline-flex items-center justify-center rounded-lg border border-border bg-background/60 p-2.5 shadow-[inset_0_1px_0_oklch(1_0_0/4%)]">
                  <feature.icon className="size-[1.05rem] text-primary" />
                </div>
                <h3 className="mt-5 text-[1.05rem] font-medium tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[0.92rem] leading-[1.55] text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
