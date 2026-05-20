"use client";

import Link from "next/link";
import { Download, Eye, Save } from "lucide-react";
import { useDesignStore, useCurrentDesign } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ModeSwitcher } from "./ModeSwitcher";
import { toast } from "sonner";

export function TopBar() {
  const design = useCurrentDesign();
  const updateName = useDesignStore((s) => s.updateDesignName);

  if (!design) return null;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border/70 bg-sidebar px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-[0.92rem] font-medium tracking-[-0.01em]"
        >
          <div className="flex size-6 items-center justify-center rounded border border-border bg-card/60">
            <Eye className="size-3 text-primary" />
          </div>
          Deeper Vision
        </Link>
        <div className="h-4 w-px bg-border" />
        <input
          value={design.name}
          onChange={(e) => updateName(design.id, e.target.value)}
          className="min-w-0 max-w-xs flex-1 rounded px-1.5 py-1 text-[0.92rem] tracking-[-0.005em] bg-transparent outline-none placeholder:text-muted-foreground/70 focus:outline-1 focus:outline-primary/40"
          placeholder="Untitled design"
          spellCheck={false}
        />
      </div>

      <ModeSwitcher />

      <div className="flex flex-1 items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="btn-lift"
          onClick={() =>
            toast.success("Saved", {
              description: "Your design is stored locally.",
            })
          }
        >
          <Save className="size-3.5" />
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="btn-lift"
          onClick={() =>
            toast.info("Export coming soon", {
              description: "PDF + BoM export lands in milestone 7.",
            })
          }
        >
          <Download className="size-3.5" />
          Export
        </Button>
      </div>
    </header>
  );
}
