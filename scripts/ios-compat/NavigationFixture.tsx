import { useState } from 'react';
import {
  Button,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { callback } from 'react-native-nitro-modules';
import { NitroMapboxNavigationView } from 'rn-nitro-mapbox-navigation';

const origin = { latitude: 51.558588, longitude: 5.082325 };
const destinations = {
  normal: { latitude: 51.560985, longitude: 5.058566 },
  changed: { latitude: 51.564, longitude: 5.086 },
  short: { latitude: 51.558695, longitude: 5.08222 },
  error: { latitude: 0, longitude: 0 },
};

export default function App() {
  const [running, setRunning] = useState(false);
  const [route, setRoute] = useState<keyof typeof destinations>('normal');
  const [progress, setProgress] = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const [arrivals, setArrivals] = useState(0);
  const [errors, setErrors] = useState(0);
  const [lastError, setLastError] = useState<string>();
  const [cancellations, setCancellations] = useState(0);

  const start = (next: keyof typeof destinations) => {
    setRoute(next);
    setProgress(0);
    setDistanceTraveled(0);
    setLastError(undefined);
    setRunning(true);
  };

  return (
    <SafeAreaView style={styles.root}>
      <Text testID="navigation-status">
        {running ? 'Running' : 'Stopped'} {route}: progress {progress}, arrivals{' '}
        {arrivals}, errors {errors}, cancellations {cancellations}, traveled{' '}
        {distanceTraveled.toFixed(0)}m
      </Text>
      {lastError ? <Text testID="navigation-error">{lastError}</Text> : null}
      <View style={styles.controls}>
        <Button title="Start" onPress={() => start('normal')} />
        <Button title="Stop" onPress={() => setRunning(false)} />
        <Button title="Change route" onPress={() => start('changed')} />
        <Button title="Short route" onPress={() => start('short')} />
        <Button title="Route error" onPress={() => start('error')} />
      </View>
      {running && (
        <NitroMapboxNavigationView
          style={styles.navigation}
          origin={origin}
          destination={destinations[route]}
          shouldSimulateRoute={true}
          mute={true}
          onRouteProgressChange={callback((event) => {
            setProgress((n) => n + 1);
            setDistanceTraveled(event.distanceTraveled);
          })}
          onCancel={callback(() => {
            setCancellations((n) => n + 1);
            setRunning(false);
          })}
          onArrival={callback(() => {
            setArrivals((n) => n + 1);
            setRunning(false);
          })}
          onError={callback((error) => {
            setLastError(error.message);
            setErrors((n) => n + 1);
            setRunning(false);
          })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  },
  controls: { flexDirection: 'row', flexWrap: 'wrap' },
  navigation: { flex: 1 },
});
