import React from "react";
import { Routes, Route, Link, Outlet, useMatch } from "react-router-dom";
// import { loadDataToLocalStorage, DataSource } from "datamodel";
import GridPlayground from "./grid";
import PivotGridPlayground from "./pivot-grid";
import FlatTablePlayground from "./flat-table";
import SamplesLayout from "./samples/components/SamplesLayout";
import GettingStarted from "./samples/getting-started.mdx";
import feather from "feather-icons";

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

const PlaygroundLayout: React.FC = () => {
  return (
    <div>
      <nav style={{ padding: "10px", backgroundColor: "#f0f0f0" }}>
        <Link to="/" style={{ marginRight: "20px", textDecoration: "none" }}>Home</Link>
        <Link to="/grid" style={{ textDecoration: "none" }}>Grid</Link>
        <Link to="/pivot" style={{ marginLeft: "20px", textDecoration: "none" }}>Pivot</Link>
        <Link to="/flat-table" style={{ marginLeft: "20px", textDecoration: "none" }}>Flat Table</Link>
        <a
          href="/samples/getting-started"
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: "20px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
          dangerouslySetInnerHTML={{ __html: `Samples ${feather.icons["external-link"].toSvg({ width: 12, height: 12 })}` }}
        />
      </nav>

      <div style={{ padding: "10px 20px" }}>
        <Outlet />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Routes>
      <Route element={<PlaygroundLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/grid" element={<GridPlayground />} />
        <Route path="/pivot" element={<PivotGridPlayground />} />
        <Route path="/flat-table" element={<FlatTablePlayground />} />
      </Route>
      <Route path="/samples" element={<SamplesLayout />}>
        <Route path="getting-started" element={<GettingStarted />} />
      </Route>
    </Routes>
  );
};

export default App;
