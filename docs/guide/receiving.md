# Receive media

A receiver connects to one NDI source and exposes targeted capture methods plus a unified `data()` stream.

## Create a receiver

```ts
import grandi from "grandi";

const receiver = await grandi.receive({
	source,
	colorFormat: grandi.ColorFormat.Fastest,
	bandwidth: grandi.Bandwidth.Highest,
	allowVideoFields: false,
	name: "preview-monitor",
});
```

`ColorFormat.Fastest` usually returns `UYVY` or `UYVA` without an SDK color conversion. This mode gives the lowest latency. `ColorFormat.Best` preserves native precision and can return `P216` or `PA16`.

Both modes enable video fields, regardless of `allowVideoFields`. If the consumer requires RGB pixels, use an RGB color format.

`Bandwidth.Highest` requests the program-quality stream from the source. `Bandwidth.Lowest` requests a medium-quality stream that uses less bandwidth.

## Targeted capture

```ts
const video = await receiver.video(1_000);
console.log(video.xres, video.yres, video.fourCC);

const audio = await receiver.audio(
	{ audioFormat: grandi.AudioFormat.Float32Separate },
	1_000,
);
console.log(audio.sampleRate, audio.channels, audio.samples);

const metadata = await receiver.metadata(250);
console.log(metadata.data);
```

Timeout arguments use milliseconds. A targeted method rejects after a timeout with no matching frame.

## Unified capture

To keep the frame order, use `data()`:

```ts
const event = await receiver.data(1_000);

switch (event.type) {
	case "video":
		console.log(event.xres, event.yres);
		break;
	case "audio":
		console.log(event.samples);
		break;
	case "metadata":
		console.log(event.data);
		break;
	case "sourceChange":
	case "statusChange":
	case "timeout":
		break;
}
```

### Continuous capture loop

If no frame arrives, `data()` returns `{ type: "timeout" }` instead of an error. Use this behavior for a cancellable event loop:

```ts
let running = true;

while (running) {
	const event = await receiver.data(
		{ audioFormat: grandi.AudioFormat.Float32Interleaved },
		250,
	);

	switch (event.type) {
		case "video":
			render(event);
			break;
		case "audio":
			playInterleavedFloat32(event.data, event.channels);
			break;
		case "metadata":
			handleMetadata(event.data);
			break;
		case "sourceChange":
		case "statusChange":
			refreshSourceState();
			break;
		case "timeout":
			// No frame arrived; check application shutdown state and continue.
			break;
	}
}
```

The SDK can stay associated with an unavailable source. The source can return later, and the SDK reconnects automatically. A connection count of zero means that the source is offline. Do not immediately create a new receiver.

## Send tally upstream

A receiver reports whether its source is on program or preview. The SDK keeps this state and restores it after reconnection:

```ts
receiver.tally({ onProgram: true, onPreview: false });

// Clear tally when the source leaves program.
receiver.tally({ onProgram: false, onPreview: false });
```

## Diagnostics and cleanup

```ts
console.log(receiver.connections());
console.log(receiver.performance());
console.log(receiver.queue());

receiver.destroy();
```

Use `performance()` for total and dropped frame counters. Use `queue()` for the current video and audio queue depths.
