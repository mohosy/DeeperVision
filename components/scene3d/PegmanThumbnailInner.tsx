"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { PegmanCharacter } from "./PegmanCharacter";

/**
 * Tiny 3D scene that just shows the Pegman character. Used as the drag
 * handle's visual on the 3D mode panel.
 *
 * `preserveDrawingBuffer: true` is critical — without it,
 * canvas.toDataURL() returns a blank image because the browser
 * aggressively clears the WebGL buffer after each frame. Trade-off:
 * slightly more memory, but only one tiny canvas so it's negligible.
 *
 * Camera/light setup matches the warm "studio" look of the simulator
 * actor so the icon reads as the same character.
 */
export function PegmanThumbnailInner() {
  return (
    <Canvas
      dpr={[1, 2]}
      // Slight 3/4 perspective like an isometric character icon. Pulled
      // back farther + wider FOV than before so the WHOLE character fits
      // inside the tiny size-8 button — previously the head got cropped
      // because the camera was too tight on a square viewport.
      camera={{ position: [1.6, 2.0, 2.0], fov: 36, near: 0.1, far: 10 }}
      gl={{
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true, // required for toDataURL() snapshots
      }}
      onCreated={({ camera, gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.setClearColor(0x000000, 0);
        // Aim slightly higher so the character sits center-frame
        // (its head + chest, not its waist).
        camera.lookAt(0, 0.55, 0);
        camera.updateMatrixWorld(true);
      }}
      style={{ pointerEvents: "none" }}
    >
      {/* Lighting tuned for a small viewing angle with strong shape read. */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[2, 3, 2]} intensity={1.15} />
      <directionalLight position={[-1.5, 1.5, -1]} intensity={0.35} />

      {/* The character sits with feet at y=0; we look slightly down on it.
          Scaled down a touch so it fits cleanly inside the cramped
          button container with breathing room top/bottom. */}
      <group scale={0.88}>
        <PegmanCharacter withOutlines={false} />
      </group>

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.35}
        scale={2}
        blur={2.4}
        far={1.5}
        resolution={256}
        color="#000000"
      />
    </Canvas>
  );
}
