import { useEffect, useState } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

const policeIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -30],
});

// Calculate distance in KM
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function PoliceStations({ center, onNearestChange }) {
  const [stations, setStations] = useState([]);

  useEffect(() => {
    if (!center) {
      setStations([]);
      onNearestChange?.(null);
      return;
    }

    const loadPoliceStations = async () => {
      try {
        const lat = Number(center.lat);
        const lng = Number(center.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        const query = `
          [out:json];
          (
            node["amenity"="police"](around:15000,${lat},${lng});
            way["amenity"="police"](around:15000,${lat},${lng});
            relation["amenity"="police"](around:15000,${lat},${lng});
          );
          out center;
        `;

        const response = await fetch(
          "https://overpass-api.de/api/interpreter",
          {
            method: "POST",
            body: query,
          }
        );

        if (!response.ok) {
          throw new Error(
            `Police request failed: ${response.status}`
          );
        }

        const data = await response.json();

        const result = data.elements
          .map((item) => {
            const stationLat = item.lat || item.center?.lat;
            const stationLng = item.lon || item.center?.lon;

            if (
              !Number.isFinite(Number(stationLat)) ||
              !Number.isFinite(Number(stationLng))
            ) {
              return null;
            }

            const distance = calculateDistance(
              lat,
              lng,
              Number(stationLat),
              Number(stationLng)
            );

            return {
              id: item.id,
              lat: Number(stationLat),
              lng: Number(stationLng),
              name: item.tags?.name || "Police Station",
              phone:
                item.tags?.phone ||
                item.tags?.["contact:phone"] ||
                "",
              distance,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.distance - b.distance);

        setStations(result);

        // Send nearest police station back to Emergency.jsx
        onNearestChange?.(result.length > 0 ? result[0] : null);
      } catch (error) {
        console.error("Police station loading error:", error);
        setStations([]);
        onNearestChange?.(null);
      }
    };

    loadPoliceStations();
  }, [center?.lat, center?.lng, onNearestChange]);

  return (
    <>
      {stations.map((station) => (
        <Marker
          key={`police-${station.id}`}
          position={[station.lat, station.lng]}
          icon={policeIcon}
        >
          <Popup>
            <strong>🚓 {station.name}</strong>
            <br />
            Distance: {station.distance.toFixed(2)} km
            {station.phone && (
              <>
                <br />
                Phone: {station.phone}
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export default PoliceStations;