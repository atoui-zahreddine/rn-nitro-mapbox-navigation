# Mapbox compatibility validation

Validated locally on 28 October 2026 in isolated library and Bumbal worktrees. The original library checkout retains its pre-existing `.nvmrc` change and untracked Nitro investigation; the original Bumbal package manifest has no navigation dependency change. Other Bumbal edits belong to the user's concurrent session.

## Current package

Nitro/Nitrogen 0.37.1; example React Native 0.88.1 and React 19.3.1; Node 24; Xcode 27.1. iOS Navigation 3.33.1, Maps 11.33.1, Common 24.33.1, NavigationNative 324.33.1. The latest checked `@rnmapbox/maps` wrapper is 10.3.16. Bumbal's separately patched older wrapper remains a distinct consumer case.

Mapbox uses React Native's CocoaPods `spm_dependency` integration. Default linking requires no dynamic-framework setting. Full experimental React Native SwiftPM mode is unsupported by stable Nitro's mixed Swift/C++ HybridViews. Navigation owns the source packages; Maps uses manual dependency mode and the same graph. The app embeds the four required binary frameworks without linking duplicate source products.

## Builds and runtime checks

On the current iOS patch, standalone Release simulator builds passed for the example, a clean bare RN 0.88.1 consumer with Maps 10.3.16 and default linking, and an Expo 58 / RN 0.88.0 consumer with Maps 10.3.16 and static frameworks. Both consumers installed an npm tarball, with no linked development node_modules. Framework/resource/Release-bundle verification passed.

The bare Maps consumer loaded the ordinary map, selected a MarkerView button, and reported native camera zoom changing from 14 to 15. Simulated muted navigation produced 170 progress callbacks and zero errors; the SDK close button returned to the ordinary map with one cancellation.

The Expo static consumer requested location permission before mounting either map. It then loaded the ordinary map, selected the marker, reported native zoom changing to 15, ran muted simulated guidance for 29 progress callbacks with zero errors, and returned to the ordinary map through the SDK close button with one cancellation. No additional crash report for either consumer bundle was found after these runs. These are bounded checks, not long-running reliability evidence. The marker's default collision policy hides it when overlapping the location puck; GPS was moved a few hundred meters from the marker for interaction checks.

Android compilation with Maps 10.3.16 also passed. Gradle selected one Maps 11.33.0-ndk27 dependency alongside Navigation 3.12.2-ndk27. The final Android configuration script's permissions and token resource were included in the successful build. Android runtime behavior was not tested.

Bumbal's Release device archive on the current patch succeeded, passed `codesign --verify --deep --strict`, and passed embedded-framework/resource verification. A development-signed IPA export also succeeded using the existing local signing profile. This verifies archive/export packaging; it does not constitute a physical-device or distribution test.

Local artifacts:

- `/tmp/nitro-3331-example-build.log`
- `/tmp/nitro-3331-bare-maps-fixed-build.log`
- `/tmp/nitro-3331-expo-maps-fixed-build.log`
- `/tmp/nitro-3331-android-graph.log`
- `/tmp/nitro-3331-android-final-build.log`
- `/tmp/nitro-3331-bare-maps/android/app/build/outputs/apk/debug/app-debug.apk`
- `/tmp/nitro-3331-BumbalDriver.xcarchive`
- `/tmp/nitro-3331-BumbalDriver-export/BumbalDriver.ipa`
- `/tmp/nitro-3331-bumbal-archive.log`
- `/tmp/nitro-3331-export.log`
- `/tmp/nitro-3331-latest-maps.mp4` (original recording)
- `/tmp/nitro-3331-latest-maps-preview.mp4` (muted, compressed, 2× playback)
- `/tmp/nitro-3331-expo-flow.adb` (saved interaction script)

Before the patch upgrade, Navigation 3.33.0 / Maps 11.33.0 passed five clean simulator build configurations: bare RN 0.88.0 default; bare RN 0.88.1 default and static; Expo 58 with Maps default and static. Earlier lifecycle checks covered destination changes without remounting, short-route arrival, routing error and recovery, background/resume, and repeated close/reopen. These historical results should not be described as all rerun against 3.33.1.

## Regression checks

The example and bare fixtures gate mounting on foreground location permission. Six JS tests cover pending/denied/granted permission, Settings and resume, revocation, and stale asynchronous results. The plugin's four tests cover generated configuration/idempotence. Total: 10 passed, one pre-existing TODO. TypeScript and focused ESLint checks passed.

Four Ruby tests with 14 assertions passed for package cleanup/idempotence, preservation of packages still used by other targets, a forced CocoaPods UUID collision, and exclusion of unrelated sibling app targets. The collision test failed before the helper fix: a newly created target dependency could overwrite an existing file reference. The helper now allocates unused IDs for those objects. An app's unused stale Mapbox package pins are removed on upgrades; active references are preserved.

The `Mapbox consumer builds` workflow configures six iOS jobs plus one Android Maps build. It includes an unsigned device archive. No GitHub Actions execution was performed in this session.

## SDK crash and remaining limits

The supplied Expo crash on Common 24.33.0 exactly matches the UUID and all seven MapboxCommon frame offsets in the open upstream [Mapbox Maps issue #2449](https://github.com/mapbox/mapbox-maps-ios/issues/2449). It is a native location-authorization concurrency problem, not evidence of duplicate wrapper linkage.

Captured UUID: `1E3BAE8C-9719-3BF2-A1CE-407DC1FD9862`. Offsets: `0x2b1d78`, `0x2b6f64`, `0x18559c`, `0x1851b4`, `0x185468`, `0x21f32c`, `0x1ba8d8`. Local comparison evidence is in `/tmp/nitro-compat-crash-match.json`.

Requesting permission before any Mapbox view mounts mitigates the initial-grant path. It does not establish safety for later Settings or system permission changes after Mapbox services exist. Common 24.33.1's provider-lookup function contains the same 467 instructions after address normalization as 24.33.0. That comparison does not establish whether callers changed, and the patch release notes do not claim a fix. Treat this risk as unresolved pending upstream confirmation and targeted testing. Comparison evidence is in `/tmp/nitro-common-24331-lookup-analysis.json`.

Physical iPhone checks were deferred at the user's request. Dynamic-framework configurations, unrelated RN/Xcode versions, Android runtime, TestFlight/App Store distribution, simultaneous navigation owners, and every possible third-party Mapbox dependency combination remain unverified. Nitro compatibility alone is not a guarantee that an arbitrary app meets the native dependency requirements.


## Prerelease preparation

The reviewed prerelease is `0.11.0-beta.1`, intended for npm's `next` tag. The manual Release workflow's prerelease mode runs the six iOS consumer configurations and Android consumer build before publishing with the existing trusted publisher. Stable `latest` is not changed. Publication and CI completion must be confirmed from the workflow and registry; preparing this configuration alone is not evidence of either.
