# Release notes

Release notes summarize changes that affect users. These notes describe the development branch. They remain unreleased until the next npm and GitHub release.

## [2.0.0](https://github.com/tux-tn/grandi/compare/v1.3.1...v2.0.0) - 2026-07-22

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

## [1.3.1](https://github.com/tux-tn/grandi/compare/v1.3.0...v1.3.1) - 2026-07-06

- Upgraded the NDI SDK to version 6.3.2.0.

## [1.3.0](https://github.com/tux-tn/grandi/compare/v1.2.1...v1.3.0) - 2026-02-05

### Fixed

- Added the missing `Best` color format.
- Corrected the GYP architecture on macOS.
- Exported the sender tally method with the correct name.
- Guarded the audio receive wait argument against out-of-bounds access.

## [1.2.1](https://github.com/tux-tn/grandi/compare/v1.2.0...v1.2.1) - 2026-01-18

### Fixed

- Changed the download stream implementation to prevent `build-addon` from hanging.
- Used Node.js 20 for the Windows x86 build.

## [1.2.0](https://github.com/tux-tn/grandi/compare/v1.1.0...v1.2.0) - 2026-01-15

### Fixed

- Tried the locally built addon before loading an external platform package.
- Made native binding load errors more explicit.
- Prevented SDK downloads from timing out on slow connections.
- Removed duplicate NDI libraries from platform packages.

## [1.1.0](https://github.com/tux-tn/grandi/compare/v1.0.0...v1.1.0) - 2025-12-18

### Added

- Added send and receive benchmarks with bandwidth statistics.
- Added the NDI FrameSync API.
- Added timeout events to `receiver.data()`.
- Improved the default export types and JSDoc examples.

### Fixed

- Initialized NDI creation structures and audio buffers before use.
- Calculated receiver buffer sizes before copying frame data.
- Corrected UYVA buffer sizing and required fields for `Fastest` and `Best` color formats.
- Prevented crashes while copying UYVA video frames.
- Prevented receiver promises from hanging.
- Validated video and audio frame layouts before sending.
- Accepted the `Best` color format in validation helpers.

### Performance

- Changed the benchmark video format to UYVY and corrected payload bandwidth calculations.

## [1.0.0](https://github.com/tux-tn/grandi/releases/tag/v1.0.0) - 2025-11-10

### Added

- Added video sending, metadata sending, and receiver tally support.
- Added usage examples and integration tests.
- Modernized the NDI send and receive implementation and public types.
- Added CI and optimized the release workflow.
- Added prebuilt native package generation.

### Fixed

- Bundled TypeScript sources before publication.
- Corrected native library and license paths on Windows, macOS, and Linux.
- Included the applicable NDI license in each platform package.
- Linked Linux builds against the stable `libndi.so` and `libndi.so.6` names.
- Aligned downloaded NDI library names with platform package names.
- Prevented the preinstall script from skipping an incomplete native build.
- Corrected the status returned when received data was not metadata.
- Added `NDI_FORCE=1` support for forced SDK downloads and installation.

## Release process

The release workflow validates all package versions and builds each native target. Then it publishes the npm packages and creates the GitHub release assets.
