**rn-nitro-mapbox-navigation**

***

# rn-nitro-mapbox-navigation

React Native module for Mapbox Navigation SDK, providing full turn-by-turn navigation functionality.

## Features

-   **Turn-by-Turn Navigation**: Provides a complete turn-by-turn navigation UI and experience.
-   **Customizable UI**: The navigation view can be customized with your own colors and styles.
-   **Expo Support**: Seamless integration with Expo projects using a config plugin.
-   **Nitro Modules**: Built with Nitro Modules for efficient native module development.

## Installation

To use this library, you need to install it along with `react-native-nitro-modules`:

```sh
npm install rn-nitro-mapbox-navigation react-native-nitro-modules
```

> **Note**: `react-native-nitro-modules` is a peer dependency and is required for this library to work.

This branch prepares stable **0.11.0**, including Navigation **3.33.1** on both platforms. The published validation build is **0.11.0-beta.1** and still uses Android Navigation **3.12.2**; the public `latest` tag remains **0.10.0** until the stable upgrade is released.

### iOS dependencies

iOS uses Mapbox Navigation **3.33.1**, Mapbox Maps **11.33.1**, and Nitro Modules **0.37.1**. The example uses React Native **0.88.1**, React **19.3.1**, and Node **24**.

Mapbox is resolved through React Native's `spm_dependency` helper alongside CocoaPods. This does not require converting the app to React Native's experimental full SwiftPM mode: stable Nitro's mixed Swift/C++ view targets do not support that mode yet. See the [React Native SPM helper](https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/scripts/react_native_pods.rb) and [SwiftPM preview documentation](https://github.com/facebook/react-native/blob/main/packages/react-native/scripts/spm/__docs__/spm-scripts.md).

If the app also uses `@rnmapbox/maps`, both wrappers must resolve Mapbox from the same SPM graph. The Expo plugin detects `@rnmapbox/maps` and configures its manual dependency mode, Maps v11 flags, and app-level package linkage. Remove any other plugin or Podfile setting that pins Mapbox Maps v10 or installs Mapbox through CocoaPods. Any Maps version-setting plugin must agree with `= 11.33.1`.

The navigation pod owns the SPM source code; `@rnmapbox/maps` builds against that same copy. The app links and embeds the binary frameworks (`MapboxCommon`, `MapboxCoreMaps`, `MapboxNavigationNative`, and `Turf`) without linking a second copy of the source packages. Keep `Package.resolved` under version control when Xcode generates it.

The Swift implementation follows Mapbox's [v3 drop-in UI integration](https://docs.mapbox.com/ios/navigation/guides/turn-by-turn-navigation/user-interface/): one `MapboxNavigationProvider`, routes from its routing provider, and `NavigationViewController(navigationRoutes:navigationOptions:)`. Mapbox creates and wires the standard instruction and trip-progress banners. The controller is embedded in the React Native view using UIKit child-controller containment. A single `StandardDayStyle` keeps the map light; Mapbox documents style configuration in [Maps for navigation](https://docs.mapbox.com/ios/navigation/guides/map-and-camera/maps/).

### Android dependencies

Android uses the official stable Mapbox Navigation **3.33.1**, with Maps **11.33.1** and Common **24.33.1** from the same dependency graph. The `-ndk27` artifacts are Mapbox's published builds for 16 KB page support. They are not a fork or prerelease. See the [Android release notes](https://docs.mapbox.com/android/navigation/releases/) and [installation guide](https://docs.mapbox.com/android/navigation/guides/install/).

The Android build uses compile SDK **37**, NDK **27.1.12297006**, and Kotlin **2.2.0**. When also using `@rnmapbox/maps`, let Gradle resolve one matching Maps SDK version rather than forcing an older version.

`shouldSimulateRoute` uses Mapbox's replay session API on Android. Mapbox marks that API as preview within its stable SDK; the library opts in only where replay is used.

### Compatibility validation

Nitro Modules compatibility alone does not establish iOS compatibility. The app also needs React Native's CocoaPods/SPM integration, the Podfile hooks below, and one shared Mapbox dependency graph. Full React Native SwiftPM mode is not supported by this release.

The clean-consumer checks use RN **0.88.0/0.88.1**, Nitro **0.37.1**, Expo **58**, and Xcode **27.1**. Default CocoaPods linking does not require `USE_FRAMEWORKS=dynamic`; static-framework configurations are checked separately. Other RN versions, Xcode versions, and dynamic-framework configurations need their own validation.

For a clean RN 0.88 app that also uses Maps, use `@rnmapbox/maps` **10.3.16**. Unpatched **10.2.10** fails to compile against RN 0.88's `LayoutMetrics` changes. An app that already patches that wrapper, such as Bumbal, is a separate compatibility case.

Only one navigation view may own active guidance at a time. The SDK provider and trip session are shared. Other native libraries that independently install Mapbox through CocoaPods or pin another Maps version must be reconciled before building.

See the [validation results](_media/ios-mapbox.md) and [consumer validation scripts](_media/README.md) for tarball fixtures, linking configurations, and lifecycle checks. CI builds verify packaging and native compilation; device behavior and distribution signing require separate checks.

**Known SDK crash:** MapboxCommon **24.33.0**, used by Maps **11.33.0**, has an open [location-authorization race](https://github.com/mapbox/mapbox-maps-ios/issues/2449). Our Expo simulator crash matched the reported binary UUID and all seven MapboxCommon stack offsets. Resolve the app's initial location permission before mounting any Mapbox map or navigation view. This mitigates the first-grant path; it does **not** fix later permission changes while Mapbox services exist, including changes from Settings or system prompts. The current patch uses MapboxCommon **24.33.1**. Its provider-lookup function matches 24.33.0 after address normalization; that comparison does not prove whether callers were fixed. Treat the patch as unverified for later permission changes while the upstream issue remains open.

## Expo Integration

This library supports Expo through a config plugin. The plugin automates the configuration process for both Android and iOS.

### Automatic Prebuild Configuration

To enable automatic prebuild configuration, add the following to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "This app requires access to your location for navigation purposes.",
        "UIBackgroundModes": [
          "audio",
          "location"
        ]
      }
    },
    "android": {
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "FOREGROUND_SERVICE"
      ]
    },
    "plugins": [
      [
        "rn-nitro-mapbox-navigation",
        {
          "mapboxPublicToken": "<YOUR_MAPBOX_PUBLIC_TOKEN>",
          "mapboxDownloadsToken": "<YOUR_MAPBOX_DOWNLOADS_TOKEN>"
        }
      ]
    ]
  }
}
```

This will automatically configure the necessary settings for Mapbox integration when you run `npx expo prebuild`.

### Manual Configuration

* ### Ios

1. Place your secret token in a .netrc file in your OS root directory.

   ```
   machine api.mapbox.com
   login mapbox
   password <INSERT SECRET TOKEN>
   ```

2. For a bare React Native app, load the dependency helper in `ios/Podfile` after requiring `react_native_pods` and before autolinking:

   ```ruby
   require File.join(File.dirname(Pod::Executable.execute_command('node', ['--print', "require.resolve('rn-nitro-mapbox-navigation/package.json')"]).strip), 'ios/mapbox_dependencies')
   # Only when @rnmapbox/maps is installed:
   NitroMapboxNavigation.configure_maps
   ```

   Add `NitroMapboxNavigation.post_install(installer)` to the existing `post_install` block, after `react_native_post_install`. Do not add Mapbox pods or manually add a second Mapbox package version.

3. Install pods

   ```
   cd ios && pod install
   ```

4. Place your public token in your Xcode project's `Info.plist` and add a `MBXAccessToken` key whose value is your public access token.

5. Add the `UIBackgroundModes` key to `Info.plist` with `audio` and `location` if it is not already present. This will allow your app to deliver audible instructions while it is in the background or the device is locked.

   ```
   <key>UIBackgroundModes</key>
   <array>
     <string>audio</string>
     <string>location</string>
   </array>
   ```
5. Add NSLocationWhenInUseUsageDescription to `Info.plist` with a description of why your app needs access to the user's location.

   ```
   <key>NSLocationWhenInUseUsageDescription</key>
   <string>This app requires access to your location for navigation purposes.</string>
   ```
* ### Android Specific Instructions

1. Place your secret token in your android app's top level `gradle.properties` or `«USER_HOME»/.gradle/gradle.properties` file

   ```
   MAPBOX_DOWNLOADS_TOKEN=<YOUR_MAPBOX_DOWNLOADS_TOKEN>
   ```

2. Open up your _project-level_ `build.gradle` file. Declare the Mapbox Downloads API's `releases/maven` endpoint in the _allprojects_ `repositories` block.

   ```gradle
   allprojects {
       repositories {
           maven {
                 url 'https://api.mapbox.com/downloads/v2/releases/maven'
                 authentication {
                     basic(BasicAuthentication)
                 }
                 credentials {
                   // Do not change the username below.
                   // This should always be `mapbox` (not your username).
                     username = "mapbox"
                     // Use the secret token you stored in gradle.properties as the password
                     password = project.properties['MAPBOX_DOWNLOADS_TOKEN'] ?: ""
                 }
             }
       }
   }
   ```

3. Add Resources<br/>
   To do so create a new string resource file in your app module `(e.g. app/src/main/res/values/mapbox_access_token.xml)` with your public Mapbox API token:

   ```xml
   <?xml version="1.0" encoding="utf-8"?>
    <resources xmlns:tools="http://schemas.android.com/tools">
        <string name="mapbox_access_token" translatable="false" tools:ignore="UnusedResources">YOUR_MAPBOX_ACCESS_TOKEN</string>
    </resources>
   ```
4. Add the following permissions to your `AndroidManifest.xml` file:

   ```xml
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   ```

   For more details installation you can read the [Official docs of Mapbox](https://docs.mapbox.com/android/navigation/guides/installation).

## Usage

Here's a basic example of how to use the navigation view in your component:

```javascript
import { NitroMapboxNavigationView } from "rn-nitro-mapbox-navigation";

// ...

<NitroMapboxNavigationView
  style={{ flex: 1 }}
  origin={{
    longitude: 5.058566,
    latitude: 51.560985,
  }}
  destination={{
    longitude: 5.082325,
    latitude: 51.558588,
  }}
/>
```
Please refer to the [example](_media/App.tsx) and its [location permission gate](_media/LocationPermissionGate.tsx) for more detailed usage and configuration options.

## Docs

For detailed documentation please refer to the [docs](_media/globals.md) directory.

## Contributing

Contributions are welcome! Please see the [contributing guide](_media/CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

This project is licensed under the MIT License - see the [LICENSE](_media/LICENSE) file for details.
