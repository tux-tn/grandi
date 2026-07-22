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
