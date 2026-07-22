# Platform support

Published native packages bundle `grandi.node` and the matching NDI runtime.

| Operating system | Node architecture | Package                |
| ---------------- | ----------------- | ---------------------- |
| Linux            | `x64`             | `@grandi/linux-x64`    |
| Linux            | `arm64`           | `@grandi/linux-arm64`  |
| Linux            | `arm`             | `@grandi/linux-armv7l` |
| macOS            | `x64`             | `@grandi/darwin-x64`   |
| macOS            | `arm64`           | `@grandi/darwin-arm64` |
| Windows          | `x64`             | `@grandi/win32-x64`    |
| Windows          | `ia32`            | `@grandi/win32-ia32`   |

## Linux

The Linux builds target glibc and require:

- `libavahi-common.so.3`
- `libavahi-client.so.3`
- A running `avahi-daemon`

The architecture package bundles `libndi.so.6` beside the native addon.

## macOS

The macOS packages use the official universal NDI runtime. Grandi publishes separate Node addon packages for x64 and arm64.

## Windows

Published packages contain the applicable NDI DLL. The Visual Studio 2013 C runtime is only a source-build prerequisite. Published packages do not require the SDK.

## Unsupported hosts

On an unsupported host, Grandi exposes its module surface. Native constructors return `Unsupported platform or CPU`. Before deployment, make sure that `process.platform` and `process.arch` match the table.
