
function MyLocationButton({
  onLocate,
  className = "",
  style = {},
}) {
  const getLocation = () => {
    if (!navigator.geolocation) {
      notify(
        "Geolocation is not supported by your browser."
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          name: "My Current Location",
        };

        console.log(
          "📍 GPS LOCATION:",
          location
        );

        if (onLocate) {
          onLocate(location);
        }
      },

      (error) => {
        console.error(
          "Geolocation error:",
          error
        );

        if (error.code === 1) {
          notify(
            "Location permission denied. Please allow location access."
          );
        } else if (error.code === 2) {
          notify(
            "Your location is currently unavailable."
          );
        } else if (error.code === 3) {
          notify(
            "Location request timed out. Please try again."
          );
        } else {
          notify(
            "Unable to get your location."
          );
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  return (
    <button
      type="button"
      onClick={getLocation}
      className={`my-location-btn ${className}`.trim()}
      style={style}
    >
      📍 My Location
    </button>
  );
}

export default MyLocationButton;