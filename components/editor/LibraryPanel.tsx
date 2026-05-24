"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Armchair,
  Camera,
  ChevronRight,
  DoorClosed,
  Flame,
  KeyRound,
  PanelLeftClose,
  Search,
  Shield,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DeviceType } from "@/types/design";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DevicePreview3D, type PreviewKind } from "./DevicePreview3D";
import {
  type CatalogProduct,
  getProductsByCategory,
  searchProducts,
} from "@/lib/catalog";

/**
 * Subcategories that live under `reader` in the catalog but surface in the
 * library under their own "Door Hardware" tab — strikes, mag locks, REX
 * sensors, exit devices, intercoms, and power supplies. Anything in this
 * set is FILTERED OUT of the regular "Access" tab so we don't show the
 * same product twice.
 */
const DOOR_HARDWARE_SUBCATEGORIES = new Set<string>([
  "electric-strike",
  "mag-lock",
  "rex-button",
  "exit-device",
  "intercom",
  "power-supply",
]);

/**
 * Perimeter / exterior security devices. LPR cameras live under camera in
 * the catalog; turnstiles, bollards, and gate operators live under reader.
 * The Perimeter tab pulls them across both types.
 */
const PERIMETER_SUBCATEGORIES = new Set<string>([
  "lpr",
  "turnstile",
  "bollard",
  "gate-operator",
]);

/**
 * Fire / life safety devices. These are filed under sensor in the catalog
 * alongside smoke/heat/notification, but the Fire tab also surfaces the
 * existing smoke/heat/notification entries because they belong to the
 * same workflow (NFPA inspections, code reviews, FACP point counts).
 */
const FIRE_LIFE_SAFETY_SUBCATEGORIES = new Set<string>([
  "pull-station",
  "facp",
  "exit-sign",
  "aed",
  "smoke",
  "heat",
  "notification",
]);

/**
 * Install hardware — back boxes, brackets, conduit, surface raceway.
 * The audience for this tab is GCs, electricians, low-voltage installers
 * who care about rough-in and physical mounting as much as the device
 * spec itself.
 */
const INSTALL_HARDWARE_SUBCATEGORIES = new Set<string>([
  "back-box",
  "mount-bracket",
  "conduit",
  "raceway",
]);

const TYPE_TONE: Record<
  DeviceType | "door-hardware" | "perimeter" | "fire-life-safety" | "install" | "furniture",
  { dot: string; pill: string; shadow: string; glow: string }
> = {
  camera: {
    dot: "bg-blue-500",
    pill: "text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.6_0.17_245/45%)]",
    // Subtle radial wash behind the 3D thumbnail, tinted to the device type
    // so a row scans as "camera" / "reader" before you read the label.
    glow: "rgba(59, 130, 246, 0.18)", // blue-500 @ 18%
  },
  reader: {
    dot: "bg-sky-500",
    pill: "text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.65_0.16_230/40%)]",
    glow: "rgba(14, 165, 233, 0.20)", // sky-500
  },
  sensor: {
    dot: "bg-amber-500",
    pill: "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.75_0.16_80/45%)]",
    glow: "rgba(245, 158, 11, 0.22)", // amber-500
  },
  network: {
    dot: "bg-violet-400",
    pill: "text-violet-700 dark:text-violet-300 bg-violet-500/10 border-violet-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.65_0.18_300/40%)]",
    glow: "rgba(168, 85, 247, 0.20)", // violet-500
  },
  "door-hardware": {
    dot: "bg-rose-500",
    pill: "text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.65_0.18_15/40%)]",
    glow: "rgba(244, 63, 94, 0.20)", // rose-500
  },
  perimeter: {
    dot: "bg-emerald-500",
    pill: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.6_0.17_150/40%)]",
    glow: "rgba(16, 185, 129, 0.20)", // emerald-500
  },
  "fire-life-safety": {
    dot: "bg-orange-500",
    pill: "text-orange-700 dark:text-orange-300 bg-orange-500/10 border-orange-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.7_0.18_40/45%)]",
    glow: "rgba(249, 115, 22, 0.22)", // orange-500
  },
  install: {
    // Slate/zinc — neutral hardware tone, distinct from any device category
    dot: "bg-slate-500",
    pill: "text-slate-700 dark:text-slate-300 bg-slate-500/10 border-slate-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.55_0.04_240/40%)]",
    glow: "rgba(100, 116, 139, 0.20)", // slate-500
  },
  furniture: {
    dot: "bg-pink-400",
    pill: "text-pink-700 dark:text-pink-300 bg-pink-500/10 border-pink-500/20",
    shadow: "hover:shadow-[0_10px_28px_-14px_oklch(0.7_0.18_340/40%)]",
    glow: "rgba(244, 114, 182, 0.20)", // pink-400
  },
};

const SUBCATEGORY_TO_PREVIEW: Record<string, PreviewKind> = {
  dome: { type: "camera", subtype: "dome" },
  bullet: { type: "camera", subtype: "fixed" },
  fixed: { type: "camera", subtype: "fixed" },
  ptz: { type: "camera", subtype: "ptz" },
  fisheye: { type: "camera", subtype: "dome" },
  "multi-sensor": { type: "camera", subtype: "dome" },
  mini: { type: "camera", subtype: "dome" },
  modular: { type: "camera", subtype: "fixed" },
  card: { type: "reader", subtype: "card" },
  biometric: { type: "reader", subtype: "biometric" },
  keypad: { type: "reader", subtype: "keypad" },
  controller: { type: "reader", subtype: "card" },
  lock: { type: "reader", subtype: "card" },
  "electric-strike": { type: "reader", subtype: "electric-strike" },
  "mag-lock": { type: "reader", subtype: "mag-lock" },
  "rex-button": { type: "reader", subtype: "rex-button" },
  "exit-device": { type: "reader", subtype: "exit-device" },
  intercom: { type: "reader", subtype: "intercom" },
  "power-supply": { type: "reader", subtype: "power-supply" },
  // Perimeter
  lpr: { type: "camera", subtype: "fixed" },
  turnstile: { type: "reader", subtype: "turnstile" },
  bollard: { type: "reader", subtype: "bollard" },
  "gate-operator": { type: "reader", subtype: "gate-operator" },
  // Fire / life safety — pull station/FACP/exit sign/AED have their own
  // meshes; smoke/heat already preview as the motion-style PIR puck.
  "pull-station": { type: "sensor", subtype: "pull-station" },
  facp: { type: "sensor", subtype: "facp" },
  "exit-sign": { type: "sensor", subtype: "exit-sign" },
  aed: { type: "sensor", subtype: "aed" },
  "back-box": { type: "sensor", subtype: "back-box" },
  "mount-bracket": { type: "sensor", subtype: "mount-bracket" },
  conduit: { type: "sensor", subtype: "conduit" },
  raceway: { type: "sensor", subtype: "raceway" },
  motion: { type: "sensor", subtype: "motion" },
  "glass-break": { type: "sensor", subtype: "glass-break" },
  "door-contact": { type: "sensor", subtype: "door-contact" },
  smoke: { type: "sensor", subtype: "motion" },
  heat: { type: "sensor", subtype: "motion" },
  notification: { type: "sensor", subtype: "motion" },
  "access-point": { type: "network", subtype: "access-point" },
  switch: { type: "network", subtype: "switch" },
  nvr: { type: "network", subtype: "nvr" },
};

type CategoryKey =
  | "camera"
  | "reader"
  | "sensor"
  | "network"
  | "door-hardware"
  | "perimeter"
  | "fire-life-safety"
  | "install"
  | "furniture";

const CATEGORIES: { key: CategoryKey; label: string; icon: LucideIcon }[] = [
  { key: "camera", label: "Cameras", icon: Camera },
  { key: "reader", label: "Access", icon: KeyRound },
  { key: "door-hardware", label: "Doors", icon: DoorClosed },
  { key: "perimeter", label: "Perimeter", icon: Shield },
  { key: "fire-life-safety", label: "Fire", icon: Flame },
  { key: "sensor", label: "Sensors", icon: Activity },
  { key: "network", label: "Network", icon: Wifi },
  { key: "install", label: "Install", icon: Wrench },
  { key: "furniture", label: "Furniture", icon: Armchair },
];

function groupByManufacturer(products: CatalogProduct[]) {
  const map = new Map<string, CatalogProduct[]>();
  for (const p of products) {
    const list = map.get(p.manufacturer) ?? [];
    list.push(p);
    map.set(p.manufacturer, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function formatPrice(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;
}

export function LibraryPanel({ onCollapse }: { onCollapse?: () => void } = {}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("camera");
  const [expandedMfg, setExpandedMfg] = useState<Set<string>>(new Set());
  const floor = useActiveFloor();
  const addDevice = useDesignStore((s) => s.addDevice);

  const isSearching = query.trim().length > 0;

  const searchResults = useMemo(
    () => (isSearching ? searchProducts(query) : []),
    [query, isSearching],
  );

  const categoryProducts = useMemo(() => {
    if (isSearching) return [];
    if (activeCategory === "door-hardware") {
      return getProductsByCategory("reader").filter((p) =>
        DOOR_HARDWARE_SUBCATEGORIES.has(p.subcategory),
      );
    }
    if (activeCategory === "perimeter") {
      // LPR cameras live under `camera`; turnstiles/bollards/gate operators
      // under `reader`. Pull from both and dedupe via the subcategory set.
      return [
        ...getProductsByCategory("camera"),
        ...getProductsByCategory("reader"),
      ].filter((p) => PERIMETER_SUBCATEGORIES.has(p.subcategory));
    }
    if (activeCategory === "fire-life-safety") {
      return getProductsByCategory("sensor").filter((p) =>
        FIRE_LIFE_SAFETY_SUBCATEGORIES.has(p.subcategory),
      );
    }
    if (activeCategory === "install") {
      return getProductsByCategory("sensor").filter((p) =>
        INSTALL_HARDWARE_SUBCATEGORIES.has(p.subcategory),
      );
    }
    if (activeCategory === "furniture") {
      // Furniture isn't catalog-backed — the FurnitureLibrary component
      // handles its own rendering path.
      return [];
    }
    const products = getProductsByCategory(activeCategory);
    if (activeCategory === "reader") {
      // Hide door-hardware + perimeter access items from "Access" — they
      // live in their own tabs.
      return products.filter(
        (p) =>
          !DOOR_HARDWARE_SUBCATEGORIES.has(p.subcategory) &&
          !PERIMETER_SUBCATEGORIES.has(p.subcategory),
      );
    }
    if (activeCategory === "camera") {
      // Hide LPR cameras from the main Cameras tab — they live under
      // Perimeter where they actually make sense to find.
      return products.filter((p) => !PERIMETER_SUBCATEGORIES.has(p.subcategory));
    }
    if (activeCategory === "sensor") {
      // Hide fire-only + install-hardware items from the generic Sensors
      // tab — they live under Fire and Install respectively. (Smoke /
      // heat / notification still surface here because they pull double
      // duty for intrusion + fire.)
      return products.filter(
        (p) =>
          p.subcategory !== "pull-station" &&
          p.subcategory !== "facp" &&
          p.subcategory !== "exit-sign" &&
          p.subcategory !== "aed" &&
          !INSTALL_HARDWARE_SUBCATEGORIES.has(p.subcategory),
      );
    }
    return products;
  }, [activeCategory, isSearching]);

  const grouped = useMemo(
    () => groupByManufacturer(isSearching ? searchResults : categoryProducts),
    [isSearching, searchResults, categoryProducts],
  );

  function toggleMfg(name: string) {
    setExpandedMfg((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleAdd(product: CatalogProduct) {
    if (!floor) return;
    addDevice(
      floor.id,
      product.category,
      { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 },
      product,
    );
  }

  function handleDragStart(e: React.DragEvent, product: CatalogProduct) {
    e.dataTransfer.setData(
      "application/x-dv-device",
      JSON.stringify({
        type: product.category,
        subtype: product.subcategory,
        catalogId: product.id,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";

    // Custom drag preview — replace the native "row banner" with a small,
    // device-shaped pill (same visual language as the 2D canvas marker) so
    // the cursor carries just the item, not the entire library row.
    const ghost = buildDragGhost(product);
    document.body.appendChild(ghost);
    // Center the ghost under the cursor (32×32 → offset 16,16).
    e.dataTransfer.setDragImage(ghost, 24, 24);
    // The browser owns the ghost for the duration of the drag; clean up after.
    window.setTimeout(() => ghost.remove(), 0);
  }

  return (
    <aside
      data-tour="library"
      className="flex flex-col h-full border-r border-border/70 bg-sidebar"
    >
      <div className="border-b border-border/70 px-3 py-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="text-[0.92rem] font-semibold tracking-[-0.01em] text-foreground">
            Library
          </div>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse library"
              aria-label="Collapse library"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
            >
              <PanelLeftClose className="size-3.5" strokeWidth={1.7} />
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products… e.g. Verkada dome"
            className="h-9 w-full rounded-lg border border-border bg-background/50 pl-8 pr-3 text-[0.82rem] outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border/90 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      {!isSearching && (
        <div className="flex border-b border-border/70 overflow-x-auto scrollbar-thin scrollbar-thumb-border/50">
          {CATEGORIES.map((cat) => {
            const tone = TYPE_TONE[cat.key];
            const isActive = activeCategory === cat.key;
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-[0.74rem] font-medium tracking-[-0.005em] transition-colors relative whitespace-nowrap",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]",
                )}
                style={{ minWidth: "5.5rem" }}
              >
                <Icon
                  className={cn(
                    "size-3.5 transition-colors",
                    isActive
                      ? tone.dot.replace("bg-", "text-")
                      : "text-muted-foreground/55",
                  )}
                  strokeWidth={1.8}
                />
                {cat.label}
                {isActive && (
                  <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <ScrollArea className="flex-1">
        {!isSearching && activeCategory === "furniture" ? (
          <FurnitureLibrary />
        ) : (
        <div className="p-3 space-y-1">
          {grouped.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12 px-3">
              {isSearching ? (
                <>
                  <div className="mb-1">No products match</div>
                  <div className="font-medium text-foreground/80">
                    &ldquo;{query}&rdquo;
                  </div>
                </>
              ) : (
                <div>No products in this category</div>
              )}
            </div>
          )}

          {grouped.map(([manufacturer, products]) => {
            const isOpen = isSearching || expandedMfg.has(manufacturer) || grouped.length === 1;
            return (
              <div key={manufacturer}>
                <button
                  type="button"
                  onClick={() => toggleMfg(manufacturer)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  <span className="text-[0.78rem] font-semibold tracking-[-0.005em]">
                    {manufacturer}
                  </span>
                  <span className="ml-auto text-[0.62rem] font-mono text-muted-foreground/70">
                    {products.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="ml-1 space-y-1 pb-2">
                    {products.map((product) => {
                      // Virtual library tabs override the catalog category
                      // so the row tone matches the tab the user is in.
                      const toneKey: keyof typeof TYPE_TONE =
                        DOOR_HARDWARE_SUBCATEGORIES.has(product.subcategory)
                          ? "door-hardware"
                          : PERIMETER_SUBCATEGORIES.has(product.subcategory)
                            ? "perimeter"
                            : INSTALL_HARDWARE_SUBCATEGORIES.has(product.subcategory)
                              ? "install"
                              : product.subcategory === "pull-station" ||
                                  product.subcategory === "facp" ||
                                  product.subcategory === "exit-sign" ||
                                  product.subcategory === "aed"
                                ? "fire-life-safety"
                                : product.category;
                      const tone = TYPE_TONE[toneKey];
                      const preview = SUBCATEGORY_TO_PREVIEW[product.subcategory] ?? { type: "camera", subtype: "dome" };
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleAdd(product)}
                          draggable
                          onDragStart={(e) => handleDragStart(e, product)}
                          className={cn(
                            "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl",
                            "bg-card/30 px-2.5 py-2 text-left ring-1 ring-border/40",
                            "transition-[transform,background-color,box-shadow,ring] duration-200",
                            "hover:bg-card hover:ring-border hover:shadow-[0_4px_18px_-10px_rgba(0,0,0,0.18)]",
                            "active:scale-[0.99] cursor-grab active:cursor-grabbing",
                          )}
                        >
                          <div
                            className="relative size-12 shrink-0 rounded-xl"
                            style={{
                              background: `radial-gradient(circle at 50% 35%, ${tone.glow}, transparent 75%)`,
                              filter:
                                "drop-shadow(0 3px 5px rgba(0, 0, 0, 0.18))",
                            }}
                          >
                            <DevicePreview3D kind={preview} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[0.84rem] font-medium tracking-[-0.005em] text-foreground/95">
                                {product.model}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 inline-flex items-center gap-1 text-[0.62rem] tracking-[-0.005em] text-muted-foreground",
                                )}
                              >
                                <span className={cn("size-1 rounded-full", tone.dot)} />
                                {product.subcategory}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[0.7rem] text-muted-foreground/75">
                              <span className="truncate">{product.description}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 text-[0.7rem] text-muted-foreground/60 tabular-nums">
                            {formatPrice(product.streetPrice)}
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60"
                              aria-hidden="true"
                            >
                              <circle cx="9" cy="6" r="1" />
                              <circle cx="9" cy="12" r="1" />
                              <circle cx="9" cy="18" r="1" />
                              <circle cx="15" cy="6" r="1" />
                              <circle cx="15" cy="12" r="1" />
                              <circle cx="15" cy="18" r="1" />
                            </svg>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </ScrollArea>
    </aside>
  );
}

/**
 * Furniture library — renders the 5 furniture types as clickable cards.
 * Click → drops a piece at a random spot near the floor center, using
 * the type's real-world default footprint. AI Survey can also detect +
 * place these from an uploaded floor plan; this panel is for manual
 * additions.
 */
function FurnitureLibrary() {
  const floor = useActiveFloor();
  const addFurniture = useDesignStore((s) => s.addFurniture);

  const items: {
    type:
      | "desk" | "chair" | "conference-table" | "kitchen-island" | "sofa"
      | "toilet" | "sink" | "refrigerator" | "bed" | "bookshelf" | "tv-display";
    label: string;
    desc: string;
    sizeM: string;
  }[] = [
    { type: "desk", label: "Desk", desc: "Workstation with monitor + keyboard", sizeM: "1.5 × 0.75 m" },
    { type: "chair", label: "Office Chair", desc: "Ergonomic mesh chair, 5-star base", sizeM: "0.6 × 0.6 m" },
    { type: "conference-table", label: "Conference Table", desc: "Oval walnut top, chrome column", sizeM: "3.0 × 1.2 m" },
    { type: "sofa", label: "Sofa", desc: "3-seat sofa with throw pillows", sizeM: "2.2 × 0.95 m" },
    { type: "bed", label: "Bed (queen)", desc: "Padded headboard + folded blanket", sizeM: "2.0 × 1.5 m" },
    { type: "kitchen-island", label: "Kitchen Island", desc: "Marble counter on wood cabinets", sizeM: "2.4 × 1.0 m" },
    { type: "refrigerator", label: "Refrigerator", desc: "Stainless two-door, top freezer", sizeM: "0.85 × 0.72 m" },
    { type: "sink", label: "Sink", desc: "Pedestal sink with chrome faucet + mirror", sizeM: "0.6 × 0.5 m" },
    { type: "toilet", label: "Toilet", desc: "Two-piece porcelain", sizeM: "0.7 × 0.42 m" },
    { type: "bookshelf", label: "Bookshelf", desc: "5-shelf unit with colored books + plant", sizeM: "1.0 × 0.35 m" },
    { type: "tv-display", label: "TV / Display", desc: "Wall-mounted 55″ flat panel", sizeM: "1.4 × 0.1 m" },
  ];

  function handlePlace(type: typeof items[number]["type"]) {
    if (!floor) return;
    const defaults: Record<string, { lengthM: number; widthM: number; label: string }> = {
      desk: { lengthM: 1.5, widthM: 0.75, label: "Desk" },
      chair: { lengthM: 0.6, widthM: 0.6, label: "Chair" },
      "conference-table": { lengthM: 3.0, widthM: 1.2, label: "Conference Table" },
      "kitchen-island": { lengthM: 2.4, widthM: 1.0, label: "Kitchen Island" },
      sofa: { lengthM: 2.2, widthM: 0.95, label: "Sofa" },
      toilet: { lengthM: 0.7, widthM: 0.42, label: "Toilet" },
      sink: { lengthM: 0.6, widthM: 0.5, label: "Sink" },
      refrigerator: { lengthM: 0.85, widthM: 0.72, label: "Refrigerator" },
      bed: { lengthM: 2.0, widthM: 1.5, label: "Bed" },
      bookshelf: { lengthM: 1.0, widthM: 0.35, label: "Bookshelf" },
      "tv-display": { lengthM: 1.4, widthM: 0.1, label: "TV / Display" },
    };
    const d = defaults[type];
    // Drop near the center of the wall bounding box so the user can see
    // it immediately; nudge a bit randomly so multiple drops don't pile.
    let cx = 400, cz = 400;
    if (floor.walls.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const w of floor.walls) {
        minX = Math.min(minX, w.start.x, w.end.x);
        maxX = Math.max(maxX, w.start.x, w.end.x);
        minY = Math.min(minY, w.start.y, w.end.y);
        maxY = Math.max(maxY, w.start.y, w.end.y);
      }
      cx = (minX + maxX) / 2 + (Math.random() - 0.5) * 80;
      cz = (minY + maxY) / 2 + (Math.random() - 0.5) * 80;
    }
    addFurniture(floor.id, {
      type,
      position: { x: cx, y: cz },
      rotation: 0,
      lengthM: d.lengthM,
      widthM: d.widthM,
      label: d.label,
    });
  }

  return (
    <div className="p-3 space-y-2">
      {items.map((it) => (
        <button
          key={it.type}
          type="button"
          onClick={() => handlePlace(it.type)}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 text-left",
            "transition-colors hover:bg-card hover:border-border",
          )}
        >
          <div
            className="size-10 shrink-0 rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${
                FURNITURE_THUMB[it.type]
              } 0%, ${FURNITURE_THUMB[it.type]}99 100%)`,
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[0.84rem] font-medium tracking-[-0.005em] text-foreground/95">
              {it.label}
            </div>
            <div className="text-[0.7rem] text-muted-foreground/75 truncate">
              {it.desc}
            </div>
          </div>
          <div className="shrink-0 text-[0.65rem] font-mono text-muted-foreground/60">
            {it.sizeM}
          </div>
        </button>
      ))}
      <div className="px-2 pt-2 text-[0.65rem] text-muted-foreground/65 leading-snug">
        Click to drop. The piece appears near the center of the floor — drag it
        anywhere or rotate via Properties.
      </div>
    </div>
  );
}

const FURNITURE_THUMB: Record<string, string> = {
  desk: "#fde68a",
  chair: "#a7f3d0",
  "conference-table": "#bae6fd",
  "kitchen-island": "#fbcfe8",
  sofa: "#ddd6fe",
  toilet: "#e0f2fe",
  sink: "#cffafe",
  refrigerator: "#e2e8f0",
  bed: "#fed7aa",
  bookshelf: "#fef3c7",
  "tv-display": "#1e293b",
};

/* ── Drag ghost ─────────────────────────────────────────────────────────
   Build a small offscreen DOM element used by `setDragImage` so the
   cursor carries just the device (not the entire library row banner).
   The element is added to the body so the browser can snapshot it, then
   removed on the next tick. */

const DRAG_GHOST_COLORS: Record<string, string> = {
  camera: "#3b82f6",
  reader: "#0ea5e9",
  sensor: "#f59e0b",
  network: "#a78bfa",
  "door-hardware": "#f43f5e", // rose-500 — matches the door-hardware tone
  perimeter: "#10b981", // emerald-500
  "fire-life-safety": "#f97316", // orange-500
  install: "#64748b", // slate-500
};

function buildDragGhost(product: CatalogProduct): HTMLElement {
  const ghostKey = DOOR_HARDWARE_SUBCATEGORIES.has(product.subcategory)
    ? "door-hardware"
    : PERIMETER_SUBCATEGORIES.has(product.subcategory)
      ? "perimeter"
      : INSTALL_HARDWARE_SUBCATEGORIES.has(product.subcategory)
        ? "install"
        : product.subcategory === "pull-station" ||
            product.subcategory === "facp" ||
            product.subcategory === "exit-sign" ||
            product.subcategory === "aed"
          ? "fire-life-safety"
          : product.category;
  const color = DRAG_GHOST_COLORS[ghostKey] ?? "#3b82f6";
  const root = document.createElement("div");
  // Position it offscreen so it's never visible to the user — the browser
  // only needs it to exist long enough to snapshot for the drag image.
  root.style.position = "fixed";
  root.style.top = "-1000px";
  root.style.left = "-1000px";
  root.style.width = "48px";
  root.style.height = "48px";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";
  root.style.pointerEvents = "none";
  root.style.fontFamily = "system-ui, sans-serif";

  // Outer white ring (matches the 2D canvas marker).
  const ring = document.createElement("div");
  ring.style.width = "36px";
  ring.style.height = "36px";
  ring.style.borderRadius = "50%";
  ring.style.background = "#ffffff";
  ring.style.boxShadow = "0 6px 14px -4px rgba(0,0,0,0.35)";
  ring.style.display = "flex";
  ring.style.alignItems = "center";
  ring.style.justifyContent = "center";
  root.appendChild(ring);

  // Inner colored body.
  const body = document.createElement("div");
  body.style.width = "28px";
  body.style.height = "28px";
  body.style.borderRadius = "50%";
  body.style.background = color;
  body.style.display = "flex";
  body.style.alignItems = "center";
  body.style.justifyContent = "center";
  body.style.color = "#ffffff";
  body.style.fontSize = "13px";
  body.style.fontWeight = "600";
  body.textContent = product.subcategory
    ? product.subcategory.charAt(0).toUpperCase()
    : "·";
  ring.appendChild(body);

  return root;
}
