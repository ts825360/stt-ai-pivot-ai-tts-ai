import { reverseGeocode } from '../server/coolpathApi.js';

export default {
  async fetch(request) {
    return reverseGeocode(request);
  },
};
