import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zip from "cross-zip";
import execa from "execa";
import got from "got";
import shell from "shelljs";
import tmp from "tmp";

// Ensure tmp cleans up on process exit
tmp.setGracefulCleanup();

const platform = os.platform();
const arch = os.arch();

async function downloadToFile(url: string, outFile?: string): Promise<string> {
	const filePath = outFile ?? tmp.tmpNameSync({});
	const stream = got.stream(url, {
		retry: { limit: 3 },
		timeout: { request: 60_000 },
	}) as unknown as NodeJS.ReadableStream;
	await pipeline(stream, fs.createWriteStream(filePath));
	return filePath;
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
	if (
		!(
			platform === "darwin" ||
			platform === "linux" ||
			(platform === "win32" && ["ia32", "x64"].includes(arch))
		)
	) {
		return;
	}

	const forceRebuild = process.env.NDI_FORCE?.toString() === "1";
	if (!forceRebuild && ndiSubsetPresent()) {
		console.log(
			"++ NDI SDK subset already present; skipping re-assembly (set NDI_FORCE=1 to force)",
		);
	} else {
		// clean existing ndi directory if any
		console.log("++ Cleaning existing NDI SDK and build if any");
		shell.rm("-rf", "ndi");
		shell.rm("-rf", "build");
		console.log(
			"++ Assembling NDI SDK distribution subset from official packages",
		);
		console.log(
			"++ The NDI SDK license available at: https://ndi.link/ndisdk_license",
		);

		if (platform === "win32") {
			const innoUrl =
				"https://constexpr.org/innoextract/files/innoextract-1.9-windows.zip";
			console.log("-- downloading innoextract utility");
			const innoZip = await downloadToFile(innoUrl);

			console.log("-- extracting innoextract utility");
			const innoDir = tmp.tmpNameSync();
			zip.unzipSync(innoZip, innoDir);

			const ndiUrl = "https://downloads.ndi.tv/SDK/NDI_SDK/NDI 6 SDK.exe";
			console.log("-- downloading NDI SDK distribution");
			const ndiExe = await downloadToFile(ndiUrl);

			console.log("-- extracting NDI SDK distribution");
			const extractDir = tmp.tmpNameSync();
			shell.mkdir("-p", extractDir);
			await execa(
				path.join(innoDir, "innoextract.exe"),
				["-s", "-d", extractDir, ndiExe],
				{ stdio: "inherit" },
			);

			console.log("-- assembling NDI SDK subset");
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

			console.log("-- removing temporary files");
			shell.rm("-f", innoZip);
			shell.rm("-f", ndiExe);
			shell.rm("-rf", innoDir);
			shell.rm("-rf", extractDir);
		} else if (platform === "darwin") {
			const pkgUrl =
				"https://downloads.ndi.tv/SDK/NDI_SDK_Mac/Install_NDI_SDK_v6_Apple.pkg";
			console.log("-- downloading NDI SDK distribution");
			const pkgFile = await downloadToFile(pkgUrl);

			console.log("-- extracting NDI SDK distribution");
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

			console.log("-- assembling NDI SDK subset");
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
				path.join(workDir, "NDI SDK for Apple/lib/macOS/libndi_licenses.txt"),
				"ndi/lib/",
			);

			console.log("-- removing temporary files");
			shell.rm("-f", pkgFile);
			shell.rm("-rf", workDir);
		} else if (platform === "linux") {
			const tarUrl =
				"https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v6_Linux.tar.gz";
			console.log("-- downloading NDI SDK distribution");
			const tarFile = await downloadToFile(tarUrl);

			console.log("-- extracting NDI SDK distribution");
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

			console.log("-- assembling NDI SDK subset");
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
					console.error(`** ERROR: ${e}`);
				}
			}
			console.log("-- removing temporary files");
			shell.rm("-f", tarFile);
			shell.rm("-rf", workDir);
		}
	}

	console.log("Preparing to build");
	let buildParam = "build";
	if (platform === "linux") {
		const targetArch = process.env.npm_config_target_arch || "";
		if (arch !== "arm" && ["armv7l", "arm"].includes(targetArch)) {
			buildParam = "build:linux-arm";
		} else if (arch !== "arm64" && targetArch === "arm64") {
			buildParam = "build:linux-arm64";
		} else if (arch !== "x64" && targetArch === "x64") {
			buildParam = "build:linux-x64";
		}
	}

	await execa("npm", ["run", buildParam], {
		stdio: "inherit",
		env: process.env,
	});
}

main().catch((err) => {
	console.error(`** ERROR: ${err}`);
});
