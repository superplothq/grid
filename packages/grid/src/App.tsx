import React, { useEffect, useState } from "react";
import { calculateSample, processNumbers, pgOps } from "datamodel";

const App: React.FC = () => {
  const [x, setX] = useState<number>(5);
  const [y, setY] = useState<number>(3);
  const [numbers] = useState<number[]>([1, 2, 3, 4, 5]);

  const result = calculateSample(x, y);
  const sum = processNumbers(numbers);

  useEffect(() => {
    pgOps();
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Grid Application</h1>

      <div style={{ marginBottom: "20px" }}>
        <h2>Calculate Sample</h2>
        <div>
          <label>
            X:
            <input
              type="number"
              value={x}
              onChange={(e) => setX(Number(e.target.value))}
              style={{ marginLeft: "10px", marginRight: "20px" }}
            />
          </label>
          <label>
            Y:
            <input
              type="number"
              value={y}
              onChange={(e) => setY(Number(e.target.value))}
              style={{ marginLeft: "10px" }}
            />
          </label>
        </div>

        <div style={{ marginTop: "10px", padding: "10px", backgroundColor: "#f0f0f0" }}>
          <p><strong>Sum:</strong> {result.sum}</p>
          <p><strong>Product:</strong> {result.product}</p>
          <p><strong>Total:</strong> {result.total}</p>
        </div>
      </div>

      <div>
        <h2>Process Numbers</h2>
        <p><strong>Numbers:</strong> [{numbers.join(", ")}]</p>
        <p><strong>Sum of all numbers:</strong> {sum}</p>
      </div>
    </div>
  );
};

export default App;
