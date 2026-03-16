import React, { useEffect, useRef } from "react";
import "grid/dist/grid.css";

interface GridMountProps {
  setup: (container: HTMLDivElement) => void;
  height?: string;
}

const GridMount: React.FC<GridMountProps> = ({ setup, height = "300px" }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    setup(containerRef.current);
  }, []);

  return (
    <div
      ref={containerRef}
      className="grid-sample"
      style={{ height }}
    />
  );
};

export default GridMount;
