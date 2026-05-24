"use client";

/**
 * Top-level error boundary. When a client component anywhere in the app
 * throws an unhandled exception, Next.js renders this in place of the
 * normal layout. The default "This page couldn't load" the browser shows
 * is opaque — this gives us the actual error message + a one-click
 * "Reset" that re-mounts the tree, plus a "Clear local data" escape
 * hatch for cases where stale localStorage is the cause.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Surface the error in the console too — easier to inspect with devtools open.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[DeeperVision] caught error in app/error.tsx", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-7 shadow-xl">
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-rose-500">
          Something broke
        </div>
        <h1 className="mt-1.5 text-[1.4rem] font-semibold tracking-[-0.01em]">
          The editor hit an error
        </h1>
        <p className="mt-2 text-[0.88rem] text-muted-foreground leading-relaxed">
          The page caught an unhandled exception instead of crashing the
          browser tab. Try resetting first; if that doesn&rsquo;t work, the
          most common cause is stale state from a previous version — clear
          local data and reload.
        </p>

        <pre className="mt-5 max-h-48 overflow-auto rounded-lg border border-rose-500/30 bg-rose-500/[0.04] p-3 text-[0.78rem] font-mono leading-relaxed text-rose-700 dark:text-rose-300">
{error.message}
{error.stack ? `\n\n${error.stack.split("\n").slice(0, 8).join("\n")}` : ""}
{error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[0.85rem] font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                // Clear all DeeperVision-prefixed localStorage so a corrupt
                // persisted store can't keep wedging the editor.
                const keys = Object.keys(window.localStorage);
                for (const k of keys) {
                  if (
                    k.startsWith("dv-") ||
                    k.startsWith("deeper-vision") ||
                    k.startsWith("dv-chat-history")
                  ) {
                    window.localStorage.removeItem(k);
                  }
                }
              } catch {
                /* localStorage disabled — ignore */
              }
              window.location.href = "/";
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card/40 px-3.5 text-[0.85rem] font-medium text-foreground hover:bg-card/70"
          >
            Clear local data &amp; go home
          </button>
        </div>

        <div className="mt-4 text-[0.72rem] text-muted-foreground/70">
          If this keeps happening, paste the message above to Mo so it can be
          fixed.
        </div>
      </div>
    </div>
  );
}
