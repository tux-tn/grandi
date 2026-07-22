# Installation

Grandi ships as a JavaScript package plus a platform-specific native package. A normal install selects the matching optional dependency for the current operating system and CPU.

## Requirements

- Node.js **20.19.5 or newer**
- A supported platform and architecture
- On Linux, Avahi client libraries and a running `avahi-daemon`

::: code-group

```sh [npm]
npm install grandi
```

```sh [pnpm]
pnpm add grandi
```

```sh [yarn]
yarn add grandi
```

:::

## Module formats

Grandi publishes an ESM entry point. ESM applications can import it directly:

```js
import grandi from "grandi";

console.log(grandi.version());
```

CommonJS applications can load the same package with a dynamic import:

```js
// app.cjs
async function main() {
	const { default: grandi } = await import("grandi");
	console.log(grandi.version());
}

main();
```

## Make sure that the runtime loads

```ts
import grandi from "grandi";

console.log(grandi.version());
console.log(grandi.isSupportedCPU());
```

A successful import loads either:

1. A locally compiled addon discovered by `node-gyp-build`.
2. The matching `@grandi/<platform>-<arch>` package.

Installation does **not** download the NDI SDK or compile a source fallback. Source compilation is a maintainer workflow.

## Linux dependencies

Debian and Ubuntu:

```sh
sudo apt-get update
sudo apt-get install -y \
  avahi-daemon libavahi-common3 libavahi-client3
sudo systemctl enable --now avahi-daemon
```

Arch Linux:

```sh
sudo pacman -S --needed avahi
sudo systemctl enable --now avahi-daemon
```

The native package contains `libndi.so.6`. Avahi remains a host dependency for NDI discovery.

## Next step

Continue with [library lifecycle](/guide/lifecycle), then [discover an NDI source](/guide/discovery).
