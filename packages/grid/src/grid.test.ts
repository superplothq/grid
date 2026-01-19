import { expect } from "@esm-bundle/chai";
import Grid from "./index.js";

describe("Grid Component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create a container element that will have actual dimensions
    container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    container.style.position = "absolute";
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up after each test
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it("should create a grid element", () => {
    const grid = document.createElement("dataflow-grid") as Grid;
    expect(grid).to.be.instanceOf(Grid);
  });

  it("should attach shadow DOM on connection", () => {
    const grid = document.createElement("dataflow-grid") as Grid;
    container.appendChild(grid);

    expect(grid.shadowRoot).to.not.be.null;
    expect(grid.shadowRoot?.querySelector(".viewport")).to.not.be.null;
  });

  it("should calculate container dimensions using getBoundingClientRect", () => {
    const grid = document.createElement("dataflow-grid") as Grid;
    container.appendChild(grid);

    // The grid should be able to read its dimensions
    const rect = grid.getBoundingClientRect();

    // These assertions prove that real layout calculations are working
    expect(rect.width).to.be.greaterThan(0);
    expect(rect.height).to.be.greaterThan(0);
    expect(rect.width).to.equal(800);
    expect(rect.height).to.equal(600);
  });

  it("should accept and store grid data", () => {
    const grid = document.createElement("dataflow-grid") as Grid;
    container.appendChild(grid);

    const testData = {
      columns: ["Name", "Age", "City"],
      data: [
        ["Alice", 30, "New York"],
        ["Bob", 25, "San Francisco"],
        ["Charlie", 35, "Boston"],
      ],
    };

    grid.data = testData;

    expect(grid.data).to.deep.equal(testData);
    expect(grid.data.columns).to.have.lengthOf(3);
    expect(grid.data.data).to.have.lengthOf(3);
  });

  it("should render with data", async () => {
    const grid = document.createElement("dataflow-grid") as Grid;
    container.appendChild(grid);

    grid.data = {
      columns: ["Column 1", "Column 2"],
      data: [
        ["Value 1", "Value 2"],
        ["Value 3", "Value 4"],
      ],
    };

    await grid.render();

    // Check that table element was created
    const table = grid.querySelector("table");
    expect(table).to.not.be.null;
  });

  it("should test layout-dependent rendering with different container sizes", async () => {
    // Test with a smaller container
    const smallContainer = document.createElement("div");
    smallContainer.style.width = "400px";
    smallContainer.style.height = "300px";
    smallContainer.style.position = "absolute";
    document.body.appendChild(smallContainer);

    const grid = document.createElement("dataflow-grid") as Grid;
    smallContainer.appendChild(grid);

    const rect = grid.getBoundingClientRect();
    expect(rect.width).to.equal(400);
    expect(rect.height).to.equal(300);

    // Clean up
    document.body.removeChild(smallContainer);
  });

  it("should handle empty data gracefully", async () => {
    const grid = document.createElement("dataflow-grid") as Grid;
    container.appendChild(grid);

    grid.data = {
      columns: [],
      data: [],
    };

    // Should not throw
    await grid.render();

    expect(grid.data.columns).to.have.lengthOf(0);
  });

  it("should update data after initial render", async () => {
    const grid = document.createElement("dataflow-grid") as Grid;
    container.appendChild(grid);

    // Initial data
    grid.data = {
      columns: ["A", "B"],
      data: [["1", "2"]],
    };
    await grid.render();

    // Update data
    const newData = {
      columns: ["X", "Y", "Z"],
      data: [["a", "b", "c"]],
    };
    grid.data = newData;

    expect(grid.data).to.deep.equal(newData);
    expect(grid.data.columns).to.have.lengthOf(3);
  });
});
