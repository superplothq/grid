const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const rehypePrettyCode = require("rehype-pretty-code").default;
const rehypeSlug = require("rehype-slug").default;
const rehypeAutolinkHeadings = require("rehype-autolink-headings").default;

module.exports = {
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    publicPath: "/",
    clean: true,
  },
  devtool: "source-map",
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".mdx"],
    fallback: {
      "fs": false,
      "path": false,
      "crypto": false,
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        enforce: "pre",
        use: ["source-map-loader"],
      },
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.mdx$/,
        use: [
          { loader: "ts-loader", options: { transpileOnly: true, compilerOptions: { jsx: "react-jsx", allowJs: true } } },
          { loader: "@mdx-js/loader", options: { providerImportSource: "@mdx-js/react", rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: "prepend", properties: { className: ["anchor-link"] } }], [rehypePrettyCode, { theme: { light: "github-light", dark: "github-dark" }, defaultColor: "light" }]] } },
        ],
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.wasm$/,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./public/index.html",
    }),
  ],
  devServer: {
    static: path.join(__dirname, "dist"),
    compress: true,
    port: 3000,
    open: true,
    historyApiFallback: true,
    client: {
      overlay: false,
    },
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  experiments: {
    asyncWebAssembly: true,
  },
};
