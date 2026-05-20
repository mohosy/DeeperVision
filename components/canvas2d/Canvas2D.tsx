"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import { Canvas2DToolbar } from "./Toolbar";
import { ShortcutsHint } from "./ShortcutsHint";

const Canvas2DStage = dynamic(
  () => import("./Canvas2DStage").then((m) => m.Canvas2DStage),
  { ssr: false }
);

export function Canvas2D() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const floor = useActiveFloor();
  const updateFloor = useDesignStore((s) => s.updateFloor);
  const setViewTransform = useDesignStore((s) => s.setViewTransform);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const onUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFit = useCallback(() => {
    setViewTransform({ scale: 1, offset: { x: 0, y: 0 } });
    // Stage will refit on the next render frame because of the effect inside it.
  }, [setViewTransform]);

  function onFileChosen(file: File | undefined) {
    if (!file || !floor) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateFloor(floor.id, { planImage: reader.result });
        toast.success("Floor plan loaded", {
          description: "Press C to calibrate the scale.",
        });
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {size.width > 0 && size.height > 0 && (
        <Canvas2DStage
          width={size.width}
          height={size.height}
          onRequestUpload={onUploadClick}
        />
      )}
      <Canvas2DToolbar onFit={onFit} onUpload={onUploadClick} />
      <ShortcutsHint />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => onFileChosen(e.target.files?.[0])}
      />
    </div>
  );
}
