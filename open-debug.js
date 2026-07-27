const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const distPath = path.join(__dirname, "dist");
const idOverridePath = path.join(__dirname, ".extension-id");

function computeIdFromPath(extPath) {
  const hash = crypto.createHash("sha256").update(extPath).digest("hex").slice(0, 32);
  return hash.replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + Number.parseInt(c, 16)));
}

function resolveExtensionId() {
  if (process.env.VIGOGH_EXTENSION_ID) return process.env.VIGOGH_EXTENSION_ID.trim();
  if (fs.existsSync(idOverridePath)) return fs.readFileSync(idOverridePath, "utf8").trim();
  return computeIdFromPath(distPath);
}

const extensionId = resolveExtensionId();
const url = `chrome-extension://${extensionId}/debug.html`;

console.log(`Opening ${url}`);
console.log(
  "If the tab shows an error, copy the real ID from chrome://extensions and save it to .extension-id (or set VIGOGH_EXTENSION_ID).",
);

function candidateCommands() {
  const browserApp = process.env.VIGOGH_BROWSER_APP;

  if (process.platform === "darwin") {
    const apps = browserApp
      ? [browserApp]
      : ["Google Chrome", "Brave Browser", "Microsoft Edge", "Chromium"];
    return apps.map((app) => ["open", ["-a", app, url]]);
  }

  if (process.platform === "win32") {
    const bin = browserApp || "chrome";
    return [["cmd", ["/c", "start", "", bin, url]]];
  }

  const bins = browserApp
    ? [browserApp]
    : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  return bins.map((bin) => [bin, [url]]);
}

let opened = false;
for (const [bin, args] of candidateCommands()) {
  try {
    execFileSync(bin, args, { stdio: "ignore" });
    opened = true;
    break;
  } catch {}
}

if (!opened) {
  console.log(`Could not launch a browser automatically. Open this URL manually: ${url}`);
}
