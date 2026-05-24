"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  ChevronDown,
  Compass,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  FileText,
  Images,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/branding/Logo";
import { useDesignStore, useCurrentDesign, useActiveFloor } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ModeSwitcher } from "./ModeSwitcher";
import { toast } from "sonner";

export function TopBar() {
  const design = useCurrentDesign();
  const floor = useActiveFloor();
  const updateName = useDesignStore((s) => s.updateDesignName);
  const importDesign = useDesignStore((s) => s.importDesign);
  const quoteSettings = useDesignStore((s) => s.quoteSettings);
  const setQuoteOpen = useDesignStore((s) => s.setQuoteOpen);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!design) return null;

  function exportJSON() {
    if (!design) return;
    const blob = new Blob([JSON.stringify(design, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${design.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "design"}.dvjson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Design exported", {
      description: `${a.download} saved to your downloads.`,
    });
  }

  function importJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed?.id || !Array.isArray(parsed?.floors)) {
          throw new Error("Invalid design file");
        }
        importDesign(parsed);
        toast.success("Design imported", {
          description: `Loaded "${parsed.name}".`,
        });
      } catch {
        toast.error("Couldn't read that file", {
          description: "Make sure it's a .dvjson export from DeeperVision.",
        });
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-border/70 bg-sidebar px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-[0.92rem] font-medium tracking-[-0.01em] text-foreground/90 hover:text-foreground transition-colors"
          >
            <span className="flex size-6 items-center justify-center text-primary">
              <LogoMark strokeWidth={1.8} />
            </span>
            DeeperVision
          </Link>
          <div className="h-4 w-px bg-border/70" />
          {/* Inline title editor — auto-sizes to its content so the
              focus/hover background never extends past the actual text.
              Capped at a comfortable max so very long titles wrap. */}
          <TitleInput value={design.name} onChange={(v) => updateName(design.id, v)} />
        </div>

        <ModeSwitcher />

        <div className="flex flex-1 items-center justify-end gap-1">
          {/* Show-coverage toggle. Lives here (not just in the 2D toolbar)
              so users in 3D/Sim can also flip camera FOV cones + sensor
              rings on/off without changing modes. */}
          <CoverageToggle />

          {/* AI chat tab toggle (no dropdown, no kbd hint). */}
          <AIMenu />

          {/* Single combined Project menu — replaces File + Export.
              Holds save, import, and every export option (PDF, BoM CSV,
              device schedule CSV, dvjson). */}
          <span data-tour="project-menu" className="inline-flex">
            <ProjectMenu
              design={design}
              floor={floor}
              quoteSettings={quoteSettings}
              onImport={() => fileInputRef.current?.click()}
              onSaveJson={exportJSON}
            />
          </span>

          <Button
            data-tour="quote"
            size="sm"
            className="btn-lift ml-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[inset_0_1px_0_oklch(1_0_0/14%),0_4px_14px_-6px_oklch(0.78_0.135_158/50%)]"
            onClick={() => setQuoteOpen(true)}
          >
            <Banknote className="size-3.5" />
            Quote
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dvjson,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJSON(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      {/* QuoteDrawer is mounted at the EditorShell level now so the AI chat
          panel can open it too via the same store flag. */}
    </>
  );
}

/**
 * Top-bar AI dropdown — Survey (auto-design from image) + Advisor (analyse
 * coverage of an existing design). Both trigger state living in the design
 * store so the actual UI (dialog / drawer) is mounted at EditorShell level.
 */
/**
 * Single AI button — clicking it toggles the AI tab in the right sidebar.
 * No dropdown, no flyout. Survey and Advisor are accessible from inside
 * the chat's empty state ("From plan image" / "Analyze coverage" buttons).
 */

/**
 * Top-bar chip that toggles camera FOV cones + sensor rings on the
 * canvas. Mirrors the 2D toolbar button so users in 3D / Sim also have
 * a one-click way to hide coverage when they want a clean view.
 */
function CoverageToggle() {
  const showCoverage = useDesignStore((s) => s.showCoverage);
  const toggleCoverage = useDesignStore((s) => s.toggleCoverage);
  return (
    <button
      type="button"
      onClick={toggleCoverage}
      title={showCoverage ? "Hide camera coverage" : "Show camera coverage"}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[0.78rem] font-medium transition-colors",
        showCoverage
          ? "text-foreground hover:bg-foreground/[0.04]"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
      )}
    >
      {showCoverage ? (
        <Eye className="size-3.5" strokeWidth={1.8} />
      ) : (
        <EyeOff className="size-3.5" strokeWidth={1.8} />
      )}
      <span>Coverage</span>
    </button>
  );
}

function AIMenu() {
  const rightTab = useDesignStore((s) => s.rightTab);
  const setRightTab = useDesignStore((s) => s.setRightTab);
  const active = rightTab === "ai";
  return (
    <button
      type="button"
      onClick={() => setRightTab(active ? "properties" : "ai")}
      className={
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[0.8rem] font-medium transition-colors " +
        (active
          ? "bg-primary/12 text-primary"
          : "text-primary hover:bg-primary/10")
      }
      aria-pressed={active}
      title={active ? "Hide AI chat" : "Open AI chat (⌘K)"}
    >
      <Sparkles className="size-3.5" strokeWidth={1.9} />
      <span className="hidden sm:inline">AI</span>
    </button>
  );
}

/**
 * Combined project + export menu. Replaces the two separate dropdowns
 * (File / Export) — all project operations + every export now live in
 * one menu under a single "Project" entry.
 */
function ProjectMenu({
  design,
  floor,
  quoteSettings,
  onImport,
  onSaveJson,
}: {
  design: ReturnType<typeof useCurrentDesign>;
  floor: ReturnType<typeof useActiveFloor>;
  quoteSettings: ReturnType<typeof useDesignStore.getState>["quoteSettings"];
  onImport: () => void;
  onSaveJson: () => void;
}) {
  const [open, setOpen] = useState(false);

  async function exportPDF() {
    if (!design || !floor) return;
    toast.info("Generating PDF…");
    const { exportFloorPlanPDF } = await import("@/lib/export");
    await exportFloorPlanPDF(design, floor, {
      preparedBy: quoteSettings.preparedBy,
      preparedFor: quoteSettings.clientName,
      companyLogoDataUrl: quoteSettings.companyLogoDataUrl || undefined,
      brandColor: quoteSettings.brandColor || undefined,
      printFooter: quoteSettings.printFooter || undefined,
    });
    toast.success("PDF exported");
  }
  async function exportBom() {
    if (!design || !floor) return;
    const { exportBOMCSV } = await import("@/lib/export");
    await exportBOMCSV(design, floor);
    toast.success("BOM exported");
  }
  async function exportSchedule() {
    if (!design || !floor) return;
    const { exportDeviceScheduleCSV } = await import("@/lib/export");
    await exportDeviceScheduleCSV(design, floor);
    toast.success("Device schedule exported");
  }
  async function exportPermitPackage() {
    if (!design || !floor) return;
    toast.info("Generating permit package…", { duration: 4000 });
    const { exportPermitPackagePDF } = await import("@/lib/export");
    await exportPermitPackagePDF(design, floor, {
      preparedBy: quoteSettings.preparedBy,
      preparedFor: quoteSettings.clientName,
      companyLogoDataUrl: quoteSettings.companyLogoDataUrl || undefined,
      brandColor: quoteSettings.brandColor || undefined,
      printFooter: quoteSettings.printFooter || undefined,
      // Permit-specific fields are blank by default — the integrator fills
      // them in by hand after print, or we read them from a future
      // PermitSettings dialog. For v1, blank is fine; the sheet still
      // generates with placeholder dashes.
    });
    toast.success("Permit package exported");
  }

  async function exportPhotoTour() {
    if (!design || !floor) return;
    const photoCount = floor.devices.reduce(
      (sum, d) => sum + (d.photos?.length ?? 0),
      0,
    );
    if (photoCount === 0) {
      toast.message("No site-walk photos yet", {
        description:
          "Select a device, click Add in the Photos section, then re-run this export.",
      });
      // Still generate the cover + empty-state page so the user has a
      // sharable artefact to put in front of the team.
    } else {
      toast.info(
        `Generating photo tour… ${photoCount} photo${photoCount === 1 ? "" : "s"}`,
      );
    }
    const { exportPhotoTourPDF } = await import("@/lib/export");
    await exportPhotoTourPDF(design, floor);
    if (photoCount > 0) toast.success("Photo tour exported");
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        className="btn-lift"
        onClick={() => setOpen((v) => !v)}
        aria-label="Project menu"
      >
        <Settings className="size-3.5" />
        Project
        <ChevronDown className="size-3 ml-0.5" />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <MenuSection label="Project file">
              <MenuItem
                icon={<FileDown className="size-3.5 text-muted-foreground" />}
                label="Save project (.dvjson)"
                onClick={() => {
                  setOpen(false);
                  onSaveJson();
                }}
              />
              <MenuItem
                icon={<Upload className="size-3.5 text-muted-foreground" />}
                label="Import project"
                onClick={() => {
                  setOpen(false);
                  onImport();
                }}
              />
            </MenuSection>
            <div className="my-1 border-t border-border/50" />
            <MenuSection label="Export">
              <MenuItem
                icon={<FileText className="size-3.5 text-rose-500" />}
                label="Floor plan PDF"
                description="Install-ready drawing"
                onClick={() => {
                  setOpen(false);
                  exportPDF();
                }}
              />
              <MenuItem
                icon={<ShieldCheck className="size-3.5 text-orange-500" />}
                label="Permit package (PDF)"
                description="10 sheets — AHJ submittal-ready"
                onClick={() => {
                  setOpen(false);
                  exportPermitPackage();
                }}
              />
              <MenuItem
                icon={<FileSpreadsheet className="size-3.5 text-emerald-500" />}
                label="Bill of materials (CSV)"
                description="Quantities, pricing, labor"
                onClick={() => {
                  setOpen(false);
                  exportBom();
                }}
              />
              <MenuItem
                icon={<FileSpreadsheet className="size-3.5 text-sky-500" />}
                label="Device schedule (CSV)"
                description="Every device, one row each"
                onClick={() => {
                  setOpen(false);
                  exportSchedule();
                }}
              />
              <MenuItem
                icon={<Images className="size-3.5 text-violet-500" />}
                label="Photo tour (PDF)"
                description="Every site-walk photo, one per page"
                onClick={() => {
                  setOpen(false);
                  exportPhotoTour();
                }}
              />
            </MenuSection>
            <div className="my-1 border-t border-border/50" />
            <MenuSection label="Help">
              <MenuItem
                icon={<Compass className="size-3.5 text-primary" />}
                label="Take the tour"
                description="60-second walkthrough of the editor"
                onClick={() => {
                  setOpen(false);
                  useDesignStore.getState().startTour();
                }}
              />
            </MenuSection>
          </div>
        </>
      )}
    </div>
  );
}

function MenuSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[0.8rem] font-medium leading-tight">{label}</div>
        {description && (
          <div className="text-[0.66rem] text-muted-foreground leading-snug">
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Inline title editor. The input visually sizes to its actual text so the
 * hover/focus background never sprawls past the title itself.
 *
 * Uses a hidden span to measure, then sets the input's width to match
 * (capped at a comfortable max so very long titles wrap into the next
 * row of chrome rather than pushing the mode switcher).
 */
function TitleInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="group relative inline-flex min-w-0 items-center">
      <span
        aria-hidden
        className="invisible whitespace-pre px-2 py-1 text-[0.92rem] tracking-[-0.005em]"
      >
        {value || "Untitled design"}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="peer absolute inset-0 min-w-[8ch] max-w-[26rem] rounded-md px-2 py-1 text-[0.92rem] tracking-[-0.005em] bg-transparent outline-none placeholder:text-muted-foreground/60 hover:bg-foreground/[0.04] focus:bg-foreground/[0.04] focus:ring-1 focus:ring-primary/40 transition-colors"
        placeholder="Untitled design"
        spellCheck={false}
        size={Math.max(8, value.length || 16)}
      />
    </div>
  );
}

