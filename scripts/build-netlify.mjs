import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

if (existsSync("dist")) {
  rmSync("dist", { recursive: true, force: true });
}

mkdirSync("dist", { recursive: true });
cpSync("outputs/toefl-app", "dist", { recursive: true });

console.log("Built static app to dist/");
