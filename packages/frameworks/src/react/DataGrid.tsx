import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useState,
} from "react";
import Grid from "grid/dist/renderer";
import type { DataGridProps, DataGridHandle } from "./types";
import { PageLoadingIndicator } from "./components/PageLoadingIndicator";

export const DataGrid = forwardRef<DataGridHandle, DataGridProps>(function DataGrid(props, ref) {
  const {
    data,
    layout = "pivot",
    theme,
    pageLoadingInProgress,
    pageLoadingIndicator: CustomLoadingIndicator,
    onCellRelease,
    onBeforeMeasure,
    onRenderComplete,
    onViewDataEmpty,
    onSelectionAdded,
    onSelectionRemoved,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const [gridInstance, setGridInstance] = useState(0);

  const onRenderCompleteRef = useRef(onRenderComplete);
  onRenderCompleteRef.current = onRenderComplete;
  const onViewDataEmptyRef = useRef(onViewDataEmpty);
  onViewDataEmptyRef.current = onViewDataEmpty;
  const onSelectionAddedRef = useRef(onSelectionAdded);
  onSelectionAddedRef.current = onSelectionAdded;
  const onSelectionRemovedRef = useRef(onSelectionRemoved);
  onSelectionRemovedRef.current = onSelectionRemoved;
  const onCellReleaseRef = useRef(onCellRelease);
  onCellReleaseRef.current = onCellRelease;
  const onBeforeMeasureRef = useRef(onBeforeMeasure);
  onBeforeMeasureRef.current = onBeforeMeasure;

  useEffect(() => {
    if (!containerRef.current) return;

    // TODO pass grid config here
    const config = theme ? { theme } : {};
    const grid = new Grid(config, containerRef.current, layout, {
      onCellRelease: (key, cell) => onCellReleaseRef.current?.(key, cell),
      onBeforeMeasure: () => onBeforeMeasureRef.current?.(),
    });
    gridRef.current = grid;

    grid.on("renderComplete", (payload) => onRenderCompleteRef.current?.(payload));
    grid.on("viewDataEmpty", (payload) => onViewDataEmptyRef.current?.(payload));
    grid.on("selectionAdded", (payload) => onSelectionAddedRef.current?.(payload));
    grid.on("selectionRemoved", (payload) => onSelectionRemovedRef.current?.(payload));

    setGridInstance((c) => c + 1);

    return () => {
      gridRef.current = null;
    };
  }, [layout, theme]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !data) return;

    const id = requestAnimationFrame(() => {
      grid.data = data;
      grid.draw();
    });
    return () => cancelAnimationFrame(id);
  }, [data, gridInstance]);

  useImperativeHandle(ref, () => ({
    get grid() { return gridRef.current!; },
  }), []);

  const Indicator = CustomLoadingIndicator ?? PageLoadingIndicator;

  return (
    <div style={{ width: "100%", height: "100%",  position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }} />
      {pageLoadingInProgress && <Indicator />}
    </div>
  );
});
