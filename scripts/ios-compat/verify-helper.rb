require 'minitest/autorun'
require 'tmpdir'
require 'xcodeproj'
require_relative '../../ios/mapbox_dependencies'

class MapboxDependencyHelperTest < Minitest::Test
  def test_upgrading_removes_unused_app_pins_and_keeps_other_packages
    Dir.mktmpdir do |directory|
      project = Xcodeproj::Project.new(File.join(directory, 'Consumer.xcodeproj'))
      app = project.new_target(:application, 'Consumer', :ios, '15.1')
      original_frameworks = app.frameworks_build_phase.files.length
      old_navigation = add_package(project, NitroMapboxNavigation::NAVIGATION_URL, '3.33.0')
      old_maps = add_package(project, 'https://github.com/mapbox/mapbox-maps-ios.git', '11.33.0')
      other = add_package(project, 'https://example.com/Other.git', '1.0.0')
      [old_navigation, old_maps].zip(%w[MapboxNavigationUIKit MapboxMaps]).each do |package, name|
        product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
        product.package = package
        product.product_name = name
        app.package_product_dependencies << product
        build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
        app.frameworks_build_phase.files << build_file
        build_file.product_ref = product
      end
      aggregate = Struct.new(:user_project, :user_targets, :pod_targets).new(project, [app], [Struct.new(:name).new('NitroMapboxNavigation')])
      installer = Struct.new(:pod_targets, :pods_project, :aggregate_targets).new([], project, [aggregate])
      2.times { NitroMapboxNavigation.post_install(installer) }
      assert_equal [other], project.root_object.package_references
      assert_empty app.package_product_dependencies
      assert_equal original_frameworks + 4, app.frameworks_build_phase.files.length
      assert_equal 1, app.copy_files_build_phases.length
      assert_equal 4, app.copy_files_build_phases.first.files.length
    end
  end

  def test_does_not_link_mapbox_into_an_unrelated_app
    Dir.mktmpdir do |directory|
      project = Xcodeproj::Project.new(File.join(directory, 'Consumer.xcodeproj'))
      consumer = project.new_target(:application, 'Consumer', :ios, '15.1')
      sibling = project.new_target(:application, 'Sibling', :ios, '15.1')
      original_frameworks = sibling.frameworks_build_phase.files.length
      aggregate_type = Struct.new(:user_project, :user_targets, :pod_targets)
      navigation = Struct.new(:name).new('NitroMapboxNavigation')
      aggregates = [aggregate_type.new(project, [consumer], [navigation]), aggregate_type.new(project, [sibling], [])]
      installer = Struct.new(:pod_targets, :pods_project, :aggregate_targets).new([], project, aggregates)
      NitroMapboxNavigation.post_install(installer)
      assert_equal 4, consumer.copy_files_build_phases.first.files.length
      assert_equal original_frameworks, sibling.frameworks_build_phase.files.length
      assert_empty sibling.copy_files_build_phases
    end
  end

  def test_keeps_a_package_still_used_by_another_target
    Dir.mktmpdir do |directory|
      project = Xcodeproj::Project.new(File.join(directory, 'Consumer.xcodeproj'))
      package = add_package(project, NitroMapboxNavigation::NAVIGATION_URL, '3.33.1')
      target = project.new_target(:framework, 'OtherConsumer', :ios, '15.1')
      product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
      product.package = package
      product.product_name = 'MapboxNavigationCore'
      target.package_product_dependencies << product
      NitroMapboxNavigation.remove_unused_app_packages(project)
      assert_equal [package], project.root_object.package_references
    end
  end

  def test_dependency_creation_skips_ids_already_used_by_spm_objects
    Dir.mktmpdir do |directory|
      project = Xcodeproj::Project.new(File.join(directory, 'Consumer.xcodeproj'))
      navigation = project.new_target(:static_library, 'NitroMapboxNavigation', :ios, '15.1')
      maps = project.new_target(:static_library, 'rnmapbox-maps', :ios, '15.1')
      existing = project.main_group.new_file('Preserve.swift')
      generate_uuid = project.method(:generate_uuid)
      candidates = [existing.uuid]
      project.define_singleton_method(:generate_uuid) { candidates.shift || generate_uuid.call }
      pod_project = project
      installer = Struct.new(:pod_targets, :pods_project, :aggregate_targets).new([], pod_project, [])
      NitroMapboxNavigation.post_install(installer)
      assert_same existing, project.objects_by_uuid[existing.uuid]
      assert_equal [navigation], maps.dependencies.map(&:target)
      assert_equal navigation.uuid, maps.dependencies.first.target_proxy.remote_global_id_string
      project.save
      Xcodeproj::Project.open(project.path)
    end
  end

  private

  def add_package(project, url, version)
    reference = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
    reference.repositoryURL = url
    reference.requirement = { 'kind' => 'exactVersion', 'version' => version }
    project.root_object.package_references << reference
    reference
  end
end
