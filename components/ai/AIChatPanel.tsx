"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Camera,
  ExternalLink,
  Globe,
  Loader2,
  MessageSquareText,
  Move,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveFloor, useCurrentDesign } from "@/lib/store";
import {
  applyChatOperation,
  citationHost,
  describeOperation,
  streamAIChat,
  type ChatMessage,
  type ChatOperation,
  type Citation,
} from "@/lib/ai-chat";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Right-side chat drawer — "Cursor for floor plans".
 *
 * Streams Claude's reply token-by-token. As tool calls land, we apply them
 * to the store IMMEDIATELY so the canvas updates in real time. The user
 * sees: text streaming, a "🔍 searching the web…" pill while web_search
 * is in flight, citation chips after web answers, and a green operation
 * chip for each canvas edit.
 *
 * Press Esc or click Stop to cancel an in-flight stream.
 */
export function AIChatPanel({ open, onClose }: Props) {
  const design = useCurrentDesign();
  const floor = useActiveFloor();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  /** Web-search query currently in flight, if any. */
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

  // Focus the input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Esc cancels an in-flight request.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && busy && abortRef.current) {
        abortRef.current.abort();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function stop() {
    abortRef.current?.abort();
  }

  async function send(text: string) {
    if (!floor || !design || !text.trim() || busy) return;
    const trimmed = text.trim();
    const userMsg: ChatMessage = { role: "user", content: trimmed };

    // Seed an empty assistant message we'll mutate as text/operations stream in.
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

    const abort = new AbortController();
    abortRef.current = abort;

    // We capture the conversation snapshot here (with user msg appended)
    // so the server-side floor injection lines up with the last user turn.
    const historyForServer = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
            // Apply against whatever floor id was active when the stream started.
            // (Floor switching mid-stream is rare but harmless — we'd just
            // no-op against a stale id.)
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
          },
          onWebSearch(query) {
            setActiveSearch(query);
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
                // De-dup by URL so the same source only shows once per turn.
                const existing = last.citations ?? [];
                if (existing.some((e) => e.url === c.url)) return prev;
                next[next.length - 1] = {
                  ...last,
                  citations: [...existing, c],
                };
              }
              return next;
            });
          },
          onError(message) {
            toast.error("Chat failed", { description: message });
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant" && !last.content) {
                next[next.length - 1] = {
                  ...last,
                  content: `⚠️ ${message}`,
                };
              }
              return next;
            });
          },
        },
      });

      if (opsApplied.length > 0) {
        const summary = opsApplied.length === 1 ? "1 edit" : `${opsApplied.length} edits`;
        toast.success(`Applied ${summary}`);
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        // User stopped — leave the partial message in place but mark it.
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: (last.content || "") + (last.content ? "\n\n" : "") + "— stopped —",
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
      abortRef.current = null;
    }
  }

  function clear() {
    if (busy) stop();
    setMessages([]);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close chat"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm"
      />

      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <MessageSquareText className="size-4" strokeWidth={1.7} />
            </div>
            <div>
              <div className="text-[0.95rem] font-semibold tracking-[-0.01em]">
                AI editor
              </div>
              <div className="text-[0.74rem] text-muted-foreground">
                Plans, edits, and searches the web.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                title="Clear conversation"
                className="rounded-md px-2 py-1 text-[0.72rem] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Conversation */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !busy && (
            <EmptyState onPick={(prompt) => send(prompt)} />
          )}

          {messages.map((m, i) => (
            <ChatBubble key={i} msg={m} />
          ))}

          {busy && (
            <div className="flex flex-col gap-1 px-1 py-1">
              {activeSearch ? (
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-sky-500/10 px-2.5 py-1 text-[0.75rem] text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/30">
                  <Search className="size-3 animate-pulse" />
                  <span className="truncate max-w-[280px]">
                    Searching: <span className="font-medium">{activeSearch}</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Thinking…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border/70 bg-background/30 p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 shadow-[inset_0_1px_0_oklch(1_0_0/3%)] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-colors"
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
                  : "Ask Claude — it can search the web and edit the canvas…"
              }
              className="min-h-[20px] max-h-[120px] flex-1 resize-none bg-transparent text-[0.88rem] leading-relaxed outline-none placeholder:text-muted-foreground/60"
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
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                aria-label="Send"
              >
                <ArrowUp className="size-3.5" strokeWidth={2.4} />
              </button>
            )}
          </form>
          <div className="mt-1.5 px-1 text-[0.66rem] text-muted-foreground/70">
            Enter to send · Shift+Enter for newline · Esc to stop · Edits auto-apply
          </div>
        </div>
      </aside>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const suggestions = [
    {
      icon: <Camera className="size-3.5" strokeWidth={1.8} />,
      text: "Add a dome camera at every corner of the largest room.",
    },
    {
      icon: <Globe className="size-3.5" strokeWidth={1.8} />,
      text: "Find a 4K dome camera under $300 and add 4 of them.",
    },
    {
      icon: <Move className="size-3.5" strokeWidth={1.8} />,
      text: "Move the lobby camera so it faces the front door.",
    },
    {
      icon: <RotateCw className="size-3.5" strokeWidth={1.8} />,
      text: "Rotate the back-hallway camera 90° to cover the corridor.",
    },
    {
      icon: <Plus className="size-3.5" strokeWidth={1.8} />,
      text: "Cover every door with a motion sensor.",
    },
    {
      icon: <Wand2 className="size-3.5" strokeWidth={1.8} />,
      text: "Critique my current layout — what's missing?",
    },
  ];
  return (
    <div className="flex flex-col items-center gap-5 pt-6 px-2 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </div>
      <div className="space-y-1.5">
        <div className="text-[0.95rem] font-medium tracking-[-0.01em]">
          What should we change?
        </div>
        <div className="mx-auto max-w-[22rem] text-[0.78rem] text-muted-foreground leading-relaxed">
          Claude can add, move, rotate, or remove devices on the active floor —
          and search the web for product specs or pricing when you ask.
        </div>
      </div>
      <div className="grid w-full gap-1.5">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(s.text)}
            className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-left text-[0.78rem] text-foreground/85 hover:border-primary/40 hover:bg-primary/[0.04] transition-colors"
          >
            <span className="mt-0.5 text-primary/80">{s.icon}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ChatBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[0.85rem] leading-relaxed text-primary-foreground shadow-[0_2px_8px_-3px_oklch(0.55_0.17_245/35%)]">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[95%] gap-2">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Sparkles className="size-3" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {msg.content && (
            <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card/60 px-3 py-2 text-[0.85rem] leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {msg.content}
            </div>
          )}
          {msg.webSearches != null && msg.webSearches > 0 && (
            <div className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground">
              <Globe className="size-3" />
              {msg.webSearches} web search{msg.webSearches === 1 ? "" : "es"}
            </div>
          )}
          {msg.citations && msg.citations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {msg.citations.map((c, i) => (
                <CitationChip key={i} citation={c} />
              ))}
            </div>
          )}
          {msg.operations && msg.operations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
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
  const tone = (() => {
    if (
      op.kind === "add-device" ||
      op.kind === "add-wall" ||
      op.kind === "add-door"
    )
      return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25";
    if (op.kind === "remove-device" || op.kind === "remove-wall")
      return "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25";
    if (op.kind === "move-device" || op.kind === "rotate-device")
      return "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25";
    return "bg-foreground/[0.06] text-foreground/80 ring-foreground/15";
  })();
  const Icon = (() => {
    if (
      op.kind === "add-device" ||
      op.kind === "add-wall" ||
      op.kind === "add-door"
    )
      return Plus;
    if (op.kind === "remove-device" || op.kind === "remove-wall") return Trash2;
    if (op.kind === "move-device") return Move;
    if (op.kind === "rotate-device") return RotateCw;
    return Sparkles;
  })();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium ring-1",
        tone,
      )}
    >
      <Icon className="size-3" strokeWidth={2} />
      {text}
    </span>
  );
}

function CitationChip({ citation }: { citation: Citation }) {
  const host = citationHost(citation.url);
  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      title={citation.title ?? citation.url}
      className="inline-flex max-w-[280px] items-center gap-1 rounded-md bg-foreground/[0.04] px-1.5 py-0.5 text-[0.7rem] font-medium text-foreground/80 ring-1 ring-foreground/15 hover:bg-foreground/[0.08] hover:text-foreground transition-colors"
    >
      <Globe className="size-3 shrink-0" strokeWidth={2} />
      <span className="truncate">{host}</span>
      <ExternalLink className="size-2.5 shrink-0 opacity-60" strokeWidth={2} />
    </a>
  );
}
