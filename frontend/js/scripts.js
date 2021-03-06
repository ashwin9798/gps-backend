$(document).ready(function(){

  ////////////////////////////////////////
  // GLOBALS!!!!
  /////////////////////////////////////////////
  var pointsDatabase = new Array();
  var flightPath = new Array();
  var snappedPolyline;
  var busMarker;
  var busImage;
  var personMarker;
  var isTrackingRealTime = true;
  var lastPoint;  //last recorded point of bus
  var userSpot;   //user location as google latLng
  var destinationSearched = false;
  var markers = [];
  var snappedBusToDestLine;
  var destinationMarkerLocation;
  var directionsService = new google.maps.DirectionsService;
  var directionsDisplay = new google.maps.DirectionsRenderer;
  var timeToYou;
  //also includes:

  //snappedCoordinates

  //////////////////////////////////////////////////

  //auto refresh the page every 8 seconds, for incoming coordinates.
  setInterval(function() {
    if(isTrackingRealTime) {
      $("#trackBusButton").trigger('click');
    }
  }, 8000);

  //initialize the map as soon as the webpage renders
  setTimeout(function() {
    initMap();
  }, 10)

  //get user position as soon as the webpage renders
  setTimeout(function() {
    getPos();
  }, 100)

  //function to get user position from browser
  function getPos() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(position) {
          userSpot = new google.maps.LatLng(parseFloat(position.coords.latitude), parseFloat(position.coords.longitude))
      });
    }
  }

  var map;

  $("#busHistory").hide()
  $("#distanceToUser").hide()
  $("#distanceToDestination").hide()

  //function to initialize the map on the page.
  function initMap() {
    //use the maps api to create a new map.
    map = new google.maps.Map(document.getElementById('map'), {
      scrollwheel: false,
      zoomControl: true,
      minZoom: 5,
      maxZoom: 16,
      zoom: 13,
      center: new google.maps.LatLng(0,0)
    });

    $("#clearMarker").prop("disabled", true);

    //the directions display is the line from the bus to the searched destination. setMap is used to tell it which map it should be displayed on.
    directionsDisplay.setMap(map);
    directionsDisplay.setOptions( { suppressMarkers: true, polylineOptions: { strokeColor: "green" } });

    //an image which will resize depending on the zoom
    busImage = {
      url: 'frontend/busIcon.png',
      size: new google.maps.Size(25,25),
      origin: null,
      anchor: null,
      scaledSize: new google.maps.Size(25,25)
    };

    ////////////////////////////////////////////////////////////////////
    // SEARCH BOX. This is all basically taken from the api docs from google.
    ////////////////////////////////////////////////////////////////////
    var input = document.getElementById('pac-input');
    var searchBox = new google.maps.places.SearchBox(input);
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(input);

    // Bias the SearchBox results towards current map's viewport.
    map.addListener('bounds_changed', function() {
        searchBox.setBounds(map.getBounds());
    });

    //listen for keystrokes in the search bar
    searchBox.addListener('places_changed', function() {
        var places = searchBox.getPlaces();

        if (places.length == 0) {
          return;
        }

        // Clear out the old markers.
        markers.forEach(function(marker) {
          marker.setMap(null);
        });

        markers = [];

          // For each place, get the icon, name and location.
        var bounds = new google.maps.LatLngBounds();
        places.forEach(function(place) {

          if (!place.geometry) {
            console.log("Returned place contains no geometry");
            return;
          }
            // Create a marker for each place.
          markers.push(new google.maps.Marker({
            map: map,
            title: place.name,
            position: place.geometry.location
          }));

          //draw the line showing directions
          drawPathToDest();

          //create the marker that displays the destination on the map.
          destinationMarkerLocation = new google.maps.LatLng(markers[0].position.lat(), markers[0].position.lng())

          //call the function which calculates time to the destination
          timeToUser(lastPoint, destinationMarkerLocation, markers[0].title)

          destinationSearched = true;

          if (place.geometry.viewport) {
            // Only geocodes have viewport.
            bounds.union(place.geometry.viewport);
          } else {
            bounds.extend(place.geometry.location);
          }
        });

        bounds.extend(new google.maps.LatLng(pointsDatabase[0].latitude, pointsDatabase[0].longitude))

        map.fitBounds(bounds);
    });

    //listen for zoom changes to change the size of the icon (smaller when zoomed out, bigger when zoomed in)
    google.maps.event.addListener(map, 'zoom_changed', function() {
      var pixelSizeAtZoom0 = 0.1; //the size of the icon at zoom level 0
      var maxPixelSize = 35; //restricts the maximum size of the icon, otherwise the browser will choke at higher zoom levels trying to scale an image to millions of pixels

      var zoom = map.getZoom();
      var relativePixelSize = Math.round(pixelSizeAtZoom0*Math.pow(1.6,zoom)); // use 2 to the power of current zoom to calculate relative pixel size.  Base of exponent is 2 because relative size should double every time you zoom in

      if(relativePixelSize > maxPixelSize) //restrict the maximum size of the icon
        relativePixelSize = maxPixelSize;

        //change the size of the icon
      busMarker.setIcon({
        url: 'frontend/busIcon.png', //marker's same icon graphic
        size: null,//size
        origin: null,//origin
        anchor: null, //anchor
        scaledSize: new google.maps.Size(relativePixelSize, relativePixelSize)
      });

      busImage = {
        url: 'frontend/busIcon.png', //marker's same icon graphic
        size: null,//size
        origin: null,//origin
        anchor: null, //anchor
        scaledSize: new google.maps.Size(relativePixelSize, relativePixelSize)
      }

    });
  }

  //update the google map to track the real time position of the bus
  function updateMap(points) {
    lastPoint = points[(points.length)-1];  //the last point recorded

    if(isTrackingRealTime && !destinationSearched) {
      map.setCenter(lastPoint)
    }

    //bus icon marker
    if(busMarker != null) {
      busMarker.setMap(null);
      busMarker = null;
    }

    busMarker = new google.maps.Marker({
      position: lastPoint,
      map: map,
      icon: busImage
    });

    //path of the bus is traced by coordinates.
    var pathCoords = points
    flightPath[0] = new google.maps.Polyline({
        path: pathCoords,
        geodesic: true,
        strokeColor: '#FF0000',
        strokeOpacity: 1.0,
        strokeWeight: 2
    });

    //////////////////////////////////////////////////////////////////////

    if(snappedPolyline != null) {
      snappedPolyline.setMap(null);
      snappedPolyline = null;
    }

    //function to smoothen the line and "snap" it to the road that it was probably travelling on using an api.
    runSnapToRoad(flightPath[0].getPath(), true);

    //get time to the user
    timeToUser(lastPoint, userSpot, "");


    if(markers.length != 0 && destinationSearched) {
      drawPathToDest();
    }

    if(!userSpot) {
      $("#distance").html("I can't get your position, but you can track the bus above")
    }
  }

  //this will snap the otherwise jagged polyline to the shape of the road.
  //makes path trace look more realistic.
  function runSnapToRoad(path, isRealTime) {
    var pathValues = [];
    var len = google.maps.geometry.spherical.computeLength(path)
    for (var i = 0; i < path.b.length; i++) {
      pathValues.push(path.getAt(i).toUrlValue());
    }
    $.get('https://roads.googleapis.com/v1/snapToRoads', {
      interpolate: true,
      key: 'AIzaSyCgtJHLDHcpdKKN68yTKMZxiQczNeVhMxc',
      path: pathValues.join('|')
    }, function(data) {
      processSnapToRoadResponse(data);
      var polylineColor = 'red';
      if(!isRealTime) {
        polylineColor = 'grey'
      }
      drawSnappedPolyline(polylineColor)
    });
  }

  //helper function for snapping the road.
  function processSnapToRoadResponse(data) {
    snappedCoordinates = [];
    placeIdArray = [];
    for (var i = 0; i < data.snappedPoints.length; i++) {
      var latlng = new google.maps.LatLng(
        data.snappedPoints[i].location.latitude,
        data.snappedPoints[i].location.longitude);
        snappedCoordinates.push(latlng);
        placeIdArray.push(data.snappedPoints[i].placeId);
      }
  }

  //helper function for drawing the snapped line
  function drawSnappedPolyline(color) {
    if(color != 'green'){
      snappedPolyline = new google.maps.Polyline({
        path: snappedCoordinates,
        strokeColor: color,
        strokeWeight: 3
      });
      snappedPolyline.setMap(map)
    }
  }

  //calculate how far away the bus is from the user using distance matrix api.
  function timeToUser(mostRecentPoint, destination, destinationString) {
    var time;
    var service = new google.maps.DistanceMatrixService();
    console.log(destination)

    service.getDistanceMatrix(
    {
      origins: [mostRecentPoint],
      destinations: [destination],
      travelMode: 'DRIVING'
    }, function(data) {
        time = data.rows[0].elements[0].duration.text
        if(destinationString == "") {
          $("#distanceToUser").show()
          if(!time)
            $("#distanceToUser").html("Time to you: loading..")
          $("#distanceToUser").html("Time to you: " + time)
          timeToYou = time;
        }
        else {
          $("#distanceToUser").show()
          $("#distanceToUser").html("Time to you: " + timeToYou)
          $("#distanceToDestination").show()
          $("#distanceToDestination").html("Time to destination: " +  time + " away from " + destinationString)
        }
        $("#distanceToUser").css({ 'color': 'green', 'font-size': '150%'})
        $("#distanceToDestination").css({ 'color': 'blue', 'font-size': '150%'})
    });
  }

  //use the directions service api to draw the directions on the map.
  function drawPathToDest() {
    directionsService.route({
      origin: lastPoint,
      destination: new google.maps.LatLng(markers[0].position.lat(), markers[0].position.lng()),
      travelMode: 'DRIVING'
    }, function(response, status) {
      if (status === 'OK') {
        directionsDisplay.setMap(map);
        directionsDisplay.setDirections(response);
        $("#clearMarker").prop("disabled", false);
    } else {
        window.alert('Directions request failed due to ' + status);
    }
  });
  }

  //run this function when the button requesting the map is clicked.
  $("#trackBusButton").click(function(){
    //make an ajax GET request to the heroku server which will load from sql.
    isTrackingRealTime = true;

    $.ajax({
        url: "https://pure-hollows-72424.herokuapp.com/data",
        type: 'GET',
        success: function(data){
          //store the gps coordinates from the object into an array.
          var points = new Array();
          //error message for when the database request is empty
          if(data.length == 0){
            $("#error").html("Oops, no data on the requested bus :(");
          }
          else {
            var markup;
            $('#busHistory tr:not(#header)').remove()
            //store in the points array as LatLng objects, which are required for API.
            for(var i=0; i < data.length; i++) {

              //if we encounter new points in the database, only then will we look at them.
              if(i >= pointsDatabase.length) {
                  pointsDatabase[i] = data[i]
                  $('#startTime').append($('<option>', {
                    value: i,
                    text: pointsDatabase[i].timeAdded
                  }))
                  $('#endTime').append($('<option>', {
                    value: i,
                    text: pointsDatabase[i].timeAdded
                  }))
              }

              points[i] = new google.maps.LatLng(parseFloat(data[i].latitude).toFixed(3), parseFloat(data[i].longitude).toFixed(3));
              markup = '<tr><td>' + data[i].timeAdded + '</td><td>' + data[i].latitude + '</td><td>' + data[i].longitude + '</td><td></tr>';
              // $('#busHistory tbody').append(markup);
            }
            //this block gets the position of the user from the browser. Hardcoded right now.
            updateMap(points)
          }
        },
        //error handler for server connection
        error: function(data) {
          alert('it seems the server is unresponsive, please try again later');
        }
    });
  });

  $("#submitHistoryTracking").click(function(){
    var startTime = $('#startTime :selected')
    var endTime = $('#endTime :selected')

    //autorefresh should not happen now
    isTrackingRealTime = false;

    if(startTime.val() >= endTime.val()) {
      alert("invalid time interval")
    }
    else {
      $("#map").css({'border': '1px solid black', 'outline-color': 'red'});
      var slicedPath = new Array();
      for(var i=startTime.val(); i<=endTime.val(); i++) {
        slicedPath[i-startTime.val()] = new google.maps.LatLng(pointsDatabase[i].latitude, pointsDatabase[i].longitude)
      }

      if(busMarker != null) {
        busMarker.setMap(null);
        busMarker = null;
      }

      busMarker = new google.maps.Marker({
        position: slicedPath[slicedPath.length-1],
        map: map,
        icon: busImage
      });

      flightPath[0] = new google.maps.Polyline({
          path: slicedPath,
          geodesic: true,
          strokeColor: 'grey',
          strokeOpacity: 1.0,
          strokeWeight: 2
      });

      if(snappedPolyline != null) {
        snappedPolyline.setMap(null);
        snappedPolyline = null;
      }
      directionsDisplay.setMap(null);
      runSnapToRoad(flightPath[0].getPath(), false);
    }
  });

  $("#clearMarker").click(function(){
    directionsDisplay.setMap(null);

    markers.forEach(function(marker) {
      marker.setMap(null);
    });
    markers = [];
    destinationSearched = false;
    $("#clearMarker").prop("disabled", true);
  })

})
