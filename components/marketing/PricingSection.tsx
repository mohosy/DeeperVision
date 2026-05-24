"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tier {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  cta: string;
  href: string;
  highlight?: boolean;
  accent: string;
}

// Positioned against System Surveyor's published $108/user/month plan —
// DeeperVision's Pro tier is meaningfully cheaper and bundles the AI agent
// and 3D walkthrough as table stakes rather than upsells.
const tiers: Tier[] = [
  {
    name: "Solo",
    price: "$0",
    cadence: "forever",
    blurb: "Everything you need to design a single site, on the house.",
    features: [
      "1 active design",
      "Full 2D + 3D editor & walkthrough",
      "50 AI messages / month",
      "PDF & CSV exports (with watermark)",
    ],
    cta: "Start free",
    href: "/design/new",
    accent: "from-foreground/10 via-foreground/[0.04] to-transparent",
  },
  {
    name: "Pro",
    price: "$29",
    cadence: "per user / month",
    blurb: "For independent integrators replacing System Surveyor.",
    features: [
      "Unlimited designs",
      "Unbranded PDF & branded customer quotes",
      "1,000 AI messages / month with web search",
      "Threat simulation & coverage advisor",
      "Cloud sync across devices",
      "Priority email support",
    ],
    cta: "Try Pro free for 14 days",
    href: "/design/new",
    highlight: true,
    accent: "from-primary/30 via-primary/10 to-transparent",
  },
  {
    name: "Team",
    price: "$79",
    cadence: "per user / month",
    blurb: "For installer teams managing many sites side-by-side.",
    features: [
      "Everything in Pro",
      "Multi-user collaboration on the same design",
      "Role-based permissions",
      "Version history & restore",
      "SSO (Google + Microsoft)",
      "Dedicated onboarding & SLA",
    ],
    cta: "Talk to sales",
    href: "mailto:sales@deepervision.app?subject=Team%20plan%20inquiry",
    accent: "from-violet-400/20 via-violet-400/5 to-transparent",
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 max-w-2xl">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-primary/80">
            Pricing
          </div>
          <h2 className="text-3xl font-medium leading-[1.1] tracking-[-0.018em] sm:text-[2.6rem]">
            Built to undercut{" "}
            <span className="font-serif-italic text-foreground/85">
              the legacy
            </span>{" "}
            tools.
          </h2>
          <p className="mt-5 text-base leading-[1.6] text-muted-foreground sm:text-[1.05rem]">
            System Surveyor charges $108 per user per month. We charge $29, ship
            the AI agent and 3D walkthrough as default features, and never
            paywall the editor.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.5,
                ease: [0.2, 0.65, 0.3, 1],
                delay: i * 0.06,
              }}
              className={cn(
                "group relative overflow-hidden rounded-2xl border surface-card p-7 transition-all",
                tier.highlight
                  ? "border-primary/40 shadow-[0_30px_80px_-40px_oklch(0.55_0.17_245/45%)]"
                  : "border-border hover:border-primary/30 hover:-translate-y-0.5",
              )}
            >
              <div
                className={cn(
                  "pointer-events-none absolute -top-20 -right-20 size-52 rounded-full bg-gradient-to-br opacity-80 blur-3xl",
                  tier.accent,
                )}
              />
              {tier.highlight && (
                <div className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[0.66rem] font-medium uppercase tracking-wider text-primary ring-1 ring-primary/30">
                  <Sparkles className="size-3" strokeWidth={2.2} />
                  Most popular
                </div>
              )}
              <div className="relative">
                <div className="text-[0.78rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {tier.name}
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-[-0.02em]">
                    {tier.price}
                  </span>
                  <span className="text-[0.82rem] text-muted-foreground">
                    {tier.cadence}
                  </span>
                </div>
                <p className="mt-3 text-[0.95rem] leading-[1.5] text-muted-foreground">
                  {tier.blurb}
                </p>
                <ul className="mt-6 space-y-2.5">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-[0.92rem] leading-[1.4] text-foreground/90"
                    >
                      <Check
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          tier.highlight ? "text-primary" : "text-emerald-500",
                        )}
                        strokeWidth={2.4}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.href}
                  className={cn(
                    "mt-7 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full px-4 text-[0.88rem] font-medium transition-colors",
                    tier.highlight
                      ? "bg-primary text-primary-foreground shadow-[0_10px_28px_-10px_oklch(0.55_0.17_245/55%)] hover:bg-primary/90"
                      : "border border-border bg-card text-foreground hover:bg-foreground/[0.04]",
                  )}
                >
                  {tier.cta}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="mt-10 text-center text-[0.78rem] text-muted-foreground/80">
          Annual billing saves ~30%. All prices in USD. AI usage above plan
          limits is metered at $0.02 per message.
        </p>
      </div>
    </section>
  );
}
