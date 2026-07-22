import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GrandiAddon } from "../../src/index.js";

function mockProcessProperty<K extends "platform" | "arch">(
	key: K,
	value: NodeJS.Process[K],
): () => void {
	const descriptor = Object.getOwnPropertyDescriptor(process, key);
	if (!descriptor) throw new Error(`process.${key} descriptor missing`);
	Object.defineProperty(process, key, { value });
	return () => {
		Object.defineProperty(process, key, descriptor);
	};
}

function createAddonMock(): GrandiAddon {
	return {
		version: vi.fn(() => "1.2.3"),
		isSupportedCPU: vi.fn(() => true),
		initialize: vi.fn(() => true),
		destroy: vi.fn(() => true),
		find: vi.fn().mockResolvedValue({}),
		framesync: vi.fn().mockResolvedValue({
			video: vi.fn(),
			audio: vi.fn(),
			audioQueueDepth: vi.fn(),
			destroy: vi.fn(),
			embedded: {},
		}),
		send: vi.fn().mockResolvedValue({
			video: vi.fn(),
			audio: vi.fn(),
			connections: vi.fn(),
			tally: vi.fn(),
			sourcename: vi.fn(),
			destroy: vi.fn(),
			embedded: {},
			name: "stub",
			clockVideo: true,
			clockAudio: true,
		}),
		receive: vi.fn().mockResolvedValue({
			video: vi.fn(),
			audio: vi.fn(),
			metadata: vi.fn(),
			data: vi.fn(),
			destroy: vi.fn(),
			embedded: {},
			source: { name: "stub" },
			colorFormat: 0,
			bandwidth: 0,
			allowVideoFields: false,
		}),
		routing: vi.fn().mockResolvedValue({
			change: vi.fn(),
			clear: vi.fn(),
			connections: vi.fn(),
			sourcename: vi.fn(),
			destroy: vi.fn(),
			embedded: {},
		}),
	};
}

describe("src/index entrypoint", () => {
	let restorePlatform: (() => void) | undefined;
	let restoreArch: (() => void) | undefined;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	afterEach(() => {
		restorePlatform?.();
		restorePlatform = undefined;
		restoreArch?.();
		restoreArch = undefined;
		vi.resetModules();
		try {
			vi.doUnmock("node-gyp-build");
		} catch {
			// Module might not have been mocked in this test.
		}
		try {
			vi.doUnmock("@grandi/linux-x64");
		} catch {
			// Module might not have been mocked in this test.
		}
	});

	it("loads the compiled addon on supported platforms", async () => {
		const addon = createAddonMock();
		const nodeGypBuild = vi.fn(() => addon);
		restorePlatform = mockProcessProperty("platform", "linux");
		restoreArch = mockProcessProperty("arch", "x64");
		vi.doMock("node-gyp-build", () => ({ default: nodeGypBuild }));

		const grandi = await import("../../src/index.js");

		expect(nodeGypBuild).toHaveBeenCalledTimes(1);
		const firstCall = (nodeGypBuild.mock.calls[0] ?? []) as unknown[];
		const [firstArg] = firstCall;
		expect(firstArg).toBe(path.join(__dirname, "..", ".."));

		await grandi.find({ groups: "local" });
		expect(addon.find).toHaveBeenLastCalledWith({ groups: "local" });

		await grandi.find();
		expect(addon.find).toHaveBeenLastCalledWith({});

		expect(grandi.version()).toBe("1.2.3");
		expect(grandi.isSupportedCPU()).toBe(true);

		const receiver = {};
		await grandi.frameSync(receiver as never);
		expect(addon.framesync).toHaveBeenLastCalledWith(receiver);
	});

	it("falls back to the noop addon when the platform is unsupported", async () => {
		const addon = createAddonMock();
		const nodeGypBuild = vi.fn(() => addon);
		restorePlatform = mockProcessProperty("platform", "freebsd");
		restoreArch = mockProcessProperty("arch", "arm64");
		vi.doMock("node-gyp-build", () => ({ default: nodeGypBuild }));

		const grandi = await import("../../src/index.js");

		expect(nodeGypBuild).not.toHaveBeenCalled();

		await expect(grandi.find()).rejects.toThrow("Unsupported platform or CPU");
		await expect(grandi.send({} as never)).rejects.toThrow(
			"Unsupported platform or CPU",
		);
		await expect(grandi.receive({} as never)).rejects.toThrow(
			"Unsupported platform or CPU",
		);
		await expect(grandi.frameSync({} as never)).rejects.toThrow(
			"Unsupported platform or CPU",
		);
	});

	it("exposes enum-based constants on the default export", async () => {
		const addon = createAddonMock();
		restorePlatform = mockProcessProperty("platform", "linux");
		restoreArch = mockProcessProperty("arch", "x64");
		vi.doMock("node-gyp-build", () => ({ default: () => addon }));
		const grandiModule = await import("../../src/index.js");

		const grandi = grandiModule.default;
		expect(grandi.ColorFormat.BGRX_BGRA).toBe(
			grandiModule.ColorFormat.BGRX_BGRA,
		);
		expect(grandi.Bandwidth.Lowest).toBe(grandiModule.Bandwidth.Lowest);
		expect(grandi.AudioFormat.Float32Separate).toBe(
			grandiModule.AudioFormat.Float32Separate,
		);
		expect(grandi.FourCC.BGRA).toBe(grandiModule.FourCC.BGRA);
		expect(grandi.FrameType.Progressive).toBe(
			grandiModule.FrameType.Progressive,
		);
	});

	it("returns the mocked addon APIs on win32 arm", async () => {
		const addon = createAddonMock();
		restorePlatform = mockProcessProperty("platform", "win32");
		restoreArch = mockProcessProperty("arch", "arm64");
		const nodeGypBuild = vi.fn(() => addon);
		vi.doMock("node-gyp-build", () => ({ default: nodeGypBuild }));

		const grandiModule = await import("../../src/index.js");

		expect(nodeGypBuild).toHaveBeenCalledTimes(0);
		expect(grandiModule.version()).toBe("");
		expect(grandiModule.isSupportedCPU()).toBe(false);
		await expect(grandiModule.find()).rejects.toThrow(
			"Unsupported platform or CPU",
		);
		await expect(grandiModule.send({} as never)).rejects.toThrow(
			"Unsupported platform or CPU",
		);
		await expect(grandiModule.receive({} as never)).rejects.toThrow(
			"Unsupported platform or CPU",
		);
		await expect(grandiModule.framesync({} as never)).rejects.toThrow(
			"Unsupported platform or CPU",
		);
		await expect(grandiModule.routing({} as never)).rejects.toThrow(
			"Unsupported platform or CPU",
		);
		expect(grandiModule.initialize()).toBe(false);
		expect(grandiModule.destroy()).toBe(false);
	});

	it("forwards options to addon methods on supported platforms", async () => {
		const addon = createAddonMock();
		restorePlatform = mockProcessProperty("platform", "linux");
		restoreArch = mockProcessProperty("arch", "x64");
		const nodeGypBuild = vi.fn(() => addon);
		vi.doMock("node-gyp-build", () => ({ default: nodeGypBuild }));

		const grandi = await import("../../src/index.js");

		const sendOpts = { name: "unit-sender", clockVideo: true } as const;
		await grandi.send(sendOpts as never);
		expect(addon.send).toHaveBeenLastCalledWith(sendOpts);

		const receiveOpts = {
			source: { name: "source", urlAddress: "127.0.0.1:25400" },
			colorFormat: grandi.ColorFormat.Best,
			bandwidth: grandi.Bandwidth.Highest,
			allowVideoFields: true,
			name: "unit-recv",
		};
		await grandi.receive(receiveOpts as never);
		expect(addon.receive).toHaveBeenLastCalledWith(receiveOpts);

		const routingOpts = { name: "unit-route", groups: "g1" } as const;
		await grandi.routing(routingOpts as never);
		expect(addon.routing).toHaveBeenLastCalledWith(routingOpts);

		const findOpts = {
			showLocalSources: true,
			groups: "g2",
			extraIPs: "127.0.0.1",
		};
		await grandi.find(findOpts);
		expect(addon.find).toHaveBeenLastCalledWith(findOpts);

		await grandi.find({ extraIps: "127.0.0.2" });
		expect(addon.find).toHaveBeenLastCalledWith({
			extraIPs: "127.0.0.2",
		});

		grandi.initialize();
		expect(addon.initialize).toHaveBeenCalled();
		grandi.destroy();
		expect(addon.destroy).toHaveBeenCalled();
	});

	it("retains supported-platform addon failures and their causes", async () => {
		const localError = new Error("local binding is unavailable");
		restorePlatform = mockProcessProperty("platform", "linux");
		restoreArch = mockProcessProperty("arch", "arm64");
		vi.doMock("node-gyp-build", () => ({
			default: () => {
				throw localError;
			},
		}));

		const loadError = await import("../../src/index.js").then(
			() => undefined,
			(error: unknown) => error,
		);

		expect(loadError).toBeInstanceOf(Error);
		if (!(loadError instanceof Error)) throw loadError;
		const errors = (loadError as Error & { errors: Error[] }).errors;
		expect(errors).toHaveLength(2);
		expect(loadError.message).toContain("Failed to load native addon");
		expect(errors[0]).toBe(localError);
		expect(errors[1]).toMatchObject({
			message:
				'Failed to find prebuilt package for linux-arm64. Please ensure that the package "@grandi/linux-arm64" is installed',
		});
		expect(errors[1]).toMatchObject({
			cause: expect.objectContaining({
				message: expect.stringContaining("@grandi/linux-arm64"),
			}),
		});
	});
});
