import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

/**
 * AI Site Survey endpoint.
 *
 * Accepts a floor plan image (base64 data URL OR raw URL) plus optional
 * context (image dimensions, building type, project notes) and returns a
 * structured design proposal: a list of walls and a list of devices that
 * the editor can directly apply to the active floor.
 *
 * Architecture: we use Claude's tool-use feature with two server-defined
 * tools (`propose_wall`, `propose_device`). Claude analyses the image and
 * calls each tool repeatedly. We collect every tool call into a single
 * proposal object and return it to the client. This is more reliable than
 * asking for a giant JSON blob because Claude can stream tool calls and
 * any malformed call is isolated to one device rather than corrupting the
 * whole response.
 */

const MODEL = "claude-sonnet-4-5";

interface SurveyRequestBody {
  imageBase64: string;
  imageMediaType?: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  imageWidth: number;
  imageHeight: number;
  /** Optional context the user provided */
  buildingType?: string;
  projectNotes?: string;
}

interface ProposedWall {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  rationale?: string;
}

interface ProposedDevice {
  type: "camera" | "reader" | "sensor" | "network";
  subtype?: string;
  x: number;
  y: number;
  rotationDegrees: number;
  label: string;
  rangeMeters?: number;
  fovDegrees?: number;
  rationale: string;
}

interface ProposedFurniture {
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
  /** Center point in image-pixel coords */
  x: number;
  y: number;
  rotationDegrees: number;
  lengthM: number;
  widthM: number;
  label?: string;
  rationale?: string;
}

interface SurveyResponse {
  /** Estimated pixels-per-meter for the uploaded image */
  scalePxPerMeter: number;
  walls: ProposedWall[];
  devices: ProposedDevice[];
  furniture: ProposedFurniture[];
  /** Claude's overall summary of the design */
  summary: string;
  /** Total tokens used (for cost monitoring) */
  usage: { inputTokens: number; outputTokens: number };
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "set_scale",
    description:
      "Set the estimated real-world scale of the floor plan. Pixels-per-meter. Estimate from visible doors (~0.9 m wide), rooms with typical dimensions, or any dimension markers visible in the plan.",
    input_schema: {
      type: "object",
      properties: {
        pixelsPerMeter: {
          type: "number",
          description:
            "How many image pixels equal one real-world meter. Reasonable values: 10-200.",
        },
        reasoning: {
          type: "string",
          description: "How you estimated this scale (e.g. 'door width').",
        },
      },
      required: ["pixelsPerMeter", "reasoning"],
    },
  },
  {
    name: "propose_wall",
    description:
      "Add one wall segment to the design. Coordinates are in IMAGE PIXELS (same coordinate system as the uploaded image, with (0,0) at the top-left). Trace every visible interior and exterior wall. Doors and openings are short gaps — leave them as gaps between wall segments.",
    input_schema: {
      type: "object",
      properties: {
        startX: { type: "number" },
        startY: { type: "number" },
        endX: { type: "number" },
        endY: { type: "number" },
        rationale: {
          type: "string",
          description: "Brief note about this wall (e.g. 'east exterior wall')",
        },
      },
      required: ["startX", "startY", "endX", "endY"],
    },
  },
  {
    name: "propose_furniture",
    description:
      "Add one piece of furniture if it is CLEARLY visible in the floor plan. Supported types: desk, chair, conference-table, kitchen-island, sofa, toilet, sink, refrigerator, bed, bookshelf, tv-display. Position (x, y) is the CENTER of the piece, in image-pixel coords. Rotation is in degrees: 0 = piece's long axis along +X (right); 90 = long axis along +Y (down). Length/width are real-world meters — use the scale you set to derive them from the visible footprint. ONLY propose furniture you can clearly see in the floor plan; do NOT invent or guess furniture for empty rooms.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "desk",
            "chair",
            "conference-table",
            "kitchen-island",
            "sofa",
            "toilet",
            "sink",
            "refrigerator",
            "bed",
            "bookshelf",
            "tv-display",
          ],
        },
        x: { type: "number" },
        y: { type: "number" },
        rotationDegrees: { type: "number" },
        lengthM: {
          type: "number",
          description:
            "Real-world length in meters (the long axis). Typical defaults: desk 1.5, chair 0.6, conference-table 3.0, kitchen-island 2.4, sofa 2.2.",
        },
        widthM: {
          type: "number",
          description:
            "Real-world width in meters (perpendicular to length). Typical defaults: desk 0.75, chair 0.6, conference-table 1.2, kitchen-island 1.0, sofa 0.95.",
        },
        label: { type: "string" },
        rationale: { type: "string" },
      },
      required: ["type", "x", "y", "rotationDegrees", "lengthM", "widthM"],
    },
  },
  {
    name: "finalize",
    description:
      "Call this last to provide a brief summary paragraph (2-3 sentences) describing the overall design and its coverage strategy.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
];

const SYSTEM_PROMPT = `You are a senior security-systems designer turning a floor plan image into a clean WALL TRACE for DeeperVision, a CAD tool for commercial security installs.

You are given a floor plan image. Your job for this survey is:

1. Call set_scale FIRST to estimate pixels-per-meter from visible clues.
2. Call propose_wall for every wall segment you see (exterior + interior). Be thorough — the user will use this trace to design their security system.
3. Call propose_furniture for each piece of furniture CLEARLY VISIBLE in the floor plan (desks, chairs, conference tables, kitchen islands, sofas). Use the SET SCALE to derive each piece's real-world length/width in meters from its visible footprint. Place the center coordinate at the geometric centroid of the piece's symbol; pick a rotation that aligns the piece's long axis with how it appears in the image. If a room is empty (no furniture drawn in the floor plan), DO NOT propose any — leave it empty.
4. Call finalize with a brief one-sentence summary of the layout.

DO NOT call propose_device. The user adds cameras, readers, sensors, and network gear themselves — either by dragging from the library or by asking the AI editor in the chat panel. Your job here is walls + furniture + scale.

═══════════════════════════════════════════════════════════════════════
FURNITURE PLACEMENT RULES — be conservative and accurate
═══════════════════════════════════════════════════════════════════════

For every furniture piece you propose:
  • Position MUST be the visible centroid in image pixels.
  • Rotation: 0° = piece's long axis horizontal (along +X). 90° = vertical (along +Y, downward).
  • Length/width are real-world METERS, derived from the visible pixel footprint divided by your set scalePxPerMeter. Typical defaults if the piece appears at standard size:
      desk 1.5×0.75, chair 0.6×0.6, conference-table 3.0×1.2, kitchen-island 2.4×1.0, sofa 2.2×0.95,
      toilet 0.7×0.42, sink 0.6×0.5, refrigerator 0.85×0.72, bed 2.0×1.5, bookshelf 1.0×0.35, tv-display 1.4×0.1.
  • Only flag a piece you can VISUALLY identify. Don't guess that a conference room "probably has" a table — only propose one if you can see it drawn.
  • For bathrooms, expect to see at least one toilet + one sink. For kitchens, expect a refrigerator + stove area (use kitchen-island for counters). For bedrooms, expect a bed + maybe a wardrobe (use bookshelf as the closest match). For lounges, expect sofas + a TV.
  • A typical commercial floor plan has 5–20 furniture items at most. Never propose more than 30.

═══════════════════════════════════════════════════════════════════════
COORDINATE RULES — CRITICAL, READ CAREFULLY
═══════════════════════════════════════════════════════════════════════

The image origin (0, 0) is at the TOP-LEFT. X increases right, Y increases DOWN.

All coordinates you return MUST be expressed in the image's ACTUAL pixel
dimensions, which are stated in the user message.

Your wall coordinates MUST span the visible floor plan inside the image.
If the floor plan fills most of the image, your wall coords MUST range
from near (0, 0) to near (imageWidth, imageHeight) — NOT compressed
into a smaller logical range.

❌ WRONG  — image is 1500×1100 px but you return walls in the range
            (100, 80) → (700, 600). This squashes the design into the
            top-left 1/4 of the image and the user sees walls floating
            in a corner while the floor plan extends to the right.

✓ RIGHT  — image is 1500×1100 px and the floor plan covers most of it.
           You return walls spanning roughly (130, 200) → (1380, 950),
           matching where the lines actually appear in the image.

Before calling set_scale + propose_wall, mentally check: "Do my
proposed coordinates actually align with where the walls appear in the
image's pixel space?" If your max wall X is significantly less than
imageWidth (or max Y less than imageHeight) when the floor plan visibly
extends further, your coords are compressed and the design will be
mis-placed. Rescale before emitting.`;

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY env var." },
      { status: 500 },
    );
  }

  let body: SurveyRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.imageBase64 || !body.imageWidth || !body.imageHeight) {
    return Response.json(
      { error: "imageBase64, imageWidth, imageHeight are required." },
      { status: 400 },
    );
  }

  // Strip the data URL prefix if present so we send raw base64
  const rawBase64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
  const mediaType = body.imageMediaType ?? "image/png";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userText = `Floor plan image attached.
Image dimensions: ${body.imageWidth} × ${body.imageHeight} pixels.
${body.buildingType ? `Building type: ${body.buildingType}.` : ""}
${body.projectNotes ? `Project notes: ${body.projectNotes}` : ""}

Analyze it and propose a complete first-pass security design by calling the tools.`;

  const walls: ProposedWall[] = [];
  const devices: ProposedDevice[] = [];
  const furniture: ProposedFurniture[] = [];
  let scalePxPerMeter = 50;
  let summary = "";

  let messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: rawBase64 },
        },
        { type: "text", text: userText },
      ],
    },
  ];

  let totalInput = 0;
  let totalOutput = 0;

  // Run the tool-use loop. Claude calls tools, we collect them, send back
  // empty tool_results, and let it keep going until it stops.
  try {
  for (let turn = 0; turn < 10; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );

    for (const tool of toolUses) {
      const input = tool.input as Record<string, unknown>;
      if (tool.name === "set_scale") {
        scalePxPerMeter = clamp(Number(input.pixelsPerMeter) || 50, 10, 400);
      } else if (tool.name === "propose_wall") {
        walls.push({
          startX: Number(input.startX) || 0,
          startY: Number(input.startY) || 0,
          endX: Number(input.endX) || 0,
          endY: Number(input.endY) || 0,
          rationale:
            typeof input.rationale === "string" ? input.rationale : undefined,
        });
      } else if (tool.name === "propose_device") {
        devices.push({
          type: input.type as ProposedDevice["type"],
          subtype: typeof input.subtype === "string" ? input.subtype : undefined,
          x: Number(input.x) || 0,
          y: Number(input.y) || 0,
          rotationDegrees: Number(input.rotationDegrees) || 0,
          label:
            typeof input.label === "string" && input.label.trim()
              ? input.label.trim()
              : "Device",
          rangeMeters:
            typeof input.rangeMeters === "number"
              ? input.rangeMeters
              : undefined,
          fovDegrees:
            typeof input.fovDegrees === "number" ? input.fovDegrees : undefined,
          rationale:
            typeof input.rationale === "string" ? input.rationale : "",
        });
      } else if (tool.name === "propose_furniture") {
        const ftype = input.type as ProposedFurniture["type"];
        const allowed = ["desk", "chair", "conference-table", "kitchen-island", "sofa"] as const;
        if (allowed.includes(ftype as (typeof allowed)[number])) {
          furniture.push({
            type: ftype,
            x: Number(input.x) || 0,
            y: Number(input.y) || 0,
            rotationDegrees: Number(input.rotationDegrees) || 0,
            lengthM: clamp(Number(input.lengthM) || 1, 0.3, 12),
            widthM: clamp(Number(input.widthM) || 0.7, 0.3, 8),
            label: typeof input.label === "string" ? input.label : undefined,
            rationale:
              typeof input.rationale === "string" ? input.rationale : undefined,
          });
        }
      } else if (tool.name === "finalize") {
        if (typeof input.summary === "string") summary = input.summary;
      }
    }

    // If Claude stopped, we're done
    if (response.stop_reason !== "tool_use") break;

    // Otherwise, reply with empty tool_results and let Claude continue
    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: toolUses.map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          content: "ok",
        })),
      },
    ];
  }
  } catch (err) {
    // Surface the real upstream error (credit/quota/rate-limit etc.) so the UI
    // can show something actionable rather than a generic 500.
    const { message, status } = extractAnthropicError(err);
    return Response.json({ error: message }, { status });
  }

  const result: SurveyResponse = {
    scalePxPerMeter,
    walls,
    devices,
    furniture: furniture.slice(0, 30),
    summary,
    usage: { inputTokens: totalInput, outputTokens: totalOutput },
  };

  return Response.json(result);
}

/**
 * Pull the human-readable message + an appropriate HTTP status out of an SDK
 * thrown error. Anthropic returns structured errors like:
 *   { type: "error", error: { type: "invalid_request_error", message: "..." } }
 */
function extractAnthropicError(err: unknown): { message: string; status: number } {
  if (err instanceof Anthropic.APIError) {
    const upstream = err.error as
      | { error?: { message?: string } }
      | undefined;
    const msg =
      upstream?.error?.message ??
      err.message ??
      "Unknown Anthropic API error.";
    // Pass-through the upstream status when it's a 4xx; otherwise 502.
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return { message: msg, status };
  }
  return {
    message: err instanceof Error ? err.message : "Unknown error.",
    status: 502,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
