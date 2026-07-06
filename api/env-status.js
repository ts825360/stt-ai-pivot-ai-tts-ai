import { getRuntimeEnv, jsonResponse } from '../server/coolpathApi.js';

export default {
  async fetch() {
    const env = getRuntimeEnv();

    return jsonResponse({
      weather: Boolean(env.weatherKey),
      maps: Boolean(env.mapsKey),
      openai: Boolean(env.openaiKey),
      openaiModel: env.openaiModel,
      openaiReasoningEffort: env.openaiReasoningEffort,
      openaiTextVerbosity: env.openaiTextVerbosity,
      weatherProvider: env.weatherProvider,
    });
  },
};
