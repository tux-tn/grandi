## Unreleased

### Breaking Changes
- Standardize public API names, including `frameSync()`, `extraIPs`, `sourceName`, tally fields, and audio `channels` and `samples` ([087609e](https://github.com/tux-tn/grandi/commit/087609e0b1e6f65f318e3b65e00b3c76c3bab3ed), [f3ffef1](https://github.com/tux-tn/grandi/commit/f3ffef17c36f80e296666686af70f07d7079f81b)).
- Make `finder.wait()` asynchronous and return `Promise<boolean>` ([7659c5b](https://github.com/tux-tn/grandi/commit/7659c5b2ca75911e2ba17b13010ad35f9810c5aa)).
- Use `bigint` for timecode and receive timestamps, and remove `PtpTimestamp` ([0e22729](https://github.com/tux-tn/grandi/commit/0e227292238ec4413f71eb81d23210fb1d167c13)).
- Require a positive `samples` value when pulling FrameSync audio ([cced704](https://github.com/tux-tn/grandi/commit/cced704237a9153eab54d67ffe579cabd533b93e)).
- Remove native `embedded` handles from public TypeScript interfaces ([087609e](https://github.com/tux-tn/grandi/commit/087609e0b1e6f65f318e3b65e00b3c76c3bab3ed)).
- Split video and audio FourCC types ([0b17da9](https://github.com/tux-tn/grandi/commit/0b17da94cb379cbf10feff04f48ca19efa450ae4)).
- Publish the root package as ESM ([932b09a](https://github.com/tux-tn/grandi/commit/932b09aabea3fbb7b380b05e8c7c84bbbbd382aa)).

### Fixed
- Install project dependencies before docs build in the docs CI workflow
## [1.3.1](https://github.com/tux-tn/grandi/compare/v1.3.0...v1.3.1) (2026-07-06)

- Upgrade to NDI SDK 6.3.2.0

## [1.3.0](https://github.com/tux-tn/grandi/compare/1.3.0...v1.3.0) (2026-02-05)

### Bug Fixes

- add missing BEST colorformat ([eae9ca3](https://github.com/tux-tn/grandi/commit/eae9ca3690cc82d643282e729c0e55a81c40a15e))
- change GYP arch for darwin ([699ecae](https://github.com/tux-tn/grandi/commit/699ecaeac4922bd3a7e9a762bc9f2ad6ee327c1f))
- export tally method with correct name on sender object ([fe4a962](https://github.com/tux-tn/grandi/commit/fe4a96296088dfe3b641db492f8d67906b998bae))
- guard audio receive wait argument to avoid out-of-bounds access ([b4689ae](https://github.com/tux-tn/grandi/commit/b4689aec8475036297f6b1ed69df2411a27be125))

## [1.2.1](https://github.com/tux-tn/grandi/compare/v1.2.0...v1.2.1) (2026-01-18)

### Bug Fixes

- **build:** Switch download stream to avoid build-addon hang ([75d8b62](https://github.com/tux-tn/grandi/commit/75d8b62d86bab2c7981b7def9b3af9a2a31c7b86))
- **ci:** run windows x86 workflow on node 20 ([adb2377](https://github.com/tux-tn/grandi/commit/adb23772fe7baaa16e08aa6f86a7597c1df29cc0))

## [1.2.0](https://github.com/tux-tn/grandi/compare/v1.1.0...v1.2.0) (2026-01-15)

### Features

- bump version ([bc74c11](https://github.com/tux-tn/grandi/commit/bc74c11795afe7b5a8f2f35ea7e95533029820d3))

### Bug Fixes

- attempt to load local node addon before loading external one ([1b3d2d7](https://github.com/tux-tn/grandi/commit/1b3d2d7bbf08a84a48e69083d9cb98a5f936560a))
- make binding not found errors more explicit ([a85438f](https://github.com/tux-tn/grandi/commit/a85438fd0cf0f30cfe275f44cea45750a5db5304))
- prevent downloading to timeout on slow internet connection ([af99043](https://github.com/tux-tn/grandi/commit/af99043f9e935db9173deb2ad9a6f2ba28fcb60c))
- prevent having duplicates lib in binding packages ([42f9f77](https://github.com/tux-tn/grandi/commit/42f9f77c7b9e79cc7bf180b9c601d6eafe7c08b0))

## [1.1.0](https://github.com/tux-tn/grandi/compare/v1.0.0...v1.1.0) (2025-12-18)

### Features

- **bench:** add send/receive benchmark with bandwidth stats ([d6ce3c9](https://github.com/tux-tn/grandi/commit/d6ce3c948ad593b54f001c70dd8c40df867718ab))
- bump version ([e8627c4](https://github.com/tux-tn/grandi/commit/e8627c429a73fc6f93f703da02581aada92203e6))
- **framesync:** expose NDI frame-synchronizer API ([8f610b7](https://github.com/tux-tn/grandi/commit/8f610b7622702fcbf86fcbf05a31261a574f0e8f))
- **receiver:** return timeout event from data() ([2016835](https://github.com/tux-tn/grandi/commit/201683563aaad643e911485a42dc21cabe7886a6))
- **types:** improve default export typing + JSDoc examples ([6fca639](https://github.com/tux-tn/grandi/commit/6fca63986a0c9bb9e090d615be3dfd3df4f8d77b))

### Bug Fixes

- **ndi:** zero-init create structs and audio buffers ([35970c2](https://github.com/tux-tn/grandi/commit/35970c2308bb121ea6a8064e522937776df0fe8e))
- **receiver:** calculate automatically the buffer size before copying ([9a08aef](https://github.com/tux-tn/grandi/commit/9a08aef92e04cd974df467f157f02271b069aa43))
- **receiver:** correct UYVA buffer sizing and enforce fields in fastest/best ([ca741de](https://github.com/tux-tn/grandi/commit/ca741de1951586cf33382a97cbec02b2b6008b62))
- **receiver:** prevent crash copying UYVA video buffers ([a2452ba](https://github.com/tux-tn/grandi/commit/a2452ba4f66da4485a57e08c81684c59e75b6bc1))
- **receiver:** prevent promise from hanging ([7d37bc0](https://github.com/tux-tn/grandi/commit/7d37bc0f470780b45bfe9c1acd70b3db0629eeb6))
- **sender:** validate video/audio frame layout before sending ([f7661ec](https://github.com/tux-tn/grandi/commit/f7661ecb5ede4eb15dd41715d1584b1d006c18e0))
- **utils:** add missing best format to accepted color formats ([198e0fa](https://github.com/tux-tn/grandi/commit/198e0fac1df3de2fd4c8d3d8d214e697ac482394))
- **util:** small c++ optimization ([1ee79b6](https://github.com/tux-tn/grandi/commit/1ee79b6a0e7117e384587fff8efa9400780515b8))

### Performance Improvements

- **bench:** switch benchmark video to UYVY and fix payload bandwidth math ([1b881fb](https://github.com/tux-tn/grandi/commit/1b881fbebdfc77572a1400a87060aa67448e88c0))

## [1.0.0](https://github.com/tux-tn/grandi/compare/95687c269690a5f7fe2f7cd0ebb85a500f3d1b07...v1.0.0) (2025-11-10)

### Features

- add receiver tally API and expand integration tests ([b6efc05](https://github.com/tux-tn/grandi/commit/b6efc058e6770dc06f7d846d094fb15e19db6029))
- add usage examples ([c03af81](https://github.com/tux-tn/grandi/commit/c03af81b04c2b343cf0ac3dc46e6816073caa96e))
- Add video sending ([95687c2](https://github.com/tux-tn/grandi/commit/95687c269690a5f7fe2f7cd0ebb85a500f3d1b07))
- fix metadata sending ([7d822e9](https://github.com/tux-tn/grandi/commit/7d822e9aa2f17dacb1fe4f6b19b25abfb341187d))
- modernize NDI send/receive plumbing and types ([21cd5a9](https://github.com/tux-tn/grandi/commit/21cd5a9fe63a0869b4e113ff653ead1c7b34cfa7))
- optimize workflow and add CI job ([cdae5f3](https://github.com/tux-tn/grandi/commit/cdae5f31fdf497397e6bb22350ebd82d5521e0a6))
- switch build process to prebuildify and fix types ([69a3b87](https://github.com/tux-tn/grandi/commit/69a3b87891a18be926db93e38c5f48e78a5ea3eb))

### Bug Fixes

- **action:** bundle TS sources before publishing ([de715e2](https://github.com/tux-tn/grandi/commit/de715e2ef985c6a6cbbbd0541cf671d2fb2f6731))
- **bindings:** copy only needed library for linux ([a3929ca](https://github.com/tux-tn/grandi/commit/a3929ca7e6f94538104fdeebc3ddaecba2516d23))
- **bindings:** fix paths for windows and license file ([0790a3e](https://github.com/tux-tn/grandi/commit/0790a3e35e1c74029a651c38b70a27eb7e672bb4))
- **bindings:** include ndi licenses file ([91e247f](https://github.com/tux-tn/grandi/commit/91e247f0dada001f19b1e6c58d92a15ca4c2ec42))
- **bindings:** use correct path for License and macOS lib ([6b9e713](https://github.com/tux-tn/grandi/commit/6b9e7134b44ce4f1ebf60c0bf834a0f071dc2ed5))
- **binding:** use correct license file for each platform ([be8b726](https://github.com/tux-tn/grandi/commit/be8b726eb4f01da7c9203d17a6c9d3668e3798b3))
- **build:** avoid hardcoded NDI 6.x.y by linking against libndi.so/.6 ([5ba7fb2](https://github.com/tux-tn/grandi/commit/5ba7fb2845a97ccd2fdd3b1e7692416788a88e1c))
- **preinstall:** use same naming as bindings for ndi lib storage ([4d4547e](https://github.com/tux-tn/grandi/commit/4d4547eb9338c5d856a18b28f7907ca62b7f09d6))
- prevent preinstall script from running when ndi/ exist but not prebuilds/ folder ([8f060cf](https://github.com/tux-tn/grandi/commit/8f060cfddf31efe9d796a99e983ca712afa8023e))
- **receive:** return correct status when received data is not metadata ([093c840](https://github.com/tux-tn/grandi/commit/093c84057b1b4910340e63366944f18375add5f2))
- use NDI_FORCE=1 to for downloading/installing NDI SDK ([55127b4](https://github.com/tux-tn/grandi/commit/55127b4c5a3b778fd611b20189ba1c933773e2c8))
