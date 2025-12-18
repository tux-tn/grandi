[![npm version](https://badgen.net/npm/v/grandi)](https://www.npmjs.com/package/grandi) [![CI](https://github.com/tux-tn/grandi/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tux-tn/grandi/actions/workflows/ci.yml)

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
- Sender, routing, and type-definition improvements from [ianshade/grandiose](https://github.com/ianshade/grandiose) and [hopejr/grandiose](https://github.com/hopejr/grandiose).

## Why “Grandi”?

NDI™ was conceived as a grand vision for IP media transport. The earliest bindings leaned into that idea with the tongue‑in‑cheek name “gra‑NDI‑ose”. **Grandi** preserves the homage: it nods to “[grandiose](https://github.com/Streampunk/grandiose)”, itself drawn from the French word *grandi* (“grown”).

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
| Linux | x86, x64, armv7l, arm64 | ✅ Prebuilt | Built against the glibc-based NDI™ SDK; requires `libavahi-common.so.3`, `libavahi-client.so.3`, and the `avahi-daemon` service. |

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

```ts
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

```ts
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

```ts
await grandi.find({
  showLocalSources: true,                 // include sources on the same machine
  groups: "studio3",                      // comma-separated list of group names
  extraIPs: "192.168.1.122,mixer.local",  // comma-separated IPs/hosts outside mDNS
});
```

### Receiving streams
First, find a stream or construct a `Source` object:

```ts
const grandi = require("grandi");
const source = { name: "<source_name>", urlAddress: "<ip>:<port>" };
```

Create a receiver:

```ts
const receiver = await grandi.receive({ source });
```

Example receiver object:

```ts
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

```ts
const receiver = await grandi.receive({
  source,
  colorFormat: grandi.COLOR_FORMAT_UYVY_RGBA,
  bandwidth: grandi.BANDWIDTH_AUDIO_ONLY,
  allowVideoFields: true,
  name: "rooftop"
});

```

#### Video

```ts
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

```ts
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

```ts
const audioFrame = await receiver.audio(
  {
    audioFormat: grandi.AUDIO_FORMAT_INT_16_INTERLEAVED,
    referenceLevel: 0
  },
  8000
);
```

Example result:

```ts
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

```ts
const metadataFrame = await receiver.metadata();
```

Returns a `{ type: "metadata", data: string, ... }` frame, typically XML.

#### Next available data

```ts
const prefs = { audioFormat: grandi.AUDIO_FORMAT_FLOAT_32_SEPARATE };
const payload = await receiver.data(prefs, 1000); // 1s timeout
if (payload.type === "video") {
  // handle video frame
} else if (payload.type === "metadata") {
  console.log(payload.data);
}
```

### Frame synchronization (pull-based playback)
If you want smoother playback clocked to your own loop (e.g., GPU vsync) instead of reacting to pushed frames, wrap an existing receiver in an NDI frame-synchronizer:

```ts
const receiver = await grandi.receive({ source, colorFormat: grandi.ColorFormat.Fastest });
const fs = await grandi.framesync(receiver);

// Pull video; returns { type: "timeout" } until first frame arrives.
const video = await fs.video(grandi.FrameType.Progressive);

// Pull audio resampled to your requested cadence.
const audio = await fs.audio({ sampleRate: 48_000, noChannels: 2, noSamples: 1600 });

fs.destroy();       // destroy frame-sync first
receiver.destroy(); // then destroy the receiver
```

Notes:
- `fs.video()` and `fs.audio()` always return immediately; they may duplicate/drop frames to match your call rate.
- Always destroy the frame-sync before destroying the receiver it wraps.

### Sending streams
Sending is fully supported. Call `grandi.send` with a `SendOptions` object to create a `Sender` instance capable of video, audio, metadata, and tally interactions:

```ts
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

## Benchmark
A loopback benchmark script measures end-to-end send/receive throughput and latency on your machine. It spins up a sender and receiver locally, so a working NDI setup with discovery is required.

- Build first if needed (`npm run build`), then run `npm run bench -- [options]`. The script defaults to 1080p30 with audio and colored output.

| Option | Default | Description |
| --- | --- | --- |
| `--mode realtime|throughput` | `realtime` | `realtime` keeps to the target FPS with clocking enabled; `throughput` sends as fast as possible. |
| `--duration <sec>` | `5` | Run length in seconds. |
| `--fps <num>` | `30` | Target frames per second. |
| `--width <px>` | `1920` | Video width in pixels. |
| `--height <px>` | `1080` | Video height in pixels. |
| `--no-audio` | audio on | Disable sending/receiving audio. |
| `--framesync` | off | Pull frames via the NDI frame-sync API for smoother capture. |
| `--gc-every <ms>` | `500` | Force `global.gc()` at this interval when `--expose-gc` is enabled. |
| `--no-color` | color on | Disable ANSI color output. |

`npm run bench` adds `--expose-gc` to keep buffer reuse stable during long runs.

Example (10s, 1080p30, realtime):

```bash
npm run bench -- --duration 10 --mode realtime --fps 30 --framesync
```

Example (throughput stress, 720p, video only):

```bash
npm run bench -- --mode throughput --width 1280 --height 720 --no-audio --no-color
```

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
	- `npm run test:integration` exercises the native bindings against a real NDI environment;
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

| Export | Returns | Purpose |
| --- | --- | --- |
| `find(options?: FindOptions)` | `Promise<Finder>` | Discover available NDI sources, optionally filtering by groups, local visibility, or explicit IPs. Resolves to a finder whose `sources()` method exposes the latest snapshot. |
| `receive(options: ReceiveOptions)` | `Promise<Receiver>` | Create a receiver bound to a specific `Source` with optional color format, bandwidth, interlaced, and naming tweaks. |
| `send(options: SendOptions)` | `Promise<Sender>` | Create a sender that can push video, audio, metadata, and tally updates into the NDI network. |
| `routing(params: { name?: string; groups?: string })` | `Promise<Routing>` | Build an NDI router that can switch downstream destinations to new sources via `routing.change`. |
| `initialize()` / `destroy()` | `boolean` | Manually initialize or tear down the shared NDI state; normally handled automatically by `send`/`receive`. |
| `version()` | `string` | Report the bundled NDI SDK version. |
| `isSupportedCPU()` | `boolean` | Guard call to confirm the host CPU meets the NDI SDK requirements. |
| `ColorFormat`, `AudioFormat`, `Bandwidth`, `FrameType`, `FourCC` | enums | Enumerations re-exported for convenience (also mirrored as constants on the default export). |
| `default` | `typeof grandi` | The `grandi` object containing the methods above plus constant aliases such as `COLOR_FORMAT_FASTEST`, `BANDWIDTH_HIGHEST`, etc. |

### Receiver interface
`Receiver` instances expose:

| Call | Returns | Purpose |
| --- | --- | --- |
| `video(timeoutMs?: number)` | `Promise<ReceivedVideoFrame>` | Resolve with the next available video frame. |
| `audio(optionsOrTimeout?: AudioReceiveOptions \| number, timeoutMs?: number)` | `Promise<ReceivedAudioFrame>` | Fetch audio, overriding format/reference level per call if desired. |
| `metadata(timeoutMs?: number)` | `Promise<ReceivedMetadataFrame>` | Receive metadata frames (XML strings). |
| `data(optionsOrTimeout?: AudioReceiveOptions \| number, timeoutMs?: number)` | `Promise<ReceiverDataFrame>` | Return whichever payload (video/audio/metadata/source change/status change) arrives first. |
| `tally(state: ReceiverTallyState)` | `boolean` | Push tally states (program/preview) upstream to the sender. |
| `destroy()` | `boolean` | Release the underlying NDI receiver resources. |

Properties: `embedded`, `source`, `colorFormat`, `bandwidth`, `allowVideoFields`, `name`.

### Sender interface
`Sender` instances surface:

| Call | Returns | Purpose |
| --- | --- | --- |
| `video(frame: VideoFrame)` | `Promise<void>` | Send a video frame into the NDI network. |
| `audio(frame: AudioFrame)` | `Promise<void>` | Send an audio frame. |
| `metadata(data: string)` | `boolean` | Push metadata strings (XML). |
| `tally()` | `SenderTally` | Retrieve current tally state (program/preview booleans plus `changed`). |
| `connections()` | `number` | Report how many receivers are actively connected. |
| `sourcename()` | `string` | Fully qualified source name visible on the network. |
| `destroy()` | `boolean` | Dispose the sender and release network resources. |

Properties: `embedded`, `name`, `groups`, `clockVideo`, `clockAudio`.

### Routing interface

| Call | Returns | Purpose |
| --- | --- | --- |
| `change(source: Source)` | `boolean` | Switch downstream destinations to a new source. |
| `clear()` | `boolean` | Disconnect the current source. |
| `connections()` | `number` | Monitor downstream subscriptions. |
| `sourcename()` | `string` | Current routed source name. |
| `destroy()` | `boolean` | Cleanly shut down the router. |

### Finder interface

| Call | Returns | Purpose |
| --- | --- | --- |
| `sources()` | `Source[]` | Latest snapshot of discovered sources. |
| `wait(timeoutMs?: number)` | `boolean` | Block for network updates up to the given timeout. |
| `destroy()` | `boolean` | Dispose the finder and background threads. |

### Options and helper types

| Type | Shape | Notes |
| --- | --- | --- |
| `Source` | `{ name: string; urlAddress?: string }` | Identifies an NDI endpoint. |
| `FindOptions` | `{ showLocalSources?: boolean; groups?: string; extraIPs?: string; }` | Filters applied when discovering sources. |
| `ReceiveOptions` | `{ source: Source; colorFormat?: ColorFormat; bandwidth?: Bandwidth; allowVideoFields?: boolean; name?: string; }` | Required to create receivers with optional overrides. |
| `SendOptions` | `{ name: string; groups?: string; clockVideo?: boolean; clockAudio?: boolean; }` | Configure sender identity and sync behavior. |
| `AudioReceiveOptions` | `{ audioFormat?: AudioFormat; referenceLevel?: number; }` | Used when calling `receiver.audio` or `receiver.data`. |
| `ReceiverTallyState` | `{ onProgram?: boolean; onPreview?: boolean; }` | Provided to `receiver.tally` to reflect monitoring state. |
| `SenderTally` | `{ changed: boolean; on_program: boolean; on_preview: boolean; }` | Returned by `sender.tally`. |
| `PtpTimestamp` | `[seconds, nanoseconds]` | Tuple aligning with the NDI SDK timestamp APIs. |
| `Timecode` | `bigint \| number \| PtpTimestamp` | Matches how timecodes are expressed throughout the SDK. |

### Frame payload types

| Type | Description |
| --- | --- |
| `VideoFrame` | Outbound frame with resolution, frame rate (`frameRateN`/`frameRateD`), aspect ratio, `fourCC`, `frameFormatType`, `lineStrideBytes`, `data`, optional `timecode`, `timestamp`, `metadata`. |
| `ReceivedVideoFrame` | `VideoFrame` plus `type: "video"` and non-optional `timecode`/`timestamp`. |
| `AudioFrame` | Outbound audio payload including sample rate, channels/samples, stride, `data`, `fourCC`, optional timing/metadata. |
| `ReceivedAudioFrame` | Inbound audio payload with `audioFormat`, `referenceLevel`, `timecode`, `timestamp`. |
| `ReceivedMetadataFrame` | Metadata payload (`type: "metadata"`, `length`, `timecode`, `timestamp`, `data` string). |
| `ReceiverDataFrame` | Discriminated union of `ReceivedVideoFrame \| ReceivedAudioFrame \| ReceivedMetadataFrame \| SourceChangeEvent \| StatusChangeEvent`. |
| `SourceChangeEvent` / `StatusChangeEvent` | Internal notifications delivered via `receiver.data` when the remote sender changes or becomes unavailable. |

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
- The DLL and library files are provided for installation convenience and are covered by the NewTek license in the `prebuilds/` folder.

## Trademarks
NDI™  is a trademark of NewTek, Inc.
