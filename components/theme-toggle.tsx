"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  size?: "sm" | "md";
  className?: string;
}

export function ThemeToggle({ size = "md", className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dim = size === "sm" ? "size-7" : "size-9";
  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        dim,
        "relative inline-flex items-center justify-center rounded-lg border border-border bg-card/50 text-muted-foreground transition-colors hover:text-foreground hover:bg-card/80 shadow-[inset_0_1px_0_color-mix(in_oklch,white_5%,transparent)]",
        className
      )}
    >
      <Sun
        className={cn(
          iconSize,
          "absolute transition-all duration-300",
          isDark
            ? "scale-0 rotate-90 opacity-0"
            : "scale-100 rotate-0 opacity-100 text-amber-500"
        )}
      />
      <Moon
        className={cn(
          iconSize,
          "absolute transition-all duration-300",
          isDark
            ? "scale-100 rotate-0 opacity-100 text-primary"
            : "scale-0 -rotate-90 opacity-0"
        )}
      />
    </button>
  );
}
