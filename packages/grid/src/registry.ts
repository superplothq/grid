import {ComponentClass, GridWin} from "./types";

const win = window  as unknown as GridWin;

if (!win.__dataflow_grid__) {
  win.__dataflow_grid__ = {
    registry: new Map()
  };
}
export const REGISTRY = win.__dataflow_grid__.registry;

export function addToRegistry<T extends ComponentClass>(
  type: string,
  name: string,
  cls: T
): void {
  if (!REGISTRY.has(type)) {
    REGISTRY.set(type, new Map());
  }
  REGISTRY.get(type)!.set(name, cls);
}

export function getFromRegistry<T extends ComponentClass>(type: string, name: string): T | null {
  return (REGISTRY.get(type)?.get(name) as T) ?? null;
}
