# Discover sources

A finder keeps the latest NDI source snapshot. `wait()` waits for discovery changes without blocking the Node.js event loop.

```ts
import grandi from "grandi";

const finder = await grandi.find({
	showLocalSources: true,
	groups: "studio-a,studio-b",
	extraIPs: "192.168.10.20,mixer.local",
});

try {
	for (let attempt = 0; attempt < 20; attempt++) {
		await finder.wait(250);
		const [source] = finder.sources();
		if (source) {
			console.log(source.name, source.urlAddress);
			break;
		}
	}
} finally {
	finder.destroy();
}
```

## Wait for a specific source

Read the current snapshot before you wait. The source can already exist, and `wait()` reports only later changes.

```ts
import type { Finder, Source } from "grandi";

async function waitForSource(
	finder: Finder,
	matches: (source: Source) => boolean,
	timeoutMs = 5_000,
) {
	const deadline = Date.now() + timeoutMs;

	while (true) {
		const source = finder.sources().find(matches);
		if (source) return source;

		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new Error("NDI source not found");
		await finder.wait(Math.min(remaining, 250));
	}
}

const source = await waitForSource(
	finder,
	(candidate) => candidate.name === "Studio (Camera 1)",
);
```

## Finder options

| Option             | Purpose                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `showLocalSources` | Include NDI senders running on the same machine.                         |
| `groups`           | Comma-separated NDI groups to discover.                                  |
| `extraIPs`         | Comma-separated IP addresses or hostnames outside normal mDNS discovery. |

`extraIps` remains accepted as a deprecated alias.

## Source identity

```ts
interface Source {
	name: string;
	urlAddress?: string;
}
```

Use the complete `Source` from the finder to create a receiver or change a router. Source lists are snapshots. Call `sources()` again after `wait()` reports a change.
