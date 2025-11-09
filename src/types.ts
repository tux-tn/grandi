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

export interface VideoFrame {
	type?: "video";
	xres: number;
	yres: number;
	frameRateN: number;
	frameRateD: number;
	pictureAspectRatio: number;
	fourCC: FourCC;
	frameFormatType: FrameType;
	lineStrideBytes: number;
	data: Buffer;
	timecode?: Timecode;
	timestamp?: PtpTimestamp;
	metadata?: string;
}

export interface ReceivedVideoFrame extends VideoFrame {
	type: "video";
	timecode: PtpTimestamp;
	timestamp: PtpTimestamp;
	metadata?: string;
}

export interface AudioFrame {
	type?: "audio";
	sampleRate: number;
	noChannels: number;
	noSamples: number;
	channelStrideBytes: number;
	data: Buffer;
	fourCC: FourCC;
	timecode?: Timecode;
	timestamp?: PtpTimestamp;
	metadata?: string;
}

export interface ReceivedAudioFrame {
	type: "audio";
	audioFormat: AudioFormat;
	referenceLevel?: number;
	sampleRate: number;
	channels: number;
	samples: number;
	channelStrideInBytes: number;
	data: Buffer;
	timecode: PtpTimestamp;
	timestamp: PtpTimestamp;
	metadata?: string;
}

export interface ReceivedMetadataFrame {
	type: "metadata";
	length: number;
	timecode: PtpTimestamp;
	timestamp: PtpTimestamp;
	data: string;
}

export interface SourceChangeEvent {
	type: "sourceChange";
}

export interface StatusChangeEvent {
	type: "statusChange";
}

export type ReceiverDataFrame =
	| ReceivedVideoFrame
	| ReceivedAudioFrame
	| ReceivedMetadataFrame
	| SourceChangeEvent
	| StatusChangeEvent;

export interface AudioReceiveOptions {
	audioFormat?: AudioFormat;
	referenceLevel?: number;
}

export interface Receiver {
	embedded: unknown;
	video(timeoutMs?: number): Promise<ReceivedVideoFrame>;
	audio(timeoutMs?: number): Promise<ReceivedAudioFrame>;
	audio(
		options: AudioReceiveOptions,
		timeoutMs?: number,
	): Promise<ReceivedAudioFrame>;
	metadata(timeoutMs?: number): Promise<ReceivedMetadataFrame>;
	data(timeoutMs?: number): Promise<ReceiverDataFrame>;
	data(
		options: AudioReceiveOptions,
		timeoutMs?: number,
	): Promise<ReceiverDataFrame>;
	source: Source;
	colorFormat: ColorFormat;
	bandwidth: Bandwidth;
	allowVideoFields: boolean;
	name?: string;
}

export interface SenderTally {
	changed: boolean;
	on_program: boolean;
	on_preview: boolean;
}

export interface Sender {
	embedded: unknown;
	name: string;
	groups?: string;
	clockVideo: boolean;
	clockAudio: boolean;
	video(frame: VideoFrame): Promise<void>;
	audio(frame: AudioFrame): Promise<void>;
	connections(): number;
	tally(): SenderTally;
	sourcename(): string;
	destroy(): Promise<void>;
}

export interface Routing {
	embedded: unknown;
	name?: string;
	groups?: string;
	destroy(): Promise<void>;
	change(source: Source): boolean;
	clear(): boolean;
	connections(): number;
	sourcename(): string;
}

export interface Finder {
	sources(): Source[];
	wait(timeoutMs?: number): boolean;
	destroy(): Promise<void>;
}

export interface FindOptions {
	showLocalSources?: boolean;
	groups?: string;
	extraIPs?: string;
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
	groups?: string;
	clockVideo?: boolean;
	clockAudio?: boolean;
}

export interface GrandiAddon {
	version(): string;
	isSupportedCPU(): boolean;
	initialize(): boolean;
	destroy(): boolean;
	find(params: FindOptions): Promise<Finder>;
	receive(params: ReceiveOptions): Promise<Receiver>;
	send(params: SendOptions): Promise<Sender>;
	routing(params: { name?: string; groups?: string }): Promise<Routing>;
}
