// Syntax validation using the project's own Babel parser (JS/JSX/TS). Usage: node check_syntax.js <node_modules_dir> <files...>
const fs = require("fs");
const path = require("path");

const [, , nodeModulesDir, ...files] = process.argv;
const parser = require(path.join(nodeModulesDir, "@babel", "parser"));

let failed = false;
for (const file of files) {
  try {
    const source = fs.readFileSync(file, "utf8");
    const plugins = ["jsx"];
    if (/\.tsx?$/.test(file)) plugins.push("typescript");
    parser.parse(source, { sourceType: "module", plugins, errorRecovery: false });
    console.log(`OK  ${file}`);
  } catch (err) {
    failed = true;
    console.error(`ERR ${file}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
