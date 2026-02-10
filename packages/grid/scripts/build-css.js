const fs = require("fs");
const path = require("path");
const less = require("less");

const lessFile = path.resolve(__dirname, "../src/grid.less");
const outDir = path.resolve(__dirname, "../dist");
const outFile = path.resolve(outDir, "grid.css");

async function main() {
  const source = fs.readFileSync(lessFile, "utf-8");
  const result = await less.render(source);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, result.css, "utf-8");
  console.log("Generated", outFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
