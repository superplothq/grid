import React from "react";
import SimpleTable from "./SimpleTable";

const PROJECT = ["First Name", "Last Name", "Regular Gross Paid"];
const V_TRACK_DEFS = [
  {colSize: {strategy: "static" as const, width: 1, unit: "fr" as const}},
  {colSize: {strategy: "static" as const, width: 1, unit: "fr" as const}},
  {colSize: {strategy: "static" as const, width: 2, unit: "fr" as const}},
];

const ColumnsAndSizingTable: React.FC<{height?: string}> = ({height = "500px"}) => {
  return (
    <SimpleTable
      height={height}
      project={PROJECT}
      vTrackDefs={V_TRACK_DEFS}
    />
  );
};

export default ColumnsAndSizingTable;
