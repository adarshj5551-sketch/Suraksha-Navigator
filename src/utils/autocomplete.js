// Fetches location suggestions as user types (Nominatim search)
// Debounced externally in the component — this just does the fetch

export async function searchPlaces(query) {
  if (!query || query.trim().length < 3) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', India')}&addressdetails=1&limit=5&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SurakshaNavigator/1.0', 'Accept-Language': 'en' }
    });
    const data = await res.json();
    console.log('[Autocomplete] Found', data.length, 'suggestions for:', query);

    return data.map(item => ({
      label: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type || '',
    }));
  } catch (err) {
    console.error('[Autocomplete] Error:', err);
    return [];
  }
}
