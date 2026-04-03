import StandardLayout, { CellRenderResult, ViewModel } from "./standard-layout";
import { FlatSliceResult, FacetDataContext, FacetRendererContext, CellToMeasure, BaseSliceResult } from "./types";
import { GridDataViewModel } from "./grid-data-viewmodel";
import { FlattenedDataViewModel } from "./flattened-data-viewmodel";


export default class GroupedRowLayout extends StandardLayout {
  protected renderRowFacets(sliceData: BaseSliceResult, viewModel: ViewModel, ctx: { hintContentDirty: boolean | undefined }): CellRenderResult {
    const cellsToMeasure: CellToMeasure[] = [];
    const adjustCells: { cell: HTMLElement; level: number }[] = [];
    const nodesToAppend: HTMLElement[] = [];
    const flatSlice = sliceData as FlatSliceResult;
    if (!flatSlice.rowFacets || flatSlice.rowFacets.length === 0) return { cellsToMeasure, adjustCells, nodesToAppend };

    const numColFacetLevels = this.data!.numColFacetLevels;
    const hintContentDirty = ctx.hintContentDirty;
    const gridRowOffset = viewModel.fixtures.top.length;
    const gridColOffset = viewModel.fixtures.left.length;

    const rowFacetDefs = this.data!.facetDefs.row;

    for (let j = 0; j < flatSlice.rowFacets.length; j++) {
      const meta = flatSlice.rowMeta[j];
      const absoluteRowIndex = numColFacetLevels + viewModel.y0 + j;
      const key = `row-h-0-${absoluteRowIndex}`;

      // the margin-left on cell in css file acompanies this calculation; otherwise with scroll left of css grid layout
      // margin is not respected by browser
      let left = viewModel.fixedLeftVTrackPositions[viewModel.fixedLeftVTrackPositions.length - 1] + meta.depth * 16;
      const extraStyles: Record<string, number | string> = {
        left,
      };
      let cls = "row-facet facet facet-r-edge l-edge grouped-row";
      if (j === 0) cls += " first";
      if (j === flatSlice.rowFacets.length - 1) cls += " last";

      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: gridRowOffset + numColFacetLevels + j + 1,
        gridCol: gridColOffset + 1,
        hintContentDirty,
        cls,
        extraStyles,
      });

      cell.style.setProperty("--depth", String(meta.depth));
      // Without this there is white space between the indented row and grid
      cell.style.boxShadow = `${-meta.depth * 16}px 0px 0px 0px var(--row-facet-background-color)`;

      if (contentDirty) {
        const label = flatSlice.rowFacets[j];
        const rowIndex = viewModel.y0 + j;
        const dataCtx: FacetDataContext = {
          viewModel: this.data!,
          path: (this.data! as FlattenedDataViewModel).getSelectPath(rowIndex),
          level: 0,
          index: rowIndex,
          key,
          ...(meta && { flatMeta: meta }),
        };
        const facetContainer = this.createFacetContainer(cell);
        const rendererCtx: FacetRendererContext = {
          render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm),
          cell,
          container: facetContainer,
        };
        const { trackRenderer: grpTrackRenderer, styleFns: grpStyleFns } = this.resolveFacetOverrides([label], rowFacetDefs);
        const result = (grpTrackRenderer ?? rowFacetDefs[0].trackRenderer)(label as string, dataCtx, rendererCtx);
        this.populateFacetContainer(cell, facetContainer, result);
        for (const fn of grpStyleFns) fn(cell);
      }

      cell.dataset.cellType = "row-facet";
      needAppend && nodesToAppend.push(cell);
      adjustCells.push({ cell, level: gridColOffset });
    }
    return { cellsToMeasure, adjustCells, nodesToAppend };
  }
}
