import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it, test } from "vitest";

import grandi from "../../src/index";
import type {
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
	expect(Array.isArray(frame.timecode)).toBe(true);
	expect(Array.isArray(frame.timestamp)).toBe(true);
	expect(frame.timecode.length).toBe(2);
	expect(frame.timestamp.length).toBe(2);
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
			const connections = await sender.connections();
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
			expect(routing.change(null as never)).toBe(true);

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

			// Pull video until we see the expected size (framesync returns timeout when none yet).
			const expected = { xres: 64, yres: 36 };
			const deadline = Date.now() + 10_000;
			let videoFrame: ReceivedVideoFrame | undefined;
			while (Date.now() < deadline) {
				const frame = await fs.video();
				if (frame.type === "timeout") continue;
				if (frame.xres === expected.xres && frame.yres === expected.yres) {
					videoFrame = frame;
					break;
				}
			}
			if (!videoFrame) {
				throw new Error("Timed out waiting for framesync video frame");
			}
			assertReceivedVideoFrame(videoFrame);

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
		} finally {
			controller.running = false;
			await pumpTask;
			fs?.destroy();
			receiver?.destroy();
			sender.destroy();
		}
	}, 120_000);
});
