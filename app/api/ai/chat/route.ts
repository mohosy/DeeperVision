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
  /** Current top-level view mode of the editor. */
  viewMode?: "2d" | "3d" | "sim";
  /** Active 3D submode when viewMode is "3d". */
  threeDMode?: "orbit" | "walk" | "pov";
  /** When threeDMode is "pov", which camera device is being shown. */
  cameraPovTargetId?: string;
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
  annotations: {
    id: string;
    x: number;
    y: number;
    text: string;
    kind: "note" | "warning" | "idea";
    author: "user" | "ai";
  }[];
  quote?: {
    clientName: string;
    projectLocation: string;
    laborRate: number;
    markupPct: number;
    taxPct: number;
    extraLineItems: {
      description: string;
      quantity: number;
      unitCost: number;
      category: string;
    }[];
    /** Live bill of materials — model, vendor, qty, unit price + subtotal */
    bom: {
      modelId: string;
      displayName: string;
      vendor: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[];
    hardwareSubtotal: number;
    laborSubtotal: number;
    grandTotal: number;
  };
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
      /** Optional brand + model designation, e.g. "Lorex N863A3" — set
          when the user references a specific product not in the
          built-in catalog. Shown in the BoM. */
      model?: string;
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
  | { kind: "set-floor-scale"; scalePxPerMeter: number }
  | {
      kind: "add-annotation";
      x: number;
      y: number;
      text: string;
      annotationKind: "note" | "warning" | "idea";
    }
  | { kind: "remove-annotation"; annotationId: string }
  | {
      kind: "add-quote-line-item";
      description: string;
      quantity: number;
      unitCost: number;
      category: "labor" | "materials" | "permits" | "logistics" | "other";
    }
  | { kind: "remove-quote-line-item"; index: number }
  | {
      kind: "update-quote-settings";
      laborRate?: number;
      cablingPerCamera?: number;
      cablingPerReader?: number;
      commissioningFee?: number;
      markupPct?: number;
      taxPct?: number;
      clientName?: string;
      projectLocation?: string;
      preparedBy?: string;
      brandColor?: string;
      printFooter?: string;
      regionalNotes?: string;
      benchmark?: string;
      narrative?: string;
    }
  | {
      /** Switch the 3D view into first-person POV from a camera device. */
      kind: "view-from-camera";
      deviceId: string;
    }
  | {
      /** Switch top-level view between 2D plan, 3D scene, and Sim mode. */
      kind: "set-view-mode";
      viewMode: "2d" | "3d" | "sim";
      threeDMode?: "orbit" | "walk";
    };

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
        model: {
          type: "string",
          description:
            "Brand + model, e.g. 'Lorex N863A3' or 'Reolink RLC-810A'. Set this when the user references a specific product not in the built-in catalog. Shows up in the bill of materials.",
        },
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
  {
    name: "add_annotation",
    description:
      "Pin a sticky-note style annotation on the floor plan at (x, y). Use this to flag concerns, suggest improvements without acting, leave reminders, or call out compliance issues. Annotations appear on the canvas as floating markers.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        text: {
          type: "string",
          description: "1–2 sentence note. Keep it short — sticky-note length.",
        },
        annotationKind: {
          type: "string",
          enum: ["note", "warning", "idea"],
          description:
            "note = neutral observation, warning = something the user should fix, idea = a suggestion.",
        },
      },
      required: ["x", "y", "text", "annotationKind"],
    },
  },
  {
    name: "remove_annotation",
    description: "Delete an annotation by id.",
    input_schema: {
      type: "object",
      properties: { annotationId: { type: "string" } },
      required: ["annotationId"],
    },
  },
  {
    name: "add_quote_line_item",
    description:
      "Add a custom line item to the project quote — permits, lift rental, custom labor, etc. Use after web_search if you looked up regional pricing.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string" },
        quantity: { type: "number" },
        unitCost: { type: "number" },
        category: {
          type: "string",
          enum: ["labor", "materials", "permits", "logistics", "other"],
        },
      },
      required: ["description", "quantity", "unitCost", "category"],
    },
  },
  {
    name: "remove_quote_line_item",
    description: "Remove an extra quote line item by its zero-based index.",
    input_schema: {
      type: "object",
      properties: { index: { type: "number" } },
      required: ["index"],
    },
  },
  {
    name: "view_from_camera",
    description:
      "Switch the 3D view into first-person POV from a specific camera device — what that camera actually sees, framed by its FOV. Use when the user asks 'what does X see' or 'show me the POV of Y'.",
    input_schema: {
      type: "object",
      properties: { deviceId: { type: "string" } },
      required: ["deviceId"],
    },
  },
  {
    name: "set_view_mode",
    description:
      "Switch the editor's top-level view. '2d' shows the floor-plan canvas (best for placing/moving devices and drawing walls). '3d' shows the extruded scene (best for visualizing coverage, walking the building, or showing camera POV). 'sim' runs the path simulator. When viewMode='3d', optionally set threeDMode to 'orbit' (default) or 'walk' (WASD walkthrough). Use this proactively — e.g. switch to 3D before showing a camera POV, switch to 2D before drawing many new devices.",
    input_schema: {
      type: "object",
      properties: {
        viewMode: { type: "string", enum: ["2d", "3d", "sim"] },
        threeDMode: { type: "string", enum: ["orbit", "walk"] },
      },
      required: ["viewMode"],
    },
  },
  {
    name: "update_quote_settings",
    description:
      "Update one or more fields on the project quote: rates (laborRate, cablingPerCamera, cablingPerReader, commissioningFee, markupPct, taxPct), metadata (clientName, projectLocation, preparedBy, brandColor, printFooter), or narrative (regionalNotes, benchmark, narrative). Only include fields you actually want to change.",
    input_schema: {
      type: "object",
      properties: {
        laborRate: { type: "number" },
        cablingPerCamera: { type: "number" },
        cablingPerReader: { type: "number" },
        commissioningFee: { type: "number" },
        markupPct: { type: "number" },
        taxPct: { type: "number" },
        clientName: { type: "string" },
        projectLocation: { type: "string" },
        preparedBy: { type: "string" },
        brandColor: { type: "string", description: "Hex color, e.g. #2563eb" },
        printFooter: { type: "string" },
        regionalNotes: { type: "string" },
        benchmark: { type: "string" },
        narrative: { type: "string" },
      },
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
  add_device              add a camera / reader / sensor / network device
  move_device             relocate a device by id
  rotate_device           change a device's rotation
  remove_device           delete a device
  update_device           change label / range / FOV / mount / status / notes
  add_wall                draw a wall segment
  remove_wall             delete a wall by id
  add_door                add a door on a wall by id
  set_floor_scale         recalibrate pixels-per-meter

ANNOTATIONS (sticky notes pinned on the canvas — visible to user):
  add_annotation          pin a "note" / "warning" / "idea" at (x, y) on the
                          floor plan. Use this to call out concerns, flag
                          compliance issues, or suggest improvements WITHOUT
                          actually editing the design. Great for things you
                          want the user to decide on.
  remove_annotation       delete an annotation by id

QUOTE (shape the project quote — bill of materials, rates, line items):
  add_quote_line_item     add a custom line item (permits, lift rental, etc.)
  remove_quote_line_item  remove a line item by index
  update_quote_settings   change rates, client info, brand color, regional
                          notes, narrative, etc.

QUOTE AUDIT PATTERN: when the user asks you to "audit", "verify", "review",
"double-check" or "make sure my pricing is accurate," DON'T just glance at
the BoM in your context — actually call web_search on the priced models
you're unsure about, cite real sources, and adjust unit prices via
update_quote_settings (for global rates) or annotations (kind="warning")
when you spot a stale price you don't want to silently overwrite.

MULTI-VENDOR INTEGRATION AUDIT: the BoM in your context lists each
device's vendor (Verkada, Avigilon, Axis, Hanwha, Bosch, etc.). When
asked to review the design, look for integration concerns — e.g. mixing
ONVIF-friendly camera brands with a closed-ecosystem NVR, or pairing
Verkada cameras with an on-prem Axis recorder when both would normally
need their own management plane. Flag these as add_annotation kind=
"warning" with a one-sentence rationale. Don't refuse — recommend a
compatible alternative or a bridging product (web_search if needed).

UNKNOWN-PRODUCT FLOW: when the user names a specific product NOT in
your catalog ("add a Lorex N863A3", "use the Hikvision DS-2CD2387G2"),
DO NOT refuse. Build it on the fly:
  1. web_search "<brand> <model> spec sheet price" to find the type
     (dome/bullet/PTZ/fisheye/reader/sensor/NVR/switch/AP), FOV,
     range, mount height, and current street price.
  2. Call add_device with:
       • type    — closest match (camera | reader | sensor | network)
       • subtype — closest 3D mesh shape (dome | bullet | ptz | fisheye
                   | multi-sensor | card | biometric | keypad | motion
                   | glass-break | door-contact | smoke | nvr | switch
                   | access-point)
       • label   — "<Brand> <Model>"  ← shown on the canvas + quote
       • model   — same "<Brand> <Model>" string  ← shows in BoM
       • fovDegrees, rangeMeters, mountHeightM — pulled from your
         research, or sensible defaults if unclear
       • notes   — one-line summary + price URL
  3. Add the device's price to the quote via add_quote_line_item
     (category: "materials", quantity: <copies>, description:
     "<Brand> <Model> hardware") so the user's BoM total tracks it.
  4. Cite the spec/price source.
The 3D representation reuses the subtype's built-in mesh (dome shape,
bullet shape, etc.) — the label tells the user it's the specific
product. This is what "synthesizing a replica" means in practice.

VIEW (UI navigation — you control which view the user is looking at):
  set_view_mode           switch the top-level view between '2d' (floor
                          plan canvas — best for placing/moving devices,
                          drawing walls), '3d' (extruded scene — best
                          for showing coverage, room layout, camera
                          angles), or 'sim' (path simulator).  When
                          viewMode='3d' you can also set threeDMode to
                          'orbit' (free-look, default) or 'walk' (WASD
                          first-person walkthrough). Use this PROACTIVELY
                          — e.g. switch to 3D before describing a
                          coverage gap, switch to 2D before placing many
                          devices, switch to walk to show the user what
                          a corridor feels like at floor level.

  view_from_camera        flip the 3D scene into first-person POV from a
                          specific camera (auto-switches to 3D if you're
                          in 2D). Use when the user asks "what does X
                          see" / "show me X's view" / "POV that camera".
                          Always also explain in text what they should
                          look for.

The current view + 3D submode are reported in the floor state. Both 2D
and 3D render the same data — your edits show up in both. Annotations
appear in 2D as sticky-note pills on the canvas and in 3D as floating
billboards above their pin point, so commentary is visible regardless
of which view the user is in.

RESEARCH (server-side; results stream back as citations):
  web_search              search the web — use this when the user asks for
                          specific product pricing, current code requirements,
                          regional regulations, manufacturer specs, or
                          anything you don't know with confidence. ALSO use
                          it before adding quote line items so prices are
                          backed by real sources. Always cite.

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

═══ SUGGEST vs ACT ═══

When the user asks "where should I put X?", "what would you do?", "any
ideas?", or any other open-ended/advisory question, DO NOT auto-place
devices. Instead, drop add_annotation markers with kind="idea" at each
proposed location — one note per spot, with a one-sentence rationale.
The user can then click a marker to act on it, or ask you to "apply"
your suggestions.

When the user gives a DIRECTIVE ("add a camera at the front door",
"cover the corridor with motion sensors"), just do it — annotations
would be friction.

PROACTIVE DOORS: when looking at a floor that has walls but no doors,
or when the user explicitly asks you to add doors, use add_door at
plausible openings (gap in a long wall, or the obvious entry side of
a room). Doors render as wood-textured slabs in the 3D view and gate
the simulator's walkthrough. Aim for 1 door per room — front entries
unlocked, server/IT/storage rooms locked.

Warnings work similarly: if you notice a real issue while doing other
work, drop add_annotation kind="warning" rather than burying it in text.

═══ MEMORY ═══

Earlier turns in this conversation may have been trimmed for token
efficiency. If you see a "[Conversation recap — N earlier message(s)
trimmed]" block in the user message, that's the summary of what already
happened. Trust the floor state as ground truth; use the recap for
context on intent and tone.

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
  if (floor.viewMode) {
    let view = `View: ${floor.viewMode.toUpperCase()}`;
    if (floor.viewMode === "3d" && floor.threeDMode) {
      view += ` (${floor.threeDMode}`;
      if (floor.threeDMode === "pov" && floor.cameraPovTargetId)
        view += ` from ${floor.cameraPovTargetId}`;
      view += ")";
    }
    lines.push(view);
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
  if (floor.annotations && floor.annotations.length > 0) {
    lines.push("");
    lines.push(`Annotations (${floor.annotations.length}):`);
    for (const a of floor.annotations) {
      lines.push(
        `  [${a.id}] ${a.kind} @ (${a.x.toFixed(0)},${a.y.toFixed(0)}) — "${a.text}" (${a.author})`,
      );
    }
  }

  if (floor.quote) {
    lines.push("");
    lines.push("Quote:");
    lines.push(`  Client: ${floor.quote.clientName || "(unset)"}`);
    lines.push(`  Location: ${floor.quote.projectLocation || "(unset)"}`);
    lines.push(
      `  Labor $${floor.quote.laborRate}/hr · markup ${floor.quote.markupPct}% · tax ${floor.quote.taxPct}%`,
    );
    lines.push(
      `  Totals: hardware $${floor.quote.hardwareSubtotal.toFixed(0)} · labor $${floor.quote.laborSubtotal.toFixed(0)} · grand $${floor.quote.grandTotal.toFixed(0)}`,
    );
    if (floor.quote.bom.length > 0) {
      lines.push(`  Bill of materials (${floor.quote.bom.length} line(s)):`);
      floor.quote.bom.forEach((row) => {
        lines.push(
          `    ${row.vendor} ${row.displayName} × ${row.quantity} @ $${row.unitPrice} = $${row.subtotal}`,
        );
      });
    } else {
      lines.push("  Bill of materials: (no priced devices yet)");
    }
    if (floor.quote.extraLineItems.length > 0) {
      lines.push(`  Extra line items (${floor.quote.extraLineItems.length}):`);
      floor.quote.extraLineItems.forEach((li, i) => {
        lines.push(
          `    [${i}] ${li.category}: "${li.description}" × ${li.quantity} @ $${li.unitCost}`,
        );
      });
    } else {
      lines.push("  Extra line items: (none)");
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
        model: typeof input.model === "string" ? input.model : undefined,
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
    case "add_annotation": {
      const kind = input.annotationKind as "note" | "warning" | "idea";
      if (!["note", "warning", "idea"].includes(kind)) return null;
      const text =
        typeof input.text === "string" && input.text.trim()
          ? input.text.trim()
          : "";
      if (!text) return null;
      return {
        kind: "add-annotation",
        x: Number(input.x) || 0,
        y: Number(input.y) || 0,
        text,
        annotationKind: kind,
      };
    }
    case "remove_annotation": {
      const annotationId =
        typeof input.annotationId === "string" ? input.annotationId : "";
      if (!annotationId) return null;
      return { kind: "remove-annotation", annotationId };
    }
    case "add_quote_line_item": {
      const category = input.category as
        | "labor"
        | "materials"
        | "permits"
        | "logistics"
        | "other";
      if (
        !["labor", "materials", "permits", "logistics", "other"].includes(
          category,
        )
      )
        return null;
      const description =
        typeof input.description === "string" ? input.description.trim() : "";
      if (!description) return null;
      const quantity = Number(input.quantity);
      const unitCost = Number(input.unitCost);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      if (!Number.isFinite(unitCost) || unitCost < 0) return null;
      return {
        kind: "add-quote-line-item",
        description,
        quantity,
        unitCost,
        category,
      };
    }
    case "remove_quote_line_item": {
      const index = Number(input.index);
      if (!Number.isInteger(index) || index < 0) return null;
      return { kind: "remove-quote-line-item", index };
    }
    case "view_from_camera": {
      const deviceId =
        typeof input.deviceId === "string" ? input.deviceId : "";
      if (!deviceId) return null;
      return { kind: "view-from-camera", deviceId };
    }
    case "set_view_mode": {
      const viewMode = input.viewMode as "2d" | "3d" | "sim";
      if (!["2d", "3d", "sim"].includes(viewMode)) return null;
      const threeDMode =
        input.threeDMode === "orbit" || input.threeDMode === "walk"
          ? (input.threeDMode as "orbit" | "walk")
          : undefined;
      return { kind: "set-view-mode", viewMode, threeDMode };
    }
    case "update_quote_settings": {
      const op: ChatOperation = { kind: "update-quote-settings" };
      const numericFields = [
        "laborRate",
        "cablingPerCamera",
        "cablingPerReader",
        "commissioningFee",
        "markupPct",
        "taxPct",
      ] as const;
      for (const k of numericFields) {
        if (typeof input[k] === "number") {
          (op as Record<string, unknown>)[k] = input[k];
        }
      }
      const stringFields = [
        "clientName",
        "projectLocation",
        "preparedBy",
        "brandColor",
        "printFooter",
        "regionalNotes",
        "benchmark",
        "narrative",
      ] as const;
      for (const k of stringFields) {
        if (typeof input[k] === "string") {
          (op as Record<string, unknown>)[k] = input[k];
        }
      }
      // No-op if nothing was set.
      if (Object.keys(op).length === 1) return null;
      return op;
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
