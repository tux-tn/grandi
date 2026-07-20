import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it, test } from "vitest";

import grandi from "../../src/index";
import type {
	FrameSync,
	ReceivedAudioFrame,
	ReceivedVideoFrame,
	Receiver,
	Sender,
	SenderTally,
	Source,
} from "../../src/types";

async function waitForSourceByName(
	name: string,
	timeoutMs = 15_000,
): Promise<Source> {
	const finder = await grandi.find({ showLocalSources: true });
	const deadline = Date.now() + timeoutMs;
	try {
		while (Date.now() < deadline) {
			finder.wait(250);
			const match = finder
				.sources()
				.find((source) => source.name.includes(name));
			if (match) return match;
			await sleep(100);
		}
		throw new Error(`Timed out discovering sender ${name}`);
	} finally {
		finder.destroy();
	}
}

async function pumpFrames(
	sender: Sender,
	controller: { running: boolean },
): Promise<void> {
	const width = 64;
	const height = 36;
	const fps = 30;
	const samplesPerFrame = 1600;
	const videoBuffer = Buffer.alloc(width * height * 4, 0xaa);
	const audioBuffer = Buffer.alloc(samplesPerFrame * 2 * 4);
	while (controller.running) {
		await sender.video({
			type: "video",
			xres: width,
			yres: height,
			frameRateN: fps,
			frameRateD: 1,
			pictureAspectRatio: width / height,
			fourCC: grandi.FOURCC_BGRA,
			frameFormatType: grandi.FrameType.Progressive,
			lineStrideBytes: width * 4,
			data: videoBuffer,
		});
		await sender.audio({
			type: "audio",
			sampleRate: 48_000,
			noChannels: 2,
			noSamples: samplesPerFrame,
			channelStrideBytes: samplesPerFrame * 4,
			data: audioBuffer,
			fourCC: grandi.FOURCC_FLTp,
		});
		await sleep(1000 / fps);
	}
}

function assertReceivedVideoFrame(frame: ReceivedVideoFrame) {
	expect(frame.type).toBe("video");
	expect(typeof frame.xres).toBe("number");
	expect(typeof frame.yres).toBe("number");
	expect(typeof frame.frameRateN).toBe("number");
	expect(typeof frame.frameRateD).toBe("number");
	expect(Buffer.isBuffer(frame.data)).toBe(true);
	expect(typeof frame.timecode).toBe("bigint");
	expect(typeof frame.timestamp).toBe("bigint");
}

function assertTallyShape(tally: SenderTally) {
	expect(typeof tally.changed).toBe("boolean");
	expect(typeof tally.on_program).toBe("boolean");
	expect(typeof tally.on_preview).toBe("boolean");
}

async function waitForAudioFrame(
	receiver: Receiver,
	expected: { sampleRate: number; channels: number },
	timeoutMs = 5_000,
): Promise<ReturnType<Receiver["audio"]>> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const remaining = Math.max(0, deadline - Date.now());
		const frame = (await receiver.data(Math.min(500, remaining))) as Awaited<
			ReturnType<Receiver["data"]>
		>;

		if (frame.type !== "audio") continue;
		if (
			frame.sampleRate === expected.sampleRate &&
			frame.channels === expected.channels
		)
			return frame;
	}
	throw new Error("Timed out waiting for audio frame");
}

async function waitForDataAudioFrame(
	receiver: Receiver,
	options: { audioFormat: number; referenceLevel?: number },
	expected: { sampleRate: number; channels: number },
	timeoutMs = 5_000,
): Promise<ReceivedAudioFrame> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const remaining = Math.max(0, deadline - Date.now());
		const frame = await receiver.data(options, Math.min(500, remaining));

		if (frame.type !== "audio") continue;
		if (
			frame.sampleRate === expected.sampleRate &&
			frame.channels === expected.channels
		)
			return frame;
	}
	throw new Error("Timed out waiting for data audio frame");
}

function assertInterleavedAudioFrame(
	frame: ReceivedAudioFrame,
	expected: {
		audioFormat: number;
		bytesPerSample: number;
		referenceLevel?: number;
	},
) {
	expect(frame.type).toBe("audio");
	expect(frame.audioFormat).toBe(expected.audioFormat);
	if (expected.referenceLevel !== undefined)
		expect(frame.referenceLevel).toBe(expected.referenceLevel);
	expect(frame.sampleRate).toBe(48_000);
	expect(frame.channels).toBe(2);
	expect(frame.samples).toBeGreaterThan(0);
	expect(Buffer.isBuffer(frame.data)).toBe(true);
	expect(frame.data.byteLength).toBe(
		frame.samples * frame.channels * expected.bytesPerSample,
	);
	expect(frame.channelStrideInBytes).toBe(
		frame.samples * expected.bytesPerSample,
	);
}

async function waitForFrameSyncVideoFrame(
	fs: FrameSync,
	expected: { xres: number; yres: number },
	timeoutMs = 5_000,
): Promise<ReceivedVideoFrame> {
	const deadline = Date.now() + timeoutMs;
	let lastVideoFrame: ReceivedVideoFrame | undefined;

	while (Date.now() < deadline) {
		const frame = await fs.video();
		if (frame.type === "timeout") {
			await sleep(50);
			continue;
		}
		lastVideoFrame = frame;

		if (frame.xres === expected.xres && frame.yres === expected.yres)
			return frame;

		await sleep(50);
	}

	throw new Error(
		`Timed out waiting for framesync ${expected.xres}x${expected.yres} video frame` +
			(lastVideoFrame
				? `; last was ${lastVideoFrame.xres}x${lastVideoFrame.yres}`
				: ""),
	);
}

async function waitForVideoFrameSize(
	receiver: Receiver,
	expected: { xres: number; yres: number },
	timeoutMs = 5_000,
): Promise<ReceivedVideoFrame> {
	const deadline = Date.now() + timeoutMs;
	let lastVideoFrame: ReceivedVideoFrame | undefined;

	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		const frame = await receiver.data(Math.min(500, remaining));

		if (frame.type !== "video") continue;
		lastVideoFrame = frame;

		// Routing and newly-connected receivers can emit placeholder frames (e.g. 16x16)
		// during connection negotiation; keep polling until the expected format arrives.
		if (frame.xres === expected.xres && frame.yres === expected.yres)
			return frame;
	}

	throw new Error(
		`Timed out waiting for ${expected.xres}x${expected.yres} video frame` +
			(lastVideoFrame
				? `; last was ${lastVideoFrame.xres}x${lastVideoFrame.yres}`
				: ""),
	);
}

describe("grandi native addon (integration)", () => {
	beforeAll(() => {
		grandi.initialize();
	});

	afterAll(() => {
		grandi.destroy();
	});

	it("reports version info and CPU support", () => {
		const versionString = grandi.version();
		expect(typeof versionString).toBe("string");
		expect(versionString.startsWith("NDI SDK")).toBe(true);
		expect(/\d+\.\d+\.\d+\.\d+$/.test(versionString)).toBe(true);
		expect(typeof grandi.isSupportedCPU()).toBe("boolean");
	});

	it("creates and disposes finders", async () => {
		const finder = await grandi.find({ showLocalSources: true });
		expect(Array.isArray(finder.sources())).toBe(true);
		expect(finder.destroy()).toBe(true);
	});

	it("honors finder options", { timeout: 15_000 }, async () => {
		const finder = await grandi.find({
			showLocalSources: false,
			groups: "dummy-group",
			extraIPs: "127.0.0.1",
		});
		expect(typeof finder.wait(50)).toBe("boolean");
		expect(Array.isArray(finder.sources())).toBe(true);
		expect(finder.destroy()).toBe(true);
	});

	test("rejects numeric timing values", async () => {
		const sender = await grandi.send({
			name: `grandi-numeric-timing-${Date.now()}`,
		});
		const frame = {
			type: "video" as const,
			xres: 2,
			yres: 2,
			frameRateN: 30,
			frameRateD: 1,
			pictureAspectRatio: 1,
			fourCC: grandi.FOURCC_BGRA,
			frameFormatType: grandi.FrameType.Progressive,
			lineStrideBytes: 8,
			data: Buffer.alloc(16),
		};

		try {
			await expect(
				sender.video({ ...frame, timecode: 1 } as never),
			).rejects.toThrow("timecode value must be a bigint");
			await expect(
				sender.video({ ...frame, timecode: 1 } as never),
			).rejects.toThrow("timecode value must be a bigint");
		} finally {
			sender.destroy();
		}
	}, 30_000);
	test("can send frames that are received locally", async () => {
		const senderName = `grandi-vitest-${Date.now()}`;
		const sender = await grandi.send({
			name: senderName,
			clockVideo: true,
			clockAudio: true,
		});
		const controller = { running: true };
		const pumpTask = pumpFrames(sender, controller);
		let receiver: Receiver | undefined;

		try {
			const source = await waitForSourceByName(senderName);
			receiver = await grandi.receive({
				source,
				name: `${senderName}-receiver`,
				colorFormat: grandi.ColorFormat.BGRX_BGRA,
			});
			const frame = await waitForVideoFrameSize(
				receiver,
				{ xres: 64, yres: 36 },
				5000,
			);
			assertReceivedVideoFrame(frame);
			const connections = sender.connections();
			expect(connections).toBeGreaterThanOrEqual(1);

			const tallyInitial = sender.tally();
			assertTallyShape(tallyInitial);
			const tallyStable = sender.tally();
			expect(tallyStable.changed).toBe(false);

			expect(receiver.tally({ onProgram: true, onPreview: false })).toBe(true);
			await sleep(200);
			const tallyProgram = sender.tally();
			assertTallyShape(tallyProgram);
			expect(tallyProgram.on_program).toBe(true);
			expect(tallyProgram.on_preview).toBe(false);
			expect(tallyProgram.changed).toBe(true);
			expect(sender.tally().changed).toBe(false);

			expect(receiver.tally({ onProgram: false, onPreview: true })).toBe(true);
			await sleep(200);
			const tallyPreview = sender.tally();
			assertTallyShape(tallyPreview);
			expect(tallyPreview.on_program).toBe(false);
			expect(tallyPreview.on_preview).toBe(true);
			expect(tallyPreview.changed).toBe(true);
			expect(sender.tally().changed).toBe(false);

			expect(sender.metadata("<test>ping</test>")).toBe(true);
			const deadline = Date.now() + 5_000;
			let metadataFrame: Awaited<ReturnType<Receiver["metadata"]>> | undefined;
			while (Date.now() < deadline) {
				const frame = await receiver.metadata(1_000);
				if (frame.data.includes("ping")) {
					metadataFrame = frame;
					break;
				}
			}
			if (!metadataFrame)
				throw new Error("Timed out waiting for metadata containing 'ping'");
			expect(metadataFrame.type).toBe("metadata");
			expect(metadataFrame.data).toContain("<test>ping</test>");
			expect(typeof metadataFrame.timecode).toBe("bigint");
			expect("timestamp" in metadataFrame).toBe(false);

			const audioFrame = await waitForAudioFrame(receiver, {
				sampleRate: 48_000,
				channels: 2,
			});
			expect(audioFrame.type).toBe("audio");
			expect([
				grandi.AudioFormat.Float32Separate,
				grandi.AudioFormat.Float32Interleaved,
			]).toContain(audioFrame.audioFormat);
			expect(Buffer.isBuffer(audioFrame.data)).toBe(true);

			const int16Audio = await receiver.audio(
				{
					audioFormat: grandi.AudioFormat.Int16Interleaved,
					referenceLevel: 0,
				},
				5_000,
			);
			expect(int16Audio.audioFormat).toBe(grandi.AudioFormat.Int16Interleaved);
			expect(int16Audio.referenceLevel).toBe(0);
			expect(Buffer.isBuffer(int16Audio.data)).toBe(true);
			expect(int16Audio.data.byteLength).toBe(
				int16Audio.samples * int16Audio.channels * 2,
			);

			const interleavedFloatAudio = await receiver.audio(
				{ audioFormat: grandi.AudioFormat.Float32Interleaved },
				5_000,
			);
			expect(interleavedFloatAudio.audioFormat).toBe(
				grandi.AudioFormat.Float32Interleaved,
			);
			expect(Buffer.isBuffer(interleavedFloatAudio.data)).toBe(true);
			expect(interleavedFloatAudio.data.byteLength).toBe(
				interleavedFloatAudio.samples * interleavedFloatAudio.channels * 4,
			);
		} finally {
			controller.running = false;
			await pumpTask;
			if (receiver) {
				receiver.destroy();
				await sleep(200);
				const tallyAfterDisconnect = sender.tally();
				assertTallyShape(tallyAfterDisconnect);
				expect(tallyAfterDisconnect.changed).toBe(true);
				expect(sender.tally().changed).toBe(false);
			}
			sender.destroy();
		}
	}, 120_000);
	test("targeted video capture preserves queued metadata", async () => {
		const senderName = `grandi-targeted-capture-${Date.now()}`;
		const sender = await grandi.send({
			name: senderName,
			clockVideo: true,
			clockAudio: false,
		});
		const controller = { running: true };
		const pumpTask = pumpFrames(sender, controller);
		let receiver: Receiver | undefined;

		try {
			const source = await waitForSourceByName(senderName);
			receiver = await grandi.receive({
				source,
				name: `${senderName}-receiver`,
				colorFormat: grandi.ColorFormat.BGRX_BGRA,
			});
			await waitForVideoFrameSize(receiver, { xres: 64, yres: 36 });

			controller.running = false;
			await pumpTask;

			for (let attempt = 0; attempt < 100; attempt++) {
				const frame = await receiver.data(0);
				if (frame.type === "timeout") break;
				if (attempt === 99)
					throw new Error("Timed out draining the receiver queue");
			}

			expect(sender.metadata("<test>preserved</test>")).toBe(true);
			await sleep(100);

			await expect(receiver.video(0)).rejects.toThrow();
			const metadata = await receiver.metadata(1_000);
			expect(metadata.data).toContain("<test>preserved</test>");
		} finally {
			controller.running = false;
			await pumpTask;
			receiver?.destroy();
			sender.destroy();
		}
	}, 120_000);

	test("receives interleaved audio through data()", async () => {
		const senderName = `grandi-data-audio-${Date.now()}`;
		const sender = await grandi.send({
			name: senderName,
			clockVideo: true,
			clockAudio: true,
		});
		const controller = { running: true };
		const pumpTask = pumpFrames(sender, controller);
		let receiver: Receiver | undefined;

		try {
			const source = await waitForSourceByName(senderName);
			receiver = await grandi.receive({
				source,
				name: `${senderName}-receiver`,
				colorFormat: grandi.ColorFormat.BGRX_BGRA,
			});

			const int16Audio = await waitForDataAudioFrame(
				receiver,
				{
					audioFormat: grandi.AudioFormat.Int16Interleaved,
					referenceLevel: 0,
				},
				{ sampleRate: 48_000, channels: 2 },
				10_000,
			);
			assertInterleavedAudioFrame(int16Audio, {
				audioFormat: grandi.AudioFormat.Int16Interleaved,
				bytesPerSample: 2,
				referenceLevel: 0,
			});

			const float32Audio = await waitForDataAudioFrame(
				receiver,
				{ audioFormat: grandi.AudioFormat.Float32Interleaved },
				{ sampleRate: 48_000, channels: 2 },
				10_000,
			);
			assertInterleavedAudioFrame(float32Audio, {
				audioFormat: grandi.AudioFormat.Float32Interleaved,
				bytesPerSample: 4,
			});
		} finally {
			controller.running = false;
			await pumpTask;
			receiver?.destroy();
			sender.destroy();
		}
	}, 120_000);

	test("keeps in-flight receiver captures alive when receiver is destroyed", async () => {
		const senderName = `grandi-destroy-recv-${Date.now()}`;
		const sender = await grandi.send({
			name: senderName,
			clockVideo: true,
			clockAudio: true,
		});
		const controller = { running: true };
		const pumpTask = pumpFrames(sender, controller);
		let videoReceiver: Receiver | undefined;
		let audioReceiver: Receiver | undefined;

		try {
			const source = await waitForSourceByName(senderName);
			videoReceiver = await grandi.receive({
				source,
				name: `${senderName}-video-receiver`,
				colorFormat: grandi.ColorFormat.BGRX_BGRA,
			});
			audioReceiver = await grandi.receive({
				source,
				name: `${senderName}-audio-receiver`,
				colorFormat: grandi.ColorFormat.BGRX_BGRA,
			});

			const videoPromise = videoReceiver.video(10_000);
			expect(videoReceiver.destroy()).toBe(true);
			const videoFrame = await videoPromise;
			assertReceivedVideoFrame(videoFrame);
			expect(videoFrame.xres).toBe(64);
			expect(videoFrame.yres).toBe(36);
			await expect(videoReceiver.video(1)).rejects.toThrow(
				"Receiver is not initialized.",
			);

			const audioPromise = audioReceiver.audio(
				{ audioFormat: grandi.AudioFormat.Float32Interleaved },
				10_000,
			);
			expect(audioReceiver.destroy()).toBe(true);
			const audioFrame = await audioPromise;
			assertInterleavedAudioFrame(audioFrame, {
				audioFormat: grandi.AudioFormat.Float32Interleaved,
				bytesPerSample: 4,
			});
			await expect(audioReceiver.audio(1)).rejects.toThrow(
				"Receiver is not initialized.",
			);
		} finally {
			controller.running = false;
			await pumpTask;
			videoReceiver?.destroy();
			audioReceiver?.destroy();
			sender.destroy();
		}
	}, 120_000);

	test("captures framesync video and audio repeatedly before cleanup", async () => {
		const senderName = `grandi-destroy-fs-${Date.now()}`;
		const sender = await grandi.send({
			name: senderName,
			clockVideo: true,
			clockAudio: true,
		});
		const controller = { running: true };
		const pumpTask = pumpFrames(sender, controller);
		let receiver: Receiver | undefined;
		let fs: FrameSync | undefined;

		try {
			const source = await waitForSourceByName(senderName);
			receiver = await grandi.receive({
				source,
				name: `${senderName}-receiver`,
				colorFormat: grandi.ColorFormat.Fastest,
			});
			fs = await grandi.framesync(receiver);
			await expect(fs.audio({} as never)).rejects.toThrow(
				"samples must be a number.",
			);
			await expect(fs.audio({ samples: 0 })).rejects.toThrow(
				"samples must be greater than zero.",
			);

			for (let i = 0; i < 3; i++) {
				const videoFrame = await waitForFrameSyncVideoFrame(
					fs,
					{ xres: 64, yres: 36 },
					10_000,
				);
				assertReceivedVideoFrame(videoFrame);

				const audioFrame = await fs.audio({
					sampleRate: 48_000,
					channels: 2,
					samples: 1600,
				});
				expect(audioFrame.type).toBe("audio");
				expect(audioFrame.sampleRate).toBe(48_000);
				expect(audioFrame.channels).toBe(2);
				expect(audioFrame.samples).toBe(1600);
				expect(Buffer.isBuffer(audioFrame.data)).toBe(true);
				expect(audioFrame.data.byteLength).toBe(
					audioFrame.channelStrideInBytes * audioFrame.channels,
				);
			}
			let audioFormat = fs.audioFormat();
			for (
				let attempt = 0;
				audioFormat === undefined && attempt < 20;
				attempt++
			) {
				await sleep(50);
				audioFormat = fs.audioFormat();
			}
			expect(audioFormat).toEqual({
				sampleRate: 48_000,
				channels: 2,
			});

			expect(fs.destroy()).toBe(true);
			expect(() => fs.audioQueueDepth()).toThrow(
				"FrameSync has been destroyed.",
			);
		} finally {
			controller.running = false;
			await pumpTask;
			fs?.destroy();
			receiver?.destroy();
			sender.destroy();
		}
	}, 120_000);

	test("can route a source to an output", async () => {
		const senderName = `grandi-route-${Date.now()}`;
		const routingName = `${senderName}-routing`;
		const sender = await grandi.send({
			name: senderName,
			clockVideo: true,
			clockAudio: true,
		});
		const controller = { running: true };
		const pumpTask = pumpFrames(sender, controller);
		let routing: Awaited<ReturnType<typeof grandi.routing>> | undefined;
		let routedReceiver: Receiver | undefined;

		try {
			const source = await waitForSourceByName(senderName);
			routing = await grandi.routing({ name: routingName });
			expect(routing.change(source)).toBe(true);
			expect(routing.sourcename()).toContain(routingName);
			expect(routing.change(null)).toBe(true);

			const routedSource = await waitForSourceByName(routingName);
			routedReceiver = await grandi.receive({
				source: routedSource,
				name: `${routingName}-receiver`,
				colorFormat: grandi.ColorFormat.BGRX_BGRA,
			});

			const routedDeadline = Date.now() + 15_000;
			let routedFrame: ReceivedVideoFrame | undefined;
			while (Date.now() < routedDeadline) {
				const frame = await routedReceiver.data(500);
				if (frame.type !== "video") continue;
				routedFrame = frame;
				break;
			}
			if (!routedFrame)
				throw new Error("Timed out waiting for routed video frame");
			assertReceivedVideoFrame(routedFrame);
			expect(routing.connections()).toBeGreaterThanOrEqual(1);

			expect(routing.clear()).toBe(true);
			expect(routing.destroy()).toBe(true);
			expect(() => routing.connections()).toThrow(
				"Routing has been destroyed.",
			);
			expect(() => routing.clear()).toThrow("Routing has been destroyed.");
		} finally {
			controller.running = false;
			await pumpTask;
			routedReceiver?.destroy();
			routing?.destroy();
			sender.destroy();
		}
	}, 120_000);

	test("can framesync video and audio from a receiver", async () => {
		const senderName = `grandi-fs-${Date.now()}`;
		const sender = await grandi.send({
			name: senderName,
			clockVideo: true,
			clockAudio: true,
		});
		const controller = { running: true };
		const pumpTask = pumpFrames(sender, controller);

		let receiver: Receiver | undefined;
		let fs: Awaited<ReturnType<typeof grandi.framesync>> | undefined;

		try {
			const source = await waitForSourceByName(senderName);
			receiver = await grandi.receive({
				source,
				name: `${senderName}-receiver`,
				colorFormat: grandi.ColorFormat.Fastest,
			});

			fs = await grandi.framesync(receiver);

			const videoFrame = await waitForFrameSyncVideoFrame(
				fs,
				{ xres: 64, yres: 36 },
				10_000,
			);
			assertReceivedVideoFrame(videoFrame);

			// Legacy option names remain supported for existing callers.
			const audioFrame = await fs.audio({
				sampleRate: 48_000,
				noChannels: 2,
				noSamples: 1600,
			});
			expect(audioFrame.type).toBe("audio");
			expect(audioFrame.sampleRate).toBe(48_000);
			expect(audioFrame.channels).toBe(2);
			expect(audioFrame.samples).toBeGreaterThan(0);
			expect(Buffer.isBuffer(audioFrame.data)).toBe(true);
			expect(fs.audioQueueDepth()).toBeGreaterThanOrEqual(0);

			expect(fs.destroy()).toBe(true);
			expect(() => fs.audioQueueDepth()).toThrow(
				"FrameSync has been destroyed.",
			);
		} finally {
			controller.running = false;
			await pumpTask;
			fs?.destroy();
			receiver?.destroy();
			sender.destroy();
		}
	}, 120_000);
});
