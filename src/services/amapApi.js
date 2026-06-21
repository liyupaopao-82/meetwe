import { recommendPlaces } from '../utils/recommend';

const API_BASE_URL = '/api';
const routeCache = new Map();

export async function buildAmapRecommendations({ participants, category, city, minRating }) {
  const geocodedParticipants = await Promise.all(
    participants.map(async (participant) => {
      const geocode = await getJson('/amap/geocode', {
        address: participant.origin,
        city
      });

      return {
        ...participant,
        geocode,
        location: geocode.location
      };
    })
  );

  if (geocodedParticipants.some((participant) => !participant.location)) {
    throw new Error('Some participant addresses cannot be geocoded');
  }

  const center = getCenterPoint(geocodedParticipants.map((participant) => participant.location));
  const poiResult = await getJson('/amap/search-pois', {
    category,
    city,
    location: formatLocation(center),
    radius: 6000
  });

  const pois = (poiResult.pois || []).slice(0, 8);
  if (pois.length === 0) {
    throw new Error('No POIs returned');
  }

  const placesWithRoutes = [];
  for (const poiBatch of chunk(pois, 2)) {
    const batchResults = await Promise.all(
      poiBatch.map((poi) => buildPlaceWithRoutes({ poi, participants: geocodedParticipants, city }))
    );
    placesWithRoutes.push(...batchResults.filter(Boolean));
  }

  if (placesWithRoutes.length === 0) {
    throw new Error('No reachable POIs');
  }

  const recommendations = getNonEmptyRecommendations({
    participants: geocodedParticipants,
    places: placesWithRoutes,
    category,
    minRating
  });

  if (recommendations.length === 0) {
    throw new Error('No recommendations after relaxed filters');
  }

  return {
    recommendations,
    mapContext: {
      participants: geocodedParticipants,
      center,
      usedRealMap: true
    }
  };
}

async function getCachedTransitRoute({ origin, destination, city }) {
  const cacheKey = `${formatLocation(origin)}-${formatLocation(destination)}-transit`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  let route = null;
  try {
    const result = await getJson('/amap/route', {
      origin: formatLocation(origin),
      destination: formatLocation(destination),
      city,
      mode: 'transit'
    });

    route = result.unavailable ? null : result;
  } catch (error) {
    console.warn('Transit route unavailable:', error);
  }

  routeCache.set(cacheKey, route);
  return route;
}

async function getJson(path, params) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`API request failed: ${path}`);
    }

    return response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function buildPlaceWithRoutes({ poi, participants, city }) {
  const routes = await Promise.allSettled(
    participants.map((participant) =>
      getCachedTransitRoute({
        origin: participant.location,
        destination: poi.location,
        city
      })
    )
  );

  const settledRoutes = routes.map((route) => (route.status === 'fulfilled' ? route.value : null));

  if (settledRoutes.some((route) => !route?.durationMinutes)) {
    return null;
  }

  const timesByParticipant = {};
  participants.forEach((participant, index) => {
    timesByParticipant[participant.id] = settledRoutes[index].durationMinutes;
  });

  return {
    ...poi,
    timeByOrigin: {},
    timesByParticipant,
    isRealAmapPlace: true
  };
}

function getCenterPoint(points) {
  const total = points.reduce(
    (sum, point) => ({
      lng: sum.lng + point.lng,
      lat: sum.lat + point.lat
    }),
    { lng: 0, lat: 0 }
  );

  return {
    lng: total.lng / points.length,
    lat: total.lat / points.length
  };
}

function formatLocation(location) {
  return `${location.lng},${location.lat}`;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getNonEmptyRecommendations({ participants, places, category, minRating }) {
  const ratingSteps = [minRating, 3.8, 3.5, 0];

  for (const rating of ratingSteps) {
    const recommendations = recommendPlaces(participants, places, category, rating);
    if (recommendations.length > 0) {
      return recommendations;
    }
  }

  return [];
}
