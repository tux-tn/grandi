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
	// Windows-only NDI SDK extension: 1000 + BGRX_BGRA.
	BGRX_BGRA_FLIPPED = 1000,
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

export interface TimeoutEvent {
	type: "timeout";
}

export type ReceiverDataFrame =
	| ReceivedVideoFrame
	| ReceivedAudioFrame
	| ReceivedMetadataFrame
	| SourceChangeEvent
	| StatusChangeEvent
	| TimeoutEvent;

export interface AudioReceiveOptions {
	audioFormat?: AudioFormat;
	referenceLevel?: number;
}

export interface Receiver {
	embedded: unknown;
	source: Source;
	colorFormat: ColorFormat;
	bandwidth: Bandwidth;
	allowVideoFields: boolean;
	name?: string;
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
	tally(state: ReceiverTallyState): boolean;
	destroy(): boolean;
}

export interface ReceiverTallyState {
	onProgram?: boolean;
	onPreview?: boolean;
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
	metadata(data: string): boolean;
	tally(): SenderTally;
	sourcename(): string;
	destroy(): boolean;
}

export interface Routing {
	embedded: unknown;
	name?: string;
	groups?: string;
	destroy(): boolean;
	change(source: Source): boolean;
	clear(): boolean;
	connections(): number;
	sourcename(): string;
}

export interface Finder {
	sources(): Source[];
	wait(timeoutMs?: number): boolean;
	destroy(): boolean;
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

export interface Grandi {
	/**
	 * Gets the NDI SDK version string (e.g. `"NDI SDK 6.0.0.0"`).
	 * @returns The NDI SDK version string.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * console.log(grandi.version());
	 * ```
	 */
	version(): string;
	/**
	 * Checks if the current CPU architecture is supported by NDI.
	 * @returns `true` when NDI is supported on this CPU/platform.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * if (!grandi.isSupportedCPU()) throw new Error("NDI unsupported here");
	 * ```
	 */
	isSupportedCPU(): boolean;
	/**
	 * Initializes the NDI library. Must be called before using any other NDI functions.
	 * Call this once per process, before creating senders/receivers/finders.
	 * @returns `true` if initialization was successful.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * if (!grandi.initialize()) throw new Error("NDI init failed");
	 * ```
	 */
	initialize(): boolean;
	/**
	 * Destroys the NDI library instance and cleans up resources.
	 * Should be called when done using NDI to free resources.
	 * @returns `true` if destruction was successful.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * grandi.destroy();
	 * ```
	 */
	destroy(): boolean;
	/**
	 * Creates an NDI sender for transmitting video and audio over the network.
	 * @param params Sender options.
	 * @returns A promise that resolves to a Sender instance.
	 * @throws {Error} Promise rejects on unsupported platform/CPU or if sender creation fails.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * grandi.initialize();
	 * const sender = await grandi.send({ name: "My Source" });
	 * ```
	 */
	send(params: SendOptions): Promise<Sender>;
	/**
	 * Creates an NDI receiver for receiving video and audio from an NDI source.
	 * @param params Receiver options.
	 * @returns A promise that resolves to a Receiver instance.
	 * @throws {Error} Promise rejects on unsupported platform/CPU or if receiver creation fails.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * grandi.initialize();
	 * const finder = await grandi.find({ showLocalSources: true });
	 * finder.wait(1000);
	 * const source = finder.sources()[0];
	 * finder.destroy();
	 * const receiver = await grandi.receive({ source });
	 * const frame = await receiver.video(1000);
	 * receiver.destroy();
	 * ```
	 */
	receive(params: ReceiveOptions): Promise<Receiver>;
	/**
	 * Creates an NDI router for switching between different NDI sources.
	 * @param params Router options.
	 * @returns A promise that resolves to a Routing instance.
	 * @throws {Error} Promise rejects on unsupported platform/CPU or if routing creation fails.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * grandi.initialize();
	 * const router = await grandi.routing({ name: "My Router" });
	 * // router.change(source) to route a discovered source
	 * router.destroy();
	 * ```
	 */
	routing(params: { name?: string; groups?: string }): Promise<Routing>;
	/**
	 * Creates a finder to discover NDI sources on the network.
	 * @param params Discovery options.
	 * @returns A promise that resolves to a Finder instance.
	 * @throws {Error} Promise rejects on unsupported platform/CPU or if the finder cannot be created.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * grandi.initialize();
	 * const finder = await grandi.find({ showLocalSources: true });
	 * finder.wait(1000);
	 * console.log(finder.sources());
	 * finder.destroy();
	 * ```
	 */
	find(params?: FindOptions): Promise<Finder>;

	/**
	 * Enum: receiver video color formats.
	 */
	ColorFormat: typeof ColorFormat;
	/**
	 * Enum: supported raw audio formats for helpers/receive conversions.
	 */
	AudioFormat: typeof AudioFormat;
	/**
	 * Enum: receiver bandwidth modes.
	 */
	Bandwidth: typeof Bandwidth;
	/**
	 * Enum: video frame format types (progressive/interlaced/fields).
	 */
	FrameType: typeof FrameType;
	/**
	 * Enum: FourCC pixel/audio formats used in frames.
	 */
	FourCC: typeof FourCC;

	// Constant aliases for backwards compatibility / convenience.
	/**
	 * Alias of `ColorFormat.BGRX_BGRA`.
	 */
	COLOR_FORMAT_BGRX_BGRA: ColorFormat;
	/**
	 * Alias of `ColorFormat.UYVY_BGRA`.
	 */
	COLOR_FORMAT_UYVY_BGRA: ColorFormat;
	/**
	 * Alias of `ColorFormat.RGBX_RGBA`.
	 */
	COLOR_FORMAT_RGBX_RGBA: ColorFormat;
	/**
	 * Alias of `ColorFormat.UYVY_RGBA`.
	 */
	COLOR_FORMAT_UYVY_RGBA: ColorFormat;
	/**
	 * Alias of `ColorFormat.Fastest`.
	 */
	COLOR_FORMAT_FASTEST: ColorFormat;
	/**
	 * Alias of `ColorFormat.BGRX_BGRA_FLIPPED` (Windows-only).
	 */
	COLOR_FORMAT_BGRX_BGRA_FLIPPED: ColorFormat;

	/**
	 * Alias of `Bandwidth.MetadataOnly`.
	 */
	BANDWIDTH_METADATA_ONLY: Bandwidth;
	/**
	 * Alias of `Bandwidth.AudioOnly`.
	 */
	BANDWIDTH_AUDIO_ONLY: Bandwidth;
	/**
	 * Alias of `Bandwidth.Lowest`.
	 */
	BANDWIDTH_LOWEST: Bandwidth;
	/**
	 * Alias of `Bandwidth.Highest`.
	 */
	BANDWIDTH_HIGHEST: Bandwidth;

	/**
	 * Alias of `FrameType.Progressive`.
	 */
	FORMAT_TYPE_PROGRESSIVE: FrameType;
	/**
	 * Alias of `FrameType.Interlaced`.
	 */
	FORMAT_TYPE_INTERLACED: FrameType;
	/**
	 * Alias of `FrameType.Field0`.
	 */
	FORMAT_TYPE_FIELD_0: FrameType;
	/**
	 * Alias of `FrameType.Field1`.
	 */
	FORMAT_TYPE_FIELD_1: FrameType;

	/**
	 * Alias of `AudioFormat.Float32Separate`.
	 */
	AUDIO_FORMAT_FLOAT_32_SEPARATE: AudioFormat;
	/**
	 * Alias of `AudioFormat.Float32Interleaved`.
	 */
	AUDIO_FORMAT_FLOAT_32_INTERLEAVED: AudioFormat;
	/**
	 * Alias of `AudioFormat.Int16Interleaved`.
	 */
	AUDIO_FORMAT_INT_16_INTERLEAVED: AudioFormat;

	/**
	 * Alias of `FourCC.UYVY`.
	 */
	FOURCC_UYVY: FourCC;
	/**
	 * Alias of `FourCC.UYVA`.
	 */
	FOURCC_UYVA: FourCC;
	/**
	 * Alias of `FourCC.P216`.
	 */
	FOURCC_P216: FourCC;
	/**
	 * Alias of `FourCC.PA16`.
	 */
	FOURCC_PA16: FourCC;
	/**
	 * Alias of `FourCC.YV12`.
	 */
	FOURCC_YV12: FourCC;
	/**
	 * Alias of `FourCC.I420`.
	 */
	FOURCC_I420: FourCC;
	/**
	 * Alias of `FourCC.NV12`.
	 */
	FOURCC_NV12: FourCC;
	/**
	 * Alias of `FourCC.BGRA`.
	 */
	FOURCC_BGRA: FourCC;
	/**
	 * Alias of `FourCC.BGRX`.
	 */
	FOURCC_BGRX: FourCC;
	/**
	 * Alias of `FourCC.RGBA`.
	 */
	FOURCC_RGBA: FourCC;
	/**
	 * Alias of `FourCC.RGBX`.
	 */
	FOURCC_RGBX: FourCC;
	/**
	 * Alias of `FourCC.FLTp`.
	 */
	FOURCC_FLTp: FourCC;
}
