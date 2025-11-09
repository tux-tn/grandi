import path from "node:path";
import nodeGypBuild from "node-gyp-build";

import type * as T from "./types";
import {
	AudioFormat,
	Bandwidth,
	ColorFormat,
	FourCC,
	FrameType,
} from "./types";

function isSupportedPlatform(): boolean {
	return (
		process.platform === "darwin" ||
		process.platform === "linux" ||
		(process.platform === "win32" && ["ia32", "x64"].includes(process.arch))
	);
}

const noopAddon: T.GrandiAddon = {
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
	routing() {
		return Promise.reject(new Error("Unsupported platform or CPU"));
	},
	find(_params) {
		return Promise.reject(new Error("Unsupported platform or CPU"));
	},
};

const addon: T.GrandiAddon = isSupportedPlatform()
	? (nodeGypBuild(path.join(__dirname, "..")) as T.GrandiAddon)
	: noopAddon;

export function find(params: T.FindOptions = {}): Promise<T.Finder> {
	return addon.find(params);
}
// Named runtime exports
export const version = addon.version;
export const isSupportedCPU = addon.isSupportedCPU;
export const initialize = addon.initialize;
export const destroy = addon.destroy;
export const send = addon.send;
export const receive = addon.receive;
export const routing = addon.routing;

// Re-export enums and types for convenient named imports
export { ColorFormat, AudioFormat, Bandwidth, FrameType, FourCC };
export type {
	AudioFrame,
	AudioReceiveOptions,
	Finder,
	FindOptions,
	GrandiAddon,
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
	VideoFrame,
} from "./types";

const grandi = {
	version,
	isSupportedCPU,
	initialize,
	destroy,
	send,
	receive,
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
