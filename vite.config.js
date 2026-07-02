import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
  const openaiKey = env.OPENAI_API_KEY;
  const openaiModel = env.OPENAI_MODEL || 'gpt-4.1-mini';
  const weatherProvider = getWeatherProvider(env, weatherKey);

  return {
    name: 'coolpath-local-api',
    configureServer(server) {
      server.middlewares.use('/api/env-status', async (req, res) => {
        sendJson(res, 200, {
          weather: Boolean(weatherKey),
          maps: Boolean(env.VITE_MAP_API_KEY),
          openai: Boolean(openaiKey),
          openaiModel,
          weatherProvider,
        });
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
          const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
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
            }),
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
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), coolPathLocalApi(env)],
  };
});
