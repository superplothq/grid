// TODO emporary file. create less / saas style and load it from there

export const gridShadowElsStyle = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  /* Virtual scrollable area (creates scrollbar size) */
  .virtual-panel {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 0;
  }

  /* Visible content clip area - sticks to viewport */
  .grid-clip {
    position: sticky;
    top: 0;
    left: 0;
    overflow: hidden;
    contain: layout style;
    width: 100%;
    height: 100%;
  }
`.trim();

export const gridCss = `
  .grid-content {
    display: grid;
    position: relative;
    /* Sub-cell offset for smooth scrolling */
    top: calc(-1 * var(--offset-y, 0px));
    left: calc(-1 * var(--offset-x, 0px));
    /* Animate column width changes (Chrome/Edge) */
    transition: grid-template-columns 1s ease-out;
  }

    /* Base cell styling */
  .cell {
    /* padding: 6px 10px; */
    border-right: 1px solid #616161;
    /* border-bottom: 1px solid #e0e0e0; */
    padding: 0;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    display: flex;
    align-items: center;
    padding: 1px 3px
  }

  /* Column headers */
  .cell.col-header {
    /* background: linear-gradient(180deg, #4a90e2 0%, #357abd 100%); */
    background: #ffe082;
    color: black;
    justify-content: center;
    position: sticky;
    z-index: 20;
    border-bottom: 1px solid #616161;
    font-weight: 500;
    color: #424242;
  }

  .cell.row-header {
    background: #f5f5f5;
    position: sticky;
    z-index: 15;
    color: #424242;
  }

  .cell.data {
    justify-content: end;
    color: #1a237e;
  }

  .cell.corner {
    background: #ffe082;
    position: sticky;
    z-index: 30;
    border: none !important;
  }
  .cell.corner.edge-r {
    border-right: 1px solid #616161 !important;
  }

  .cell.selection-overlay {
    pointer-events: none;
    background: rgba(0, 120, 215, 0.1);
    border: 2px solid #0078d7;
    z-index: 5;
    position: relative;
    box-sizing: border-box;
  }

  .cell.data.custom-rendered {
    justify-content: center;
    padding: 0;
  }

`;
