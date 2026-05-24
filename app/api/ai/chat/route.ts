import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import {
  clippedFovPolygon,
  pointToSegment,
  polygonArea,
  rayHitSegment,
} from "@/lib/geometry";
import { SYSTEM_PROMPT } from "@/lib/ai-prompt";
import {
  runAdvisorAgent,
  type AdvisorRequestBody,
} from "@/lib/ai-advisor-runner";

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
 *   event: tool_start       → { name, label }  a server-executed tool started
 *   event: tool_end         → { name }      a server-executed tool finished
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
/** Raised from 12 → 25 so the agent can run real verify-and-iterate
 *  workflows (place → analyze_coverage → fix → re-analyze, or
 *  unknown-product synthesis with multiple fetches). */
const MAX_TURNS = 25;

/** Tool names the SERVER executes — they return data to the agent rather
 *  than mutating the client store. Everything else is parsed into a
 *  ChatOperation and forwarded to the client as an "operation" event. */
const SERVER_TOOL_NAMES = new Set<string>([
  "analyze_coverage",
  "run_advisor",
  "fetch_url",
  "validate_placement",
]);

/** Per-conversation cost guards on the spendier server tools. */
const RUN_ADVISOR_MAX = 3;
const FETCH_URL_MAX = 8;

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
  doors: {
    id: string;
    x: number;
    y: number;
    widthMeters: number;
    locked: boolean;
    label: string;
    /** Optional lock-hardware spec on this door. Surfaced to the agent
     *  so it can reason about compatibility, voltage, fail mode, etc. */
    lock?: {
      type: string;
      brand: string;
      model: string;
      voltage?: 12 | 24;
      currentDrawA?: number;
      failMode?: "fail-safe" | "fail-secure";
      weatherRated?: boolean;
      compatibleWith?: string[];
      notes?: string;
    };
  }[];
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
    /** Live bill of materials — model, vendor, qty, unit price + subtotal,
     *  plus ecosystem/compatibility tags so the agent can flag mixed-vendor
     *  combos without guessing. */
    bom: {
      modelId: string;
      displayName: string;
      vendor: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      ecosystem?: string;
      compatibility?: string[];
    }[];
    hardwareSubtotal: number;
    laborSubtotal: number;
    grandTotal: number;
  };
}

/** Wire shape for a chat turn. Plain text for ordinary messages; multimodal
 *  content blocks (text + image) for user turns that attached an image. */
type WireContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        data: string;
      };
    };

interface ChatMessage {
  role: "user" | "assistant";
  content: string | WireContentBlock[];
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
      /** Server-generated id — when present, the client uses this id so
          server and client agree on which device the next op refers to
          (lets analyze_coverage / validate_placement see in-turn edits). */
      id?: string;
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
  | {
      kind: "add-wall";
      id?: string;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }
  | { kind: "remove-wall"; wallId: string }
  | {
      kind: "add-door";
      id?: string;
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
      kind: "add-cable";
      sourceDeviceId: string;
      targetDeviceId: string;
      cableType:
        | "cat6"
        | "cat6a"
        | "fiber"
        | "22-4"
        | "18-2"
        | "16-2"
        | "rg59"
        | "speaker-16-2";
      waypoints?: { x: number; y: number }[];
      label?: string;
      notes?: string;
    }
  | { kind: "remove-cable"; cableId: string }
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
    }
  | {
      /** Set or clear the lock-hardware spec on a door. Pass `clear: true`
       *  to wipe the spec; otherwise partial fields are merged. */
      kind: "set-door-lock";
      doorId: string;
      clear?: boolean;
      lockType?:
        | "mag-lock"
        | "electric-strike"
        | "electric-bolt"
        | "magnetic-shear"
        | "smart-deadbolt"
        | "smart-mortise"
        | "exit-device";
      brand?: string;
      model?: string;
      voltage?: 12 | 24;
      currentDrawA?: number;
      failMode?: "fail-safe" | "fail-secure";
      weatherRated?: boolean;
      compatibleWith?: string[];
      notes?: string;
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
      "Add a door on a specific wall. The (x, y) you provide is automatically snapped onto the wall's line segment and the rotation is overwritten with the wall's actual tangent angle — so your coords only need to be roughly on the wall. The simplest pattern: use the wall's midpoint coordinates (provided as `mid (mx, my)` in the floor state) when you want a door centered on the wall, or interpolate ~30/70% along the wall for off-center placement. Width defaults: 0.9 m (standard), 1.2 m (wide single), 1.8 m (double).",
    input_schema: {
      type: "object",
      properties: {
        wallId: { type: "string", description: "Required — must match a wall id from the floor state." },
        x: { type: "number", description: "Floor-plan pixel X. Snapped onto the wall." },
        y: { type: "number", description: "Floor-plan pixel Y. Snapped onto the wall." },
        rotationDegrees: {
          type: "number",
          description: "Hint only — actual rotation is forced to the wall's tangent. Pass 0 if unsure.",
        },
        widthMeters: { type: "number" },
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
    name: "add_cable",
    description:
      "Draw a cable between two devices. Use this to wire up: every camera or AP to an NVR or PoE switch (Cat6); every reader to a controller or panel (22/4); every door-hardware piece (electric strike, mag lock, exit device, intercom) to its power supply or access controller (18/2 default). Optional intermediate waypoints in floor-plan pixel coords let you route around obstacles. Pick the cable type that matches integrator convention.",
    input_schema: {
      type: "object",
      properties: {
        sourceDeviceId: {
          type: "string",
          description: "Device id the cable starts at (the drop / leaf device).",
        },
        targetDeviceId: {
          type: "string",
          description:
            "Device id the cable terminates at (NVR, switch, controller, power supply).",
        },
        cableType: {
          type: "string",
          enum: [
            "cat6",
            "cat6a",
            "fiber",
            "22-4",
            "18-2",
            "16-2",
            "rg59",
            "speaker-16-2",
          ],
          description:
            "Cable spec. Rule of thumb: cameras + APs → cat6, readers → 22-4, door hardware/PSU → 18-2. Use cat6a for 10G runs, fiber for >100m, rg59 only for legacy analog video.",
        },
        waypoints: {
          type: "array",
          description:
            "Optional list of intermediate bend points in floor-plan pixel coords. Use to route the cable around walls, columns, or HVAC.",
          items: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
            required: ["x", "y"],
          },
        },
        label: { type: "string" },
        notes: { type: "string" },
      },
      required: ["sourceDeviceId", "targetDeviceId", "cableType"],
    },
  },
  {
    name: "remove_cable",
    description: "Delete a cable by id.",
    input_schema: {
      type: "object",
      properties: { cableId: { type: "string" } },
      required: ["cableId"],
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
  // ──────────────────────────────────────────────────────────────────────
  // SERVER-EXECUTED TOOLS — return data to the agent, don't mutate client.
  // ──────────────────────────────────────────────────────────────────────
  {
    name: "analyze_coverage",
    description:
      "Compute the WALL-CLIPPED FOV coverage for every camera (or a filtered subset). Returns each camera's actual reachable area vs nominal cone area, with a verdict (minimal / meaningful / HEAVY / MOSTLY BLOCKED). Use this BEFORE acting (to find the worst cameras) and to audit a design holistically. NOTE: reflects the floor at the start of THIS turn — it does NOT include devices you've added later in the same turn.",
    input_schema: {
      type: "object",
      properties: {
        deviceIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional. Restrict analysis to these camera ids. If omitted, analyze every camera on the floor.",
        },
      },
    },
  },
  {
    name: "run_advisor",
    description:
      "Run the full AI Coverage Advisor against the current floor. Returns a structured punch list of findings (blind spots, redundancies, missing sensors/network, compliance gaps) each with a recommended action. Use when the user asks to 'audit', 'review for gaps', or 'tell me what's wrong with this design'. EXPENSIVE: capped at 3 calls per conversation.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "fetch_url",
    description:
      "GET a publicly-reachable HTTPS URL and return the text content (HTML stripped, capped at ~50 KB). Use this when web_search results give you a promising link and you need the actual page text — e.g. a manufacturer spec sheet, a city permit fee table, a code requirements page. Capped at 8 calls per conversation. Private/local URLs are blocked.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full HTTPS URL.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "set_door_lock",
    description:
      "Specify or update the lock hardware on an existing door. Use this when the user asks about door hardware ('what lock should the server door use?', 'spec a mag lock on the front entry'), when running a compatibility audit, or after recommending a lock type during a security review. The lock spec is DIFFERENT from the door's locked state — locked is whether the bolt is engaged right now; this is the actual hardware (HID mag lock, Schlage Encode, etc.). Pass `clear: true` to remove the spec entirely. Partial updates are merged with the existing spec.",
    input_schema: {
      type: "object",
      properties: {
        doorId: { type: "string", description: "Required — must match an existing door id." },
        clear: {
          type: "boolean",
          description: "When true, removes the lock spec from this door. Other fields ignored.",
        },
        lockType: {
          type: "string",
          enum: [
            "mag-lock",
            "electric-strike",
            "electric-bolt",
            "magnetic-shear",
            "smart-deadbolt",
            "smart-mortise",
            "exit-device",
          ],
          description:
            "mag-lock = electromagnetic, fail-safe by physics. electric-strike retrofits existing locksets. smart-deadbolt = Schlage Encode / Yale Assure for residential or smart-only access. smart-mortise = Salto / dormakaba commercial.",
        },
        brand: { type: "string", description: "e.g. HID, Schlage, Salto, ASSA ABLOY, HES." },
        model: { type: "string", description: "e.g. 'HES 9600', 'Schlage Encode', 'Salto XS4'." },
        voltage: { type: "number", enum: [12, 24], description: "12 or 24 VDC." },
        currentDrawA: { type: "number", description: "Current draw in amps (matters for power-supply sizing)." },
        failMode: {
          type: "string",
          enum: ["fail-safe", "fail-secure"],
          description:
            "fail-safe unlocks on power loss (egress / life safety). fail-secure stays locked (storage, IT, server rooms).",
        },
        weatherRated: { type: "boolean", description: "True for exterior-rated hardware." },
        compatibleWith: {
          type: "array",
          items: { type: "string" },
          description:
            "Brands or product ids this lock natively integrates with. Used by the agent to flag mixed-vendor incompatibility.",
        },
        notes: { type: "string", description: "Anything else worth noting (power supply, panic hardware coupling, etc.)." },
      },
      required: ["doorId"],
    },
  },
  {
    name: "validate_placement",
    description:
      "Spatial sanity check on one or more devices. Returns per-device structural assessment: distance to nearest wall, whether a camera's FOV is pointed into a nearby wall, distance from a reader to the nearest door, redundancy between cameras, etc. THIS REFLECTS DEVICES YOU JUST PLACED IN THIS TURN — call it after add_device / move_device / rotate_device to verify your work and self-correct before answering. Use the most-specific filter you can (deviceId for one, deviceIds for a batch) so the output stays focused.",
    input_schema: {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description:
            "Validate a single device by id. Use this right after touching one device.",
        },
        deviceIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Validate a batch of devices. Use after placing several in one tool burst.",
        },
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

/* SYSTEM_PROMPT is composed from per-section modules under lib/ai-prompt/
   so each piece (tools, spatial rules, coverage, etc.) can be iterated on
   without scrolling a 270-line string. See lib/ai-prompt/index.ts. */

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
        // prior turns mutated the floor. When that message is multimodal
        // (image + text), prepend the floor context to the text block so the
        // image stays intact.
        const claudeMessages: Anthropic.Messages.MessageParam[] = body.messages.map(
          (m, i, arr) => {
            const isLastUser = m.role === "user" && i === arr.length - 1;
            if (!isLastUser) {
              return {
                role: m.role,
                content: m.content as Anthropic.Messages.MessageParam["content"],
              };
            }
            if (typeof m.content === "string") {
              return {
                role: m.role,
                content: `${floorContext}\n\nUser: ${m.content}`,
              };
            }
            const blocks = m.content.map((b) =>
              b.type === "text"
                ? { type: "text" as const, text: `${floorContext}\n\nUser: ${b.text}` }
                : b,
            );
            // If the user attached an image but typed nothing, there's no
            // text block to splice into — prepend a fresh one carrying the
            // floor context plus a tiny stand-in user line.
            const hasText = blocks.some((b) => b.type === "text");
            const finalBlocks = hasText
              ? blocks
              : [
                  { type: "text" as const, text: `${floorContext}\n\nUser: (image attached)` },
                  ...blocks,
                ];
            return {
              role: m.role,
              content: finalBlocks as Anthropic.Messages.MessageParam["content"],
            };
          },
        );

        let totalIn = 0;
        let totalOut = 0;
        let totalCacheCreate = 0;
        let totalCacheRead = 0;
        let webSearchCount = 0;
        // Per-conversation guards so the agent can't run away with cost on
        // the spendy server tools. Soft caps — the tool returns an error
        // result when the limit is reached and Claude moves on.
        const budgets: ServerToolBudgets = {
          runAdvisorUsed: 0,
          fetchUrlUsed: 0,
        };
        // Mutable mirror of the floor state. Updates as the agent issues
        // add / move / rotate / remove ops within this turn so the server
        // tools (analyze_coverage, validate_placement) see the agent's
        // in-progress edits — not the snapshot frozen at request time.
        // Client + server agree on entity ids because the server generates
        // them here and ships them inside the operation event.
        const serverFloor: FloorSnapshot = cloneFloorForMirror(body.floor);
        let srvIdCounter = 0;
        const nextServerId = (prefix: string) =>
          `${prefix}_srv_${Date.now().toString(36)}_${++srvIdCounter}`;

        // Cache the system prompt + tools array. Both are stable across
        // turns and across conversations, so the prompt cache slashes input
        // tokens on every follow-up turn within the 5-minute TTL.
        const cachedSystem: Anthropic.Messages.TextBlockParam[] = [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ];
        const cachedTools = [
          ...DOMAIN_TOOLS.slice(0, -1),
          {
            ...DOMAIN_TOOLS[DOMAIN_TOOLS.length - 1],
            cache_control: { type: "ephemeral" as const },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          WEB_SEARCH_TOOL as any,
        ];

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          send("turn", { index: turn });

          // For each turn we open a streaming Messages call. The stream
          // emits content_block_start/delta/stop events that we translate
          // into our SSE events.
          const apiStream = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: cachedSystem,
            tools: cachedTools,
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
                if (SERVER_TOOL_NAMES.has(b.name)) {
                  // Server-executed tool — emit a progress pill now so the
                  // UI shows activity. Actual execution happens after the
                  // stream ends (we have the input ready, but Claude is
                  // expecting tool_result on the NEXT API call).
                  send("tool_start", {
                    name: b.name,
                    label: serverToolLabel(b.name, b.json),
                  });
                } else {
                  try {
                    const input = JSON.parse(b.json) as Record<string, unknown>;
                    const op = toolUseToOperation(b.name, input);
                    if (op) {
                      // Mirror the op on the server-side floor (used by
                      // analyze_coverage / validate_placement). For ops
                      // that create new entities, the mirror returns a
                      // synthetic id that gets stamped onto the operation
                      // so the client uses the SAME id — keeping client
                      // and server in agreement for subsequent ops.
                      const { idAssigned } = mirrorOpToServerFloor(
                        op,
                        serverFloor,
                        nextServerId,
                      );
                      if (idAssigned) {
                        (op as { id?: string }).id = idAssigned;
                      }
                      send("operation", op);
                    }
                  } catch {
                    /* swallow malformed tool JSON */
                  }
                }
              }
              blocks.delete(event.index);
            }
          }

          const finalMessage = await apiStream.finalMessage();
          totalIn += finalMessage.usage.input_tokens;
          totalOut += finalMessage.usage.output_tokens;
          totalCacheCreate += finalMessage.usage.cache_creation_input_tokens ?? 0;
          totalCacheRead += finalMessage.usage.cache_read_input_tokens ?? 0;

          if (finalMessage.stop_reason !== "tool_use") break;

          // Build tool_results for every tool_use block. Two paths:
          //   1. Server-executed tools (analyze_coverage / run_advisor /
          //      fetch_url) run here and return a real string result.
          //   2. Client tools acknowledge with "ok" — the actual mutation
          //      happens on the client via the "operation" SSE events we
          //      already streamed.
          // The native web_search server tool already has its results
          // inline in finalMessage.content (handled by the SDK); we just
          // skip tool_use blocks of that type.
          const allToolUses = finalMessage.content.filter(
            (c): c is Anthropic.Messages.ToolUseBlock => c.type === "tool_use",
          );
          if (allToolUses.length === 0) break;

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
          for (const t of allToolUses) {
            if (SERVER_TOOL_NAMES.has(t.name)) {
              let resultText: string;
              try {
                resultText = await executeServerTool({
                  name: t.name,
                  input: t.input as Record<string, unknown>,
                  // The LIVE server-side floor mirror — reflects every
                  // add/move/rotate/remove the agent issued earlier in
                  // this turn, not the snapshot frozen at request time.
                  floor: serverFloor,
                  designName: body.designName,
                  buildingType: body.buildingType,
                  client,
                  budgets,
                });
              } catch (err) {
                resultText = `Tool error: ${
                  err instanceof Error ? err.message : String(err)
                }`;
              }
              send("tool_end", { name: t.name });
              toolResults.push({
                type: "tool_result" as const,
                tool_use_id: t.id,
                content: resultText,
              });
            } else {
              toolResults.push({
                type: "tool_result" as const,
                tool_use_id: t.id,
                content: "ok",
              });
            }
          }

          claudeMessages.push(
            { role: "assistant", content: finalMessage.content },
            { role: "user", content: toolResults },
          );
        }

        send("done", {
          usage: {
            inputTokens: totalIn,
            outputTokens: totalOut,
            cacheCreationTokens: totalCacheCreate,
            cacheReadTokens: totalCacheRead,
          },
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

  // Floor bounding box — needed to classify walls as exterior vs interior
  // and to give the agent an overall sense of the building footprint.
  const bbox = computeFloorBbox(floor);
  if (bbox) {
    const widthM = (bbox.maxX - bbox.minX) / floor.scalePxPerMeter;
    const heightM = (bbox.maxY - bbox.minY) / floor.scalePxPerMeter;
    lines.push(
      `Floor extents: (${bbox.minX.toFixed(0)},${bbox.minY.toFixed(0)}) → (${bbox.maxX.toFixed(0)},${bbox.maxY.toFixed(0)}) — ~${widthM.toFixed(1)} m × ${heightM.toFixed(1)} m, centroid (${(((bbox.minX + bbox.maxX) / 2)).toFixed(0)},${(((bbox.minY + bbox.maxY) / 2)).toFixed(0)}).`,
    );
  }

  lines.push("");
  lines.push(`Walls (${floor.walls.length}):`);
  if (floor.walls.length === 0) lines.push("  (none yet)");
  else {
    for (const w of floor.walls.slice(0, 60)) {
      const dx = w.endX - w.startX;
      const dy = w.endY - w.startY;
      const lenPx = Math.hypot(dx, dy);
      const midX = (w.startX + w.endX) / 2;
      const midY = (w.startY + w.endY) / 2;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const orient = classifyWallOrientation(angleDeg);
      const role = bbox ? classifyWallRole(w, bbox) : "UNKNOWN";
      // Enriched per-wall line: orientation + exterior/interior +
      // (for exterior) cardinal direction, plus midpoint/length/angle.
      lines.push(
        `  [${w.id}] ${orient} ${role} wall · mid (${midX.toFixed(0)},${midY.toFixed(0)}) · ${lenPx.toFixed(0)}px @ ${angleDeg.toFixed(0)}° · (${w.startX.toFixed(0)},${w.startY.toFixed(0)})→(${w.endX.toFixed(0)},${w.endY.toFixed(0)})`,
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
      const bits: string[] = [
        `${d.widthMeters} m wide`,
        d.locked ? "locked" : "unlocked",
      ];
      if (d.lock) {
        const lockBits = [`${d.lock.type}`];
        if (d.lock.brand || d.lock.model) {
          lockBits.push(`${d.lock.brand} ${d.lock.model}`.trim());
        }
        if (d.lock.voltage) lockBits.push(`${d.lock.voltage}VDC`);
        if (d.lock.failMode) lockBits.push(d.lock.failMode);
        if (d.lock.weatherRated) lockBits.push("weather-rated");
        bits.push(`lock: ${lockBits.join(" · ")}`);
      } else {
        bits.push("no lock spec");
      }
      lines.push(
        `  [${d.id}] "${d.label}" @ (${d.x.toFixed(0)},${d.y.toFixed(0)}) — ${bits.join(", ")}`,
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
  // 3D-AWARE COVERAGE ANALYSIS — for each camera, compute the wall-clipped
  // FOV polygon area and compare against the nominal (un-occluded) cone
  // area. This is the agent's signal that a camera is "wasting" its FOV
  // behind a wall, regardless of what the 2D plan looks like at a glance.
  const cameras = floor.devices.filter(
    (d) =>
      d.type === "camera" &&
      typeof d.fovDegrees === "number" &&
      typeof d.rangeMeters === "number",
  );
  if (cameras.length > 0 && floor.walls.length > 0) {
    const wallSegs = floor.walls.map((w) => ({
      start: { x: w.startX, y: w.startY },
      end: { x: w.endX, y: w.endY },
    }));
    lines.push("");
    lines.push("Camera coverage (wall-clipped, 3D-aware):");
    for (const cam of cameras) {
      const fov = cam.fovDegrees!;
      const rangeM = cam.rangeMeters!;
      const rotRad = (cam.rotationDegrees * Math.PI) / 180;
      const polygon = clippedFovPolygon({
        origin: { x: cam.x, y: cam.y },
        rotation: rotRad,
        fovDegrees: fov,
        rangeMeters: rangeM,
        scalePxPerMeter: floor.scalePxPerMeter,
        walls: wallSegs,
        segments: 24,
      });
      const actualSqPx = polygonArea(polygon);
      const actualSqM = actualSqPx / (floor.scalePxPerMeter * floor.scalePxPerMeter);
      const nominalSqM = Math.PI * rangeM * rangeM * (fov / 360);
      const pct = nominalSqM > 0 ? Math.round((actualSqM / nominalSqM) * 100) : 0;
      const blocked = Math.max(0, nominalSqM - actualSqM);
      const verdict =
        pct >= 90
          ? "minimal occlusion"
          : pct >= 65
            ? `${blocked.toFixed(1)} m² blocked by walls`
            : pct >= 40
              ? `HEAVY OCCLUSION — ${blocked.toFixed(1)} m² blocked; consider rotating or moving`
              : `MOSTLY BLOCKED — only ${pct}% of FOV reaches anything`;
      lines.push(
        `  [${cam.id}] "${cam.label}" — nominal ${nominalSqM.toFixed(1)} m², actual ${actualSqM.toFixed(1)} m² (${pct}%) — ${verdict}`,
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
        const eco = row.ecosystem ? ` [${row.ecosystem}]` : "";
        const compat =
          row.compatibility && row.compatibility.length > 0
            ? ` works-with: ${row.compatibility.join(",")}`
            : "";
        lines.push(
          `    ${row.vendor} ${row.displayName} × ${row.quantity} @ $${row.unitPrice} = $${row.subtotal}${eco}${compat}`,
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

/**
 * Compute the floor's overall pixel-space bounding box from its walls.
 * Returns null when the floor has no walls (no spatial reference yet).
 */
function computeFloorBbox(
  floor: FloorSnapshot,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (floor.walls.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const w of floor.walls) {
    minX = Math.min(minX, w.startX, w.endX);
    minY = Math.min(minY, w.startY, w.endY);
    maxX = Math.max(maxX, w.startX, w.endX);
    maxY = Math.max(maxY, w.startY, w.endY);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Bucket a wall's angle into HORIZONTAL / VERTICAL / DIAGONAL so the
 * agent can reason in cardinal terms even without a geometry library.
 * 15° tolerance — handles slightly skewed traces from the AI Survey.
 */
function classifyWallOrientation(
  angleDeg: number,
): "HORIZONTAL" | "VERTICAL" | "DIAGONAL" {
  const a = ((angleDeg % 180) + 180) % 180; // 0..180
  if (a < 15 || a > 165) return "HORIZONTAL";
  if (a > 75 && a < 105) return "VERTICAL";
  return "DIAGONAL";
}

/**
 * Classify a wall as EXTERIOR (on the floor's perimeter, one cardinal
 * side) or INTERIOR (somewhere in the middle, partitioning rooms). For
 * exterior walls, we also return the cardinal side (NORTH / SOUTH /
 * EAST / WEST) so the agent can say "front wall" instead of guessing.
 *
 * Tolerance: a wall counts as on a perimeter side if both endpoints
 * are within 10% of the floor's extent of that side.
 */
function classifyWallRole(
  w: { startX: number; startY: number; endX: number; endY: number },
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
):
  | "EXTERIOR NORTH"
  | "EXTERIOR SOUTH"
  | "EXTERIOR EAST"
  | "EXTERIOR WEST"
  | "INTERIOR" {
  const w_w = bbox.maxX - bbox.minX;
  const h_h = bbox.maxY - bbox.minY;
  const tolX = Math.max(20, w_w * 0.06);
  const tolY = Math.max(20, h_h * 0.06);
  const onNorth =
    Math.abs(w.startY - bbox.minY) < tolY &&
    Math.abs(w.endY - bbox.minY) < tolY;
  const onSouth =
    Math.abs(w.startY - bbox.maxY) < tolY &&
    Math.abs(w.endY - bbox.maxY) < tolY;
  const onWest =
    Math.abs(w.startX - bbox.minX) < tolX &&
    Math.abs(w.endX - bbox.minX) < tolX;
  const onEast =
    Math.abs(w.startX - bbox.maxX) < tolX &&
    Math.abs(w.endX - bbox.maxX) < tolX;
  if (onNorth) return "EXTERIOR NORTH";
  if (onSouth) return "EXTERIOR SOUTH";
  if (onWest) return "EXTERIOR WEST";
  if (onEast) return "EXTERIOR EAST";
  return "INTERIOR";
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
    case "add_cable": {
      const ALLOWED_TYPES = [
        "cat6",
        "cat6a",
        "fiber",
        "22-4",
        "18-2",
        "16-2",
        "rg59",
        "speaker-16-2",
      ] as const;
      const sourceDeviceId =
        typeof input.sourceDeviceId === "string"
          ? input.sourceDeviceId.trim()
          : "";
      const targetDeviceId =
        typeof input.targetDeviceId === "string"
          ? input.targetDeviceId.trim()
          : "";
      const cableType = input.cableType as (typeof ALLOWED_TYPES)[number];
      if (!sourceDeviceId || !targetDeviceId) return null;
      if (sourceDeviceId === targetDeviceId) return null;
      if (!ALLOWED_TYPES.includes(cableType)) return null;
      const rawWaypoints = Array.isArray(input.waypoints) ? input.waypoints : [];
      const waypoints = rawWaypoints
        .map((w) => {
          const obj = w as { x?: unknown; y?: unknown };
          return { x: Number(obj.x), y: Number(obj.y) };
        })
        .filter((w) => Number.isFinite(w.x) && Number.isFinite(w.y))
        .slice(0, 12);
      return {
        kind: "add-cable",
        sourceDeviceId,
        targetDeviceId,
        cableType,
        waypoints: waypoints.length > 0 ? waypoints : undefined,
        label: typeof input.label === "string" ? input.label : undefined,
        notes: typeof input.notes === "string" ? input.notes : undefined,
      };
    }
    case "remove_cable": {
      const cableId =
        typeof input.cableId === "string" ? input.cableId.trim() : "";
      if (!cableId) return null;
      return { kind: "remove-cable", cableId };
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
    case "set_door_lock": {
      const doorId = typeof input.doorId === "string" ? input.doorId.trim() : "";
      if (!doorId) return null;
      if (input.clear === true) {
        return { kind: "set-door-lock", doorId, clear: true };
      }
      const op: ChatOperation = { kind: "set-door-lock", doorId };
      const validLockTypes = new Set([
        "mag-lock",
        "electric-strike",
        "electric-bolt",
        "magnetic-shear",
        "smart-deadbolt",
        "smart-mortise",
        "exit-device",
      ]);
      if (
        typeof input.lockType === "string" &&
        validLockTypes.has(input.lockType)
      ) {
        op.lockType = input.lockType as Extract<
          ChatOperation,
          { kind: "set-door-lock" }
        >["lockType"];
      }
      if (typeof input.brand === "string") op.brand = input.brand;
      if (typeof input.model === "string") op.model = input.model;
      if (input.voltage === 12 || input.voltage === 24) op.voltage = input.voltage;
      if (typeof input.currentDrawA === "number" && input.currentDrawA > 0) {
        op.currentDrawA = input.currentDrawA;
      }
      if (
        input.failMode === "fail-safe" ||
        input.failMode === "fail-secure"
      ) {
        op.failMode = input.failMode;
      }
      if (typeof input.weatherRated === "boolean") {
        op.weatherRated = input.weatherRated;
      }
      if (Array.isArray(input.compatibleWith)) {
        op.compatibleWith = input.compatibleWith.filter(
          (x): x is string => typeof x === "string",
        );
      }
      if (typeof input.notes === "string") op.notes = input.notes;
      return op;
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

/* ────────────────────────────────────────────────────────────────────────
   SERVER-SIDE FLOOR MIRROR
   ─────────────────────────────────────────────────────────────────────── */

/** Shallow-clones the floor with FRESH array copies so the mirror can be
 *  mutated freely without leaking changes back to the request body. */
function cloneFloorForMirror(src: FloorSnapshot): FloorSnapshot {
  return {
    ...src,
    walls: src.walls.map((w) => ({ ...w })),
    devices: src.devices.map((d) => ({ ...d })),
    doors: src.doors.map((d) => ({ ...d })),
    annotations: src.annotations.map((a) => ({ ...a })),
  };
}

/** Apply a chat operation to the server-side floor mirror. Returns the
 *  newly-assigned id for create-style ops so the caller can stamp it onto
 *  the outgoing operation event (keeping client + server ids in sync). */
function mirrorOpToServerFloor(
  op: ChatOperation,
  floor: FloorSnapshot,
  nextId: (prefix: string) => string,
): { idAssigned?: string } {
  switch (op.kind) {
    case "add-device": {
      const id = nextId("dev");
      floor.devices.push({
        id,
        type: op.deviceType,
        subtype: op.subtype,
        label: op.label,
        x: op.x,
        y: op.y,
        rotationDegrees: op.rotationDegrees,
        fovDegrees: op.fovDegrees,
        rangeMeters: op.rangeMeters,
        mountHeightM: op.mountHeightM ?? 2.7,
        installStatus: "proposed",
      });
      return { idAssigned: id };
    }
    case "move-device": {
      const d = floor.devices.find((x) => x.id === op.deviceId);
      if (d) {
        d.x = op.newX;
        d.y = op.newY;
      }
      return {};
    }
    case "rotate-device": {
      const d = floor.devices.find((x) => x.id === op.deviceId);
      if (d) d.rotationDegrees = op.newRotationDegrees;
      return {};
    }
    case "remove-device": {
      floor.devices = floor.devices.filter((d) => d.id !== op.deviceId);
      return {};
    }
    case "update-device": {
      const d = floor.devices.find((x) => x.id === op.deviceId);
      if (d) {
        if (op.label !== undefined) d.label = op.label;
        if (op.fovDegrees !== undefined) d.fovDegrees = op.fovDegrees;
        if (op.rangeMeters !== undefined) d.rangeMeters = op.rangeMeters;
        if (op.mountHeightM !== undefined) d.mountHeightM = op.mountHeightM;
        if (op.installStatus !== undefined) d.installStatus = op.installStatus;
      }
      return {};
    }
    case "add-wall": {
      const id = nextId("wall");
      floor.walls.push({
        id,
        startX: op.startX,
        startY: op.startY,
        endX: op.endX,
        endY: op.endY,
      });
      return { idAssigned: id };
    }
    case "remove-wall": {
      floor.walls = floor.walls.filter((w) => w.id !== op.wallId);
      return {};
    }
    case "add-door": {
      // Snap (x,y) onto the chosen wall — mirrors the client's snapping
      // logic in applyChatOperation so the door positions agree.
      const wall = floor.walls.find((w) => w.id === op.wallId);
      let snapX = op.x;
      let snapY = op.y;
      if (wall) {
        const dx = wall.endX - wall.startX;
        const dy = wall.endY - wall.startY;
        const len2 = dx * dx + dy * dy;
        if (len2 > 0) {
          const t = Math.max(
            0,
            Math.min(
              1,
              ((op.x - wall.startX) * dx + (op.y - wall.startY) * dy) / len2,
            ),
          );
          snapX = wall.startX + dx * t;
          snapY = wall.startY + dy * t;
        }
      }
      const id = nextId("door");
      floor.doors.push({
        id,
        x: snapX,
        y: snapY,
        widthMeters: op.widthMeters,
        locked: op.locked,
        label: op.label,
      });
      return { idAssigned: id };
    }
    case "set-floor-scale": {
      floor.scalePxPerMeter = op.scalePxPerMeter;
      return {};
    }
    case "set-door-lock": {
      const door = floor.doors.find((d) => d.id === op.doorId);
      if (!door) return {};
      if (op.clear) {
        door.lock = undefined;
        return {};
      }
      const base = door.lock ?? {
        type: op.lockType ?? "mag-lock",
        brand: "",
        model: "",
      };
      door.lock = {
        ...base,
        ...(op.lockType !== undefined && { type: op.lockType }),
        ...(op.brand !== undefined && { brand: op.brand }),
        ...(op.model !== undefined && { model: op.model }),
        ...(op.voltage !== undefined && { voltage: op.voltage }),
        ...(op.currentDrawA !== undefined && { currentDrawA: op.currentDrawA }),
        ...(op.failMode !== undefined && { failMode: op.failMode }),
        ...(op.weatherRated !== undefined && { weatherRated: op.weatherRated }),
        ...(op.compatibleWith !== undefined && { compatibleWith: op.compatibleWith }),
        ...(op.notes !== undefined && { notes: op.notes }),
      };
      return {};
    }
    // Annotation, quote, and view ops don't affect spatial verification —
    // they have no representation in the mirror.
    default:
      return {};
  }
}

/* ────────────────────────────────────────────────────────────────────────
   SERVER-EXECUTED TOOLS
   ─────────────────────────────────────────────────────────────────────── */

interface ServerToolBudgets {
  runAdvisorUsed: number;
  fetchUrlUsed: number;
}

/** Friendly status-pill label shown to the user while a server tool runs.
 *  Inputs may be partial mid-stream, so we parse defensively. */
function serverToolLabel(name: string, partialJson: string): string {
  switch (name) {
    case "analyze_coverage":
      return "Analyzing coverage";
    case "run_advisor":
      return "Running coverage advisor";
    case "fetch_url": {
      try {
        const input = JSON.parse(partialJson || "{}") as { url?: string };
        if (typeof input.url === "string") {
          const u = new URL(input.url);
          return `Fetching ${u.hostname}`;
        }
      } catch {
        /* mid-stream JSON is fine to fall through */
      }
      return "Fetching URL";
    }
    case "validate_placement":
      return "Checking placement";
    default:
      return name;
  }
}

async function executeServerTool(args: {
  name: string;
  input: Record<string, unknown>;
  floor: FloorSnapshot;
  designName: string;
  buildingType?: string;
  client: Anthropic;
  budgets: ServerToolBudgets;
}): Promise<string> {
  switch (args.name) {
    case "analyze_coverage":
      return analyzeCoverageTool(args.input, args.floor);
    case "run_advisor":
      if (args.budgets.runAdvisorUsed >= RUN_ADVISOR_MAX) {
        return `run_advisor budget exhausted (${RUN_ADVISOR_MAX} per conversation). Use the existing analyze_coverage output and your judgment.`;
      }
      args.budgets.runAdvisorUsed++;
      return runAdvisorTool(args.floor, args.designName, args.buildingType, args.client);
    case "fetch_url":
      if (args.budgets.fetchUrlUsed >= FETCH_URL_MAX) {
        return `fetch_url budget exhausted (${FETCH_URL_MAX} per conversation).`;
      }
      args.budgets.fetchUrlUsed++;
      return fetchUrlTool(args.input);
    case "validate_placement":
      return validatePlacementTool(args.input, args.floor);
    default:
      return `Unknown server tool: ${args.name}`;
  }
}

/** Per-camera wall-clipped FOV verdict the agent can iterate on. */
function analyzeCoverageTool(
  input: Record<string, unknown>,
  floor: FloorSnapshot,
): string {
  const idFilter: Set<string> | null = Array.isArray(input.deviceIds)
    ? new Set(input.deviceIds.filter((x): x is string => typeof x === "string"))
    : null;
  const cameras = floor.devices.filter(
    (d) =>
      d.type === "camera" &&
      typeof d.fovDegrees === "number" &&
      typeof d.rangeMeters === "number" &&
      (!idFilter || idFilter.has(d.id)),
  );
  if (cameras.length === 0) {
    return idFilter
      ? "No cameras matched the supplied deviceIds filter."
      : "No cameras on the floor to analyze.";
  }
  if (floor.walls.length === 0) {
    return "No walls present — cameras are unobstructed by definition. (Nominal FOV = actual.)";
  }
  const wallSegs = floor.walls.map((w) => ({
    start: { x: w.startX, y: w.startY },
    end: { x: w.endX, y: w.endY },
  }));
  const lines: string[] = [
    `Wall-clipped coverage for ${cameras.length} camera(s):`,
  ];
  for (const cam of cameras) {
    const fov = cam.fovDegrees!;
    const rangeM = cam.rangeMeters!;
    const polygon = clippedFovPolygon({
      origin: { x: cam.x, y: cam.y },
      rotation: (cam.rotationDegrees * Math.PI) / 180,
      fovDegrees: fov,
      rangeMeters: rangeM,
      scalePxPerMeter: floor.scalePxPerMeter,
      walls: wallSegs,
      segments: 24,
    });
    const actualSqPx = polygonArea(polygon);
    const actualSqM =
      actualSqPx / (floor.scalePxPerMeter * floor.scalePxPerMeter);
    const nominalSqM = Math.PI * rangeM * rangeM * (fov / 360);
    const pct = nominalSqM > 0 ? Math.round((actualSqM / nominalSqM) * 100) : 0;
    const verdict =
      pct >= 90
        ? "minimal occlusion"
        : pct >= 65
          ? "meaningful occlusion"
          : pct >= 40
            ? "HEAVY OCCLUSION — rotate or move"
            : "MOSTLY BLOCKED — relocate this camera";
    lines.push(
      `  [${cam.id}] "${cam.label}" @ (${cam.x.toFixed(0)},${cam.y.toFixed(0)}) rot ${cam.rotationDegrees.toFixed(0)}° — actual ${actualSqM.toFixed(1)} m² of nominal ${nominalSqM.toFixed(1)} m² (${pct}%) — ${verdict}`,
    );
  }
  return lines.join("\n");
}

/** Run the full AI advisor against the current floor and return its
 *  findings as a structured text block the agent can act on. */
async function runAdvisorTool(
  floor: FloorSnapshot,
  designName: string,
  buildingType: string | undefined,
  client: Anthropic,
): Promise<string> {
  const body: AdvisorRequestBody = {
    designName,
    buildingType,
    floor: {
      name: floor.name,
      scalePxPerMeter: floor.scalePxPerMeter,
      ceilingHeightM: floor.ceilingHeightM,
      walls: floor.walls.map((w) => ({
        startX: w.startX,
        startY: w.startY,
        endX: w.endX,
        endY: w.endY,
      })),
      devices: floor.devices.map((d) => ({
        id: d.id,
        type: d.type,
        subtype: d.subtype,
        label: d.label,
        x: d.x,
        y: d.y,
        rotationDegrees: d.rotationDegrees,
        fovDegrees: d.fovDegrees,
        rangeMeters: d.rangeMeters,
        mountHeightM: d.mountHeightM,
        installStatus: d.installStatus,
      })),
    },
  };
  const result = await runAdvisorAgent(client, body);
  const lines: string[] = [
    `Advisor summary: ${result.summary || "(no summary returned)"}`,
    `Findings (${result.findings.length}):`,
  ];
  for (const f of result.findings) {
    lines.push(
      `  [${f.id}] ${f.severity.toUpperCase()} · ${f.kind} — ${f.title}`,
    );
    lines.push(`    ${f.description}`);
    if (f.location) {
      lines.push(
        `    Location: (${f.location.x.toFixed(0)}, ${f.location.y.toFixed(0)})`,
      );
    }
    const a = f.suggestedAction;
    let actionLine = "    Recommended: ";
    if (a.kind === "add-device") {
      actionLine += `add ${a.deviceType}${a.subtype ? ` (${a.subtype})` : ""} "${a.label}" at (${a.x.toFixed(0)}, ${a.y.toFixed(0)}) rot ${a.rotationDegrees.toFixed(0)}° — ${a.rationale}`;
    } else if (a.kind === "remove-device") {
      actionLine += `remove device ${a.deviceId} — ${a.rationale}`;
    } else if (a.kind === "rotate-device") {
      actionLine += `rotate ${a.deviceId} to ${a.newRotationDegrees.toFixed(0)}° — ${a.rationale}`;
    } else if (a.kind === "move-device") {
      actionLine += `move ${a.deviceId} to (${a.newX.toFixed(0)}, ${a.newY.toFixed(0)}) — ${a.rationale}`;
    } else {
      actionLine += `manual review — ${a.rationale}`;
    }
    lines.push(actionLine);
  }
  return lines.join("\n");
}

/** GET a public HTTPS URL and return scrubbed text. Blocks private IPs,
 *  caps response size, enforces a 10s timeout. */
async function fetchUrlTool(input: Record<string, unknown>): Promise<string> {
  const raw = typeof input.url === "string" ? input.url.trim() : "";
  if (!raw) return "Error: missing 'url' parameter.";
  if (!raw.toLowerCase().startsWith("https://")) {
    return "Error: only https:// URLs are supported.";
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Error: invalid URL.";
  }
  const host = parsed.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    return "Error: private / local URLs are blocked for safety.";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(raw, {
      signal: controller.signal,
      headers: {
        "user-agent": "DeeperVisionAgent/1.0 (+https://deeper-vision-self.vercel.app)",
        accept: "text/html,text/plain,application/xhtml+xml,*/*;q=0.5",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return `Error: ${parsed.hostname} returned HTTP ${res.status}.`;
    }
    const contentType = res.headers.get("content-type") ?? "";
    // Pull at most ~500 KB of bytes, then strip HTML and truncate text.
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > 500_000 ? buf.slice(0, 500_000) : buf;
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const raw_text = decoder.decode(slice);
    let stripped = raw_text;
    if (contentType.includes("html") || /<html[\s>]/i.test(raw_text)) {
      stripped = raw_text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
    stripped = stripped.replace(/\s+/g, " ").trim();
    if (!stripped) return "Page fetched OK but contained no readable text.";
    const MAX = 50_000;
    return stripped.length > MAX
      ? stripped.slice(0, MAX) + `\n…[truncated, ${stripped.length - MAX} more chars]`
      : stripped;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return "Error: fetch timed out after 10s.";
    }
    return `Error fetching URL: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Spatial sanity check on one or more devices using the live server-floor
 * mirror — so a camera the agent placed earlier in this same turn shows
 * up here and can be self-corrected. Returns concrete numbers + verdict
 * lines the agent can act on (rotate, move, remove).
 */
function validatePlacementTool(
  input: Record<string, unknown>,
  floor: FloorSnapshot,
): string {
  // Build the id filter (single deviceId OR deviceIds array OR none-means-all).
  let ids: Set<string> | null = null;
  if (typeof input.deviceId === "string" && input.deviceId.trim()) {
    ids = new Set([input.deviceId.trim()]);
  } else if (Array.isArray(input.deviceIds)) {
    ids = new Set(
      input.deviceIds.filter((x): x is string => typeof x === "string"),
    );
  }
  const devices = floor.devices.filter((d) => !ids || ids.has(d.id));
  if (devices.length === 0) {
    return ids
      ? "No devices matched the id filter (was it added in a prior turn?)."
      : "No devices on the floor to validate.";
  }
  const lines: string[] = [
    `Placement check for ${devices.length} device(s) (scale: ${floor.scalePxPerMeter} px/m):`,
  ];
  for (const d of devices) {
    lines.push(
      `[${d.id}] ${d.type}${d.subtype ? ` (${d.subtype})` : ""} "${d.label}" @ (${d.x.toFixed(0)}, ${d.y.toFixed(0)}):`,
    );
    for (const line of validateOneDevice(d, floor)) lines.push(`  ${line}`);
  }
  return lines.join("\n");
}

function validateOneDevice(
  d: FloorSnapshot["devices"][number],
  floor: FloorSnapshot,
): string[] {
  const out: string[] = [];
  const scale = floor.scalePxPerMeter;

  // ── Distance to nearest wall ──────────────────────────────────────────
  let nearestWallDistPx = Infinity;
  let nearestWallId = "";
  for (const w of floor.walls) {
    const r = pointToSegment(d.x, d.y, w.startX, w.startY, w.endX, w.endY);
    if (r.dist < nearestWallDistPx) {
      nearestWallDistPx = r.dist;
      nearestWallId = w.id;
    }
  }
  if (!Number.isFinite(nearestWallDistPx)) {
    out.push("• No walls on the floor — can't reason about wall mount.");
  } else {
    const wallM = nearestWallDistPx / scale;
    if (wallM < 0.3) {
      out.push(
        `• Wall-mounted: ${wallM.toFixed(2)} m from ${nearestWallId} — OK.`,
      );
    } else if (wallM < 1.2) {
      out.push(
        `• ${wallM.toFixed(2)} m from nearest wall (${nearestWallId}) — close to a wall but not mounted.`,
      );
    } else if (d.type === "sensor" && d.subtype === "motion") {
      // Motion sensors are ceiling-mounted in room centers — far-from-wall is good.
      out.push(
        `• ${wallM.toFixed(2)} m from nearest wall — appropriate for a ceiling-mounted motion sensor.`,
      );
    } else {
      out.push(
        `• ${wallM.toFixed(2)} m from nearest wall (${nearestWallId}) — free-standing / ceiling-mounted.`,
      );
    }
  }

  // ── Camera-specific: FOV-into-wall + redundancy ───────────────────────
  if (
    d.type === "camera" &&
    typeof d.fovDegrees === "number" &&
    typeof d.rangeMeters === "number"
  ) {
    const samples = 9;
    const halfFov = ((d.fovDegrees / 2) * Math.PI) / 180;
    const rot = (d.rotationDegrees * Math.PI) / 180;
    let nearBlocked = 0;
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const a = rot - halfFov + t * 2 * halfFov;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      let nearest = Infinity;
      for (const w of floor.walls) {
        const hit = rayHitSegment(
          { x: d.x, y: d.y },
          dir,
          { x: w.startX, y: w.startY },
          { x: w.endX, y: w.endY },
        );
        if (hit != null && hit < nearest) nearest = hit;
      }
      if (Number.isFinite(nearest) && nearest / scale < 0.5) nearBlocked++;
    }
    const blockPct = Math.round((nearBlocked / samples) * 100);
    if (blockPct >= 67) {
      out.push(
        `• FOV BLOCKED: ${blockPct}% of FOV rays hit a wall within 0.5 m — camera is facing into a wall. Rotate or move.`,
      );
    } else if (blockPct >= 34) {
      out.push(
        `• FOV partially blocked: ${blockPct}% of FOV rays hit a wall <0.5 m away — consider rotating.`,
      );
    } else {
      out.push(
        `• FOV facing: ${blockPct}% blocked by very-close walls — OK.`,
      );
    }

    // Camera redundancy — nearest other camera + crude position-overlap warning.
    let nearestOtherPx = Infinity;
    let nearestOtherId = "";
    for (const other of floor.devices) {
      if (other.id === d.id || other.type !== "camera") continue;
      const dist = Math.hypot(other.x - d.x, other.y - d.y);
      if (dist < nearestOtherPx) {
        nearestOtherPx = dist;
        nearestOtherId = other.id;
      }
    }
    if (Number.isFinite(nearestOtherPx)) {
      const otherM = nearestOtherPx / scale;
      if (otherM < 3) {
        out.push(
          `• Redundancy: nearest camera ${nearestOtherId} at ${otherM.toFixed(1)} m — likely overlapping coverage; consider removing one.`,
        );
      } else {
        out.push(
          `• Nearest other camera ${nearestOtherId} at ${otherM.toFixed(1)} m — OK.`,
        );
      }
    } else {
      out.push("• Only camera on the floor.");
    }
  }

  // ── Reader: distance to nearest door ──────────────────────────────────
  if (d.type === "reader") {
    let nearestDoorPx = Infinity;
    let nearestDoorId = "";
    for (const door of floor.doors) {
      const dist = Math.hypot(door.x - d.x, door.y - d.y);
      if (dist < nearestDoorPx) {
        nearestDoorPx = dist;
        nearestDoorId = door.id;
      }
    }
    if (!Number.isFinite(nearestDoorPx)) {
      out.push(
        "• PROBLEM: no doors on the floor — reader has nothing to control.",
      );
    } else {
      const doorM = nearestDoorPx / scale;
      if (doorM < 1.5) {
        out.push(
          `• ${doorM.toFixed(2)} m from door ${nearestDoorId} — OK (readers mount within ~1 m of the door).`,
        );
      } else if (doorM < 4) {
        out.push(
          `• ${doorM.toFixed(2)} m from nearest door (${nearestDoorId}) — typical is <1.5 m. Consider moving closer.`,
        );
      } else {
        out.push(
          `• PROBLEM: ${doorM.toFixed(1)} m from nearest door (${nearestDoorId}) — readers usually mount within 1.5 m of the door they control. Move or link explicitly.`,
        );
      }
    }
  }

  // ── Door-contact sensor: must sit on the door ─────────────────────────
  if (d.type === "sensor" && d.subtype === "door-contact") {
    let nearestDoorPx = Infinity;
    let nearestDoorId = "";
    for (const door of floor.doors) {
      const dist = Math.hypot(door.x - d.x, door.y - d.y);
      if (dist < nearestDoorPx) {
        nearestDoorPx = dist;
        nearestDoorId = door.id;
      }
    }
    if (!Number.isFinite(nearestDoorPx)) {
      out.push("• PROBLEM: no door to attach to — door-contact needs a door.");
    } else {
      const doorM = nearestDoorPx / scale;
      if (doorM < 0.5) {
        out.push(
          `• ON door ${nearestDoorId} (${doorM.toFixed(2)} m) — OK.`,
        );
      } else {
        out.push(
          `• PROBLEM: ${doorM.toFixed(2)} m from nearest door (${nearestDoorId}) — door-contact sensors must sit ON the door (<0.5 m). Move it.`,
        );
      }
    }
  }

  return out;
}

/** Block private RFC-1918 / loopback / link-local hosts so fetch_url
 *  can't be used to probe internal infrastructure. */
function isPrivateHost(host: string): boolean {
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  // Bare IPv6 — block everything in fc00::/7 (unique local) and fe80::/10 (link-local).
  if (/^fc[0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  return false;
}
