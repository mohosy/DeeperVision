"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal } from "zundo";
import type {
  DesignDocument,
  Device,
  DeviceType,
  Floor,
  ThreeDMode,
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

export type Tool = "select" | "wall" | "calibrate";

export interface ViewTransform {
  scale: number;
  offset: Vec2;
}

interface DesignState {
  designs: Record<string, DesignDocument>;
  currentDesignId: string | null;
  viewMode: ViewMode;
  threeDMode: ThreeDMode;
  selectedDeviceId: string | null;
  tool: Tool;
  showCoverage: boolean;
  viewTransform: ViewTransform;

  ensureDesign(id: string): DesignDocument;
  setCurrentDesign(id: string): void;
  updateDesignName(id: string, name: string): void;

  setViewMode(mode: ViewMode): void;
  setThreeDMode(mode: ThreeDMode): void;
  selectDevice(deviceId: string | null): void;
  setTool(tool: Tool): void;
  toggleCoverage(): void;
  setViewTransform(t: ViewTransform): void;

  addFloor(): void;
  setActiveFloor(floorId: string): void;
  updateFloor(floorId: string, partial: Partial<Omit<Floor, "id">>): void;

  addDevice(floorId: string, type: DeviceType, position: Vec2): Device;
  updateDevice(floorId: string, deviceId: string, partial: Partial<Device>): void;
  removeDevice(floorId: string, deviceId: string): void;

  addWall(floorId: string, wall: Omit<Wall, "id">): void;
  removeWall(floorId: string, wallId: string): void;
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
        viewMode: "2d",
        threeDMode: "orbit",
        selectedDeviceId: null,
        tool: "select",
        showCoverage: true,
        viewTransform: { scale: 1, offset: { x: 0, y: 0 } },

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

        setViewMode(mode) {
          set({ viewMode: mode });
        },

        setThreeDMode(mode) {
          set({ threeDMode: mode });
        },

        selectDevice(deviceId) {
          set({ selectedDeviceId: deviceId });
        },

        setTool(tool) {
          set({ tool });
        },

        toggleCoverage() {
          set((state) => ({ showCoverage: !state.showCoverage }));
        },

        setViewTransform(t) {
          set({ viewTransform: t });
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

        addDevice(floorId, type, position) {
          const newDevice: Device = {
            ...defaultsFor(type),
            id: uid("dev"),
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

        addWall(floorId, wall) {
          set((state) => {
            const id = state.currentDesignId;
            if (!id) return state;
            const design = state.designs[id];
            if (!design) return state;
            const newWall: Wall = { ...wall, id: uid("wall") };
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
      }),
      {
        limit: 50,
        partialize: (state) => ({ designs: state.designs }),
        equality: (a, b) => a.designs === b.designs,
      }
    ),
    {
      name: "deeper-vision-store",
      version: 2,
      partialize: (state) => ({
        designs: state.designs,
        currentDesignId: state.currentDesignId,
        viewMode: state.viewMode,
        threeDMode: state.threeDMode,
        showCoverage: state.showCoverage,
      }),
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
