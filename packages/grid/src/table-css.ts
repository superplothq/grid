export const tableCss = `
  table * {
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    border: none;
    font-family: inherit;
    font-size: 12px;
    font-weight: normal;
    text-align: left;
    white-space: nowrap;
    color: #616161;
  }

  table th {
    font-weight: 500;
    border-bottom: 1px solid #e0e0e0;
  }

  table td:not(:last-child), table th:not(:last-child) {
    border-right: 1px solid #e0e0e0;
    cursor: pointer;
  }

  table td {
    padding: 1px 2px 0px 4px;
  }

  table tr:hover {
    background: #EEEEEE;
  }

  .txt-trunc {
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;
