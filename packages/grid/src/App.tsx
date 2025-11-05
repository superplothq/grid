import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import { loadDataToLocalStorage, DataSource } from "datamodel";
import Scratchpad from "./Scratchpad";

const Home: React.FC = () => {
  const loadData = async () => {
    const ds = new DataSource({
      sourceType: "local",
      fullQualifiedName: "idb://users2",
      name: "users"
    });
    await ds.init();
    const data = await loadDataToLocalStorage(ds, { }, [
      ["John Doe", "john@example.com"],
      ["Jane Smith", "jane@example.com"]
    ]);
    // console.log(data);
  }

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Testpad</h1>
      <button onClick={loadData}>Test loading</button>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <div>
      <nav style={{ padding: "10px", backgroundColor: "#f0f0f0", marginBottom: "20px" }}>
        <Link to="/" style={{ marginRight: "20px", textDecoration: "none" }}>Home</Link>
        <Link to="/scratchpad" style={{ textDecoration: "none" }}>Scratchpad</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scratchpad" element={<Scratchpad />} />
      </Routes>
    </div>
  );
};

export default App;
