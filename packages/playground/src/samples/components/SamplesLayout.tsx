import React, { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { MDXProvider } from "@mdx-js/react";
import feather from "feather-icons";
import { DataSourceProvider } from "./DataSourceContext";
import { ThemeProvider } from "./ThemeContext";
import "./samples.css";

const mdxComponents = {
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const { href, ...rest } = props;
    if (href && href.startsWith("/")) {
      return <Link to={href} {...rest} />;
    }
    return <a href={href} {...rest} />;
  },
};

const pages = [
  { path: "getting-started-flat-data", label: "Getting Started" },
  { path: "clean-and-transform-data", label: "Clean & Transform Data" },
  { path: "columns-and-sizing", label: "Columns & Sizing" },
  { path: "custom-button", label: "Custom Button" },
  { path: "sorting", label: "Sorting" },
  { path: "grouping", label: "Grouping" },
  { path: "pagination", label: "Pagination" },
  { path: "filtering", label: "Filtering" },
];

const SamplesLayout: React.FC = () => {
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("samples-theme") as "light" | "dark") || "light");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      localStorage.setItem("samples-theme", next);
      return next;
    });
  };

  const icon = theme === "light"
    ? feather.icons["moon"].toSvg({ width: 16, height: 16 })
    : feather.icons["sun"].toSvg({ width: 16, height: 16 });

  const menuIcon = feather.icons["menu"].toSvg({ width: 20, height: 20 });

  return (
    <div className={`samples-root${sidebarOpen ? " sidebar-open" : ""}`} data-theme={theme}>
      <button
        className="samples-hamburger"
        onClick={() => setSidebarOpen((v) => !v)}
        dangerouslySetInnerHTML={{ __html: menuIcon }}
      />
      {sidebarOpen && <div className="samples-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className="samples-sidebar">
        <div className="samples-sidebar-header">
          <span className="samples-sidebar-title">Samples</span>
          <button
            className="samples-theme-toggle"
            onClick={toggleTheme}
            dangerouslySetInnerHTML={{ __html: icon }}
          />
        </div>
        <nav className="samples-nav">
          <ul>
            {pages.map((p) => (
              <li key={p.path}>
                <NavLink to={p.path} onClick={() => setSidebarOpen(false)}>{p.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="samples-content">
        <div className="samples-content-inner">
          <ThemeProvider value={theme}>
            <DataSourceProvider>
              <MDXProvider components={mdxComponents}>
                <Outlet />
              </MDXProvider>
            </DataSourceProvider>
          </ThemeProvider>
        </div>
      </main>
    </div>
  );
};

export default SamplesLayout;
