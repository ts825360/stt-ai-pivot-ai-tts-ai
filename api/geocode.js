import { geocode } from '../server/coolpathApi.js';

export default {
  async fetch(request) {
    return geocode(request);
  },
};
