"use client";

import * as THREE from "three";

/**
 * Procedural textures for the 3D scene. We generate them on a CPU canvas
 * once and cache the THREE.Texture instances so every wall / floor / door
 * shares the same GPU resource.
 *
 * Why procedural and not image files: the textures need to read clearly
 * at a wide range of camera distances AND match the warm/cool theme of
 * the scene. Generating them lets us tint to the exact palette colour
 * with no asset-management overhead.
 *
 * Every helper returns a `THREE.CanvasTexture` ready to be assigned to a
 * `meshStandardMaterial.map`. They all wrap `RepeatWrapping` so the
 * caller can set `repeat.set(u, v)` based on the meshed face's size to
 * keep grain density consistent regardless of wall length.
 */

interface DrywallOpts {
  /** Base wall color in hex (matches the painted plaster) */
  base: string;
  /** How much subtle noise to mix in. 0–1. Default 0.1 */
  grain?: number;
}

/**
 * Painted-drywall texture. A solid colour with very fine noise + a few
 * faint horizontal banding lines, like an interior wall photographed
 * in soft daylight. Designed to be tiled aggressively (5+ repeats per
 * meter) without looking like wallpaper.
 */
export function drywallTexture(opts: DrywallOpts): THREE.CanvasTexture {
  const key = `drywall:${opts.base}:${opts.grain ?? 0.1}`;
  const cached = textureCache.get(key);
  if (cached) return cached as THREE.CanvasTexture;

  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  // Solid base fill
  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, size, size);

  // Pixel-by-pixel noise — small luminance perturbations only, no hue
  // shift. This stays readable when tinted darker for shadows.
  const grain = opts.grain ?? 0.1;
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * grain;
    data[i] = clamp(data[i] + n);
    data[i + 1] = clamp(data[i + 1] + n);
    data[i + 2] = clamp(data[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);

  // Faint horizontal scratches — random strokes, very low alpha. Reads
  // as paint roller marks at typical viewing distance.
  ctx.strokeStyle = "rgba(0,0,0,0.03)";
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 18; i++) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Light-oak wood plank texture for the floor. Vertical (well, U-direction)
 * plank seams every ~1/4 of the canvas, light grain inside each plank,
 * gentle knot circles randomly placed. Looks great when repeated 4x4
 * over a typical room.
 */
export function woodFloorTexture(opts: {
  base: string;
  grain?: string;
}): THREE.CanvasTexture {
  const key = `wood-floor:${opts.base}:${opts.grain ?? ""}`;
  const cached = textureCache.get(key);
  if (cached) return cached as THREE.CanvasTexture;

  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, size, size);

  // 4 vertical plank seams.
  const planks = 4;
  const plankW = size / planks;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.4;
  for (let i = 1; i < planks; i++) {
    const x = i * plankW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  // Horizontal end-joints — staggered between planks.
  ctx.lineWidth = 1.1;
  for (let i = 0; i < planks; i++) {
    const x = i * plankW;
    const stagger = (i * 73) % size;
    ctx.beginPath();
    ctx.moveTo(x, stagger);
    ctx.lineTo(x + plankW, stagger);
    ctx.stroke();
  }

  // Subtle wood grain — many thin vertical streaks of grain colour.
  const grain = opts.grain ?? "#9a7a4a";
  ctx.strokeStyle = grain;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 40 + Math.random() * 110;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 4,
      y + len / 3,
      x + (Math.random() - 0.5) * 4,
      y + (2 * len) / 3,
      x + (Math.random() - 0.5) * 6,
      y + len,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Couple of knots
  ctx.fillStyle = "rgba(60,40,20,0.4)";
  for (let i = 0; i < 5; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 4 + Math.random() * 6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tiny per-pixel speckle so the surface never reads as a solid color.
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    data[i] = clamp(data[i] + n);
    data[i + 1] = clamp(data[i + 1] + n);
    data[i + 2] = clamp(data[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Wood-grain door texture. A single slab of darker wood with vertical
 * grain and two raised-panel rectangles drawn in a slightly darker tone
 * so the door reads as a panelled interior door, not a featureless block.
 */
export function doorTexture(opts: { base: string }): THREE.CanvasTexture {
  const key = `door:${opts.base}`;
  const cached = textureCache.get(key);
  if (cached) return cached as THREE.CanvasTexture;

  const w = 256;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, w, h);

  // Vertical grain.
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * w;
    const yStart = Math.random() * h;
    const len = 80 + Math.random() * 200;
    ctx.beginPath();
    ctx.moveTo(x, yStart);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 1.6,
      yStart + len / 3,
      x + (Math.random() - 0.5) * 1.6,
      yStart + (2 * len) / 3,
      x + (Math.random() - 0.5) * 2,
      yStart + len,
    );
    ctx.stroke();
  }

  // Two raised panels — upper smaller, lower larger.
  const panelInset = 18;
  const upperTop = 28;
  const upperH = h * 0.42 - 36;
  const lowerTop = upperTop + upperH + 24;
  const lowerH = h - lowerTop - 28;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(panelInset, upperTop, w - panelInset * 2, upperH);
  ctx.strokeRect(panelInset, lowerTop, w - panelInset * 2, lowerH);
  // Inner bevel highlight on each panel — thin lighter line just inside
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(panelInset + 4, upperTop + 4, w - (panelInset + 4) * 2, upperH - 8);
  ctx.strokeRect(panelInset + 4, lowerTop + 4, w - (panelInset + 4) * 2, lowerH - 8);

  // Brass-ish door handle on the right side at midheight.
  const handleX = w - 26;
  const handleY = h * 0.55;
  ctx.fillStyle = "#c9a45a";
  ctx.beginPath();
  ctx.arc(handleX, handleY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.arc(handleX, handleY, 5, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  // Doors don't tile — they're applied 1:1 to the door face. Clamp so any
  // UV spillover doesn't repeat the seam.
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/** Single shared cache keyed by stable inputs. Disposed on page unload. */
const textureCache = new Map<string, THREE.Texture>();

function clamp(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
