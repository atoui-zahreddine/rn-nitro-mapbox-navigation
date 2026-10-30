module NitroMapboxNavigation
  NAVIGATION_URL = 'https://github.com/mapbox/mapbox-navigation-ios.git'.freeze
  NAVIGATION_REQUIREMENT = {kind: 'exactVersion', version: '3.33.1'}.freeze
  BINARY_FRAMEWORKS = %w[MapboxCommon MapboxCoreMaps MapboxNavigationNative Turf].freeze

  def self.configure_maps
    $RNMapboxMapsVersion = '= 11.33.1'
    $RNMapboxMapsSwiftPackageManager = 'manual'
  end

  def self.post_install(installer)
    conflicting = installer.pod_targets.map(&:name) & [
      'MapboxMaps', 'MapboxCommon', 'MapboxCoreMaps', 'MapboxNavigation',
      'MapboxCoreNavigation', 'MapboxNavigationNative', 'Turf'
    ]
    unless conflicting.empty?
      raise "Mapbox must use one SPM dependency graph. Remove CocoaPods dependencies: #{conflicting.join(', ')}. Call NitroMapboxNavigation.configure_maps before use_native_modules! when using @rnmapbox/maps."
    end

    navigation = installer.pods_project.targets.find { |t| t.name == 'NitroMapboxNavigation' }
    maps = installer.pods_project.targets.find { |t| t.name == 'rnmapbox-maps' }
    if maps
      # One archive owns the SPM objects. Linking MapboxMaps into both wrappers duplicates its symbols.
      add_navigation_dependency(installer.pods_project, maps, navigation)
      maps.build_configurations.each do |config|
        %w[SWIFT_INCLUDE_PATHS FRAMEWORK_SEARCH_PATHS].each do |key|
          values = Array(config.build_settings[key] || '$(inherited)')
          values << '$(PODS_CONFIGURATION_BUILD_DIR)' unless values.include?('$(PODS_CONFIGURATION_BUILD_DIR)')
          config.build_settings[key] = values
        end
        flags = Array(config.build_settings['OTHER_SWIFT_FLAGS'] || '$(inherited)')
        flags << '-D RNMBX_11' unless flags.include?('-D RNMBX_11')
        config.build_settings['OTHER_SWIFT_FLAGS'] = flags
      end
    end

    installer.aggregate_targets.group_by(&:user_project).each do |project, aggregates|
      consumers = aggregates.select { |aggregate| aggregate.pod_targets.any? { |pod| pod.name == 'NitroMapboxNavigation' } }
      consumers.flat_map(&:user_targets).uniq.each do |target|
        next unless target.product_type == 'com.apple.product-type.application'
        remove_app_products(target)
        embed_binary_frameworks(project, target)
      end
      remove_unused_app_packages(project)
      project.save
    end
  end

  def self.add_navigation_dependency(project, maps, navigation)
    return if maps.dependencies.any? { |dependency| dependency.target == navigation }

    proxy = new_project_object(project, Xcodeproj::Project::Object::PBXContainerItemProxy)
    proxy.container_portal = project.root_object.uuid
    proxy.proxy_type = Xcodeproj::Constants::PROXY_TYPES[:native_target]
    proxy.remote_global_id_string = navigation.uuid
    proxy.remote_info = navigation.name

    dependency = new_project_object(project, Xcodeproj::Project::Object::PBXTargetDependency)
    dependency.name = navigation.name
    dependency.target = navigation
    dependency.target_proxy = proxy
    maps.dependencies << dependency
  end

  def self.new_project_object(project, klass)
    # CocoaPods' fast UUID generator can reuse IDs after SPM modifies the project.
    uuid = project.generate_uuid
    uuid = project.generate_uuid while project.objects_by_uuid.key?(uuid)
    object = klass.new(project, uuid)
    object.initialize_defaults
    object
  end

  def self.remove_unused_app_packages(project)
    used = project.objects.grep(Xcodeproj::Project::Object::XCSwiftPackageProductDependency).map(&:package)
    urls = [NAVIGATION_URL, 'https://github.com/mapbox/mapbox-maps-ios.git']
    project.root_object.package_references.to_a.each do |reference|
      next unless reference.respond_to?(:repositoryURL) && urls.include?(reference.repositoryURL)
      reference.remove_from_project unless used.include?(reference)
    end
  end

  def self.remove_app_products(target)
    target.package_product_dependencies.to_a.each do |reference|
      next unless ['MapboxNavigationUIKit', 'MapboxNavigationCore', 'MapboxDirections', 'MapboxMaps'].include?(reference.product_name)
      target.frameworks_build_phase.files.to_a.each do |file|
        file.remove_from_project if file.product_ref == reference
      end
      reference.remove_from_project
    end
  end

  def self.embed_binary_frameworks(project, target)
    group = project.main_group.find_subpath('Mapbox SPM Frameworks', true)
    phase = target.copy_files_build_phases.find { |p| p.name == 'Embed Mapbox SPM Frameworks' }
    unless phase
      phase = target.new_copy_files_build_phase('Embed Mapbox SPM Frameworks')
      phase.dst_subfolder_spec = '10'
    end
    BINARY_FRAMEWORKS.each do |name|
      path = "#{name}.framework"
      reference = group.files.find { |f| f.path == path }
      unless reference
        reference = group.new_file(path, :built_products)
        reference.last_known_file_type = 'wrapper.framework'
      end
      unless target.frameworks_build_phase.files.any? { |f| f.file_ref == reference }
        target.frameworks_build_phase.add_file_reference(reference, true)
      end
      unless phase.files.any? { |f| f.file_ref == reference }
        file = phase.add_file_reference(reference, true)
        file.settings = {'ATTRIBUTES' => ['CodeSignOnCopy', 'RemoveHeadersOnCopy']}
      end
    end
  end
end
