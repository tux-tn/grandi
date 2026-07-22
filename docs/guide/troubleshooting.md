# Troubleshooting

## Failed to load native addon

Grandi reports each attempted load path. Read each numbered cause in the aggregate error.

### Missing architecture package

```text
Failed to find prebuilt package for linux-x64.
Please ensure that the package "@grandi/linux-x64" is installed
```

Run this command to make sure that the installation includes optional dependencies:

```sh
npm ls @grandi/linux-x64
```

Do not install with `--omit=optional` in a consuming application.

### Missing `libndi.so.6`

```text
libndi.so.6: cannot open shared object file
```

For a published package, make sure that `libndi.so.6` is beside `grandi.node`. For a local build, run this command. It copies the runtime libraries into `build/Release`:

```sh
npm run build:addon
```

### Missing Avahi libraries

On Debian or Ubuntu:

```sh
sudo apt-get install -y avahi-daemon libavahi-common3 libavahi-client3
sudo systemctl enable --now avahi-daemon
```

## No sources discovered

- Wait for discovery updates before you read `finder.sources()`.
- Make sure that the sender and receiver use the same NDI groups.
- Make sure that the network permits multicast and mDNS traffic.
- Add known off-subnet hosts through `extraIPs`.
- On Linux, make sure that `avahi-daemon` is active.

## Receiver capture rejects while FrameSync is active

This behavior is intentional. A receiver cannot perform direct capture while it supports a `FrameSync`. Capture through the frame synchronizer. To return to direct capture, destroy the frame synchronizer.

## Numeric timing values reject

Timecodes and receive timestamps are signed 64-bit values. Pass timecode as `bigint`. To synthesize timecode, omit the value:

```ts
const timecode = 0n;
```

See [Timing and timecode](/concepts/timing).
