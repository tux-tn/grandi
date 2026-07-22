# Native runtime loading

The root `grandi` package contains the TypeScript API. Native binaries and NDI runtime libraries live in optional architecture packages.

## Resolution order

At import time, Grandi attempts:

1. A local build through `node-gyp-build`.
2. The matching `@grandi/<platform>-<arch>` package.

On a supported platform, failure to load both paths causes an aggregate error. This error contains each attempted cause. Thus, missing libraries and packages remain visible.

## Package layout

A Linux native package contains:

```text
@grandi/linux-x64/
├── grandi.node
├── libndi.so
├── libndi.so.6
├── LICENSE
└── libndi_licenses.txt
```

The addon resolves `libndi.so.6` from its directory. Local source builds need `copyRuntimeLibraries` because `node-gyp-build` loads the addon from `build/Release`.

## Source builds

`node scripts/build-addon.mjs` downloads the official SDK and stages the selected target. Then it runs `node-gyp` and copies the native package files. This command is for maintainers. It is not an installation fallback.

## Packaged applications

Electron and server-side bundlers must keep the native addon and its NDI runtime together. See [Electron and bundlers](/guide/electron-bundlers) for ASAR rules, external dependencies, and packaging instructions.
