import { callOpenAI } from '../server/coolpathApi.js';

export default {
  async fetch(request) {
    return callOpenAI(request, {
      system:
        'You are the CoolPath AI route recommendation explainer. Write a natural Korean explanation in 2 to 3 sentences using only the provided route scores and conditions. Do not overclaim precision; frame this as an MVP estimation model.',
      maxOutputTokens: 260,
      errorLabel: 'OpenAI',
    });
  },
};
