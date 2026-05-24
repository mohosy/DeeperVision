import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

/**
 * AI Survey Self-Check endpoint.
 *
 * After `/api/ai/survey` traces walls from a floor plan image, the client
 * fires this endpoint with the SAME image plus the proposed wall list. A
 * second Claude pass inspects whether the trace matches what's actually
 * in the image and returns a structured assessment the editor can show
 * the user before they commit to the trace.
 *
 * This is the "second pair of eyes" pass — it catches:
 *   • Walls missing entirely (whole room un-traced)
 *   • Extra walls that don't exist in the image
 *   • Walls in roughly the right place but at the wrong angle
 *   • A scale that looks off vs. the visible door widths / standard rooms
 *
 * One extra API call per upload — costs cents, saves the user from
 * downstream 3D extrusions built on a wrong foundation.
 */

const MODEL = "claude-sonnet-4-5";

interface CheckWall {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface CheckRequestBody {
  imageBase64: string;
  imageMediaType?: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  imageWidth: number;
  imageHeight: number;
  scalePxPerMeter: number;
  walls: CheckWall[];
}

export type CheckIssueKind =
  | "missing-wall"
  | "extra-wall"
  | "misaligned"
  | "scale-off"
  | "scale-ok"
  | "ok";

export type CheckConfidence = "high" | "medium" | "low";

export interface CheckIssue {
  kind: CheckIssueKind;
  severity: "info" | "warning" | "critical";
  description: string;
}

export interface CheckResponse {
  overallConfidence: CheckConfidence;
  summary: string;
  issues: CheckIssue[];
  usage: { inputTokens: number; outputTokens: number };
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "report_issue",
    description:
      "Report ONE discrepancy between the traced walls and the actual floor plan image. Use sparingly — only flag real problems. Skip if the trace is fine.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "missing-wall",
            "extra-wall",
            "misaligned",
            "scale-off",
          ],
          description:
            "missing-wall = the image shows a wall the trace omits. extra-wall = trace has a line that isn't in the image. misaligned = trace is in roughly the right place but the angle or endpoint is off. scale-off = the pixels-per-meter estimate is clearly wrong (e.g. doors come out way too big or small).",
        },
        severity: {
          type: "string",
          enum: ["info", "warning", "critical"],
          description:
            "critical = the trace would produce a fundamentally wrong 3D model (e.g. missing an entire room). warning = noticeable but fixable by the user. info = minor.",
        },
        description: {
          type: "string",
          description:
            "One concrete sentence the user can act on. Example: 'The east-facing wall of the conference room is missing — visible in the image around x=900, y=200 to y=500.'",
        },
      },
      required: ["kind", "severity", "description"],
    },
  },
  {
    name: "finalize",
    description:
      "Call LAST. Provide overall confidence + a one-sentence summary of the trace's accuracy.",
    input_schema: {
      type: "object",
      properties: {
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description:
            "high = trace is faithful to the image, user can proceed with confidence. medium = a few corrections needed but the structure is right. low = significant problems, user should review carefully or re-trace.",
        },
        summary: {
          type: "string",
          description:
            "One sentence summarizing whether the trace is accurate enough to build a 3D model from.",
        },
      },
      required: ["confidence", "summary"],
    },
  },
];

const SYSTEM_PROMPT = `You are a QA reviewer for DeeperVision's AI Survey feature. Your job is to verify whether a set of traced walls accurately represents the walls in an uploaded floor plan image.

Inputs you receive:
  • The original floor plan image (attached).
  • The full list of walls the first-pass AI produced, as JSON line segments in image pixel coordinates (origin top-left, x right, y down).
  • The estimated pixels-per-meter scale.

Process:
  1. Look at the image. Identify every visible wall.
  2. Compare against the proposed walls. For each REAL discrepancy you find, call \`report_issue\` once. Don't nit-pick — flag only issues that would degrade the 3D model or downstream device placement.
  3. Sanity-check the scale: if the standard door (~0.9 m) would render visibly too big or small at the given pixels-per-meter, report a "scale-off" issue.
  4. Call \`finalize\` with overall confidence and a one-sentence summary.

Be CONSERVATIVE. A trace with a couple of minor misalignments is "medium" confidence at worst; only call "low" when entire rooms are missing or the orientation is fundamentally wrong. If the trace is faithful, report ZERO issues and confidence "high".

Never call \`report_issue\` more than 8 times — pick the most impactful problems.`;

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY env var." },
      { status: 500 },
    );
  }

  let body: CheckRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.imageBase64 || !body.imageWidth || !body.imageHeight || !Array.isArray(body.walls)) {
    return Response.json(
      { error: "imageBase64, imageWidth, imageHeight, walls are required." },
      { status: 400 },
    );
  }

  const rawBase64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
  const mediaType = body.imageMediaType ?? "image/png";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Compact wall description — Claude gets the JSON inline, so it can
  // reason about specific wall coordinates without us having to render
  // an overlay image server-side.
  const wallsJson = JSON.stringify(
    body.walls.map((w, i) => ({
      i,
      from: [Math.round(w.startX), Math.round(w.startY)],
      to: [Math.round(w.endX), Math.round(w.endY)],
    })),
  );

  const userText = `Original floor plan image attached.
Image dimensions: ${body.imageWidth} × ${body.imageHeight} pixels.
Estimated scale: ${body.scalePxPerMeter.toFixed(1)} pixels per meter.
Proposed walls (${body.walls.length} total) in image pixel coords:
${wallsJson}

Inspect the trace and call report_issue for each real discrepancy, then finalize.`;

  const issues: CheckIssue[] = [];
  let overallConfidence: CheckConfidence = "medium";
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

  try {
    // Short loop — the reviewer typically wraps up in 1-2 turns.
    for (let turn = 0; turn < 4; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
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
        if (tool.name === "report_issue") {
          const kind = (input.kind as CheckIssueKind) ?? "misaligned";
          const severity =
            (input.severity as "info" | "warning" | "critical") ?? "warning";
          const description =
            typeof input.description === "string" ? input.description : "";
          if (description) issues.push({ kind, severity, description });
        } else if (tool.name === "finalize") {
          if (
            input.confidence === "high" ||
            input.confidence === "medium" ||
            input.confidence === "low"
          ) {
            overallConfidence = input.confidence;
          }
          if (typeof input.summary === "string") summary = input.summary;
        }
      }

      if (response.stop_reason !== "tool_use") break;

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
    const { message, status } = extractAnthropicError(err);
    return Response.json({ error: message }, { status });
  }

  // Sensible default if Claude never called finalize.
  if (!summary) {
    summary =
      issues.length === 0
        ? "Trace looks faithful to the floor plan."
        : `Found ${issues.length} issue${issues.length === 1 ? "" : "s"} that may need adjustment.`;
  }

  const result: CheckResponse = {
    overallConfidence,
    summary,
    issues: issues.slice(0, 8),
    usage: { inputTokens: totalInput, outputTokens: totalOutput },
  };

  return Response.json(result);
}

function extractAnthropicError(err: unknown): { message: string; status: number } {
  if (err instanceof Anthropic.APIError) {
    const upstream = err.error as
      | { error?: { message?: string } }
      | undefined;
    const msg =
      upstream?.error?.message ??
      err.message ??
      "Unknown Anthropic API error.";
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return { message: msg, status };
  }
  return {
    message: err instanceof Error ? err.message : "Unknown error.",
    status: 502,
  };
}
