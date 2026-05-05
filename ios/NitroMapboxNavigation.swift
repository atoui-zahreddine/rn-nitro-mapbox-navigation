import MapboxCoreNavigation
import MapboxNavigation
import MapboxDirections
import UIKit
import NitroModules

public struct WaypointLegs {
  let index: Int
  let name: String
}

// MARK: - Extension to find the parent view controller
extension UIView {
  var parentViewController: UIViewController? {
    var parentResponder: UIResponder? = self
    while parentResponder != nil {
      parentResponder = parentResponder!.next
      if let viewController = parentResponder as? UIViewController {
        return viewController
      }
    }
    return nil
  }
}
// Your CustomUIView (no changes needed here for the fix)
class CustomUIView: UIView {
  private var implementation: HybridNitroMapboxNavigation!

  init(with implementation: HybridNitroMapboxNavigation) {
    self.implementation = implementation
    super.init(frame: .zero)  // Call super's initializer
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
  }

  public override func removeFromSuperview() {
    super.removeFromSuperview()
    let impl = self.implementation
    impl?.navViewController?.removeFromParent()

    (impl != nil)
      ? NotificationCenter.default.removeObserver(
        impl!, name: .navigationSettingsDidChange, object: nil) : nil
  }
}

class HybridNitroMapboxNavigation: HybridNitroMapboxNavigationSpec,
  NavigationViewControllerDelegate
{
  
  

  var view: UIView = UIView()

  override init() {
    super.init()
    self.view = CustomUIView(with: self)
  }

  internal var onLocationChange: ((LocationData) -> Void)?
  internal var onRouteProgressChange: ((RouteProgress) -> Void)?
  internal var onCancel: (() -> Void)? = nil
  internal var onError: ((Message) -> Void)? = nil
  internal var onWaypointArrival: ((WaypointEvent) -> Void)? = nil
  internal var onArrival: ((Coordinate) -> Void)? = nil


  var origin: Coordinate = Coordinate(latitude: 0, longitude: 0) {
    didSet { routeNeedsUpdate = true }
  }
  var destination: Coordinate = Coordinate(latitude: 0, longitude: 0) {
    didSet { routeNeedsUpdate = true }
  }
  var destinationTitle: String?
  var language: String?
  var mute: Bool?
  var shouldSimulateRoute: Bool?
  var showsEndOfRouteFeedback: Bool?
  var showCancelButton: Bool?
  var hideStatusView: Bool?
  var distanceUnit: DistanceUnitEnum?
  var travelMode: TravelModeEnum? {
    didSet { routeNeedsUpdate = true }
  }
  var waypoints: [Waypoint]? {
    didSet { routeNeedsUpdate = true }
  }

  public weak var navViewController: NavigationViewController?

  var embedded: Bool = false
  var embedding: Bool = false
  var isInitialized: Bool = false
  var routeNeedsUpdate: Bool = false

  public func dismissNavigationViewController() {
    self.navViewController?.dismiss(
      animated: true,
      completion: {
        self.navViewController?.removeFromParent()
        self.navViewController?.view.removeFromSuperview()
        self.navViewController = nil
      })
  }

  func afterUpdate() {
    if embedding {
      return
    }

    if !isInitialized {
      isInitialized = true
      embed()
      return
    }

    if routeNeedsUpdate {
      routeNeedsUpdate = false
      embed()
    } else {
      applyInPlaceProps()
    }
  }

  func applyInPlaceProps() {
    NavigationSettings.shared.voiceMuted = mute ?? false
    NavigationSettings.shared.distanceUnit =
      distanceUnit?.stringValue == "imperial" ? .mile : .kilometer
    guard let vc = navViewController else { return }
    vc.showsEndOfRouteFeedback = showsEndOfRouteFeedback ?? true
    StatusView.appearance().isHidden = hideStatusView ?? false
  }

  public func embed() {
    if (embedding) {
      return
    }
    embedding = true

    let originWaypoint = MapboxDirections.Waypoint(
      coordinate: CLLocationCoordinate2D(latitude: origin.latitude, longitude: origin.longitude))
    var waypointsArray = [originWaypoint]
    // transform waypoints to Mapbox Directions Waypoint
    for waypoint in waypoints ?? [] {

      let mapboxWaypoint = MapboxDirections.Waypoint(
        coordinate: CLLocationCoordinate2D(
          latitude: waypoint.latitude, longitude: waypoint.longitude), name: waypoint.name)
      waypointsArray.append(mapboxWaypoint)

    }
    let destinationWaypoint: MapboxDirections.Waypoint = MapboxDirections.Waypoint(
      coordinate: CLLocationCoordinate2D(
        latitude: destination.latitude, longitude: destination.longitude), name: destinationTitle)

    waypointsArray.append(destinationWaypoint)

    var profile: ProfileIdentifier = .automobile
    if travelMode != nil {
      switch travelMode! {
      case TravelModeEnum.cycling:
        profile = .cycling
      case TravelModeEnum.walking:
        profile = .walking
      case TravelModeEnum.drivingTraffic:
        profile = .automobileAvoidingTraffic
      default:
        profile = .automobile
      }
    }

    let options = NavigationRouteOptions(waypoints: waypointsArray, profileIdentifier: profile)
    let locale = self.language?.replacingOccurrences(of: "-", with: "_") ?? "en"
    options.locale = Locale(identifier: locale)
    options.distanceMeasurementSystem =
      distanceUnit?.stringValue == "imperial"
      ? MeasurementSystem.imperial : MeasurementSystem.metric
    Directions.shared.calculateRoutes(options: options) { [weak self] result in
      guard let strongSelf = self, let parentVC = strongSelf.view.parentViewController else {
        return
      }
      switch result {
      case .success(let response):
        let navigationOptions = NavigationOptions(
          simulationMode: strongSelf.shouldSimulateRoute ?? false ? .always : .never)
        strongSelf.navViewController?.view.removeFromSuperview()
        strongSelf.navViewController?.removeFromParent()
        strongSelf.navViewController = nil
        let vc = NavigationViewController(for: response, navigationOptions: navigationOptions)
        vc.showsEndOfRouteFeedback = strongSelf.showsEndOfRouteFeedback ?? true
        StatusView.appearance().isHidden = strongSelf.hideStatusView ?? false
        NavigationSettings.shared.voiceMuted = strongSelf.mute ?? false
        NavigationSettings.shared.distanceUnit =
          strongSelf.distanceUnit?.stringValue == "imperial" ? .mile : .kilometer
        vc.delegate = strongSelf
        parentVC.addChild(vc)
        strongSelf.view.addSubview(vc.view)
        vc.view.frame = strongSelf.view.bounds
        vc.didMove(toParent: parentVC)
        strongSelf.navViewController = vc

        strongSelf.embedded = true
        strongSelf.embedding = false
      case .failure(let error):
        strongSelf.onError?(Message(message: error.localizedDescription))
      }
    }
  }

  // MARK: - NavigationViewControllerDelegate
  public func navigationViewController(
    _ navigationViewController: NavigationViewController, didUpdate progress: RouteProgress,
    with location: CLLocation, rawLocation: CLLocation
  ) {
    let locationObject = LocationData(
      latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
      heading: location.course, accuracy: location.horizontalAccuracy.magnitude,
      timestamp: location.timestamp.timeIntervalSince1970)
    onLocationChange?(locationObject)
    let routeProgress = RouteProgress(
      distanceTraveled: progress.distanceTraveled,
      durationRemaining: progress.durationRemaining,
      fractionTraveled: progress.fractionTraveled,
      distanceRemaining: progress.distanceRemaining
    )

    onRouteProgressChange?(routeProgress)
  }

  public func navigationViewController(
    _ navigationViewController: NavigationViewController,
    didArriveAt waypoint: MapboxDirections.Waypoint
  ) -> Bool {

    // Use small tolerance for coordinate comparison to handle precision differences
    let latDiff = Swift.abs(waypoint.coordinate.latitude - destination.latitude)
    let lngDiff = Swift.abs(waypoint.coordinate.longitude - destination.longitude)
    // Use a tolerance of about 1 meter (0.00001 degrees ≈ 1.1 meters)
    if latDiff < 0.00001 && lngDiff < 0.00001
    {
      // Return original destination coordinates instead of SDK processed coordinates
      let waypointData = Coordinate(
        latitude: destination.latitude, longitude: destination.longitude)
      onArrival?(waypointData)
    } else {
      // Find the original waypoint using tolerance-based coordinate comparison
      let waypointIndex =
        waypoints?.firstIndex(where: { originalWaypoint in
          let latDiff = Swift.abs(originalWaypoint.latitude - waypoint.coordinate.latitude)
          let lngDiff = Swift.abs(originalWaypoint.longitude - waypoint.coordinate.longitude)
          // Use a tolerance of about 1 meter (0.00001 degrees ≈ 1.1 meters)
          return latDiff < 0.00001 && lngDiff < 0.00001
        }) ?? -1
      
      if waypointIndex != -1, let originalWaypoint = waypoints?[waypointIndex] {
        // Return original waypoint coordinates instead of SDK processed coordinates
        let waypointData = WaypointEvent(
          name: waypoint.name,
          index: Double(waypointIndex),
          latitude: originalWaypoint.latitude,
          longitude: originalWaypoint.longitude,
        )
        onWaypointArrival?(waypointData)
      }
    }
    return true
  }

  func navigationViewControllerDidCancelNavigation(
    _ navigationViewController: NavigationViewController
  ) {
    navigationViewController.dismiss(animated: true, completion: nil)
  }
  public func navigationViewControllerDidDismiss(
    _ navigationViewController: NavigationViewController, byCanceling canceled: Bool
  ) {
    if (!canceled) { return }

    onCancel?()
    navigationViewController.dismiss(
      animated: true,
      completion: {
        self.dismissNavigationViewController()
      })
  }
}
