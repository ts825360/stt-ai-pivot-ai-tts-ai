import { callOpenAI, jsonResponse, readJsonRequest } from '../server/coolpathApi.js';

export default {
  async fetch(request) {
    const payload = await readJsonRequest(request);

    if (!payload.imageDataUrl || !String(payload.imageDataUrl).startsWith('data:image/')) {
      return jsonResponse({ error: 'imageDataUrl is required.' }, 400);
    }

    return callOpenAI(request, {
      system:
        'You are an indoor/outdoor navigation assistant for Korean travelers in Paris. Analyze the camera image for signs, station names, arrows, bus stop names, entrances, exits, landmarks, and obstacles. Answer in Korean. Do not claim certainty when text is unclear. Give one direct next action first, then one short reason. Keep it under 4 sentences.',
      userContent: [
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
      maxOutputTokens: 320,
      errorLabel: 'Photo guide',
    });
  },
};
