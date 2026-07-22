# Library lifecycle

Grandi can use the process-global lifecycle of the NDI SDK. Thus, `initialize()` and `destroy()` are optional. Explicit lifecycle management gives early startup and CPU validation.

## Explicit lifecycle

```ts
import grandi from "grandi";

if (!grandi.initialize()) {
	throw new Error("NDI cannot initialize on this CPU");
}

const finder = await grandi.find();

try {
	await finder.wait(1_000);
	console.log(finder.sources());
} finally {
	finder.destroy();
	grandi.destroy();
}
```

## Destruction order

Destroy the native objects before you stop the process-global library:

1. Frame synchronizers
2. Receivers, senders, routers, and finders
3. `grandi.destroy()`

A `FrameSync` owns a live relationship with its receiver. Destroy the frame synchronizer before its receiver.

::: warning Do not mix ownership models
If your application calls `initialize()`, it must also control shutdown. Do not call `destroy()` while another part of the process uses NDI.
:::

## Without explicit initialization

Constructors do not call `initialize()`. The SDK can operate without an explicit lifecycle pair:

```ts
const finder = await grandi.find();
try {
	// use finder
} finally {
	finder.destroy();
}
```

Destroy each native object, whether you use the global lifecycle functions or not.
