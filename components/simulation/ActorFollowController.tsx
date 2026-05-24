"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { Eye } from "lucide-react";

// Minimal subset of drei's OrbitControls instance API that we touch.
// Avoids pulling in the `three-stdlib` type package just for one symbol.
interface OrbitLike {
  target: THREE.Vector3;
  update(): void;
}
import { useActiveFloor } from "@/lib/store";
import { useSimStore } from "@/lib/sim-store";
import { collideAgainstWalls, positionOnPath } from "@/lib/detection";
import { WALK_SPEED } from "@/lib/walk";

/**
 * Floats a clickable "Follow" badge over the actor in sim mode. When the
 * user clicks it (or any HUD button that calls startFollow), the camera
 * locks to a first-person POV anchored to the actor: eye-height, looking
 * in the direction they're walking.
 *
 * Two pieces:
 *  1. <FollowButton> — billboarded sprite above the actor's head
 *  2. <FollowCamera> — useFrame controller that moves the THREE camera
 *     onto the actor every frame while following=true
 *
 * Both are gated on sim being running (or at least having a path). The
 * camera controller silently does nothing if following=false, so it's
 * cheap to always mount.
 */
export function ActorFollowController() {
  return (
    <>
      <FollowButton />
      <FollowCamera />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** Sphere of the actor's head + the recomputed walk direction, derived from
 *  the same positionOnPath that Actor3D uses. We sample now AND a hair into
 *  the future to compute the heading. */
function sampleActor(floor: ReturnType<typeof useActiveFloor>): {
  pos: THREE.Vector3;
  forward: THREE.Vector3;
} | null {
  if (!floor) return null;
  const path = floor.simPath ?? [];
  if (path.length < 2) return null;
  const t = useSimStore.getState().t;
  const radiusPx = 0.28 * floor.scale;
  const { position } = positionOnPath(path, t, WALK_SPEED, floor.scale);
  const a = collideAgainstWalls(position, floor.walls, radiusPx);
  // 0.12s lookahead so the heading vector isn't jittery on tight corners.
  const { position: ahead } = positionOnPath(path, t + 0.12, WALK_SPEED, floor.scale);
  const b = collideAgainstWalls(ahead, floor.walls, radiusPx);
  const pos = new THREE.Vector3(a.x / floor.scale, 0, a.y / floor.scale);
  const forwardX = (b.x - a.x) / floor.scale;
  const forwardZ = (b.y - a.y) / floor.scale;
  const len = Math.hypot(forwardX, forwardZ);
  const forward =
    len > 0.001
      ? new THREE.Vector3(forwardX / len, 0, forwardZ / len)
      : new THREE.Vector3(0, 0, 1);
  return { pos, forward };
}

/* -------------------------------------------------------------------------- */

/**
 * Clickable badge floating above the actor's head. Reads as a Google-Maps
 * Pegman button but inverted — "drop into this character". Hides when the
 * camera is already following so the badge doesn't follow you everywhere.
 */
function FollowButton() {
  const floor = useActiveFloor();
  const following = useSimStore((s) => s.following);
  const startFollow = useSimStore((s) => s.startFollow);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    if (following) {
      groupRef.current.visible = false;
      return;
    }
    const s = sampleActor(floor);
    if (!s) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    // Float above the actor's head, with a subtle bob so the eye is drawn
    // to it.
    const t = useSimStore.getState().t;
    const bob = Math.sin(t * 4) * 0.04;
    groupRef.current.position.set(s.pos.x, 2.35 + bob, s.pos.z);
  });

  return (
    <group ref={groupRef}>
      <Billboard>
        <group
          onClick={(e) => {
            e.stopPropagation();
            startFollow();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          {/* Soft halo so the badge pops from any orbit angle */}
          <mesh position={[0, 0, -0.01]}>
            <circleGeometry args={[0.5, 32]} />
            <meshBasicMaterial color="#1e3a5f" transparent opacity={0.25} />
          </mesh>
          {/* Card */}
          <mesh>
            <planeGeometry args={[0.95, 0.34]} />
            <meshBasicMaterial color="#0f172a" transparent opacity={0.94} />
          </mesh>
          {/* Cyan accent strip — left edge */}
          <mesh position={[-0.42, 0, 0.001]}>
            <planeGeometry args={[0.06, 0.34]} />
            <meshBasicMaterial color="#22d3ee" />
          </mesh>
          {/* Eye icon — drawn as a small white circle since R3F doesn't
              render lucide SVGs natively. Combined with the "Follow" text
              it reads as a "view from here" affordance. */}
          <mesh position={[-0.28, 0, 0.002]}>
            <circleGeometry args={[0.055, 16]} />
            <meshBasicMaterial color="#22d3ee" />
          </mesh>
          <Text
            position={[0.08, 0, 0.003]}
            fontSize={0.13}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
            fillOpacity={1}
          >
            Follow
          </Text>
        </group>
      </Billboard>
    </group>
  );
}

// Defensive: Eye is imported but unused in this file (we draw the icon as
// a colored circle inside the canvas). Keeping the symbol referenced so
// future iterations can swap in an actual SVG plane.
void Eye;

/* -------------------------------------------------------------------------- */

/**
 * Chase-cam controller. While following=true, the camera ORBITS around
 * the actor: every frame we move the OrbitControls' target to the actor's
 * chest, so the user can still click-and-drag to spin the camera around
 * them as they walk. When follow first turns on we set up a sensible
 * chase-cam pose (behind + above the actor); after that the user is in
 * the driver's seat for camera angle.
 *
 * On follow exit, we restore the camera to where it was before follow
 * began so the user lands back in the same orbit angle they left.
 */
function FollowCamera() {
  const { camera, controls } = useThree();
  const floor = useActiveFloor();
  const following = useSimStore((s) => s.following);

  // Cast `controls` from the R3F default-controls slot to drei's
  // OrbitControls so we can read/write its `target` property.
  const orbit = controls as unknown as OrbitLike | null;

  // Where the camera + target were before follow started. We restore on
  // exit so the user pops back to the same orbit pose they left.
  const savedPos = useRef(new THREE.Vector3());
  const savedTarget = useRef(new THREE.Vector3());
  const savedValid = useRef(false);

  useEffect(() => {
    if (following) {
      // Snapshot the current orbit state for restore-on-exit.
      savedPos.current.copy(camera.position);
      if (orbit) {
        savedTarget.current.copy(orbit.target);
      } else {
        // No orbit yet — best-effort: target = a point 6m in front.
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        savedTarget.current.set(
          camera.position.x + dir.x * 6,
          0,
          camera.position.z + dir.z * 6,
        );
      }
      savedValid.current = true;

      // Set up a chase-cam pose: place the camera 3.6m behind the actor
      // (along their forward direction) and 2.6m up, target on the chest.
      const s = sampleActor(floor);
      if (s && orbit) {
        const BEHIND = 3.6;
        const HEIGHT = 2.6;
        const ACTOR_LOOK_Y = 1.1;
        camera.position.set(
          s.pos.x - s.forward.x * BEHIND,
          HEIGHT,
          s.pos.z - s.forward.z * BEHIND,
        );
        orbit.target.set(s.pos.x, ACTOR_LOOK_Y, s.pos.z);
        orbit.update();
      }
    } else if (savedValid.current && orbit) {
      // Restore orbit pose on exit.
      camera.position.copy(savedPos.current);
      orbit.target.copy(savedTarget.current);
      orbit.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following]);

  // While following, slide BOTH the camera position AND the orbit target
  // by the actor's displacement each frame. The user's drag-to-orbit
  // motion adjusts the angle/distance, but the relative offset between
  // camera and target stays whatever the user has set.
  const lastActorPos = useRef<THREE.Vector3 | null>(null);
  useFrame(() => {
    if (!following || !orbit) return;
    const s = sampleActor(floor);
    if (!s) return;
    const ACTOR_LOOK_Y = 1.1;
    const desired = new THREE.Vector3(s.pos.x, ACTOR_LOOK_Y, s.pos.z);
    if (lastActorPos.current === null) {
      lastActorPos.current = desired.clone();
      return;
    }
    const delta = desired.clone().sub(lastActorPos.current);
    // Smooth the per-frame delta a bit so micro-jitter on tight corners
    // doesn't translate into camera shake.
    delta.multiplyScalar(0.85);
    camera.position.add(delta);
    orbit.target.add(delta);
    orbit.update();
    lastActorPos.current.copy(desired);
  });

  // Forget the cached actor position when follow toggles off so the next
  // session starts fresh.
  useEffect(() => {
    if (!following) lastActorPos.current = null;
  }, [following]);

  return null;
}
