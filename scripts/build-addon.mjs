import fsSync from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pipeline } from "node:stream/promises";
import zip from "cross-zip";
import { execa } from "execa";
import got from "got";
import shell from "shelljs";
import tmp from "tmp";

// Ensure tmp cleans up on process exit
tmp.setGracefulCleanup();

const require = createRequire(import.meta.url);
const nodeGypBin = require.resolve("node-gyp/bin/node-gyp.js");

const platform = os.platform();
const arch = os.arch();
function parseArgs(argv) {
	const out = {};
	for (let i = 2; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--platform") {
			out.platform = argv[i + 1];
			i++;
		} else if (arg === "--arch") {
			out.arch = argv[i + 1];
			i++;
		}
	}
	return out;
}

const cli = parseArgs(process.argv);
const targetPlatform = cli.platform ?? platform;
const targetArch = cli.arch ?? arch;
const targetKey = `${targetPlatform}-${targetArch}`;
const TARGETS = {
	"linux-x64": {
		pkgDir: "packages/linux-x64",
		gypArch: "x64",
		sources: [
			"ndi/lib/lnx-x64/libndi.so.6",
			"ndi/lib/LICENSE",
			"ndi/lib/libndi_licenses.txt",
		],
	},
	"linux-arm64": {
		pkgDir: "packages/linux-arm64",
		gypArch: "arm64",
		sources: [
			"ndi/lib/lnx-arm64/libndi.so.6",
			"ndi/lib/LICENSE",
			"ndi/lib/libndi_licenses.txt",
		],
	},
	"linux-arm": {
		pkgDir: "packages/linux-armv7l",
		gypArch: "arm",
		sources: [
			"ndi/lib/lnx-armv7l/libndi.so.6",
			"ndi/lib/LICENSE",
			"ndi/lib/libndi_licenses.txt",
		],
	},
	"win32-x64": {
		pkgDir: "packages/win32-x64",
		gypArch: "x64",
		sources: [
			"ndi/lib/win-x64/Processing.NDI.Lib.x64.dll",
			"ndi/lib/win-x64/Processing.NDI.Lib.x64.lib",
			"ndi/lib/LICENSE.pdf",
			"ndi/lib/libndi_licenses.txt",
		],
	},
	"win32-ia32": {
		pkgDir: "packages/win32-ia32",
		gypArch: "ia32",
		sources: [
			"ndi/lib/win-x86/Processing.NDI.Lib.x86.dll",
			"ndi/lib/win-x86/Processing.NDI.Lib.x86.lib",
			"ndi/lib/LICENSE.pdf",
			"ndi/lib/libndi_licenses.txt",
		],
	},
	"darwin-arm64": {
		pkgDir: "packages/darwin-universal",
		gypArch: "arm64",
		sources: [
			"ndi/lib/macOS/libndi.dylib",
			"ndi/lib/LICENSE.pdf",
			"ndi/lib/libndi_licenses.txt",
		],
	},
	"darwin-x64": {
		pkgDir: "packages/darwin-universal",
		gypArch: "x64",
		sources: [
			"ndi/lib/macOS/libndi.dylib",
			"ndi/lib/LICENSE.pdf",
			"ndi/lib/libndi_licenses.txt",
		],
	},
};
const supportsColor = process.stdout.isTTY && process.env.NO_COLOR !== "1";
const isInteractiveTerminal = process.stdout.isTTY && process.env.CI !== "true";

const color = (open) => (value) =>
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
	heading: (message) => console.log(`${icons.heading} ${colors.bold(message)}`),
	info: (message) => console.log(`${icons.info} ${message}`),
	step: (message) => console.log(`${icons.step} ${message}`),
	success: (message) => console.log(`${icons.success} ${message}`),
	warn: (message) => console.warn(`${icons.warn} ${message}`),
	error: (message) => console.error(`${icons.error} ${message}`),
};

async function pathExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function formatBytes(bytes) {
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

function deriveLabelFromUrl(url) {
	try {
		const parsed = new URL(url);
		const base = path.basename(parsed.pathname);
		return base.length > 0 ? decodeURIComponent(base) : url;
	} catch {
		return url;
	}
}

function clearProgressLine() {
	if (!isInteractiveTerminal) return;
	readline.cursorTo(process.stdout, 0);
	readline.clearLine(process.stdout, 0);
}

function createDownloadTracker(label) {
	let progressRendered = false;
	const prefix = `${colors.cyan("[dl]")} ${label}`;

	const render = (details) => {
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
		update(progress) {
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
		fail(err) {
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

async function downloadToFile(url, options = {}) {
	let outFile;
	let label;

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
	});
	downloadStream.on("downloadProgress", (progress) => {
		tracker.update(progress);
	});

	try {
		await pipeline(downloadStream, fsSync.createWriteStream(filePath));
		tracker.finish();
		return filePath;
	} catch (error) {
		tracker.fail(error);
		throw error;
	}
}

async function ndiSubsetPresent() {
	try {
		// Basic sanity: headers exist and at least one lib directory has files
		const header = path.join("ndi", "include", "Processing.NDI.Lib.h");
		if (!(await pathExists(header))) return false;
		const libDirs = [
			path.join("ndi", "lib", "win-x86"),
			path.join("ndi", "lib", "win-x64"),
			path.join("ndi", "lib", "macOS"),
			path.join("ndi", "lib", "lnx-x86"),
			path.join("ndi", "lib", "lnx-x64"),
			path.join("ndi", "lib", "lnx-armv7l"),
			path.join("ndi", "lib", "lnx-arm64"),
		];
		for (const dir of libDirs) {
			if (!(await pathExists(dir))) continue;
			if ((await fs.readdir(dir)).length > 0) return true;
		}
		return false;
	} catch {
		return false;
	}
}

async function populatePackageLibs() {
	const meta = TARGETS[targetKey];
	if (!meta) {
		log.warn(
			`No scoped package mapping for ${targetPlatform}/${targetArch}; skipping library copy.`,
		);
		return;
	}
	if (!(await pathExists(meta.pkgDir))) {
		log.warn(`Package directory missing: ${meta.pkgDir}`);
		return;
	}

	const existingSources = [];
	for (const src of meta.sources) {
		if (await pathExists(src)) existingSources.push(src);
	}
	if (existingSources.length === 0) {
		log.warn(
			`No NDI libraries found for ${targetPlatform}/${targetArch}; did the SDK extract for this platform?`,
		);
		return;
	}

	shell.mkdir("-p", meta.pkgDir);
	for (const src of existingSources) {
		shell.cp("-f", src, meta.pkgDir);
	}
	if (targetPlatform === "linux") {
		const linkName = "libndi.so";
		const targetName = "libndi.so.6";
		const linkPath = path.join(meta.pkgDir, linkName);
		const targetPath = path.join(meta.pkgDir, targetName);
		if (!(await pathExists(targetPath))) {
			log.warn(
				`Skipping ${linkName} symlink; missing ${targetName} in ${meta.pkgDir}.`,
			);
		} else {
			try {
				let linkStat;
				try {
					linkStat = await fs.lstat(linkPath);
				} catch (err) {
					if (!(err && err.code === "ENOENT")) {
						throw err;
					}
				}
				if (linkStat?.isDirectory()) {
					log.warn(`Skipping ${linkName} symlink; ${linkPath} is a directory.`);
				} else {
					if (linkStat) await fs.unlink(linkPath);
					await fs.symlink(targetName, linkPath);
					log.success(`Linked ${linkPath} -> ${targetName}.`);
				}
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: err
							? String(err)
							: "Unknown error";
				log.warn(`Failed to create ${linkName} symlink: ${message}`);
			}
		}
	}
	log.success(
		`Populated ${meta.pkgDir} with ${existingSources.length} NDI file(s).`,
	);
}

async function buildAddon(packageDir) {
	log.heading("Building native addon");
	log.info(`Target: ${targetPlatform}/${targetArch}`);
	const productDir = path.resolve(packageDir);
	shell.mkdir("-p", productDir);
	const meta = TARGETS[targetKey];
	const buildArch = meta?.gypArch ?? targetArch;
	// Use a writable npm cache to avoid root-owned cache errors in containers.
	const npmCacheDir =
		process.env.npm_config_cache ??
		process.env.NPM_CONFIG_CACHE ??
		path.join(os.tmpdir(), "grandi-npm-cache");
	shell.mkdir("-p", npmCacheDir);

	await execa(
		process.execPath,
		[
			nodeGypBin,
			"rebuild",
			`--arch=${buildArch}`,
			"--",
			`-Dproduct_dir=${productDir}`,
		],
		{
			stdio: "inherit",
			env: {
				...process.env,
				npm_config_cache: npmCacheDir,
				NPM_CONFIG_CACHE: npmCacheDir,
			},
		},
	);

	const built = path.join("build", "Release", "grandi.node");
	if (!(await pathExists(built))) {
		throw new Error(`Built addon not found at ${built}`);
	}
	shell.cp("-f", built, productDir);
	log.success(`Copied addon to ${productDir}/grandi.node`);
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
	if (await ndiSubsetPresent()) {
		if (!(await pathExists(path.join("ndi", "Version.txt")))) {
			log.warn("NDI version file missing; rerun the script to refresh.");
		}
		log.success("NDI SDK subset already present; skipping re-assembly.");
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
			shell.mkdir("-p", ["ndi/lib/win-x86", "ndi/lib/win-x64"]);
			shell.cp("-rL", path.join(extractDir, "app", "Include/"), "ndi/");
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
				"ndi/lib/LICENSE.pdf",
			);
			shell.cp(
				path.join(extractDir, "app/Bin/x64/Processing.NDI.Lib.Licenses.txt"),
				"ndi/lib/libndi_licenses.txt",
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
			shell.mkdir("-p", ["ndi/include", "ndi/lib/macOS"]);
			shell.mv(
				path.join(workDir, "NDI SDK for Apple/include/*.h"),
				"ndi/include/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Apple/lib/macOS/*.dylib"),
				"ndi/lib/macOS/",
			);
			shell.mv(
				path.join(workDir, "NDI SDK for Apple/lib/macOS/libndi_licenses.txt"),
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
			log.step("Removing temporary files");
			shell.rm("-f", tarFile);
			shell.rm("-rf", workDir);
		}
	}

	await populatePackageLibs();

	const meta = TARGETS[targetKey];
	if (!meta) {
		log.warn(
			`No scoped package mapping for ${targetPlatform}/${targetArch}; skipping addon build.`,
		);
		return;
	}

	await buildAddon(meta.pkgDir);
}

main().catch((err) => {
	const message =
		err instanceof Error ? (err.stack ?? err.message) : String(err);
	log.error(message);
	process.exitCode = 1;
});
