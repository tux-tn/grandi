import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import grandi from "../dist/index.mjs";

function maybeCollectGarbage(state) {
	if (typeof global.gc !== "function") return;
	const now = Date.now();
	if (now - state.lastGcMs < state.gcEveryMs) return;
	state.lastGcMs = now;
	try {
		global.gc();
	} catch {}
}

function parseArgs(argv) {
	const args = {
		durationSec: 5,
		width: 1920,
		height: 1080,
		fps: 30,
		mode: "realtime", // realtime | throughput
		audio: true,
		color: true,
		gcEveryMs: 500,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === "--") continue;
		if (token === "--help" || token === "-h") {
			args.help = true;
			continue;
		}
		if (token === "--duration") {
			args.durationSec = Number(argv[i + 1]);
			i += 1;
			continue;
		}
		if (token === "--width") {
			args.width = Number(argv[i + 1]);
			i += 1;
			continue;
		}
		if (token === "--height") {
			args.height = Number(argv[i + 1]);
			i += 1;
			continue;
		}
		if (token === "--fps") {
			args.fps = Number(argv[i + 1]);
			i += 1;
			continue;
		}
		if (token === "--mode") {
			args.mode = String(argv[i + 1]);
			i += 1;
			continue;
		}
		if (token === "--no-audio") {
			args.audio = false;
			continue;
		}
		if (token === "--no-color") {
			args.color = false;
			continue;
		}
		if (token === "--gc-every") {
			args.gcEveryMs = Number(argv[i + 1]);
			i += 1;
		}
	}

	return args;
}

function createColors(enabled) {
	const useColor =
		enabled &&
		process.stdout.isTTY &&
		process.env.NO_COLOR == null &&
		process.env.TERM !== "dumb";

	const wrap = (open, close) => (text) =>
		useColor ? `${open}${text}${close}` : String(text);

	return {
		bold: wrap("\u001b[1m", "\u001b[22m"),
		dim: wrap("\u001b[2m", "\u001b[22m"),
		green: wrap("\u001b[32m", "\u001b[39m"),
		yellow: wrap("\u001b[33m", "\u001b[39m"),
		cyan: wrap("\u001b[36m", "\u001b[39m"),
		gray: wrap("\u001b[90m", "\u001b[39m"),
	};
}

function hrtimeNs() {
	return process.hrtime.bigint();
}

function toMs(ns) {
	return Number(ns) / 1e6;
}

function summarizeLatencies(latenciesMs) {
	if (latenciesMs.length === 0) {
		return { count: 0 };
	}
	const sorted = [...latenciesMs].sort((a, b) => a - b);
	const sum = latenciesMs.reduce((acc, x) => acc + x, 0);
	const pct = (p) =>
		sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
	return {
		count: latenciesMs.length,
		avg: sum / latenciesMs.length,
		min: sorted[0],
		p50: pct(0.5),
		p95: pct(0.95),
		p99: pct(0.99),
		max: sorted[sorted.length - 1],
	};
}

function formatBandwidth(bytesPerSecond) {
	const megaBytesPerSecond = bytesPerSecond / 1e6;
	const megaBitsPerSecond = (bytesPerSecond * 8) / 1e6;
	return `${megaBytesPerSecond.toFixed(1)} MB/s (${megaBitsPerSecond.toFixed(1)} Mb/s)`;
}

async function waitForSourceByName(grandi, name, timeoutMs = 15_000) {
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

function printHelp() {
	console.log(`grandi benchmark

Usage:
  node scripts/benchmark.mjs [--duration 5] [--fps 30] [--width 1920] [--height 1080] [--mode realtime|throughput] [--no-audio] [--no-color]
  node scripts/benchmark.mjs ... [--gc-every 500]

Modes:
  realtime   Attempts to run at the requested FPS (sender clocking enabled).
  throughput Sends as fast as possible (sender clocking disabled).

Notes:
  - Requires a working local NDI environment.
  - Creates a sender + receiver on the same machine.
  - Measures send/receive rates and best-effort video latency using frame timestamps.
  - For stable long runs at 1080p, run with --expose-gc (pnpm bench does this) so buffers can be reclaimed.
`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const c = createColors(args.color);
	if (args.help) {
		printHelp();
		return;
	}

	if (!grandi.isSupportedCPU()) {
		throw new Error("NDI not supported on this CPU/platform.");
	}

	if (!grandi.initialize()) {
		throw new Error("Failed to initialize NDI.");
	}

	const senderName = `grandi-bench-${process.pid}-${Date.now()}`;
	const durationMs = Math.max(1, Math.floor(args.durationSec * 1000));
	const expectedSize = { xres: args.width, yres: args.height };

	const clocking = args.mode === "realtime";
	const sender = await grandi.send({
		name: senderName,
		clockVideo: clocking,
		clockAudio: clocking,
	});

	let receiver;
	try {
		const source = await waitForSourceByName(grandi, senderName);
		receiver = await grandi.receive({
			source,
			name: `${senderName}-receiver`,
			colorFormat: grandi.ColorFormat.Fastest,
		});

		// Allocate buffers once (avoid per-frame allocations).
		const videoStrideBytes = args.width * 2;
		const videoPayloadBytes = videoStrideBytes * args.height;
		const videoBuffer = Buffer.allocUnsafe(videoPayloadBytes);
		videoBuffer.fill(0xaa);
		const samplesPerFrame = Math.floor(48_000 / args.fps);
		const audioBuffer = Buffer.allocUnsafe(samplesPerFrame * 2 * 4);
		audioBuffer.fill(0);

		// Reuse a single timestamp array and frame objects to reduce GC churn.
		const timestamp = [0, 0];
		const videoFrame = {
			type: "video",
			xres: args.width,
			yres: args.height,
			frameRateN: args.fps,
			frameRateD: 1,
			pictureAspectRatio: args.width / args.height,
			fourCC: grandi.FOURCC_UYVY,
			frameFormatType: grandi.FrameType.Progressive,
			lineStrideBytes: videoStrideBytes,
			data: videoBuffer,
			timestamp,
		};

		const audioFrame = {
			type: "audio",
			sampleRate: 48_000,
			noChannels: 2,
			noSamples: samplesPerFrame,
			channelStrideBytes: samplesPerFrame * 4,
			data: audioBuffer,
			fourCC: grandi.FOURCC_FLTp,
			timestamp,
		};

		const startedAtMs = Date.now();
		const deadlineAtMs = startedAtMs + durationMs;
		const frameIntervalMs = 1000 / args.fps;
		let nextFrameAtMs = startedAtMs;

		let sendVideoCount = 0;
		let sendVideoNs = 0n;
		let sendVideoBytes = 0;
		let sendAudioCount = 0;
		let sendAudioNs = 0n;
		let sendAudioBytes = 0;

		let recvVideoCount = 0;
		let recvVideoBytes = 0;
		let recvAudioCount = 0;
		let recvAudioBytes = 0;
		const videoLatenciesMs = [];
		const maxLatencySamples = 50_000;
		const gcState = { lastGcMs: 0, gcEveryMs: args.gcEveryMs };

		const controller = { running: true };

		const senderTask = (async () => {
			while (controller.running) {
				maybeCollectGarbage(gcState);
				const now = Date.now();
				if (now >= deadlineAtMs) break;

				if (args.mode === "realtime") {
					const waitMs = nextFrameAtMs - now;
					if (waitMs > 0) await sleep(waitMs);

					nextFrameAtMs += frameIntervalMs;
					const afterSleep = Date.now();
					if (nextFrameAtMs < afterSleep - frameIntervalMs) {
						nextFrameAtMs = afterSleep;
					}
				}

				const sendNowMs = Date.now();
				timestamp[0] = Math.floor(sendNowMs / 1000);
				timestamp[1] = (sendNowMs % 1000) * 1_000_000;

				const sendStart = hrtimeNs();
				await sender.video(videoFrame);
				sendVideoNs += hrtimeNs() - sendStart;
				sendVideoCount += 1;
				sendVideoBytes += videoPayloadBytes;

				if (args.audio) {
					const audioStart = hrtimeNs();
					await sender.audio(audioFrame);
					sendAudioNs += hrtimeNs() - audioStart;
					sendAudioCount += 1;
					sendAudioBytes += audioBuffer.length;
				}

				if (args.mode === "throughput" && Date.now() >= deadlineAtMs) break;
			}
		})();

		const receiverTask = (async () => {
			while (controller.running && Date.now() < deadlineAtMs) {
				maybeCollectGarbage(gcState);
				const frame = await receiver.data(500);
				if (frame.type === "video") {
					if (
						frame.xres !== expectedSize.xres ||
						frame.yres !== expectedSize.yres
					) {
						continue;
					}

					recvVideoCount += 1;
					recvVideoBytes += frame.data.length;
					const [sec, nanos] = frame.timestamp;
					const sentMs = sec * 1000 + nanos / 1e6;
					const latency = Date.now() - sentMs;
					if (videoLatenciesMs.length < maxLatencySamples) {
						videoLatenciesMs.push(latency);
					}
				} else if (args.audio && frame.type === "audio") {
					recvAudioCount += 1;
					recvAudioBytes += frame.data.length;
				}
			}
		})();

		await Promise.race([senderTask, receiverTask, sleep(durationMs)]);
		controller.running = false;
		await Promise.allSettled([senderTask, receiverTask]);

		const elapsedMs = Date.now() - startedAtMs;
		const sendVideoAvgMs = sendVideoCount
			? toMs(sendVideoNs) / sendVideoCount
			: 0;
		const sendAudioAvgMs = sendAudioCount
			? toMs(sendAudioNs) / sendAudioCount
			: 0;
		const recvVideoFps = (recvVideoCount * 1000) / elapsedMs;
		const sendVideoFps = (sendVideoCount * 1000) / elapsedMs;
		const sendVideoBytesPerSec = (sendVideoBytes * 1000) / elapsedMs;
		const recvVideoBytesPerSec = (recvVideoBytes * 1000) / elapsedMs;
		const sendAudioBytesPerSec = (sendAudioBytes * 1000) / elapsedMs;
		const recvAudioBytesPerSec = (recvAudioBytes * 1000) / elapsedMs;

		const latency = summarizeLatencies(videoLatenciesMs);

		console.log(
			c.bold(c.cyan("Benchmark results")) +
				c.gray(` (${args.mode}, ${elapsedMs}ms)`),
		);
		console.log(`${c.bold("- sender.name:")} ${c.green(senderName)}`);
		console.log(
			`${c.bold("- format:")} ${c.green(`${args.width}x${args.height}`)} ` +
				`${c.gray(`(${args.fps} fps target)`)}`,
		);
		console.log(
			`${c.bold("- video:")} sent=${c.green(sendVideoCount)} ` +
				`${c.gray(`(${sendVideoFps.toFixed(1)} fps)`)} ` +
				`recv=${c.green(recvVideoCount)} ` +
				`${c.gray(`(${recvVideoFps.toFixed(1)} fps)`)} ` +
				`avgSend=${c.yellow(`${sendVideoAvgMs.toFixed(3)}ms`)}`,
		);
		console.log(
			`${c.bold("- bandwidth (payload):")} ` +
				`sendVideo=${c.yellow(formatBandwidth(sendVideoBytesPerSec))} ` +
				`recvVideo=${c.yellow(formatBandwidth(recvVideoBytesPerSec))}`,
		);
		if (args.audio) {
			console.log(
				`${c.bold("- audio:")} sent=${c.green(sendAudioCount)}, avgSend=${c.yellow(`${sendAudioAvgMs.toFixed(3)}ms`)}`,
			);
			console.log(
				`${c.bold("- audio bandwidth (payload):")} ` +
					`sendAudio=${c.yellow(formatBandwidth(sendAudioBytesPerSec))} ` +
					`recvAudio=${c.yellow(formatBandwidth(recvAudioBytesPerSec))} ` +
					`${c.gray(`(recvFrames=${recvAudioCount})`)}`,
			);
		}
		if (latency.count) {
			console.log(
				`${c.bold("- video latency (ms):")} ` +
					`avg=${c.yellow(latency.avg.toFixed(1))} ` +
					`p50=${c.yellow(latency.p50.toFixed(1))} ` +
					`p95=${c.yellow(latency.p95.toFixed(1))} ` +
					`p99=${c.yellow(latency.p99.toFixed(1))} ` +
					`min=${c.yellow(latency.min.toFixed(1))} ` +
					`max=${c.yellow(latency.max.toFixed(1))} ` +
					`n=${c.green(latency.count)}`,
			);
		} else {
			console.log(
				`${c.bold("- video latency:")} ${c.dim(
					"no samples (no video frames received)",
				)}`,
			);
		}
	} finally {
		try {
			receiver?.destroy();
		} catch {}
		try {
			sender.destroy();
		} catch {}
		grandi.destroy();
	}
}

await main();
