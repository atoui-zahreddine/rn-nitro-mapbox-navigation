import CoreLocation
import MapboxDirections
import MapboxNavigationCore
import MapboxNavigationUIKit
import NitroModules
import UIKit

extension UIView {
  var parentViewController: UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }
}

private class NavigationContainerView: UIView {
  weak var implementation: HybridNitroMapboxNavigation?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      // UIKit can detach and reattach this view while embedding the child controller.
      DispatchQueue.main.async { [weak self] in
        guard let self, self.window == nil else { return }
        self.implementation?.stopNavigation()
      }
    } else {
      implementation?.attachNavigation()
    }
  }
}

class HybridNitroMapboxNavigation: HybridNitroMapboxNavigationSpec,
  NavigationViewControllerDelegate
{
  // Mapbox permits only one provider in the process, including during view replacement.
  private static let provider = MapboxNavigationProvider(coreConfig: CoreConfig())
  private var provider: MapboxNavigationProvider { Self.provider }
  private var routeTask: Task<Void, Never>?
  private var routeRevision = 0
  private var routeNeedsUpdate = true
  private var navViewController: NavigationViewController?
  private var bottomBanner: BottomBannerViewController? {
    navViewController?.children.compactMap { $0 as? BottomBannerViewController }.first
  }
  private var topBanner: TopBannerViewController? {
    navViewController?.children.compactMap { $0 as? TopBannerViewController }.first
  }
  private var nextArrivalIndex = 0
  private var arrivalWaypoints: [(offset: Int, element: Waypoint)] = []
  private var arrivalDestination = Coordinate(latitude: 0, longitude: 0)

  var view: UIView

  override init() {
    let container = NavigationContainerView()
    view = container
    super.init()
    container.implementation = self
  }

  var onLocationChange: ((LocationData) -> Void)?
  var onRouteProgressChange: ((RouteProgress) -> Void)?
  var onCancel: (() -> Void)?
  var onError: ((Message) -> Void)?
  var onWaypointArrival: ((WaypointEvent) -> Void)?
  var onArrival: ((Coordinate) -> Void)?

  var origin = Coordinate(latitude: 0, longitude: 0) {
    didSet { routeNeedsUpdate = true }
  }
  var destination = Coordinate(latitude: 0, longitude: 0) {
    didSet { routeNeedsUpdate = true }
  }
  var destinationTitle: String? { didSet { routeNeedsUpdate = true } }
  var language: String? { didSet { routeNeedsUpdate = true } }
  var mute: Bool?
  var shouldSimulateRoute: Bool? { didSet { routeNeedsUpdate = true } }
  var showsEndOfRouteFeedback: Bool?
  var showCancelButton: Bool?
  var hideStatusView: Bool?
  var distanceUnit: DistanceUnitEnum? { didSet { routeNeedsUpdate = true } }
  var travelMode: TravelModeEnum? { didSet { routeNeedsUpdate = true } }
  var waypoints: [Waypoint]? { didSet { routeNeedsUpdate = true } }

  func afterUpdate() {
    MainActor.assumeIsolated { updateNavigation() }
  }

  func onDropView() {
    MainActor.assumeIsolated { stopNavigation() }
  }

  @MainActor
  func attachNavigation() {
    guard routeNeedsUpdate else { return }
    updateNavigation()
  }

  @MainActor
  private func updateNavigation() {
    guard view.window != nil, view.parentViewController != nil else { return }
    if routeNeedsUpdate {
      routeNeedsUpdate = false
      requestRoute()
    } else {
      applyInPlaceProps()
    }
  }

  @MainActor
  private func applyInPlaceProps() {
    provider.routeVoiceController.speechSynthesizer.muted = mute ?? false
    navViewController?.showsEndOfRouteFeedback = showsEndOfRouteFeedback ?? true
    bottomBanner?.cancelButton?.isHidden = !(showCancelButton ?? true)
    topBanner?.statusView.isHidden = hideStatusView ?? false
  }

  @MainActor
  private func requestRoute() {
    routeTask?.cancel()
    routeRevision += 1
    let revision = routeRevision
    let routeWaypoints = waypoints ?? []
    let routeDestination = destination
    var points = [
      MapboxDirections.Waypoint(
        coordinate: CLLocationCoordinate2D(
          latitude: origin.latitude, longitude: origin.longitude))
    ]
    for waypoint in routeWaypoints {
      var point = MapboxDirections.Waypoint(
        coordinate: CLLocationCoordinate2D(
          latitude: waypoint.latitude, longitude: waypoint.longitude), name: waypoint.name)
      point.separatesLegs = waypoint.separatesLegs ?? true
      points.append(point)
    }
    points.append(
      MapboxDirections.Waypoint(
        coordinate: CLLocationCoordinate2D(
          latitude: destination.latitude, longitude: destination.longitude), name: destinationTitle)
    )

    let profile: ProfileIdentifier
    switch travelMode {
    case .cycling: profile = .cycling
    case .walking: profile = .walking
    case .drivingTraffic: profile = .automobileAvoidingTraffic
    default: profile = .automobile
    }
    let options = NavigationRouteOptions(waypoints: points, profileIdentifier: profile)
    options.locale = Locale(identifier: language ?? "en")
    options.unitMeasurementSystem = distanceUnit == .imperial ? .imperial : .metric

    let provider = self.provider
    var config = provider.coreConfig
    config.locationSource = shouldSimulateRoute ?? false ? .simulation() : .live
    config.locale = options.locale
    if config != provider.coreConfig {
      provider.apply(coreConfig: config)
    }

    routeTask = Task { @MainActor [weak self] in
      do {
        let routes = try await provider.routingProvider().calculateRoutes(options: options).value
        guard !Task.isCancelled, let self, self.routeRevision == revision,
          self.view.window != nil, let parent = self.view.parentViewController
        else { return }
        self.nextArrivalIndex = 0
        self.arrivalWaypoints = routeWaypoints.enumerated().filter {
          $0.element.separatesLegs ?? true
        }
        self.arrivalDestination = routeDestination
        if self.navViewController != nil {
          // Replacing the controller would idle the shared Mapbox session on deinit.
          provider.tripSession().startActiveGuidance(with: routes, startLegIndex: 0)
          self.routeTask = nil
          self.applyInPlaceProps()
          return
        }
        let navigationOptions = NavigationOptions(
          mapboxNavigation: provider.mapboxNavigation,
          voiceController: provider.routeVoiceController,
          eventsManager: provider.eventsManager(),
          styles: [StandardDayStyle()],
          predictiveCacheManager: provider.predictiveCacheManager)
        provider.routeVoiceController.speechSynthesizer.muted = self.mute ?? false
        let controller = NavigationViewController(
          navigationRoutes: routes, navigationOptions: navigationOptions)
        controller.delegate = self
        parent.addChild(controller)
        self.view.addSubview(controller.view)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
          controller.view.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
          controller.view.trailingAnchor.constraint(equalTo: self.view.trailingAnchor),
          controller.view.topAnchor.constraint(equalTo: self.view.topAnchor),
          controller.view.bottomAnchor.constraint(equalTo: self.view.bottomAnchor),
        ])
        controller.didMove(toParent: parent)
        self.navViewController = controller
        self.routeTask = nil
        self.applyInPlaceProps()
      } catch {
        guard !Task.isCancelled, let self, self.routeRevision == revision else { return }
        self.routeTask = nil
        self.routeNeedsUpdate = true
        self.onError?(Message(message: error.localizedDescription))
      }
    }
  }

  private func removeController() {
    navViewController?.willMove(toParent: nil)
    navViewController?.view.removeFromSuperview()
    navViewController?.removeFromParent()
    navViewController = nil
  }

  @MainActor
  func stopNavigation() {
    routeTask?.cancel()
    routeTask = nil
    routeRevision += 1
    if navViewController != nil {
      removeController()
      provider.tripSession().setToIdle()
    }
    routeNeedsUpdate = true
  }

  func navigationViewController(
    _ navigationViewController: NavigationViewController,
    didUpdate progress: MapboxNavigationCore.RouteProgress,
    with location: CLLocation, rawLocation: CLLocation
  ) {
    onLocationChange?(
      LocationData(
        latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
        heading: location.course, accuracy: location.horizontalAccuracy.magnitude,
        timestamp: location.timestamp.timeIntervalSince1970))
    onRouteProgressChange?(
      RouteProgress(
        distanceTraveled: progress.distanceTraveled, durationRemaining: progress.durationRemaining,
        fractionTraveled: progress.fractionTraveled, distanceRemaining: progress.distanceRemaining))
  }

  func navigationViewController(
    _ navigationViewController: NavigationViewController,
    didArriveAt waypoint: MapboxDirections.Waypoint
  ) {
    // Preserve the requested stop order and coordinates across road snapping and reroutes.
    let arrivalIndex = nextArrivalIndex
    nextArrivalIndex += 1
    if arrivalWaypoints.indices.contains(arrivalIndex) {
      let (index, original) = arrivalWaypoints[arrivalIndex]
      onWaypointArrival?(
        WaypointEvent(
          name: original.name, index: Double(index),
          latitude: original.latitude, longitude: original.longitude))
    } else if arrivalIndex == arrivalWaypoints.count {
      onArrival?(arrivalDestination)
    }
  }

  func navigationViewControllerDidDismiss(
    _ navigationViewController: NavigationViewController, byCanceling canceled: Bool
  ) {
    MainActor.assumeIsolated { stopNavigation() }
    if canceled { onCancel?() }
  }
}
