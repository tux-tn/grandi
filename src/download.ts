import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pipeline } from "node:stream/promises";
import zip from "cross-zip";
import { execa } from "execa";
import got, { type Progress } from "got";
import shell from "shelljs";
import tmp from "tmp";

// Ensure tmp cleans up on process exit
tmp.setGracefulCleanup();

const platform = os.platform();
const arch = os.arch();
const supportsColor = process.stdout.isTTY && process.env.NO_COLOR !== "1";
const isInteractiveTerminal = process.stdout.isTTY && process.env.CI !== "true";

const color = (open: string) => (value: string) =>
	supportsColor ? `${open}${value}\x1b[0m` : value;

const colors = {
	cyan: color("\x1b[36m"),
	magenta: color("\x1b[35m"),
	green: color("\x1b[32m"),
	yellow: color("\x1b[33m"),
	red: color("\x1b[31m"),
	gray: color("\x1b[90m"),
	bold: color("\x1b[1m"),
};

const icons = {
	heading: colors.bold("=="),
	info: colors.cyan("[i]"),
	step: colors.magenta("[>]"),
	success: colors.green("[ok]"),
	warn: colors.yellow("[!]"),
	error: colors.red("[x]"),
};

const log = {
	heading: (message: string) =>
		console.log(`${icons.heading} ${colors.bold(message)}`),
	info: (message: string) => console.log(`${icons.info} ${message}`),
	step: (message: string) => console.log(`${icons.step} ${message}`),
	success: (message: string) => console.log(`${icons.success} ${message}`),
	warn: (message: string) => console.warn(`${icons.warn} ${message}`),
	error: (message: string) => console.error(`${icons.error} ${message}`),
};

type DownloadOptions =
	| string
	| {
			outFile?: string;
			label?: string;
	  };

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
	return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function deriveLabelFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const base = path.basename(parsed.pathname);
		return base.length > 0 ? decodeURIComponent(base) : url;
	} catch {
		return url;
	}
}

function clearProgressLine(): void {
	if (!isInteractiveTerminal) return;
	readline.cursorTo(process.stdout, 0);
	readline.clearLine(process.stdout, 0);
}

function createDownloadTracker(label: string) {
	let progressRendered = false;
	const prefix = `${colors.cyan("[dl]")} ${label}`;

	const render = (details: string) => {
		if (!isInteractiveTerminal) return;
		readline.cursorTo(process.stdout, 0);
		readline.clearLine(process.stdout, 0);
		process.stdout.write(`${prefix} ${details}`);
		progressRendered = true;
	};

	return {
		start() {
			log.step(`Downloading ${label}`);
		},
		update(progress: Progress) {
			if (!isInteractiveTerminal) return;
			const percent =
				typeof progress.percent === "number" &&
				Number.isFinite(progress.percent)
					? Math.min(progress.percent * 100, 100)
					: null;
			const transferred = formatBytes(progress.transferred);
			const total =
				typeof progress.total === "number" && progress.total > 0
					? formatBytes(progress.total)
					: null;
			const parts = [];
			if (percent !== null) {
				parts.push(`${percent.toFixed(1)}%`);
			}
			parts.push(total ? `${transferred}/${total}` : transferred);
			render(parts.join(" • "));
		},
		finish() {
			if (progressRendered) {
				clearProgressLine();
			}
			log.success(`Downloaded ${label}`);
		},
		fail(err: unknown) {
			if (progressRendered) {
				clearProgressLine();
			}
			const message =
				err instanceof Error
					? err.message
					: err
						? String(err)
						: "Unknown error";
			log.error(`Failed to download ${label}: ${message}`);
		},
	};
}

async function downloadToFile(
	url: string,
	options: DownloadOptions = {},
): Promise<string> {
	let outFile: string | undefined;
	let label: string | undefined;

	if (typeof options === "string") {
		outFile = options;
	} else if (options && typeof options === "object") {
		outFile = options.outFile;
		label = options.label;
	}

	const filePath = outFile ?? tmp.tmpNameSync();
	const tracker = createDownloadTracker(label ?? deriveLabelFromUrl(url));

	tracker.start();
	const downloadStream = got.stream(url, {
		retry: { limit: 3 },
		timeout: { request: 60_000 },
	});
	downloadStream.on("downloadProgress", (progress) => {
		tracker.update(progress);
	});

	try {
		await pipeline(
			downloadStream as unknown as NodeJS.ReadableStream,
			fs.createWriteStream(filePath),
		);
		tracker.finish();
		return filePath;
	} catch (error) {
		tracker.fail(error);
		throw error;
	}
}

function ndiSubsetPresent(): boolean {
	try {
		// Basic sanity: headers exist and at least one lib directory has files
		const header = path.join("ndi", "include", "Processing.NDI.Lib.h");
		if (!fs.existsSync(header)) return false;
		const libDirs = [
			path.join("ndi", "lib", "win-x86"),
			path.join("ndi", "lib", "win-x64"),
			path.join("ndi", "lib", "mac_universal"),
			path.join("ndi", "lib", "lnx-x86"),
			path.join("ndi", "lib", "lnx-x64"),
			path.join("ndi", "lib", "lnx-armv7l"),
			path.join("ndi", "lib", "lnx-arm64"),
		];
		return libDirs.some(
			(d) => fs.existsSync(d) && fs.readdirSync(d).length > 0,
		);
	} catch {
		return false;
	}
}

async function main() {
	log.heading("NDI SDK bootstrap");
	log.info(`Detected platform: ${platform}/${arch}`);

	const supportedPlatform =
		platform === "darwin" ||
		platform === "linux" ||
		(platform === "win32" && ["ia32", "x64"].includes(arch));

	if (!supportedPlatform) {
		log.warn("Current platform is not supported; skipping NDI SDK setup.");
		return;
	}

	const forceRebuild = process.env.NDI_FORCE?.toString() === "1";
	if (!forceRebuild && ndiSubsetPresent()) {
		log.success(
			"NDI SDK subset already present; skipping re-assembly (set NDI_FORCE=1 to force)",
		);
	} else {
		log.step("Cleaning existing NDI SDK and build artifacts");
		shell.rm("-rf", "ndi");
		shell.rm("-rf", "build");
		log.heading("Assembling NDI SDK distribution subset");
		log.info("NDI SDK license: https://ndi.link/ndisdk_license");

		if (platform === "win32") {
			const innoUrl =
				"https://constexpr.org/innoextract/files/innoextract-1.9-windows.zip";
			const innoZip = await downloadToFile(innoUrl, {
				label: "Innoextract utility (Windows)",
			});

			log.step("Extracting innoextract utility");
			const innoDir = tmp.tmpNameSync();
			zip.unzipSync(innoZip, innoDir);

			const ndiUrl = "https://downloads.ndi.tv/SDK/NDI_SDK/NDI 6 SDK.exe";
			const ndiExe = await downloadToFile(ndiUrl, {
				label: "NDI SDK distribution (Windows)",
			});

			log.step("Extracting NDI SDK distribution");
			const extractDir = tmp.tmpNameSync();
			shell.mkdir("-p", extractDir);
			await execa(
				path.join(innoDir, "innoextract.exe"),
				["-s", "-d", extractDir, ndiExe],
				{ stdio: "inherit" },
			);

			log.step("Assembling Windows NDI SDK subset");
			shell.rm("-rf", "ndi");
			shell.mkdir("-p", ["ndi/include", "ndi/lib/win-x86", "ndi/lib/win-x64"]);
			shell.cp(path.join(extractDir, "app/Include/*.h"), "ndi/include/");
			shell.cp(
				path.join(extractDir, "app/Lib/x86/Processing.NDI.Lib.x86.lib"),
				"ndi/lib/win-x86/Processing.NDI.Lib.x86.lib",
			);
			shell.cp(
				path.join(extractDir, "app/Bin/x86/Processing.NDI.Lib.x86.dll"),
				"ndi/lib/win-x86/Processing.NDI.Lib.x86.dll",
			);
			shell.cp(
				path.join(extractDir, "app/Lib/x64/Processing.NDI.Lib.x64.lib"),
				"ndi/lib/win-x64/Processing.NDI.Lib.x64.lib",
			);
			shell.cp(
				path.join(extractDir, "app/Bin/x64/Processing.NDI.Lib.x64.dll"),
				"ndi/lib/win-x64/Processing.NDI.Lib.x64.dll",
			);
			shell.cp(
				path.join(extractDir, "app/NDI SDK License Agreement.pdf"),
				"ndi/lib/NDI SDK License Agreement.pdf",
			);
			log.step("Removing temporary files");
			shell.rm("-f", innoZip);
			shell.rm("-f", ndiExe);
			shell.rm("-rf", innoDir);
			shell.rm("-rf", extractDir);
		} else if (platform === "darwin") {
			const pkgUrl =
				"https://downloads.ndi.tv/SDK/NDI_SDK_Mac/Install_NDI_SDK_v6_Apple.pkg";
			const pkgFile = await downloadToFile(pkgUrl, {
				label: "NDI SDK distribution (macOS)",
			});

			log.step("Extracting NDI SDK distribution");
			const workDir = tmp.tmpNameSync();
			shell.rm("-rf", workDir);
			await execa("pkgutil", ["--expand", pkgFile, workDir], {
				stdio: "inherit",
			});
			await execa(
				"cpio",
				["-idmu", "-F", path.join(workDir, "NDI_SDK_Component.pkg/Payload")],
				{
					cwd: workDir,
					stdio: "ignore",
				},
			);

			log.step("Assembling macOS NDI SDK subset");
			shell.rm("-rf", "ndi");
			shell.mkdir("-p", ["ndi/include", "ndi/lib/mac_universal"]);
			shell.mv(
				path.join(workDir, "NDI SDK for Apple/include/*.h"),
				"ndi/include/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Apple/lib/macOS/*.dylib"),
				"ndi/lib/mac_universal/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Apple/lib/libndi_licenses.txt"),
				"ndi/lib/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Apple/NDI SDK License Agreement.pdf"),
				"ndi/lib/LICENSE.pdf",
			);

			log.step("Removing temporary files");
			shell.rm("-f", pkgFile);
			shell.rm("-rf", workDir);
		} else if (platform === "linux") {
			const tarUrl =
				"https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v6_Linux.tar.gz";
			const tarFile = await downloadToFile(tarUrl, {
				label: "NDI SDK distribution (Linux)",
			});

			log.step("Extracting NDI SDK distribution");
			const workDir = tmp.tmpNameSync();
			shell.mkdir("-p", workDir);
			await execa("tar", ["-z", "-x", "-C", workDir, "-f", tarFile], {
				stdio: "inherit",
			});
			await execa(
				"sh",
				["-c", `echo "y" | PAGER=cat sh Install_NDI_SDK_v6_Linux.sh`],
				{
					cwd: workDir,
					stdio: "inherit",
				},
			);

			log.step("Assembling Linux NDI SDK subset");
			shell.rm("-rf", "ndi");
			shell.mkdir("-p", [
				"ndi/include",
				"ndi/lib/lnx-x86",
				"ndi/lib/lnx-x64",
				"ndi/lib/lnx-armv7l",
				"ndi/lib/lnx-arm64",
			]);
			shell.mv(
				path.join(workDir, "NDI SDK for Linux/include/*.h"),
				"ndi/include/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Linux/lib/i686-linux-gnu/*"),
				"ndi/lib/lnx-x86/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Linux/lib/x86_64-linux-gnu/*"),
				"ndi/lib/lnx-x64/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Linux/lib/arm-rpi4-linux-gnueabihf/*"),
				"ndi/lib/lnx-armv7l/",
			);
			shell.mv(
				path.join(
					workDir,
					"NDI SDK for Linux/lib/aarch64-rpi4-linux-gnueabi/*",
				),
				"ndi/lib/lnx-arm64/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Linux/NDI SDK License Agreement.txt"),
				"ndi/lib/LICENSE",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Linux/licenses/libndi_licenses.txt"),
				"ndi/lib/",
			);
			const linuxArchDirs = [
				"ndi/lib/lnx-x86",
				"ndi/lib/lnx-x64",
				"ndi/lib/lnx-armv7l",
				"ndi/lib/lnx-arm64",
			];
			for (const d of linuxArchDirs) {
				try {
					const files = await fs.promises.readdir(d);
					const real = files.find((f) => /^libndi\.so\.\d+\.\d+/.test(f));
					if (real) {
						const realPath = path.join(d, real);
						const so6 = path.join(d, "libndi.so.6");
						const so = path.join(d, "libndi.so");
						for (const f of [so, so6]) {
							if (fs.existsSync(f)) {
								await fs.promises.unlink(f);
								await fs.promises.copyFile(realPath, f);
							}
						}
					}
				} catch (e) {
					const message =
						e instanceof Error ? e.message : e ? String(e) : "Unknown error";
					log.error(`Failed to normalize Linux libraries in ${d}: ${message}`);
				}
			}
			log.step("Removing temporary files");
			shell.rm("-f", tarFile);
			shell.rm("-rf", workDir);
		}
	}
}

main().catch((err) => {
	const message =
		err instanceof Error ? (err.stack ?? err.message) : String(err);
	log.error(message);
	process.exitCode = 1;
});
