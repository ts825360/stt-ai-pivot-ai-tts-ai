const staticMapCache = new Map();
const rateLimitBuckets = new Map();
const STATIC_MAP_CACHE_LIMIT = 80;
const STATIC_MAP_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RATE_LIMIT_BUCKETS = 1200;
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const OPENAI_FETCH_TIMEOUT_MS = 14000;
const TEXT_API_BODY_LIMIT_BYTES = 36 * 1024;
const PHOTO_API_BODY_LIMIT_BYTES = 1_900_000;
const PHOTO_DATA_URL_LIMIT_CHARS = 1_750_000;
const STATIC_MAP_QUERY_LIMIT_CHARS = 4600;

const RATE_LIMITS = {
  weather: { limit: 40, windowMs: 60 * 1000 },
  geocode: { limit: 24, windowMs: 60 * 1000 },
  'static-map': { limit: 90, windowMs: 60 * 1000 },
  'ai-recommendation': { limit: 14, windowMs: 60 * 1000 },
  'travel-guide': { limit: 10, windowMs: 60 * 1000 },
  'photo-guide': { limit: 5, windowMs: 60 * 1000 },
  openai: { limit: 18, windowMs: 60 * 1000 },
};

const STATIC_MAP_ALLOWED_PARAMS = new Set([
  'center',
  'zoom',
  'size',
  'scale',
  'format',
  'maptype',
  'language',
  'region',
  'markers',
  'path',
  'style',
  'visible',
]);

export function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export async function readJsonRequest(request, maxBytes = TEXT_API_BODY_LIMIT_BYTES) {
  const sizeError = enforceContentLength(request, maxBytes);
  if (sizeError) {
    throw new Error('REQUEST_TOO_LARGE');
  }

  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function getRuntimeEnv() {
  return {
    weatherKey: process.env.VITE_WEATHER_API_KEY,
    weatherProvider: getWeatherProvider(process.env, process.env.VITE_WEATHER_API_KEY),
    mapsKey: process.env.VITE_MAP_API_KEY,
    mapsReferrer: process.env.VITE_GOOGLE_MAPS_REFERRER || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL,
    openaiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-5.5',
    openaiReasoningEffort: process.env.OPENAI_REASONING_EFFORT || 'low',
    openaiTextVerbosity: process.env.OPENAI_TEXT_VERBOSITY || 'low',
  };
}

export function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const texts = [];
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string') texts.push(content.text);
    }
  }
  return texts.join('\n').trim();
}

export const asNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const roundValue = (value, precision = 0) => {
  const numericValue = asNumber(value);
  return numericValue === null ? null : Number(numericValue.toFixed(precision));
};

function getClientIdentity(request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwarded ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    'unknown-client'
  );
}

function cleanupRateLimitBuckets(now) {
  if (rateLimitBuckets.size < MAX_RATE_LIMIT_BUCKETS) return;

  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }

  if (rateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    const keysToDrop = [...rateLimitBuckets.keys()].slice(0, Math.ceil(MAX_RATE_LIMIT_BUCKETS * 0.15));
    for (const key of keysToDrop) rateLimitBuckets.delete(key);
  }
}

export function enforceMethod(request, allowedMethods) {
  if (allowedMethods.includes(request.method)) return null;
  return jsonResponse({ error: `Method ${request.method} is not allowed.` }, 405, {
    Allow: allowedMethods.join(', '),
  });
}

export function enforceContentLength(request, maxBytes) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    return jsonResponse({ error: 'Request body is too large for this prototype endpoint.' }, 413);
  }
  return null;
}

export function enforceRateLimit(request, scope, override) {
  if (process.env.COOLPATH_DEMO_GUARD === 'off') return null;

  const config = override ?? RATE_LIMITS[scope] ?? RATE_LIMITS.openai;
  const now = Date.now();
  cleanupRateLimitBuckets(now);

  const key = `${scope}:${getClientIdentity(request)}`;
  const current = rateLimitBuckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + config.windowMs };

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  if (bucket.count <= config.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return jsonResponse(
    {
      error: '요청이 많아 잠시 보호 모드로 제한했습니다. 1분 뒤 다시 시도해 주세요.',
    },
    429,
    { 'Retry-After': String(retryAfter) },
  );
}

function isValidCoordinate(lat, lng) {
  return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function getWeatherProvider(env, weatherKey) {
  const configuredProvider = env.VITE_WEATHER_PROVIDER || env.WEATHER_PROVIDER;
  if (configuredProvider) return configuredProvider.toLowerCase();
  return weatherKey?.startsWith('AIza') ? 'google' : 'openweather';
}

function buildReferrerHeaders(mapsReferrer) {
  const referrer = mapsReferrer
    ? mapsReferrer.startsWith('http')
      ? mapsReferrer
      : `https://${mapsReferrer}/`
    : 'https://coolpath-ai.vercel.app/';

  return { Referer: referrer };
}

function normalizeGoogleWeather(data) {
  const windValue = asNumber(data.wind?.speed?.value) ?? 0;
  const windUnit = data.wind?.speed?.unit;
  const windMps =
    windUnit === 'KILOMETERS_PER_HOUR' ? windValue / 3.6 : windUnit === 'MILES_PER_HOUR' ? windValue / 2.237 : windValue;
  const temperature = roundValue(data.temperature?.degrees ?? data.feelsLikeTemperature?.degrees);

  if (temperature === null) {
    throw new Error('Google Weather response did not include temperature.');
  }

  return {
    source: 'Google Weather currentConditions',
    city: data.timeZone?.id ?? 'Google Weather',
    condition: data.weatherCondition?.description?.text ?? data.weatherCondition?.type ?? 'unknown',
    temperature,
    feelsLike: roundValue(data.feelsLikeTemperature?.degrees ?? temperature),
    humidity: roundValue(data.relativeHumidity ?? 50),
    wind: roundValue(windMps, 1),
    uvIndex: roundValue(data.uvIndex),
    cloudCover: roundValue(data.cloudCover),
    heatIndex: roundValue(data.heatIndex?.degrees),
  };
}

function normalizeOpenWeather(data) {
  return {
    source: 'OpenWeather current weather',
    city: data.name,
    condition: data.weather?.[0]?.description ?? 'unknown',
    temperature: Math.round(data.main.temp),
    feelsLike: roundValue(data.main.feels_like),
    humidity: Math.round(data.main.humidity),
    wind: Number((data.wind?.speed ?? 0).toFixed(1)),
    uvIndex: null,
    cloudCover: roundValue(data.clouds?.all),
    heatIndex: null,
  };
}

export async function getWeather(request) {
  const methodError = enforceMethod(request, ['GET']);
  if (methodError) return methodError;

  const limited = enforceRateLimit(request, 'weather');
  if (limited) return limited;

  const { weatherKey, weatherProvider, mapsReferrer } = getRuntimeEnv();

  if (!weatherKey) {
    return jsonResponse({ error: 'VITE_WEATHER_API_KEY is not configured.' }, 501);
  }

  try {
    const url = new URL(request.url);
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');

    if (!lat || !lon) {
      return jsonResponse({ error: 'lat and lon are required.' }, 400);
    }

    const latNumber = asNumber(lat);
    const lonNumber = asNumber(lon);
    if (!isValidCoordinate(latNumber, lonNumber)) {
      return jsonResponse({ error: 'lat and lon must be valid coordinates.' }, 400);
    }

    const weatherUrl =
      weatherProvider === 'google'
        ? new URL('https://weather.googleapis.com/v1/currentConditions:lookup')
        : new URL('https://api.openweathermap.org/data/2.5/weather');

    if (weatherProvider === 'google') {
      weatherUrl.searchParams.set('key', weatherKey);
      weatherUrl.searchParams.set('location.latitude', lat);
      weatherUrl.searchParams.set('location.longitude', lon);
      weatherUrl.searchParams.set('unitsSystem', 'METRIC');
      weatherUrl.searchParams.set('languageCode', 'ko');
    } else {
      weatherUrl.searchParams.set('lat', lat);
      weatherUrl.searchParams.set('lon', lon);
      weatherUrl.searchParams.set('appid', weatherKey);
      weatherUrl.searchParams.set('units', 'metric');
      weatherUrl.searchParams.set('lang', 'kr');
    }

    const response = await fetchWithTimeout(
      weatherUrl,
      weatherProvider === 'google' ? { headers: buildReferrerHeaders(mapsReferrer) } : undefined,
    );
    const data = await response.json();

    if (!response.ok) {
      return jsonResponse(
        {
          error: data?.error?.message || data?.message || 'Weather API request failed.',
        },
        response.status,
      );
    }

    return jsonResponse(weatherProvider === 'google' ? normalizeGoogleWeather(data) : normalizeOpenWeather(data));
  } catch (error) {
    return jsonResponse({ error: error.message || 'Weather proxy failed.' }, 502);
  }
}

function validateStaticMapParam(key, value, count) {
  if (!STATIC_MAP_ALLOWED_PARAMS.has(key)) {
    return `${key} is not allowed for static map requests.`;
  }

  if (count > 10) {
    return `${key} was repeated too many times.`;
  }

  if (value.length > 1600) {
    return `${key} is too long.`;
  }

  if (key === 'zoom') {
    const zoom = Number(value);
    if (!Number.isInteger(zoom) || zoom < 1 || zoom > 21) return 'zoom must be an integer from 1 to 21.';
  }

  if (key === 'size') {
    const match = /^(\d{2,4})x(\d{2,4})$/.exec(value);
    if (!match) return 'size must use WIDTHxHEIGHT format.';
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width < 80 || height < 80 || width > 800 || height > 800) return 'size is outside the allowed range.';
  }

  if (key === 'scale' && !['1', '2'].includes(value)) {
    return 'scale must be 1 or 2.';
  }

  if (key === 'maptype' && !['roadmap', 'satellite', 'terrain', 'hybrid'].includes(value)) {
    return 'maptype is not supported.';
  }

  if (key === 'format' && !['png', 'png8', 'png32', 'gif', 'jpg', 'jpg-baseline'].includes(value)) {
    return 'format is not supported.';
  }

  if (key === 'language' && !/^[a-z]{2}(-[A-Z]{2})?$/.test(value)) {
    return 'language is invalid.';
  }

  if (key === 'region' && !/^[A-Za-z]{2}$/.test(value)) {
    return 'region is invalid.';
  }

  return null;
}

function appendSafeStaticMapParams(requestUrl, mapUrl) {
  if (requestUrl.search.length > STATIC_MAP_QUERY_LIMIT_CHARS) {
    return 'Static map query is too long.';
  }

  const counts = new Map();
  for (const [key, value] of requestUrl.searchParams) {
    if (key === 'key') continue;

    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    const validationError = validateStaticMapParam(key, value, count);
    if (validationError) return validationError;

    mapUrl.searchParams.append(key, value);
  }

  return null;
}

export async function getStaticMap(request) {
  const methodError = enforceMethod(request, ['GET']);
  if (methodError) return methodError;

  const limited = enforceRateLimit(request, 'static-map');
  if (limited) return limited;

  const { mapsKey, mapsReferrer } = getRuntimeEnv();

  if (!mapsKey) {
    return jsonResponse({ error: 'VITE_MAP_API_KEY is not configured.' }, 501);
  }

  try {
    const requestUrl = new URL(request.url);
    const mapUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');

    const validationError = appendSafeStaticMapParams(requestUrl, mapUrl);
    if (validationError) return jsonResponse({ error: validationError }, 400);

    mapUrl.searchParams.set('key', mapsKey);

    const cacheKey = mapUrl.toString();
    const cached = staticMapCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=300',
          'X-CoolPath-Cache': 'HIT',
        },
      });
    }

    const response = await fetchWithTimeout(mapUrl, { headers: buildReferrerHeaders(mapsReferrer) });
    const body = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    if (response.ok) {
      if (staticMapCache.size >= STATIC_MAP_CACHE_LIMIT) {
        const oldestKey = staticMapCache.keys().next().value;
        if (oldestKey) staticMapCache.delete(oldestKey);
      }
      staticMapCache.set(cacheKey, {
        status: response.status,
        contentType,
        body,
        expiresAt: Date.now() + STATIC_MAP_CACHE_TTL_MS,
      });
    }

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': response.ok ? 'public, max-age=300' : 'no-store',
        'X-CoolPath-Cache': 'MISS',
      },
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Static map proxy failed.' }, 502);
  }
}

async function geocodeWithNominatim(address) {
  const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
  nominatimUrl.searchParams.set('format', 'jsonv2');
  nominatimUrl.searchParams.set('q', address);
  nominatimUrl.searchParams.set('limit', '1');
  nominatimUrl.searchParams.set('accept-language', 'ko,en');

  const response = await fetchWithTimeout(nominatimUrl, {
    headers: {
      'User-Agent': 'CoolPath-AI-MVP/0.1 production geocoder',
      Accept: 'application/json',
    },
  });
  const data = await response.json();
  const firstResult = Array.isArray(data) ? data[0] : null;

  if (!response.ok || !firstResult?.lat || !firstResult?.lon) {
    return null;
  }

  return {
    source: 'OpenStreetMap Nominatim',
    formattedAddress: firstResult.display_name,
    lat: Number(firstResult.lat),
    lng: Number(firstResult.lon),
    placeId: firstResult.place_id ? String(firstResult.place_id) : null,
  };
}

async function reverseGeocodeWithNominatim(lat, lng) {
  const nominatimUrl = new URL('https://nominatim.openstreetmap.org/reverse');
  nominatimUrl.searchParams.set('format', 'jsonv2');
  nominatimUrl.searchParams.set('lat', String(lat));
  nominatimUrl.searchParams.set('lon', String(lng));
  nominatimUrl.searchParams.set('zoom', '18');
  nominatimUrl.searchParams.set('accept-language', 'ko,en');

  const response = await fetchWithTimeout(nominatimUrl, {
    headers: {
      'User-Agent': 'CoolPath-AI-MVP/0.1 production reverse geocoder',
      Accept: 'application/json',
    },
  });
  const data = await response.json();

  if (!response.ok || !data?.display_name) {
    return null;
  }

  return {
    source: 'OpenStreetMap Nominatim',
    formattedAddress: data.display_name,
    lat: Number(lat),
    lng: Number(lng),
    placeId: data.place_id ? String(data.place_id) : null,
  };
}

export async function geocode(request) {
  const methodError = enforceMethod(request, ['GET']);
  if (methodError) return methodError;

  const limited = enforceRateLimit(request, 'geocode');
  if (limited) return limited;

  const { mapsKey, mapsReferrer } = getRuntimeEnv();

  if (!mapsKey) {
    return jsonResponse({ error: 'VITE_MAP_API_KEY is not configured.' }, 501);
  }

  try {
    const requestUrl = new URL(request.url);
    const address = requestUrl.searchParams.get('address')?.trim();

    if (!address) {
      return jsonResponse({ error: 'address is required.' }, 400);
    }

    if (address.length > 220 || /[\u0000-\u001f]/.test(address)) {
      return jsonResponse({ error: 'address is too long or contains invalid control characters.' }, 400);
    }

    const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    geocodeUrl.searchParams.set('address', address);
    geocodeUrl.searchParams.set('region', 'fr');
    geocodeUrl.searchParams.set('language', 'ko');
    geocodeUrl.searchParams.set('key', mapsKey);

    const response = await fetchWithTimeout(geocodeUrl, { headers: buildReferrerHeaders(mapsReferrer) });
    const data = await response.json();
    const firstResult = data.results?.[0];

    if (!response.ok || data.status !== 'OK' || !firstResult?.geometry?.location) {
      const fallback = await geocodeWithNominatim(address);

      if (fallback) {
        return jsonResponse(fallback);
      }

      return jsonResponse(
        {
          error: data.error_message || data.status || 'Address was not found.',
        },
        404,
      );
    }

    return jsonResponse({
      source: 'Google Geocoding API',
      formattedAddress: firstResult.formatted_address,
      lat: firstResult.geometry.location.lat,
      lng: firstResult.geometry.location.lng,
      placeId: firstResult.place_id,
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Geocoding proxy failed.' }, 502);
  }
}

export async function reverseGeocode(request) {
  const methodError = enforceMethod(request, ['GET']);
  if (methodError) return methodError;

  const limited = enforceRateLimit(request, 'geocode');
  if (limited) return limited;

  const { mapsKey, mapsReferrer } = getRuntimeEnv();

  try {
    const requestUrl = new URL(request.url);
    const lat = asNumber(requestUrl.searchParams.get('lat'));
    const lng = asNumber(requestUrl.searchParams.get('lng'));

    if (lat === null || lng === null) {
      return jsonResponse({ error: 'lat and lng are required.' }, 400);
    }

    if (!isValidCoordinate(lat, lng)) {
      return jsonResponse({ error: 'lat and lng must be valid coordinates.' }, 400);
    }

    if (mapsKey) {
      const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geocodeUrl.searchParams.set('latlng', `${lat},${lng}`);
      geocodeUrl.searchParams.set('language', 'ko');
      geocodeUrl.searchParams.set('key', mapsKey);

      const response = await fetchWithTimeout(geocodeUrl, { headers: buildReferrerHeaders(mapsReferrer) });
      const data = await response.json();
      const firstResult = data.results?.[0];

      if (response.ok && data.status === 'OK' && firstResult?.formatted_address) {
        return jsonResponse({
          source: 'Google Geocoding API',
          formattedAddress: firstResult.formatted_address,
          lat,
          lng,
          placeId: firstResult.place_id,
        });
      }
    }

    const fallback = await reverseGeocodeWithNominatim(lat, lng);
    if (fallback) {
      return jsonResponse(fallback);
    }

    return jsonResponse({ error: 'Address was not found for current position.' }, 404);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Reverse geocoding proxy failed.' }, 502);
  }
}

function buildOpenAIRequest({ system, userContent, maxOutputTokens }) {
  const { openaiModel, openaiReasoningEffort, openaiTextVerbosity } = getRuntimeEnv();
  const requestBody = {
    model: openaiModel,
    input: [
      {
        role: 'system',
        content: system,
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    max_output_tokens: maxOutputTokens,
  };

  if (openaiModel.startsWith('gpt-5')) {
    requestBody.reasoning = { effort: openaiReasoningEffort };
    requestBody.text = { verbosity: openaiTextVerbosity };
  }

  return requestBody;
}

export function validatePhotoPayload(payload) {
  if (!payload.imageDataUrl || !String(payload.imageDataUrl).startsWith('data:image/')) {
    return jsonResponse({ error: 'imageDataUrl is required.' }, 400);
  }

  if (String(payload.imageDataUrl).length > PHOTO_DATA_URL_LIMIT_CHARS) {
    return jsonResponse({ error: 'Image payload is too large for the prototype guard.' }, 413);
  }

  return null;
}

export async function callOpenAI(
  request,
  { system, payload, userContent, maxOutputTokens, errorLabel, rateLimitScope = 'openai', maxBodyBytes = TEXT_API_BODY_LIMIT_BYTES },
) {
  const methodError = enforceMethod(request, ['POST']);
  if (methodError) return methodError;

  const sizeError = enforceContentLength(request, maxBodyBytes);
  if (sizeError) return sizeError;

  if (rateLimitScope) {
    const limited = enforceRateLimit(request, rateLimitScope);
    if (limited) return limited;
  }

  const { openaiKey, openaiModel } = getRuntimeEnv();

  if (!openaiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY is not configured.' }, 501);
  }

  try {
    const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildOpenAIRequest({
          system,
          userContent: userContent ?? JSON.stringify(payload ?? (await readJsonRequest(request))),
          maxOutputTokens,
        }),
      ),
    }, OPENAI_FETCH_TIMEOUT_MS);
    const data = await response.json();

    if (!response.ok) {
      return jsonResponse(
        {
          error: data?.error?.message || `${errorLabel} request failed.`,
        },
        response.status,
      );
    }

    return jsonResponse({
      source: `OpenAI ${openaiModel}`,
      text: extractResponseText(data),
    });
  } catch (error) {
    return jsonResponse({ error: error.message || `${errorLabel} proxy failed.` }, 502);
  }
}
