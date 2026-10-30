require "json"
require_relative 'ios/mapbox_dependencies'

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NitroMapboxNavigation"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/atoui-zahreddine/rn-nitro-mapbox-navigation.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{swift}",
    "ios/**/*.{m,mm}",
    "cpp/**/*.{hpp,cpp}",
  ]

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  spm_dependency(s,
    url: NitroMapboxNavigation::NAVIGATION_URL,
    requirement: NitroMapboxNavigation::NAVIGATION_REQUIREMENT,
    products: ['MapboxNavigationUIKit', 'MapboxNavigationCore', 'MapboxDirections'])

  load 'nitrogen/generated/ios/NitroMapboxNavigation+autolinking.rb'
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
