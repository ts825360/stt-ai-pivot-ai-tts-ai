import { getStaticMap } from '../server/coolpathApi.js';

export default {
  async fetch(request) {
    return getStaticMap(request);
  },
};
