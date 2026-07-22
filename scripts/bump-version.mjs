import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function replaceStringField(content, key, value, filePath) {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(
		`(^[\\t ]*"${escapedKey}"[\\t ]*:[\\t ]*)"([^"\\r\\n]*)"`,
		"m",
	);
	const match = content.match(pattern);
	if (!match) throw new Error(`Missing "${key}" field in ${filePath}`);
	return {
		content: content.replace(pattern, (_, prefix) => {
			return `${prefix}${JSON.stringify(value)}`;
		}),
		before: match[2],
	};
}

function updatePackageJson(pkgPath, version) {
	const source = fs.readFileSync(pkgPath, "utf8");
	const json = JSON.parse(source);
	const versionUpdate = replaceStringField(source, "version", version, pkgPath);
	let content = versionUpdate.content;

	for (const dep of Object.keys(json.optionalDependencies ?? {})) {
		if (!dep.startsWith("@grandi/")) continue;
		content = replaceStringField(content, dep, version, pkgPath).content;
	}

	fs.writeFileSync(pkgPath, content);
	console.log(
		`[set-version] ${pkgPath}: ${versionUpdate.before} -> ${version}`,
	);
}

function findPackages() {
	const pkgs = [path.join(ROOT, "package.json")];
	const packagesDir = path.join(ROOT, "packages");
	if (fs.existsSync(packagesDir)) {
		const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const pkgJson = path.join(packagesDir, entry.name, "package.json");
			if (fs.existsSync(pkgJson)) pkgs.push(pkgJson);
		}
	}
	return pkgs;
}

function validateReleaseVersion(releaseTag) {
	if (!/^v\d+\.\d+\.\d+$/.test(releaseTag)) {
		throw new Error(`Invalid release tag: ${releaseTag}`);
	}

	const expectedVersion = releaseTag.slice(1);
	const packagePaths = findPackages();
	const mismatches = [];

	for (const pkgPath of packagePaths) {
		const packageJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
		if (packageJson.version !== expectedVersion) {
			mismatches.push(
				`${pkgPath} has version ${packageJson.version ?? "<missing>"}; expected ${expectedVersion}`,
			);
		}
	}

	const rootPackage = JSON.parse(
		fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
	);
	for (const [name, version] of Object.entries(
		rootPackage.optionalDependencies ?? {},
	)) {
		if (name.startsWith("@grandi/") && version !== expectedVersion) {
			mismatches.push(
				`root optional dependency ${name} has version ${version}; expected ${expectedVersion}`,
			);
		}
	}

	if (mismatches.length > 0) {
		throw new Error(
			`Release version validation failed:\n${mismatches
				.map((mismatch) => `- ${mismatch}`)
				.join("\n")}`,
		);
	}

	console.log(
		`[validate-version] ${packagePaths.length} package versions and root optional dependencies match ${releaseTag}`,
	);
}

function main() {
	const [command, argument] = process.argv.slice(2);
	if (command === "--check") {
		const releaseTag = argument ?? process.env.GITHUB_REF_NAME;
		if (!releaseTag) {
			throw new Error(
				"Usage: node scripts/bump-version.mjs --check <release-tag>",
			);
		}
		validateReleaseVersion(releaseTag);
		return;
	}

	const newVersion = command;
	if (!newVersion) {
		throw new Error("Usage: node scripts/bump-version.mjs <new-version>");
	}
	const targets = findPackages();
	for (const pkg of targets) {
		updatePackageJson(pkg, newVersion);
	}
}

main();
