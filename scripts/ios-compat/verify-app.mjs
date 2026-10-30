import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const products = process.argv[2];
if (!products)
  throw new Error('Pass the Release-iphonesimulator products directory.');
const apps = readdirSync(products).filter((path) => path.endsWith('.app'));
if (apps.length !== 1)
  throw new Error(`Expected one consumer app, found ${apps.length}.`);
const app = join(products, apps[0]);
for (const name of [
  'MapboxCommon',
  'MapboxCoreMaps',
  'MapboxNavigationNative',
  'Turf',
]) {
  if (!existsSync(join(app, 'Frameworks', `${name}.framework`, name)))
    throw new Error(`Missing embedded framework: ${name}`);
}
for (const name of [
  'MapboxMaps_MapboxMaps',
  'MapboxNavigation_MapboxNavigationCore',
  'MapboxNavigation_MapboxNavigationUIKit',
]) {
  if (!existsSync(join(app, `${name}.bundle`)))
    throw new Error(`Missing Mapbox resources: ${name}`);
}
if (!existsSync(join(app, 'main.jsbundle')))
  throw new Error('Release JS bundle is missing.');
console.log(
  `Verified Mapbox binaries, resources, and Release JS bundle: ${app}`
);
