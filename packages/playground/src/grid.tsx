import React, { useEffect, useRef } from "react";
import "grid";
// import Grid, { GridData } from "grid";
import Grid, { GridDataModel } from "grid";

// Declare the custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "dataflow-grid": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

// Sample data: 10 rows of string arrays
// const sampleData: GridData = {
//   columns: ["Name", "Email", "Title", "City"],
//   data: [
//     ["John Doe", "Jane Smith", "Bob Johnson", "Alice Williams", "Charlie Brown", "Diana Prince", "Eve Davis", "Frank Miller", "Grace Lee", "Henry Wilson", "John Doe", "Jane Smith", "Bob Johnson", "Alice Williams", "Charlie Brown", "Diana Prince", "Eve Davis", "Frank Miller", "Grace Lee", "Henry Wilson"],
//     ["john.doe@example.com", "jane.smith@exampleexampleexample.commmmmmmmmm", "bob.johnson@example.com", "alice.williams@example.com", "charlie.brown@example.com", "diana.prince@example.com", "eve.davis@example.com", "frank.miller@example.com", "grace.lee@example.com", "henry.wilson@example.com", "john.doe@example.com", "jane.smith@exampleexampleexample.commmmmmmmmm", "bob.johnson@example.com", "alice.williams@example.com", "charlie.brown@example.com", "diana.prince@example.com", "eve.davis@example.com", "frank.miller@example.com", "grace.lee@example.com", "henry.wilson@example.com"],
//     ["Software Engineer", "Product Manager", "Designer", "Data Scientist", "DevOps Engineer", "Marketing Manager", "Sales Director", "HR Manager", "QA Engineer", "Tech Lead", "Software Engineer", "Product Manager", "Designer", "Data Scientist", "DevOps Engineer", "Marketing Manager", "Sales Director", "HR Manager", "QA Engineer", "Tech Lead"],
//     ["New York", "San Francisco", "Los Angeles", "Boston", "Seattle", "Chicago", "Miami", "Austin", "Portland", "Denver", "New York", "San Francisco", "Los Angeles", "Boston", "Seattle", "Chicago", "Miami", "Austin", "Portland", "Denver"] ,
//   ]
// };

const GridPlayground: React.FC = () => {
  const gridConRef = useRef<HTMLDivElement>(null);
  // const gridRef = useRef<HTMLElement & {
  //   data: GridData
  //   render: () => Promise<void>
  //     }>(null);

  useEffect(() => {
    if (!gridConRef.current) {
      console.error("Grid container is not ready");
      return;
    }

    // Generate 50 rows of data with 2 row facets (Department, Team)
    const departments = ["Engineering", "Product", "Design", "Marketing", "Sales"];
    const teams: Record<string, string[]> = {
      "Engineering": ["Frontend", "Backend", "Platform", "Mobile", "QA"],
      "Product": ["Core", "Growth", "Enterprise", "Analytics", "Platform"],
      "Design": ["UX", "UI", "Brand", "Research", "Motion"],
      "Marketing": ["Content", "SEO", "Paid", "Events", "Brand"],
      "Sales": ["Enterprise", "SMB", "Partnerships", "Solutions", "Support"],
    };
    const cities = ["New York", "San Francisco", "Los Angeles", "Boston", "Seattle", "Chicago", "Miami", "Austin", "Portland", "Denver"];
    const firstNames = ["John", "Jane", "Bob", "Alice", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry"];
    const lastNames = ["Doe", "Smith", "Johnson", "Williams", "Brown", "Prince", "Davis", "Miller", "Lee", "Wilson"];

    const sampleData: string[][] = [];
    const rowFacetLevel0: string[] = []; // Department
    const rowFacetLevel1: string[] = []; // Team

    for (let i = 0; i < 50; i++) {
      const dept = departments[Math.floor(i / 10) % departments.length];
      const teamList = teams[dept];
      const team = teamList[i % teamList.length];
      const firstName = firstNames[i % firstNames.length];
      const lastName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
      const city = cities[i % cities.length];
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;

      rowFacetLevel0.push(dept);
      rowFacetLevel1.push(team);
      sampleData.push([firstName + " " + lastName, email, team + " Engineer", city]);
    }

    const columnFacets = ["Name", "Email", "Title", "City"];
    const rowFacets = [rowFacetLevel0, rowFacetLevel1];

    const grid = new Grid({}, gridConRef.current);
    console.log(sampleData, columnFacets, rowFacets)

    grid.data = new GridDataModel(sampleData, columnFacets, rowFacets);
    grid.draw();
  }, []);

  return (
    <>
     <pre id = "pref-info"></pre>
    <div style={{position: "relative", background: "#fafafa", height: "calc(100vh - 600px)", width: "calc(100vw - 200px)", border: "1px solid #e0e0e0",
    margin: 0, padding: 0, boxSizing: "border-box"}} ref={gridConRef}>
    </div>
    </>
  );
};

export default GridPlayground;

