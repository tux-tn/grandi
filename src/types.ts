export enum FrameType {
	Interlaced = 0,
	Progressive = 1,
	Field0 = 2,
	Field1 = 3,
}
export enum ColorFormat {
	BGRX_BGRA = 0,
	UYVY_BGRA = 1,
	RGBX_RGBA = 2,
	UYVY_RGBA = 3,
	Fastest = 100,
	Best = 101,
	BGRX_BGRA_FLIPPED = 200,
}
export enum AudioFormat {
	Float32Separate = 0,
	Float32Interleaved = 1,
	Int16Interleaved = 2,
}
export enum Bandwidth {
	MetadataOnly = -10,
	AudioOnly = 10,
	Lowest = 0,
	Highest = 100,
}
export enum FourCC {
	UYVY = 1498831189,
	UYVA = 1096178005,
	P216 = 909193808,
	PA16 = 909197648,
	YV12 = 842094169,
	I420 = 808596553,
	NV12 = 842094158,
	BGRA = 1095911234,
	BGRX = 1481787202,
	RGBA = 1094862674,
	RGBX = 1480738642,
	FLTp = 1884572742,
}
export type PtpTimestamp = [number, number]; // [seconds, nanoseconds]
export type Timecode = bigint | number | PtpTimestamp;

export interface Source {
	name: string;
	urlAddress?: string;
}

type NodeBuffer = Buffer | Uint8Array | ArrayBuffer;

export interface VideoFrame {
	type: "video";
	xres: number;
	yres: number;
	frameRateN: number;
	frameRateD: number;
	pictureAspectRatio: number;
	fourCC: FourCC;
	frameFormatType: FrameType;
	lineStrideBytes: number;
	data: NodeBuffer;
	timecode?: Timecode;
	timestamp?: PtpTimestamp;
}

export interface AudioFrame {
	type: "audio";
	audioFormat: AudioFormat;
	referenceLevel: number;
	sampleRate: number;
	channels: number;
	samples: number;
	channelStrideInBytes: number;
	data: NodeBuffer;
	timecode?: Timecode;
	timestamp?: PtpTimestamp;
}

export interface Receiver {
	embedded: unknown;
	video(timeoutMs?: number): Promise<VideoFrame>;
	audio(
		params: { audioFormat: AudioFormat; referenceLevel: number },
		timeoutMs?: number,
	): Promise<AudioFrame>;
	metadata: unknown;
	data: unknown;
	source: Source;
	colorFormat: ColorFormat;
	bandwidth: Bandwidth;
	allowVideoFields: boolean;
}

export interface Sender {
	embedded: unknown;
	name: string;
	groups?: string | string[];
	clockVideo: boolean;
	clockAudio: boolean;
	video(frame: VideoFrame): Promise<void>;
	audio(frame: AudioFrame): Promise<void>;
	connections(): number;
	destroy(): Promise<void>;
}

export interface Routing {
	name: string;
	groups?: string | string[];
	embedded: unknown;
	destroy(): Promise<void>;
	change(source: Source): number;
	clear(): boolean;
	connections(): number;
	sourcename(): string;
}

export interface Finder {
	sources(): Source[];
	wait(ms: number): Promise<void>;
	destroy(): Promise<void>;
}

export interface FindOptions {
	showLocalSources?: boolean;
	groups?: string | string[];
	extraIPs?: string | string[];
}

export interface ReceiveOptions {
	source: Source;
	colorFormat?: ColorFormat;
	bandwidth?: Bandwidth;
	allowVideoFields?: boolean;
	name?: string;
}

export interface SendOptions {
	name: string;
	groups?: string | string[];
	clockVideo?: boolean;
	clockAudio?: boolean;
}

export interface GrandiAddon {
	version(): string;
	isSupportedCPU(): boolean;
	initialize(): void;
	destroy(): void;
	find(params?: FindOptions): Promise<Finder>;
	receive(params: ReceiveOptions): Receiver;
	send(params: SendOptions): Sender;
	routing(params: { name: string; groups?: string | string[] }): Routing;
}
