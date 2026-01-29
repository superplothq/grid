import {GridWin, Constructor} from "./types";

const win = window  as unknown as GridWin;

if (!win.__dataflow_grid__) {
  win.__dataflow_grid__ = {
    registry: new Map()
  };
}
export const REGISTRY = win.__dataflow_grid__.registry;

export function addToRegistry<T>(
  type: string,
  name: string,
  cls: Constructor<T>
): void {
  if (!REGISTRY.has(type)) {
    REGISTRY.set(type, new Map());
  }
  REGISTRY.get(type)!.set(name, cls);
}

export function getFromRegistry<T>(type: string, name: string): Constructor<T> | null {
  return (REGISTRY.get(type)?.get(name) as Constructor<T>) ?? null;
}
