# Migrate to version 2

Grandi 2.0 standardizes names, timing values, and asynchronous operations. This guide lists each breaking change and its replacement.

## Migration checklist

1. Replace `grandi.framesync()` with `grandi.frameSync()`.
2. Replace deprecated enum aliases with their enum members.
3. Add `await` before each `finder.wait()` call.
4. Use `bigint` for all timecode and timestamp values.
5. Provide `samples` to each `frameSync.audio()` call.
6. Remove application access to native `embedded` handles.
7. Replace deprecated names during the same migration.

## Breaking changes

### Default FrameSync method

The default export now uses `frameSync`:

```ts
// Version 1
const version1FrameSync = await grandi.framesync(receiver);

// Version 2
const version2FrameSync = await grandi.frameSync(receiver);
```

The deprecated named `framesync` export remains available. The deprecated `grandi.framesync` property is not on the default export.

### Enum aliases

The color-format, bandwidth, audio-format, frame-format, and FourCC aliases remain available with deprecation notices:

```ts
// Deprecated but available in version 2
const deprecatedColor = grandi.COLOR_FORMAT_FASTEST;
const deprecatedBandwidth = grandi.BANDWIDTH_HIGHEST;
const deprecatedAudio = grandi.AUDIO_FORMAT_FLOAT_32_SEPARATE;
const deprecatedFourCC = grandi.FOURCC_UYVY;
const deprecatedFrameType = grandi.FORMAT_TYPE_PROGRESSIVE;

// Use enum members in new code
const color = grandi.ColorFormat.Fastest;
const bandwidth = grandi.Bandwidth.Highest;
const audio = grandi.AudioFormat.Float32Separate;
const fourCC = grandi.FourCC.UYVY;
const frameType = grandi.FrameType.Progressive;
```

### Asynchronous finder waits

`finder.wait()` now returns `Promise<boolean>`. Add `await` to each call.

```ts
// Version 1
const version1Changed = finder.wait(1_000);

// Version 2
const version2Changed = await finder.wait(1_000);
```

Do not use a pending Promise as a Boolean condition:

```ts
if (await finder.wait(1_000)) {
	console.log(finder.sources());
}
```

### Timecode and timestamp values

Version 2 uses signed 64-bit `bigint` values for NDI timecode and receive timestamps. It removes the `PtpTimestamp` tuple type.

| Value                     | Version 1                             | Version 2         |
| ------------------------- | ------------------------------------- | ----------------- |
| Sent timecode             | `number`, `bigint`, or `PtpTimestamp` | `bigint`          |
| Received timecode         | `PtpTimestamp`                        | `bigint`          |
| Video and audio timestamp | Required `PtpTimestamp`               | Optional `bigint` |
| Metadata timestamp        | Present                               | Removed           |

Use `bigint` literals for explicit timecode:

```ts
const frame = {
	// ...
	timecode: 0n,
};
```

To let NDI create timecode, omit the property or use `grandi.TIMECODE_SYNTHESIZE`.

A receive timestamp is optional. Make sure that the property exists before you use it:

```ts
if (frame.timestamp !== undefined) {
	console.log(frame.timestamp);
}
```

See [Timing and timecode](/concepts/timing) for units and conversion examples.

### FrameSync audio requests

`frameSync.audio()` now requires an options object with a positive `samples` value.

```ts
// Version 1
const version1Audio = await frameSync.audio();

// Version 2
const version2Audio = await frameSync.audio({
	samples: 1_600,
});
```

You can omit `sampleRate` and `channels`. FrameSync then uses the current input format.

### Native handles

The public TypeScript interfaces no longer contain `embedded`. This property is an internal native handle.

Do not read, store, replace, or pass this property. Use the public methods to control each native object.

## Deprecated compatibility names

These version 1 names remain available in version 2. New code must use the replacement names.

| Deprecated name          | Replacement              |
| ------------------------ | ------------------------ |
| `grandi.COLOR_FORMAT_*`  | `grandi.ColorFormat.*`   |
| `grandi.BANDWIDTH_*`     | `grandi.Bandwidth.*`     |
| `grandi.AUDIO_FORMAT_*`  | `grandi.AudioFormat.*`   |
| `grandi.FORMAT_TYPE_*`   | `grandi.FrameType.*`     |
| `grandi.FOURCC_*`        | `grandi.FourCC.*`        |
| Named export `framesync` | Named export `frameSync` |
| `sender.sourcename()`    | `sender.sourceName()`    |
| `routing.sourcename()`   | `routing.sourceName()`   |
| `tally.on_program`       | `tally.onProgram`        |
| `tally.on_preview`       | `tally.onPreview`        |
| `extraIps`               | `extraIPs`               |
| `noChannels`             | `channels`               |
| `noSamples`              | `samples`                |

## After migration

Run the TypeScript compiler to find old names and incompatible timing values. Then run the unit and integration tests for your application.
