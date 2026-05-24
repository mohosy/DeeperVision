import type { DeviceType } from "@/types/design";

export interface SurveyProposedWall {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  rationale?: string;
}

export interface SurveyProposedDevice {
  type: DeviceType;
  subtype?: string;
  x: number;
  y: number;
  rotationDegrees: number;
  label: string;
  rangeMeters?: number;
  fovDegrees?: number;
  rationale: string;
}

export interface SurveyProposedFurniture {
  type:
    | "desk"
    | "chair"
    | "conference-table"
    | "kitchen-island"
    | "sofa"
    | "toilet"
    | "sink"
    | "refrigerator"
    | "bed"
    | "bookshelf"
    | "tv-display";
  x: number;
  y: number;
  rotationDegrees: number;
  lengthM: number;
  widthM: number;
  label?: string;
  rationale?: string;
}

export interface SurveyResponse {
  scalePxPerMeter: number;
  walls: SurveyProposedWall[];
  devices: SurveyProposedDevice[];
  /** Furniture detected in the image. Empty if the floor plan didn't
   *  show any. */
  furniture?: SurveyProposedFurniture[];
  summary: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Read a File (from a file input) into a base64 data URL and capture its
 * dimensions.
 *
 * Accepts:
 *  - PNG / JPEG / WebP / GIF — used directly
 *  - PDF — first page (or `pdfPage` if specified, 1-based) is rendered
 *    to a 2× canvas and converted to PNG. Floor plans distributed as
 *    PDFs are the norm in commercial AEC workflows, so this is a
 *    must-have ingest path.
 *
 * Large images (>1500 px on the long edge) are downscaled before
 * returning. We do this for TWO reasons:
 *
 *  1. **Claude vision coordinate stability.** When the source image is
 *     significantly larger than ~1500 px, Claude tends to return
 *     wall/device coordinates compressed into a smaller logical range
 *     (e.g. 0–700) instead of the actual image-pixel range. The result
 *     is walls clustered in the top-left corner of the canvas while the
 *     planImage extends the full size. Normalizing the input fixes this
 *     reliably.
 *  2. **Token cost.** Bigger images cost more input tokens for no
 *     additional value — Claude has already understood the layout at
 *     1500 px.
 *
 * The downscaled image is what we save as `planImage` AND what we send
 * to Claude, so coordinates and rendering stay aligned.
 */
export async function loadImageMeta(
  file: File,
  options: { pdfPage?: number } = {},
): Promise<{
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  width: number;
  height: number;
}> {
  // PDF branch — render to PNG first, then fall through to the regular
  // image processing path below.
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const png = await renderPdfPageToPng(file, options.pdfPage ?? 1);
    // Wrap as a File so the rest of the pipeline can treat it normally.
    file = new File([png.blob], file.name.replace(/\.pdf$/i, ".png"), {
      type: "image/png",
    });
  }

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  const mediaType = allowed.includes(file.type)
    ? (file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif")
    : "image/png";

  const rawBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not load image"));
    i.src = rawBase64;
  });

  const MAX_EDGE = 1500;
  const longest = Math.max(img.naturalWidth, img.naturalHeight);

  // Already small enough — return the raw image untouched.
  if (longest <= MAX_EDGE) {
    return {
      base64: rawBase64,
      mediaType,
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }

  const scale = MAX_EDGE / longest;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Canvas unavailable — fall back to the raw image and accept the
    // coordinate-compression risk rather than blowing up.
    return {
      base64: rawBase64,
      mediaType,
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  // JPEG at 92% is visually indistinguishable from PNG for typical
  // architectural line art with labels, and is ~3-4× smaller. Switching
  // PNG → JPEG also drops alpha which is fine for floor plans.
  const downscaledBase64 = canvas.toDataURL("image/jpeg", 0.92);

  return {
    base64: downscaledBase64,
    mediaType: "image/jpeg",
    width: w,
    height: h,
  };
}

/**
 * POST to /api/ai/survey with the image and any user-provided context.
 */
export async function runAISurvey(args: {
  imageBase64: string;
  imageMediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  imageWidth: number;
  imageHeight: number;
  buildingType?: string;
  projectNotes?: string;
}): Promise<SurveyResponse> {
  const res = await fetch("/api/ai/survey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string })?.error ??
        `Survey request failed (${res.status})`,
    );
  }
  return (await res.json()) as SurveyResponse;
}

/**
 * Self-check pass — sends the original image + the traced walls back to
 * Claude for a "does this match?" review. Returns a structured assessment
 * with a confidence level and concrete issues the user can act on. Runs
 * after the main survey so the user sees both the trace and the review.
 */

export type SurveyCheckIssueKind =
  | "missing-wall"
  | "extra-wall"
  | "misaligned"
  | "scale-off"
  | "scale-ok"
  | "ok";

export type SurveyCheckConfidence = "high" | "medium" | "low";

export interface SurveyCheckIssue {
  kind: SurveyCheckIssueKind;
  severity: "info" | "warning" | "critical";
  description: string;
}

export interface SurveyCheckResponse {
  overallConfidence: SurveyCheckConfidence;
  summary: string;
  issues: SurveyCheckIssue[];
  usage: { inputTokens: number; outputTokens: number };
}

export async function runAISurveyCheck(args: {
  imageBase64: string;
  imageMediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  imageWidth: number;
  imageHeight: number;
  scalePxPerMeter: number;
  walls: SurveyProposedWall[];
}): Promise<SurveyCheckResponse> {
  const res = await fetch("/api/ai/survey-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageBase64: args.imageBase64,
      imageMediaType: args.imageMediaType,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      scalePxPerMeter: args.scalePxPerMeter,
      walls: args.walls.map((w) => ({
        startX: w.startX,
        startY: w.startY,
        endX: w.endX,
        endY: w.endY,
      })),
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string })?.error ??
        `Survey-check request failed (${res.status})`,
    );
  }
  return (await res.json()) as SurveyCheckResponse;
}

// ─────────────────────────────────────────────────────────────────
// PDF helpers
// ─────────────────────────────────────────────────────────────────
//
// pdfjs-dist runs entirely in the browser. We use dynamic imports +
// inline-worker so we don't have to ship a separate worker file or
// configure Next's webpack/Turbopack worker pipeline.

/**
 * Inspect a PDF file and return its page count + a list of page
 * thumbnails (data URLs) for a picker UI. Used by AISurveyDialog to
 * show a thumbnail grid when the PDF has multiple pages, since floor
 * plan PDFs often include title sheets / index pages and the user
 * needs to pick the actual plan page.
 */
export async function loadPdfPageThumbnails(
  file: File,
  maxPages = 20,
): Promise<{ totalPages: number; thumbnails: { page: number; dataUrl: string; width: number; height: number }[] }> {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const totalPages = doc.numPages;
  const thumbnails: {
    page: number;
    dataUrl: string;
    width: number;
    height: number;
  }[] = [];
  const pages = Math.min(totalPages, maxPages);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetMax = 240;
    const scale = Math.min(targetMax / Math.max(baseViewport.width, baseViewport.height), 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    thumbnails.push({
      page: i,
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    });
  }
  return { totalPages, thumbnails };
}

/**
 * Render a single page of a PDF to a high-res PNG blob suitable for
 * feeding into loadImageMeta()'s normal image pipeline.
 */
async function renderPdfPageToPng(
  file: File,
  pageNumber: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const safePage = Math.max(1, Math.min(pageNumber, doc.numPages));
  const page = await doc.getPage(safePage);
  // Render at 2× device-pixel scale so detail survives the subsequent
  // 1500-px downscale Claude expects.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Browser canvas unavailable for PDF render");
  }
  // White background — many architectural PDFs are line-only on
  // transparent so without this they render with whatever's behind.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/png",
    );
  });
  return { blob, width: canvas.width, height: canvas.height };
}

/**
 * Lazy-load pdf.js + wire up the worker via Blob URL. Done once per
 * tab and cached.
 */
let _pdfjsModulePromise:
  | Promise<typeof import("pdfjs-dist")>
  | null = null;
function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (_pdfjsModulePromise) return _pdfjsModulePromise;
  _pdfjsModulePromise = (async () => {
    const pdfjs = await import("pdfjs-dist");
    // Point at the worker via a CDN-mirrored URL. Using the package's
    // own version means we can't accidentally pair mismatched
    // worker/lib versions.
    const version = pdfjs.version;
    const workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    return pdfjs;
  })();
  return _pdfjsModulePromise;
}
