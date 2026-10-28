import React from 'react';
import { AppState, Button } from 'react-native';
import { act, create } from 'react-test-renderer';
import {
  check,
  openSettings,
  request,
  RESULTS,
} from 'react-native-permissions';
import LocationPermissionGate from '../../example/src/LocationPermissionGate';

jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    IOS: { LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE' },
    ANDROID: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
  },
  RESULTS: { DENIED: 'denied', BLOCKED: 'blocked', GRANTED: 'granted' },
  check: jest.fn(),
  request: jest.fn(),
  openSettings: jest.fn().mockResolvedValue(undefined),
}));

let tree;
let onAppStateChange;
const child = jest.fn(() => null);

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  child.mockClear();
  check.mockResolvedValue(RESULTS.DENIED);
  request.mockResolvedValue(RESULTS.DENIED);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    onAppStateChange = listener;
    return { remove: jest.fn() };
  });
});

afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

async function renderGate() {
  await act(async () => {
    tree = create(
      <LocationPermissionGate>
        {React.createElement(child)}
      </LocationPermissionGate>
    );
  });
}

async function press(title) {
  const button = tree.root
    .findAllByType(Button)
    .find((node) => node.props.title === title);
  await act(async () => button.props.onPress());
}

it('does not create Mapbox children while the initial permission check is pending', async () => {
  let resolve;
  check.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  await renderGate();
  expect(child).not.toHaveBeenCalled();
  await act(async () => resolve(RESULTS.GRANTED));
  expect(child).toHaveBeenCalledTimes(1);
});

it('keeps Mapbox children unmounted after permission is denied', async () => {
  await renderGate();
  await press('Grant location');
  expect(request).toHaveBeenCalled();
  expect(child).not.toHaveBeenCalled();
});

it('mounts Mapbox children only after a permission request succeeds', async () => {
  await renderGate();
  request.mockResolvedValue(RESULTS.GRANTED);
  expect(child).not.toHaveBeenCalled();
  await press('Grant location');
  expect(child).toHaveBeenCalledTimes(1);
});

it('opens Settings for blocked permission and rechecks on return', async () => {
  check.mockResolvedValue(RESULTS.BLOCKED);
  await renderGate();
  await press('Open Settings');
  expect(openSettings).toHaveBeenCalled();
  expect(child).not.toHaveBeenCalled();
  check.mockResolvedValue(RESULTS.GRANTED);
  await act(async () => onAppStateChange('active'));
  expect(child).toHaveBeenCalledTimes(1);
});

it('removes navigation when the foreground permission check reports revocation', async () => {
  check.mockResolvedValue(RESULTS.GRANTED);
  await renderGate();
  expect(tree.root.findAllByType(child)).toHaveLength(1);
  check.mockResolvedValue(RESULTS.DENIED);
  await act(async () => onAppStateChange('active'));
  expect(tree.root.findAllByType(child)).toHaveLength(0);
});

it('ignores an older permission check that finishes after a newer grant', async () => {
  await renderGate();
  let resolve;
  check.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  await act(async () => onAppStateChange('active'));
  request.mockResolvedValue(RESULTS.GRANTED);
  await press('Grant location');
  await act(async () => resolve(RESULTS.DENIED));
  expect(tree.root.findAllByType(child)).toHaveLength(1);
});
