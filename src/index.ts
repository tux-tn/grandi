import path from "node:path";
import nodeGypBuild from "node-gyp-build";

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
} from "./types";
import {
	AudioFormat,
	Bandwidth,
	ColorFormat,
	FourCC,
	FrameType,
} from "./types";

/**
 * Checks if the current platform and architecture are supported by NDI.
 * @returns {boolean} True if the platform is supported (darwin, linux, or win32 with ia32/x64), false otherwise.
 */
function isSupportedPlatform(): boolean {
	return (
		process.platform === "darwin" ||
		process.platform === "linux" ||
		(process.platform === "win32" && ["ia32", "x64"].includes(process.arch))
	);
}

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

const addon: GrandiAddon = isSupportedPlatform()
	? (nodeGypBuild(path.join(__dirname, "..")) as GrandiAddon)
	: noopAddon;

/**
 * Creates a finder to discover NDI sources on the network.
 * @param {FindOptions} [params={}] - Options for finding sources.
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
 * finder.wait(1000);
 * console.log(finder.sources());
 * finder.destroy();
 * ```
 */
export function find(params: FindOptions = {}): Promise<Finder> {
	return addon.find(params);
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
 * Initializes the NDI library. Must be called before using any other NDI functions.
 * @returns {boolean} True if initialization was successful, false otherwise.
 *
 * @example
 * ```js
 * import { initialize } from "grandi";
 * if (!initialize()) throw new Error("NDI init failed");
 * ```
 */
export const initialize = addon.initialize;
/**
 * Destroys the NDI library instance and cleans up resources.
 * Should be called when done using NDI to free resources.
 * @returns {boolean} True if destruction was successful, false otherwise.
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
export const send = addon.send;
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
 * finder.wait(1000);
 * const source = finder.sources()[0];
 * finder.destroy();
 * const receiver = await receive({ source });
 * const frame = await receiver.video(1000);
 * receiver.destroy();
 * ```
 */
export const receive = addon.receive;
/**
 * Creates an NDI frame-synchronizer (time base corrector) backed by an existing receiver.
 * Use this when you want smooth playback clocked to your own render/audio loop.
 *
 * Note: destroy the frame-sync before destroying the receiver.
 * @param {Receiver} receiver - The receiver instance to frame-sync.
 * @returns {Promise<FrameSync>} A promise that resolves to a FrameSync instance.
 * @throws {Error} Promise rejects on unsupported platform/CPU or if framesync creation fails.
 *
 * @example
 * ```js
 * import grandi from "grandi";
 * grandi.initialize();
 * const receiver = await grandi.receive({ source });
 * const fs = await grandi.framesync(receiver);
 * const frame = await fs.video(grandi.FrameType.Progressive);
 * fs.destroy();
 * receiver.destroy();
 * ```
 */
export const framesync = addon.framesync;
/**
 * Creates an NDI router for switching between different NDI sources.
 * @param {Object} params - Options for creating the router.
 * @param {string} [params.name] - The name for the router.
 * @param {string} [params.groups] - Multicast groups for the router.
 * @returns {Promise<Routing>} A promise that resolves to a Routing instance for source switching.
 * @throws {Error} Promise rejects on unsupported platform/CPU or if routing creation fails.
 *
 * @example
 * ```js
 * import { initialize, routing } from "grandi";
 * initialize();
 * const router = await routing({ name: "My Router" });
 * // router.change(source)
 * router.destroy();
 * ```
 */
export const routing = addon.routing;

// Re-export enums and types for convenient named imports
export { ColorFormat, AudioFormat, Bandwidth, FrameType, FourCC };
export type {
	AudioFrame,
	AudioReceiveOptions,
	Finder,
	FindOptions,
	FrameSync,
	FrameSyncAudioOptions,
	Grandi,
	PtpTimestamp,
	ReceivedAudioFrame,
	ReceivedMetadataFrame,
	ReceivedVideoFrame,
	ReceiveOptions,
	ReceiverDataFrame,
	ReceiverTallyState,
	Routing,
	Sender,
	SenderTally,
	Source,
	SourceChangeEvent,
	StatusChangeEvent,
	Timecode,
	TimeoutEvent,
	VideoFrame,
} from "./types";

const grandi: Grandi = {
	version,
	isSupportedCPU,
	initialize,
	destroy,
	send,
	receive,
	framesync,
	routing,
	find,
	ColorFormat,
	AudioFormat,
	Bandwidth,
	FrameType,
	FourCC,

	// Constants mapped to enum values
	COLOR_FORMAT_BGRX_BGRA: ColorFormat.BGRX_BGRA,
	COLOR_FORMAT_UYVY_BGRA: ColorFormat.UYVY_BGRA,
	COLOR_FORMAT_RGBX_RGBA: ColorFormat.RGBX_RGBA,
	COLOR_FORMAT_UYVY_RGBA: ColorFormat.UYVY_RGBA,
	COLOR_FORMAT_FASTEST: ColorFormat.Fastest,
	COLOR_FORMAT_BGRX_BGRA_FLIPPED: ColorFormat.BGRX_BGRA_FLIPPED,

	BANDWIDTH_METADATA_ONLY: Bandwidth.MetadataOnly,
	BANDWIDTH_AUDIO_ONLY: Bandwidth.AudioOnly,
	BANDWIDTH_LOWEST: Bandwidth.Lowest,
	BANDWIDTH_HIGHEST: Bandwidth.Highest,

	FORMAT_TYPE_PROGRESSIVE: FrameType.Progressive,
	FORMAT_TYPE_INTERLACED: FrameType.Interlaced,
	FORMAT_TYPE_FIELD_0: FrameType.Field0,
	FORMAT_TYPE_FIELD_1: FrameType.Field1,

	AUDIO_FORMAT_FLOAT_32_SEPARATE: AudioFormat.Float32Separate,
	AUDIO_FORMAT_FLOAT_32_INTERLEAVED: AudioFormat.Float32Interleaved,
	AUDIO_FORMAT_INT_16_INTERLEAVED: AudioFormat.Int16Interleaved,

	// FourCC helpers/constants
	FOURCC_UYVY: FourCC.UYVY,
	FOURCC_UYVA: FourCC.UYVA,
	FOURCC_P216: FourCC.P216,
	FOURCC_PA16: FourCC.PA16,
	FOURCC_YV12: FourCC.YV12,
	FOURCC_I420: FourCC.I420,
	FOURCC_NV12: FourCC.NV12,
	FOURCC_BGRA: FourCC.BGRA,
	FOURCC_BGRX: FourCC.BGRX,
	FOURCC_RGBA: FourCC.RGBA,
	FOURCC_RGBX: FourCC.RGBX,
	FOURCC_FLTp: FourCC.FLTp,
};

export default grandi;
