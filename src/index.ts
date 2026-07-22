import path from "node:path";
import nodeGypBuild from "node-gyp-build";
import platformTargets from "./platforms.json" with { type: "json" };

import type {
	Finder,
	FindOptions,
	FrameSync,
	Grandi,
	ReceiveOptions,
	Receiver,
	Routing,
	Sender,
	SendOptions,
} from "./types.js";
import {
	AudioFormat,
	Bandwidth,
	ColorFormat,
	FourCC,
	FrameType,
	TIMECODE_SYNTHESIZE,
} from "./types.js";

function currentPlatformTarget() {
	return platformTargets.find(
		(target) =>
			target.platform === process.platform && target.arch === process.arch,
	);
}

/**
 * Checks if the current platform and architecture are supported by NDI.
 * @returns {boolean} True if the platform and architecture are supported, false otherwise.
 */
function isSupportedPlatform(): boolean {
	return currentPlatformTarget() !== undefined;
}

function tryRequireArchPackage(): GrandiAddon | null {
	const archKey = `${process.platform}-${process.arch}`;
	const target = currentPlatformTarget();
	if (!target)
		throw new Error(`Unsupported platform or architecture: ${archKey}`);
	const pkg = target.packageName;
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		return require(pkg) as GrandiAddon;
	} catch (cause) {
		const packageError = new Error(
			`Failed to find prebuilt package for ${archKey}. Please ensure that the package "${pkg}" is installed`,
		);
		Object.defineProperty(packageError, "cause", {
			configurable: true,
			value: cause,
		});
		throw packageError;
	}
}

function loadAddon(): GrandiAddon {
	const loadErrors: Error[] = [];
	if (!isSupportedPlatform()) {
		console.error(
			`Unsupported platform or architecture: ${process.platform}-${process.arch}`,
		);
		return noopAddon;
	}

	try {
		const localBinding = nodeGypBuild(
			path.join(__dirname, ".."),
		) as GrandiAddon;
		if (localBinding) return localBinding;
	} catch (err) {
		loadErrors.push(err as Error);
	}

	try {
		const archAddon = tryRequireArchPackage();
		if (archAddon) return archAddon;
		loadErrors.push(
			new Error(
				`Prebuilt package for ${process.platform}-${process.arch} did not provide an addon`,
			),
		);
	} catch (err) {
		loadErrors.push(err as Error);
	}

	if (loadErrors.length > 0) {
		const message =
			"Failed to load native addon:\n" +
			loadErrors.map((e, i) => `  [${i + 1}] ${e.message}`).join("\n");
		type AddonLoadError = Error & { errors: Error[] };
		const AggregateErrorConstructor = (
			globalThis as typeof globalThis & {
				AggregateError?: new (
					errors: Error[],
					message: string,
				) => AddonLoadError;
			}
		).AggregateError;
		throw AggregateErrorConstructor
			? new AggregateErrorConstructor(loadErrors, message)
			: Object.assign(new Error(message), { errors: loadErrors });
	}
	throw new Error("Failed to load native addon");
}

/** @internal Native addon contract used by the JavaScript wrapper. */
export interface GrandiAddon {
	version(): string;
	isSupportedCPU(): boolean;
	initialize(): boolean;
	destroy(): boolean;
	find(params?: FindOptions): Promise<Finder>;
	receive(params: ReceiveOptions): Promise<Receiver>;
	framesync(receiver: Receiver): Promise<FrameSync>;
	send(params: SendOptions): Promise<Sender>;
	routing(params: { name?: string; groups?: string }): Promise<Routing>;
}

const noopAddon: GrandiAddon = {
	version() {
		return "";
	},
	isSupportedCPU() {
		return false;
	},
	initialize() {
		return false;
	},
	destroy() {
		return false;
	},
	send(_params) {
		return Promise.reject(new Error("Unsupported platform or CPU"));
	},
	receive(_params) {
		return Promise.reject(new Error("Unsupported platform or CPU"));
	},
	framesync(_receiver) {
		return Promise.reject(new Error("Unsupported platform or CPU"));
	},
	routing() {
		return Promise.reject(new Error("Unsupported platform or CPU"));
	},
	find(_params) {
		return Promise.reject(new Error("Unsupported platform or CPU"));
	},
};

const addon: GrandiAddon = loadAddon();
/**
 * Creates a finder to discover NDI sources on the network.
 * @param {FindOptions} params - Options for finding sources.
 * @param {boolean} [params.showLocalSources] - Whether to show local sources.
 * @param {string} [params.groups] - Multicast groups to search in.
 * @param {string} [params.extraIPs] - Additional IP addresses to search.
 * @returns {Promise<Finder>} A promise that resolves to a Finder instance for discovering sources.
 * @throws {Error} Promise rejects on unsupported platform/CPU or if the finder cannot be created.
 *
 * @example
 * ```js
 * import { find, initialize } from "grandi";
 * initialize();
 * const finder = await find({ showLocalSources: true });
 * await finder.wait(1000);
 * console.log(finder.sources());
 * finder.destroy();
 * ```
 */
export function find(params: FindOptions = {}): Promise<Finder> {
	const { extraIPs, extraIps, ...options } = params;
	const normalizedExtraIps = extraIPs ?? extraIps;
	return addon.find(
		normalizedExtraIps === undefined
			? options
			: { ...options, extraIPs: normalizedExtraIps },
	);
}
// Named runtime exports
/**
 * Gets the version of the NDI SDK.
 * @returns {string} The NDI SDK version string.
 */
export const version = addon.version;
/**
 * Checks if the current CPU architecture is supported by NDI.
 * @returns {boolean} True if the CPU is supported, false otherwise.
 */
export const isSupportedCPU = addon.isSupportedCPU;
/**
 * Optionally initializes the process-global NDI library. The SDK does not require
 * this call, but eager initialization is recommended for explicit lifecycle management.
 * @returns {boolean} True if initialization was successful and the CPU is supported.
 *
 * @example
 * ```js
 * import { initialize } from "grandi";
 * if (!initialize()) throw new Error("NDI init failed");
 * ```
 */
export const initialize = addon.initialize;
/**
 * Optionally shuts down the process-global NDI library.
 * When managing the lifecycle explicitly, destroy all native objects before calling this.
 * @returns {boolean} True after requesting shutdown.
 *
 * @example
 * ```js
 * import { destroy } from "grandi";
 * destroy();
 * ```
 */
export const destroy = addon.destroy;
/**
 * Creates an NDI sender for transmitting video and audio over the network.
 * @param {SendOptions} params - Options for creating the sender.
 * @param {string} params.name - The name of the NDI source.
 * @param {string} [params.groups] - Multicast groups to send to.
 * @param {boolean} [params.clockVideo] - Whether to clock video frames.
 * @param {boolean} [params.clockAudio] - Whether to clock audio frames.
 * @returns {Promise<Sender>} A promise that resolves to a Sender instance for transmitting data.
 * @throws {Error} Promise rejects on unsupported platform/CPU or if sender creation fails.
 *
 * @example
 * ```js
 * import { initialize, send } from "grandi";
 * initialize();
 * const sender = await send({ name: "My Source" });
 * // sender.video(...) / sender.audio(...)
 * sender.destroy();
 * ```
 */
export async function send(params: SendOptions): Promise<Sender> {
	const native = await addon.send(params);
	Object.defineProperty(native, "sourceName", {
		configurable: true,
		value: native.sourcename,
	});
	const origTally = native.tally;
	native.tally = () => {
		const result = origTally.call(native);
		Object.defineProperties(result, {
			onProgram: {
				configurable: true,
				get() {
					return this.on_program;
				},
			},
			onPreview: {
				configurable: true,
				get() {
					return this.on_preview;
				},
			},
		});
		return result;
	};
	return native;
}
/**
 * Creates an NDI receiver for receiving video and audio from an NDI source.
 * @param {ReceiveOptions} params - Options for creating the receiver.
 * @param {ReceiveOptions["source"]} params.source - The NDI source to connect to.
 * @param {ReceiveOptions["colorFormat"]} [params.colorFormat] - The color format for received video.
 * @param {ReceiveOptions["bandwidth"]} [params.bandwidth] - The bandwidth limitation for the connection.
 * @param {boolean} [params.allowVideoFields] - Whether to allow video fields.
 * @param {string} [params.name] - The name for the receiver.
 * @returns {Promise<Receiver>} A promise that resolves to a Receiver instance for receiving data.
 * @throws {Error} Promise rejects on unsupported platform/CPU or if receiver creation fails.
 *
 * @example
 * ```js
 * import { find, initialize, receive } from "grandi";
 * initialize();
 * const finder = await find({ showLocalSources: true });
 * await finder.wait(1000);
 * const source = finder.sources()[0];
 * finder.destroy();
 * const receiver = await receive({ source });
 * const frame = await receiver.video(1000);
 * receiver.destroy();
 * ```
 */
export const receive = addon.receive;
export const frameSync = addon.framesync;
/** @deprecated Use `frameSync` instead. */
export const framesync = addon.framesync;
export async function routing(params: {
	name?: string;
	groups?: string;
}): Promise<Routing> {
	const native = await addon.routing(params);
	Object.defineProperty(native, "sourceName", {
		configurable: true,
		value: native.sourcename,
	});
	return native;
}

// Re-export enums and timing constants for convenient named imports
export {
	AudioFormat,
	Bandwidth,
	ColorFormat,
	FourCC,
	FrameType,
	TIMECODE_SYNTHESIZE,
};
export type {
	AudioFourCC,
	AudioFrame,
	AudioReceiveOptions,
	Finder,
	FindOptions,
	FrameSync,
	FrameSyncAudioFormat,
	FrameSyncAudioOptions,
	FrameSyncAudioOptionsBase,
	Grandi,
	ReceivedAudioFrame,
	ReceivedMetadataFrame,
	ReceivedVideoFrame,
	ReceiveOptions,
	ReceiverDataFrame,
	Receiver,
	ReceiverPerformance,
	ReceiverQueue,
	ReceiverTallyState,
	Routing,
	Sender,
	SendOptions,
	SenderTally,
	Source,
	SourceChangeEvent,
	StatusChangeEvent,
	Timecode,
	TimeoutEvent,
	VideoFourCC,
	VideoFrame,
} from "./types.js";

const grandi: Grandi = {
	version,
	isSupportedCPU,
	initialize,
	destroy,
	send,
	receive,
	frameSync,
	routing,
	find,
	ColorFormat,
	AudioFormat,
	Bandwidth,
	FrameType,
	FourCC,
	TIMECODE_SYNTHESIZE,
};

export default grandi;
