import { useState } from 'react';
import { Button, SafeAreaView, Text } from 'react-native';
import { requestForegroundPermissionsAsync } from 'expo-location';
import NavigationFixture from './NavigationFixture';

export default function App() {
  const [permission, setPermission] = useState('undetermined');

  if (permission === 'granted') {
    return <NavigationFixture />;
  }

  return (
    <SafeAreaView>
      <Text>Grant location before creating a Mapbox map.</Text>
      <Text>Permission: {permission}</Text>
      <Button
        title="Grant location"
        onPress={async () => {
          const result = await requestForegroundPermissionsAsync();
          setPermission(result.status);
        }}
      />
    </SafeAreaView>
  );
}
