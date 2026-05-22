"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Brain,
  Camera,
  DoorOpen,
  Eye,
  ExternalLink,
  Globe,
  ImagePlus,
  Lightbulb,
  Loader2,
  MapPin,
  MousePointer2,
  PencilRuler,
  Plus,
  Receipt,
  RotateCw,
  Ruler,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  TriangleAlert,
  Wand2,
  WandSparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveFloor, useCurrentDesign, useDesignStore } from "@/lib/store";
import {
  applyChatOperation,
  citationHost,
  clearChatHistory,
  describeOperation,
  loadChatHistory,
  saveChatHistory,
  streamAIChat,
  trimHistoryForServer,
  type ChatMessage,
  type ChatOperation,
  type Citation,
} from "@/lib/ai-chat";
import { InlineQuoteCard } from "./InlineQuoteCard";
import { cn } from "@/lib/utils";

/**
 * Embedded chat panel — lives inside the right sidebar as a tab.
 *
 * Streams Claude's reply token-by-token. As tool calls land, we apply them
 * to the store IMMEDIATELY (so the canvas updates in real time) AND ping
 * the AI-cursor overlay on the canvas with a labelled marker — "Placing
 * camera" / "Moving device" / "Searching the web" etc.
 *
 * Press Esc or click Stop to cancel an in-flight stream.
 */
export function AIChatPanel() {
  const design = useCurrentDesign();
  const floor = useActiveFloor();
  const pingAICursor = useDesignStore((s) => s.pingAICursor);
  const clearAICursor = useDesignStore((s) => s.clearAICursor);
  const setAISurveyOpen = useDesignStore((s) => s.setAISurveyOpen);
  const setAIAdvisorOpen = useDesignStore((s) => s.setAIAdvisorOpen);
  const setQuoteOpen = useDesignStore((s) => s.setQuoteOpen);

  // Hydrate from localStorage on first mount so the conversation survives
  // a page reload. Keyed by design id — switching designs gives a fresh chat.
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    design ? loadChatHistory(design.id) : [],
  );
  // When the design changes (e.g. user opens a different project), swap in
  // that design's saved history.
  useEffect(() => {
    if (!design) return;
    setMessages(loadChatHistory(design.id));
  }, [design?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Persist on every change.
  useEffect(() => {
    if (!design) return;
    saveChatHistory(design.id, messages);
  }, [design?.id, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * Live status for the busy indicator. Updates with each tool call so
   * the user sees the agent's narration in real time — "Searching the
   * web", "Placing camera", "Moving device", etc.
   */
  const [status, setStatus] = useState<{
    icon: StatusIcon;
    label: string;
  }>({ icon: "brain", label: "Thinking" });
  const [activeSearch, setActiveSearch] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom as text streams in.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, activeSearch]);

  // Esc cancels an in-flight request.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && busy && abortRef.current) {
        abortRef.current.abort();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  function stop() {
    abortRef.current?.abort();
  }

  /**
   * Translate an op into a (label, tone, position) tuple for the canvas
   * ping. We look at the most-recent floor state to resolve deviceIds back
   * to coordinates for move/rotate/remove/update ops.
   */
  function pingForOp(op: ChatOperation) {
    if (!floor) return;
    function devicePos(id: string): { x: number; y: number } | null {
      const d = floor!.devices.find((d) => d.id === id);
      return d ? { x: d.position.x, y: d.position.y } : null;
    }
    if (op.kind === "add-device") {
      pingAICursor({
        x: op.x,
        y: op.y,
        label: `Placing ${op.subtype ?? op.deviceType}`,
        tone: "add",
      });
      setStatus({ icon: "place", label: `Placing ${op.subtype ?? op.deviceType}` });
    } else if (op.kind === "move-device") {
      pingAICursor({
        x: op.newX,
        y: op.newY,
        label: "Moving device",
        tone: "move",
      });
      setStatus({ icon: "move", label: "Moving device" });
    } else if (op.kind === "rotate-device") {
      const pos = devicePos(op.deviceId);
      if (pos)
        pingAICursor({
          x: pos.x,
          y: pos.y,
          label: `Rotating to ${op.newRotationDegrees.toFixed(0)}°`,
          tone: "rotate",
        });
      setStatus({ icon: "rotate", label: "Rotating device" });
    } else if (op.kind === "remove-device") {
      const pos = devicePos(op.deviceId);
      if (pos)
        pingAICursor({ x: pos.x, y: pos.y, label: "Removing device", tone: "remove" });
      setStatus({ icon: "delete", label: "Removing device" });
    } else if (op.kind === "update-device") {
      const pos = devicePos(op.deviceId);
      if (pos) pingAICursor({ x: pos.x, y: pos.y, label: "Editing device", tone: "edit" });
      setStatus({ icon: "edit", label: "Editing device" });
    } else if (op.kind === "add-wall") {
      pingAICursor({
        x: (op.startX + op.endX) / 2,
        y: (op.startY + op.endY) / 2,
        label: "Drawing wall",
        tone: "wall",
      });
      setStatus({ icon: "wall", label: "Drawing wall" });
    } else if (op.kind === "remove-wall") {
      // No screen position handy without a wall lookup; just status.
      setStatus({ icon: "wall", label: "Removing wall" });
    } else if (op.kind === "add-door") {
      pingAICursor({ x: op.x, y: op.y, label: "Adding door", tone: "door" });
      setStatus({ icon: "door", label: "Adding door" });
    } else if (op.kind === "set-floor-scale") {
      setStatus({ icon: "calibrate", label: "Recalibrating scale" });
    } else if (op.kind === "add-annotation") {
      pingAICursor({
        x: op.x,
        y: op.y,
        label:
          op.annotationKind === "warning"
            ? "Flagging issue"
            : op.annotationKind === "idea"
              ? "Pinning idea"
              : "Pinning note",
        tone: "annotate",
      });
      setStatus({ icon: "annotate", label: "Pinning annotation" });
    } else if (op.kind === "remove-annotation") {
      setStatus({ icon: "annotate", label: "Removing annotation" });
    } else if (op.kind === "add-quote-line-item") {
      setStatus({ icon: "quote", label: "Updating quote" });
    } else if (op.kind === "remove-quote-line-item") {
      setStatus({ icon: "quote", label: "Removing quote line" });
    } else if (op.kind === "update-quote-settings") {
      setStatus({ icon: "quote", label: "Editing quote" });
    } else if (op.kind === "view-from-camera") {
      const pos = devicePos(op.deviceId);
      if (pos)
        pingAICursor({ x: pos.x, y: pos.y, label: "Showing POV", tone: "edit" });
      setStatus({ icon: "edit", label: "Switching to camera POV" });
    } else if (op.kind === "set-view-mode") {
      setStatus({
        icon: "edit",
        label: `Switching to ${op.viewMode.toUpperCase()}${op.threeDMode ? ` (${op.threeDMode})` : ""}`,
      });
    }
  }

  async function send(text: string) {
    if (!floor || !design || !text.trim() || busy) return;
    const trimmed = text.trim();
    const userMsg: ChatMessage = { role: "user", content: trimmed };

    const assistantSeed: ChatMessage = {
      role: "assistant",
      content: "",
      operations: [],
      citations: [],
      webSearches: 0,
    };
    setMessages((prev) => [...prev, userMsg, assistantSeed]);
    setInput("");
    setBusy(true);
    setActiveSearch(null);
    setStatus({ icon: "brain", label: "Thinking" });

    const abort = new AbortController();
    abortRef.current = abort;

    // Token-efficient memory: send a trimmed-and-recapped version of the
    // history (keeps last ~14 messages verbatim, replaces older ones with
    // a compact bullet recap). The UI still shows the full conversation
    // locally from `messages`.
    const historyForServer = trimHistoryForServer([...messages, userMsg], 14);

    const opsApplied: ChatOperation[] = [];

    try {
      await streamAIChat({
        designName: design.name,
        floor,
        messages: historyForServer,
        signal: abort.signal,
        handlers: {
          onTextDelta(delta) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + delta };
              }
              return next;
            });
          },
          onOperation(op) {
            pingForOp(op);
            const ok = applyChatOperation(floor.id, op);
            if (ok) opsApplied.push(op);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  operations: [...(last.operations ?? []), op],
                };
              }
              return next;
            });
            // Clear the cursor ping shortly after — long enough for the
            // ring animation to play but short enough that successive ops
            // each get their own ping.
            setTimeout(() => clearAICursor(), 900);
          },
          onWebSearch(query) {
            setActiveSearch(query);
            setStatus({ icon: "search", label: "Searching the web" });
          },
          onWebSearchDone() {
            setActiveSearch(null);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  webSearches: (last.webSearches ?? 0) + 1,
                };
              }
              return next;
            });
          },
          onCitation(c) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                const existing = last.citations ?? [];
                if (existing.some((e) => e.url === c.url)) return prev;
                next[next.length - 1] = { ...last, citations: [...existing, c] };
              }
              return next;
            });
          },
          onTurn() {
            setStatus({ icon: "brain", label: "Thinking" });
          },
          onError(message) {
            toast.error("Chat failed", { description: message });
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant" && !last.content) {
                next[next.length - 1] = { ...last, content: `⚠️ ${message}` };
              }
              return next;
            });
          },
        },
      });

      if (opsApplied.length > 0) {
        const summary =
          opsApplied.length === 1 ? "1 edit" : `${opsApplied.length} edits`;
        toast.success(`Applied ${summary}`);
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content:
                (last.content || "") +
                (last.content ? "\n\n" : "") +
                "— stopped —",
            };
          }
          return next;
        });
      } else {
        toast.error("Chat failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setBusy(false);
      setActiveSearch(null);
      clearAICursor();
      abortRef.current = null;
    }
  }

  function clear() {
    if (busy) stop();
    setMessages([]);
    if (design) clearChatHistory(design.id);
  }

  return (
    <div className="flex h-full w-full flex-col bg-sidebar">
      {/* Subheader with title + Clear */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-[0.82rem] font-medium tracking-[-0.005em] text-foreground/90">
          <span className="relative flex size-5 items-center justify-center">
            <Sparkles className="size-3.5 text-primary" strokeWidth={2} />
          </span>
          AI editor
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clear}
              title="Clear conversation"
              className="rounded-md px-1.5 py-0.5 text-[0.7rem] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Live quote summary card — pricing, totals, and a "Print quote"
          button live INSIDE the chat so the user can discuss costs with
          the agent without switching tabs. */}
      <InlineQuoteCard onOpenFullQuote={() => setQuoteOpen(true)} />

      {/* Conversation */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && !busy && (
          <EmptyState
            onPick={(prompt) => send(prompt)}
            onOpenSurvey={() => setAISurveyOpen(true)}
            onOpenAdvisor={() => setAIAdvisorOpen(true)}
          />
        )}

        {messages.map((m, i) => (
          <ChatBubble key={i} msg={m} />
        ))}

        {busy && (
          <BusyStatus
            status={status}
            activeSearch={activeSearch}
          />
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/70 bg-background/30 p-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-2.5 py-1.5 shadow-[inset_0_1px_0_oklch(1_0_0/3%)] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-colors"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={
              floor && floor.devices.length === 0
                ? 'Try: "Add a dome camera at the front door"'
                : "Ask, search, edit…"
            }
            className="min-h-[20px] max-h-[120px] flex-1 resize-none bg-transparent text-[0.82rem] leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              title="Stop (Esc)"
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-rose-500 text-white transition-opacity hover:opacity-90"
              aria-label="Stop"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !floor}
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-30"
              aria-label="Send"
            >
              <ArrowUp className="size-3.5" strokeWidth={2.4} />
            </button>
          )}
        </form>
        <div className="mt-1 px-1 text-[0.62rem] text-muted-foreground/70">
          Enter to send · Shift+Enter newline · Esc to stop
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EmptyState({
  onPick,
  onOpenSurvey,
  onOpenAdvisor,
}: {
  onPick: (prompt: string) => void;
  onOpenSurvey: () => void;
  onOpenAdvisor: () => void;
}) {
  // Three hero starters that span the agent's range: audit, research,
  // suggestion. Specific enough to be useful, generic enough to not look
  // like the only thing the chat can do.
  const starters = [
    {
      icon: <Wand2 className="size-3.5 text-amber-500" strokeWidth={1.8} />,
      text: "Critique my current layout — what's missing?",
    },
    {
      icon: <Globe className="size-3.5 text-sky-500" strokeWidth={1.8} />,
      text: "Find a 4K dome camera under $300 and add 4 of them.",
    },
    {
      icon: <Lightbulb className="size-3.5 text-violet-500" strokeWidth={1.8} />,
      text: "Suggest where I should put cameras in the conference room.",
    },
  ];
  const moreIdeas = [
    {
      icon: <Camera className="size-3.5" strokeWidth={1.8} />,
      text: "Add a dome camera at every corner of the largest room.",
    },
    {
      icon: <MousePointer2 className="size-3.5 text-indigo-500" strokeWidth={1.8} />,
      text: "Move the lobby camera so it faces the front door.",
    },
    {
      icon: <Receipt className="size-3.5 text-teal-500" strokeWidth={1.8} />,
      text: "Look up local permit costs and add them to my quote.",
    },
    {
      icon: <StickyNote className="size-3.5 text-yellow-500" strokeWidth={1.8} />,
      text: "Pin a warning at every door without a reader.",
    },
    {
      icon: <Plus className="size-3.5 text-emerald-500" strokeWidth={1.8} />,
      text: "Cover every door with a motion sensor.",
    },
    {
      icon: <Eye className="size-3.5 text-rose-500" strokeWidth={1.8} />,
      text: "Show me the POV of the front-door camera.",
    },
  ];
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4 pt-4 px-1 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/20" />
        <div className="relative flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-[0.9rem] font-medium tracking-[-0.01em]">
          What should we change?
        </div>
        <div className="mx-auto max-w-[20rem] text-[0.72rem] text-muted-foreground leading-relaxed">
          I can add, move, rotate, remove devices — and search the web for
          product specs or pricing.
        </div>
      </div>
      <div className="grid w-full gap-1.5">
        {starters.map((s, i) => (
          <SuggestionChip
            key={i}
            icon={s.icon}
            text={s.text}
            onPick={onPick}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        className="-mt-1 inline-flex items-center gap-1 text-[0.7rem] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {moreOpen ? "Hide ideas" : "More ideas"}
        <span className="opacity-60">{moreOpen ? "▴" : "▾"}</span>
      </button>

      {moreOpen && (
        <div className="grid w-full gap-1.5">
          {moreIdeas.map((s, i) => (
            <SuggestionChip
              key={i}
              icon={s.icon}
              text={s.text}
              onPick={onPick}
            />
          ))}
        </div>
      )}

      <div className="mt-1 grid w-full grid-cols-2 gap-1.5 border-t border-border/40 pt-3">
        <button
          type="button"
          onClick={onOpenSurvey}
          title="Generate walls from a floor-plan image"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2 py-2 text-[0.7rem] text-foreground/80 hover:border-primary/40 hover:bg-primary/[0.04] transition-colors"
        >
          <ImagePlus className="size-3.5 text-sky-500" strokeWidth={1.9} />
          From plan image
        </button>
        <button
          type="button"
          onClick={onOpenAdvisor}
          title="Run a coverage analysis on the current design"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2 py-2 text-[0.7rem] text-foreground/80 hover:border-primary/40 hover:bg-primary/[0.04] transition-colors"
        >
          <ShieldCheck className="size-3.5 text-emerald-500" strokeWidth={1.9} />
          Analyze coverage
        </button>
      </div>
    </div>
  );
}

function SuggestionChip({
  icon,
  text,
  onPick,
}: {
  icon: React.ReactNode;
  text: string;
  onPick: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(text)}
      className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 text-left text-[0.74rem] text-foreground/85 hover:border-primary/40 hover:bg-primary/[0.04] transition-colors"
    >
      <span className="mt-0.5 text-primary/80">{icon}</span>
      <span>{text}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Animated status block shown while a request is streaming. Composed of a
 * primary status pill (Thinking / Searching / Placing / …) and an
 * optional secondary line for the active web-search query.
 */
function BusyStatus({
  status,
  activeSearch,
}: {
  status: { icon: StatusIcon; label: string };
  activeSearch: string | null;
}) {
  const tone = STATUS_TONE[status.icon];
  const Icon = tone.Icon;
  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      <div
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] ring-1",
          tone.pill,
        )}
      >
        <Icon className="size-3 animate-pulse" strokeWidth={2.4} />
        <span className="font-medium">{status.label}…</span>
      </div>
      {activeSearch && (
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.68rem] text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/25">
          <Globe className="size-2.5" />
          <span className="truncate max-w-[220px]">
            <span className="text-sky-700/70 dark:text-sky-300/70">query:</span>{" "}
            {activeSearch}
          </span>
        </div>
      )}
      <div className="flex items-center gap-1 px-1 text-[0.65rem] text-muted-foreground">
        <Loader2 className="size-2.5 animate-spin" />
        <span>working…</span>
      </div>
    </div>
  );
}

/**
 * One row per agent action — pairs a Lucide icon with a colored pill class
 * so each status surface (BusyStatus, OperationChip, AICursorOverlay) can
 * paint itself the same way.
 */
type StatusIcon =
  | "brain"
  | "search"
  | "place"
  | "move"
  | "rotate"
  | "delete"
  | "edit"
  | "wall"
  | "door"
  | "annotate"
  | "quote"
  | "calibrate";

const STATUS_TONE: Record<
  StatusIcon,
  { pill: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }
> = {
  brain: { pill: "bg-primary/10 text-primary ring-primary/25", Icon: Brain },
  search: {
    pill: "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/30",
    Icon: Search,
  },
  place: {
    pill: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
    Icon: MapPin,
  },
  move: {
    pill: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 ring-indigo-500/30",
    Icon: MousePointer2,
  },
  rotate: {
    pill: "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/30",
    Icon: RotateCw,
  },
  delete: {
    pill: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/30",
    Icon: Trash2,
  },
  edit: {
    pill: "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/30",
    Icon: WandSparkles,
  },
  wall: {
    pill: "bg-emerald-600/12 text-emerald-700 dark:text-emerald-300 ring-emerald-600/30",
    Icon: PencilRuler,
  },
  door: {
    pill: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 ring-cyan-500/30",
    Icon: DoorOpen,
  },
  annotate: {
    pill: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 ring-yellow-500/30",
    Icon: StickyNote,
  },
  quote: {
    pill: "bg-teal-500/12 text-teal-700 dark:text-teal-300 ring-teal-500/30",
    Icon: Receipt,
  },
  calibrate: {
    pill: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-500/30",
    Icon: Ruler,
  },
};

/* -------------------------------------------------------------------------- */

function ChatBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    // Premium dark bubble — `foreground/background` swaps automatically in
    // light vs dark themes for a tasteful inverted look.
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-foreground px-2.5 py-1.5 text-[0.8rem] leading-relaxed text-background shadow-[0_2px_8px_-3px_oklch(0_0_0/35%)]">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-full gap-1.5">
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Sparkles className="size-2.5" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {msg.content && (
            <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card/60 px-2.5 py-1.5 text-[0.8rem] leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {renderInlineMarkdown(msg.content)}
            </div>
          )}
          {msg.webSearches != null && msg.webSearches > 0 && (
            <div className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/25">
              <Globe className="size-2.5" strokeWidth={2.4} />
              {msg.webSearches} web search{msg.webSearches === 1 ? "" : "es"}
            </div>
          )}
          {msg.citations && msg.citations.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {msg.citations.map((c, i) => (
                <CitationChip key={i} citation={c} />
              ))}
            </div>
          )}
          {msg.operations && msg.operations.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {msg.operations.map((op, i) => (
                <OperationChip key={i} op={op} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OperationChip({ op }: { op: ChatOperation }) {
  const text = describeOperation(op);
  const fullText = fullOperationDescription(op);
  const { tone, Icon } = chipStyleFor(op);
  return (
    <span
      title={fullText}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-medium ring-1",
        tone,
      )}
    >
      <Icon className="size-2.5 shrink-0" strokeWidth={2.4} />
      <span className="truncate">{text}</span>
    </span>
  );
}

/**
 * Long-form description for an operation — used as the chip's `title`
 * tooltip so the user can hover and read the whole annotation text,
 * device id, etc. without us bloating the visible chip.
 */
function fullOperationDescription(op: ChatOperation): string {
  switch (op.kind) {
    case "add-annotation":
      return `${op.annotationKind}: ${op.text}`;
    case "update-device":
      return JSON.stringify(op, null, 2);
    case "add-quote-line-item":
      return `Add ${op.quantity} × ${op.description} @ $${op.unitCost} (${op.category})`;
    default:
      return describeOperation(op);
  }
}

/**
 * Minimal inline-markdown renderer for assistant text. Handles the two
 * formats Claude actually uses in this chat:
 *   • **bold**   → <strong>
 *   • `code`     → <code>
 * Anything else passes through as plain text. Avoids pulling in a
 * full markdown lib for what's effectively two regexes.
 */
function renderInlineMarkdown(input: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Match one of: **bold** | `code`
  const re = /\*\*([^*\n][^*]*?)\*\*|`([^`\n]+?)`/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push(input.slice(last, m.index));
    if (m[1] != null) {
      out.push(
        <strong key={key++} className="font-semibold">
          {m[1]}
        </strong>,
      );
    } else if (m[2] != null) {
      out.push(
        <code
          key={key++}
          className="rounded bg-foreground/[0.07] px-1 py-px font-mono text-[0.78em]"
        >
          {m[2]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push(input.slice(last));
  return out;
}

/**
 * Per-operation chip style — each tool gets a unique color + Lucide icon
 * so the user can read at a glance what kind of edit just landed.
 *  add-device       → emerald + Plus
 *  remove-device    → rose + Trash
 *  move-device      → indigo + MousePointer2
 *  rotate-device    → violet + RotateCw
 *  update-device    → amber + WandSparkles (the "pencil")
 *  add-wall         → emerald (darker) + PencilRuler
 *  remove-wall      → rose + Trash
 *  add-door         → cyan + DoorOpen
 *  set-floor-scale  → fuchsia + Ruler
 *  add-annotation   → yellow + StickyNote (or warning/idea variants)
 *  remove-anno      → rose + StickyNote-strike
 *  add-quote-line   → teal + Receipt
 *  remove-quote     → rose + Receipt
 *  update-quote     → teal + Receipt
 */
function chipStyleFor(op: ChatOperation): {
  tone: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
} {
  switch (op.kind) {
    case "add-device":
      return {
        tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
        Icon: Plus,
      };
    case "remove-device":
    case "remove-wall":
      return {
        tone: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25",
        Icon: Trash2,
      };
    case "move-device":
      return {
        tone: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 ring-indigo-500/25",
        Icon: MousePointer2,
      };
    case "rotate-device":
      return {
        tone: "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25",
        Icon: RotateCw,
      };
    case "update-device":
      return {
        tone: "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25",
        Icon: WandSparkles,
      };
    case "add-wall":
      return {
        tone: "bg-emerald-600/12 text-emerald-700 dark:text-emerald-300 ring-emerald-600/30",
        Icon: PencilRuler,
      };
    case "add-door":
      return {
        tone: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 ring-cyan-500/25",
        Icon: DoorOpen,
      };
    case "set-floor-scale":
      return {
        tone: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-500/25",
        Icon: Ruler,
      };
    case "add-annotation":
      return {
        tone:
          op.annotationKind === "warning"
            ? "bg-orange-500/12 text-orange-700 dark:text-orange-300 ring-orange-500/30"
            : op.annotationKind === "idea"
              ? "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/30"
              : "bg-yellow-500/15 text-yellow-800 dark:text-yellow-200 ring-yellow-500/30",
        Icon:
          op.annotationKind === "warning"
            ? TriangleAlert
            : op.annotationKind === "idea"
              ? Lightbulb
              : StickyNote,
      };
    case "remove-annotation":
      return {
        tone: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25",
        Icon: StickyNote,
      };
    case "add-quote-line-item":
    case "update-quote-settings":
      return {
        tone: "bg-teal-500/12 text-teal-700 dark:text-teal-300 ring-teal-500/25",
        Icon: Receipt,
      };
    case "remove-quote-line-item":
      return {
        tone: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25",
        Icon: Receipt,
      };
    case "view-from-camera":
      return {
        tone: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25",
        Icon: Eye,
      };
    case "set-view-mode":
      return {
        tone: "bg-foreground/[0.07] text-foreground/85 ring-foreground/15",
        Icon: Sparkles,
      };
    default:
      return {
        tone: "bg-foreground/[0.06] text-foreground/80 ring-foreground/15",
        Icon: Zap,
      };
  }
}

function CitationChip({ citation }: { citation: Citation }) {
  const host = citationHost(citation.url);
  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      title={citation.title ?? citation.url}
      className="inline-flex max-w-[220px] items-center gap-1 rounded-md bg-foreground/[0.04] px-1.5 py-0.5 text-[0.66rem] font-medium text-foreground/75 ring-1 ring-foreground/15 hover:bg-foreground/[0.08] hover:text-foreground transition-colors"
    >
      <Globe className="size-2.5 shrink-0 text-sky-500" strokeWidth={2.4} />
      <span className="truncate">{host}</span>
      <ExternalLink className="size-2 shrink-0 opacity-60" strokeWidth={2.4} />
    </a>
  );
}

