import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Eye className="size-5 text-primary" />
          <span className="font-semibold tracking-tight">Deeper Vision</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2 text-sm">
          <Link
            href="#features"
            className="hidden sm:inline-block px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            href="/design/new"
            className="hidden sm:inline-block px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            Editor
          </Link>
          <Button
            size="sm"
            className="ml-2"
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
