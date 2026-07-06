const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: "./src/index.tsx",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: isProd ? "[name].[contenthash].js" : "bundle.js",
      publicPath: "/",
      clean: true,
    },
    devtool: isProd ? false : "source-map",
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        react: path.resolve(__dirname, "node_modules/react"),
        "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      },
      fallback: {
        fs: false,
        path: false,
        crypto: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          enforce: "pre",
          use: ["source-map-loader"],
          exclude: /node_modules\/@duckdb/,
        },
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/i,
          use: [
            isProd ? MiniCssExtractPlugin.loader : "style-loader",
            "css-loader",
            "postcss-loader",
          ],
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
        patterns: [{
          from: "public",
          to: ".",
          globOptions: { ignore: ["**/index.html"] },
        }],
      }),
      ...(isProd
        ? [new MiniCssExtractPlugin({ filename: "[name].[contenthash].css" })]
        : []),
    ],
    devServer: {
      static: [path.join(__dirname, "public"), path.join(__dirname, "dist")],
      compress: true,
      port: 3001,
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
};
