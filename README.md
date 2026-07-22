<p align="center">
  <a href="https://tux-tn.github.io/grandi/">
    <img src="./docs/public/mark.svg" alt="Grandi" width="96" height="96">
  </a>
</p>

[![npm version](https://badgen.net/npm/v/grandi)](https://www.npmjs.com/package/grandi) [![CI](https://github.com/tux-tn/grandi/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tux-tn/grandi/actions/workflows/ci.yml) [![Documentation](https://img.shields.io/badge/docs-grandi-b9f53d)](https://tux-tn.github.io/grandi/)

# Grandi

Grandi provides TypeScript-first native Node.js bindings for the NDI™ 6 SDK. It supports discovery, receiving, sending, FrameSync, and routing.

- [Documentation](https://tux-tn.github.io/grandi/)
- [API reference](https://tux-tn.github.io/grandi/api/)
- [Examples](./examples)
- [Release notes](https://tux-tn.github.io/grandi/releases)
- [Changelog](./CHANGELOG.md)

## Installation

Grandi requires Node.js 20.19.5 or later. See the [installation guide](https://tux-tn.github.io/grandi/guide/installation) for platform requirements.

```sh
npm install grandi
```

## Usage

```ts
import grandi from "grandi";

const finder = await grandi.find();

try {
	await finder.wait(1_000);
	console.log(finder.sources());
} finally {
	finder.destroy();
}
```

See the documentation for these workflows:

- [Discover sources](https://tux-tn.github.io/grandi/guide/discovery)
- [Receive media](https://tux-tn.github.io/grandi/guide/receiving)
- [Send media](https://tux-tn.github.io/grandi/guide/sending)
- [Frame synchronization](https://tux-tn.github.io/grandi/guide/frame-sync)
- [Route sources](https://tux-tn.github.io/grandi/guide/routing)
- [Electron and bundlers](https://tux-tn.github.io/grandi/guide/electron-bundlers)

For a complete Electron application, see the [Electron NDI viewer](https://github.com/tux-tn/electron-ndi-viewer).

## Development

```sh
npm run build
npm test
npm run lint
npm run format
```

Run the local NDI benchmark with `npm run bench`. Native source builds use `npm run build:addon`.

## License

Grandi uses the Apache 2.0 license. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for license and attribution details.

The NDI SDK files use the [NDI SDK License](https://ndi.link/ndisdk_license). NDI™ is a trademark of NewTek, Inc.
