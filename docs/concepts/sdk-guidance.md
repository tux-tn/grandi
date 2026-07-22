# NDI SDK guidance

Grandi wraps the NDI 6 software SDK. The SDK supports many dynamic media formats. Applications must still select suitable timing, buffer layouts, and network behavior.

## Discovery and source identity

NDI discovery is asynchronous. Immediately after creation, a finder can return an incomplete list. mDNS discovery usually takes a few seconds.

Wait for a change. Then read a new snapshot. Do not treat the first result as final.

`extraIPs` accepts a comma-separated list of addresses outside the local mDNS domain. The sender and finder `groups` values are also comma-separated. A finder reports only sources that are visible to the specified groups.

Use the complete `Source` from `finder.sources()`. The receiver keeps this source identity. A source can return after a temporary loss. The SDK then reconnects automatically.

See the SDK documentation for [NDI-FIND](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-find) and [NDI-RECV](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-recv).

## Sender names and clocking

The SDK limits a complete NDI source name to 253 characters. It replaces the following characters with spaces:

- Backslash
- Slash
- Colon
- Asterisk
- Question mark
- Quotation mark
- Angle brackets
- Pipe

`sender.sourceName()` returns the effective advertised name.

Clocking limits submission to the specified video frame rate or audio sample rate:

- If one loop sends audio and video, clock one stream. Video is the usual clock source.
- If independent loops send audio and video, you can clock both streams.
- If an external clock controls the cadence, disable the related SDK clock.

The SDK permits frame-format changes during operation. Thus, receivers must inspect each frame. Do not assume that its resolution, FourCC, sample rate, or channel count remains constant.

See [NDI-SEND](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-send).

## Performance and latency

The SDK recommends YCbCr through the media pipeline. `UYVY` and `UYVA` prevent RGB-to-YCbCr conversion. They also use less memory bandwidth than `BGRA` and `BGRX`.

If source pixels are RGB data in CPU memory, SDK conversion can use less CPU than an additional application conversion.

For receivers:

- `ColorFormat.Fastest` avoids SDK color conversion and normally returns `UYVY` or `UYVA`.
- `ColorFormat.Best` preserves native precision and can return `P216` or `PA16`.
- Both modes implicitly enable individual video fields.
- `Bandwidth.Highest` requests the upstream program-quality stream.
- `Bandwidth.Lowest` requests a reduced-bandwidth, medium-quality stream.

The receiver keeps a short queue. Process frames faster than real time to keep this queue empty and decrease latency.

Use a blocking timeout instead of repeated polling with a zero timeout. Use `receiver.queue()` and `receiver.performance()` to find backlog and dropped frames.

See [Performance and Implementation](https://docs.ndi.video/all/developing-with-ndi/sdk/performance-and-implementation).

## Network deployment

On hosts with multiple network interfaces, connect all suitable interfaces. Then the SDK can distribute the bandwidth of multiple NDI streams.

Linux kernel 4.18 introduced UDP Generic Segmentation Offload. This function decreases sender CPU use.

NDI multicast is off by default. NDI configuration outside Grandi can enable it.

If the NDI configuration enables multicast, configure correct IGMP snooping or filtering on each applicable network device. Incorrect configuration can send high-bandwidth multicast to each port.

Destroy receivers to release their multicast subscriptions.

## Video and audio contracts

YUV 4:2:2 video requires an even width. YUV 4:2:0 video requires an even width and height.

The frame-rate numerator and denominator specify an exact ratio. Use `30000 / 1001` for 29.97 Hz. Do not round it to 30.

`pictureAspectRatio` is the display aspect ratio. It is not the pixel aspect ratio. A value of `0` calculates a square-pixel ratio from `xres / yres`.

NDI audio uses planar float32 samples. Each channel uses one region with the specified stride.

The SDK accepts all sample counts. For synchronized media, it recommends audio buffers of approximately half a video frame.

An NDI float sine wave from `-1.0` to `+1.0` represents the +4 dBU reference level. This range is not an inherent clipping limit.

See [Frame Types](https://docs.ndi.video/all/developing-with-ndi/sdk/frame-types).

## Metadata

NDI metadata is null-terminated UTF-8 XML. Send well-formed XML with one root element. Use an XML namespace for vendor-specific fields. The `NDI` namespace is reserved.

Not all senders provide well-formed XML. Thus, receiving applications must handle malformed XML.

Synchronization can duplicate or drop per-frame metadata. Do not use this metadata for commands that require one delivery.

## FrameSync selection

FrameSync converts a pushed network stream into a source that uses the local output clock. Use it for display, audio playback, multiviewers, and mixing.

For a raw, single-source recording, direct capture gives the original frames. FrameSync can duplicate or drop video and resample audio.

Pull FrameSync at a stable cadence from the destination clock. Consistent requests improve audio resampling quality.

FrameSync keeps the selected frame's `timecode`, `timestamp`, and frame format. It does not change these fields to the local clock.

## Routing behavior

An NDI router advertises a stable source that redirects receivers to another source. Media does not pass through the router host. Thus, source changes do not add media bandwidth to that host.

See [NDI Routing](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-routing).
