#!/usr/bin/env node
import { setTimeout as sleep } from "node:timers/promises";

import grandi from "grandi";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS_N = 30000;
const FPS_D = 1000;
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = Float32Array.BYTES_PER_ELEMENT;
const SAMPLES_PER_FRAME = Math.floor(SAMPLE_RATE / (FPS_N / FPS_D));
const CHANNEL_STRIDE_BYTES = SAMPLES_PER_FRAME * BYTES_PER_SAMPLE;

const WHITE_BUFFER = Buffer.alloc(WIDTH * HEIGHT * 4, 0xff);
const SILENT_AUDIO = Buffer.alloc(
	SAMPLES_PER_FRAME * CHANNELS * BYTES_PER_SAMPLE,
);

async function main() {
	if (!grandi.isSupportedCPU()) {
		console.warn("Warning: CPU may not support NDI optimizations.");
	}
	if (!grandi.initialize()) throw new Error("Failed to initialize NDI.");

	const sender = await grandi.send({
		name: "grandi-example-sender",
		clockVideo: true,
		clockAudio: false, //  because the example submits audio and video from the same loop, NDI recommends clocking only one stream—usually video
	});
	console.log("NDI sender started. Press Ctrl+C to stop.");

	let running = true;
	process.once("SIGINT", () => {
		running = false;
	});
	process.once("SIGTERM", () => {
		running = false;
	});

	try {
		while (running) {
			await Promise.all([
				sender.video({
					type: "video",
					xres: WIDTH,
					yres: HEIGHT,
					frameRateN: FPS_N,
					frameRateD: FPS_D,
					pictureAspectRatio: WIDTH / HEIGHT,
					frameFormatType: grandi.FrameType.Progressive,
					lineStrideBytes: WIDTH * 4,
					data: WHITE_BUFFER,
					fourCC: grandi.FourCC.BGRA,
					timecode: grandi.TIMECODE_SYNTHESIZE,
				}),
				sender.audio({
					type: "audio",
					sampleRate: SAMPLE_RATE,
					noChannels: CHANNELS,
					noSamples: SAMPLES_PER_FRAME,
					channelStrideBytes: CHANNEL_STRIDE_BYTES,
					data: SILENT_AUDIO,
					fourCC: grandi.FourCC.FLTp,
					timecode: grandi.TIMECODE_SYNTHESIZE,
				}),
			]);

			sender.metadata("<title>Grandi Example</title>");

			await sleep((1000 * FPS_D) / FPS_N);
		}
	} finally {
		sender.destroy();
		grandi.destroy();
	}
	console.log("Sender stopped.");
}

main().catch((error) => {
	console.error("Failed to run sender example:", error);
	process.exitCode = 1;
});
