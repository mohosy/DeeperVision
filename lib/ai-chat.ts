import type { Device, Floor } from "@/types/design";
import { useDesignStore } from "@/lib/store";

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
  | { kind: "set-floor-scale"; scalePxPerMeter: number };

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
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      designName: args.designName,
      buildingType: args.buildingType,
      floor: summarizeFloorForChat(args.floor),
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
