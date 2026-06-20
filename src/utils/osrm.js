export async function getRoadRoute(srcLat, srcLng, dstLat, dstLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${srcLng},${srcLat};${dstLng},${dstLat}?overview=full&geometries=geojson&alternatives=true&steps=true`;
  console.log('[OSRM] Calling URL:', url);

  const res = await fetch(url);
  console.log('[OSRM] Response status:', res.status);

  const data = await res.json();
  console.log('[OSRM] Response code:', data.code, '| routes found:', data.routes?.length);

  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    console.error('[OSRM] FAILED — full response:', data);
    throw new Error('OSRM routing failed: ' + (data.message || data.code));
  }

  return data.routes.map((route) => ({
    coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: (route.distance / 1000).toFixed(1),
    durationMin: Math.round(route.duration / 60),
    steps: route.legs?.[0]?.steps || [],
  }));
}
