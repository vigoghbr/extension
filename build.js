const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const distDir = path.join(__dirname, "dist");
const isWatch = process.argv.includes("--watch");
const isDev = process.env.NODE_ENV === "development";

console.log(`Building for ${isDev ? "DEVELOPMENT" : "PRODUCTION"}`);
console.log(`Watch mode: ${isWatch ? "ENABLED" : "DISABLED"}`);

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

const staticFiles = ["manifest.json", "src/sidepanel.html", "src/debug.html"];
const assetsDir = path.join(__dirname, "src/assets");
const excludedAssets = [
  ".DS_Store",
  "white-icon16.png",
  "white-icon32.png",
  "white-icon48.png",
];

function copyAssets() {
  staticFiles.forEach((file) => {
    const sourcePath = path.join(__dirname, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(
        sourcePath,
        path.join(distDir, path.basename(sourcePath)),
      );
    } else {
      console.warn(`Warning: ${file} not found.`);
    }
  });

  if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, distDir, {
      recursive: true,
      filter: (src) =>
        !src.includes("google-sans") &&
        !excludedAssets.includes(path.basename(src)),
    });
    const fontSrc = path.join(assetsDir, "google-sans/font.ttf");
    if (fs.existsSync(fontSrc)) {
      fs.copyFileSync(fontSrc, path.join(distDir, "font.ttf"));
    }
    const oflSrc = path.join(assetsDir, "google-sans/OFL.txt");
    if (fs.existsSync(oflSrc)) {
      fs.copyFileSync(oflSrc, path.join(distDir, "OFL.txt"));
    }
  }

  console.log("Assets copied");
}

const tailwindBin = path.join(__dirname, "node_modules/.bin/tailwindcss");
const cssInput = path.join(__dirname, "src/styles/index.css");
const cssOutput = path.join(__dirname, "src/styles/index.compiled.css");

function compileCSS() {
  const args = ["-i", cssInput, "-o", cssOutput];
  if (!isWatch) args.push("--minify");
  execFileSync(tailwindBin, args, { stdio: "inherit" });
  console.log("CSS compiled");
}

const tokenPath = path.join(distDir, "build_token.json");

function writeBuildToken() {
  fs.writeFileSync(tokenPath, JSON.stringify({ t: Date.now().toString() }));
}

const cssTextPlugin = {
  name: "css-text-loader",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const contents = await fs.promises.readFile(args.path, "utf8");
      return {
        contents: `export default ${JSON.stringify(contents)}`,
        loader: "js",
      };
    });
  },
};

async function build() {
  const entryPoints = {
    background: path.join(__dirname, "src/background/index.ts"),
    sidepanel: path.join(__dirname, "src/sidepanel/index.ts"),
    contentScript: path.join(__dirname, "src/utils/contentScript.tsx"),
    debug: path.join(__dirname, "src/debug/index.ts"),
  };

  const buildOptions = {
    entryPoints,
    bundle: true,
    outdir: distDir,
    minify: !isWatch,
    minifyIdentifiers: !isWatch,
    minifySyntax: !isWatch,
    minifyWhitespace: !isWatch,
    sourcemap: isWatch ? "inline" : false,
    target: ["chrome100"],
    define: {
      __DEV__: String(isDev),
    },
    jsx: "automatic",
    jsxImportSource: "react",
    plugins: [cssTextPlugin],
  };

  if (isWatch) {
    let isBuilding = false;

    async function rebuild() {
      if (isBuilding) return;
      isBuilding = true;
      console.log(`\n🔨 Rebuilding ${new Date().toLocaleTimeString()}`);
      try {
        compileCSS();
        await esbuild.build(buildOptions);
        copyAssets();
        writeBuildToken();
        console.log(`✅ Done ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        console.error("Build failed:", err.message);
      }
      isBuilding = false;
      console.log("Press Enter to rebuild Vigogh.");
    }

    await rebuild();

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", (key) => {
        if (key[0] === 0x03) {
          console.log("\n👋 Stopping.");
          process.exit(0);
        }
        if (key[0] === 0x0d || key[0] === 0x0a) {
          rebuild();
        }
      });
    } else {
      process.on("SIGINT", () => {
        console.log("\n👋 Stopping.");
        process.exit(0);
      });
    }
  } else {
    compileCSS();
    await esbuild.build(buildOptions);
    console.log("JS bundled successfully");
    copyAssets();
    writeBuildToken();
    const { version } = JSON.parse(
      fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"),
    );
    console.log(`✅ Build complete! v${version}`);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
