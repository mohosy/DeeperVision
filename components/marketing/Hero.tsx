"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Eye } from "lucide-react";

/**
 * Mountain-landscape hero. Layout and feel inspired by Cluely's landing:
 * massive centered serif headline (Instrument Serif), short subtitle, single
 * frosted-glass CTA, all overlaid on a sky-and-mountains background with
 * the sun on the right. Top nav is overlaid white-on-image inside the hero
 * itself rather than sitting above it.
 */

export function Hero() {
  return (
    <section className="relative isolate min-h-[100vh] overflow-hidden">
      {/* Background image — SVG mountain scene */}
      <div className="absolute inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marketing/hero-mountains.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
        />
        {/* Stronger contrast wash so the headline always reads against the
           bright sky, then fades out by mid-image */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0, 60, 130, 0.42) 0%, rgba(0, 60, 130, 0.18) 25%, rgba(0,0,0,0) 55%)",
          }}
        />
        {/* Centered halo behind the title to lift it off the sky a touch
           more without darkening the whole image */}
        <div
          className="pointer-events-none absolute left-1/2 top-[42%] -z-0 size-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(0, 30, 80, 0.22), rgba(0,0,0,0) 70%)",
          }}
        />
        {/* Bottom fade into the dark section that follows */}
        <div
          className="absolute inset-x-0 bottom-0 h-32"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, var(--background) 100%)",
          }}
        />
      </div>

      {/* Overlay nav — sits on top of the mountain image */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
          >
            <div className="flex size-7 items-center justify-center rounded-md bg-white/15 backdrop-blur-md ring-1 ring-white/25">
              <Eye className="size-3.5" />
            </div>
            <span className="text-[1.05rem] font-medium tracking-[-0.01em]">
              Deeper Vision
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-[0.92rem] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)] sm:flex">
            <Link
              href="#features"
              className="transition-colors hover:text-white"
            >
              Features
            </Link>
            <Link
              href="/design/new"
              className="transition-colors hover:text-white"
            >
              Editor
            </Link>
            <Link
              href="#pricing"
              className="transition-colors hover:text-white"
            >
              Pricing
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 flex min-h-[100vh] items-center justify-center px-6 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease: [0.2, 0.65, 0.3, 1] }}
          className="max-w-4xl text-center"
        >
          <h1
            className="font-serif text-white text-[3.2rem] leading-[1.04] tracking-[-0.015em] sm:text-[5rem] md:text-[5.75rem]"
            style={{
              fontStyle: "normal",
              textShadow:
                "0 1px 2px rgba(0,20,60,0.45), 0 8px 32px rgba(0,20,60,0.35), 0 2px 8px rgba(0,20,60,0.55)",
            }}
          >
            Design security systems
            <br />
            the way you actually
            <br />
            experience them.
          </h1>

          <p
            className="mx-auto mt-8 max-w-xl text-[0.98rem] leading-[1.55] text-white sm:text-[1.05rem]"
            style={{
              textShadow:
                "0 1px 2px rgba(0,20,60,0.5), 0 2px 10px rgba(0,20,60,0.4)",
            }}
          >
            Deeper Vision is the first site-survey platform where every
            camera, every wall, and every blind spot is a real 3D object you
            can walk through, drag around, and price for your customer before
            they finish their coffee.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              ease: [0.2, 0.65, 0.3, 1],
              delay: 0.25,
            }}
            className="mt-10 flex items-center justify-center gap-3"
          >
            <Link
              href="/design/new"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/30 bg-white/15 px-6 py-3 text-[0.95rem] font-medium text-white shadow-[0_8px_30px_-12px_rgba(0,40,120,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md transition-all hover:bg-white/25 hover:shadow-[0_12px_36px_-12px_rgba(0,40,120,0.55),inset_0_1px_0_rgba(255,255,255,0.45)]"
            >
              <span>Open the editor</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#features"
              className="rounded-full px-5 py-3 text-[0.95rem] font-medium text-white/85 transition-colors hover:text-white"
            >
              See what it does
            </Link>
          </motion.div>

          <div className="mt-16 inline-flex items-center gap-3 rounded-full bg-white/12 px-3 py-1 text-[0.72rem] text-white/85 backdrop-blur-sm ring-1 ring-white/25">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />
              <span className="relative size-1.5 rounded-full bg-white" />
            </span>
            <span className="tracking-[0.04em]">
              Now in early preview — v0.1
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
