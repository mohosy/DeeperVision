"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { create } from "zustand";
import { Footprints, Keyboard, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveFloor, useDesignStore } from "@/lib/store";
import type { Door, Wall } from "@/types/design";

/**
 * Transient UI state for walk mode. Kept separate from the main design store
 * so high-frequency hover updates (every frame) don't pollute undo history
 * or trigger unrelated re-renders.
 *
 *   hoverDeviceId   what the center-screen crosshair is currently aimed at
 *   interactMode    true while the user is holding `E` — pointer lock is
 *                   released, a real cursor appears, devices become draggable
 */
interface WalkUIState {
  hoverDeviceId: string | null;
  interactMode: boolean;
  setHoverDeviceId(id: string | null): void;
  setInteractMode(on: boolean): void;
}
export const useWalkUIStore = create<WalkUIState>((set) => ({
  hoverDeviceId: null,
  interactMode: false,
  setHoverDeviceId(id) {
    set((s) => (s.hoverDeviceId === id ? s : { hoverDeviceId: id }));
  },
  setInteractMode(on) {
    set((s) => (s.interactMode === on ? s : { interactMode: on }));
  },
}));

interface WalkControllerProps {
  walls: Wall[];
  /** Doors on this floor. Walkers automatically pass through unlocked
   *  doors (the door's wall segment is skipped within the door width
   *  + a 0.6m approach zone). Locked doors remain solid. */
  doors: Door[];
  scale: number;
  spawn: [number, number, number];
  spawnLookAt: [number, number, number];
  onExit: () => void;
}

const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.65;
const WALK_SPEED = 3.2;
const RUN_SPEED = 6.4;

interface WallSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

function distancePointToSegment(
  px: number,
  pz: number,
  s: WallSegment
): { dist: number; nx: number; nz: number } {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 0) {
    t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / len2));
  }
  const cx = s.ax + t * dx;
  const cz = s.az + t * dz;
  const ox = px - cx;
  const oz = pz - cz;
  const d = Math.hypot(ox, oz);
  return {
    dist: d,
    nx: d > 0 ? ox / d : 1,
    nz: d > 0 ? oz / d : 0,
  };
}

export function WalkController({
  walls,
  doors,
  scale,
  spawn,
  spawnLookAt,
  onExit,
}: WalkControllerProps) {
  const { camera, gl, scene } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocity = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  // Tracked via the pointerlockchange DOM event (not React state) so the
  // movement loop can gate on it without forcing re-renders. The HUD lives
  // outside the Canvas and reads its own lock state separately.
  const lockedRef = useRef(false);
  // Mirror walkUI.interactMode into a ref so useFrame and event handlers can
  // gate behavior synchronously without re-subscribing.
  const interactRef = useRef(false);
  const selectDevice = useDesignStore((s) => s.selectDevice);
  const setRightTab = useDesignStore((s) => s.setRightTab);
  const setHoverDeviceId = useWalkUIStore((s) => s.setHoverDeviceId);
  const setInteractMode = useWalkUIStore((s) => s.setInteractMode);
  // Subscribed (not just ref) so we conditionally unmount PointerLockControls
  // during edit mode — that's the fix for the "click a device → kicked back
  // to view mode" bug. drei's PointerLockControls attaches its own click
  // handler to the canvas that calls requestPointerLock on every click, so
  // any click during edit mode would auto-relock and exit edit. By not
  // mounting it at all in edit mode, the canvas behaves like a normal page
  // and Device3D's pointer handlers receive the click cleanly.
  const interactMode = useWalkUIStore((s) => s.interactMode);

  useEffect(() => {
    const onChange = () => {
      lockedRef.current = document.pointerLockElement !== null;
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);

  // Reset transient UI state on unmount (e.g. when leaving walk mode)
  useEffect(() => {
    return () => {
      setHoverDeviceId(null);
      setInteractMode(false);
      interactRef.current = false;
    };
  }, [setHoverDeviceId, setInteractMode]);

  // Pre-compute wall segments in world (meter) space, paired with the
  // wall id so per-wall door lookups stay cheap during collision.
  const wallSegments = useRef<(WallSegment & { wallId: string })[]>([]);
  useEffect(() => {
    wallSegments.current = walls.map((w) => ({
      wallId: w.id,
      ax: w.start.x / scale,
      az: w.start.y / scale,
      bx: w.end.x / scale,
      bz: w.end.y / scale,
    }));
  }, [walls, scale]);

  // Pre-compute door positions (world meters) per wall id. Locked doors
  // are skipped — they should remain solid in walk mode.
  const doorsByWall = useRef<Map<string, { x: number; z: number; r: number }[]>>(
    new Map(),
  );
  useEffect(() => {
    const map = new Map<string, { x: number; z: number; r: number }[]>();
    for (const d of doors) {
      if (d.locked) continue; // locked doors stay solid
      const arr = map.get(d.wallId) ?? [];
      arr.push({
        x: d.position.x / scale,
        z: d.position.y / scale,
        // Pass-through radius — generous so brushing the doorway opens it
        // and the walker doesn't snag on the wall geometry.
        r: Math.max(d.widthMeters * 0.7, 1.0),
      });
      map.set(d.wallId, arr);
    }
    doorsByWall.current = map;
  }, [doors, scale]);

  // Initial position the camera and orientation
  useEffect(() => {
    camera.position.set(spawn[0], spawn[1], spawn[2]);
    const m = new THREE.Matrix4().lookAt(
      new THREE.Vector3(...spawn),
      new THREE.Vector3(...spawnLookAt),
      new THREE.Vector3(0, 1, 0)
    );
    camera.quaternion.setFromRotationMatrix(m);
    camera.updateMatrixWorld(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle interact mode. Shared between the `E` hotkey and the clickable
  // chip in WalkHUD (via the `dv-walk-toggle-edit` window event) so both
  // entry points stay in sync.
  useEffect(() => {
    const toggle = () => {
      const next = !interactRef.current;
      interactRef.current = next;
      setInteractMode(next);
      if (next) {
        // Enter edit mode — release the pointer lock so the OS cursor is
        // visible and clicks fall through to Device3D's drag handlers.
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      } else {
        // Exit edit mode — re-acquire the pointer lock so mouse-look + the
        // crosshair come back. Browsers allow this from a keydown or click
        // gesture; if it's refused (e.g. user just hit Esc), the HUD's
        // pre-lock overlay will surface a click-to-walk fallback.
        const canvas = gl.domElement;
        const req = canvas.requestPointerLock?.();
        if (req && typeof (req as Promise<void>).then === "function") {
          (req as Promise<void>).catch(() => {});
        }
      }
    };
    window.addEventListener("dv-walk-toggle-edit", toggle);
    return () => window.removeEventListener("dv-walk-toggle-edit", toggle);
  }, [setInteractMode, gl]);

  // Keyboard listeners. `E` toggles edit mode (press once to enter, press
  // again to exit — NOT hold-to-edit, which made fast click+drag impossible).
  // `Esc` exits walk mode entirely.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Don't swallow keystrokes when the user is typing in a text field
      // (e.g. the AI chat or the properties panel that may be open in the
      // sidebar while walking).
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          (t as HTMLElement).isContentEditable);
      if (typing) return;

      keys.current[e.code] = true;
      if (e.code === "Escape") {
        onExit();
        return;
      }
      // E toggles edit mode. Key-repeat fires keydown over and over while
      // held; ignore those so the mode doesn't flip back and forth.
      if (e.code === "KeyE" && !e.repeat) {
        window.dispatchEvent(new CustomEvent("dv-walk-toggle-edit"));
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onExit]);

  // (Removed the auto-relock → exit-edit handler that used to live here.
  // It was the root cause of "click an object in edit mode → kicked back
  // to view mode." With PointerLockControls now unmounted during edit
  // mode, the canvas won't auto-relock on click in the first place.)

  // Click-to-select while walking. When the pointer is locked, the crosshair
  // is our "cursor": a left-click selects whatever device is currently under
  // it and pops open the Properties tab in the right sidebar.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!lockedRef.current) return;
      if (interactRef.current) return; // free-cursor handles its own clicks
      if (e.button !== 0) return;
      const hoveredId = useWalkUIStore.getState().hoverDeviceId;
      if (!hoveredId) return;
      selectDevice(hoveredId);
      setRightTab("properties");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [selectDevice, setRightTab]);

  // Reused per-frame raycaster + scratch vectors so hover detection doesn't
  // allocate every tick.
  const hoverRaycaster = useRef(new THREE.Raycaster());
  const hoverDir = useRef(new THREE.Vector3());
  const hoverFrameCounter = useRef(0);

  useFrame((_, delta) => {
    // Skip the loop only in the pre-lock state (overlay is up, nothing to
    // drive). In walk mode (locked) or edit mode (unlocked but interactMode
    // on), we still want to process input.
    if (!lockedRef.current && !interactRef.current) return;
    const dt = Math.min(delta, 0.05); // clamp big frame steps

    // Hover raycast (~10Hz). Only meaningful in walk mode — the crosshair is
    // the walking cursor. In edit mode the user has a real OS cursor and
    // Device3D handles its own pointer events.
    if (lockedRef.current && !interactRef.current) {
      hoverFrameCounter.current = (hoverFrameCounter.current + 1) % 6;
      if (hoverFrameCounter.current === 0) {
        camera.getWorldDirection(hoverDir.current);
        hoverRaycaster.current.set(camera.position, hoverDir.current);
        hoverRaycaster.current.far = 25; // ignore far-wall device hits
        const hits = hoverRaycaster.current.intersectObjects(
          scene.children,
          true,
        );
        let pickedId: string | null = null;
        for (const h of hits) {
          let obj: THREE.Object3D | null = h.object;
          while (obj) {
            const id = (obj.userData as { deviceId?: string }).deviceId;
            if (id) {
              pickedId = id;
              break;
            }
            obj = obj.parent;
          }
          if (pickedId) break;
        }
        setHoverDeviceId(pickedId);
      }
    } else if (interactRef.current) {
      // Clear any stale hover label while in edit mode.
      setHoverDeviceId(null);
    }

    // WASD continues to work in both walk and edit modes. Mouse-look is
    // naturally disabled in edit mode (PointerLockControls only fires while
    // locked), so the user can keyboard-walk into position, click + drag
    // devices, and press E to look around again.

    // Forward / right vectors in horizontal plane
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    right.current.crossVectors(forward.current, new THREE.Vector3(0, 1, 0));

    const speed =
      keys.current["ShiftLeft"] || keys.current["ShiftRight"]
        ? RUN_SPEED
        : WALK_SPEED;

    velocity.current.set(0, 0, 0);
    if (keys.current["KeyW"] || keys.current["ArrowUp"]) {
      velocity.current.addScaledVector(forward.current, speed);
    }
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) {
      velocity.current.addScaledVector(forward.current, -speed);
    }
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) {
      velocity.current.addScaledVector(right.current, -speed);
    }
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) {
      velocity.current.addScaledVector(right.current, speed);
    }

    if (velocity.current.lengthSq() === 0) return;

    let nextX = camera.position.x + velocity.current.x * dt;
    let nextZ = camera.position.z + velocity.current.z * dt;

    // Wall collision — push out of any wall within PLAYER_RADIUS. Walls
    // with an unlocked door under the walker's intended position are
    // skipped entirely so the player passes through cleanly (the door
    // mesh swings out of the way visually).
    for (let i = 0; i < wallSegments.current.length; i++) {
      const s = wallSegments.current[i];
      // Door pass-through: if there's an unlocked door on this wall and
      // the walker is within its pass radius, treat the wall as open.
      const doorsOnWall = doorsByWall.current.get(s.wallId);
      if (doorsOnWall) {
        let passable = false;
        for (let j = 0; j < doorsOnWall.length; j++) {
          const d = doorsOnWall[j];
          if (Math.hypot(nextX - d.x, nextZ - d.z) < d.r) {
            passable = true;
            break;
          }
        }
        if (passable) continue;
      }
      const r = distancePointToSegment(nextX, nextZ, s);
      if (r.dist < PLAYER_RADIUS) {
        const push = PLAYER_RADIUS - r.dist + 0.001;
        nextX += r.nx * push;
        nextZ += r.nz * push;
      }
    }

    camera.position.x = nextX;
    camera.position.z = nextZ;
    camera.position.y = EYE_HEIGHT;
  });

  // Mount PointerLockControls only when NOT in edit mode. Its built-in
  // click-to-lock handler is what kicked us out before — keeping it off
  // during edit mode lets clicks fall through to Device3D normally. When
  // the user toggles E off, the controls re-mount and the explicit
  // `requestPointerLock` call in the toggle handler re-engages mouse-look.
  return interactMode ? null : <PointerLockControls domElement={gl.domElement} />;
}

/**
 * Walk-mode HUD. MUST be rendered as a sibling of <Canvas>, not inside it —
 * R3F's reconciler only understands THREE elements, so rendering <div> from
 * within the Canvas tree (even via a react-dom portal) throws "Div is not
 * part of the THREE namespace."
 *
 * Tracks pointer-lock state itself via the `pointerlockchange` DOM event so
 * it doesn't need any prop wiring back from WalkController.
 *
 * Two visual states:
 *  • pre-lock (cursor not yet captured) — a centered glass card asking
 *    the user to click; lists key bindings.
 *  • locked (walking) — a small frosted chip pinned to top-center with
 *    a pulsing green dot + key hints. Auto-fades to 25% opacity after
 *    4 seconds so it doesn't distract during the walkthrough; hovering
 *    snaps it back to full.
 */
export function WalkHUD() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);

  const interactMode = useWalkUIStore((s) => s.interactMode);
  const hoverDeviceId = useWalkUIStore((s) => s.hoverDeviceId);
  const floor = useActiveFloor();
  const hoverDevice =
    hoverDeviceId && floor
      ? floor.devices.find((d) => d.id === hoverDeviceId) ?? null
      : null;

  // Locked-state chip fades after a few seconds; re-shown on hover.
  const [chipBright, setChipBright] = useState(true);
  useEffect(() => {
    if (!locked) {
      setChipBright(true);
      return;
    }
    setChipBright(true);
    const t = window.setTimeout(() => setChipBright(false), 4000);
    return () => window.clearTimeout(t);
  }, [locked]);

  // While the user is in interact mode the pointer is intentionally unlocked.
  // Don't fall through to the "Click to start walking" overlay during that
  // hold — it would block all clicks on devices.
  if (!locked && interactMode) {
    return <InteractHUD />;
  }

  return locked ? (
    <>
      {/* Center-of-screen crosshair acts as the walking cursor. Hidden during
          interact mode because the real cursor takes over. */}
      <div className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Crosshair active={!!hoverDevice} />
          {hoverDevice && (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[0.7rem] font-medium text-white shadow-lg backdrop-blur">
              <span
                className="size-1.5 rounded-full"
                style={{
                  background:
                    hoverDevice.customColor ??
                    DEVICE_HOVER_DOT[hoverDevice.type],
                }}
              />
              <span>{hoverDevice.label}</span>
              <span className="text-white/40">·</span>
              <span className="text-white/55">click to edit</span>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed left-1/2 top-4 z-[60] -translate-x-1/2">
        <div
          className={cn(
            "pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-3 py-1.5 text-[0.74rem] font-medium text-white shadow-2xl backdrop-blur-xl transition-opacity duration-500",
            chipBright ? "opacity-100" : "opacity-30 hover:opacity-100",
          )}
          onMouseEnter={() => setChipBright(true)}
          onMouseLeave={() => setChipBright(false)}
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
          </span>
          <Footprints className="size-3.5" strokeWidth={2} />
          <span className="text-white/95">Walking</span>
          <span className="text-white/25">·</span>
          <Kbd>WASD</Kbd>
          <Kbd>Shift</Kbd>
          <span className="text-white/25">·</span>
          <span className="text-white/60">press</span>
          <Kbd>E</Kbd>
          <span className="text-white/60">to edit</span>
          <span className="text-white/25">·</span>
          <Kbd>Esc</Kbd>
          <span className="text-white/60">exit</span>
        </div>
      </div>
    </>
  ) : (
    // Light vignette over the scene so the start prompt has contrast, but
    // NO backdrop-blur — the user wants to see the building underneath.
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-gradient-to-t from-black/45 via-black/10 to-transparent pb-12">
      <button
        type="button"
        onClick={() => {
          const canvas = document.querySelector(
            "canvas",
          ) as HTMLCanvasElement | null;
          canvas?.requestPointerLock?.();
        }}
        className="group flex flex-col items-center gap-5 rounded-2xl border border-white/15 bg-zinc-950/60 px-8 py-6 text-white shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7)] transition-all hover:bg-zinc-950/75"
        aria-label="Click to start walking through the scene"
      >
        <KeyboardVisual />
        <div className="text-center">
          <div className="text-[0.95rem] font-medium tracking-[-0.005em] text-white">
            Click to start walking
          </div>
          <div className="mt-0.5 text-[0.72rem] text-white/55">
            Move, run, edit objects, and exit using the keys above
          </div>
        </div>
      </button>
    </div>
  );
}

/**
 * Visual keyboard layout for the walk-mode start overlay. Shows the WASD
 * cross + Shift + E + Esc as real-looking keycaps with labels under each
 * cluster. Cleaner than inline kbd tags and reads at a glance — players
 * recognize the shapes immediately.
 */
function KeyboardVisual() {
  return (
    <div className="flex items-end gap-5">
      <KeyCluster label="Move">
        <div className="flex flex-col items-center gap-1.5">
          <KeyCap>W</KeyCap>
          <div className="flex gap-1.5">
            <KeyCap>A</KeyCap>
            <KeyCap>S</KeyCap>
            <KeyCap>D</KeyCap>
          </div>
        </div>
      </KeyCluster>

      {/* Slim vertical divider between clusters */}
      <div className="h-12 w-px self-end bg-white/10" />

      <KeyCluster label="Run">
        <KeyCap wide>⇧ Shift</KeyCap>
      </KeyCluster>

      <div className="h-12 w-px self-end bg-white/10" />

      <KeyCluster label="Edit objects">
        <KeyCap>E</KeyCap>
      </KeyCluster>

      <div className="h-12 w-px self-end bg-white/10" />

      <KeyCluster label="Exit">
        <KeyCap>Esc</KeyCap>
      </KeyCluster>
    </div>
  );
}

function KeyCluster({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <div className="text-[0.62rem] font-medium uppercase tracking-[0.08em] text-white/45">
        {label}
      </div>
    </div>
  );
}

/**
 * 3D-looking physical keycap. Gradient + inset shadows give it depth so it
 * reads as a real key, not a flat label. `wide` covers Shift / Esc / etc.
 */
function KeyCap({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md border border-white/20",
        "bg-gradient-to-b from-white/15 to-white/[0.04]",
        "text-[0.78rem] font-semibold text-white/95",
        "shadow-[0_2px_0_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-2px_0_rgba(0,0,0,0.35)]",
        wide ? "min-w-[4.5rem] px-3" : "w-9",
      )}
    >
      {children}
    </div>
  );
}

const DEVICE_HOVER_DOT: Record<string, string> = {
  camera: "#3b82f6",
  reader: "#0ea5e9",
  sensor: "#f59e0b",
  network: "#a78bfa",
};

/**
 * Tiny center-of-screen ring. Highlights amber when the raycaster has a
 * device under it, neutral white otherwise.
 */
function Crosshair({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "relative size-5 rounded-full border transition-colors",
        active
          ? "border-amber-300 bg-amber-300/15"
          : "border-white/70 bg-white/0",
      )}
    >
      <span
        className={cn(
          "absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
          active ? "bg-amber-200" : "bg-white/85",
        )}
      />
    </div>
  );
}

/**
 * HUD shown while the user is in edit mode — pointer lock is released, the
 * real cursor is visible, and devices behave like they do in orbit (click +
 * drag to move, click to open Properties). WASD still moves the camera.
 * Press `E` again or click the chip to return to walking.
 */
function InteractHUD() {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[60] -translate-x-1/2">
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("dv-walk-toggle-edit"))
        }
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[0.74rem] font-medium text-amber-100 shadow-2xl backdrop-blur-xl transition-colors hover:bg-amber-500/25"
        aria-label="Exit edit mode and return to walking"
      >
        <MousePointer2 className="size-3.5" strokeWidth={2} />
        <span>Edit mode</span>
        <span className="text-amber-200/55">·</span>
        <Kbd>WASD</Kbd>
        <span className="text-amber-100/85">to walk · drag to move · click to open</span>
        <span className="text-amber-200/55">·</span>
        <span className="text-amber-100/75">press</span>
        <Kbd>E</Kbd>
        <span className="text-amber-100/75">or click here to look</span>
      </button>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/15 bg-white/10 px-1.5 py-px font-mono text-[0.65rem] text-white/90">
      {children}
    </kbd>
  );
}
