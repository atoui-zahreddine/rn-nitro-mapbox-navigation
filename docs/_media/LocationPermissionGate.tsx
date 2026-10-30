import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  AppState,
  Button,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  check,
  openSettings,
  PERMISSIONS,
  request,
  RESULTS,
  type PermissionStatus,
} from 'react-native-permissions';

const locationPermission =
  Platform.OS === 'ios'
    ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
    : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

export default function LocationPermissionGate({
  children,
}: PropsWithChildren) {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [error, setError] = useState<string>();
  const latestRequest = useRef<symbol | undefined>(undefined);

  useEffect(() => {
    const refresh = async () => {
      const current = Symbol();
      latestRequest.current = current;
      try {
        const next = await check(locationPermission);
        if (latestRequest.current === current) {
          setStatus(next);
          setError(undefined);
        }
      } catch {
        if (latestRequest.current === current) {
          setStatus(null);
          setError('Could not check location permission.');
        }
      }
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      latestRequest.current = undefined;
      subscription.remove();
    };
  }, []);

  if (status === RESULTS.GRANTED) return children;

  const requestPermission = async () => {
    const current = Symbol();
    latestRequest.current = current;
    setStatus(null);
    setError(undefined);
    try {
      const next = await request(locationPermission);
      if (latestRequest.current === current) setStatus(next);
    } catch {
      if (latestRequest.current === current) {
        setError('Could not request location permission.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text>
        {error ??
          (status === null
            ? 'Checking location permission…'
            : 'Location permission is required for navigation.')}
      </Text>
      {status === RESULTS.BLOCKED ? (
        <Button title="Open Settings" onPress={() => openSettings()} />
      ) : status !== null || error ? (
        <Button title="Grant location" onPress={requestPermission} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
