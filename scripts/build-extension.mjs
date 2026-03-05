import { build } from "esbuild";

const commonOptions = {
  bundle: true,
  platform: "browser",
  format: "esm",
  target: ["chrome120"],
  sourcemap: true
};

await Promise.all([
  build({
    ...commonOptions,
    entryPoints: ["extension/src/content.ts"],
    outfile: "extension/dist/content.js"
  }),
  build({
    ...commonOptions,
    entryPoints: ["extension/src/sidepanel.ts"],
    outfile: "extension/dist/sidepanel.js"
  }),
  build({
    ...commonOptions,
    entryPoints: ["extension/src/background.ts"],
    outfile: "extension/dist/background.js"
  })
]);

console.log("Built extension assets in extension/dist");
