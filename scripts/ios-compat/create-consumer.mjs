import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    kind: { type: 'string', default: 'bare' },
    rn: { type: 'string', default: '0.88.1' },
    maps: { type: 'boolean', default: false },
    directory: { type: 'string' },
    tarball: { type: 'string' },
  },
});
if (
  !values.directory ||
  !values.tarball ||
  !['bare', 'expo'].includes(values.kind)
) {
  throw new Error(
    'Use --kind bare|expo --directory <new path> --tarball <packed library> [--rn 0.88.1] [--maps]'
  );
}
const directory = resolve(values.directory);
const tarball = resolve(values.tarball);
if (existsSync(directory) || !existsSync(tarball)) {
  throw new Error(
    'The consumer directory must be new and the tarball must exist.'
  );
}
const run = (command, args, cwd = dirname(directory)) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0)
    process.exit(result.status === null ? 1 : result.status);
};
if (values.kind === 'bare') {
  run('npx', [
    '--yes',
    '@react-native-community/cli@20.2.0',
    'init',
    'NitroNavigationConsumer',
    '--version',
    values.rn,
    '--skip-install',
    '--skip-git-init',
    '--directory',
    directory,
  ]);
} else {
  run('npx', [
    '--yes',
    'create-expo-app',
    directory,
    '--template',
    'expo-template-blank-typescript@58.0.29',
    '--no-install',
  ]);
}
const packagePath = join(directory, 'package.json');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
pkg.dependencies['react-native-nitro-modules'] = '0.37.1';
pkg.dependencies['rn-nitro-mapbox-navigation'] = `file:${tarball}`;
if (values.kind === 'expo') pkg.dependencies['expo-location'] = '~58.0.19';
else pkg.dependencies['react-native-permissions'] = '5.6.3';
if (values.maps) pkg.dependencies['@rnmapbox/maps'] = '10.3.16';
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
run(
  'npm',
  ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
  directory
);
const here = dirname(resolve(process.argv[1]));
let app = readFileSync(join(here, 'NavigationFixture.tsx'), 'utf8');
if (values.maps) {
  copyFileSync(join(here, 'MapFixture.js'), join(directory, 'MapFixture.tsx'));
  app =
    "import MapFixture from './MapFixture';\n" +
    app.replace(
      '{running && (',
      '{!running && <MapFixture />}\n      {running && ('
    );
}
writeFileSync(join(directory, 'NavigationFixture.tsx'), app);
if (values.kind === 'bare') {
  copyFileSync(
    resolve(here, '../../example/src/LocationPermissionGate.tsx'),
    join(directory, 'LocationPermissionGate.tsx')
  );
}
writeFileSync(
  join(directory, 'App.tsx'),
  readFileSync(
    join(here, values.kind === 'expo' ? 'ExpoApp.js' : 'BareApp.js'),
    'utf8'
  )
);
const publicToken =
  process.env.MAPBOX_PUBLIC_TOKEN || 'pk.compatibility-build-placeholder';
if (values.kind === 'expo') {
  const configPath = join(directory, 'app.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.expo.ios = {
    ...config.expo.ios,
    bundleIdentifier: 'com.bumbal.nitrocompat.expo',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Location is used to validate navigation.',
      UIBackgroundModes: ['audio', 'location'],
    },
  };
  config.expo.plugins = [
    ['rn-nitro-mapbox-navigation', { mapboxPublicToken: publicToken }],
  ];
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run(
    'node',
    [
      'node_modules/expo/bin/cli',
      'prebuild',
      '--platform',
      'ios',
      '--no-install',
    ],
    directory
  );
} else {
  const podfilePath = join(directory, 'ios/Podfile');
  let podfile = readFileSync(podfilePath, 'utf8');
  podfile = podfile.replace(
    'prepare_react_native_project!',
    `require File.join(File.dirname(Pod::Executable.execute_command('node', ['--print', "require.resolve('rn-nitro-mapbox-navigation/package.json')"]).strip), 'ios/mapbox_dependencies')\n${
      values.maps ? 'NitroMapboxNavigation.configure_maps\n' : ''
    }prepare_react_native_project!`
  );
  podfile = podfile.replace(
    'platform :ios, min_ios_version_supported',
    `require Pod::Executable.execute_command('node', ['-p', 'require.resolve("react-native-permissions/scripts/setup.rb", {paths: [process.argv[1]]})', __dir__]).strip
setup_permissions(['LocationWhenInUse'])
platform :ios, min_ios_version_supported`
  );
  const anchor = '      # :ccache_enabled => true\n    )';
  if (!podfile.includes(anchor))
    throw new Error('React Native template post_install changed.');
  podfile = podfile.replace(
    anchor,
    `${anchor}\n    NitroMapboxNavigation.post_install(installer)`
  );
  writeFileSync(podfilePath, podfile);
  const plistPath = join(directory, 'ios/NitroNavigationConsumer/Info.plist');
  run(
    'python3',
    [
      '-c',
      'import plistlib,sys; p=sys.argv[1]; d=plistlib.load(open(p,"rb")); d["MBXAccessToken"]=sys.argv[2]; d["NSLocationWhenInUseUsageDescription"]="Location is used to validate navigation."; plistlib.dump(d,open(p,"wb"))',
      plistPath,
      publicToken,
    ],
    directory
  );
}
writeFileSync(
  join(directory, 'ios/.xcode.env.local'),
  `export NODE_BINARY=${process.execPath}\n`
);
// Check the installed artifact, rather than the development checkout.
for (const path of [
  'ios/mapbox_dependencies.rb',
  'NitroMapboxNavigation.podspec',
  'nitrogen/generated/ios/NitroMapboxNavigation+autolinking.rb',
  'lib/commonjs/plugin/withMapbox.js',
]) {
  if (
    !existsSync(
      join(directory, 'node_modules/rn-nitro-mapbox-navigation', path)
    )
  )
    throw new Error(`Missing package file: ${path}`);
}
if (
  existsSync(
    join(
      directory,
      'node_modules/rn-nitro-mapbox-navigation/node_modules/react-native'
    )
  )
)
  throw new Error('The package contains a second React Native installation.');
const appRequire = createRequire(packagePath);
const libraryRequire = createRequire(
  join(directory, 'node_modules/rn-nitro-mapbox-navigation/package.json')
);
for (const name of ['react', 'react-native', 'react-native-nitro-modules']) {
  if (
    appRequire.resolve(`${name}/package.json`) !==
    libraryRequire.resolve(`${name}/package.json`)
  ) {
    throw new Error(
      `The consumer and navigation library resolve different copies of ${name}.`
    );
  }
}
console.log(
  `Consumer ready: ${directory}. Run pod install from its ios directory.`
);
