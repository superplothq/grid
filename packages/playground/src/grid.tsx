import React, { useEffect } from "react";
import "grid";

// Declare the custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "dataflow-grid": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

const GridPlayground: React.FC = () => {
  useEffect(() => {
    console.log("GridPlayground mounted");
  }, []);

  return (
    <dataflow-grid />
  );
};

export default GridPlayground;
