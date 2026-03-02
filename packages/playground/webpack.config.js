const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    clean: true,
  },
  devtool: "source-map",
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
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
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "../../node_modules/@electric-sql/pglite/dist/pglite.wasm",
          to: "pglite.wasm",
        },
        {
          from: "../../node_modules/@electric-sql/pglite/dist/pglite.data",
          to: "pglite.data",
        },
        {
          from: "../../node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm",
          to: "duckdb-mvp.wasm",
        },
        {
          from: "../../node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js",
          to: "duckdb-browser-mvp.worker.js",
        },
        {
          from: "../../node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm",
          to: "duckdb-eh.wasm",
        },
        {
          from: "../../node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js",
          to: "duckdb-browser-eh.worker.js",
        },
      ],
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
