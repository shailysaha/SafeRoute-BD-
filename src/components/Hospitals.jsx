import { useEffect, useState } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

const hospitalIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/2967/2967350.png",
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

function Hospitals({ center, onNearestChange }) {
  const [hospitals, setHospitals] = useState([]);

  useEffect(() => {
    if (!center) {
      setHospitals([]);
      onNearestChange?.(null);
      return;
    }

    const loadHospitals = async () => {
      try {
        const lat = Number(center.lat);
        const lng = Number(center.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        const query = `
          [out:json];
          (
            node["amenity"="hospital"](around:15000,${lat},${lng});
            way["amenity"="hospital"](around:15000,${lat},${lng});
            relation["amenity"="hospital"](around:15000,${lat},${lng});
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
            `Hospital request failed: ${response.status}`
          );
        }

        const data = await response.json();

        const result = data.elements
          .map((item) => {
            const hospitalLat = item.lat || item.center?.lat;
            const hospitalLng = item.lon || item.center?.lon;

            if (
              !Number.isFinite(Number(hospitalLat)) ||
              !Number.isFinite(Number(hospitalLng))
            ) {
              return null;
            }

            const distance = calculateDistance(
              lat,
              lng,
              Number(hospitalLat),
              Number(hospitalLng)
            );

            return {
              id: item.id,
              lat: Number(hospitalLat),
              lng: Number(hospitalLng),
              name: item.tags?.name || "Hospital",
              phone:
                item.tags?.phone ||
                item.tags?.["contact:phone"] ||
                "",
              distance,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.distance - b.distance);

        setHospitals(result);

        // Send nearest hospital to Emergency.jsx
        onNearestChange?.(result.length > 0 ? result[0] : null);
      } catch (error) {
        console.error("Hospital loading error:", error);
        setHospitals([]);
        onNearestChange?.(null);
      }
    };

    loadHospitals();
  }, [center?.lat, center?.lng, onNearestChange]);

  return (
    <>
      {hospitals.map((hospital) => (
        <Marker
          key={`hospital-${hospital.id}`}
          position={[hospital.lat, hospital.lng]}
          icon={hospitalIcon}
        >
          <Popup>
            <strong>🏥 {hospital.name}</strong>
            <br />
            Distance: {hospital.distance.toFixed(2)} km
            {hospital.phone && (
              <>
                <br />
                Phone: {hospital.phone}
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export default Hospitals;