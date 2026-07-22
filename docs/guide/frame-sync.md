# Frame synchronization

NDI FrameSync separates the incoming network timing from your playback loop. Pull-based calls provide clock-corrected video and resampled audio.

## Create a FrameSync

```ts
const receiver = await grandi.receive({
	source,
	colorFormat: grandi.ColorFormat.Fastest,
});
const frameSync = await grandi.frameSync(receiver);
```

A receiver can support only one active `FrameSync`. Direct `receiver.video()`, `receiver.audio()`, and `receiver.data()` capture is unavailable during this time. Metadata and control operations remain available.

If the destination controls the playback clock, use FrameSync. Examples are screen refresh, sound-card output, multiviewers, and source mixing. Use direct receiver capture for a raw, single-source recording. FrameSync can repeat or drop video and resample audio.

## Pull video and audio

```ts
const video = await frameSync.video(grandi.FrameType.Progressive);
if (video.type === "video") {
	render(video.data, video.xres, video.yres);
}

const audio = await frameSync.audio({
	sampleRate: 48_000,
	channels: 2,
	samples: 1_600,
});
play(audio.data);
```

FrameSync calls return immediately. Video can return `{ type: "timeout" }` before the first input arrives. If source samples are unavailable, audio can contain silence.

FrameSync does not change `timecode`, `timestamp`, or `frameFormatType`. These values describe the selected source frame. For interlaced output, request `FrameType.Field0` and `FrameType.Field1` during the related output phases.

## Inspect incoming audio

```ts
const format = frameSync.audioFormat();
if (format) {
	console.log(format.sampleRate, format.channels);
}

console.log(frameSync.audioQueueDepth());
```

If you want to use the incoming format, omit `sampleRate` or `channels`:

```ts
const format = frameSync.audioFormat();
if (format) {
	const audio = await frameSync.audio({
		samples: Math.round(format.sampleRate / 60),
	});
	play(audio.data);
}
```

## Pull on a stable output clock

For best results, pull FrameSync from the destination clock. This example uses a monotonic deadline. A real renderer pulls from its display or audio callback:

```ts
import { setTimeout as sleep } from "node:timers/promises";

const fps = 60;
const intervalMs = 1_000 / fps;
let deadline = performance.now();

while (playing) {
	const [video, audio] = await Promise.all([
		frameSync.video(grandi.FrameType.Progressive),
		frameSync.audio({
			sampleRate: 48_000,
			channels: 2,
			samples: 48_000 / fps,
		}),
	]);

	if (video.type === "video") render(video);
	play(audio.data);

	deadline += intervalMs;
	const delay = deadline - performance.now();
	if (delay > 0) await sleep(delay);
	else deadline = performance.now();
}
```

Consistent requests improve audio sample-rate conversion. Use `audioQueueDepth()` to find whether the pull loop is behind.

## Cleanup order

```ts
frameSync.destroy();
receiver.destroy();
```

When you destroy the `FrameSync`, the receiver becomes available for direct capture.
