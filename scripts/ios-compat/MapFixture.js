import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import Mapbox from '@rnmapbox/maps';

const origin = [5.082325, 51.558588];

export default function MapFixture() {
  const [zoom, setZoom] = useState(14);
  const [nativeZoom, setNativeZoom] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(false);

  return (
    <View style={styles.map}>
      <Text>
        Map {loaded ? 'loaded' : 'loading'}: native zoom {nativeZoom.toFixed(1)}
        , marker {selected ? 'selected' : 'unselected'}
      </Text>
      <Button title="Zoom in" onPress={() => setZoom((value) => value + 1)} />
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Light}
        onDidFinishLoadingMap={() => setLoaded(true)}
        onMapIdle={(event) => setNativeZoom(event.properties.zoom)}
      >
        <Mapbox.Camera
          centerCoordinate={origin}
          zoomLevel={zoom}
          animationDuration={0}
        />
        <Mapbox.LocationPuck />
        <Mapbox.MarkerView id="test-origin" coordinate={origin}>
          <View style={styles.marker}>
            <Button title="Test marker" onPress={() => setSelected(true)} />
          </View>
        </Mapbox.MarkerView>
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  marker: { backgroundColor: 'white' },
});
