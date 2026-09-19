import { readdir, readFile } from "node:fs/promises";

const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
const workflowFiles = (await readdir(workflowsDirectory))
  .filter((fileName) => /\.ya?ml$/iu.test(fileName))
  .sort();

if (workflowFiles.length === 0) {
  throw new Error("No GitHub Actions workflows were found.");
}

const failures: string[] = [];

for (const fileName of workflowFiles) {
  const content = await readFile(new URL(fileName, workflowsDirectory), "utf8");
  const triggers = readWorkflowTriggers(content);

  if (triggers.length !== 1 || triggers[0] !== "workflow_dispatch") {
    failures.push(
      `${fileName}: expected only workflow_dispatch, found ${
        triggers.length > 0 ? triggers.join(", ") : "no readable trigger"
      }`,
    );
  }
}

if (failures.length > 0) {
  console.error("Manual-only GitHub Actions verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Manual-only GitHub Actions verification passed for ${workflowFiles.length} workflow file${workflowFiles.length === 1 ? "" : "s"}.`,
  );
}

function readWorkflowTriggers(content: string): string[] {
  const lines = content.split(/\r?\n/u);
  const onIndex = lines.findIndex((line) =>
    /^(?:on|["']on["']):(?:\s|$)/u.test(line),
  );
  if (onIndex === -1) {
    return [];
  }

  const onLine = lines[onIndex]!;
  const inlineValue = onLine.replace(/^(?:on|["']on["']):\s*/u, "").trim();
  if (inlineValue) {
    const withoutComment = inlineValue.split(/\s+#/u, 1)[0]!.trim();
    const values =
      withoutComment.startsWith("[") && withoutComment.endsWith("]")
        ? withoutComment.slice(1, -1).split(",")
        : [withoutComment];
    return values.map(normalizeYamlKey).filter(Boolean);
  }

  let eventIndent: number | null = null;
  const triggers: string[] = [];
  for (const line of lines.slice(onIndex + 1)) {
    if (/^\s*(?:#.*)?$/u.test(line)) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      break;
    }
    eventIndent ??= indent;
    if (indent !== eventIndent) {
      continue;
    }

    const eventMatch = /^\s*(["']?[^"'#:]+["']?):/u.exec(line);
    if (eventMatch?.[1]) {
      triggers.push(normalizeYamlKey(eventMatch[1]));
    }
  }
  return triggers;
}

function normalizeYamlKey(value: string): string {
  return value.trim().replace(/^["']|["']$/gu, "");
}
