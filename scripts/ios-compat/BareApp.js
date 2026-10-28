import LocationPermissionGate from './LocationPermissionGate';
import NavigationFixture from './NavigationFixture';

export default function App() {
  return (
    <LocationPermissionGate>
      <NavigationFixture />
    </LocationPermissionGate>
  );
}
