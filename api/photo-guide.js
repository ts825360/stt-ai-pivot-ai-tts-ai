import {
  callOpenAI,
  enforceContentLength,
  enforceMethod,
  enforceRateLimit,
  readJsonRequest,
  validatePhotoPayload,
} from '../server/coolpathApi.js';

const PHOTO_BODY_LIMIT_BYTES = 1_900_000;

export default {
  async fetch(request) {
    const methodError = enforceMethod(request, ['POST']);
    if (methodError) return methodError;

    const sizeError = enforceContentLength(request, PHOTO_BODY_LIMIT_BYTES);
    if (sizeError) return sizeError;

    const limited = enforceRateLimit(request, 'photo-guide');
    if (limited) return limited;

    const payload = await readJsonRequest(request, PHOTO_BODY_LIMIT_BYTES);
    const photoError = validatePhotoPayload(payload);
    if (photoError) return photoError;

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
      rateLimitScope: null,
      maxBodyBytes: PHOTO_BODY_LIMIT_BYTES,
    });
  },
};
