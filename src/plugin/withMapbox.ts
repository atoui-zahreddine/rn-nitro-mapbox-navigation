import {
  type ConfigPlugin,
  createRunOncePlugin,
  WarningAggregator,
  withProjectBuildGradle,
  withAndroidColors,
  withGradleProperties,
  withInfoPlist,
  withPodfile,
} from '@expo/config-plugins';

import {
  createGeneratedHeaderComment,
  mergeContents,
  removeGeneratedContents,
  type MergeResults,
} from './generateCode';
import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import type { ExpoConfig } from '@expo/config-types';

let pkg: { name: string; version?: string } = {
  name: 'rn-nitro-mapbox-navigation',
};
try {
  pkg = require('rn-nitro-mapbox-navigation');
} catch {
  // empty catch block
}

export type MapboxPlugProps = {
  mapboxPublicToken?: string;
  mapboxDownloadsToken?: string;
};

const copyMapboxAccessTokenXml = (
  config: ExpoConfig,
  args: MapboxPlugProps
): ExpoConfig => {
  if (!args.mapboxPublicToken) {
    console.warn(
      'Mapbox Access Token is missing. Please provide MapboxPublicToken.'
    );
    return config;
  }

  // Use withAndroidColors to add a string resource.
  // This is a convenient way to add XML resources to values/colors.xml,
  // but we will manually create a new file specifically for the token.
  return withAndroidColors(config, (androidConfig) => {
    const androidProjectRoot = androidConfig.modRequest.platformProjectRoot;
    const valuesDir = resolve(
      androidProjectRoot,
      'app',
      'src',
      'main',
      'res',
      'values'
    );
    const outputFilePath = resolve(valuesDir, 'mapbox_access_token.xml');

    // Ensure the values directory exists
    if (!existsSync(valuesDir)) {
      mkdirSync(valuesDir, { recursive: true });
    }

    // The content of the mapbox_access_token.xml file
    const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="mapbox_access_token">${args.mapboxPublicToken}</string>
</resources>
`;

    // Write the XML content to the file
    try {
      writeFileSync(outputFilePath, xmlContent);
    } catch (error) {
      console.error(`Error writing mapbox_access_token.xml: ${error}`);
    }

    return androidConfig;
  });
};

// Because we need the package to be added AFTER the React and Google maven packages, we create a new allprojects.
// It's ok to have multiple allprojects.repositories, so we create a new one since it's cheaper than tokenizing
// the existing block to find the correct place to insert our mapbox maven.
const gradleMaven = `
allprojects {
  repositories {
    maven {
      url 'https://api.mapbox.com/downloads/v2/releases/maven'
      authentication { basic(BasicAuthentication) }
      credentials {
        username = 'mapbox'
        password = project.properties['MAPBOX_DOWNLOADS_TOKEN'] ?: ""
      }
    }
  }
}
`;

// Fork of config-plugins mergeContents, but appends the contents to the end of the file.
const appendContents = ({
  src,
  newSrc,
  tag,
  comment,
}: {
  src: string;
  newSrc: string;
  tag: string;
  comment: string;
}): MergeResults => {
  const header = createGeneratedHeaderComment(newSrc, tag, comment);

  if (!src.includes(header)) {
    // Ensure the old generated contents are removed.
    const sanitizedTarget = removeGeneratedContents(src, tag);
    const contentsToAdd = [
      // @something
      header,
      // contents
      newSrc,
      // @end
      `${comment} @generated end ${tag}`,
    ].join('\n');

    return {
      contents: sanitizedTarget ?? src + contentsToAdd,
      didMerge: true,
      didClear: !!sanitizedTarget,
    };
  }

  return { contents: src, didClear: false, didMerge: false };
};

export const addMapboxMavenRepo = (src: string): string =>
  appendContents({
    tag: 'rn-nitro-mapbox-navigation',
    src,
    newSrc: gradleMaven,
    comment: '//',
  }).contents;

const withAndroidPropertiesDownloadToken: ConfigPlugin<MapboxPlugProps> = (
  config,
  { mapboxDownloadsToken }
) => {
  const key = 'MAPBOX_DOWNLOADS_TOKEN';

  if (mapboxDownloadsToken) {
    return withGradleProperties(config, (exportedConfig) => {
      exportedConfig.modResults = exportedConfig.modResults.filter(
        (item) => !(item.type === 'property' && item.key === key)
      );
      exportedConfig.modResults.push({
        type: 'property',
        key,
        value: mapboxDownloadsToken,
      });

      return exportedConfig;
    });
  }

  return config;
};
const withAndroidProjectGradle: ConfigPlugin<MapboxPlugProps> = (config) =>
  withProjectBuildGradle(config, ({ modResults, ...exportedConfig }) => {
    if (modResults.language !== 'groovy') {
      WarningAggregator.addWarningAndroid(
        'withMapbox',
        `Cannot automatically configure app build.gradle if it's not groovy`
      );

      return { modResults, ...exportedConfig };
    }

    modResults.contents = addMapboxMavenRepo(modResults.contents);

    return { modResults, ...exportedConfig };
  });

const withMapboxAndroid: ConfigPlugin<MapboxPlugProps> = (
  config,
  { mapboxPublicToken, mapboxDownloadsToken }
) => {
  config = withAndroidProjectGradle(config, {
    mapboxDownloadsToken,
  });
  config = withAndroidPropertiesDownloadToken(config, {
    mapboxDownloadsToken,
  });
  config = copyMapboxAccessTokenXml(config, {
    mapboxPublicToken,
  });

  return config;
};

export const addMapboxSPM = (src: string, withMaps: boolean): string => {
  const setup = [
    `require File.join(File.dirname(Pod::Executable.execute_command('node', ['--print', "require.resolve('rn-nitro-mapbox-navigation/package.json')"]).strip), 'ios/mapbox_dependencies')`,
    ...(withMaps ? ['NitroMapboxNavigation.configure_maps'] : []),
  ].join('\n');
  let contents = mergeContents({
    src,
    newSrc: setup,
    tag: 'nitro-mapbox-spm-setup',
    anchor: /^prepare_react_native_project!/m,
    offset: 0,
    comment: '#',
  }).contents;
  contents =
    removeGeneratedContents(contents, 'nitro-mapbox-spm-embed') ?? contents;
  const reactPostInstall =
    contents.match(/^[ \t]*react_native_post_install\([^\n]*\)[ \t]*$/m) ??
    contents.match(
      /^[ \t]*react_native_post_install\([\s\S]*?^[ \t]*\)[ \t]*$/m
    );
  if (!reactPostInstall) {
    throw new Error(
      'Mapbox SPM requires a react_native_post_install call in the Podfile.'
    );
  }
  contents = mergeContents({
    src: contents,
    newSrc: '    NitroMapboxNavigation.post_install(installer)',
    tag: 'nitro-mapbox-spm-embed',
    anchor: /^[ \t]*react_native_post_install\(/m,
    offset: reactPostInstall[0].split('\n').length,
    comment: '#',
  }).contents;
  return contents;
};

const withMapboxIOS: ConfigPlugin<MapboxPlugProps> = (
  config,
  { mapboxPublicToken }
) => {
  config = withPodfile(config, (podfileConfig) => {
    let withMaps = false;
    try {
      require.resolve('@rnmapbox/maps/package.json', {
        paths: [podfileConfig.modRequest.projectRoot],
      });
      withMaps = true;
    } catch {
      // The navigation view also works without @rnmapbox/maps.
    }
    podfileConfig.modResults.contents = addMapboxSPM(
      podfileConfig.modResults.contents,
      withMaps
    );
    return podfileConfig;
  });
  config = withInfoPlist(config, (iosConfig) => {
    if (!mapboxPublicToken) {
      WarningAggregator.addWarningIOS(
        'withMapbox',
        'Mapbox Public Token is missing. Please provide MapboxPublicToken.'
      );
      return iosConfig;
    }
    if (iosConfig.modResults.MBXAccessToken) return iosConfig;

    iosConfig.modResults.MBXAccessToken = mapboxPublicToken;
    return iosConfig;
  });

  return config;
};

const withMapbox: ConfigPlugin<MapboxPlugProps> = (
  config,
  { mapboxPublicToken, mapboxDownloadsToken }
) => {
  // Configure Android
  config = withMapboxAndroid(config, {
    mapboxPublicToken,
    mapboxDownloadsToken,
  });

  // Configure iOS
  config = withMapboxIOS(config, {
    mapboxPublicToken,
  });

  return config;
};

export default createRunOncePlugin(withMapbox, pkg.name, pkg.version);

// TODO: export internal functions for testing purposes
export { addMapboxMavenRepo as _addMapboxMavenRepo };
