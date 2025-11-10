import React from "react";
import { Routes, Route, Link } from "react-router-dom";
// import { loadDataToLocalStorage, DataSource } from "datamodel";
import GridPlayground from "./grid";

const Home: React.FC = () => {
  // const loadData = async () => {
  //   const ds = new DataSource({
  //     sourceType: "local",
  //     fullQualifiedName: "idb://users2",
  //     name: "users"
  //   });
  //   await ds.init();
  //   const data = await loadDataToLocalStorage(ds, { }, [
  //     ["John Doe", "john@example.com"],
  //     ["Jane Smith", "jane@example.com"]
  //   ]);
  //   // console.log(data);
  // }

  return (
    <div>
      <h1>Playground Home</h1>
      <p>No content yet</p>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <div>
      <nav style={{ padding: "10px", backgroundColor: "#f0f0f0" }}>
        <Link to="/" style={{ marginRight: "20px", textDecoration: "none" }}>Home</Link>
        <Link to="/grid" style={{ textDecoration: "none" }}>Grid</Link>
      </nav>

      <div style={{ padding: "10px 20px" }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/grid" element={<GridPlayground />} />
        </Routes>
      </div>
    </div>
  );
};

export default App;
