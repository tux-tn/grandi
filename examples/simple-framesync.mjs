#!/usr/bin/env node
import { setTimeout as sleep } from "node:timers/promises";
import grandi from "grandi";

const FPS = 30;
const AUDIO_OPTIONS = {
	sampleRate: 48_000,
	channels: 2,
	noSamples: 1_600, // sampleRate / FPS = 48,000 / 30 = 1,600 samples per frame (in framesync mode, this is the number of samples to pull per frame)
};

async function pickSource() {
	const finder = await grandi.find({ showLocalSources: true });
	try {
		for (let attempts = 0; attempts < 20; attempts++) {
			if (finder.wait(250)) {
				const sources = finder.sources();
				if (sources.length > 0) return sources[0];
			}
			await sleep(250);
		}
		throw new Error("No NDI sources found on the network.");
	} finally {
		finder.destroy();
	}
}

async function main() {
	if (!grandi.isSupportedCPU()) {
		console.warn("Warning: CPU may not support NDI optimizations.");
	}
	if (!grandi.initialize()) throw new Error("Failed to initialize NDI.");

	let receiver;
	let frameSync;
	let running = true;
	const stop = () => {
		running = false;
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);

	try {
		const source = await pickSource();
		console.log(`Using source: ${source.name}`);
		receiver = await grandi.receive({
			source,
			name: "grandi-example-framesync-receiver",
			colorFormat: grandi.ColorFormat.Fastest,
		});
		frameSync = await grandi.framesync(receiver);

		console.log(`Pulling video and audio at ${FPS} FPS. Press Ctrl+C to stop.`);
		const frameIntervalMs = 1000 / FPS;
		let nextPull = performance.now();
		let pullCount = 0;
		while (running) {
			const [video, audio] = await Promise.all([
				frameSync.video(grandi.FrameType.Progressive),
				frameSync.audio(AUDIO_OPTIONS),
			]);
			pullCount++;
			if (pullCount % FPS === 0) {
				const videoInfo =
					video.type === "timeout"
						? "waiting for video"
						: `${video.xres}x${video.yres}`;
				console.log(
					`Pulled ${pullCount} times: video=${videoInfo}, ` +
						`audio=${audio.samples} samples, ` +
						`audioQueue=${frameSync.audioQueueDepth()} samples`,
				);
				console.log(video.timecode, audio.timecode);
				console.log(video.timestamp, audio.timestamp);
			}

			nextPull += frameIntervalMs;
			const delayMs = nextPull - performance.now();
			if (delayMs > 0) await sleep(delayMs);
			else nextPull = performance.now();
		}
	} finally {
		frameSync?.destroy();
		receiver?.destroy();
		grandi.destroy();
	}

	console.log("Frame-sync playback stopped.");
}

main().catch((error) => {
	console.error("Failed to run framesync example:", error);
	process.exitCode = 1;
});
