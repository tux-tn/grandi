# Release notes

Release notes summarize changes that affect users. These notes describe the development branch. They remain unreleased until the next npm and GitHub release.

## Unreleased

### Migration and breaking API changes

Version 2.0 standardizes the public API. See [Migrate to version 2](/guide/migration-v2) for replacement code and a complete checklist.

Version 2.0 includes these breaking changes:

- The default export uses `grandi.frameSync()` instead of `grandi.framesync()`.
- `finder.wait()` now returns `Promise<boolean>`.
- Timecode and receive timestamps now use `bigint`. The `PtpTimestamp` tuple type is removed.
- `frameSync.audio()` now requires a positive `samples` value.
- Native `embedded` handles are no longer part of the public TypeScript interfaces.

Deprecated compatibility names remain available for color formats, bandwidth, audio formats, frame formats, FourCC values, source names, tally fields, discovery addresses, and audio dimensions.

### Native runtime and packaging

- Native addon loading now reports all attempted load failures, including the original nested cause.
- One shared manifest defines platform targets and compares them with package metadata and CI release matrices.
- Grandi rejects unsupported Linux architectures before it loads optional packages.
- Release validation examines each platform package and root optional-dependency version.

### Documentation and tooling

- Added this documentation site and generated API reference.
- Added guides for installation, lifecycle, discovery, media I/O, FrameSync, routing, timing, platform support, and troubleshooting.
- CI builds the documentation site and validates Markdown/YAML formatting.
- Removed unused development dependencies.

See the repository [changelog](https://github.com/tux-tn/grandi/blob/main/CHANGELOG.md) for the complete categorized list.

## Release process

The release workflow validates all package versions and builds each native target. Then it publishes the npm packages and creates the GitHub release assets.
