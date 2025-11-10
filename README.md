# Grandi
Grandi is a TypeScript-first native Node.js binding for NewTek NDI™  6. It exposes the full NDI 6 SDK surface area through a Promise-based API, providing strongly typed helpers for sending and receiving professional video, audio, metadata, and tally data from Node.js applications. For more information on NDI™ , see <https://www.ndi.tv/>.

## Why this fork?
Grandi is a maintained fork of [Streampunk Grandiose](https://github.com/Streampunk/grandiose). The original `steampunk/grandiose` repository and the corresponding `grandiose` package on npm have not been updated since 2023, and major functionality such as data sending never landed upstream. This fork modernizes the build, rewrites the bindings in TypeScript, and delivers the outstanding features required for production projects while keeping a familiar API. Meaningful contributions were also carried forward from community forks:

- TypeScript-focused rewrite with complete binding coverage.
- Improved NDI SDK handling (versioning, download/packaging, and portability improvements).
- Added utilities to make common workflows easier.
- Audio frame sending support from the [rse/grandiose](https://github.com/rse/grandiose) fork.
- Ad-hoc download of NDI SDK assets.
- Portability fixes for Windows, macOS, and Linux drawn from multiple forks.
- NDI sender and routing functionality plus initial type definitions from community forks.

## Capabilities
- Native NDI™  6 bindings written in modern TypeScript with out-of-the-box type definitions.
- Send and receive video, audio, metadata, and tally (program/preview) data streams.
- Promise-based API that keeps heavy lifting off the Node.js event loop.
- Helpers for working with choice of color formats, bandwidth limits, and audio layouts.
- Finder utilities for discovering sources on the local network or specified subnets.
- Built-in routing helpers for switching NDI sources without dropping frames.

### Missing & future work
- PTZ camera control APIs introduced in newer NDI SDK releases are not exposed yet.
- NDI receiver discovery (added in SDK v6.2) still needs bindings; today only sender discovery is available.
- Pull requests tackling these gaps (or other NDI 6.x+ features) are very welcome.

## Supported platforms
Grandi currently ships prebuilt binaries for the same platforms supported by the original project. Additional platforms can be compiled from source if the NDI SDK supports them.

| Operating system | Architectures | Status | Notes |
| --- | --- | --- | --- |
| Windows | x86, x64 | ✅ Prebuilt | Visual Studio 2013 C runtime only needed when building locally; prebuilt binaries include the required DLLs. |
| macOS | Universal (x64 + arm64) | ✅ Prebuilt | Ships with the official universal NDI™ driver, so Intel and Apple Silicon hosts run natively. |
| Linux | x86, x64, armv7l, arm64 | ✅ Prebuilt | Built against the glibc-based NDI™ SDK artifacts provided for Intel and ARM targets. |

## Installation
Install [Node.js](http://nodejs.org/) for your platform (tested against the current Long Term Support release). Then add the dependency to your project:

```bash
npm install grandi
# or
pnpm add grandi
# or
yarn add grandi
```

On Windows, you only need the Visual Studio 2013 C run-times when building from source (e.g., running `npm install` without matching prebuilds). You can grab them from <https://www.microsoft.com/en-us/download/details.aspx?id=40784>, but end users consuming the published prebuilt binaries do **not** need to install them.

Grandi is designed to be `require`d or `import`ed from your own applications:

```typescript
import grandi from "grandi";
// or
const grandi = require("grandi");
```

## Build & distribution
The project uses [prebuildify](https://github.com/prebuild/prebuildify) to prebuild the Node.js addon and bundle the NDI SDK libraries for the supported targets shown above. Those prebuilds are resolved at runtime via [node-gyp-build](https://github.com/prebuild/node-gyp-build), so consumers do not need a compiler toolchain in most cases. When no prebuild matches the running platform, `node-gyp-build` falls back to compiling locally, letting advanced users add additional architectures.

## Using Grandi
This module allows a Node.js program to find, receive, and send NDI™ video, audio, metadata, and tally streams over IP networks. All calls are asynchronous and use JavaScript promises with all of the underlying work of NDI running on separate threads from the event loop. The following sections recap the most common workflows; for complete runnable demos, see `examples/simple-receiver.mjs` and `examples/simple-sender.mjs`.

### Finding streams
`grandi.find` resolves to a finder handle that can block for network updates and expose the discovered sources:

```javascript
import { setTimeout as sleep } from "node:timers/promises";
import grandi from "grandi";

async function pickSource() {
  const finder = await grandi.find({ showLocalSources: true });
  try {
    for (let attempts = 0; attempts < 20; attempts++) {
      finder.wait(250); // block for up to 250 ms of new announcements
      const sources = finder.sources();
      if (sources.length > 0) return sources[0];
      await sleep(250);
    }
    throw new Error("No NDI sources found on the network.");
  } finally {
    finder.destroy();
  }
}
```

`find` accepts a single options object. Common filters:

```javascript
await grandi.find({
  showLocalSources: true,                 // include sources on the same machine
  groups: "studio3",                      // comma-separated list of group names
  extraIPs: "192.168.1.122,mixer.local",  // comma-separated IPs/hosts outside mDNS
});
```

### Receiving streams
First, find a stream or construct a `Source` object:

```javascript
const grandi = require("grandi");
const source = { name: "<source_name>", urlAddress: "<ip>:<port>" };
```

Create a receiver:

```javascript
const receiver = await grandi.receive({ source });
```

Example receiver object:

```javascript
{
  embedded: [External],
  video: [Function],
  audio: [Function],
  metadata: [Function],
  data: [Function],
  source: { name: "LEMARR (Test Pattern)", urlAddress: "169.254.82.1:5961" },
  colorFormat: 100, // grandi.COLOR_FORMAT_FASTEST
  bandwidth: 100,   // grandi.BANDWIDTH_HIGHEST
  allowVideoFields: true
}
```

Configure receivers via options:

```javascript
const receiver = await grandi.receive({
  source,
  colorFormat: grandi.COLOR_FORMAT_UYVY_RGBA,
  bandwidth: grandi.BANDWIDTH_AUDIO_ONLY,
  allowVideoFields: true,
  name: "rooftop"
});
```

#### Video

```javascript
const timeout = 5000;
try {
  for (let i = 0; i < 10; i++) {
    const frame = await receiver.video(timeout);
    console.log(frame);
  }
} catch (err) {
  console.error(err);
}
```

Example frame:

```javascript
{
  type: "video",
  xres: 1920,
  yres: 1080,
  frameRateN: 30000,
  frameRateD: 1001,
  pictureAspectRatio: 1.7777777910232544,
  timestamp: [1538569443, 717845600],
  frameFormatType: grandi.FORMAT_TYPE_INTERLACED,
  timecode: [0, 0],
  lineStrideBytes: 3840,
  data: <Buffer 80 10 80 10 ... >
}
```

#### Audio

```javascript
const audioFrame = await receiver.audio(
  {
    audioFormat: grandi.AUDIO_FORMAT_INT_16_INTERLEAVED,
    referenceLevel: 0
  },
  8000
);
```

Example result:

```javascript
{
  type: "audio",
  audioFormat: grandi.AUDIO_FORMAT_INT_16_INTERLEAVED,
  referenceLevel: 0,
  sampleRate: 48000,
  channels: 4,
  samples: 4800,
  channelStrideInBytes: 9600,
  timestamp: [1538578787, 132614500],
  timecode: [0, 800000000],
  data: <Buffer 00 00 00 00 ... >
}
```

#### Metadata

```javascript
const metadataFrame = await receiver.metadata();
```

Returns a `{ type: "metadata", data: string, ... }` frame, typically XML.

#### Next available data

```javascript
const prefs = { audioFormat: grandi.AUDIO_FORMAT_FLOAT_32_SEPARATE };
const payload = await receiver.data(prefs, 1000); // 1s timeout
if (payload.type === "video") {
  // handle video frame
} else if (payload.type === "metadata") {
  console.log(payload.data);
}
```

### Sending streams
Sending is fully supported. Call `grandi.send` with a `SendOptions` object to create a `Sender` instance capable of video, audio, metadata, and tally interactions:

```javascript
const sender = await grandi.send({
  name: "grandi-demo",
  groups: "studio3",
  clockVideo: true,
  clockAudio: true
});

const timecode = process.hrtime.bigint() / 100n;
const timestampNs = process.hrtime.bigint();
const timestamp = [
  Number(timestampNs / 1_000_000_000n),
  Number(timestampNs % 1_000_000_000n),
];

// Prepare frame payloads (see examples/simple-sender.mjs for helpers)

await sender.video({
  xres: 1280,
  yres: 720,
  frameRateN: 30,
  frameRateD: 1,
  pictureAspectRatio: 16 / 9,
  frameFormatType: grandi.FORMAT_TYPE_PROGRESSIVE,
  lineStrideBytes: 1280 * 4,
  data: whiteBuffer, // BGRA pixels
  fourCC: grandi.FOURCC_BGRA,
  timecode,
  timestamp,
});

await sender.audio({
  sampleRate: 48_000,
  noChannels: 2,
  noSamples: 1600,
  channelStrideBytes: 1600 * 4,
  data: silentAudioBuffer,
  fourCC: grandi.FOURCC_FLTp,
  timecode,
  timestamp,
});

# Example metadata, that explicitly enable hardware acceleration in receiver
sender.metadata("<ndi_video_codec type=\"hardware\"/>");

const tally = sender.tally();
console.log(tally.on_program, tally.on_preview);
```

Destroy senders and receivers explicitly when finished to release NDI resources.

### Other helpers
- `grandi.version()` returns the NDI SDK version string (e.g. `NDI SDK LINUX 10:24:11 Aug 21 2025 6.2.1.0`).
- `grandi.isSupportedCPU()` checks whether the host CPU can run the NDI SDK.
- `grandi.initialize()` / `grandi.destroy()` control the lifetime of the underlying library in advanced scenarios.

## Contributing
Ready to hack on Grandi? Here’s the typical workflow.

1. **Install prerequisites**
	- Node.js ≥ 20.19.5 and a working C/C++ toolchain for your platform.
	- Git LFS is *not* required; the NDI SDK is fetched dynamically.
2. **Download the NDI SDK + install deps**
	- Run `npm install` (or `pnpm install`/`yarn install`). The `scripts/preinstall.mjs` hook downloads and unpacks the official NDI SDK into `ndi/`, then `node-gyp-build` compiles the native addon for your host platform. Re-run `npm install` after deleting `ndi/` if you need to refresh the SDK.
	- To force-download all prebuild assets for release testing, run `npm run prebuild:download`.
	- Set `NDI_FORCE=1` if you need to run the downloader in an unpacked tarball (normally it only runs inside the git repo).
3. **TypeScript build**
	- `npm run build` compiles `src/` via `tsdown`, emitting ESM/CJS bundles and declaration files in `dist/`.
	- `npm run prebuild` packages native binaries for distribution (requires the SDK assets fetched earlier).
4. **Native addon rebuild**
	- If you change C/C++ files under `lib/`, recompile with `npx node-gyp-build` (or simply re-run `npm install`). This uses the same loader that consumers invoke at runtime.
5. **Testing**
	- `npm test` runs the full Vitest suite (unit + integration stubs).
	- `npm run test:unit` focuses on pure JS/TS tests.
	- `RUN_NDI_TESTS=1 npm run test:integration` exercises the native bindings against a real NDI environment; ensure you have available senders/receivers before running.
  - `npm run test:coverage` provides coverage data via `@vitest/coverage-v8`.
6. **Linting & formatting**
	- `npm run lint` / `npm run format` cover the TypeScript/JavaScript sources via Biome.
	- `npm run format:cpp` formats the native sources with `clang-format`.
7. **Manual verification**
	- `node examples/simple-sender.mjs` and `node examples/simple-receiver.mjs` are quick smoke tests for the send/receive API.
	- Use `NDI_FORCE=1 npm install` if you need to reassemble the NDI SDK artifacts even when they are already present.

Before opening a pull request, make sure the linter, formatter, and tests all pass, and include context for any platform-specific considerations (e.g., SDK versions, OS dependencies).

## API reference
This section documents every exported method and type surfaced by the module. Refer to `src/index.ts` and `src/types.ts` for authoritative definitions.

### Module exports
- `find(options?: FindOptions): Promise<Finder>` — discover available NDI sources, optionally filtering by groups, local visibility, or explicit IPs. Resolves to a finder handle whose `sources()` method returns the latest snapshot.
- `receive(options: ReceiveOptions): Promise<Receiver>` — create a receiver bound to a specific `Source`. Customize color format, bandwidth caps, interlaced support, and a friendly name.
- `send(options: SendOptions): Promise<Sender>` — create a sender that can push video, audio, metadata, and tally updates into the NDI network.
- `routing(params: { name?: string; groups?: string }): Promise<Routing>` — build an NDI router that can switch downstream destinations to new sources via `routing.change`.
- `initialize(): boolean` / `destroy(): boolean` — manually initialize or tear down the shared NDI state. Automatically handled when using `send`/`receive`, but exposed for completeness.
- `version(): string` — report the bundled NDI SDK version.
- `isSupportedCPU(): boolean` — guard call that reports whether the host CPU meets the NDI SDK requirements.
- Enum exports: `ColorFormat`, `AudioFormat`, `Bandwidth`, `FrameType`, `FourCC`.
- Default export: the `grandi` object containing the methods above plus constant aliases such as `COLOR_FORMAT_FASTEST`, `BANDWIDTH_HIGHEST`, etc.

### Receiver interface
`Receiver` instances expose:

- `video(timeoutMs?: number): Promise<ReceivedVideoFrame>` — obtain the next video frame.
- `audio(optionsOrTimeout?: AudioReceiveOptions | number, timeoutMs?: number): Promise<ReceivedAudioFrame>` — fetch audio, optionally overriding format or reference level per call.
- `metadata(timeoutMs?: number): Promise<ReceivedMetadataFrame>` — resolve metadata frames (strings, typically XML).
- `data(optionsOrTimeout?: AudioReceiveOptions | number, timeoutMs?: number): Promise<ReceiverDataFrame>` — return whichever payload (video, audio, metadata, source change, status change) arrives first.
- `tally(state: ReceiverTallyState): boolean` — push tally states (program/preview) upstream to the sender.
- `destroy(): boolean` — release the underlying NDI receiver.
- Properties: `embedded`, `source`, `colorFormat`, `bandwidth`, `allowVideoFields`, `name`.

### Sender interface
`Sender` instances surface:

- `video(frame: VideoFrame): Promise<void>` — send a video frame.
- `audio(frame: AudioFrame): Promise<void>` — send an audio frame.
- `metadata(data: string): boolean` — send metadata strings (XML).
- `tally(): SenderTally` — retrieve current tally state (program/preview booleans plus `changed` flag).
- `connections(): number` — how many actively connected receivers see this sender.
- `sourcename(): string` — fully qualified source name visible on the network.
- `destroy(): boolean` — dispose the sender and release network resources.
- Properties: `embedded`, `name`, `groups`, `clockVideo`, `clockAudio`.

### Routing interface
- `change(source: Source): boolean` — switch destinations to a new source.
- `clear(): boolean` — disconnect the current source.
- `connections(): number` — monitor downstream subscriptions.
- `sourcename(): string` — current routed source name.
- `destroy(): boolean` — cleanly shut down.

### Finder interface
- `sources(): Source[]` — latest snapshot of discovered sources.
- `wait(timeoutMs?: number): boolean` — block for network updates up to the given timeout.
- `destroy(): boolean` — dispose the finder and associated background threads.

### Options and helper types
- `Source` — `{ name: string; urlAddress?: string }`.
- `FindOptions` — `{ showLocalSources?: boolean; groups?: string; extraIPs?: string; }`.
- `ReceiveOptions` — `{ source: Source; colorFormat?: ColorFormat; bandwidth?: Bandwidth; allowVideoFields?: boolean; name?: string; }`.
- `SendOptions` — `{ name: string; groups?: string; clockVideo?: boolean; clockAudio?: boolean; }`.
- `AudioReceiveOptions` — `{ audioFormat?: AudioFormat; referenceLevel?: number; }` used when calling `receiver.audio` or `receiver.data`.
- `ReceiverTallyState` — `{ onProgram?: boolean; onPreview?: boolean; }`, used by `receiver.tally`.
- `SenderTally` — `{ changed: boolean; on_program: boolean; on_preview: boolean; }`, returned by `sender.tally`.
- `PtpTimestamp` — `[seconds, nanoseconds]` tuple aligning with the NDI SDK timestamp APIs.
- `Timecode` — `bigint | number | PtpTimestamp`, matching how timecodes are expressed throughout the SDK.

### Frame payload types
- `VideoFrame` — describes outbound frames: resolution, frame rate (`frameRateN`, `frameRateD`), aspect ratio, `fourCC`, `frameFormatType`, `lineStrideBytes`, `data`, optional `timecode`, `timestamp`, `metadata`.
- `ReceivedVideoFrame` — extends `VideoFrame` with guaranteed `type: "video"` plus non-optional `timecode`/`timestamp`.
- `AudioFrame` — outbound audio payload (sample rate, number of channels/samples, stride, `data`, `fourCC`, optional timing/metadata).
- `ReceivedAudioFrame` — inbound audio payload including `audioFormat`, `referenceLevel`, `timecode`, `timestamp`.
- `ReceivedMetadataFrame` — metadata payloads (`type: "metadata"`, `length`, `timecode`, `timestamp`, `data` string).
- `ReceiverDataFrame` — discriminated union of `ReceivedVideoFrame | ReceivedAudioFrame | ReceivedMetadataFrame | SourceChangeEvent | StatusChangeEvent`.
- `SourceChangeEvent` / `StatusChangeEvent` — internal notifications delivered via `receiver.data` when the remote sender changes or becomes unavailable.

### Enum reference
- `ColorFormat` — enumerates `BGRX_BGRA`, `UYVY_BGRA`, `RGBX_RGBA`, `UYVY_RGBA`, `Fastest`, `Best`, and `BGRX_BGRA_FLIPPED`. The `grandi.COLOR_FORMAT_*` constants map to these values.
- `AudioFormat` — `Float32Separate`, `Float32Interleaved`, `Int16Interleaved`. Access via `grandi.AUDIO_FORMAT_*`.
- `Bandwidth` — `MetadataOnly`, `AudioOnly`, `Lowest`, `Highest`. Access via `grandi.BANDWIDTH_*`.
- `FrameType` — `Interlaced`, `Progressive`, `Field0`, `Field1`. Access via `grandi.FORMAT_TYPE_*`.
- `FourCC` — common pixel/audio format codes (`UYVY`, `UYVA`, `P216`, `PA16`, `YV12`, `I420`, `NV12`, `BGRA`, `BGRX`, `RGBA`, `RGBX`, `FLTp`). Helper constants exist on the default export.

## Status, support, and further development
Support for sending and receiving streams across Windows, macOS, and Linux platforms is actively maintained. Contributions are welcome via pull requests, and enhancements or bug reports can be filed as GitHub issues.

## License
Apart from the exceptions below, this software is released under the Apache 2.0 license. See [LICENSE](./LICENSE) for details. Attribution: this project remains a maintained fork of Streampunk Grandiose, and portions derive from that project and community forks. See [NOTICE](./NOTICE) for attributions.

### License exceptions
The software uses libraries provided under a royalty-free license from NewTek, Inc. (see the [NDI SDK License](https://ndi.link/ndisdk_license) for full terms):

- The `ndi/include` includes files are licensed separately by NewTek under the MIT license.
- The DLL and library files are provided for installation convenience and are covered by the NewTek license in the `prebuild/` folder.

## Trademarks
NDI™  is a trademark of NewTek, Inc.
