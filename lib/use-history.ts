"use client";

import { useEffect, useState } from "react";
import { useDesignStore } from "./store";

type TemporalState = {
  undo: () => void;
  redo: () => void;
  pastStates: unknown[];
  futureStates: unknown[];
};

function getTemporal(): TemporalState | null {
  const store = useDesignStore as unknown as {
    temporal?: { getState: () => TemporalState };
  };
  return store.temporal?.getState() ?? null;
}

export function useDesignStoreUndo() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const store = useDesignStore as unknown as {
      temporal?: { subscribe: (cb: () => void) => () => void };
    };
    return store.temporal?.subscribe(() => setTick((t) => t + 1));
  }, []);
  const temporal = getTemporal();
  return {
    undo: () => temporal?.undo(),
    canUndo: (temporal?.pastStates.length ?? 0) > 0,
    _tick: tick,
  };
}

export function useDesignStoreRedo() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const store = useDesignStore as unknown as {
      temporal?: { subscribe: (cb: () => void) => () => void };
    };
    return store.temporal?.subscribe(() => setTick((t) => t + 1));
  }, []);
  const temporal = getTemporal();
  return {
    redo: () => temporal?.redo(),
    canRedo: (temporal?.futureStates.length ?? 0) > 0,
    _tick: tick,
  };
}
