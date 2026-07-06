import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function extractResponseText(data) {
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

const asNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const roundValue = (value, precision = 0) => {
  const numericValue = asNumber(value);
  return numericValue === null ? null : Number(numericValue.toFixed(precision));
};

const staticMapCache = new Map();
const STATIC_MAP_CACHE_LIMIT = 80;
const STATIC_MAP_CACHE_TTL_MS = 5 * 60 * 1000;

async function geocodeWithNominatim(address) {
  const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
  nominatimUrl.searchParams.set('format', 'jsonv2');
  nominatimUrl.searchParams.set('q', address);
  nominatimUrl.searchParams.set('limit', '1');
  nominatimUrl.searchParams.set('accept-language', 'ko,en');

  const response = await fetch(nominatimUrl, {
    headers: {
      'User-Agent': 'CoolPath-AI-MVP/0.1 local development geocoder',
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
      'User-Agent': 'CoolPath-AI-MVP/0.1 local development reverse geocoder',
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

function getWeatherProvider(env, weatherKey) {
  const configuredProvider = env.VITE_WEATHER_PROVIDER || env.WEATHER_PROVIDER;
  if (configuredProvider) return configuredProvider.toLowerCase();
  return weatherKey?.startsWith('AIza') ? 'google' : 'openweather';
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

function coolPathLocalApi(env) {
  const weatherKey = env.VITE_WEATHER_API_KEY;
  const mapsKey = env.VITE_MAP_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;
  const openaiModel = env.OPENAI_MODEL || 'gpt-5.5';
  const openaiReasoningEffort = env.OPENAI_REASONING_EFFORT || 'low';
  const openaiTextVerbosity = env.OPENAI_TEXT_VERBOSITY || 'low';
  const weatherProvider = getWeatherProvider(env, weatherKey);

  return {
    name: 'coolpath-local-api',
    configureServer(server) {
      server.middlewares.use('/api/env-status', async (req, res) => {
        sendJson(res, 200, {
          weather: Boolean(weatherKey),
          maps: Boolean(mapsKey),
          openai: Boolean(openaiKey),
          openaiModel,
          openaiReasoningEffort,
          openaiTextVerbosity,
          weatherProvider,
        });
      });

      server.middlewares.use('/api/static-map', async (req, res) => {
        if (!mapsKey) {
          sendJson(res, 501, { error: 'VITE_MAP_API_KEY is not configured.' });
          return;
        }

        try {
          const requestUrl = new URL(req.url ?? '/', 'http://localhost');
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
            res.statusCode = cached.status;
            res.setHeader('Content-Type', cached.contentType);
            res.setHeader('Cache-Control', 'public, max-age=300');
            res.setHeader('X-CoolPath-Cache', 'HIT');
            res.end(cached.body);
            return;
          }

          const response = await fetch(mapUrl, {
            headers: {
              Referer: env.VITE_GOOGLE_MAPS_REFERRER || 'http://127.0.0.1:5173/',
            },
          });
          const body = Buffer.from(await response.arrayBuffer());
          const contentType = response.headers.get('content-type') || 'application/octet-stream';

          res.statusCode = response.status;
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', response.ok ? 'public, max-age=300' : 'no-store');
          res.setHeader('X-CoolPath-Cache', 'MISS');
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
          res.end(body);
        } catch (error) {
          sendJson(res, 502, { error: error.message || 'Static map proxy failed.' });
        }
      });

      server.middlewares.use('/api/geocode', async (req, res) => {
        if (!mapsKey) {
          sendJson(res, 501, { error: 'VITE_MAP_API_KEY is not configured.' });
          return;
        }

        try {
          const requestUrl = new URL(req.url ?? '/', 'http://localhost');
          const address = requestUrl.searchParams.get('address')?.trim();

          if (!address) {
            sendJson(res, 400, { error: 'address is required.' });
            return;
          }

          const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
          geocodeUrl.searchParams.set('address', address);
          geocodeUrl.searchParams.set('region', 'fr');
          geocodeUrl.searchParams.set('language', 'ko');
          geocodeUrl.searchParams.set('key', mapsKey);

          const response = await fetch(geocodeUrl, {
            headers: {
              Referer: env.VITE_GOOGLE_MAPS_REFERRER || 'http://127.0.0.1:5173/',
            },
          });
          const data = await response.json();
          const firstResult = data.results?.[0];

          if (!response.ok || data.status !== 'OK' || !firstResult?.geometry?.location) {
            const fallback = await geocodeWithNominatim(address);

            if (fallback) {
              sendJson(res, 200, fallback);
              return;
            }

            sendJson(res, 404, {
              error: data.error_message || data.status || 'Address was not found.',
            });
            return;
          }

          sendJson(res, 200, {
            source: 'Google Geocoding API',
            formattedAddress: firstResult.formatted_address,
            lat: firstResult.geometry.location.lat,
            lng: firstResult.geometry.location.lng,
            placeId: firstResult.place_id,
          });
        } catch (error) {
          sendJson(res, 502, { error: error.message || 'Geocoding proxy failed.' });
        }
      });

      server.middlewares.use('/api/reverse-geocode', async (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '/', 'http://localhost');
          const lat = asNumber(requestUrl.searchParams.get('lat'));
          const lng = asNumber(requestUrl.searchParams.get('lng'));

          if (lat === null || lng === null) {
            sendJson(res, 400, { error: 'lat and lng are required.' });
            return;
          }

          if (mapsKey) {
            const geocodeUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
            geocodeUrl.searchParams.set('latlng', `${lat},${lng}`);
            geocodeUrl.searchParams.set('language', 'ko');
            geocodeUrl.searchParams.set('key', mapsKey);

            const response = await fetch(geocodeUrl, {
              headers: {
                Referer: env.VITE_GOOGLE_MAPS_REFERRER || 'http://127.0.0.1:5173/',
              },
            });
            const data = await response.json();
            const firstResult = data.results?.[0];

            if (response.ok && data.status === 'OK' && firstResult?.formatted_address) {
              sendJson(res, 200, {
                source: 'Google Geocoding API',
                formattedAddress: firstResult.formatted_address,
                lat,
                lng,
                placeId: firstResult.place_id,
              });
              return;
            }
          }

          const fallback = await reverseGeocodeWithNominatim(lat, lng);
          if (fallback) {
            sendJson(res, 200, fallback);
            return;
          }

          sendJson(res, 404, { error: 'Address was not found for current position.' });
        } catch (error) {
          sendJson(res, 502, { error: error.message || 'Reverse geocoding proxy failed.' });
        }
      });

      server.middlewares.use('/api/weather', async (req, res) => {
        if (!weatherKey) {
          sendJson(res, 501, { error: 'VITE_WEATHER_API_KEY is not configured.' });
          return;
        }

        try {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const lat = url.searchParams.get('lat');
          const lon = url.searchParams.get('lon');

          if (!lat || !lon) {
            sendJson(res, 400, { error: 'lat and lon are required.' });
            return;
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

          const fetchOptions =
            weatherProvider === 'google'
              ? {
                  headers: {
                    Referer: env.VITE_GOOGLE_MAPS_REFERRER || 'http://127.0.0.1:5173/',
                  },
                }
              : undefined;
          const response = await fetch(weatherUrl, fetchOptions);
          const data = await response.json();

          if (!response.ok) {
            sendJson(res, response.status, {
              error: data?.error?.message || data?.message || 'Weather API request failed.',
            });
            return;
          }

          sendJson(res, 200, weatherProvider === 'google' ? normalizeGoogleWeather(data) : normalizeOpenWeather(data));
        } catch (error) {
          sendJson(res, 502, { error: error.message || 'Weather proxy failed.' });
        }
      });

      server.middlewares.use('/api/ai-recommendation', async (req, res) => {
        if (!openaiKey) {
          sendJson(res, 501, { error: 'OPENAI_API_KEY is not configured.' });
          return;
        }

        try {
          const payload = await readJson(req);
          const requestBody = {
            model: openaiModel,
            input: [
              {
                role: 'system',
                content:
                  'You are the CoolPath AI route recommendation explainer. Write a natural Korean explanation in 2 to 3 sentences using only the provided route scores and conditions. Do not overclaim precision; frame this as an MVP estimation model.',
              },
              {
                role: 'user',
                content: JSON.stringify(payload),
              },
            ],
            max_output_tokens: 260,
          };

          if (openaiModel.startsWith('gpt-5')) {
            requestBody.reasoning = { effort: openaiReasoningEffort };
            requestBody.text = { verbosity: openaiTextVerbosity };
          }

          const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          const data = await response.json();

          if (!response.ok) {
            sendJson(res, response.status, {
              error: data?.error?.message || 'OpenAI request failed.',
            });
            return;
          }

          sendJson(res, 200, {
            source: `OpenAI ${openaiModel}`,
            text: extractResponseText(data),
          });
        } catch (error) {
          sendJson(res, 502, { error: error.message || 'OpenAI proxy failed.' });
        }
      });

      server.middlewares.use('/api/travel-guide', async (req, res) => {
        if (!openaiKey) {
          sendJson(res, 501, { error: 'OPENAI_API_KEY is not configured.' });
          return;
        }

        try {
          const payload = await readJson(req);
          const requestBody = {
            model: openaiModel,
            input: [
              {
                role: 'system',
                content:
                  'You are a Korean travel guide for Paris visitors using CoolPath AI. Answer in natural Korean. Use the provided destination, route, weather, planned places, and personal preference only. Give practical guidance for route choice, nearby rests, subway or bus sign checks, and photo-based navigation. Keep the answer under 5 concise sentences and avoid pretending to see a photo unless image details were provided.',
              },
              {
                role: 'user',
                content: JSON.stringify(payload),
              },
            ],
            max_output_tokens: 360,
          };

          if (openaiModel.startsWith('gpt-5')) {
            requestBody.reasoning = { effort: openaiReasoningEffort };
            requestBody.text = { verbosity: openaiTextVerbosity };
          }

          const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          const data = await response.json();

          if (!response.ok) {
            sendJson(res, response.status, {
              error: data?.error?.message || 'OpenAI travel guide request failed.',
            });
            return;
          }

          sendJson(res, 200, {
            source: `OpenAI ${openaiModel}`,
            text: extractResponseText(data),
          });
        } catch (error) {
          sendJson(res, 502, { error: error.message || 'Travel guide proxy failed.' });
        }
      });

      server.middlewares.use('/api/photo-guide', async (req, res) => {
        if (!openaiKey) {
          sendJson(res, 501, { error: 'OPENAI_API_KEY is not configured.' });
          return;
        }

        try {
          const payload = await readJson(req);
          if (!payload.imageDataUrl || !String(payload.imageDataUrl).startsWith('data:image/')) {
            sendJson(res, 400, { error: 'imageDataUrl is required.' });
            return;
          }

          const requestBody = {
            model: openaiModel,
            input: [
              {
                role: 'system',
                content:
                  'You are an indoor/outdoor navigation assistant for Korean travelers in Paris. Analyze the camera image for signs, station names, arrows, bus stop names, entrances, exits, landmarks, and obstacles. Answer in Korean. Do not claim certainty when text is unclear. Give one direct next action first, then one short reason. Keep it under 4 sentences.',
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: JSON.stringify({
                      destination: payload.destination,
                      route: payload.route,
                      navigation: payload.navigation,
                    }),
                  },
                  {
                    type: 'input_image',
                    image_url: payload.imageDataUrl,
                  },
                ],
              },
            ],
            max_output_tokens: 320,
          };

          if (openaiModel.startsWith('gpt-5')) {
            requestBody.reasoning = { effort: openaiReasoningEffort };
            requestBody.text = { verbosity: openaiTextVerbosity };
          }

          const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          const data = await response.json();

          if (!response.ok) {
            sendJson(res, response.status, {
              error: data?.error?.message || 'OpenAI photo guide request failed.',
            });
            return;
          }

          sendJson(res, 200, {
            source: `OpenAI ${openaiModel}`,
            text: extractResponseText(data),
          });
        } catch (error) {
          sendJson(res, 502, { error: error.message || 'Photo guide proxy failed.' });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useHttps = mode === 'https' || env.VITE_DEV_HTTPS === 'true';

  return {
    plugins: [react(), useHttps ? basicSsl() : null, coolPathLocalApi(env)].filter(Boolean),
    server: {
      allowedHosts: true,
    },
  };
});
