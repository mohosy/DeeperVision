/**
 * Tool catalog — what each callable does. The actual JSON schemas live in
 * route.ts alongside the API call; this is the prose Claude reads.
 */
export const TOOLS = `═══ TOOLS ═══

DESIGN EDITS (apply to the floor immediately, client-side):
  add_device              add a camera / reader / sensor / network device
  move_device             relocate a device by id
  rotate_device           change a device's rotation
  remove_device           delete a device
  update_device           change label / range / FOV / mount / status / notes
  add_wall                draw a wall segment
  remove_wall             delete a wall by id
  add_door                add a door on a wall by id
  set_floor_scale         recalibrate pixels-per-meter

WIRING (manually-authored cable runs that show up in 2D + 3D and the
permit cable schedule):
  add_cable               draw a cable between two device ids with an
                          explicit cable type. Use this PROACTIVELY when
                          placing devices that obviously need wiring.
                          Cables auto-route around walls — you do NOT
                          have to supply waypoints. Only set waypoints
                          when you want to FORCE a specific path.
  remove_cable            delete a cable by id.

  ⚠️ STRICT cable-type rules — NEVER pick a different cable for these
  device classes. The wrong cable will fail inspection and forces the
  integrator to re-pull. Match by the SOURCE device type:

    SOURCE: camera (any subtype)         → cat6      (PoE+, ≤100 m)
    SOURCE: network / access-point       → cat6      (PoE+ uplink)
    SOURCE: network / nvr                → cat6      (uplink to switch)
    SOURCE: network / switch ↔ switch    → cat6      (or fiber if >100 m)
    SOURCE: reader (card or keypad)      → 22-4      (Belden 5504UE — Wiegand/OSDP)
    SOURCE: reader (biometric)           → 22-4      (same — OSDP carries biometric)
    SOURCE: sensor / motion-pir          → 22-4      (4-conductor: power + dry contact)
    SOURCE: sensor / glass-break         → 22-4
    SOURCE: sensor / door-contact        → 22-2 ⇒ use 22-4 (extra conductors are spare)
    SOURCE: sensor / smoke or heat       → 18-2      (NFPA 72 — fire-alarm circuit)
    SOURCE: lock / electric-strike       → 18-2      (12/24 VDC from PSU)
    SOURCE: lock / mag-lock              → 18-2      (or 16-2 if run > 30 m)
    SOURCE: lock / exit-device           → 18-2
    SOURCE: intercom                     → cat6      (IP intercoms) OR 18-2 (analog)
    SOURCE: speaker (paging/mass-notif)  → speaker-16-2

  Cable-type quick reference:
    cat6        → IP / PoE devices ≤100 m (cameras, APs, NVRs, switches)
    cat6a       → 10G runs only (USE ONLY when user explicitly asks for 10G)
    fiber       → runs >100 m OR between buildings (use sparingly)
    22-4        → low-voltage data (readers, motion/glass/contact sensors)
    18-2        → door hardware power + fire-alarm 2-wire circuits
    16-2        → heavier door hardware OR runs > 30 m
    rg59        → legacy analog video ONLY (never for new IP cameras)
    speaker-16-2 → paging / mass-notification speakers

  TARGET picker (which device the SOURCE drop should terminate at):
    cameras + APs         → nearest network/nvr if any, else network/switch
    readers               → nearest network/switch (controller stand-in)
    door hardware (locks) → nearest power supply if modeled, else network/switch
    sensors               → nearest network/switch (panel stand-in)
    intercoms             → nearest network/switch
    speakers              → nearest network/switch (amp stand-in)

  When the user uploads or designs a security system with multiple
  devices that clearly need to talk to each other (cameras + an NVR,
  readers + a controller, door hardware + a PSU), CALL add_cable for
  EACH logical connection so the integrator gets a complete wiring plan
  without asking. Don't be shy — that's what makes you useful here.
  But ALWAYS pick the cable type from the strict table above. Mixing
  cat6 to a reader, or 18-2 to a camera, is a hard error.

ANNOTATIONS (sticky notes pinned on the canvas — visible to user):
  add_annotation          pin a "note" / "warning" / "idea" at (x, y) on the
                          floor plan. Use this to call out concerns, flag
                          compliance issues, or suggest improvements WITHOUT
                          actually editing the design. Great for things you
                          want the user to decide on.
  remove_annotation       delete an annotation by id

QUOTE (shape the project quote — bill of materials, rates, line items):
  add_quote_line_item     add a custom line item (permits, lift rental, etc.)
  remove_quote_line_item  remove a line item by index
  update_quote_settings   change rates, client info, brand color, regional
                          notes, narrative, etc.`;
