"use client";

import { useState } from "react";
import {
  Camera,
  DoorOpen,
  Radar,
  Search,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DeviceType } from "@/types/design";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface DeviceCard {
  type: DeviceType;
  subtype: string;
  label: string;
  icon: LucideIcon;
  description: string;
  accent: string;
}

const catalog: { category: string; items: DeviceCard[] }[] = [
  {
    category: "Cameras",
    items: [
      {
        type: "camera",
        subtype: "dome",
        label: "Dome camera",
        icon: Camera,
        description: "Indoor, ceiling-mount, 90° FOV",
        accent: "text-emerald-400",
      },
      {
        type: "camera",
        subtype: "ptz",
        label: "PTZ camera",
        icon: Camera,
        description: "Pan / tilt / zoom, 60° FOV",
        accent: "text-emerald-400",
      },
      {
        type: "camera",
        subtype: "fixed",
        label: "Fixed camera",
        icon: Camera,
        description: "Wall-mount, 80° FOV",
        accent: "text-emerald-400",
      },
    ],
  },
  {
    category: "Access control",
    items: [
      {
        type: "reader",
        subtype: "card",
        label: "Card reader",
        icon: DoorOpen,
        description: "Door-side mount, 1.2m",
        accent: "text-sky-400",
      },
      {
        type: "reader",
        subtype: "biometric",
        label: "Biometric reader",
        icon: DoorOpen,
        description: "Fingerprint or face",
        accent: "text-sky-400",
      },
    ],
  },
  {
    category: "Sensors",
    items: [
      {
        type: "sensor",
        subtype: "motion",
        label: "Motion sensor",
        icon: Radar,
        description: "PIR, 8m detection",
        accent: "text-amber-400",
      },
      {
        type: "sensor",
        subtype: "glass-break",
        label: "Glass-break",
        icon: Radar,
        description: "Acoustic, 6m range",
        accent: "text-amber-400",
      },
      {
        type: "sensor",
        subtype: "door-contact",
        label: "Door contact",
        icon: Radar,
        description: "Magnetic switch",
        accent: "text-amber-400",
      },
    ],
  },
  {
    category: "Network",
    items: [
      {
        type: "network",
        subtype: "access-point",
        label: "WiFi AP",
        icon: Wifi,
        description: "WiFi 6, 15m coverage",
        accent: "text-violet-400",
      },
      {
        type: "network",
        subtype: "switch",
        label: "Network switch",
        icon: Wifi,
        description: "PoE, 24 ports",
        accent: "text-violet-400",
      },
      {
        type: "network",
        subtype: "nvr",
        label: "NVR",
        icon: Wifi,
        description: "Network video recorder",
        accent: "text-violet-400",
      },
    ],
  },
];

export function LibraryPanel() {
  const [query, setQuery] = useState("");
  const floor = useActiveFloor();
  const addDevice = useDesignStore((s) => s.addDevice);

  const lower = query.trim().toLowerCase();
  const filtered = catalog
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (i) =>
          !lower ||
          i.label.toLowerCase().includes(lower) ||
          i.description.toLowerCase().includes(lower) ||
          group.category.toLowerCase().includes(lower)
      ),
    }))
    .filter((g) => g.items.length > 0);

  function quickAdd(card: DeviceCard) {
    if (!floor) return;
    addDevice(floor.id, card.type, { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 });
  }

  return (
    <aside className="flex flex-col h-full border-r border-border/70 bg-sidebar">
      <div className="border-b border-border/70 px-3 py-3">
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
          Device library
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices…"
            className="pl-8 h-9 bg-background/40"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-5">
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              No devices match &ldquo;{query}&rdquo;.
            </div>
          )}
          {filtered.map((group) => (
            <div key={group.category}>
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                {group.category}
              </div>
              <div className="space-y-1.5">
                {group.items.map((card) => (
                  <button
                    key={card.label}
                    type="button"
                    onClick={() => quickAdd(card)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/x-dv-device",
                        JSON.stringify({ type: card.type, subtype: card.subtype })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-lg border border-border bg-card/40 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card",
                      "cursor-grab active:cursor-grabbing"
                    )}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                      <card.icon className={cn("size-4.5", card.accent)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {card.label}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {card.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
