# Electron and bundlers

Grandi loads native code during operation. Electron applications and server-side bundles must preserve the native package layout. They cannot treat Grandi as ordinary JavaScript.

## Grandi package layout

The root `grandi` package contains the ESM API and native loader. The loader selects an optional package for the operating system and CPU. For example, Linux x64 uses `@grandi/linux-x64`.

Each architecture package keeps the native addon and NDI runtime together:

```text
node_modules/@grandi/linux-x64/
├── grandi.node
├── libndi.so
└── libndi.so.6
```

The macOS and Windows packages contain `libndi.dylib` and `Processing.NDI.Lib.*`. These files must stay beside `grandi.node` in the packaged application.

Install `grandi` as a production dependency. Do not omit optional dependencies. The target machine uses the applicable `@grandi/<platform>-<arch>` package.

## Electron process architecture

Import Grandi in the Electron main process or a [`utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process). Expose only the necessary renderer operations through a preload script and IPC.

For a complete application, see the [Electron NDI viewer example](https://github.com/tux-tn/electron-ndi-viewer).

```ts
// main.ts
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import grandi from "grandi";

app.whenReady().then(() => {
	if (!grandi.initialize()) {
		throw new Error("NDI is not supported on this CPU");
	}

	ipcMain.handle("ndi:version", () => grandi.version());

	const window = new BrowserWindow({
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(import.meta.dirname, "preload.js"),
		},
	});

	window.loadFile("index.html");
});

app.on("before-quit", () => {
	grandi.destroy();
});
```

```ts
// preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ndi", {
	version: () => ipcRenderer.invoke("ndi:version"),
});
```

Do not import Grandi into a renderer or browser bundle. A browser cannot load a Node-API `.node` library. Node integration in the renderer also increases the attack surface.

Before you call `grandi.destroy()`, destroy all finders, senders, receivers, frame synchronizers, and routers.

## electron-builder and ASAR

ASAR archives cannot provide the file layout that a native addon and its shared libraries require. Keep the complete Grandi packages outside the archive. Do not unpack only `**/*.node`.

```yaml
# electron-builder.yml
asar: true
asarUnpack:
  - "node_modules/grandi/**"
  - "node_modules/@grandi/**"
```

The packaged application must contain a directory with this structure:

```text
resources/app.asar.unpacked/node_modules/@grandi/linux-x64/
├── grandi.node
├── libndi.so
└── libndi.so.6
```

Do not unpack only `grandi.node`. The NDI shared library must stay beside it. electron-builder automatically detects many native modules. The explicit rules also preserve the adjacent NDI libraries.

## Electron Forge

Electron Forge provides an auto-unpack plugin for native modules:

```js
// forge.config.js
module.exports = {
	packagerConfig: {
		asar: true,
	},
	plugins: [
		{
			name: "@electron-forge/plugin-auto-unpack-natives",
			config: {},
		},
	],
};
```

After packaging, inspect `resources/app.asar.unpacked`. Make sure that the selected `@grandi` directory contains `grandi.node` and its NDI shared library.

If Forge does not copy the complete directory, add an Electron Packager `asar.unpackDir` rule for `node_modules/@grandi`. Do not unpack only `.node` files.

## Node-API and Electron rebuilds

The published Grandi addon uses Node-API. Thus, it usually does not need a rebuild for the Node.js runtime in Electron. The operating system and CPU architecture must match the packaged application.

Other native dependencies that use the V8 or NAN ABI can require `@electron/rebuild`. A `NODE_MODULE_VERSION` error does not always identify Grandi. Find the native module that failed before you rebuild dependencies.

## Bundlers

Leave `grandi` external, and copy production dependencies into the deployed application. An external package does not receive JavaScript transformations. Externalization does not copy its files.

### esbuild

```js
await esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	external: ["grandi", "@grandi/*"],
	outfile: "dist/main.js",
});
```

### Rollup

```js
export default {
	input: "src/main.ts",
	external: (id) => id === "grandi" || id.startsWith("@grandi/"),
	output: {
		dir: "dist",
		format: "esm",
	},
};
```

### Vite SSR

```ts
import { defineConfig } from "vite";

export default defineConfig({
	optimizeDeps: {
		exclude: ["grandi"],
	},
	ssr: {
		external: ["grandi"],
	},
});
```

These values apply to Node.js or Electron main-process builds. They do not apply to browser builds.

### electron-vite

Main and preload builds externalize dependencies by default. Keep `grandi` in `dependencies`, not `devDependencies`. If you enable full bundling, keep Grandi external:

```ts
import { defineConfig } from "electron-vite";

export default defineConfig({
	main: {
		build: {
			rollupOptions: {
				external: ["grandi"],
			},
		},
	},
});
```

Load Grandi in the main process. A sandboxed preload cannot load an external native dependency directly. Expose the main-process operations through IPC.

## Packaging checklist

1. Install dependencies for the target operating system and architecture.
2. Keep optional dependencies. Do not use `--omit=optional`.
3. Externalize Grandi from server or main-process bundles.
4. Include the root `grandi` package and matching `@grandi/<platform>-<arch>` production dependency.
5. Keep `grandi.node` and the NDI shared library together outside ASAR.
6. Run the packaged application on every supported target, not only the development build.
7. On Linux, install and start Avahi on the host as described in [Installation](/guide/installation#linux-dependencies).

## Common failures

| Error                                                         | Likely cause                                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Failed to find prebuilt package`                             | The installation omitted optional dependencies, the package process omitted production dependencies, or the target does not match. |
| `libndi.so.6`, `libndi.dylib`, or an NDI DLL cannot be loaded | The package process unpacked only `grandi.node` or changed the native package layout.                                              |
| Browser or renderer build fails on Node built-ins             | The bundle imports Grandi into a browser target. Move it to the Electron main process or a Node.js service.                        |
| `NODE_MODULE_VERSION` mismatch                                | A non-Node-API native dependency can require an Electron rebuild, or the package contains the wrong binary.                        |

## Further reading

- [Electron: Using native Node.js modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Electron: ASAR archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder file contents and ASAR configuration](https://www.electron.build/contents/)
- [Electron Forge auto-unpack natives plugin](https://www.electronforge.io/config/plugins/auto-unpack-natives)
- [electron-vite dependency handling](https://electron-vite.org/guide/dependency-handling.html)
- [NAPI-RS bundler integrations](https://napi.rs/docs/more/integrations)
