import Anthropic from "@anthropic-ai/sdk";
import type {
  AdvisorFinding,
  AdvisorResponse,
  FindingKind,
  FindingSeverity,
  SuggestedAction,
} from "./ai-advisor";

/**
 * Server-side runner for the AI Coverage Advisor.
 *
 * Pulled out of the /api/ai/advisor route so the chat agent's `run_advisor`
 * tool can invoke the same logic in-process — no extra HTTP hop, no double
 * JSON serialization. The advisor route is now a thin wrapper.
 */

const MODEL = "claude-sonnet-4-5";

export interface AdvisorRequestBody {
  designName: string;
  floor: {
    name: string;
    scalePxPerMeter: number;
    ceilingHeightM: number;
    walls: { startX: number; startY: number; endX: number; endY: number }[];
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
  };
  buildingType?: string;
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "report_finding",
    description:
      "Add one finding to the coverage analysis punch list. Call this for every meaningful issue or improvement you can identify. Be specific about location (in image pixels) and concrete about the suggested fix.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "blind-spot",
            "redundant-coverage",
            "missing-entry-coverage",
            "missing-sensor",
            "missing-network",
            "compliance",
            "improvement",
          ],
        },
        severity: {
          type: "string",
          enum: ["critical", "warning", "suggestion"],
          description:
            "critical = security gap (entry uncovered, blind hallway, missing NVR); warning = meaningful issue (heavy FOV overlap, weak coverage); suggestion = nice-to-have improvement.",
        },
        title: {
          type: "string",
          description:
            "Short headline, e.g. 'Front entry uncovered' or 'Cameras 3 and 7 overlap by 78%'.",
        },
        description: {
          type: "string",
          description:
            "One or two sentences explaining the problem and why it matters.",
        },
        locationX: {
          type: "number",
          description: "X pixel coord (floor-plan space) of the issue. Optional.",
        },
        locationY: {
          type: "number",
          description: "Y pixel coord of the issue. Optional.",
        },
        action: {
          type: "object",
          description: "The fix you recommend. Pick ONE action shape.",
          properties: {
            kind: {
              type: "string",
              enum: [
                "add-device",
                "remove-device",
                "rotate-device",
                "move-device",
                "manual-review",
              ],
            },
            deviceType: {
              type: "string",
              enum: ["camera", "reader", "sensor", "network"],
              description:
                "Required if kind = add-device. Use 'camera' for FOV gaps, 'sensor' for motion/glass-break, 'network' for missing NVR/AP.",
            },
            subtype: {
              type: "string",
              description:
                "Specific subtype (dome, bullet, motion, glass-break, access-point, nvr, etc.). Required for add-device.",
            },
            x: { type: "number", description: "For add-device: x in pixels." },
            y: { type: "number", description: "For add-device: y in pixels." },
            rotationDegrees: {
              type: "number",
              description: "For add-device or rotate-device.",
            },
            label: {
              type: "string",
              description: "For add-device: short human label.",
            },
            newRotationDegrees: {
              type: "number",
              description: "For rotate-device: target rotation in degrees.",
            },
            newX: { type: "number", description: "For move-device." },
            newY: { type: "number", description: "For move-device." },
            deviceId: {
              type: "string",
              description: "For remove/rotate/move: the device id from the input.",
            },
            rationale: {
              type: "string",
              description:
                "One sentence why this fix solves the finding.",
            },
          },
          required: ["kind", "rationale"],
        },
      },
      required: ["kind", "severity", "title", "description", "action"],
    },
  },
  {
    name: "finalize",
    description:
      "Call this last to summarize the overall coverage analysis (1-2 sentences).",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
  },
];

const SYSTEM_PROMPT = `You are a senior physical-security designer reviewing a security-system layout for DeeperVision. Your job: produce a sharp, actionable punch list of design gaps and improvements.

Look for:
1. BLIND SPOTS — areas in the floor plan with no camera FOV coverage, particularly:
   • Entry/exit doors (gaps in exterior walls)
   • Long hallways and corridors
   • Rooms with valuables / sensitive equipment (server rooms, etc.)
   • Areas behind walls that block existing cameras' line of sight

2. REDUNDANT COVERAGE — cameras whose FOVs overlap by more than 60%. Recommend removing or repurposing one.

3. MISSING SENSORS — perimeter doors without door-contact sensors; large rooms without motion detection; windows in sensitive areas without glass-break.

4. MISSING NETWORK — if no NVR or no access-point is on the floor, that's a problem.

5. COMPLIANCE — when buildingType is given, check the obvious industry rules:
   • Healthcare: cameras at every PHI access point, no cameras in patient rooms
   • Retail: cameras at every register and emergency exit
   • Education: cameras at every entry, common area, and main hallway
   • Warehouse: perimeter and dock-door coverage

For every finding, call report_finding with:
   • A precise severity (critical/warning/suggestion)
   • A short, scannable title
   • A 1-2 sentence description
   • The (x,y) pixel location when point-specific
   • A concrete suggestedAction (add-device with type+subtype+coords, OR remove/rotate/move an existing device)

When recommending add-device coordinates, pick a realistic install location (wall corners, near doors, ceiling-mounted in the middle of a room) and give the rotation in degrees (0=east, 90=south, 180=west, 270=north).

Don't pad the list. Report only what's genuinely useful — a strong design might have only 2-3 findings.

Finish with a one-line summary via finalize.`;

/**
 * Run the AI Coverage Advisor against a floor and return its findings.
 * Used by both the /api/ai/advisor route and the chat agent's run_advisor tool.
 */
export async function runAdvisorAgent(
  client: Anthropic,
  body: AdvisorRequestBody,
): Promise<AdvisorResponse> {
  const userText = formatFloorForAdvisor(body);
  const findings: AdvisorFinding[] = [];
  let summary = "";
  const usage = { inputTokens: 0, outputTokens: 0 };

  let messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userText },
  ];

  for (let turn = 0; turn < 8; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;

    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );

    for (const tool of toolUses) {
      const input = tool.input as Record<string, unknown>;
      if (tool.name === "report_finding") {
        const action = input.action as Record<string, unknown>;
        findings.push({
          id: `f_${findings.length + 1}`,
          kind: input.kind as FindingKind,
          severity: input.severity as FindingSeverity,
          title: typeof input.title === "string" ? input.title : "Finding",
          description:
            typeof input.description === "string" ? input.description : "",
          location:
            typeof input.locationX === "number" &&
            typeof input.locationY === "number"
              ? { x: Number(input.locationX), y: Number(input.locationY) }
              : undefined,
          suggestedAction: buildAction(action),
        });
      } else if (tool.name === "finalize") {
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

  return { summary, findings, usage };
}

function formatFloorForAdvisor(body: AdvisorRequestBody): string {
  const { floor, buildingType } = body;
  const lines: string[] = [];
  lines.push(`Design: ${body.designName}`);
  lines.push(`Floor: ${floor.name}`);
  if (buildingType) lines.push(`Building type: ${buildingType}`);
  lines.push(
    `Scale: ${floor.scalePxPerMeter} pixels per meter (so 100 px = ${(100 / floor.scalePxPerMeter).toFixed(1)} m)`,
  );
  lines.push(`Ceiling height: ${floor.ceilingHeightM.toFixed(1)} m`);
  lines.push("");

  lines.push(
    `Walls (${floor.walls.length}) — each is a line segment from (startX, startY) to (endX, endY) in pixels:`,
  );
  for (const w of floor.walls) {
    lines.push(
      `  (${w.startX.toFixed(0)},${w.startY.toFixed(0)}) → (${w.endX.toFixed(0)},${w.endY.toFixed(0)})`,
    );
  }
  lines.push("");

  lines.push(`Devices (${floor.devices.length}):`);
  for (const d of floor.devices) {
    const where = `(${d.x.toFixed(0)},${d.y.toFixed(0)})`;
    const rot = `${d.rotationDegrees.toFixed(0)}°`;
    const fov = d.fovDegrees != null ? ` · ${d.fovDegrees}° FOV` : "";
    const range = d.rangeMeters != null ? ` · ${d.rangeMeters} m range` : "";
    const subtype = d.subtype ? ` ${d.subtype}` : "";
    lines.push(
      `  [${d.id}] ${d.type}${subtype} "${d.label}" @ ${where} rot ${rot}${fov}${range} · mount ${d.mountHeightM} m · status ${d.installStatus}`,
    );
  }
  lines.push("");
  lines.push(
    "Identify the most useful findings (blind spots, redundancies, missing sensors/network, compliance gaps) and call report_finding for each. Pixel coordinates use top-left origin, X right, Y down.",
  );
  return lines.join("\n");
}

function buildAction(action: Record<string, unknown>): SuggestedAction {
  const kind = action.kind as string;
  const rationale =
    typeof action.rationale === "string" ? action.rationale : "";
  if (kind === "add-device") {
    return {
      kind: "add-device",
      deviceType:
        (action.deviceType as "camera" | "reader" | "sensor" | "network") ??
        "camera",
      subtype: typeof action.subtype === "string" ? action.subtype : undefined,
      x: Number(action.x) || 0,
      y: Number(action.y) || 0,
      rotationDegrees: Number(action.rotationDegrees) || 0,
      label:
        typeof action.label === "string" && action.label.trim()
          ? action.label.trim()
          : "Recommended device",
      rationale,
    };
  }
  if (kind === "remove-device") {
    return {
      kind: "remove-device",
      deviceId: typeof action.deviceId === "string" ? action.deviceId : "",
      rationale,
    };
  }
  if (kind === "rotate-device") {
    return {
      kind: "rotate-device",
      deviceId: typeof action.deviceId === "string" ? action.deviceId : "",
      newRotationDegrees: Number(action.newRotationDegrees) || 0,
      rationale,
    };
  }
  if (kind === "move-device") {
    return {
      kind: "move-device",
      deviceId: typeof action.deviceId === "string" ? action.deviceId : "",
      newX: Number(action.newX) || 0,
      newY: Number(action.newY) || 0,
      rationale,
    };
  }
  return { kind: "manual-review", rationale };
}
