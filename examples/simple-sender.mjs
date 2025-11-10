#!/usr/bin/env node
import { setTimeout as sleep } from "node:timers/promises";

import grandi from "../dist/index.mjs";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS_N = 30;
const FPS_D = 1;
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 4; // Float32 planar
const SAMPLES_PER_FRAME = SAMPLE_RATE / (FPS_N / FPS_D);
const CHANNEL_STRIDE_BYTES = SAMPLES_PER_FRAME * BYTES_PER_SAMPLE;

const WHITE_BUFFER = Buffer.alloc(WIDTH * HEIGHT * 4, 0xff);
const SILENT_AUDIO = Buffer.alloc(
	SAMPLES_PER_FRAME * CHANNELS * BYTES_PER_SAMPLE,
);

async function main() {
	if (!grandi.isSupportedCPU()) {
		console.warn("Warning: CPU may not support NDI optimizations.");
	}
	grandi.initialize();

	const sender = await grandi.send({
		name: "grandi-example-sender",
		clockVideo: true,
		clockAudio: true,
	});
	console.log("NDI sender started. Press Ctrl+C to stop.");

	let running = true;
	process.once("SIGINT", () => {
		running = false;
	});
	process.once("SIGTERM", () => {
		running = false;
	});

	while (running) {
		const timecode = process.hrtime.bigint() / 100n;
		const timestampNs = process.hrtime.bigint();
		const timestamp = [
			Number(timestampNs / 1_000_000_000n),
			Number(timestampNs % 1_000_000_000n),
		];

		await sender.video({
			type: "video",
			xres: WIDTH,
			yres: HEIGHT,
			frameRateN: FPS_N,
			frameRateD: FPS_D,
			colorFormat: grandi.ColorFormat.Fastest,
			pictureAspectRatio: WIDTH / HEIGHT,
			frameFormatType: grandi.FrameType.Progressive,
			lineStrideBytes: WIDTH * 4,
			data: WHITE_BUFFER,
			fourCC: grandi.FourCC.BGRA,
			timecode,
			timestamp,
		});

		await sender.audio({
			type: "audio",
			sampleRate: SAMPLE_RATE,
			noChannels: CHANNELS,
			noSamples: SAMPLES_PER_FRAME,
			channelStrideBytes: CHANNEL_STRIDE_BYTES,
			data: SILENT_AUDIO,
			fourCC: grandi.FourCC.FLTp,
			timecode,
			timestamp,
		});

		await sender.metadata("<title>Grandi Example</title>");

		await sleep((1000 * FPS_D) / FPS_N);
	}

	grandi.destroy();
	console.log("Sender stopped.");
}

main().catch((error) => {
	console.error("Failed to run sender example:", error);
	process.exitCode = 1;
});
