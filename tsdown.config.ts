import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: "src/index.ts",
		outDir: "dist",
		name: "grandi",
		shims: true,
		format: ["commonjs", "module"],
		sourcemap: true,
	},
	{
		entry: "src/install.ts",
		outDir: "dist",
		dts: false,
	},
]);
