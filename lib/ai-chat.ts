import type { Device, Floor } from "@/types/design";
import { useDesignStore } from "@/lib/store";
import { computeQuote, type ExtraLineItem } from "@/lib/pricing";
import { planCabling } from "@/lib/cabling";

/** One message in the chat panel. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Operations Claude queued for this turn (assistant messages only). */
  operations?: ChatOperation[];
  /** Web-source citations Claude surfaced (assistant messages only). */
  citations?: Citation[];
  /** Number of distinct web searches Claude ran during this turn. */
  webSearches?: number;
}

export interface Citation {
  url: string;
  title?: string;
  cited_text?: string;
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
      wallId: string;
      x: number;
      y: number;
      rotationDegrees: number;
      widthMeters: number;
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
  | { kind: "view-from-camera"; deviceId: string }
  | {
      kind: "set-view-mode";
      viewMode: "2d" | "3d" | "sim";
      threeDMode?: "orbit" | "walk";
    };

/** Streaming callbacks the UI subscribes to. */
export interface ChatStreamHandlers {
  onTextDelta?: (delta: string) => void;
  onOperation?: (op: ChatOperation) => void;
  onWebSearch?: (query: string) => void;
  onWebSearchDone?: (count: number) => void;
  onCitation?: (citation: Citation) => void;
  onTurn?: (index: number) => void;
  onDone?: (summary: { usage: { inputTokens: number; outputTokens: number }; webSearches: number }) => void;
  onError?: (message: string) => void;
}

/**
 * Build the floor snapshot the chat endpoint expects.
 */
function summarizeFloorForChat(floor: Floor) {
  return {
    name: floor.name,
    scalePxPerMeter: floor.scale,
    ceilingHeightM: floor.ceilingHeight,
    walls: floor.walls.map((w) => ({
      id: w.id,
      startX: w.start.x,
      startY: w.start.y,
      endX: w.end.x,
      endY: w.end.y,
    })),
    devices: floor.devices.map((d) => {
      const subtype =
        d.type === "camera"
          ? d.cameraType
          : d.type === "reader"
            ? d.readerType
            : d.type === "sensor"
              ? d.sensorType
              : d.type === "network"
                ? d.networkType
                : undefined;
      const fovDegrees = d.type === "camera" ? d.fovDegrees : undefined;
      const rangeMeters =
        d.type === "camera"
          ? d.rangeMeters
          : d.type === "sensor"
            ? d.rangeMeters
            : undefined;
      return {
        id: d.id,
        type: d.type,
        subtype,
        label: d.label,
        x: d.position.x,
        y: d.position.y,
        rotationDegrees: (d.rotation * 180) / Math.PI,
        fovDegrees,
        rangeMeters,
        mountHeightM: d.mountHeight,
        installStatus: d.installStatus ?? "proposed",
      };
    }),
    doors: (floor.doors ?? []).map((d) => ({
      id: d.id,
      x: d.position.x,
      y: d.position.y,
      widthMeters: d.widthMeters,
      locked: d.locked,
      label: d.label,
    })),
    annotations: (floor.annotations ?? []).map((a) => ({
      id: a.id,
      x: a.position.x,
      y: a.position.y,
      text: a.text,
      kind: a.kind,
      author: a.author,
    })),
  };
}

/**
 * Stream a chat turn. Parses Server-Sent Events from /api/ai/chat and
 * dispatches them to the supplied handlers. Resolves when the server
 * sends `event: done` (or rejects on `event: error`).
 *
 * Supports cancellation via AbortSignal — the panel uses this for the
 * Stop button.
 */
export async function streamAIChat(args: {
  designName: string;
  buildingType?: string;
  floor: Floor;
  messages: { role: "user" | "assistant"; content: string }[];
  handlers: ChatStreamHandlers;
  signal?: AbortSignal;
}): Promise<void> {
  // Include the current quote shape — rates, client info, line items, AND
  // the live bill of materials with vendor + unit price — so Claude can
  // audit pricing, verify integration concerns across vendors, and edit
  // line items confidently without an extra query.
  const store = useDesignStore.getState();
  const q = store.quoteSettings;
  const cabling = planCabling(args.floor);
  const breakdown = computeQuote(args.floor, {
    ...q,
    autoCabling: {
      totalLengthM: cabling.totalLengthM,
      cameraRuns: cabling.cameraRuns,
      readerRuns: cabling.readerRuns,
    },
  });
  const floorWithQuote = {
    ...summarizeFloorForChat(args.floor),
    // Tell the agent which view the user is currently looking at so it
    // can decide whether to switch (e.g. flip to 3D before showing a
    // coverage gap, or back to 2D before mass-placing devices).
    viewMode: store.viewMode,
    threeDMode: store.threeDMode,
    cameraPovTargetId: store.cameraPovTargetId ?? undefined,
    quote: {
      clientName: q.clientName,
      projectLocation: q.projectLocation,
      laborRate: q.laborRate,
      markupPct: q.markupPct,
      taxPct: q.taxPct,
      extraLineItems: (q.extraLineItems ?? []).map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitCost: li.unitCost,
        category: li.category,
      })),
      bom: breakdown.rows.map((r) => ({
        modelId: r.modelId,
        displayName: r.displayName,
        vendor: r.vendor,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        subtotal: r.subtotal,
      })),
      hardwareSubtotal: breakdown.hardwareSubtotal,
      laborSubtotal: breakdown.laborSubtotal,
      grandTotal: breakdown.grandTotal,
    },
  };
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      designName: args.designName,
      buildingType: args.buildingType,
      floor: floorWithQuote,
      messages: args.messages,
    }),
    signal: args.signal,
  });

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string })?.error ??
        `Chat request failed (${res.status})`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let dataLines: string[] = [];

  // Parse SSE wire format. Spec: each event is a sequence of lines, ending
  // with a blank line. `event:` sets the type; `data:` lines concatenate
  // (newlines preserved). We dispatch on blank line.
  function flushEvent() {
    if (!event && dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    if (!data) {
      event = "";
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      event = "";
      return;
    }
    const h = args.handlers;
    switch (event) {
      case "text":
        h.onTextDelta?.((parsed as { delta: string }).delta);
        break;
      case "operation":
        h.onOperation?.(parsed as ChatOperation);
        break;
      case "web_search":
        h.onWebSearch?.((parsed as { query: string }).query);
        break;
      case "web_search_done":
        h.onWebSearchDone?.((parsed as { count: number }).count);
        break;
      case "citation":
        h.onCitation?.(parsed as Citation);
        break;
      case "turn":
        h.onTurn?.((parsed as { index: number }).index);
        break;
      case "done":
        h.onDone?.(
          parsed as {
            usage: { inputTokens: number; outputTokens: number };
            webSearches: number;
          },
        );
        break;
      case "error":
        h.onError?.((parsed as { message: string }).message);
        break;
    }
    event = "";
  }

  // Read until done or aborted.
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // Flush any trailing event without a blank line terminator.
      flushEvent();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line === "") {
        flushEvent();
      } else if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      } else if (line.startsWith(":")) {
        // SSE comment — heartbeat or padding, ignore.
      }
    }
  }
}

/**
 * Apply a single operation to the active floor in the global store.
 *
 * Errors are swallowed silently — the worst case is "Claude tried to move
 * a device id that doesn't exist", which we'd rather skip than throw.
 */
export function applyChatOperation(floorId: string, op: ChatOperation): boolean {
  const store = useDesignStore.getState();
  const design = store.currentDesignId
    ? store.designs[store.currentDesignId]
    : null;
  const floor = design?.floors.find((f) => f.id === floorId);
  if (!floor) return false;

  try {
    if (op.kind === "add-device") {
      const created = store.addDevice(floorId, op.deviceType, {
        x: op.x,
        y: op.y,
      });
      if (!created) return false;
      const partial: Partial<Device> = {
        label: op.label,
        rotation: (op.rotationDegrees * Math.PI) / 180,
      } as Partial<Device>;
      if (op.mountHeightM != null) partial.mountHeight = op.mountHeightM;
      if (op.notes) partial.notes = op.notes;
      if (op.subtype) {
        if (op.deviceType === "camera") {
          (partial as Partial<Extract<Device, { type: "camera" }>>).cameraType =
            op.subtype as never;
        } else if (op.deviceType === "reader") {
          (partial as Partial<Extract<Device, { type: "reader" }>>).readerType =
            op.subtype as never;
        } else if (op.deviceType === "sensor") {
          (partial as Partial<Extract<Device, { type: "sensor" }>>).sensorType =
            op.subtype as never;
        } else if (op.deviceType === "network") {
          (
            partial as Partial<Extract<Device, { type: "network" }>>
          ).networkType = op.subtype as never;
        }
      }
      if (op.deviceType === "camera") {
        if (op.fovDegrees != null) {
          (
            partial as Partial<Extract<Device, { type: "camera" }>>
          ).fovDegrees = op.fovDegrees;
        }
        if (op.rangeMeters != null) {
          (
            partial as Partial<Extract<Device, { type: "camera" }>>
          ).rangeMeters = op.rangeMeters;
        }
        // Optional brand + model — set when Claude synthesized this from
        // a user-named product not in our catalog. Shows in the BoM.
        if (op.model) {
          (partial as Partial<Extract<Device, { type: "camera" }>>).model =
            op.model;
        }
      } else if (op.deviceType === "sensor" && op.rangeMeters != null) {
        (
          partial as Partial<Extract<Device, { type: "sensor" }>>
        ).rangeMeters = op.rangeMeters;
      }
      store.updateDevice(floorId, created.id, partial);
      return true;
    }
    if (op.kind === "move-device") {
      store.updateDevice(floorId, op.deviceId, {
        position: { x: op.newX, y: op.newY },
      });
      return true;
    }
    if (op.kind === "rotate-device") {
      store.updateDevice(floorId, op.deviceId, {
        rotation: (op.newRotationDegrees * Math.PI) / 180,
      });
      return true;
    }
    if (op.kind === "remove-device") {
      store.removeDevice(floorId, op.deviceId);
      return true;
    }
    if (op.kind === "update-device") {
      const partial: Partial<Device> = {} as Partial<Device>;
      if (op.label !== undefined) partial.label = op.label;
      if (op.mountHeightM !== undefined) partial.mountHeight = op.mountHeightM;
      if (op.notes !== undefined) partial.notes = op.notes;
      if (op.installStatus !== undefined)
        partial.installStatus = op.installStatus;
      if (op.rangeMeters !== undefined) {
        (
          partial as Partial<Extract<Device, { type: "camera" }>>
        ).rangeMeters = op.rangeMeters;
      }
      if (op.fovDegrees !== undefined) {
        (
          partial as Partial<Extract<Device, { type: "camera" }>>
        ).fovDegrees = op.fovDegrees;
      }
      store.updateDevice(floorId, op.deviceId, partial);
      return true;
    }
    if (op.kind === "add-wall") {
      store.addWall(floorId, {
        start: { x: op.startX, y: op.startY },
        end: { x: op.endX, y: op.endY },
        height: floor.ceilingHeight,
      });
      return true;
    }
    if (op.kind === "remove-wall") {
      store.removeWall(floorId, op.wallId);
      return true;
    }
    if (op.kind === "add-door") {
      store.addDoor(floorId, {
        position: { x: op.x, y: op.y },
        rotation: (op.rotationDegrees * Math.PI) / 180,
        widthMeters: op.widthMeters,
        wallId: op.wallId,
        locked: op.locked,
        label: op.label,
        notes: "",
      });
      return true;
    }
    if (op.kind === "set-floor-scale") {
      store.updateFloor(floorId, { scale: op.scalePxPerMeter });
      return true;
    }
    if (op.kind === "add-annotation") {
      store.addAnnotation(floorId, {
        position: { x: op.x, y: op.y },
        text: op.text,
        kind: op.annotationKind,
        author: "ai",
      });
      return true;
    }
    if (op.kind === "remove-annotation") {
      store.removeAnnotation(floorId, op.annotationId);
      return true;
    }
    if (op.kind === "add-quote-line-item") {
      const li: ExtraLineItem = {
        description: op.description,
        quantity: op.quantity,
        unitCost: op.unitCost,
        category: op.category,
      };
      store.updateQuoteSettings({
        extraLineItems: [...(store.quoteSettings.extraLineItems ?? []), li],
      });
      return true;
    }
    if (op.kind === "remove-quote-line-item") {
      const items = store.quoteSettings.extraLineItems ?? [];
      if (op.index < 0 || op.index >= items.length) return false;
      const next = items.filter((_, i) => i !== op.index);
      store.updateQuoteSettings({ extraLineItems: next });
      return true;
    }
    if (op.kind === "view-from-camera") {
      const camera = floor.devices.find(
        (d) => d.id === op.deviceId && d.type === "camera",
      );
      if (!camera) return false;
      store.enterCameraPov(op.deviceId);
      return true;
    }
    if (op.kind === "set-view-mode") {
      // Switching INTO 3D from POV mode? Restore orbit so the user
      // doesn't get stuck in the prior camera's POV.
      if (op.viewMode !== "3d") {
        // POV doesn't apply outside 3D — clear it.
        if (store.cameraPovTargetId) store.exitCameraPov();
      }
      store.setViewMode(op.viewMode);
      if (op.viewMode === "3d" && op.threeDMode) {
        store.setThreeDMode(op.threeDMode);
      }
      return true;
    }
    if (op.kind === "update-quote-settings") {
      const partial: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(op)) {
        if (k !== "kind" && v !== undefined) partial[k] = v;
      }
      // Type-cast: the runtime shape matches Partial<QuoteSettings>.
      store.updateQuoteSettings(
        partial as unknown as Partial<typeof store.quoteSettings>,
      );
      return true;
    }
  } catch {
    /* skip individual op failures */
  }
  return false;
}

/**
 * Render a one-liner describing what an operation does, for the chip UI
 * under each assistant message.
 */
export function describeOperation(op: ChatOperation): string {
  switch (op.kind) {
    case "add-device":
      return `+ ${op.subtype ?? op.deviceType} "${op.label}"`;
    case "move-device":
      return `→ move ${op.deviceId}`;
    case "rotate-device":
      return `↻ ${op.deviceId} to ${op.newRotationDegrees.toFixed(0)}°`;
    case "remove-device":
      return `× remove ${op.deviceId}`;
    case "update-device": {
      const bits: string[] = [];
      if (op.label) bits.push(`label "${op.label}"`);
      if (op.rangeMeters != null) bits.push(`range ${op.rangeMeters} m`);
      if (op.fovDegrees != null) bits.push(`FOV ${op.fovDegrees}°`);
      if (op.mountHeightM != null) bits.push(`mount ${op.mountHeightM} m`);
      if (op.installStatus) bits.push(op.installStatus);
      return `✎ ${op.deviceId}${bits.length ? " · " + bits.join(", ") : ""}`;
    }
    case "add-wall":
      return `+ wall`;
    case "remove-wall":
      return `× wall ${op.wallId}`;
    case "add-door":
      return `+ door "${op.label}"`;
    case "set-floor-scale":
      return `↻ scale → ${op.scalePxPerMeter.toFixed(0)} px/m`;
    case "add-annotation":
      // Slightly longer truncation than before so most chip text reads
      // intelligibly in the chip itself. Full text is available via the
      // chip's `title` tooltip on hover.
      return `${op.annotationKind}: ${op.text.length > 70 ? op.text.slice(0, 70) + "…" : op.text}`;
    case "remove-annotation":
      return `× note ${op.annotationId}`;
    case "add-quote-line-item":
      return `+ quote: ${op.description} (${op.quantity} × $${op.unitCost})`;
    case "remove-quote-line-item":
      return `× quote line #${op.index + 1}`;
    case "view-from-camera":
      return `👁 POV ${op.deviceId}`;
    case "set-view-mode":
      return `→ ${op.viewMode.toUpperCase()}${op.threeDMode ? ` (${op.threeDMode})` : ""}`;
    case "update-quote-settings": {
      const bits: string[] = [];
      if (op.clientName) bits.push(`client "${op.clientName}"`);
      if (op.projectLocation) bits.push(`location "${op.projectLocation}"`);
      if (op.laborRate != null) bits.push(`labor $${op.laborRate}/hr`);
      if (op.markupPct != null) bits.push(`markup ${op.markupPct}%`);
      if (op.taxPct != null) bits.push(`tax ${op.taxPct}%`);
      if (op.brandColor) bits.push(`brand ${op.brandColor}`);
      if (op.regionalNotes) bits.push(`regional notes`);
      if (op.benchmark) bits.push(`benchmark`);
      if (op.narrative) bits.push(`narrative`);
      return `↻ quote: ${bits.join(", ") || "settings"}`;
    }
  }
}

/** Short hostname for a citation chip — "verkada.com" rather than the full URL. */
export function citationHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Compress a long conversation into a shorter one for the server so we
 * don't burn tokens replaying every old reply each turn.
 *
 *  - If `messages.length <= keepRecent + 2`, return as-is (no work).
 *  - Otherwise, keep the LAST `keepRecent` messages verbatim and replace
 *    every older message with a single synthetic user message that
 *    summarises what happened. The summary lists user-turn topics and
 *    every distinct operation kind the agent ran — enough for the agent
 *    to recall the gist without re-reading everything.
 *
 * The compressed array is sent to the server; the UI keeps the full
 * conversation displayed locally.
 */
export function trimHistoryForServer(
  messages: ChatMessage[],
  keepRecent = 14,
): { role: "user" | "assistant"; content: string }[] {
  if (messages.length <= keepRecent + 2) {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }
  const older = messages.slice(0, messages.length - keepRecent);
  const recent = messages.slice(messages.length - keepRecent);

  // Build a compact recap from the older slice.
  const userTopics: string[] = [];
  const opCounts: Record<string, number> = {};
  let webSearches = 0;
  let citationCount = 0;

  for (const m of older) {
    if (m.role === "user") {
      const first = m.content.split("\n")[0].trim();
      if (first) userTopics.push(first.length > 80 ? first.slice(0, 78) + "…" : first);
    }
    for (const op of m.operations ?? []) opCounts[op.kind] = (opCounts[op.kind] ?? 0) + 1;
    webSearches += m.webSearches ?? 0;
    citationCount += (m.citations ?? []).length;
  }

  const opSummary = Object.entries(opCounts)
    .map(([k, n]) => `${k} ×${n}`)
    .join(", ");

  const lines: string[] = [];
  lines.push(`[Conversation recap — ${older.length} earlier message(s) trimmed for token efficiency]`);
  if (userTopics.length > 0) {
    lines.push("Earlier asks from the user:");
    for (const t of userTopics.slice(-8)) lines.push(`  • ${t}`);
    if (userTopics.length > 8)
      lines.push(`  • (…and ${userTopics.length - 8} more)`);
  }
  if (opSummary) {
    lines.push(`Actions applied so far: ${opSummary}.`);
  }
  if (webSearches > 0) {
    lines.push(`Web searches run: ${webSearches} (citations: ${citationCount}).`);
  }
  lines.push(
    "[End recap — full conversation continues below. Use the current floor state as ground truth.]",
  );

  const recap: ChatMessage = {
    role: "user",
    content: lines.join("\n"),
  };
  return [recap, ...recent].map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Persist chat history per-design to localStorage so the conversation
 * survives reloads. We strip transient flags (`applied`) since they don't
 * need to round-trip.
 */
export function saveChatHistory(designId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    // Cap stored size at the last 200 messages — plenty of memory without
    // unbounded growth.
    const trimmed = messages.slice(-200);
    window.localStorage.setItem(
      `dv-chat-history:${designId}`,
      JSON.stringify(trimmed),
    );
  } catch {
    /* localStorage quota or disabled — silently ignore */
  }
}

export function loadChatHistory(designId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`dv-chat-history:${designId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ChatMessage[];
  } catch {
    return [];
  }
}

export function clearChatHistory(designId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`dv-chat-history:${designId}`);
  } catch {
    /* ignore */
  }
}
