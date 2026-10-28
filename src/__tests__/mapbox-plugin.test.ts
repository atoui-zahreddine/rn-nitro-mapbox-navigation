import { addMapboxSPM } from '../plugin/withMapbox';

const podfile = `require 'react_native_pods'
prepare_react_native_project!
target 'App' do
  use_expo_modules!
  config = use_native_modules!
  post_install do |installer|
    react_native_post_install(installer, config[:reactNativePath])
  end
end
`;

it('configures shared Maps before autolinking and embeds Mapbox for the app', () => {
  const result = addMapboxSPM(podfile, true);
  expect(result.indexOf('NitroMapboxNavigation.configure_maps')).toBeLessThan(
    result.indexOf('use_expo_modules!')
  );
  expect(result).toContain('ios/mapbox_dependencies');
  expect(result).toMatch(
    /post_install do \|installer\|[\s\S]*NitroMapboxNavigation.post_install\(installer\)/
  );
  expect(result.indexOf('NitroMapboxNavigation.post_install')).toBeGreaterThan(
    result.indexOf('react_native_post_install')
  );
  expect(addMapboxSPM(result, true)).toBe(result);
});

it('runs after a multiline React Native post-install call', () => {
  const multiline = podfile.replace(
    'react_native_post_install(installer, config[:reactNativePath])',
    `react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )`
  );
  const result = addMapboxSPM(multiline, true);
  expect(result.indexOf('NitroMapboxNavigation.post_install')).toBeGreaterThan(
    result.indexOf(':mac_catalyst_enabled => false,\n    )')
  );
  expect(addMapboxSPM(result, true)).toBe(result);
});

it('moves an existing hook after React Native without duplicating it', () => {
  const result = addMapboxSPM(podfile, true);
  const block = result.match(
    /# @generated begin nitro-mapbox-spm-embed[^]*?# @generated end nitro-mapbox-spm-embed/
  )?.[0];
  if (!block) throw new Error('Missing generated Mapbox hook');
  const old = result
    .replace(block, '')
    .replace('  post_install do |installer|', `$&\n${block}`);
  const migrated = addMapboxSPM(old, true);
  expect(
    migrated.indexOf('NitroMapboxNavigation.post_install')
  ).toBeGreaterThan(migrated.indexOf('react_native_post_install'));
  expect(migrated.match(/NitroMapboxNavigation.post_install/g)).toHaveLength(1);
});

it('supports navigation without rnmapbox and removes stale Maps setup', () => {
  const result = addMapboxSPM(addMapboxSPM(podfile, true), false);
  expect(result).not.toContain('NitroMapboxNavigation.configure_maps');
  expect(result).toContain('NitroMapboxNavigation.post_install(installer)');
  expect(addMapboxSPM(result, false)).toBe(result);
});
