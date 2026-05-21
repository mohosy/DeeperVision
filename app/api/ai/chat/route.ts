import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

/**
 * AI Chat endpoint — "Cursor for floor plans", agentic edition.
 *
 * This is an SSE streaming endpoint. The client posts conversation history +
 * the current floor state, the server runs a multi-turn tool-use loop against
 * Claude, and pushes structured events to the client as they happen:
 *
 *   event: text             → { delta }     incremental text (Claude is typing)
 *   event: operation        → { ...op }     a parsed tool call ready to apply
 *   event: web_search       → { query }     Claude is searching the web
 *   event: web_search_done  → { count }     a web search completed
 *   event: citation         → { url, title, cited_text }
 *   event: turn             → { index }     a new turn of the agent loop started
 *   event: done             → { usage }     loop finished cleanly
 *   event: error            → { message }
 *
 * The endpoint is intentionally stateless — the floor lives in the client
 * store. We just translate natural language → structured edits and stream
 * the work as it happens.
 */

const MODEL = "claude-sonnet-4-5";
const MAX_TURNS = 12;

interface FloorSnapshot {
  name: string;
  scalePxPerMeter: number;
  ceilingHeightM: number;
  imageWidth?: number;
  imageHeight?: number;
  walls: { id: string; startX: number; startY: number; endX: number; endY: number }[];
  devices: {
    id: string;
    type: "camera" | "reader" | "sensor" | "network";
    subtype?: string;
    label: string;
    x: number;
    y: number;
    rotationDegrees: number;
    fovDegrees?: number;
    rangeMeters?: number;
    mountHeightM: number;
    installStatus: "proposed" | "installed" | "decommissioned";
  }[];
  doors: { id: string; x: number; y: number; widthMeters: number; locked: boolean; label: string }[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  designName: string;
  buildingType?: string;
  floor: FloorSnapshot;
  messages: ChatMessage[];
}

export type ChatOperation =
  | {
      kind: "add-device";
      deviceType: "camera" | "reader" | "sensor" | "network";
      subtype?: string;
      x: number;
      y: number;
      rotationDegrees: number;
      label: string;
      rangeMeters?: number;
      fovDegrees?: number;
      mountHeightM?: number;
      notes?: string;
    }
  | { kind: "move-device"; deviceId: string; newX: number; newY: number }
  | { kind: "rotate-device"; deviceId: string; newRotationDegrees: number }
  | { kind: "remove-device"; deviceId: string }
  | {
      kind: "update-device";
      deviceId: string;
      label?: string;
      rangeMeters?: number;
      fovDegrees?: number;
      mountHeightM?: number;
      notes?: string;
      installStatus?: "proposed" | "installed" | "decommissioned";
    }
  | { kind: "add-wall"; startX: number; startY: number; endX: number; endY: number }
  | { kind: "remove-wall"; wallId: string }
  | {
      kind: "add-door";
      x: number;
      y: number;
      rotationDegrees: number;
      widthMeters: number;
      wallId: string;
      locked: boolean;
      label: string;
    }
  | { kind: "set-floor-scale"; scalePxPerMeter: number };

const DOMAIN_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "add_device",
    description:
      "Add a new device to the floor. Coordinates are floor-plan pixels (top-left origin, X right, Y down). For cameras specify fovDegrees + rangeMeters, for sensors specify rangeMeters. Rotation is 0=east, 90=south, 180=west, 270=north.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["camera", "reader", "sensor", "network"] },
        subtype: {
          type: "string",
          description:
            "Camera: dome|bullet|ptz|fisheye|multi-sensor. Reader: card|biometric|keypad. Sensor: motion|glass-break|door-contact|smoke. Network: access-point|switch|nvr.",
        },
        x: { type: "number" },
        y: { type: "number" },
        rotationDegrees: { type: "number" },
        label: { type: "string" },
        rangeMeters: { type: "number" },
        fovDegrees: { type: "number" },
        mountHeightM: { type: "number" },
        notes: { type: "string" },
      },
      required: ["type", "x", "y", "rotationDegrees", "label"],
    },
  },
  {
    name: "move_device",
    description:
      "Move an existing device by id to a new (x, y) position in floor-plan pixels.",
    input_schema: {
      type: "object",
      properties: {
        deviceId: { type: "string" },
        newX: { type: "number" },
        newY: { type: "number" },
      },
      required: ["deviceId", "newX", "newY"],
    },
  },
  {
    name: "rotate_device",
    description: "Rotate an existing device by id (degrees, 0=east, 90=south).",
    input_schema: {
      type: "object",
      properties: {
        deviceId: { type: "string" },
        newRotationDegrees: { type: "number" },
      },
      required: ["deviceId", "newRotationDegrees"],
    },
  },
  {
    name: "remove_device",
    description: "Delete a device by id.",
    input_schema: {
      type: "object",
      properties: { deviceId: { type: "string" } },
      required: ["deviceId"],
    },
  },
  {
    name: "update_device",
    description:
      "Change properties of an existing device — label, range, FOV, mount height, notes, or install status.",
    input_schema: {
      type: "object",
      properties: {
        deviceId: { type: "string" },
        label: { type: "string" },
        rangeMeters: { type: "number" },
        fovDegrees: { type: "number" },
        mountHeightM: { type: "number" },
        notes: { type: "string" },
        installStatus: {
          type: "string",
          enum: ["proposed", "installed", "decommissioned"],
        },
      },
      required: ["deviceId"],
    },
  },
  {
    name: "add_wall",
    description:
      "Add a wall segment to the floor. Coordinates are floor-plan pixels.",
    input_schema: {
      type: "object",
      properties: {
        startX: { type: "number" },
        startY: { type: "number" },
        endX: { type: "number" },
        endY: { type: "number" },
      },
      required: ["startX", "startY", "endX", "endY"],
    },
  },
  {
    name: "remove_wall",
    description: "Delete a wall segment by id.",
    input_schema: {
      type: "object",
      properties: { wallId: { type: "string" } },
      required: ["wallId"],
    },
  },
  {
    name: "add_door",
    description:
      "Add a door on a specific wall at a given (x, y) point in floor-plan pixels. The door is associated with a wallId from the current floor state. rotationDegrees should align with the wall direction.",
    input_schema: {
      type: "object",
      properties: {
        wallId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        rotationDegrees: { type: "number" },
        widthMeters: {
          type: "number",
          description: "Door width in meters. Defaults: 0.9 (standard), 1.2 (wide), 1.8 (double).",
        },
        locked: { type: "boolean" },
        label: { type: "string" },
      },
      required: ["wallId", "x", "y", "rotationDegrees", "label"],
    },
  },
  {
    name: "set_floor_scale",
    description:
      "Update the floor's pixels-per-meter scale. Use only when the user explicitly wants to recalibrate, or when web search reveals a building dimension that contradicts the current scale.",
    input_schema: {
      type: "object",
      properties: { pixelsPerMeter: { type: "number" } },
      required: ["pixelsPerMeter"],
    },
  },
];

/**
 * Server tool: lets Claude search the web for product specs, pricing, code
 * requirements, etc. The API runs the search and returns results directly
 * to Claude; the client never sees raw search content, only the citations
 * Claude chooses to surface in its reply.
 */
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
} as const;

const SYSTEM_PROMPT = `You are the in-app AI editor for DeeperVision, a CAD tool for designing commercial security systems. You're embedded in a right-side chat panel — the user is sitting in front of their floor plan, looking at it on the same screen as your reply.

You are an AGENTIC editor. Plan, act, and verify across multiple tool calls in a single turn. Don't ask permission for small changes — apply them and explain after.

═══ TOOLS ═══

DESIGN EDITS (apply to the floor immediately, client-side):
  add_device          add a camera / reader / sensor / network device
  move_device         relocate a device by id
  rotate_device       change a device's rotation
  remove_device       delete a device
  update_device       change label / range / FOV / mount / status / notes
  add_wall            draw a wall segment
  remove_wall         delete a wall by id
  add_door            add a door on a wall by id
  set_floor_scale     recalibrate pixels-per-meter

RESEARCH (server-side; results stream back as citations):
  web_search          search the web — use this when the user asks for specific
                      product pricing, current code requirements, regional
                      regulations, manufacturer specs, or anything you don't
                      already know with confidence. Always cite sources.

═══ COORDINATES ═══

Floor-plan pixels, top-left origin, X right, Y down. The scale is given as
pixels-per-meter in the floor state. Convert when the user talks in meters
or feet ("1 m off the wall" → scalePxPerMeter pixels).

═══ AGENTIC BEHAVIOR ═══

When the user asks a complex request, run a multi-step plan:
  1. If product/pricing/code info is needed → call web_search FIRST.
  2. Apply concrete edits via the domain tools.
  3. End with a short text summary referencing any citations.

Multiple tool calls per turn are encouraged. Example:
  user: "Find the cheapest 4K dome camera under $300 and place one at each
        corner of the conference room."
  → web_search("cheap 4K dome IP camera under \\$300 2024")
  → 4× add_device with the model from the top result
  → text: "Placed 4× <Model> ($XXX each from <vendor>) at the corners."

═══ STYLE ═══

• Be concise — 1–4 sentences typically.
• Don't restate what you're about to do; just do it. Operation chips show
  applied edits in the UI.
• Cite sources whenever you used web_search.
• Prefer realistic placements: cameras at wall corners ~2.8 m, readers near
  doors ~1.2 m, motion sensors ceiling-mounted in room centers.
• For "add cameras to cover X", aim for ~80% coverage. A small room needs
  1–2 cameras; long corridors need one per ~12 m.
• Use existing device ids (dev_xxx) and wall ids (wall_xxx) when modifying —
  never invent ids.

═══ SAFETY ═══

• Don't bulk-delete devices without an obvious user instruction.
• Don't change the floor scale without good reason (web evidence or explicit
  request).
• Refuse politely if the user asks something the tools can't do.`;

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY env var." },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages[] is required." }, { status: 400 });
  }
  if (!body.floor) {
    return Response.json({ error: "floor is required." }, { status: 400 });
  }

  // Build the streaming SSE response.
  const encoder = new TextEncoder();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      try {
        const floorContext = formatFloorContext(body);

        // Inject the floor snapshot into the LAST user message so Claude
        // always sees the freshest state — even on multi-turn convos where
        // prior turns mutated the floor.
        const claudeMessages: Anthropic.Messages.MessageParam[] = body.messages.map(
          (m, i, arr) => {
            const isLastUser = m.role === "user" && i === arr.length - 1;
            const content = isLastUser
              ? `${floorContext}\n\nUser: ${m.content}`
              : m.content;
            return { role: m.role, content };
          },
        );

        let totalIn = 0;
        let totalOut = 0;
        let webSearchCount = 0;

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          send("turn", { index: turn });

          // For each turn we open a streaming Messages call. The stream
          // emits content_block_start/delta/stop events that we translate
          // into our SSE events.
          const apiStream = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: [
              ...DOMAIN_TOOLS,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              WEB_SEARCH_TOOL as any,
            ],
            messages: claudeMessages,
          });

          /**
           * Per-block scratch — keyed by the streaming block index. We
           * accumulate input_json_delta chunks into a complete JSON string
           * and parse it on content_block_stop.
           */
          const blocks = new Map<
            number,
            {
              type: "tool_use" | "server_tool_use" | "text";
              name?: string;
              id?: string;
              json: string;
            }
          >();

          for await (const event of apiStream) {
            if (event.type === "content_block_start") {
              const cb = event.content_block;
              if (cb.type === "tool_use") {
                blocks.set(event.index, {
                  type: "tool_use",
                  name: cb.name,
                  id: cb.id,
                  json: "",
                });
              } else if (cb.type === "server_tool_use") {
                blocks.set(event.index, {
                  type: "server_tool_use",
                  name: cb.name,
                  id: cb.id,
                  json: "",
                });
              } else if (cb.type === "text") {
                blocks.set(event.index, { type: "text", json: "" });
              } else if (cb.type === "web_search_tool_result") {
                // The server-side search finished — tell the UI to switch
                // its "searching…" indicator to "found".
                webSearchCount++;
                send("web_search_done", { count: webSearchCount });
              }
            } else if (event.type === "content_block_delta") {
              const d = event.delta;
              if (d.type === "text_delta") {
                send("text", { delta: d.text });
              } else if (d.type === "input_json_delta") {
                const b = blocks.get(event.index);
                if (b) b.json += d.partial_json;
              } else if (d.type === "citations_delta") {
                const c = d.citation;
                if (c.type === "web_search_result_location") {
                  send("citation", {
                    url: c.url,
                    title: c.title,
                    cited_text: c.cited_text,
                  });
                }
              }
            } else if (event.type === "content_block_stop") {
              const b = blocks.get(event.index);
              if (!b) continue;
              if (b.type === "server_tool_use" && b.name === "web_search") {
                try {
                  const input = JSON.parse(b.json || "{}") as { query?: string };
                  if (input.query) send("web_search", { query: input.query });
                } catch {
                  /* swallow malformed JSON */
                }
              } else if (b.type === "tool_use" && b.name) {
                try {
                  const input = JSON.parse(b.json) as Record<string, unknown>;
                  const op = toolUseToOperation(b.name, input);
                  if (op) send("operation", op);
                } catch {
                  /* swallow malformed tool JSON */
                }
              }
              blocks.delete(event.index);
            }
          }

          const finalMessage = await apiStream.finalMessage();
          totalIn += finalMessage.usage.input_tokens;
          totalOut += finalMessage.usage.output_tokens;

          if (finalMessage.stop_reason !== "tool_use") break;

          // Build tool_results for client-side tools so Claude can continue.
          // Server-side tools (web_search) already have their results inline
          // in finalMessage.content — we skip them here.
          const clientToolUses = finalMessage.content.filter(
            (
              c,
            ): c is Anthropic.Messages.ToolUseBlock =>
              c.type === "tool_use",
          );
          if (clientToolUses.length === 0) break;

          claudeMessages.push(
            { role: "assistant", content: finalMessage.content },
            {
              role: "user",
              content: clientToolUses.map((t) => ({
                type: "tool_result" as const,
                tool_use_id: t.id,
                content: "ok",
              })),
            },
          );
        }

        send("done", {
          usage: { inputTokens: totalIn, outputTokens: totalOut },
          webSearches: webSearchCount,
        });
      } catch (err) {
        const { message } = extractAnthropicError(err);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Prevent nginx-style buffering for SSE on edge / proxies
      "X-Accel-Buffering": "no",
    },
  });
}

/* -------------------------------------------------------------------------- */

function formatFloorContext(body: ChatRequestBody): string {
  const { floor, designName, buildingType } = body;
  const lines: string[] = [];
  lines.push("=== CURRENT FLOOR STATE ===");
  lines.push(`Design: ${designName}`);
  lines.push(`Floor: ${floor.name}`);
  if (buildingType) lines.push(`Building type: ${buildingType}`);
  lines.push(
    `Scale: ${floor.scalePxPerMeter} pixels per meter (100 px = ${(100 / floor.scalePxPerMeter).toFixed(1)} m)`,
  );
  lines.push(`Ceiling height: ${floor.ceilingHeightM.toFixed(1)} m`);
  if (floor.imageWidth && floor.imageHeight) {
    lines.push(
      `Floor plan image: ${floor.imageWidth} × ${floor.imageHeight} px`,
    );
  }

  lines.push("");
  lines.push(`Walls (${floor.walls.length}):`);
  if (floor.walls.length === 0) lines.push("  (none yet)");
  else {
    for (const w of floor.walls.slice(0, 60)) {
      lines.push(
        `  [${w.id}] (${w.startX.toFixed(0)},${w.startY.toFixed(0)}) → (${w.endX.toFixed(0)},${w.endY.toFixed(0)})`,
      );
    }
    if (floor.walls.length > 60)
      lines.push(`  …${floor.walls.length - 60} more omitted`);
  }

  lines.push("");
  lines.push(`Doors (${floor.doors.length}):`);
  if (floor.doors.length === 0) lines.push("  (none)");
  else {
    for (const d of floor.doors) {
      lines.push(
        `  [${d.id}] "${d.label}" @ (${d.x.toFixed(0)},${d.y.toFixed(0)}) — ${d.widthMeters} m wide, ${d.locked ? "locked" : "unlocked"}`,
      );
    }
  }

  lines.push("");
  lines.push(`Devices (${floor.devices.length}):`);
  if (floor.devices.length === 0) lines.push("  (none yet)");
  else {
    for (const d of floor.devices) {
      const sub = d.subtype ? ` ${d.subtype}` : "";
      const fov = d.fovDegrees != null ? ` · ${d.fovDegrees}° FOV` : "";
      const rng = d.rangeMeters != null ? ` · ${d.rangeMeters} m range` : "";
      lines.push(
        `  [${d.id}] ${d.type}${sub} "${d.label}" @ (${d.x.toFixed(0)},${d.y.toFixed(0)}) rot ${d.rotationDegrees.toFixed(0)}°${fov}${rng} · mount ${d.mountHeightM} m · ${d.installStatus}`,
      );
    }
  }
  lines.push("===========================");
  return lines.join("\n");
}

function toolUseToOperation(
  name: string,
  input: Record<string, unknown>,
): ChatOperation | null {
  switch (name) {
    case "add_device": {
      const dtype = input.type as "camera" | "reader" | "sensor" | "network";
      if (!["camera", "reader", "sensor", "network"].includes(dtype)) return null;
      return {
        kind: "add-device",
        deviceType: dtype,
        subtype: typeof input.subtype === "string" ? input.subtype : undefined,
        x: Number(input.x) || 0,
        y: Number(input.y) || 0,
        rotationDegrees: Number(input.rotationDegrees) || 0,
        label:
          typeof input.label === "string" && input.label.trim()
            ? input.label.trim()
            : "Device",
        rangeMeters:
          typeof input.rangeMeters === "number" ? input.rangeMeters : undefined,
        fovDegrees:
          typeof input.fovDegrees === "number" ? input.fovDegrees : undefined,
        mountHeightM:
          typeof input.mountHeightM === "number"
            ? input.mountHeightM
            : undefined,
        notes: typeof input.notes === "string" ? input.notes : undefined,
      };
    }
    case "move_device": {
      const deviceId = typeof input.deviceId === "string" ? input.deviceId : "";
      if (!deviceId) return null;
      return {
        kind: "move-device",
        deviceId,
        newX: Number(input.newX) || 0,
        newY: Number(input.newY) || 0,
      };
    }
    case "rotate_device": {
      const deviceId = typeof input.deviceId === "string" ? input.deviceId : "";
      if (!deviceId) return null;
      return {
        kind: "rotate-device",
        deviceId,
        newRotationDegrees: Number(input.newRotationDegrees) || 0,
      };
    }
    case "remove_device": {
      const deviceId = typeof input.deviceId === "string" ? input.deviceId : "";
      if (!deviceId) return null;
      return { kind: "remove-device", deviceId };
    }
    case "update_device": {
      const deviceId = typeof input.deviceId === "string" ? input.deviceId : "";
      if (!deviceId) return null;
      const op: ChatOperation = { kind: "update-device", deviceId };
      if (typeof input.label === "string") op.label = input.label;
      if (typeof input.rangeMeters === "number")
        op.rangeMeters = input.rangeMeters;
      if (typeof input.fovDegrees === "number") op.fovDegrees = input.fovDegrees;
      if (typeof input.mountHeightM === "number")
        op.mountHeightM = input.mountHeightM;
      if (typeof input.notes === "string") op.notes = input.notes;
      if (
        typeof input.installStatus === "string" &&
        ["proposed", "installed", "decommissioned"].includes(input.installStatus)
      ) {
        op.installStatus = input.installStatus as
          | "proposed"
          | "installed"
          | "decommissioned";
      }
      return op;
    }
    case "add_wall":
      return {
        kind: "add-wall",
        startX: Number(input.startX) || 0,
        startY: Number(input.startY) || 0,
        endX: Number(input.endX) || 0,
        endY: Number(input.endY) || 0,
      };
    case "remove_wall": {
      const wallId = typeof input.wallId === "string" ? input.wallId : "";
      if (!wallId) return null;
      return { kind: "remove-wall", wallId };
    }
    case "add_door": {
      const wallId = typeof input.wallId === "string" ? input.wallId : "";
      if (!wallId) return null;
      return {
        kind: "add-door",
        wallId,
        x: Number(input.x) || 0,
        y: Number(input.y) || 0,
        rotationDegrees: Number(input.rotationDegrees) || 0,
        widthMeters:
          typeof input.widthMeters === "number" ? input.widthMeters : 0.9,
        locked: input.locked === true,
        label:
          typeof input.label === "string" && input.label.trim()
            ? input.label.trim()
            : "Door",
      };
    }
    case "set_floor_scale": {
      const ppm = Number(input.pixelsPerMeter);
      if (!Number.isFinite(ppm) || ppm < 5 || ppm > 600) return null;
      return { kind: "set-floor-scale", scalePxPerMeter: ppm };
    }
    default:
      return null;
  }
}

function extractAnthropicError(err: unknown): {
  message: string;
  status: number;
} {
  if (err instanceof Anthropic.APIError) {
    const upstream = err.error as
      | { error?: { message?: string } }
      | undefined;
    const msg =
      upstream?.error?.message ?? err.message ?? "Unknown Anthropic API error.";
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return { message: msg, status };
  }
  return {
    message: err instanceof Error ? err.message : "Unknown error.",
    status: 502,
  };
}
