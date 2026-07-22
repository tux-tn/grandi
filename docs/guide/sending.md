# Send media

A sender publishes a named NDI source and accepts typed video, planar float audio, and metadata frames.

## Create a sender

```ts
import grandi from "grandi";

const sender = await grandi.send({
	name: "Graphics / Fill",
	groups: "studio-a",
	clockVideo: true,
	clockAudio: false,
});
```

If one application loop sends audio and video, clock only one stream. Video is the usual clock source. If separate loops send the streams, you can clock both streams. See [NDI SDK guidance](/concepts/sdk-guidance#sender-names-and-clocking).

## Send video

```ts
const width = 1_920;
const height = 1_080;
const pixels = Buffer.alloc(width * height * 4);

await sender.video({
	xres: width,
	yres: height,
	frameRateN: 30_000,
	frameRateD: 1_001,
	pictureAspectRatio: 16 / 9,
	fourCC: grandi.FourCC.BGRA,
	frameFormatType: grandi.FrameType.Progressive,
	lineStrideBytes: width * 4,
	data: pixels,
	timecode: grandi.TIMECODE_SYNTHESIZE,
});
```

`VideoFrame.data` must match the declared dimensions, pixel format, and stride.

## Send audio

Sender audio uses planar 32-bit float samples (`FourCC.FLTp`):

```ts
const samples = 1_600;
const channels = 2;
const channelStrideBytes = samples * Float32Array.BYTES_PER_ELEMENT;

await sender.audio({
	sampleRate: 48_000,
	channels,
	samples,
	channelStrideBytes,
	data: Buffer.alloc(channelStrideBytes * channels),
	fourCC: grandi.FourCC.FLTp,
	timecode: grandi.TIMECODE_SYNTHESIZE,
});
```

`channels` and `samples` describe the sender audio layout. The deprecated `noChannels` and `noSamples` aliases are also accepted.

### Generate planar audio

Each channel uses a separate region with the specified stride. This example creates a stereo 1 kHz tone:

```ts
function createTone(
	sampleRate: number,
	channels: number,
	samples: number,
	frequency: number,
) {
	const stride = samples * Float32Array.BYTES_PER_ELEMENT;
	const data = Buffer.alloc(stride * channels);

	for (let channel = 0; channel < channels; channel++) {
		for (let sample = 0; sample < samples; sample++) {
			const value =
				0.1 * Math.sin((2 * Math.PI * frequency * sample) / sampleRate);
			data.writeFloatLE(value, channel * stride + sample * 4);
		}
	}

	return { data, channelStrideBytes: stride };
}

const tone = createTone(48_000, 2, 1_600, 1_000);
await sender.audio({
	sampleRate: 48_000,
	channels: 2,
	samples: 1_600,
	...tone,
	fourCC: grandi.FourCC.FLTp,
});
```

## Metadata, tally, and connections

```ts
sender.metadata("<title>Breaking News</title>");

const tally = sender.tally();
console.log(tally.onProgram, tally.onPreview, tally.changed);
console.log(sender.connections());
console.log(sender.sourceName());
```

NDI metadata must be a null-terminated UTF-8 XML document. Grandi adds the string terminator. Send well-formed XML with one root element:

```ts
sender.metadata(
	'<ndi_metadata_group><title>Breaking News</title><scene id="4"/></ndi_metadata_group>',
);
```

Synchronization can duplicate or drop per-frame metadata. Do not use this metadata for commands that require one delivery.

When publishing stops, call `sender.destroy()`.
