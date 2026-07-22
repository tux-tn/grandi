import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const ROOT = process.cwd();
const readJson = (filePath) =>
	JSON.parse(fs.readFileSync(path.join(ROOT, filePath), "utf8"));
const manifest = readJson("src/platforms.json");

function targetKey(target) {
	return `${target.platform}-${target.arch}`;
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const keys = new Set();
const packageNames = new Set();
const packageDirs = new Set();
for (const target of manifest) {
	const key = targetKey(target);
	assert(!keys.has(key), `Duplicate platform target: ${key}`);
	assert(
		!packageNames.has(target.packageName),
		`Duplicate platform package: ${target.packageName}`,
	);
	assert(
		!packageDirs.has(target.packageDir),
		`Duplicate package directory: ${target.packageDir}`,
	);
	keys.add(key);
	packageNames.add(target.packageName);
	packageDirs.add(target.packageDir);

	const packageJson = readJson(path.join(target.packageDir, "package.json"));
	assert(
		packageJson.name === target.packageName,
		`${target.packageDir}/package.json has name ${packageJson.name}; expected ${target.packageName}`,
	);
	assert(
		packageJson.os?.length === 1 && packageJson.os[0] === target.platform,
		`${target.packageName} has incompatible os metadata`,
	);
	assert(
		packageJson.cpu?.includes(target.arch),
		`${target.packageName} has incompatible cpu metadata (expected ${target.arch}, got ${JSON.stringify(packageJson.cpu)})`,
	);
}

const rootPackage = readJson("package.json");
const optionalPlatformPackages = Object.keys(
	rootPackage.optionalDependencies ?? {},
).filter((name) => name.startsWith("@grandi/"));
assert(
	optionalPlatformPackages.length === packageNames.size &&
		optionalPlatformPackages.every((name) => packageNames.has(name)),
	"Root optionalDependencies do not match src/platforms.json",
);

function readWorkflow(filePath) {
	return YAML.parse(fs.readFileSync(path.join(ROOT, filePath), "utf8"));
}

function workflowEntries(filePath, jobName) {
	const workflow = readWorkflow(filePath);
	return workflow.jobs?.[jobName]?.strategy?.matrix?.include ?? [];
}

function validateWorkflowMatrix(filePath, jobName, requireAllTargets) {
	const entries = workflowEntries(filePath, jobName);
	const workflowKeys = new Set();
	for (const entry of entries) {
		const key = `${entry.platform}-${entry.arch}`;
		assert(!workflowKeys.has(key), `Duplicate ${key} in ${filePath}`);
		workflowKeys.add(key);
		const target = manifest.find((candidate) => targetKey(candidate) === key);
		assert(target, `${filePath} references unknown platform target ${key}`);
		if (entry.pkgDir) {
			assert(
				entry.pkgDir === target.packageDir,
				`${filePath} maps ${key} to ${entry.pkgDir}; expected ${target.packageDir}`,
			);
		}
	}
	if (requireAllTargets) {
		assert(
			workflowKeys.size === keys.size &&
				[...keys].every((key) => workflowKeys.has(key)),
			`${filePath} does not build every manifest target`,
		);
	}
}

validateWorkflowMatrix(".github/workflows/publish.yml", "build-addon", true);
validateWorkflowMatrix(".github/workflows/ci.yml", "native", false);

console.log(
	`[validate-platforms] ${manifest.length} targets, package manifests, optional dependencies, and workflow matrices match`,
);
