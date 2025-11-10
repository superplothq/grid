import React, { useEffect, useRef } from "react";
import "grid";

// Declare the custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "dataflow-grid": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

// Sample data: 10 rows of string arrays
const sampleData: Array<Array<string>> = [
  ["John Doe", "john.doe@example.com", "Software Engineer", "New York"],
  ["Jane Smith", "jane.smith@example.com", "Product Manager", "San Francisco"],
  ["Bob Johnson", "bob.johnson@example.com", "Designer", "Los Angeles"],
  ["Alice Williams", "alice.williams@example.com", "Data Scientist", "Boston"],
  ["Charlie Brown", "charlie.brown@example.com", "DevOps Engineer", "Seattle"],
  ["Diana Prince", "diana.prince@example.com", "Marketing Manager", "Chicago"],
  ["Eve Davis", "eve.davis@example.com", "Sales Director", "Miami"],
  ["Frank Miller", "frank.miller@example.com", "HR Manager", "Austin"],
  ["Grace Lee", "grace.lee@example.com", "QA Engineer", "Portland"],
  ["Henry Wilson", "henry.wilson@example.com", "Tech Lead", "Denver"]
];

const GridPlayground: React.FC = () => {
  const gridRef = useRef<HTMLElement & { data: Array<Array<string>> }>(null);

  useEffect(() => {
    console.log("GridPlayground mounted");

    if (gridRef.current) {
      gridRef.current.data = sampleData;
    }
  }, []);

  return (
    <dataflow-grid ref={gridRef} />
  );
};

export default GridPlayground;

