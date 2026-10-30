import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Pass a generated consumer directory.');
const root = resolve(process.argv[2]);
const gradlePath = join(root, 'android/build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
if (!gradle.includes('https://api.mapbox.com/downloads/v2/releases/maven')) {
  gradle += `
allprojects {
  repositories {
    maven {
      url 'https://api.mapbox.com/downloads/v2/releases/maven'
      authentication { basic(BasicAuthentication) }
      credentials {
        username = 'mapbox'
        password = project.findProperty('MAPBOX_DOWNLOADS_TOKEN') ?: ''
      }
    }
  }
}
`;
  writeFileSync(gradlePath, gradle);
}
const manifestPath = join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
for (const name of [
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'FOREGROUND_SERVICE',
  'FOREGROUND_SERVICE_LOCATION',
]) {
  if (!manifest.includes(`android.permission.${name}"`)) {
    manifest = manifest.replace(
      '<application',
      `<uses-permission android:name="android.permission.${name}" />\n    <application`
    );
  }
}
writeFileSync(manifestPath, manifest);
const token =
  process.env.MAPBOX_PUBLIC_TOKEN || 'pk.compatibility-build-placeholder';
if (!token.startsWith('pk.'))
  throw new Error('MAPBOX_PUBLIC_TOKEN must be a public pk. token.');
const encoded = token
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
writeFileSync(
  join(root, 'android/app/src/main/res/values/mapbox_access_token.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="mapbox_access_token" translatable="false">${encoded}</string></resources>\n`
);
const localPath = join(root, 'android/local.properties');
if (!existsSync(localPath) && process.env.ANDROID_HOME) {
  writeFileSync(localPath, `sdk.dir=${process.env.ANDROID_HOME}\n`);
}
console.log(
  'Configured the consumer Android repository, permissions, and public token resource.'
);
