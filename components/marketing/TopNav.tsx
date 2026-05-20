import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md border border-border bg-card/60 shadow-[inset_0_1px_0_oklch(1_0_0/4%)]">
            <Eye className="size-3.5 text-primary" />
          </div>
          <span className="font-medium tracking-[-0.01em] text-[0.97rem]">
            Deeper Vision
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-1.5 text-sm">
          <Link
            href="#features"
            className="hidden sm:inline-block px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors text-[0.88rem]"
          >
            Features
          </Link>
          <Link
            href="/design/new"
            className="hidden sm:inline-block px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors text-[0.88rem]"
          >
            Editor
          </Link>
          <ThemeToggle size="sm" className="ml-1" />
          <Button
            size="sm"
            className="ml-1 btn-lift shadow-[0_4px_18px_-8px_oklch(0.78_0.135_158/55%)]"
            nativeButton={false}
            render={<Link href="/design/new" />}
          >
            Start designing
          </Button>
        </nav>
      </div>
    </header>
  );
}
