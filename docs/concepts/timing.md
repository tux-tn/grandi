# Timing and timecode

NDI provides two timing signals. Grandi keeps both signals as `bigint` values. Thus, JavaScript does not lose signed 64-bit precision.

## Timecode

`timecode` belongs to the media frame. Its unit is 100 nanoseconds:

```ts
const seconds = Number(frame.timecode) / 10_000_000;
```

Conversion of a large timecode to `number` can lose integer precision. Keep the value as `bigint` for comparison, storage, and arithmetic.

For sending, omit `timecode` or use:

```ts
const frame = {
	// ...
	timecode: grandi.TIMECODE_SYNTHESIZE,
};
```

`TIMECODE_SYNTHESIZE` is the NDI sentinel `9223372036854775807n`. It asks the SDK to generate [synthesized timecode](https://docs.ndi.video/all/getting-started/white-paper/time-timecode-and-sync-for-ndi#synthesized-timecode).

Consistent synthesis keeps the audio and video relationship without a cumulative rounding error. If one stream has explicit timecode, synthesized streams use that timeline. Synthesized metadata uses a timecode near the closest media frame.

## SDK timestamp

Received video and audio can include `timestamp?: bigint`. This UTC value identifies the time of sender submission to NDI. Its unit is 100 nanoseconds from the Unix epoch.

If the SDK does not provide a timestamp, the property is absent.

```ts
if (frame.timestamp !== undefined) {
	const delta = frame.timestamp - previousTimestamp;
	console.log(`${delta} × 100 ns`);
}
```

Before conversion, reduce the value to a range that JavaScript numbers can represent:

```ts
function timestampToDate(timestamp: bigint) {
	return new Date(Number(timestamp / 10_000n));
}

function splitTimecode(timecode: bigint) {
	return {
		seconds: timecode / 10_000_000n,
		remainder100ns: timecode % 10_000_000n,
	};
}
```

For timestamp comparisons between machines, the system clocks must be synchronized. The SDK recommends a precise external clock source, such as NTP.

Do not substitute SDK timestamps for media timecode:

| Signal      | Meaning                                                   | Availability                     |
| ----------- | --------------------------------------------------------- | -------------------------------- |
| `timecode`  | Media timeline value carried or synthesized for the frame | Always present on received media |
| `timestamp` | SDK timestamp for sender submission, expressed in UTC     | Optional                         |

## FrameSync timing

FrameSync creates a playback clock. It can repeat or drop video frames and resample audio to match your pull cadence. Use its output for playout. Use the received timecode for the source timeline.
