"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal } from "zundo";
import type {
  Annotation,
  DesignDocument,
  Device,
  DevicePhoto,
  DeviceType,
  Door,
  Floor,
  InstallStatus,
  ThreeDMode,
  TimeOfDay,
  Vec2,
  ViewMode,
  Wall,
} from "@/types/design";
import {
  CAMERA_DEFAULTS,
  NETWORK_DEFAULTS,
  READER_DEFAULTS,
  SENSOR_DEFAULTS,
} from "@/types/design";
import { buildDemoFloor } from "./demo-design";
import { DEFAULT_QUOTE_SETTINGS, type QuoteSettings } from "./pricing";
import { type CatalogProduct } from "./catalog";

function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function createDefaultFloor(): Floor {
  return {
    id: uid("floor"),
    name: "Ground floor",
    index: 0,
    planImage: null,
    scale: 50,
    ceilingHeight: 2.7,
    walls: [],
    devices: [],
    doors: [],
    annotations: [],
  };
}

export function createDefaultDesign(id?: string): DesignDocument {
  const floor = createDefaultFloor();
  return {
    id: id ?? uid("design"),
    name: "Untitled design",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    floors: [floor],
    activeFloorId: floor.id,
  };
}

export type Tool =
  | "select"
  | "wall"
  | "calibrate"
  | "door"
  | "correct-walls"
  | "wire";

export interface ViewTransform {
  scale: number;
  offset: Vec2;
}

/** Which device categories are currently visible on the canvas. */
export interface VisibilityFilter {
  byType: Record<DeviceType, boolean>;
  byStatus: Record<InstallStatus, boolean>;
}

export const DEFAULT_VISIBILITY: VisibilityFilter = {
  byType: { camera: true, reader: true, sensor: true, network: true },
  byStatus: { proposed: true, installed: true, decommissioned: false },
};

interface DesignState {
  designs: Record<string, DesignDocument>;
  currentDesignId: string | null;
  viewMode: ViewMode;
  threeDMode: ThreeDMode;
  /** Day / dusk / night lighting preset for the 3D scene. Transient — not
   *  persisted, defaults to "day" on every load. */
  timeOfDay: TimeOfDay;
  selectedDeviceId: string | null;
  /** Currently-selected cable. Mutually exclusive with selectedDeviceId
   *  so the properties panel can show one OR the other cleanly. */
  selectedCableId: string | null;
  tool: Tool;
  showCoverage: boolean;
  /** Render the auto-routed cable runs (camera/reader/AP → NVR/switch) as
   *  L-shaped lines on the 2D canvas and as ceiling-routed cables in 3D. */
  showCabling: boolean;
  /** Whether the in-app tour overlay is currently running. Transient. */
  tourActive: boolean;
  /** Current step index when the tour is running. Transient. */
  tourStep: number;
  /** Whether the user has finished or skipped the tour at least once. Persisted
   *  so we don't re-auto-launch it on every page load — they can still replay
   *  it from the Project menu. */
  tourSeen: boolean;
  viewTransform: ViewTransform;
  quoteSettings: QuoteSettings;
  aiSurveyOpen: boolean;
  /** Last AI-Survey self-check result. Set after each survey runs; null
   *  when no survey has been checked yet (or when the user dismisses the
   *  banner). Pure UI/transient — not persisted. */
  surveyCheck:
    | {
        overallConfidence: "high" | "medium" | "low";
        summary: string;
        issues: {
          kind: string;
          severity: "info" | "warning" | "critical";
          description: string;
        }[];
        ranAt: number;
      }
    | null;
  aiAdvisorOpen: boolean;
  quoteOpen: boolean;
  visibility: VisibilityFilter;
  /** When the user drops the "Pegman" character on the 3D scene, we
      store the world-space drop point here. The 3D scene reads it as
      the walk-mode spawn, replacing the auto-computed default. */
  walkSpawnOverride: [number, number, number] | null;
  /** When the user is in POV mode, this is the camera-device id whose POV
      the 3D scene is rendering. Cleared when leaving POV. */
  cameraPovTargetId: string | null;
  /** Which right-sidebar tab is showing — properties or the AI chat. */
  rightTab: "properties" | "ai";
  /**
   * Transient marker: the AI agent's "cursor" position on the 2D canvas.
   * When the chat applies an op, we briefly broadcast its target position
   * so the canvas can render a labelled ping where Claude is "working".
   * The label describes the action ("Placing camera", "Moving device", …).
   * Cleared automatically ~1s after each ping.
   */
  aiCursor: {
    x: number;
    y: number;
    label: string;
    tone:
      | "add"
      | "move"
      | "remove"
      | "edit"
      | "search"
      | "rotate"
      | "annotate"
      | "wall"
      | "door"
      | "quote"
      | "calibrate";
    nonce: number;
  } | null;

  ensureDesign(id: string): DesignDocument;
  setCurrentDesign(id: string): void;
  updateDesignName(id: string, name: string): void;
  updateQuoteSettings(partial: Partial<QuoteSettings>): void;
  importDesign(design: DesignDocument): void;

  setViewMode(mode: ViewMode): void;
  setThreeDMode(mode: ThreeDMode): void;
  setTimeOfDay(mode: TimeOfDay): void;
  selectDevice(deviceId: string | null): void;
  selectCable(cableId: string | null): void;
  setTool(tool: Tool): void;
  toggleCoverage(): void;
  toggleCabling(): void;
  startTour(): void;
  setTourStep(step: number): void;
  finishTour(): void;
  setViewTransform(t: ViewTransform): void;
  setAISurveyOpen(open: boolean): void;
  setSurveyCheck(check: DesignState["surveyCheck"]): void;
  setAIAdvisorOpen(open: boolean): void;
  setQuoteOpen(open: boolean): void;
  setWalkSpawnOverride(spawn: [number, number, number] | null): void;
  /**
   * Enter (or exit) camera-POV mode. Passing a device id sets the target
   * and flips threeDMode to "pov"; passing null clears the target and
   * returns the user to orbit.
   */
  enterCameraPov(deviceId: string): void;
  exitCameraPov(): void;
  setRightTab(tab: "properties" | "ai"): void;
  pingAICursor(input: {
    x: number;
    y: number;
    label: string;
    tone:
      | "add"
      | "move"
      | "remove"
      | "edit"
      | "search"
      | "rotate"
      | "annotate"
      | "wall"
      | "door"
      | "quote"
      | "calibrate";
  }): void;
  clearAICursor(): void;
  toggleDeviceTypeVisible(type: DeviceType): void;
  toggleInstallStatusVisible(status: InstallStatus): void;
  /** Bulk-reset to all-on (proposed+installed by default; decommissioned off). */
  resetVisibility(): void;
  /** Photos: add/remove on a specific device. */
  addDevicePhoto(floorId: string, deviceId: string, photo: DevicePhoto): void;
  removeDevicePhoto(floorId: string, deviceId: string, photoId: string): void;

  addFloor(): void;
  setActiveFloor(floorId: string): void;
  updateFloor(floorId: string, partial: Partial<Omit<Floor, "id">>): void;

  addDevice(
    floorId: string,
    type: DeviceType,
    position: Vec2,
    catalogProduct?: CatalogProduct,
    /** Optional pre-assigned id from the server (AI chat agent). When
        omitted, a fresh uid is generated. */
    externalId?: string,
  ): Device;
  updateDevice(floorId: string, deviceId: string, partial: Partial<Device>): void;
  removeDevice(floorId: string, deviceId: string): void;

  addFurniture(
    floorId: string,
    item: Omit<import("@/types/design").FurnitureItem, "id">,
    externalId?: string,
  ): import("@/types/design").FurnitureItem;
  updateFurniture(
    floorId: string,
    id: string,
    partial: Partial<import("@/types/design").FurnitureItem>,
  ): void;
  removeFurniture(floorId: string, id: string): void;
  addWall(floorId: string, wall: Omit<Wall, "id">, externalId?: string): void;
  removeWall(floorId: string, wallId: string): void;
  addCable(
    floorId: string,
    cable: Omit<import("@/types/design").Cable, "id">,
    externalId?: string,
  ): import("@/types/design").Cable;
  updateCable(
    floorId: string,
    cableId: string,
    partial: Partial<import("@/types/design").Cable>,
  ): void;
  removeCable(floorId: string, cableId: string): void;
  /** Partial update for a single wall — used by the wall-correction tool
   *  to drag endpoints without rebuilding the whole wall list. */
  updateWall(floorId: string, wallId: string, partial: Partial<Wall>): void;

  addDoor(floorId: string, door: Omit<Door, "id">, externalId?: string): Door;
  updateDoor(floorId: string, doorId: string, partial: Partial<Door>): void;
  removeDoor(floorId: string, doorId: string): void;

  addAnnotation(
    floorId: string,
    annotation: Omit<Annotation, "id" | "createdAt">,
  ): Annotation;
  updateAnnotation(
    floorId: string,
    annotationId: string,
    partial: Partial<Annotation>,
  ): void;
  removeAnnotation(floorId: string, annotationId: string): void;

  loadDemo(): void;
}

function defaultsFor(type: DeviceType): Omit<Device, "id" | "position"> {
  switch (type) {
    case "camera":
      return CAMERA_DEFAULTS;
    case "reader":
      return READER_DEFAULTS;
    case "sensor":
      return SENSOR_DEFAULTS;
    case "network":
      return NETWORK_DEFAULTS;
  }
}

export const useDesignStore = create<DesignState>()(
  persist(
    temporal(
      (set, get) => ({
        designs: {},
        currentDesignId: null,
        viewMode: "3d",
        threeDMode: "orbit",
        timeOfDay: "day",
        selectedDeviceId: null,
        selectedCableId: null,
        tool: "select",
        showCoverage: true,
        showCabling: true,
        tourActive: false,
        tourStep: 0,
        tourSeen: false,
        viewTransform: { scale: 1, offset: { x: 0, y: 0 } },
        quoteSettings: DEFAULT_QUOTE_SETTINGS,
        aiSurveyOpen: false,
        surveyCheck: null,
        aiAdvisorOpen: false,
        quoteOpen: false,
        visibility: DEFAULT_VISIBILITY,
        walkSpawnOverride: null,
        cameraPovTargetId: null,
        rightTab: "ai",
        aiCursor: null,

        ensureDesign(id) {
          const existing = get().designs[id];
          if (existing) return existing;
          const fresh = createDefaultDesign(id);
          set((state) => ({
            designs: { ...state.designs, [id]: fresh },
            currentDesignId: id,
          }));
          return fresh;
        },

        setCurrentDesign(id) {
          set({ currentDesignId: id });
        },

        updateDesignName(id, name) {
          set((state) => {
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: { ...design, name, updatedAt: nowISO() },
              },
            };
          });
        },

        updateQuoteSettings(partial) {
          set((state) => ({
            quoteSettings: { ...state.quoteSettings, ...partial },
          }));
        },

        importDesign(design) {
          set((state) => ({
            designs: { ...state.designs, [design.id]: design },
            currentDesignId: design.id,
          }));
        },

        setViewMode(mode) {
          set({ viewMode: mode });
        },

        setThreeDMode(mode) {
          set({ threeDMode: mode });
        },

        setTimeOfDay(mode) {
          set({ timeOfDay: mode });
        },

        selectDevice(deviceId) {
          // Selecting a device clears any cable selection so the
          // properties panel doesn't show stale cable data.
          set({ selectedDeviceId: deviceId, selectedCableId: null });
        },

        selectCable(cableId) {
          set({ selectedCableId: cableId, selectedDeviceId: null });
        },

        setTool(tool) {
          set({ tool });
        },

        toggleCoverage() {
          set((state) => ({ showCoverage: !state.showCoverage }));
        },

        toggleCabling() {
          set((state) => ({ showCabling: !state.showCabling }));
        },

        startTour() {
          set({ tourActive: true, tourStep: 0 });
        },

        setTourStep(step) {
          set({ tourStep: step });
        },

        finishTour() {
          // Mark seen so we don't auto-start again. The user can still replay
          // the tour from the Project menu.
          set({ tourActive: false, tourStep: 0, tourSeen: true });
        },

        setViewTransform(t) {
          set({ viewTransform: t });
        },

        setAISurveyOpen(open) {
          set({ aiSurveyOpen: open });
        },

        setSurveyCheck(check) {
          set({ surveyCheck: check });
        },

        setAIAdvisorOpen(open) {
          set({ aiAdvisorOpen: open });
        },

        setQuoteOpen(open) {
          set({ quoteOpen: open });
        },

        setWalkSpawnOverride(spawn) {
          set({ walkSpawnOverride: spawn });
        },

        enterCameraPov(deviceId) {
          // Auto-switch to the 3D view if we're not already there.
          set({
            cameraPovTargetId: deviceId,
            threeDMode: "pov",
            viewMode: "3d",
            selectedDeviceId: deviceId,
          });
        },

        exitCameraPov() {
          set({ cameraPovTargetId: null, threeDMode: "orbit" });
        },

        setRightTab(tab) {
          set({ rightTab: tab });
        },

        pingAICursor({ x, y, label, tone }) {
          set({
            aiCursor: { x, y, label, tone, nonce: Date.now() + Math.random() },
          });
        },

        clearAICursor() {
          set({ aiCursor: null });
        },

        toggleDeviceTypeVisible(type) {
          set((state) => ({
            visibility: {
              ...state.visibility,
              byType: {
                ...state.visibility.byType,
                [type]: !state.visibility.byType[type],
              },
            },
          }));
        },

        toggleInstallStatusVisible(status) {
          set((state) => ({
            visibility: {
              ...state.visibility,
              byStatus: {
                ...state.visibility.byStatus,
                [status]: !state.visibility.byStatus[status],
              },
            },
          }));
        },

        resetVisibility() {
          set({ visibility: DEFAULT_VISIBILITY });
        },

        addDevicePhoto(floorId, deviceId, photo) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          devices: f.devices.map((d) =>
                            d.id === deviceId
                              ? { ...d, photos: [...(d.photos ?? []), photo] }
                              : d,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        removeDevicePhoto(floorId, deviceId, photoId) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          devices: f.devices.map((d) =>
                            d.id === deviceId
                              ? {
                                  ...d,
                                  photos: (d.photos ?? []).filter(
                                    (p) => p.id !== photoId,
                                  ),
                                }
                              : d,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        addFloor() {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            const newFloor: Floor = {
              ...createDefaultFloor(),
              name: `Level ${design.floors.length}`,
              index: design.floors.length,
            };
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: [...design.floors, newFloor],
                  activeFloorId: newFloor.id,
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        setActiveFloor(floorId) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: { ...design, activeFloorId: floorId },
              },
            };
          });
        },

        updateFloor(floorId, partial) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId ? { ...f, ...partial } : f
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        addDevice(floorId, type, position, catalogProduct, externalId) {
          const base = defaultsFor(type);
          const override: Record<string, unknown> = {};
          if (catalogProduct) {
            override.catalogId = catalogProduct.id;
            override.label = catalogProduct.fullName;
            if (catalogProduct.specs.fovDegrees != null) override.fovDegrees = catalogProduct.specs.fovDegrees;
            if (catalogProduct.specs.rangeMeters != null) override.rangeMeters = catalogProduct.specs.rangeMeters;
            if (catalogProduct.specs.irRange != null) override.irRange = catalogProduct.specs.irRange;
            if (catalogProduct.specs.resolution) override.resolution = catalogProduct.specs.resolution;
            if (catalogProduct.specs.coverageMeters != null) override.coverageMeters = catalogProduct.specs.coverageMeters;
            if (catalogProduct.specs.portCount != null) override.portCount = catalogProduct.specs.portCount;
            if (type === "camera") {
              override.cameraType = catalogProduct.subcategory;
              // Auto-generate lenses for multi-sensor cameras
              if (catalogProduct.subcategory === "multi-sensor" && catalogProduct.specs.lensCount) {
                const count = catalogProduct.specs.lensCount;
                const fov = catalogProduct.specs.fovDegrees ?? 90;
                const range = catalogProduct.specs.rangeMeters ?? 15;
                const lenses = [];
                for (let i = 0; i < count; i++) {
                  lenses.push({
                    id: uid("lens"),
                    label: `Lens ${i + 1}`,
                    fovDegrees: fov,
                    rangeMeters: range,
                    rotationOffset: (i * 2 * Math.PI) / count,
                    irRange: catalogProduct.specs.irRange,
                    resolution: catalogProduct.specs.resolution,
                  });
                }
                override.lenses = lenses;
              }
            }
            if (type === "reader") override.readerType = catalogProduct.subcategory;
            if (type === "sensor") override.sensorType = catalogProduct.subcategory;
            if (type === "network") override.networkType = catalogProduct.subcategory;
          }
          const newDevice: Device = {
            ...base,
            ...override,
            id: externalId ?? uid("dev"),
            position,
          } as Device;
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? { ...f, devices: [...f.devices, newDevice] }
                      : f
                  ),
                  updatedAt: nowISO(),
                },
              },
              selectedDeviceId: newDevice.id,
            };
          });
          return newDevice;
        },

        updateDevice(floorId, deviceId, partial) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          devices: f.devices.map((d) =>
                            d.id === deviceId
                              ? ({ ...d, ...partial } as Device)
                              : d
                          ),
                        }
                      : f
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        removeDevice(floorId, deviceId) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          devices: f.devices.filter((d) => d.id !== deviceId),
                        }
                      : f
                  ),
                  updatedAt: nowISO(),
                },
              },
              selectedDeviceId:
                state.selectedDeviceId === deviceId
                  ? null
                  : state.selectedDeviceId,
            };
          });
        },

        addFurniture(floorId, item, externalId) {
          const newItem: import("@/types/design").FurnitureItem = {
            ...item,
            id: externalId ?? uid("furn"),
          };
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          furniture: [...(f.furniture ?? []), newItem],
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
          return newItem;
        },

        updateFurniture(floorId, id, partial) {
          set((state) => {
            const did = state.currentDesignId;
            if (!did) return state;
            const design = state.designs[did];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [did]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          furniture: (f.furniture ?? []).map((it) =>
                            it.id === id ? { ...it, ...partial } : it,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        removeFurniture(floorId, id) {
          set((state) => {
            const did = state.currentDesignId;
            if (!did) return state;
            const design = state.designs[did];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [did]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          furniture: (f.furniture ?? []).filter(
                            (it) => it.id !== id,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        addWall(floorId, wall, externalId) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            const newWall: Wall = { ...wall, id: externalId ?? uid("wall") };
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? { ...f, walls: [...f.walls, newWall] }
                      : f
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        updateWall(floorId, wallId, partial) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          walls: f.walls.map((w) =>
                            w.id === wallId ? { ...w, ...partial } : w,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        removeWall(floorId, wallId) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? { ...f, walls: f.walls.filter((w) => w.id !== wallId) }
                      : f
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        addCable(floorId, cable, externalId) {
          // If no waypoints were specified, auto-route the cable along
          // the wall perimeter (ceiling-tray style). This matches how
          // real low-voltage installs are run — cables hug walls
          // instead of cutting diagonally across rooms.
          let resolvedWaypoints = cable.waypoints;
          if (!resolvedWaypoints || resolvedWaypoints.length === 0) {
            const state0 = get();
            const did = state0.currentDesignId;
            const design0 = did ? state0.designs[did] : null;
            const floor = design0?.floors.find((f) => f.id === floorId);
            const src = floor?.devices.find(
              (d) => d.id === cable.sourceDeviceId,
            );
            const tgt = floor?.devices.find(
              (d) => d.id === cable.targetDeviceId,
            );
            if (floor && src && tgt) {
              // Lazy require avoids a circular import — cabling.ts imports
              // floor types but doesn't depend on the store.
              resolvedWaypoints = require("./cabling").autoRouteCableWaypoints(
                src.position,
                tgt.position,
                floor.walls,
              );
            }
          }
          const newCable: import("@/types/design").Cable = {
            ...cable,
            waypoints: resolvedWaypoints ?? [],
            id: externalId ?? uid("cable"),
          };
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? { ...f, cables: [...(f.cables ?? []), newCable] }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
          return newCable;
        },

        updateCable(floorId, cableId, partial) {
          set((state) => {
            const did = state.currentDesignId;
            if (!did) return state;
            const design = state.designs[did];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [did]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          cables: (f.cables ?? []).map((c) =>
                            c.id === cableId ? { ...c, ...partial } : c,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        removeCable(floorId, cableId) {
          set((state) => {
            const did = state.currentDesignId;
            if (!did) return state;
            const design = state.designs[did];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [did]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          cables: (f.cables ?? []).filter(
                            (c) => c.id !== cableId,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        addDoor(floorId, door, externalId) {
          const newDoor: Door = { ...door, id: externalId ?? uid("door") };
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? { ...f, doors: [...(f.doors ?? []), newDoor] }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
          return newDoor;
        },

        updateDoor(floorId, doorId, partial) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          doors: (f.doors ?? []).map((d) =>
                            d.id === doorId ? { ...d, ...partial } : d,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        addAnnotation(floorId, annotation) {
          const newAnno: Annotation = {
            ...annotation,
            id: uid("anno"),
            createdAt: nowISO(),
          };
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          annotations: [...(f.annotations ?? []), newAnno],
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
          return newAnno;
        },

        updateAnnotation(floorId, annotationId, partial) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          annotations: (f.annotations ?? []).map((a) =>
                            a.id === annotationId ? { ...a, ...partial } : a,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        removeAnnotation(floorId, annotationId) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          annotations: (f.annotations ?? []).filter(
                            (a) => a.id !== annotationId,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        removeDoor(floorId, doorId) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  floors: design.floors.map((f) =>
                    f.id === floorId
                      ? {
                          ...f,
                          doors: (f.doors ?? []).filter((d) => d.id !== doorId),
                          // Also clear any reader that controlled this door.
                          devices: f.devices.map((dev) =>
                            dev.type === "reader" &&
                            dev.controlsDoorId === doorId
                              ? { ...dev, controlsDoorId: undefined }
                              : dev,
                          ),
                        }
                      : f,
                  ),
                  updatedAt: nowISO(),
                },
              },
            };
          });
        },

        loadDemo() {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            const demoFloor: Floor = {
              ...buildDemoFloor(),
              id: uid("floor"),
              index: 0,
            };
            return {
              designs: {
                ...state.designs,
                [id]: {
                  ...design,
                  name: "Demo office",
                  floors: [demoFloor],
                  activeFloorId: demoFloor.id,
                  updatedAt: nowISO(),
                },
              },
              selectedDeviceId: null,
              // Intentionally NOT overriding viewMode here — the user's
              // current view should be respected. If they pressed "Try
              // the demo" from the 3D empty state, they stay in 3D and
              // immediately see the building extrude. If they were in
              // 2D, the demo loads in 2D.
              viewTransform: { scale: 1, offset: { x: 0, y: 0 } },
              // Always reset the 3D sub-mode to orbit on demo load so the
              // user gets a clean overview of the building first — never
              // dropped straight into walk or POV mode.
              threeDMode: "orbit",
              cameraPovTargetId: null,
              walkSpawnOverride: null,
            };
          });
        },
      }),
      {
        limit: 50,
        partialize: (state) => ({ designs: state.designs }),
        equality: (a, b) => a.designs === b.designs,
        // Coalesce bursts of state changes into a single undo entry. The AI
        // chat applies operations one-by-one as Claude streams them; without
        // this, a 5-camera placement would be 5 undo steps. The leading-edge
        // throttle saves history on the FIRST change in a burst (capturing
        // the pre-burst state), then drops subsequent changes within the
        // window. One Cmd-Z reverts the whole AI turn.
        handleSet: (handleSet) => {
          let lastSaveAt = 0;
          const BURST_MS = 400;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return ((pastState: unknown, ...rest: unknown[]) => {
            const now = Date.now();
            if (now - lastSaveAt < BURST_MS) return;
            lastSaveAt = now;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (handleSet as any)(pastState, ...rest);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any;
        },
      }
    ),
    {
      name: "deeper-vision-store",
      version: 6,
      // v3 → v4: added installStatus, photos, warrantyUntil, lastInspectionAt,
      //          endOfLifeAt to every device.
      // v4 → v5: added Floor.doors[].
      // v5 → v6: added Floor.annotations[].
      migrate: (persistedState, fromVersion) => {
        const state = persistedState as {
          designs?: Record<string, DesignDocument>;
        };
        if (!state?.designs) return state;
        if (fromVersion < 4) {
          for (const design of Object.values(state.designs)) {
            for (const floor of design.floors ?? []) {
              for (const device of floor.devices ?? []) {
                const d = device as Device & {
                  installStatus?: InstallStatus;
                  photos?: DevicePhoto[];
                };
                if (d.installStatus === undefined) d.installStatus = "proposed";
                if (!Array.isArray(d.photos)) d.photos = [];
              }
            }
          }
        }
        if (fromVersion < 5) {
          for (const design of Object.values(state.designs)) {
            for (const floor of design.floors ?? []) {
              const f = floor as Floor & { doors?: unknown };
              if (!Array.isArray(f.doors)) f.doors = [];
            }
          }
        }
        if (fromVersion < 6) {
          for (const design of Object.values(state.designs)) {
            for (const floor of design.floors ?? []) {
              const f = floor as Floor & { annotations?: unknown };
              if (!Array.isArray(f.annotations)) f.annotations = [];
            }
          }
        }
        return state;
      },
      partialize: (state) => ({
        designs: state.designs,
        currentDesignId: state.currentDesignId,
        viewMode: state.viewMode,
        // threeDMode intentionally NOT persisted — it's a transient sub-mode
        // (orbit / walk / pov) that should always reset to "orbit" on reload.
        // Persisting it means a refresh while in walk mode lands the user
        // back in walk at a stale spawn, which also used to crash R3F.
        showCoverage: state.showCoverage,
        showCabling: state.showCabling,
        tourSeen: state.tourSeen,
        quoteSettings: state.quoteSettings,
        visibility: state.visibility,
      }),
      // Anyone whose localStorage was written before threeDMode was removed
      // from partialize still has `threeDMode: 'walk'` (or 'pov') stuck on
      // disk. Force it back to orbit at rehydrate time so 3D always opens
      // with an overview, never mid-walkthrough at a stale spawn.
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<DesignState>) ?? {};
        return {
          ...currentState,
          ...persisted,
          threeDMode: "orbit",
          cameraPovTargetId: null,
          walkSpawnOverride: null,
        };
      },
    }
  )
);

export function useCurrentDesign(): DesignDocument | null {
  const id = useDesignStore((s) => s.currentDesignId);
  const designs = useDesignStore((s) => s.designs);
  return id ? designs[id] ?? null : null;
}

export function useActiveFloor(): Floor | null {
  const design = useCurrentDesign();
  if (!design) return null;
  return design.floors.find((f) => f.id === design.activeFloorId) ?? null;
}
