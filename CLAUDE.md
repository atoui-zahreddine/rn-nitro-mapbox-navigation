# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React Native library (`rn-nitro-mapbox-navigation`) that wraps Mapbox Navigation SDK to provide a full turn-by-turn navigation view component. Built with **Nitro Modules** (not the legacy bridge or TurboModules). New Architecture (Fabric) only — no Old Architecture support.

- **iOS**: Mapbox Navigation 3.33.1 (`MapboxNavigationCore` and `MapboxNavigationUIKit`), Maps 11.33.1 via React Native's `spm_dependency` helper alongside CocoaPods (Swift)
- **Android**: Mapbox Navigation 3.12.2 via Gradle (Kotlin + C++ JNI bridge)
- **Package manager**: Yarn 3.6.1 (Berry). Do not use npm.
- **Node**: v24 (see `.nvmrc`)

## Repository Structure

Monorepo with Yarn workspaces:
- **Root**: The library itself (published to npm)
- **`example/`**: React Native example app that consumes the library via `workspace:^`
- **`src/`**: TypeScript source — `index.tsx` (entry), `NitroMapboxNavigation.nitro.ts` (Nitro spec defining all types/props/methods), `plugin/` (Expo config plugin)
- **`ios/`**: Single Swift file (`NitroMapboxNavigation.swift`) implementing `HybridNitroMapboxNavigationSpec`
- **`android/src/`**: Kotlin native implementation — `NitroMapboxNavigation.kt` (hybrid spec adapter), `NavigationView.kt` (~720 lines, main view logic), plus C++ JNI adapter and XML layout
- **`nitrogen/`**: Auto-generated bridge code (not committed, regenerated via `yarn nitrogen`)
- **`lib/`**: Build output from react-native-builder-bob (commonjs, module, typescript)

## Common Commands

```sh
yarn                    # Install dependencies
yarn nitrogen           # Generate Nitro bridge code (required before first build and after *.nitro.ts changes)
yarn prepare            # Full build: nitrogen + bob build + typedoc
yarn lint               # ESLint
yarn lint --fix         # ESLint with auto-fix
yarn typecheck          # TypeScript type checking
yarn test               # Jest tests
yarn clean              # Remove build artifacts
yarn docs               # Generate API docs with typedoc
```

### Running the Example App

```sh
yarn example start      # Start Metro bundler
yarn example ios        # Run on iOS
yarn example android    # Run on Android
```

### Native Code Editing

- **iOS**: Open `example/ios/NitroMapboxNavigationExample.xcworkspace` in Xcode. Library source is at `Pods > Development Pods > rn-nitro-mapbox-navigation`.
- **Android**: Open `example/android` in Android Studio. Library source is under `rn-nitro-mapbox-navigation`.

## Architecture

### Nitro Modules Bridge

The API surface is defined in `src/NitroMapboxNavigation.nitro.ts`. This is a **Nitro View** (not a plain module). Nitrogen generates:
- Shared C++ specs in `nitrogen/generated/shared/`
- iOS Swift/C++ bridge in `nitrogen/generated/ios/`
- Android Kotlin/C++/JNI bridge in `nitrogen/generated/android/`

The nitro spec defines:
- **Types**: `Coordinate`, `Waypoint`, `WaypointEvent`, `LocationData`, `RouteProgress`, `Message`
- **Enums**: `TravelModeEnum`, `DistanceUnitEnum`
- **Props**: origin, destination, waypoints, mute, distanceUnit, language, travelMode, shouldSimulateRoute, event callbacks (onLocationChange, onRouteProgressChange, onCancel, onError, onArrival, onWaypointArrival)
- **Methods**: Currently none beyond base `HybridViewMethods`

When modifying the API, edit the `.nitro.ts` file then run `yarn nitrogen` to regenerate bridge code. Native implementations must conform to the generated spec classes.

### Native Implementations

**iOS** (`ios/NitroMapboxNavigation.swift`): `HybridNitroMapboxNavigation` extends the generated spec. A shared `MapboxNavigationProvider` owns the v3 core, routing, voice, and events. Routes come from `routingProvider().calculateRoutes(options:)` and are displayed by `NavigationViewController(navigationRoutes:navigationOptions:)` with the SDK's default banners. `NavigationContainerView` manages embedding and cleanup; transient UIKit window detachment must not stop guidance. Route changes update the existing trip session. Keep the single day style selected for this integration.

When changing iOS navigation, follow Mapbox's [v3 UI guide](https://docs.mapbox.com/ios/navigation/guides/turn-by-turn-navigation/user-interface/) and [v3 migration guide](https://docs.mapbox.com/ios/navigation/v3/guides/migrate-to-v3-ui/). `NavigationViewController` remains the supported v3 drop-in UI; do not reintroduce v2 `NavigationService`, `NavigationSettings.shared`, or `Directions.shared` routing.

**Android** (`android/src/main/java/.../NavigationView.kt`): The main implementation. Extends `FrameLayout` with `ViewBinding` (`navigation_view.xml`). Manages `MapboxNavigation`, camera, route rendering, maneuver view, trip progress card, voice instructions, and all navigation observers.

### Expo Config Plugin

`src/plugin/withMapbox.ts` provides automatic Expo prebuild configuration:
- Android: Adds Mapbox Maven repo, sets `MAPBOX_DOWNLOADS_TOKEN`, creates `mapbox_access_token.xml`
- iOS: Adds `MBXAccessToken` to Info.plist

## Conventions

- **Commit messages**: Conventional commits enforced by commitlint (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
- **Pre-commit hooks**: Lefthook runs ESLint + TypeScript checks on staged files
- **Prettier**: Single quotes, 2-space indent, ES5 trailing commas, consistent quote props
- **Releases**: Automated via semantic-release on push to `main`
