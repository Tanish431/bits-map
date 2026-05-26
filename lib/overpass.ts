// lib/overpass.ts
import osmtogeojson from 'osmtogeojson';

const BITS_CENTER = { lat: 28.3638, lng: 75.5870 };
const RADIUS = 2000; // meters

export async function fetchBITSBuildings() {
  const query = `
    [out:json][timeout:25];
    (
      way["building"](around:${RADIUS}, ${BITS_CENTER.lat}, ${BITS_CENTER.lng});
      relation["building"](around:${RADIUS}, ${BITS_CENTER.lat}, ${BITS_CENTER.lng});
    );
    out body geom;
  `;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
  });

  if (!res.ok) throw new Error('Overpass API failed');

  const data = await res.json();
  return osmtogeojson(data) as GeoJSON.FeatureCollection;
}