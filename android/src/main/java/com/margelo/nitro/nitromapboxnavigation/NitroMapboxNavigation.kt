package com.margelo.nitro.nitromapboxnavigation

import android.view.View
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.uimanager.ThemedReactContext
import com.mapbox.api.directions.v5.DirectionsCriteria
import com.mapbox.geojson.Point

@DoNotStrip
class HybridNitroMapboxNavigation(val context: ThemedReactContext) : HybridNitroMapboxNavigationSpec() {

  // View
  override val view: View = NavigationView(context, this)

  override var origin: Coordinate = Coordinate(0.0, 0.0)
    set(value) {
      field = value
      val originPoint = Point.fromLngLat(
        value.longitude,
        value.latitude
      )
      (view as NavigationView).setOrigin(originPoint)
    }
  override var destination: Coordinate = Coordinate(0.0, 0.0)
    set(value) {
      field = value
      val destinationPoint = Point.fromLngLat(
        value.longitude,
        value.latitude
      )
      (view as NavigationView).setDestination(destinationPoint)
    }
  override var mute: Boolean? = null
    set(value) {
      field = value
      (view as NavigationView).setMute(value ?: false)
    }
  override var distanceUnit: DistanceUnitEnum? = null
    set(value) {
      field = value
      (view as NavigationView).distanceUnit = value.toString()
    }
  override var destinationTitle: String? = null
    set(value) {
      field = value
      (view as NavigationView).setDestinationTitle(value ?: "")
    }
  override var language: String? = null
    set(value) {
      field = value
      (view as NavigationView).setLocal(value ?: "")
    }
  override var travelMode: TravelModeEnum? = null
    set(value) {
      field = value
      val travelMode = when (value.toString().lowercase()) {
        "walking" -> DirectionsCriteria.PROFILE_WALKING
        "cycling" -> DirectionsCriteria.PROFILE_CYCLING
        "driving" -> DirectionsCriteria.PROFILE_DRIVING
        "driving-traffic" -> DirectionsCriteria.PROFILE_DRIVING_TRAFFIC
        else -> DirectionsCriteria.PROFILE_DRIVING
      }
      (view as NavigationView).setTravelMode(travelMode)
    }
  override var shouldSimulateRoute: Boolean? = null
  override var waypoints: Array<Waypoint>? = null
    set(value) {
      field = value
      val waypointsList = value?.map { waypoint ->
        Point.fromLngLat(waypoint.longitude, waypoint.latitude)
      } ?: emptyList()
      val waypointLegsList: List<Waypoint> = value?.map { waypoint ->
        Waypoint(
          waypoint.name,
          waypoint.separatesLegs,
          waypoint.latitude,
          waypoint.longitude,
        )
      } ?: emptyList()
      (view as NavigationView).setWaypointLegs(waypointLegsList)
      view.setWaypoints(waypointsList)
    }
  override var showsEndOfRouteFeedback: Boolean? = null
  override var showCancelButton: Boolean? = null
  override var hideStatusView: Boolean? = null
  override var onLocationChange: ((LocationData) -> Unit)?=null
  override var onRouteProgressChange: ((RouteProgress) -> Unit)?=null
  override var onCancel: (() -> Unit)?=null
  override var onError: ((Message) -> Unit)?=null
  override var onArrival: ((Coordinate) -> Unit)?=null
  override var onWaypointArrival: ((WaypointEvent) -> Unit)?=null

  override fun afterUpdate() {
    super.afterUpdate()
    (view as NavigationView).onPropsUpdated()
  }

}
