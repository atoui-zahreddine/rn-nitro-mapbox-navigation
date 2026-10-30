# Mapbox consumer validation

These fixtures install an npm tarball into a new app generated from the official React Native or Expo template. They do not link the library checkout or copy its development `node_modules`.

Build and pack the library first:

```sh
yarn prepare
npm pack --ignore-scripts --pack-destination /tmp
```

Generate a bare consumer, using the tarball filename printed by `npm pack`:

```sh
node scripts/ios-compat/create-consumer.mjs \
  --kind bare --rn 0.88.1 \
  --directory /tmp/navigation-consumer \
  --tarball /tmp/rn-nitro-mapbox-navigation-0.11.0.tgz
```

For Expo 58 with Maps, use `--kind expo --maps`. The Maps fixture pins `@rnmapbox/maps` 10.3.16. Unpatched 10.2.10 fails against RN 0.88's changed `LayoutMetrics` C++ structure; the patched Bumbal app is a separate integration case.

Set `MAPBOX_PUBLIC_TOKEN` in the environment before generating a fixture to run navigation. Without it, the fixture uses a placeholder suitable for compilation only. Never commit a generated consumer with real local configuration.

Both bare and Expo fixtures request foreground location permission before mounting its map or navigation UI. This avoids creating a map during the initial permission grant. It is a mitigation for the first-launch path in [Mapbox issue #2449](https://github.com/mapbox/mapbox-maps-ios/issues/2449), not a fix for the SDK's permission-change race. Later permission changes still need an upstream fix. Our captured Expo crash matches the issue's MapboxCommon UUID and complete seven-frame offset sequence.

Install pods from the fixture's `ios` directory:

```sh
cd /tmp/navigation-consumer/ios
pod install
```

To test static frameworks, run `USE_FRAMEWORKS=static pod install` instead. For Expo, the generated scheme is the directory name with non-alphanumeric characters removed. The bare scheme is `NitroNavigationConsumer`.

```sh
cd ..
xcodebuild -workspace ios/NitroNavigationConsumer.xcworkspace \
  -scheme NitroNavigationConsumer -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/navigation-consumer-build \
  ARCHS=arm64 CODE_SIGNING_ALLOWED=NO build
```

Verify that the app embeds the required Mapbox frameworks, resource bundles, and Release JS bundle:

```sh
node /path/to/library/scripts/ios-compat/verify-app.mjs \
  /tmp/navigation-consumer-build/Build/Products/Release-iphonesimulator
```

The muted fixture exposes Start, Stop, Change route, Short route, and Route error controls. Its status text counts route progress, arrivals, errors, and SDK close events. Verify cancel/reopen, destination changes without remounting, background/resume, short-route arrival, and an ocean destination that should report a route error. In the Maps fixture, stopping guidance returns to an ordinary Mapbox map. Verify the map-loaded callback, native camera zoom after pressing Zoom in, and the Test marker button. Move the simulator GPS a few hundred meters from the marker at 51.558588, 5.082325: the default MarkerView collision policy hides a marker overlapping the location puck.

The `Mapbox consumer builds` GitHub Actions workflow repeats clean consumer builds with default linking and static frameworks. It also builds an unsigned device archive. CI compilation does not replace simulator interaction, physical-device tests, signed archive verification, or TestFlight testing.


The current iOS pins are Navigation 3.33.1, Maps 11.33.1, and Common 24.33.1. The captured permission crash occurred on Common 24.33.0; do not treat a successful bounded run on the patch as proof that later permission changes are safe. See [recorded validation results](../../validation/ios-mapbox.md).

Run the helper regression checks with Ruby and the `xcodeproj` gem (tested with 1.27.0):

```sh
ruby scripts/ios-compat/verify-helper.rb
yarn test --runInBand
yarn typecheck
```

The consumer generator requires Node 24 and Python 3. For an Android build of the bare Maps fixture:

```sh
node scripts/ios-compat/configure-android.mjs /tmp/navigation-consumer
cd /tmp/navigation-consumer/android
./gradlew :app:dependencyInsight --configuration debugRuntimeClasspath --dependency com.mapbox.maps:android-ndk27
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

Provide the existing Mapbox downloads credential as the `MAPBOX_DOWNLOADS_TOKEN` Gradle property, or through the environment variable `ORG_GRADLE_PROJECT_MAPBOX_DOWNLOADS_TOKEN`. The configuration script accepts `MAPBOX_PUBLIC_TOKEN` and `ANDROID_HOME`; without a public token its placeholder supports compilation only. Android CI builds the latest Maps wrapper alongside navigation, but does not run an emulator. The six iOS jobs and Android job are configured in the workflow; a local build is not evidence of a completed GitHub Actions run.
