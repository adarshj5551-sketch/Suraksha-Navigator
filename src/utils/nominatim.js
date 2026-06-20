const HEADERS = {
  'User-Agent': 'SurakshaNavigator/1.0 (hackathon)',
  'Accept-Language': 'en',
};

// GPS coordinates → road, locality, district, state
export async function reverseGeocode(lat, lng) {
  // First attempt at zoom 16 (street level)
  let addr = await fetchReverseGeocode(lat, lng, 16);

  // If road wasn't found, retry at zoom 18 (more granular — good for galis/residential)
  if (!addr.road || addr.road === 'Road not identified') {
    console.log('[Nominatim] Road not found at zoom 16, retrying at zoom 18...');
    const addr2 = await fetchReverseGeocode(lat, lng, 18);
    if (addr2.road && addr2.road !== 'Road not identified') {
      addr = { ...addr, road: addr2.road };
    }
  }

  return addr;
}

async function fetchReverseGeocode(lat, lng, zoom) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=${zoom}`;
  console.log(`[Nominatim] Reverse geocoding (zoom=${zoom}):`, lat, lng);
  const res  = await fetch(url, { headers: { 'User-Agent': 'SurakshaNavigator/1.0', 'Accept-Language': 'en' } });
  const data = await res.json();
  const a = data.address || {};
  return {
    road:     a.road || a.highway || a.path || a.pedestrian || a.residential || a.footway || 'Road not identified',
    suburb:   a.suburb || a.neighbourhood || a.village || a.hamlet || a.quarter || 'N/A',
    city:     a.city || a.town || a.municipality || 'N/A',
    district: a.county || a.state_district || a.city_district || 'N/A',
    state:    a.state || 'N/A',
    postcode: a.postcode || 'N/A',
    display:  data.display_name || 'Unknown',
  };
}

// Place name → GPS coordinates
export async function forwardGeocode(place) {
  const query = encodeURIComponent(place + ', India');
  const url   = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&addressdetails=1&limit=1&countrycodes=in`;
  console.log('[Nominatim] Forward geocoding:', place);
  const res  = await fetch(url, { headers: HEADERS });
  const data = await res.json();
  if (!data || data.length === 0) {
    throw new Error(`"${place}" not found. Please try a more specific location name.`);
  }
  console.log('[Nominatim] Geocode result:', data[0]);
  return {
    lat:  parseFloat(data[0].lat),
    lng:  parseFloat(data[0].lon),
    name: data[0].display_name,
  };
}

// Used by "Use My Location" — converts GPS coords to a clean place name
export async function reverseGeocodeToLabel(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=16`;
  const res = await fetch(url, { headers: HEADERS });
  const data = await res.json();
  const a = data.address || {};
  const label = [a.suburb || a.neighbourhood, a.city || a.town, a.state].filter(Boolean).join(', ');
  return label || data.display_name || 'Current Location';
}
