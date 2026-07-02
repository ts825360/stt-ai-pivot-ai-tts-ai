export async function fetchLiveWeather(place) {
  const response = await fetch(`/api/weather?lat=${encodeURIComponent(place.lat)}&lon=${encodeURIComponent(place.lng)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Weather API request failed.');
  }

  return data;
}

export async function fetchAiRecommendation({ recommendation, selectedRoute }) {
  const payload = {
    origin: recommendation.origin.name,
    destination: recommendation.destination.name,
    mode: recommendation.mode.label,
    weather: {
      feelsLike: recommendation.weatherModel.feelsLike,
      condition: recommendation.weatherModel.conditionLabel,
    },
    selectedRoute: {
      name: selectedRoute.name,
      type: selectedRoute.type,
      minutes: selectedRoute.minutes,
      walkingKm: selectedRoute.walkingKm,
      comfortScore: selectedRoute.comfortScore,
      recommendationScore: selectedRoute.recommendationScore,
      grade: selectedRoute.grade,
      exposureLabel: selectedRoute.exposureLabel,
      reasons: selectedRoute.reasons,
      breakdown: selectedRoute.breakdown,
    },
    comparedRoutes: recommendation.routes.map((route) => ({
      name: route.name,
      minutes: route.minutes,
      walkingKm: route.walkingKm,
      comfortScore: route.comfortScore,
      recommendationScore: route.recommendationScore,
      allowed: route.allowed,
    })),
  };

  const response = await fetch('/api/ai-recommendation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'OpenAI explanation request failed.');
  }

  return data;
}
