import { rm } from "node:fs/promises";
import path from "node:path";

await Promise.all(
  [".next/types", ".next/dev/types"].map((relativePath) =>
    rm(path.resolve(relativePath), { force: true, recursive: true }),
  ),
);
