import path from "node:path";
import bindings from "bindings";

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

const addon: T.GrandiAddon = isSupportedPlatform()
	? bindings({
			bindings: "grandi",
			module_root: path.resolve(__dirname, ".."),
		})
	: {
			version() {
				return "";
			},
			isSupportedCPU() {
				return false;
			},
			initialize() {},
			destroy() {},
			send() {
				return null;
			},
			receive() {
				return null;
			},
			routing() {
				return null;
			},
			find() {
				return null;
			},
		};

function find(params: T.FindOptions = {}): Promise<T.Finder> {
	if (!params) return addon.find();
	if (Array.isArray(params.groups)) {
		params.groups = params.groups.reduce((x: string, y: string) => `${x},${y}`);
	}
	if (Array.isArray(params.extraIPs)) {
		params.extraIPs = params.extraIPs.reduce(
			(x: string, y: string) => `${x},${y}`,
		);
	}
	return addon.find(params);
}
export default {
	version: addon.version,
	isSupportedCPU: addon.isSupportedCPU,
	initialize: addon.initialize,
	destroy: addon.destroy,
	send: addon.send,
	receive: addon.receive,
	routing: addon.routing,
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
