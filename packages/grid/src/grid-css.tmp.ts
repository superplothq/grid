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
    /* border-right: 1px solid #e0e0e0; */
    /* border-bottom: 1px solid #e0e0e0; */
    padding: 0;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    display: flex;
    align-items: center;
  }

  /* Column headers */
  .cell.col-header {
    /* background: linear-gradient(180deg, #4a90e2 0%, #357abd 100%); */
    background: lightgray;
    color: black;
    justify-content: center;
    position: sticky;
    z-index: 20;
  }

  .cell.row-header {
    background: rgb(250, 250, 250);
    position: sticky;
    z-index: 15;
  }

  .cell.corner {
    background: lightgray;
    position: sticky;
    z-index: 30;
  }
`;
