/**
 * Wall-classification vocabulary + the practical door/camera/reader/
 * sensor/network placement rules. This is the "professional installer"
 * brain — read carefully before placing anything.
 */
export const SPATIAL = `═══ SPATIAL REASONING — READ BEFORE PLACING DOORS OR DEVICES ═══

The walls list classifies every wall as HORIZONTAL/VERTICAL/DIAGONAL
and as EXTERIOR (NORTH/SOUTH/EAST/WEST) or INTERIOR. Use this
vocabulary instead of guessing.

DOOR PLACEMENT — practical rules
  1. INTERIOR doors go on INTERIOR walls. Don't put an interior
     door on an EXTERIOR wall — that would be the building
     entrance. Use that role exactly once, on the wall the user
     calls out as the front entry.
  2. A wall typically gets at MOST ONE door. If you already put a
     door on a wall, pick a different wall for the next room.
  3. Start from the wall's published mid (mx, my) coordinates. The
     server snaps the door onto the wall segment anyway, but
     supplying the midpoint reads as "centered" in 3D.
  4. Lock doors on rooms that contain sensitive gear (server, IT,
     records, mechanical). Leave general-use doors unlocked.
  5. When a room has only one interior wall facing the corridor,
     that's the door wall — even if other walls are longer.

CAMERA PLACEMENT — practical rules
  • Mount in corners angled INTO the room (rotation = ~45° offset
    from the corner). One corner camera per ~6 m of room dimension
    on the long axis, mounted at 2.6–2.8 m.
  • Cover every entry/exit with one camera that can see faces.
  • Hallways: PTZ or bullet at one end, watching the run length.
  • Don't double-cover the same square footage from cameras owned
    by overlapping FOVs — flag redundancy as a warning annotation.

READER PLACEMENT — practical rules
  • Pair every controlled door with a reader on the OUTSIDE
    (approach) side, ~1 m to the latch side of the door, mounted
    at 1.2 m.
  • Server / IT / electrical room doors should always have a
    reader. Front entries usually have one too.

SENSOR PLACEMENT — practical rules
  • Motion sensors are ceiling-mounted near the ROOM CENTER.
  • Glass-break sensors go within 3 m of a window on the inside
    wall.
  • Door-contact sensors sit on the door itself — coordinate the
    door's position via add_door first, then drop the sensor at the
    same (x, y).

NETWORK GEAR — practical rules
  • NVR + main switch live together in the server / IT room.
  • Access points distribute across the floor at ~12 m spacing,
    centered in their coverage area.

Use the floor-extents centroid + per-wall metadata to make these
calls. If unsure between two walls, pick the longer INTERIOR wall —
it'll usually be the correct one.

Warnings work similarly: if you notice a real issue while doing other
work, drop add_annotation kind="warning" rather than burying it in text.`;
