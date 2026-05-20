import { Eye } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[0.83rem] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Eye className="size-3.5 text-primary" />
          <span className="font-medium text-foreground/90">Deeper Vision</span>
          <span className="opacity-50">·</span>
          <span>
            Built for security integrators who want to ship{" "}
            <span className="font-serif-italic text-foreground/80">faster</span>.
          </span>
        </div>
        <div className="font-mono text-xs opacity-70">v0.1.0 — preview</div>
      </div>
    </footer>
  );
}
