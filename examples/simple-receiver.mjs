#!/usr/bin/env node
import { setTimeout as sleep } from "node:timers/promises";

import grandi from "../dist/index.mjs";

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
	grandi.initialize();

	const source = await pickSource();
	console.log("Using source:", source.name);

	const receiver = await grandi.receive({
		source,
		name: "grandi-example-receiver",
		colorFormat: grandi.ColorFormat.Fastest,
	});

	try {
		const audioPrefs = { audioFormat: grandi.AudioFormat.Float32Separate };
		for (let frameIdx = 0; frameIdx < 10000; frameIdx++) {
			const frame = await receiver.data(audioPrefs, 1000);
			console.log("Received frame", frame);
			switch (frame.type) {
				case "video":
					console.log("Video frame", {
						xres: frame.xres,
						yres: frame.yres,
						fourCC: frame.fourCC,
					});
					break;
				case "audio":
					console.log("Audio frame", {
						sampleRate: frame.sampleRate,
						channels: frame.channels,
						samples: frame.samples,
					});
					break;
				case "metadata":
					console.log("Metadata", frame.data);
					receiver.tally({ onProgram: true, onPreview: false });
					break;
				case "sourceChange":
				case "statusChange":
					console.log("Receiver event", frame.type);
					break;
			}
		}
	} finally {
		grandi.destroy();
	}
}

main().catch((error) => {
	console.error("Failed to run receiver example:", error);
	process.exitCode = 1;
});
