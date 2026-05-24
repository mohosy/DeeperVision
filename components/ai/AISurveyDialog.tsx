"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  loadImageMeta,
  loadPdfPageThumbnails,
  runAISurvey,
  runAISurveyCheck,
} from "@/lib/ai-survey";
import { applySurveyToActiveFloor } from "@/lib/ai-apply";
import { useDesignStore } from "@/lib/store";

type Phase = "upload" | "configure" | "running" | "done";

const STATUS_STEPS: { label: string; minDuration: number }[] = [
  { label: "Reading floor plan…", minDuration: 1500 },
  { label: "Measuring scale and identifying rooms…", minDuration: 2500 },
  { label: "Tracing walls and openings…", minDuration: 3000 },
  { label: "Placing cameras, readers, and sensors…", minDuration: 3500 },
  { label: "Finalizing design…", minDuration: 1000 },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AISurveyDialog({ open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [buildingType, setBuildingType] = useState("");
  const [projectNotes, setProjectNotes] = useState("");
  const [statusStepIndex, setStatusStepIndex] = useState(0);
  // PDF state: when the user uploads a multi-page PDF we show a
  // thumbnail picker so they can choose the actual plan page (vs. a
  // title sheet or sheet index). For single-page PDFs we skip the
  // picker and use page 1 directly.
  const [pdfThumbnails, setPdfThumbnails] = useState<
    { page: number; dataUrl: string; width: number; height: number }[] | null
  >(null);
  const [pdfPage, setPdfPage] = useState<number>(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cycle through status messages while the request is in-flight so the user
  // sees progress even though the real request runs as a single round-trip.
  useEffect(() => {
    if (phase !== "running") return;
    setStatusStepIndex(0);
    let cancelled = false;
    let i = 0;
    function next() {
      if (cancelled) return;
      const step = STATUS_STEPS[i];
      if (!step) return;
      window.setTimeout(() => {
        if (cancelled) return;
        i = Math.min(i + 1, STATUS_STEPS.length - 1);
        setStatusStepIndex(i);
        if (i < STATUS_STEPS.length - 1) next();
      }, step.minDuration);
    }
    next();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Reset state when the dialog closes
  useEffect(() => {
    if (!open) {
      const t = window.setTimeout(() => {
        setPhase("upload");
        setFile(null);
        setImagePreview(null);
        setBuildingType("");
        setProjectNotes("");
        setPdfThumbnails(null);
        setPdfPage(1);
        setPdfLoading(false);
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  async function handleFileChosen(f: File | null) {
    if (!f) return;
    setFile(f);

    const isPdf =
      f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (isPdf) {
      // Render all pages to thumbnails so the user can pick the right
      // one. Single-page PDFs skip the picker.
      setPdfLoading(true);
      setPdfThumbnails(null);
      setPdfPage(1);
      try {
        const { totalPages, thumbnails } = await loadPdfPageThumbnails(f);
        setPdfLoading(false);
        if (totalPages === 1) {
          // No picker needed — preview page 1 directly.
          setImagePreview(thumbnails[0]?.dataUrl ?? null);
          setPhase("configure");
        } else {
          setPdfThumbnails(thumbnails);
          setImagePreview(thumbnails[0]?.dataUrl ?? null);
          setPhase("configure");
        }
      } catch (err) {
        setPdfLoading(false);
        toast.error("Couldn't read PDF", {
          description:
            err instanceof Error
              ? err.message
              : "The file may be encrypted or malformed.",
        });
      }
      return;
    }

    // Regular image path
    const reader = new FileReader();
    reader.onload = () => setImagePreview(String(reader.result));
    reader.readAsDataURL(f);
    setPhase("configure");
  }

  async function handleRun() {
    if (!file) return;
    setPhase("running");
    try {
      const meta = await loadImageMeta(file, { pdfPage });
      const survey = await runAISurvey({
        imageBase64: meta.base64,
        imageMediaType: meta.mediaType,
        imageWidth: meta.width,
        imageHeight: meta.height,
        buildingType: buildingType.trim() || undefined,
        projectNotes: projectNotes.trim() || undefined,
      });
      const { wallsAdded, furnitureAdded } = applySurveyToActiveFloor(survey, meta.base64);
      setPhase("done");
      // Switch to 2D view + the wall-correction tool so the user can
      // immediately verify the trace against the floor plan image and
      // drag any misaligned endpoints into place.
      useDesignStore.getState().setViewMode("2d");
      useDesignStore.getState().setTool("correct-walls");
      // Clear any stale check from a prior run so the banner only shows
      // the result of THIS survey.
      useDesignStore.getState().setSurveyCheck(null);
      toast.success("Walls traced", {
        description:
          `Generated ${wallsAdded} wall${wallsAdded === 1 ? "" : "s"}` +
          (furnitureAdded > 0
            ? ` and ${furnitureAdded} furniture piece${furnitureAdded === 1 ? "" : "s"}`
            : "") +
          `. Running self-check…`,
        duration: 5000,
      });
      window.setTimeout(() => onClose(), 1400);

      // Self-check pass — runs in the background after the dialog
      // closes. Result lands in the surveyCheck store slot, which the
      // canvas banner subscribes to. Failure is silent (the trace still
      // exists; the check is purely a safety net).
      try {
        const check = await runAISurveyCheck({
          imageBase64: meta.base64,
          imageMediaType: meta.mediaType,
          imageWidth: meta.width,
          imageHeight: meta.height,
          scalePxPerMeter: survey.scalePxPerMeter,
          walls: survey.walls,
        });
        useDesignStore.getState().setSurveyCheck({
          overallConfidence: check.overallConfidence,
          summary: check.summary,
          issues: check.issues,
          ranAt: Date.now(),
        });
      } catch (err) {
        console.warn("AI Survey self-check failed:", err);
      }
    } catch (err) {
      console.error(err);
      setPhase("configure");
      toast.error("AI survey failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={phase === "running" ? undefined : onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-md"
      />

      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-[0_25px_80px_-20px_rgba(0,0,0,0.4)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Sparkles className="size-4" strokeWidth={1.7} />
            </div>
            <div>
              <div className="text-[0.95rem] font-semibold tracking-[-0.01em]">
                Trace walls from a plan
              </div>
              <div className="text-[0.74rem] text-muted-foreground">
                Upload a floor plan — Claude draws the walls. You add devices.
              </div>
            </div>
          </div>
          {phase !== "running" && (
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {phase === "upload" && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pdfLoading}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-foreground/[0.02] py-10 transition-colors hover:bg-foreground/[0.04] hover:border-primary/40",
                pdfLoading && "cursor-wait opacity-70",
              )}
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-foreground/[0.05]">
                {pdfLoading ? (
                  <Loader2
                    className="size-5 text-muted-foreground animate-spin"
                    strokeWidth={1.8}
                  />
                ) : (
                  <UploadCloud
                    className="size-5 text-muted-foreground"
                    strokeWidth={1.6}
                  />
                )}
              </div>
              <div className="text-center">
                <div className="text-[0.92rem] font-medium">
                  {pdfLoading ? "Reading PDF…" : "Drop in a floor plan"}
                </div>
                <div className="mt-0.5 text-[0.76rem] text-muted-foreground">
                  PNG, JPG, WebP, or PDF. Multi-page PDFs let you pick the
                  sheet.
                </div>
              </div>
            </button>
          )}

          {phase === "configure" && imagePreview && (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-lg ring-1 ring-border bg-foreground/[0.02]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Uploaded floor plan"
                  className="max-h-56 w-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setImagePreview(null);
                    setPdfThumbnails(null);
                    setPdfPage(1);
                    setPhase("upload");
                  }}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-[0.72rem] text-muted-foreground backdrop-blur hover:text-foreground"
                >
                  <X className="size-3" /> Change
                </button>
              </div>

              {/* Multi-page PDF picker — only shown when the upload was a
                  PDF with more than one page. Lets the user select which
                  sheet is the actual floor plan (vs. a title sheet). */}
              {pdfThumbnails && pdfThumbnails.length > 1 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[0.78rem] font-medium text-foreground/85">
                      Pick the floor-plan page
                    </label>
                    <span className="text-[0.7rem] text-muted-foreground">
                      Page {pdfPage} of {pdfThumbnails.length}
                    </span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {pdfThumbnails.map((t) => (
                      <button
                        key={t.page}
                        type="button"
                        onClick={() => {
                          setPdfPage(t.page);
                          setImagePreview(t.dataUrl);
                        }}
                        className={cn(
                          "group relative shrink-0 overflow-hidden rounded-md ring-1 transition-all",
                          pdfPage === t.page
                            ? "ring-2 ring-primary shadow-md"
                            : "ring-border hover:ring-foreground/40",
                        )}
                        aria-label={`Page ${t.page}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.dataUrl}
                          alt={`Page ${t.page}`}
                          className="block h-24 w-auto bg-white"
                        />
                        <span
                          className={cn(
                            "absolute bottom-0 left-0 right-0 px-1.5 py-0.5 text-center text-[0.62rem] font-medium",
                            pdfPage === t.page
                              ? "bg-primary text-primary-foreground"
                              : "bg-black/55 text-white",
                          )}
                        >
                          {t.page}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[0.78rem] font-medium text-foreground/85">
                  Building type{" "}
                  <span className="text-muted-foreground/70 font-normal">
                    (optional)
                  </span>
                </label>
                <input
                  value={buildingType}
                  onChange={(e) => setBuildingType(e.target.value)}
                  placeholder="e.g. medical clinic, warehouse, school"
                  className="w-full rounded-md border border-border bg-background/40 px-3 py-2 text-[0.85rem] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.78rem] font-medium text-foreground/85">
                  Special instructions{" "}
                  <span className="text-muted-foreground/70 font-normal">
                    (optional)
                  </span>
                </label>
                <textarea
                  value={projectNotes}
                  onChange={(e) => setProjectNotes(e.target.value)}
                  placeholder="e.g. focus on perimeter security, customer requested 4K cameras at entries"
                  rows={3}
                  className="w-full rounded-md border border-border bg-background/40 px-3 py-2 text-[0.85rem] outline-none resize-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                />
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-[0.76rem] text-foreground/75">
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  Heads up:
                </span>{" "}
                running this replaces the walls on the active floor. Your
                placed devices stay where they are. The traced walls are a
                starting point — refine anything that's off.
              </div>
            </div>
          )}

          {phase === "running" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="relative flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Loader2 className="size-6 animate-spin" strokeWidth={1.7} />
                </div>
              </div>
              <div className="space-y-1 text-center">
                <div className="text-[0.92rem] font-medium tracking-[-0.005em]">
                  {STATUS_STEPS[statusStepIndex]?.label ?? "Working…"}
                </div>
                <div className="text-[0.74rem] text-muted-foreground">
                  Usually takes 10–30 seconds.
                </div>
              </div>
              <div className="mt-2 flex gap-1">
                {STATUS_STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 w-6 rounded-full transition-colors",
                      i <= statusStepIndex
                        ? "bg-primary"
                        : "bg-foreground/[0.08]",
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div className="text-[0.92rem] font-medium">Design applied</div>
              <div className="text-[0.76rem] text-muted-foreground max-w-xs">
                Closing — your new design is on the canvas. Edit anything you
                want.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "configure" && (
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-[0.85rem] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={!file}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[0.85rem] font-medium text-primary-foreground shadow-[0_4px_14px_-6px_oklch(0.55_0.17_245/55%)] hover:bg-primary/90 disabled:opacity-50"
            >
              <Sparkles className="size-3.5" />
              Generate design
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}
