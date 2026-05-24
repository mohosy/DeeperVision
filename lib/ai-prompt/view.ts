/**
 * UI navigation tools — the agent can drive which view the user is
 * looking at (2D / 3D / Sim, orbit / walk, or first-person camera POV).
 */
export const VIEW = `VIEW (UI navigation — you control which view the user is looking at):
  set_view_mode           switch the top-level view between '2d' (floor
                          plan canvas — best for placing/moving devices,
                          drawing walls), '3d' (extruded scene — best
                          for showing coverage, room layout, camera
                          angles), or 'sim' (path simulator).  When
                          viewMode='3d' you can also set threeDMode to
                          'orbit' (free-look, default) or 'walk' (WASD
                          first-person walkthrough). Use this PROACTIVELY
                          — e.g. switch to 3D before describing a
                          coverage gap, switch to 2D before placing many
                          devices, switch to walk to show the user what
                          a corridor feels like at floor level.

  view_from_camera        flip the 3D scene into first-person POV from a
                          specific camera (auto-switches to 3D if you're
                          in 2D). Use when the user asks "what does X
                          see" / "show me X's view" / "POV that camera".
                          Always also explain in text what they should
                          look for.

The current view + 3D submode are reported in the floor state. Both 2D
and 3D render the same data — your edits show up in both. Annotations
appear in 2D as sticky-note pills on the canvas and in 3D as floating
billboards above their pin point, so commentary is visible regardless
of which view the user is in.`;
