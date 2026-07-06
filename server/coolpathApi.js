const staticMapCache = new Map();
const STATIC_MAP_CACHE_LIMIT = 80;
const STATIC_MAP_CACHE_TTL_MS = 5 * 60 * 1000;

export function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function readJsonRequest(request) {
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

    const response = await fetch(
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

export async function getStaticMap(request) {
  const { mapsKey, mapsReferrer } = getRuntimeEnv();

  if (!mapsKey) {
    return jsonResponse({ error: 'VITE_MAP_API_KEY is not configured.' }, 501);
  }

  try {
    const requestUrl = new URL(request.url);
    const mapUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');

    for (const [key, value] of requestUrl.searchParams) {
      if (key !== 'key') {
        mapUrl.searchParams.append(key, value);
      }
    }
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

    const response = await fetch(mapUrl, { headers: buildReferrerHeaders(mapsReferrer) });
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

  const response = await fetch(nominatimUrl, {
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

  const response = await fetch(nominatimUrl, {
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

    const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    geocodeUrl.searchParams.set('address', address);
    geocodeUrl.searchParams.set('region', 'fr');
    geocodeUrl.searchParams.set('language', 'ko');
    geocodeUrl.searchParams.set('key', mapsKey);

    const response = await fetch(geocodeUrl, { headers: buildReferrerHeaders(mapsReferrer) });
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
  const { mapsKey, mapsReferrer } = getRuntimeEnv();

  try {
    const requestUrl = new URL(request.url);
    const lat = asNumber(requestUrl.searchParams.get('lat'));
    const lng = asNumber(requestUrl.searchParams.get('lng'));

    if (lat === null || lng === null) {
      return jsonResponse({ error: 'lat and lng are required.' }, 400);
    }

    if (mapsKey) {
      const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geocodeUrl.searchParams.set('latlng', `${lat},${lng}`);
      geocodeUrl.searchParams.set('language', 'ko');
      geocodeUrl.searchParams.set('key', mapsKey);

      const response = await fetch(geocodeUrl, { headers: buildReferrerHeaders(mapsReferrer) });
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

export async function callOpenAI(request, { system, payload, userContent, maxOutputTokens, errorLabel }) {
  const { openaiKey, openaiModel } = getRuntimeEnv();

  if (!openaiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY is not configured.' }, 501);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
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
    });
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
