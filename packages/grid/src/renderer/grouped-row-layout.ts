import StandardLayout, {CellRenderResult, CellToMeasure, ViewModel} from "./standard-layout";
import {FlatSliceResult, FacetDataContext, FacetRendererContext, IColAutoSizeStrategyFixedWidth, BaseSliceResult} from "./types";
import {GridDataViewModel} from "./grid-data-viewmodel";
import {addOrReplaceChildren} from "./mixins";

export default class GroupedRowLayout extends StandardLayout {
  protected renderRowFacets(sliceData: BaseSliceResult, viewModel: ViewModel, ctx: { hintContentDirty: boolean | undefined }): CellRenderResult {
    const cellsToMeasure: CellToMeasure[] = [];
    const adjustCells: { cell: HTMLElement; level: number }[] = [];
    const nodesToAppend: HTMLElement[] = [];
    const flatSlice = sliceData as FlatSliceResult;
    if (!flatSlice.rowFacets || flatSlice.rowFacets.length === 0) return { cellsToMeasure, adjustCells, nodesToAppend };

    const numColFacetLevels = this.data!.numColFacetLevels;
    const hintContentDirty = ctx.hintContentDirty;

    const rowFacetDefs = this.data!.facetDefs.row;
    const rendererCtx: FacetRendererContext = {
      render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm),
    };

    for (let j = 0; j < flatSlice.rowFacets.length; j++) {
      const meta = flatSlice.rowMeta[j];
      const absoluteRowIndex = numColFacetLevels + viewModel.y0 + j;
      const key = `row-h-0-${absoluteRowIndex}`;

      // the margin-left on cell in css file acompanies this calculation; otherwise with scroll left of css grid layout
      // margin is not respected by browser
      let left = viewModel.rowFacetsLeftPositions[0] + meta.depth * 16;
      const extraStyles: Record<string, number | string> = {
        left,
      };
      let cls = "row-facet facet facet-r-edge l-edge grouped-row";
      if (j === 0) cls += " first";
      if (j === flatSlice.rowFacets.length - 1) cls += " last";

      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: numColFacetLevels + j + 1,
        gridCol: 1,
        hintContentDirty,
        cls,
        extraStyles,
      });

      cell.style.setProperty("--depth", String(meta.depth));
      // Without this there is white space between the indented row and grid
      cell.style.boxShadow = `${-left}px 0px 0px 0px var(--row-facet-background-color)`;

      if (contentDirty) {
        const label = flatSlice.rowFacets[j];
        const dataCtx: FacetDataContext = {
          viewModel: this.data!,
          path: [label],
          level: 0,
          index: j,
          ...(meta && { flatMeta: meta }),
        };
        const renderer = rowFacetDefs[0].trackRenderer;
        const result = renderer(label as string, dataCtx, rendererCtx);
        const content = this.buildCommonCell(result);
        addOrReplaceChildren(cell, content);
      }

      cell.dataset.cellType = "row-facet";
      needAppend && nodesToAppend.push(cell);
      cellsToMeasure.push({ cell, sizeKey: 0 });
      adjustCells.push({ cell, level: 0 });
    }
    return { cellsToMeasure, adjustCells, nodesToAppend };
  }
}
