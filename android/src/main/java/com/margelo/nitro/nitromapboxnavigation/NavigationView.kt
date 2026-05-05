package com.margelo.nitro.nitromapboxnavigation

import android.annotation.SuppressLint
import android.content.res.Configuration
import android.content.res.Resources
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.uimanager.ThemedReactContext
import com.mapbox.api.directions.v5.DirectionsCriteria
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.ImageHolder
import com.mapbox.maps.plugin.LocationPuck2D
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.extensions.applyLanguageAndVoiceUnitOptions
import com.mapbox.navigation.base.formatter.DistanceFormatterOptions
import com.mapbox.navigation.base.formatter.UnitType
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.base.trip.model.RouteLegProgress
import com.mapbox.navigation.base.trip.model.RouteProgress
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import com.mapbox.navigation.core.arrival.ArrivalObserver
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.formatter.MapboxDistanceFormatter
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import com.mapbox.navigation.tripdata.maneuver.api.MapboxManeuverApi
import com.mapbox.navigation.tripdata.progress.api.MapboxTripProgressApi
import com.mapbox.navigation.tripdata.progress.model.*
import com.mapbox.navigation.ui.base.util.MapboxNavigationConsumer
import com.mapbox.navigation.ui.components.maneuver.model.ManeuverPrimaryOptions
import com.mapbox.navigation.ui.components.maneuver.model.ManeuverSecondaryOptions
import com.mapbox.navigation.ui.components.maneuver.model.ManeuverSubOptions
import com.mapbox.navigation.ui.components.maneuver.model.ManeuverViewOptions
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.camera.lifecycle.NavigationBasicGesturesHandler
import com.mapbox.navigation.ui.maps.camera.state.NavigationCameraState
import com.mapbox.navigation.ui.maps.camera.transition.NavigationCameraTransitionOptions
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider
import com.mapbox.navigation.ui.maps.route.RouteLayerConstants
import com.mapbox.navigation.ui.maps.route.arrow.api.MapboxRouteArrowApi
import com.mapbox.navigation.ui.maps.route.arrow.api.MapboxRouteArrowView
import com.mapbox.navigation.ui.maps.route.arrow.model.RouteArrowOptions
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineApiOptions
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineViewOptions
import com.mapbox.navigation.ui.maps.route.line.model.RouteLineColorResources
import com.mapbox.navigation.voice.api.MapboxSpeechApi
import com.mapbox.navigation.voice.api.MapboxVoiceInstructionsPlayer
import com.mapbox.navigation.voice.model.SpeechAnnouncement
import com.mapbox.navigation.voice.model.SpeechVolume
import com.margelo.nitro.nitromapboxnavigation.databinding.NavigationViewBinding
import java.util.*

class NavigationView(context: ThemedReactContext, private var implementation: HybridNitroMapboxNavigation?) :
  FrameLayout(context), LifecycleEventListener {

  private companion object {
    private const val BUTTON_ANIMATION_DURATION = 1500L
    private const val TAG = "MapboxNavigationView"
  }

  private val binding: NavigationViewBinding = NavigationViewBinding.inflate(LayoutInflater.from(context), this, true)

  // Navigation Data
  private var origin: Point? = null
  private var destination: Point? = null
  private var destinationTitle: String = ""
  private var waypoints: List<Point> = listOf()
  private var waypointLegs: List<Waypoint> = listOf()
  var distanceUnit: String = DirectionsCriteria.METRIC
  private var locale = Locale.getDefault()
  private var travelMode: String = DirectionsCriteria.PROFILE_DRIVING
  private var isVoiceInstructionsMuted = false
    set(value) {
      field = value
      if (value) {
        binding.soundButton.muteAndExtend(BUTTON_ANIMATION_DURATION)
        voiceInstructionsPlayer?.volume(SpeechVolume(0f))
      } else {
        binding.soundButton.unmuteAndExtend(BUTTON_ANIMATION_DURATION)
        voiceInstructionsPlayer?.volume(SpeechVolume(1f))
      }
      Log.d(TAG, "Voice instructions mute state: $value")
    }

  // Mapbox Navigation Components
  private var viewportDataSource = MapboxNavigationViewportDataSource(binding.mapView.mapboxMap)
  private var navigationCamera = NavigationCamera(
    binding.mapView.mapboxMap,
    binding.mapView.camera,
    viewportDataSource
  )
  private var mapboxNavigation: MapboxNavigation? = null
  private lateinit var maneuverApi: MapboxManeuverApi
  private lateinit var tripProgressApi: MapboxTripProgressApi
  private lateinit var speechApi: MapboxSpeechApi
  private var voiceInstructionsPlayer: MapboxVoiceInstructionsPlayer? = null
  private val navigationLocationProvider = NavigationLocationProvider()

  // Mapbox Route & Arrow Drawing
  private val routeLineViewOptions: MapboxRouteLineViewOptions by lazy {
    MapboxRouteLineViewOptions.Builder(context)
      .routeLineColorResources(RouteLineColorResources.Builder().build())
      .routeLineBelowLayerId("road-label-navigation")
      .build()
  }
  private val routeLineApiOptions: MapboxRouteLineApiOptions by lazy {
    MapboxRouteLineApiOptions.Builder().build()
  }
  private val routeLineView by lazy {
    MapboxRouteLineView(routeLineViewOptions)
  }
  private val routeLineApi: MapboxRouteLineApi by lazy {
    MapboxRouteLineApi(routeLineApiOptions)
  }
  private val routeArrowApi: MapboxRouteArrowApi by lazy {
    MapboxRouteArrowApi()
  }
  private val routeArrowOptions by lazy {
    RouteArrowOptions.Builder(context)
      .withSlotName(RouteLayerConstants.TOP_LEVEL_ROUTE_LINE_LAYER_ID)
      .build()
  }
  private val routeArrowView: MapboxRouteArrowView by lazy {
    MapboxRouteArrowView(routeArrowOptions)
  }

  // UI Padding based on orientation
  private val pixelDensity = Resources.getSystem().displayMetrics.density
  private val overviewPadding: EdgeInsets by lazy {
    EdgeInsets(
      140.0 * pixelDensity,
      40.0 * pixelDensity,
      120.0 * pixelDensity,
      40.0 * pixelDensity
    )
  }
  private val landscapeOverviewPadding: EdgeInsets by lazy {
    EdgeInsets(
      30.0 * pixelDensity,
      380.0 * pixelDensity,
      110.0 * pixelDensity,
      20.0 * pixelDensity
    )
  }
  private val followingPadding: EdgeInsets by lazy {
    EdgeInsets(
      180.0 * pixelDensity,
      40.0 * pixelDensity,
      150.0 * pixelDensity,
      40.0 * pixelDensity
    )
  }
  private val landscapeFollowingPadding: EdgeInsets by lazy {
    EdgeInsets(
      30.0 * pixelDensity,
      380.0 * pixelDensity,
      110.0 * pixelDensity,
      40.0 * pixelDensity
    )
  }

  // Observers
  private val voiceInstructionsObserver = VoiceInstructionsObserver { voiceInstructions ->
    speechApi.generate(voiceInstructions, speechCallback)
    Log.d(TAG, "Voice instruction generated:")
  }

  private val speechCallback =
    MapboxNavigationConsumer<com.mapbox.bindgen.Expected<com.mapbox.navigation.voice.model.SpeechError, com.mapbox.navigation.voice.model.SpeechValue>> { expected ->
      expected.fold(
        { error ->
          voiceInstructionsPlayer?.play(error.fallback, voiceInstructionsPlayerCallback)
          Log.w(TAG, "Speech generation failed, using fallback: ")
        },
        { value ->
          voiceInstructionsPlayer?.play(value.announcement, voiceInstructionsPlayerCallback)
          Log.d(TAG, "Speech announcement played: ")
        }
      )
    }

  private val voiceInstructionsPlayerCallback =
    MapboxNavigationConsumer<SpeechAnnouncement> { value ->
      speechApi.clean(value)
      Log.d(TAG, "Speech announcement cleaned: ")
    }

  private val locationObserver = object : LocationObserver {
    var firstLocationUpdateReceived = false

    override fun onNewRawLocation(rawLocation: com.mapbox.common.location.Location) {
      Log.d(TAG, "Raw location: ${rawLocation.latitude}, ${rawLocation.longitude}")
    }

    override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
      val enhancedLocation = locationMatcherResult.enhancedLocation
      Log.d(TAG, "Enhanced location: ${enhancedLocation.latitude}, ${enhancedLocation.longitude}")
      navigationLocationProvider.changePosition(
        location = enhancedLocation,
        keyPoints = locationMatcherResult.keyPoints,
      )
      viewportDataSource.onLocationChanged(enhancedLocation)
      viewportDataSource.evaluate()

      if (!firstLocationUpdateReceived) {
        firstLocationUpdateReceived = true
        navigationCamera.requestNavigationCameraToOverview(
          stateTransitionOptions = NavigationCameraTransitionOptions.Builder()
            .maxDuration(0)
            .build()
        )
        Log.d(TAG, "First location update, camera set to overview")
      }

      implementation?.onLocationChange?.invoke(
        LocationData(
          latitude = enhancedLocation.latitude,
          longitude = enhancedLocation.longitude,
          heading = enhancedLocation.bearing ?: 0.0,
          accuracy = enhancedLocation.horizontalAccuracy ?: 0.0,
          timestamp = enhancedLocation.timestamp.toDouble()
        )
      )
    }
  }

  private val routeProgressObserver = RouteProgressObserver { routeProgress ->
    Log.d(
      TAG,
      "Route progress: ${routeProgress.distanceRemaining}m remaining, fraction: ${routeProgress.fractionTraveled}"
    )
    if (routeProgress.fractionTraveled.toDouble() != 0.0) {
      viewportDataSource.onRouteProgressChanged(routeProgress)
    }

    val style = binding.mapView.mapboxMap.style
    if (style != null) {
      val maneuverArrowResult = routeArrowApi.addUpcomingManeuverArrow(routeProgress)
      routeArrowView.renderManeuverUpdate(style, maneuverArrowResult)
      Log.d(TAG, "Maneuver arrow rendered")
    } else {
      Log.w(TAG, "Map style is null, cannot render maneuver arrow")
    }

    val maneuvers = maneuverApi.getManeuvers(routeProgress)
    maneuvers.fold(
      { error ->
        Log.w(TAG, "Maneuver error:", error.throwable)
      },
      {
        val maneuverViewOptions = ManeuverViewOptions.Builder()
          .primaryManeuverOptions(
            ManeuverPrimaryOptions.Builder()
              .textAppearance(R.style.PrimaryManeuverTextAppearance)
              .build()
          )
          .secondaryManeuverOptions(
            ManeuverSecondaryOptions.Builder()
              .textAppearance(R.style.ManeuverTextAppearance)
              .build()
          )
          .subManeuverOptions(
            ManeuverSubOptions.Builder()
              .textAppearance(R.style.ManeuverTextAppearance)
              .build()
          )
          .stepDistanceTextAppearance(R.style.StepDistanceRemainingAppearance)
          .build()

        binding.maneuverView.visibility = VISIBLE
        binding.maneuverView.updateManeuverViewOptions(maneuverViewOptions)
        binding.maneuverView.renderManeuvers(maneuvers)
        Log.d(TAG, "Maneuver view updated")
      }
    )

    Log.d(TAG, "Trip progress view updated")
    updateTripProgressCard(tripProgressApi.getTripProgress(routeProgress))

    implementation?.onRouteProgressChange?.invoke(
      RouteProgress(
        distanceTraveled = routeProgress.distanceTraveled.toDouble(),
        distanceRemaining = routeProgress.distanceRemaining.toDouble(),
        fractionTraveled = routeProgress.fractionTraveled.toDouble(),
        durationRemaining = routeProgress.durationRemaining,
      )
    )
  }

  private fun updateTripProgressCard(tripProgressUpdateValue: TripProgressUpdateValue) {
    // Update text values
    val timeRemaining = tripProgressUpdateValue.formatter.getTimeRemaining(tripProgressUpdateValue.totalTimeRemaining)
    val arrivalTime = tripProgressUpdateValue.formatter.getEstimatedTimeToArrival(tripProgressUpdateValue.estimatedTimeToArrival)
    val distanceRemaining = tripProgressUpdateValue.formatter.getDistanceRemaining(tripProgressUpdateValue.distanceRemaining)

    binding.timeRemainingValue.text = timeRemaining
    binding.arrivalTimeText.text = arrivalTime
    binding.distanceRemainingText.text = distanceRemaining

    Log.d(TAG, "Trip progress updated: $timeRemaining, $distanceRemaining, $arrivalTime")
  }

  private val routesObserver = RoutesObserver { routeUpdateResult ->
    Log.d(TAG, "Routes updated: ${routeUpdateResult.navigationRoutes.size} routes")
    if (routeUpdateResult.navigationRoutes.isNotEmpty()) {
      routeLineApi.setNavigationRoutes(routeUpdateResult.navigationRoutes) { value ->
        binding.mapView.mapboxMap.style?.apply {
          routeLineView.renderRouteDrawData(this, value)
          Log.d(TAG, "Route line rendered")
        } ?: Log.w(TAG, "Map style is null, cannot render route line")
      }
      viewportDataSource.onRouteChanged(routeUpdateResult.navigationRoutes.first())
      viewportDataSource.evaluate()
    } else {
      val style = binding.mapView.mapboxMap.style
      if (style != null) {
        routeLineApi.clearRouteLine { value ->
          routeLineView.renderClearRouteLineValue(style, value)
        }
        routeArrowView.render(style, routeArrowApi.clearArrows())
        Log.d(TAG, "Route line and arrows cleared")
      } else {
        Log.w(TAG, "Map style is null, cannot clear route line")
      }
      viewportDataSource.clearRouteData()
      viewportDataSource.evaluate()
    }
  }

  private val arrivalObserver = object : ArrivalObserver {
    override fun onWaypointArrival(routeProgress: RouteProgress) {
      onWaypointArrivalEvent(routeProgress)
    }

    override fun onNextRouteLegStart(routeLegProgress: RouteLegProgress) {
      Log.d(TAG, "Starting next route leg: ${routeLegProgress.legIndex}")
    }

    override fun onFinalDestinationArrival(routeProgress: RouteProgress) {
      onArrivalEvent(routeProgress)
    }
  }

  private val reactContext = context

  init {
    mapboxNavigation = (if (MapboxNavigationProvider.isCreated()) {
      MapboxNavigationProvider.retrieve()
    } else {
      MapboxNavigationProvider.create(
        NavigationOptions.Builder(context)
          .build()
      )
    })
    reactContext.addLifecycleEventListener(this)
  }

  override fun onHostResume() {
    binding.mapView.onStart()
  }

  override fun onHostPause() {
    binding.mapView.onStop()
  }

  override fun onHostDestroy() {
    cleanup()
  }

  /**
   * Called when the view is attached to a window.
   * Requests layout and invalidates the MapView to ensure proper rendering.
   */
  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    binding.mapView.requestLayout()
    binding.mapView.invalidate()

    Log.d(TAG, "NavigationView attached to window")
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    cleanup()
  }

  private var isCleanedUp = false

  private fun cleanup() {
    if (isCleanedUp) return
    isCleanedUp = true

    mapboxNavigation?.unregisterRoutesObserver(routesObserver)
    mapboxNavigation?.unregisterArrivalObserver(arrivalObserver)
    mapboxNavigation?.unregisterLocationObserver(locationObserver)
    mapboxNavigation?.unregisterRouteProgressObserver(routeProgressObserver)
    mapboxNavigation?.unregisterVoiceInstructionsObserver(voiceInstructionsObserver)
    mapboxNavigation?.stopTripSession()
    mapboxNavigation?.setNavigationRoutes(listOf())

    if (::maneuverApi.isInitialized) maneuverApi.cancel()
    if (::speechApi.isInitialized) speechApi.cancel()
    routeLineApi.cancel()
    routeLineView.cancel()

    voiceInstructionsPlayer?.shutdown()
    voiceInstructionsPlayer = null

    binding.mapView.location.enabled = false
    binding.mapView.onStop()
    binding.mapView.onDestroy()

    mapboxNavigation = null
    MapboxNavigationProvider.destroy()

    reactContext.removeLifecycleEventListener(this)
    implementation = null

    Log.d(TAG, "NavigationView fully cleaned up")
  }

  /**
   * Initializes the navigation UI and components.
   * Sets up camera behaviors, UI padding, distance formatter, and API instances.
   * Attaches click listeners for navigation controls.
   */
  @SuppressLint("MissingPermission")
  fun initNavigation() {
    binding.mapView.camera.addCameraAnimationsLifecycleListener(
      NavigationBasicGesturesHandler(navigationCamera)
    )
    navigationCamera.registerNavigationCameraStateChangeObserver { navigationCameraState ->
      Log.d(TAG, "Navigation camera state: $navigationCameraState")
      when (navigationCameraState) {
        NavigationCameraState.TRANSITION_TO_FOLLOWING,
        NavigationCameraState.FOLLOWING -> binding.recenter.visibility = INVISIBLE

        NavigationCameraState.TRANSITION_TO_OVERVIEW,
        NavigationCameraState.OVERVIEW,
        NavigationCameraState.IDLE -> binding.recenter.visibility = VISIBLE
      }
    }

    if (resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) {
      viewportDataSource.overviewPadding = landscapeOverviewPadding
      viewportDataSource.followingPadding = landscapeFollowingPadding
    } else {
      viewportDataSource.overviewPadding = overviewPadding
      viewportDataSource.followingPadding = followingPadding
    }

    val unitType = if (distanceUnit == "imperial") UnitType.IMPERIAL else UnitType.METRIC
    val distanceFormatterOptions = DistanceFormatterOptions.Builder(context)
      .unitType(unitType)
      .build()

    maneuverApi = MapboxManeuverApi(MapboxDistanceFormatter(distanceFormatterOptions))
    tripProgressApi = MapboxTripProgressApi(
      TripProgressUpdateFormatter.Builder(context)
        .distanceRemainingFormatter(DistanceRemainingFormatter(distanceFormatterOptions))
        .timeRemainingFormatter(TimeRemainingFormatter(context))
        .percentRouteTraveledFormatter(PercentDistanceTraveledFormatter())
        .estimatedTimeOfArrivalFormatter(
          EstimatedTimeOfArrivalFormatter(context)
        )
        .build()
    )
    speechApi = MapboxSpeechApi(context, locale.language)
    voiceInstructionsPlayer = MapboxVoiceInstructionsPlayer(context, locale.language)
    binding.stop.setOnClickListener {
      Log.d(TAG, "Stop button clicked")
      implementation?.onCancel?.invoke()
      mapboxNavigation?.stopTripSession()
    }
    binding.recenter.setOnClickListener {
      Log.d(TAG, "Recenter button clicked")
      navigationCamera.requestNavigationCameraToFollowing()
      binding.routeOverview.showTextAndExtend(BUTTON_ANIMATION_DURATION)
    }
    binding.routeOverview.setOnClickListener {
      Log.d(TAG, "Route overview button clicked")
      navigationCamera.requestNavigationCameraToOverview()
      binding.recenter.showTextAndExtend(BUTTON_ANIMATION_DURATION)
    }
    binding.soundButton.setOnClickListener {
      Log.d(TAG, "Sound button clicked, mute: $isVoiceInstructionsMuted")
      isVoiceInstructionsMuted = !isVoiceInstructionsMuted
    }

    if (isVoiceInstructionsMuted) {
      binding.soundButton.mute()
      voiceInstructionsPlayer?.volume(SpeechVolume(0f))
    } else {
      binding.soundButton.unmute()
      voiceInstructionsPlayer?.volume(SpeechVolume(1f))
    }

    startNavigation()
  }

  /**
   * Starts the navigation process.
   * Checks for origin and destination, sets map camera, enables location puck, and initiates route finding.
   */
  fun startNavigation() {
    if (origin == null || destination == null) {
      Log.w(TAG, "Origin or destination missing")
      return
    }
    Log.d(
      TAG,
      "starting navigation with origin: ${origin?.latitude()}, ${origin?.longitude()}, destination: ${destination?.latitude()}, ${destination?.longitude()}"
    )

    binding.mapView.mapboxMap.setCamera(
      CameraOptions.Builder()
        .center(origin)
        .build()
    )
    binding.mapView.location.apply {
      setLocationProvider(navigationLocationProvider)
      this.locationPuck = LocationPuck2D(
        bearingImage = ImageHolder.from(
          com.mapbox.navigation.ui.maps.R.drawable.mapbox_navigation_puck_icon
        )
      )
      puckBearingEnabled = true
      enabled = true
      Log.d(TAG, "Location puck enabled")
    }
    startRoute()
  }

  /**
   * Finds a route between the given coordinates.
   * Requests routes from MapboxNavigation and handles success/failure.
   * @param coordinates The list of points defining the route (origin, waypoints, destination).
   */
  private fun findRoute(coordinates: List<Point>) {
    Log.d(TAG, "Finding route with coordinates: $coordinates")
    val indices = mutableListOf<Int>()
    val names = mutableListOf<String>()
    indices.add(0)
    names.add("origin")
    waypoints.forEachIndexed { index, waypoint ->
      indices.add(index + 1)
      names.add(waypointLegs.getOrNull(index)?.name ?: "")
    }
    indices.add(coordinates.count() - 1)
    names.add(destinationTitle)

    mapboxNavigation?.requestRoutes(
      RouteOptions.builder()
        .applyDefaultNavigationOptions()
        .applyLanguageAndVoiceUnitOptions(context)
        .coordinatesList(coordinates)
        .waypointIndicesList(indices)
        .waypointNamesList(names)
        .language(locale.language)
        .steps(true)
        .voiceInstructions(true)
        .voiceUnits(distanceUnit)
        .profile(travelMode)
        .build(),
      object : NavigationRouterCallback {
        override fun onCanceled(routeOptions: RouteOptions, routerOrigin: String) {
          Log.d(TAG, "Route request canceled")
          sendErrorToJS("Route request canceled")
        }

        override fun onFailure(reasons: List<RouterFailure>, routeOptions: RouteOptions) {
          Log.w(TAG, "Route request failed: $reasons")
          sendErrorToJS("Route request failed: $reasons")
        }

        override fun onRoutesReady(routes: List<NavigationRoute>, routerOrigin: String) {
          Log.d(TAG, "Routes ready: ${routes.size}")
          setRouteAndStartNavigation(routes)
        }
      }
    )
  }

  /**
   * Sets the retrieved routes and starts the trip session.
   * Makes UI elements visible and logs the navigation start.
   * @param routes The list of navigation routes to use.
   */
  @SuppressLint("MissingPermission")
  private fun setRouteAndStartNavigation(routes: List<NavigationRoute>) {
    mapboxNavigation?.setNavigationRoutes(routes)


    // Make UI elements visible
    binding.soundButton.visibility = View.VISIBLE
    binding.routeOverview.visibility = View.VISIBLE

    // Show trip progress card with a simple delay to ensure layout is ready
    binding.tripProgressCard.postDelayed({
      binding.tripProgressCard.visibility = View.VISIBLE
      Log.d(TAG, "Trip progress card made visible")
    }, 50) // Small delay to ensure layout is complete

    mapboxNavigation?.startTripSession(withForegroundService = true)
    Log.d(TAG, "Navigation started with ${routes.size} routes")
  }

  /**
   * Registers all necessary navigation observers and initiates route finding.
   */
  private fun startRoute() {
    mapboxNavigation?.registerRoutesObserver(routesObserver)
    mapboxNavigation?.registerArrivalObserver(arrivalObserver)
    mapboxNavigation?.registerRouteProgressObserver(routeProgressObserver)
    mapboxNavigation?.registerLocationObserver(locationObserver)
    mapboxNavigation?.registerVoiceInstructionsObserver(voiceInstructionsObserver)
    Log.d(TAG, "Navigation observers registered")

    val coordinatesList = mutableListOf<Point>()
    origin?.let { coordinatesList.add(it) }
    waypoints.let { coordinatesList.addAll(it) }
    destination?.let { coordinatesList.add(it) }

    findRoute(coordinatesList)
  }

  /**
   * Handles arrival at a waypoint.
   * Invokes the [onWaypointArrivalListener] with waypoint details.
   * @param routeProgress The current route progress.
   */
  private fun onWaypointArrivalEvent(routeProgress: RouteProgress) {
    val leg = routeProgress.currentLegProgress
    val legIndex = leg?.legIndex ?: -1
    val longitude = leg?.legDestination?.location?.longitude() ?: 0.0
    val latitude = leg?.legDestination?.location?.latitude() ?: 0.0
    if (leg == null || leg.legIndex < 0) {
      Log.w(TAG, "Route progress has no current leg progress")
      return
    }
    Log.d(TAG, "Arrived at destination, leg index: ${leg.legIndex}")
    implementation?.onWaypointArrival?.invoke(
      WaypointEvent(
        index = legIndex.toDouble(),
        latitude = latitude,
        longitude = longitude,
        name = waypointLegs.getOrNull(legIndex)?.name ?: ""
      )
    )
  }

  /**
   * Handles arrival at the final destination.
   * Invokes the [onArrivalListener] with the destination coordinates.
   * @param routeProgress The current route progress.
   */
  private fun onArrivalEvent(routeProgress: RouteProgress) {
    Log.d(TAG, "Arrived at final destination")
    val longitude = routeProgress.currentLegProgress?.legDestination?.location?.latitude() ?: 0.0
    val latitude = routeProgress.currentLegProgress?.legDestination?.location?.latitude() ?: 0.0
    implementation?.onArrival?.invoke(
      Coordinate(
        latitude = latitude,
        longitude = longitude
      )
    )
  }

  /**
   * Sends an error message back to the JavaScript side.
   * @param error The error message string.
   */
  fun sendErrorToJS(error: String) {
    Log.e(TAG, "Error: $error")
    implementation?.onError?.invoke(
      Message(error)
    )
  }

  // Public API for setting navigation parameters

  fun setOrigin(origin: Point?) {
    this.origin = origin
    Log.d(TAG, "Origin set: $origin")
  }

  fun setDestination(destination: Point?) {
    this.destination = destination
    Log.d(TAG, "Destination set: $destination")
  }

  fun setDestinationTitle(title: String) {
    this.destinationTitle = title
    Log.d(TAG, "Destination title set: $title")
  }

  fun setWaypointLegs(legs: List<Waypoint>) {
    this.waypointLegs = legs
    Log.d(TAG, "Waypoint legs set: $legs")
  }

  fun setWaypoints(waypoints: List<Point>) {
    this.waypoints = waypoints
    Log.d(TAG, "Waypoints set: $waypoints")
  }

  fun setLocal(language: String) {
    val locals = language.split("-")
    when (locals.size) {
      1 -> locale = Locale(locals.first())
      2 -> locale = Locale(locals.first(), locals.last())
    }
    Log.d(TAG, "Locale set: $locale")
  }

  fun setMute(mute: Boolean) {
    this.isVoiceInstructionsMuted = mute
    Log.d(TAG, "Mute set: $mute")
  }

  fun setTravelMode(mode: String) {
    travelMode = when (mode.lowercase()) {
      "walking" -> DirectionsCriteria.PROFILE_WALKING
      "cycling" -> DirectionsCriteria.PROFILE_CYCLING
      "driving" -> DirectionsCriteria.PROFILE_DRIVING
      "driving-traffic" -> DirectionsCriteria.PROFILE_DRIVING_TRAFFIC
      else -> DirectionsCriteria.PROFILE_DRIVING
    }
    Log.d(TAG, "Travel mode set: $travelMode")
  }
}
