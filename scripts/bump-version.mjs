import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function updatePackageJson(pkgPath, version) {
	const json = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
	const before = json.version;

	if (json.optionalDependencies) {
		for (const dep of Object.keys(json.optionalDependencies)) {
			if (dep.startsWith("@grandi/")) {
				json.optionalDependencies[dep] = version;
			}
		}
	} else {
		json.version = version;
	}

	fs.writeFileSync(pkgPath, `${JSON.stringify(json, null, 2)}\n`);
	console.log(`[set-version] ${pkgPath}: ${before} -> ${version}`);
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

function main() {
	const newVersion = process.argv[2];
	if (!newVersion) {
		throw new Error("Usage: node scripts/bump-version.mjs <new-version>");
	}
	const targets = findPackages();
	for (const pkg of targets) {
		updatePackageJson(pkg, newVersion);
	}
}

main();
