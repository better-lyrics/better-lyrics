import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const browser = process.argv[2];
if (!browser) {
  console.error("Browser argument is missing.");
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const version = packageJson.version;
const gitHash = execSync("git rev-parse --short HEAD").toString().trim();
const SOURCEMAPS_BASE_URL = process.env.SOURCEMAPS_BASE_URL || "https://better-lyrics-sourcemaps.dacubeking.com";

function findFiles(dir: string, extension: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findFiles(filePath, extension, fileList);
    } else if (path.extname(file) === extension) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

const jsFiles = findFiles(`./dist/${browser}`, ".js");

jsFiles.forEach(file => {
  const fileName = path.basename(file);
  const sourceMappingURL = `//# sourceMappingURL=${SOURCEMAPS_BASE_URL}/${browser}/v${version}-${gitHash}/${fileName}.map`;
  let fileString = fs.readFileSync(file, "utf-8");
  const patched = fileString.replace(/\r?\n?\/\/# sourceMappingURL=.*\.map\s*$/, `\n${sourceMappingURL}`);

  fs.writeFileSync(
    file,
    patched === fileString ? `${fileString.trimEnd()}\n${sourceMappingURL}\n` : `${patched.trimEnd()}\n`
  );
});
