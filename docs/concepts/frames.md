# Frame contracts

Grandi represents NDI media as discriminated TypeScript objects. The buffer size, stride, dimensions, and format must agree.

## Video

```ts
interface VideoFrame {
	xres: number;
	yres: number;
	frameRateN: number;
	frameRateD: number;
	pictureAspectRatio: number;
	fourCC: VideoFourCC;
	frameFormatType: FrameType;
	lineStrideBytes: number;
	data: Buffer;
	timecode?: bigint;
	metadata?: string;
}
```

`VideoFourCC` accepts `UYVY`, `UYVA`, `P216`, `PA16`, `YV12`, `I420`, `NV12`, `BGRA`, `BGRX`, `RGBA`, and `RGBX`.

The deprecated `grandi.FOURCC_*` properties remain available for compatibility. Use `grandi.FourCC` in new code.

### Packed and planar buffer sizes

Grandi compares the buffer with the specified stride and format:

| FourCC                         | Minimum stride | Required bytes        | Dimension constraint  |
| ------------------------------ | -------------- | --------------------- | --------------------- |
| `UYVY`                         | `xres × 2`     | `stride × yres`       | Even width            |
| `UYVA`                         | `xres × 2`     | `stride × yres × 1.5` | Even width            |
| `P216`                         | `xres × 2`     | `stride × yres × 2`   | Even width            |
| `PA16`                         | `xres × 2`     | `stride × yres × 3`   | Even width            |
| `YV12`, `I420`, `NV12`         | `xres`         | `stride × yres × 1.5` | Even width and height |
| `BGRA`, `BGRX`, `RGBA`, `RGBX` | `xres × 4`     | `stride × yres`       | None                  |

`lineStrideBytes: 0` selects the minimum packed stride. A larger stride permits padding in each row.

Frame rates are exact ratios. For example, `30000 / 1001` is 29.97 Hz and `60000 / 1001` is 59.94 Hz.

`pictureAspectRatio` is the displayed picture ratio. Set it to `0` to calculate a square-pixel ratio from `xres / yres`.

## Sender audio

Sender audio is planar float32. Each channel occupies one stride-sized region:

```text
required bytes = channelStrideBytes × channels
minimum stride = samples × 4
```

The only valid audio FourCC is `FourCC.FLTp`.

NDI float audio does not have an inherent clipping limit. A sine wave from `-1.0` to `+1.0` represents the +4 dBU reference level.

The SDK accepts all sample counts. For synchronized audio and video, the SDK recommends an audio buffer duration of approximately half a video frame.

## Dynamic formats

NDI permits the format to change between frames. The format includes resolution, FourCC, frame rate, sample rate, and channel count.

Inspect each received frame. If its format changes, rebuild the downstream resources:

```ts
let currentFormat = "";

if (event.type === "video") {
	const nextFormat = `${event.xres}x${event.yres}:${event.fourCC}`;
	if (nextFormat !== currentFormat) {
		currentFormat = nextFormat;
		reconfigureVideo(event);
	}
}
```

## Received data

`receiver.data()` returns a discriminated union. Always narrow on `type` before reading frame-specific fields.

```ts
if (event.type === "video") {
	consumeVideo(event.data);
} else if (event.type === "audio") {
	consumeAudio(event.data);
}
```

Received audio uses `channels`, `samples`, and `channelStrideInBytes`.
