import React, { useEffect, useRef } from "react";
import "grid";
import Grid, { GridData } from "grid";

// Declare the custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "dataflow-grid": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

// Sample data: 10 rows of string arrays
const sampleData: GridData = {
  columns: ["Name", "Email", "Title", "City"],
  data: [
    ["John Doe", "Jane Smith", "Bob Johnson", "Alice Williams", "Charlie Brown", "Diana Prince", "Eve Davis", "Frank Miller", "Grace Lee", "Henry Wilson"],
    ["john.doe@example.com", "jane.smith@exampleexampleexample.commmmmmmmmm", "bob.johnson@example.com", "alice.williams@example.com", "charlie.brown@example.com", "diana.prince@example.com", "eve.davis@example.com", "frank.miller@example.com", "grace.lee@example.com", "henry.wilson@example.com"],
    ["Software Engineer", "Product Manager", "Designer", "Data Scientist", "DevOps Engineer", "Marketing Manager", "Sales Director", "HR Manager", "QA Engineer", "Tech Lead"],
    ["New York", "San Francisco", "Los Angeles", "Boston", "Seattle", "Chicago", "Miami", "Austin", "Portland", "Denver"] 
  ]
};

const GridPlayground: React.FC = () => {
  const gridRef = useRef<HTMLElement & {
    data: GridData
    render: () => Promise<void>
      }>(null);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.data = sampleData;
      gridRef.current.render();
    }
  }, []);

  return (
    <div style={{background: "#fafafa", height: "400px", width: "600px", border: "1px solid #e0e0e0"}}>
      <dataflow-grid ref={gridRef} />
    </div>
  );
};

export default GridPlayground;

