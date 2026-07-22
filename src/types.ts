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

export type VideoFourCC =
	| FourCC.UYVY
	| FourCC.UYVA
	| FourCC.P216
	| FourCC.PA16
	| FourCC.YV12
	| FourCC.I420
	| FourCC.NV12
	| FourCC.BGRA
	| FourCC.BGRX
	| FourCC.RGBA
	| FourCC.RGBX;

export type AudioFourCC = FourCC.FLTp;

export const TIMECODE_SYNTHESIZE = 9223372036854775807n;
export type Timecode = bigint;

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
	fourCC: VideoFourCC;
	frameFormatType: FrameType;
	lineStrideBytes: number;
	data: Buffer;
	timecode?: Timecode;
	metadata?: string;
}

export interface ReceivedVideoFrame extends VideoFrame {
	type: "video";
	timecode: bigint;
	/** Omitted when the NDI SDK reports that the receive timestamp is unavailable. */
	timestamp?: bigint;
	metadata?: string;
}

export interface AudioFrame {
	type?: "audio";
	sampleRate: number;
	noChannels: number;
	noSamples: number;
	channelStrideBytes: number;
	data: Buffer;
	fourCC: AudioFourCC;
	timecode?: Timecode;
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
	timecode: bigint;
	/** Omitted when the NDI SDK reports that the receive timestamp is unavailable. */
	timestamp?: bigint;
	metadata?: string;
}

export interface ReceivedMetadataFrame {
	type: "metadata";
	length: number;
	timecode: bigint;
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

export interface ReceiverPerformance {
	total: { videoFrames: number; audioFrames: number; metadataFrames: number };
	dropped: { videoFrames: number; audioFrames: number; metadataFrames: number };
}

export interface ReceiverQueue {
	videoFrames: number;
	audioFrames: number;
}

export interface Receiver {
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
	performance(): ReceiverPerformance;
	queue(): ReceiverQueue;
	connections(): number;
}

export interface ReceiverTallyState {
	onProgram?: boolean;
	onPreview?: boolean;
}

export interface SenderTally {
	changed: boolean;
	onProgram: boolean;
	onPreview: boolean;
	/** @deprecated Use `onProgram` instead. */
	on_program: boolean;
	/** @deprecated Use `onPreview` instead. */
	on_preview: boolean;
}

export interface Sender {
	name: string;
	groups?: string;
	clockVideo: boolean;
	clockAudio: boolean;
	video(frame: VideoFrame): Promise<void>;
	audio(frame: AudioFrame): Promise<void>;
	connections(): number;
	metadata(data: string): boolean;
	tally(): SenderTally;
	sourceName(): string;
	/** @deprecated Use `sourceName` instead. */
	sourcename(): string;
	destroy(): boolean;
}

export interface Routing {
	name?: string;
	groups?: string;
	destroy(): boolean;
	change(source: Source | null | undefined): boolean;
	clear(): boolean;
	connections(): number;
	sourceName(): string;
	/** @deprecated Use `sourceName` instead. */
	sourcename(): string;
}

interface FrameSyncAudioOptionsBase {
	sampleRate?: number;
	channels?: number;
	/** @deprecated Use `channels` instead. */
	noChannels?: number;
}

export type FrameSyncAudioOptions =
	| (FrameSyncAudioOptionsBase & {
			samples: number;
			/** @deprecated Use `samples` instead. */
			noSamples?: number;
	  })
	| (FrameSyncAudioOptionsBase & {
			samples?: never;
			/** @deprecated Use `samples` instead. */
			noSamples: number;
	  });

export interface FrameSyncAudioFormat {
	sampleRate: number;
	channels: number;
}

export interface FrameSync {
	/**
	 * Captures a video frame using NDI frame-synchronization (time base correction).
	 * Always returns immediately.
	 *
	 * If no video has ever been received, resolves with `{ type: "timeout" }`.
	 */
	video(fieldType?: FrameType): Promise<ReceivedVideoFrame | TimeoutEvent>;
	/**
	 * Captures audio using NDI frame-synchronization (resampled to match your calls).
	 * Always returns immediately and may insert silence if no audio is present.
	 * `samples` must be greater than zero.
	 */
	audio(options: FrameSyncAudioOptions): Promise<ReceivedAudioFrame>;
	/**
	 * Returns the current incoming audio format, or `undefined` when no audio
	 * format has been received yet.
	 */
	audioFormat(): FrameSyncAudioFormat | undefined;
	/**
	 * Returns an approximate depth of the internal audio queue in samples.
	 */
	audioQueueDepth(): number;
	destroy(): boolean;
}

export interface Finder {
	sources(): Source[];
	wait(timeoutMs?: number): Promise<boolean>;
	destroy(): boolean;
}

export interface FindOptions {
	showLocalSources?: boolean;
	groups?: string;
	extraIps?: string;
	/** @deprecated Use `extraIps` instead. */
	extraIPs?: string;
}

export interface ReceiveOptions {
	source: Source;
	colorFormat?: ColorFormat;
	bandwidth?: Bandwidth;
	/**
	 * If `colorFormat` is `ColorFormat.Fastest` or `ColorFormat.Best`, the NDI SDK
	 * implicitly enables video fields and this option is forced to `true`.
	 */
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
	 * Optionally initializes the process-global NDI library.
	 * The SDK does not require this call, but eager initialization is recommended
	 * when the application explicitly manages startup and shutdown.
	 * @returns `true` if initialization succeeded and the CPU is supported.
	 *
	 * @example
	 * ```js
	 * import grandi from "grandi";
	 * if (!grandi.initialize()) throw new Error("NDI init failed");
	 * ```
	 */
	initialize(): boolean;
	/**
	 * Optionally shuts down the process-global NDI library.
	 * When managing the lifecycle explicitly, destroy all native objects first.
	 * @returns `true` after requesting shutdown.
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
	 * await finder.wait(1000);
	 * const source = finder.sources()[0];
	 * finder.destroy();
	 * const receiver = await grandi.receive({ source });
	 * const frame = await receiver.video(1000);
	 * receiver.destroy();
	 * ```
	 */
	receive(params: ReceiveOptions): Promise<Receiver>;
	/**
	 * Creates an NDI frame-synchronizer (time base corrector) backed by an existing receiver.
	 * While it exists, direct `video`, `audio`, and `data` captures on that
	 * receiver are unavailable; metadata and control methods such as `tally` remain usable.
	 * Destroy the frame-sync before the receiver. Direct capture becomes available
	 * again after the frame-sync is destroyed.
	 */
	frameSync(receiver: Receiver): Promise<FrameSync>;
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
	 * await finder.wait(1000);
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
	/**
	 * NDI sentinel that asks the SDK to synthesize the timecode.
	 */
	TIMECODE_SYNTHESIZE: bigint;
}
