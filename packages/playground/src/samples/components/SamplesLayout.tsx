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
];

const SamplesLayout: React.FC = () => {
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("samples-theme") as "light" | "dark") || "light");

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

  return (
    <div className="samples-root" data-theme={theme}>
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
                <NavLink to={p.path}>{p.label}</NavLink>
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
