# Route sources

A router publishes a stable NDI destination whose upstream source can change at runtime.

Media does not pass through the router host. The router redirects connected receivers to the selected source. Thus, many routing outputs do not use equivalent media bandwidth.

```ts
const router = await grandi.routing({
	name: "Control Room / Program",
	groups: "studio-a",
});

try {
	router.change(source);
	console.log(router.sourceName());
	console.log(router.connections());

	// Disconnect the current upstream source.
	router.clear();
} finally {
	router.destroy();
}
```

## Switch between discovered sources

```ts
import type { Source } from "grandi";

function switchTo(name: string, sources: Source[]) {
	const source = sources.find((candidate) => candidate.name === name);
	if (!source) throw new Error(`Unknown NDI source: ${name}`);
	if (!router.change(source)) throw new Error(`Failed to route ${name}`);
}

switchTo("Studio (Camera 1)", finder.sources());
console.log(`Program now routes through ${router.sourceName()}`);

// Later, switch the same advertised router to another source.
switchTo("Studio (Camera 2)", finder.sources());
```

## Typical use cases

- Keep receiver configuration stable while switching upstream feeds.
- Publish a named program output controlled by application state.
- Expose one source name while rotating temporary senders behind it.

`change()` accepts a discovered `Source`. The values `null` and `undefined` also clear the route.
