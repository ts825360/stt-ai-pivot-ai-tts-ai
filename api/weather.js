import { getWeather } from '../server/coolpathApi.js';

export default {
  async fetch(request) {
    return getWeather(request);
  },
};
