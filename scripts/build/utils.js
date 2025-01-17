import path from "node:path";
import fs from "node:fs";
import { PROJECT_ROOT } from "../utils/index.mjs";

function getPackageFile(file) {
  const resolved = path.join(PROJECT_ROOT, `node_modules/${file}`);

  if (!fs.existsSync(resolved)) {
    throw new Error(`'${file}' not exist.`);
  }

  return resolved;
}

export { getPackageFile };
