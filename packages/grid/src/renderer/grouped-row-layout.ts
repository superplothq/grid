import StandardLayout, {CellRenderResult, CellToMeasure, ViewModel} from "./standard-layout";
import {FlatSliceResult, FacetDataContext, FacetRendererContext, PivotSliceResult, IColAutoSizeStrategyFixedWidth, BaseSliceResult} from "./types";
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
    const rowHeight = this.rowHeightByType.data;
    const hintContentDirty = ctx.hintContentDirty;
    const numAncestors = flatSlice.numAncestors;

    const rowFacetDefs = this.data!.facetDefs.row;
    const rendererCtx: FacetRendererContext = {
      render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm),
    };

    for (let j = 0; j < flatSlice.rowFacets.length; j++) {
      const meta = flatSlice.rowMeta[j];
      const isAncestor = meta.isAncestor === true;
      const absoluteRowIndex = isAncestor
        ? numColFacetLevels + j
        : numColFacetLevels + viewModel.y0 + (j - numAncestors);
      const key = `row-h-0-${absoluteRowIndex}`;

      let left = viewModel.rowFacetsLeftPositions[0] + meta.depth * 16;
      const extraStyles: Record<string, number | string> = {
        left,
      };
      let cls = "row-facet facet facet-r-edge l-edge grouped-row";

      if (isAncestor) {
        extraStyles.top = viewModel.colFacetsHeight + j * rowHeight;
        cls += " sticky-row";
      }

      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: numColFacetLevels + j + 1,
        gridCol: 1,
        hintContentDirty,
        cls,
        extraStyles,
      });

      cell.style.setProperty("--depth", String(meta.depth));
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

  protected renderDataCells(sliceData: BaseSliceResult, viewModel: ViewModel, ctx: { hintContentDirty: boolean | undefined }): CellRenderResult & { contentCellRerenderCount: number } {
    const cellsToMeasure: CellToMeasure[] = [];
    const nodesToAppend: HTMLElement[] = [];
    const flatSlice = sliceData as FlatSliceResult;
    const numDataColsVisible = sliceData.sliceNumCols;
    const numDataRowsVisible = sliceData.sliceNumRows;
    const colDefs = this.data!.vTrackDefs;
    const rowHeight = this.rowHeightByType.data;
    const hintContentDirty = ctx.hintContentDirty;
    const numAncestors = flatSlice.numAncestors;

    let contentCellRerenderCount = 0;
    for (let i = 0; i < numDataColsVisible; i++) {
      const colData = sliceData.data ? sliceData.data[i] ?? [] : [];
      const gridCol = this.data!.numRowFacetLevels + i + 1;
      const absoluteColIndex = this.data!.numRowFacetLevels + viewModel.x0 + i;
      // TODO[1]
      const colDef = colDefs[absoluteColIndex - this.data!.numRowFacetLevels];
      const fixedSize = colDef.colSize.strategy === "fixed-width" ? colDef.colSize as IColAutoSizeStrategyFixedWidth : null;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const isAncestor = j < numAncestors && flatSlice.rowMeta[j].isAncestor === true;
        const absoluteRowIndex = isAncestor
          ? this.data!.numColFacetLevels + j
          : this.data!.numColFacetLevels + viewModel.y0 + (j - numAncestors);
        const key = `data-${absoluteColIndex}-${absoluteRowIndex}`;
        const value = colData[j];
        let boundaryCellCls = i === 0 ? "l-edge" : (i === numDataColsVisible - 1 ? "r-edge" : "");

        const extraStyles: Record<string, string | number> = {};
        let cls = `data ${boundaryCellCls} ${colDef.isCustom ? " custom-rendered" : ""}`;

        if (isAncestor) {
          cls += " sticky-row";
          extraStyles.top = viewModel.colFacetsHeight + j * rowHeight;
        }

        const [cell, needAppend, contentDirty] = this.placeCellInDom({
          key,
          gridRow: this.data!.numColFacetLevels + j + 1,
          gridCol,
          hintContentDirty,
          cls,
          extraStyles,
        });

        if (contentDirty) {
          contentCellRerenderCount++;
          const isNullish = value === null || value === undefined;
          if (isNullish) {
            cell.innerHTML = "";
          } else {
            const content = colDef.renderer(value, {});
            addOrReplaceChildren(cell, content);
          }
          cell.dataset.cellType = "value";
          cell.dataset.cclix = String(absoluteColIndex);
          cell.dataset.croix = String(absoluteRowIndex);
          cell.style.width = fixedSize?.widthInPx !== undefined ? `${fixedSize.widthInPx}px` : "";
          cell.style.minWidth = fixedSize?.minWidthInPx !== undefined ? `${fixedSize.minWidthInPx}px` : "";
          cell.style.maxWidth = fixedSize?.maxWidthInPx !== undefined ? `${fixedSize.maxWidthInPx}px` : "";
        }

        needAppend && nodesToAppend.push(cell);
        if (!colDef.isCustom) {
          cellsToMeasure.push({ cell, sizeKey: absoluteColIndex });
        }
      }
    }
    return { cellsToMeasure, adjustCells: [], nodesToAppend, contentCellRerenderCount };
  }
}
