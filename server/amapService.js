const AMAP_BASE_URL = 'https://restapi.amap.com/v3';

const categoryKeywords = {
  美食: '餐厅',
  商场购物: '商场',
  电影: '电影院',
  休闲玩乐: '休闲娱乐',
  景点: '景点'
};

export function hasAmapWebKey() {
  return Boolean(process.env.AMAP_WEB_SERVICE_KEY);
}

export async function geocodeAddress({ address, city }) {
  ensureWebKey();

  const knownLandmark = getKnownLandmarkFallback({ address, city });
  if (knownLandmark) {
    return knownLandmark;
  }

  let data = null;
  try {
    data = await requestAmap('/geocode/geo', {
      address,
      city
    });
  } catch (error) {
    console.warn('Geocode failed, trying POI fallback:', error.message);
  }

  const geocode = data?.geocodes?.[0];
  if (!geocode?.location) {
    return searchAddressAsPoi({ address, city });
  }

  const location = parseLocation(geocode.location);
  return {
    name: address,
    address: geocode.formatted_address || address,
    location,
    city: geocode.city || city,
    adcode: geocode.adcode
  };
}

async function searchAddressAsPoi({ address, city }) {
  let data = null;
  try {
    data = await requestAmap('/place/text', {
      keywords: address,
      city,
      offset: 1,
      page: 1,
      extensions: 'base'
    });
  } catch (error) {
    console.warn('POI address fallback failed:', error.message);
    return getKnownLandmarkFallback({ address, city });
  }

  const poi = data.pois?.[0];
  if (!poi?.location) {
    return getKnownLandmarkFallback({ address, city });
  }

  return {
    name: poi.name || address,
    address: Array.isArray(poi.address) ? poi.address.join('') : poi.address || address,
    location: parseLocation(poi.location),
    city: poi.cityname || city,
    adcode: poi.adcode
  };
}

function getKnownLandmarkFallback({ address, city }) {
  const normalized = `${city}${address}`;
  const knownLandmarks = [
    {
      pattern: /五道口/,
      name: '五道口',
      address: '北京市海淀区五道口',
      location: { lng: 116.339311, lat: 39.991327 },
      city: '北京市',
      adcode: '110108'
    },
    {
      pattern: /国贸/,
      name: '国贸',
      address: '北京市朝阳区国贸',
      location: { lng: 116.461332, lat: 39.908383 },
      city: '北京市',
      adcode: '110105'
    },
    {
      pattern: /陆家嘴/,
      name: '陆家嘴',
      address: '上海市浦东新区陆家嘴',
      location: { lng: 121.499809, lat: 31.239666 },
      city: '上海市',
      adcode: '310115'
    },
    {
      pattern: /上海海事大学|临港校区|海事大学/,
      name: '上海海事大学（临港校区）',
      address: '上海市浦东新区海港大道1550号',
      location: { lng: 121.902765, lat: 30.875593 },
      city: '上海市',
      adcode: '310115'
    },
    {
      pattern: /世纪公园/,
      name: '世纪公园',
      address: '上海市浦东新区锦绣路1001号',
      location: { lng: 121.551564, lat: 31.215571 },
      city: '上海市',
      adcode: '310115'
    },
    {
      pattern: /徐汇/,
      name: '徐汇',
      address: '上海市徐汇区',
      location: { lng: 121.436525, lat: 31.188523 },
      city: '上海市',
      adcode: '310104'
    }
  ];

  const landmark = knownLandmarks.find((item) => item.pattern.test(normalized));
  return landmark || null;
}

export async function searchPois({ category, city, location, radius = 5000 }) {
  ensureWebKey();

  const keyword = categoryKeywords[category] || category || '餐厅';
  const params = {
    keywords: keyword,
    city,
    offset: 12,
    page: 1,
    extensions: 'all'
  };

  let path = '/place/text';
  if (location) {
    path = '/place/around';
    params.location = location;
    params.radius = radius;
    params.sortrule = 'distance';
  }

  const data = await requestAmap(path, params);
  const pois = data.pois || [];

  return pois.slice(0, 12).map((poi) => {
    const rating = Number(poi.biz_ext?.rating);
    return {
      id: poi.id,
      name: poi.name,
      address: Array.isArray(poi.address) ? poi.address.join('') : poi.address,
      area: poi.adname || poi.business_area || city,
      category,
      type: category,
      // 高德部分 POI 不返回评分时，使用 4.3 作为 MVP fallback 评分。
      rating: Number.isFinite(rating) && rating > 0 ? rating : 4.3,
      location: parseLocation(poi.location)
    };
  }).filter((poi) => poi.location);
}

export async function getTransitRoute({ origin, destination, city, mode = 'transit' }) {
  ensureWebKey();

  if (mode !== 'transit') {
    return null;
  }

  const data = await requestAmap('/direction/transit/integrated', {
    origin,
    destination,
    city,
    cityd: city,
    strategy: 0,
    extensions: 'base'
  });

  const transit = data.route?.transits?.[0];
  if (!transit?.duration) {
    return null;
  }

  return {
    durationMinutes: Math.ceil(Number(transit.duration) / 60),
    distanceMeters: Number(transit.distance || 0),
    mode,
    rawSummary: transit.segments?.map((segment) => segment.bus?.buslines?.[0]?.name).filter(Boolean).join(' / ') || '公交路线'
  };
}

async function requestAmap(path, params) {
  const url = new URL(`${AMAP_BASE_URL}${path}`);
  url.searchParams.set('key', process.env.AMAP_WEB_SERVICE_KEY);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`AMap request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== '1') {
    throw new Error(data.info || 'AMap API error');
  }

  return data;
}

function parseLocation(location) {
  if (!location || typeof location !== 'string') {
    return null;
  }

  const [lng, lat] = location.split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return { lng, lat };
}

function ensureWebKey() {
  if (!hasAmapWebKey()) {
    throw new Error('AMAP_WEB_SERVICE_KEY is not configured');
  }
}
