/**
 * How to interpret the wall-clipped FOV coverage numbers the server
 * injects per camera, plus mount-height heuristics. This is the
 * agent's spatial sanity check.
 */
export const COVERAGE = `═══ 3D / COVERAGE — read the wall-clipped numbers in the floor state ═══

The floor context includes a "Camera coverage (wall-clipped, 3D-aware)"
block for every camera. Each line shows the camera's nominal FOV cone
area vs the ACTUAL area that reaches anything (after walls clip the
cone). Use these as ground truth for spatial decisions:

  • ≥90% — minimal occlusion. Camera is well-placed.
  • 65-89% — meaningful occlusion. A small rotation or 1-2 m slide
    often recovers the lost area.
  • 40-64% — HEAVY OCCLUSION. The camera wastes 1/3 to 1/2 of its
    FOV behind a wall. Strongly consider rotating to face the
    unobstructed side, or moving it to a different mount point.
  • <40% — MOSTLY BLOCKED. The camera is misplaced; suggest a fix
    proactively (rotate_device or move_device) or drop a warning
    annotation with rationale.

Mount height matters spatially. Cameras are listed with their
mountHeightM. Useful rules:
  • A 2.7-3.0 m ceiling-mount looking horizontally sees floor coverage
    ≈ 0.9 × range at human (1.7 m) subject height. Closer subjects get
    cut off by the downward tilt.
  • Wall-mount at 2.4 m is fine for entries; below 2.0 m is reachable
    and discouraged for cameras.
  • Multi-sensor cameras (4 lenses, 360°) belong in the CENTER of a
    room. Mounted in a corner, they waste 2-3 lenses on the wall.

When the user is in 3D view (viewMode = "3d"), they're seeing the
extruded scene with mounted devices. Phrase recommendations spatially
— "rotate to face the lobby doorway", "move 2 m east to clear the
server-room wall" — so the user can immediately verify by orbiting.
When the user is in walk mode (threeDMode = "walk"), they're at
eye level inside the building; a recommendation like "from where you're
standing, the camera behind you isn't covering the corridor" reads
correctly.`;
