import { View, StyleSheet, StatusBar, Button } from 'react-native';

import { useState } from 'react';
import LocationPermissionGate from './LocationPermissionGate';
import {
  NitroMapboxNavigationView,
  type Coordinate,
  type LocationData,
  type RouteProgress,
  type WaypointEvent,
} from 'rn-nitro-mapbox-navigation';
import { callback } from 'react-native-nitro-modules';

export default function App() {
  return (
    <LocationPermissionGate>
      <NavigationExample />
    </LocationPermissionGate>
  );
}

function NavigationExample() {
  const [navigating, setNavigating] = useState(true);

  if (!navigating) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Button title="Start navigation" onPress={() => setNavigating(true)} />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <NitroMapboxNavigationView
          style={styles.mapboxView}
          shouldSimulateRoute={true}
          mute={true}
          origin={{
            longitude: 5.082325,
            latitude: 51.558588,
          }}
          destination={{
            longitude: 5.058566,
            latitude: 51.560985,
          }}
          onLocationChange={callback((event: LocationData) => {
            console.log('Location changed:', event);
          })}
          onCancel={callback(() => {
            setNavigating(false);
            console.log('Navigation cancelled');
          })}
          onArrival={callback((coordinates: Coordinate) => {
            console.log('Arrived at destination:', coordinates);
          })}
          onWaypointArrival={callback((event: WaypointEvent) => {
            console.log('Arrived at waypoint:', event);
          })}
          onRouteProgressChange={callback((event: RouteProgress) => {
            console.log('Route progress changed:', event);
          })}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: { justifyContent: 'center' },
  mapboxView: {
    flex: 1,
  },
});
