import { haversine } from './haversine.js';

// Finds nearest police station within 8km using Overpass API
export async function findNearestThana(lat, lng) {
  const query = `[out:json][timeout:12];(node["amenity"="police"](around:8000,${lat},${lng});way["amenity"="police"](around:8000,${lat},${lng}););out center;`;
  console.log('[Overpass] Finding nearest police station near:', lat, lng);
  try {
    const res  = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    const data = await res.json();
    console.log('[Overpass] Found:', data.elements?.length, 'results');

    if (!data.elements || data.elements.length === 0) {
      return { name: 'No data available for this area', distance: '—', lat: null, lng: null };
    }

    let best = null;
    let minDist = Infinity;
    data.elements.forEach(el => {
      const eLat = el.lat || el.center?.lat;
      const eLng = el.lon || el.center?.lon;
      if (!eLat || !eLng) return;
      const d = haversine(lat, lng, eLat, eLng);
      if (d < minDist) {
        minDist = d;
        best = {
          name:     el.tags?.name || el.tags?.['name:en'] || 'Police Station',
          distance: d < 1 ? `${(d * 1000).toFixed(0)} m` : `${d.toFixed(1)} km`,
          lat:      eLat,
          lng:      eLng,
        };
      }
    });
    return best || { name: 'Not found nearby', distance: '—', lat: null, lng: null };
  } catch (err) {
    console.error('[Overpass] Error:', err);
    return { name: 'Service unavailable (check connection)', distance: '—', lat: null, lng: null };
  }
}
