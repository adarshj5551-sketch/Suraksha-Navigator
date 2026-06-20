// Calculates realistic travel time estimates for each transport mode
// Uses real OSRM routing for car/walking/cycling where supported,
// with sensible fallback heuristics for modes OSRM doesn't cover.

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

async function tryOsrmProfile(profile, srcLat, srcLng, dstLat, dstLng) {
  try {
    const url = `${OSRM_BASE}/${profile}/${srcLng},${srcLat};${dstLng},${dstLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    return {
      coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
    };
  } catch (err) {
    console.warn(`[TravelModes] OSRM profile "${profile}" unavailable:`, err.message);
    return null;
  }
}

// Returns time/distance estimates for all 4 modes given a driving route
export async function getAllModeEstimates(srcLat, srcLng, dstLat, dstLng, carRoute) {
  console.log('[TravelModes] Calculating estimates for all modes...');

  // CAR — use the already-calculated driving route (passed in)
  const car = {
    mode: 'car', label: 'Car', icon: '🚗',
    durationMin: Math.round(carRoute.durationMin),
    distanceKm: carRoute.distanceKm,
    coords: carRoute.coords,
  };

  // WALKING — try real OSRM foot profile, fallback to speed heuristic
  let walkData = await tryOsrmProfile('foot', srcLat, srcLng, dstLat, dstLng);
  const walkSpeed = walkData ? (walkData.distanceKm / (walkData.durationMin / 60)) : 0;
  const isRealWalk = walkData && walkSpeed <= 6;
  const walking = isRealWalk
    ? { mode: 'walking', label: 'Walking', icon: '🚶', durationMin: Math.round(walkData.durationMin), distanceKm: walkData.distanceKm, coords: walkData.coords, isEstimate: false }
    : { mode: 'walking', label: 'Walking', icon: '🚶', durationMin: Math.round((car.distanceKm / 5) * 60), distanceKm: car.distanceKm, coords: car.coords, isEstimate: true }; // 5 km/h avg walking speed

  // TWO-WHEELER — try real OSRM bike profile, fallback to speed heuristic
  let cycleData = await tryOsrmProfile('bike', srcLat, srcLng, dstLat, dstLng);
  const cycleSpeed = cycleData ? (cycleData.distanceKm / (cycleData.durationMin / 60)) : 0;
  const twoWheeler = (cycleData && cycleSpeed <= 25)
    ? { mode: 'twowheeler', label: 'Two-Wheeler', icon: '🏍️', durationMin: Math.round(cycleData.durationMin * 0.7), distanceKm: cycleData.distanceKm, coords: cycleData.coords, isEstimate: true }
    : { mode: 'twowheeler', label: 'Two-Wheeler', icon: '🏍️', durationMin: Math.round(car.durationMin * 0.75), distanceKm: car.distanceKm, coords: car.coords, isEstimate: true };

  // PUBLIC TRANSPORT — no live GTFS data available; use heuristic
  // Average effective bus speed in Indian cities (~18 km/h incl. stops) + fixed wait/transfer buffer
  const transitDuration = Math.round((car.distanceKm / 18) * 60) + 12;
  const transit = {
    mode: 'transit', label: 'Public Transport', icon: '🚌',
    durationMin: transitDuration, distanceKm: car.distanceKm, coords: car.coords, isEstimate: true,
  };

  console.log('[TravelModes] Estimates:', {
    car: car.durationMin, walking: walking.durationMin,
    twoWheeler: twoWheeler.durationMin, transit: transit.durationMin,
  });

  return [car, twoWheeler, transit, walking];
}

// Formats minutes into "X hr Y min" or "Y min"
export function formatDuration(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

// Calculates ETA string from now + duration in minutes
export function calculateETA(durationMin) {
  const eta = new Date(Date.now() + durationMin * 60000);
  return eta.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}
