import { timeSlots, userModes } from '../data/parisPlaces.js';

const routePalette = {
  direct: '#de6b48',
  metro: '#1ea7a1',
  shade: '#6b8e23',
  riverside: '#3a84b4',
  bus: '#5c6bc0',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const clamp01 = (value) => clamp(value, 0, 1);
const round = (value, precision = 0) => Number(value.toFixed(precision));

function findById(collection, id) {
  return collection.find((item) => item.id === id) ?? collection[0];
}

function distanceKm(origin, destination) {
  const dx = ((destination.x - origin.x) / 100) * 8.9;
  const dy = ((destination.y - origin.y) / 100) * 9.5;
  return clamp(Math.sqrt(dx * dx + dy * dy) * 1.18, 0.9, 7.8);
}

function midpoint(origin, destination, offsetX = 0, offsetY = 0) {
  return {
    x: clamp((origin.x + destination.x) / 2 + offsetX, 8, 92),
    y: clamp((origin.y + destination.y) / 2 + offsetY, 8, 92),
  };
}

function routePoint(place, label = place.shortName) {
  return {
    x: place.x,
    y: place.y,
    label,
  };
}

function walkMinutes(km) {
  return (km / 4.7) * 60;
}

function createCandidateRoutes(origin, destination) {
  const baseKm = distanceKm(origin, destination);
  const avgShade = (origin.shadeProfile + destination.shadeProfile) / 2;
  const avgCrowd = (origin.crowdProfile + destination.crowdProfile) / 2;
  const hasHill = destination.id === 'montmartre' || origin.id === 'montmartre';
  const directWalkKm = baseKm * 1.05;
  const metroWalkKm = clamp(baseKm * 0.28 + 0.35, 0.65, 1.65);
  const shadeWalkKm = clamp(baseKm * 0.78 + 0.45, 1.1, 6.8);
  const riversideWalkKm = clamp(baseKm * 0.74 + 0.72, 1.4, 7.2);
  const busWalkKm = clamp(baseKm * 0.22 + 0.45, 0.65, 1.55);

  const gardenAnchor = {
    ...midpoint(origin, destination, destination.x > origin.x ? -9 : 9, 4),
    label: '공원/골목 우회',
  };
  const riverAnchor = {
    ...midpoint(origin, destination, 5, 11),
    label: '세느강 바람길',
  };
  const metroAnchorA = {
    ...midpoint(origin, destination, -7, -6),
    label: 'Metro 진입',
  };
  const metroAnchorB = {
    ...midpoint(origin, destination, 8, -2),
    label: '하차 후 이동',
  };
  const busAnchor = {
    ...midpoint(origin, destination, 2, 12),
    label: '버스 정류장',
  };

  return [
    {
      id: 'direct',
      name: '최단 도보',
      type: '도보',
      color: routePalette.direct,
      minutes: Math.round(walkMinutes(directWalkKm) + 2),
      walkingKm: round(directWalkKm, 1),
      roadWidthM: 7,
      buildingDensity: clamp(avgShade * 0.72, 0.18, 0.55),
      riverAdjacent: false,
      usesTransit: false,
      transfers: 0,
      waitMinutes: 0,
      crowdLevel: clamp(avgCrowd + 0.03, 0.25, 0.95),
      slopeStress: hasHill ? 0.18 : 0.04,
      routePoints: [routePoint(origin), midpoint(origin, destination), routePoint(destination)],
      tags: ['가장 빠름', '야외 노출 큼'],
    },
    {
      id: 'metro',
      name: '메트로 혼합',
      type: '도보 + Metro',
      color: routePalette.metro,
      minutes: Math.round(walkMinutes(metroWalkKm) + baseKm * 4.8 + 8),
      walkingKm: round(metroWalkKm, 1),
      roadWidthM: 8,
      buildingDensity: clamp(0.5 + avgShade * 0.18, 0.4, 0.7),
      riverAdjacent: false,
      usesTransit: true,
      transfers: baseKm > 4.5 ? 2 : 1,
      waitMinutes: baseKm > 4.5 ? 8 : 6,
      crowdLevel: clamp(avgCrowd + 0.12, 0.4, 0.98),
      slopeStress: hasHill ? 0.1 : 0.02,
      routePoints: [routePoint(origin), metroAnchorA, metroAnchorB, routePoint(destination)],
      tags: ['도보 적음', '실내 이동'],
    },
    {
      id: 'shade',
      name: '그늘 우회',
      type: '차양 보행',
      color: routePalette.shade,
      minutes: Math.round(walkMinutes(shadeWalkKm) + 7),
      walkingKm: round(shadeWalkKm, 1),
      roadWidthM: 10,
      buildingDensity: clamp(0.7 + avgShade * 0.18, 0.68, 0.9),
      riverAdjacent: false,
      usesTransit: false,
      transfers: 0,
      waitMinutes: 0,
      crowdLevel: clamp(avgCrowd - 0.18, 0.22, 0.82),
      slopeStress: hasHill ? 0.16 : 0.04,
      routePoints: [routePoint(origin), gardenAnchor, routePoint(destination)],
      tags: ['그늘 가능성', '우회 허용'],
    },
    {
      id: 'riverside',
      name: '강가 경유',
      type: '수변 보행',
      color: routePalette.riverside,
      minutes: Math.round(walkMinutes(riversideWalkKm) + 9),
      walkingKm: round(riversideWalkKm, 1),
      roadWidthM: 14,
      buildingDensity: clamp(avgShade * 0.55, 0.28, 0.62),
      riverAdjacent: true,
      usesTransit: false,
      transfers: 0,
      waitMinutes: 0,
      crowdLevel: clamp(avgCrowd - 0.1, 0.28, 0.82),
      slopeStress: hasHill ? 0.12 : 0.03,
      routePoints: [routePoint(origin), riverAnchor, routePoint(destination)],
      tags: ['강가 바람', '개방감'],
    },
    {
      id: 'bus',
      name: '버스 압축',
      type: '도보 + Bus',
      color: routePalette.bus,
      minutes: Math.round(walkMinutes(busWalkKm) + baseKm * 6.2 + 11),
      walkingKm: round(busWalkKm, 1),
      roadWidthM: 9,
      buildingDensity: clamp(0.48 + avgShade * 0.16, 0.42, 0.7),
      riverAdjacent: false,
      usesTransit: true,
      transfers: 1,
      waitMinutes: 9,
      crowdLevel: clamp(avgCrowd + 0.02, 0.35, 0.9),
      slopeStress: hasHill ? 0.08 : 0.02,
      routePoints: [routePoint(origin), busAnchor, routePoint(destination)],
      tags: ['도보 최소화', '대기 변수'],
    },
  ];
}

function modelWeather(weather, timeSlot) {
  const apparentHeat =
    weather.temperature + timeSlot.heatDelta + 0.08 * (weather.humidity - 50) - 0.7 * Math.min(weather.wind, 5);
  const feelsLike = round(apparentHeat, 1);

  return {
    feelsLike,
    heatStress: clamp01((apparentHeat - 24) / 12),
    conditionLabel: feelsLike >= 36 ? '열 노출 위험' : feelsLike >= 32 ? '매우 더움' : feelsLike >= 28 ? '더움' : '보통',
  };
}

function gradeScore(score) {
  if (score >= 85) return '매우 쾌적';
  if (score >= 70) return '쾌적';
  if (score >= 55) return '보통';
  if (score >= 40) return '더위 주의';
  return '비추천';
}

function scoreRoutes(routes, weather, timeSlot, mode) {
  const weatherModel = modelWeather(weather, timeSlot);
  const baselineTravelTimeMin = Math.min(...routes.map((route) => route.minutes));
  const weights = mode.componentWeights;

  return routes.map((route) => {
    const solarStress = clamp01(timeSlot.solarElevationDeg / 70);
    const shadePotential = clamp01(
      0.55 * route.buildingDensity + 0.3 * clamp01((route.roadWidthM - 4) / 12) + 0.15 * (route.riverAdjacent ? 1 : 0),
    );
    const sunExposure = solarStress * (1 - shadePotential);
    const heatScore = 100 * (1 - weatherModel.heatStress);
    const sunScore = 100 * (1 - sunExposure);
    const walkBurden = clamp01((route.walkingKm * 1000) / 2200);
    const timeBurden = clamp01((route.minutes - baselineTravelTimeMin) / 20);
    const transitBonus = route.usesTransit ? 6 : 0;
    const mobilityScore = clamp(100 * (1 - 0.65 * walkBurden - 0.35 * timeBurden) + transitBonus, 0, 100);
    const environmentScore =
      100 * (0.45 * clamp01(route.roadWidthM / 16) + 0.35 * route.buildingDensity + 0.2 * (route.riverAdjacent ? 1 : 0));
    const comfortScore = Math.round(
      weights.heat * heatScore + weights.sun * sunScore + weights.mobility * mobilityScore + weights.environment * environmentScore,
    );
    const speedScore = clamp(Math.round(100 - (route.minutes - baselineTravelTimeMin) * 3.2 - route.minutes * 0.08), 0, 100);
    const allowed = route.minutes <= baselineTravelTimeMin + 20;
    const transferPenalty = route.transfers * 3.6 + route.waitMinutes * 0.14;
    const crowdPenalty = route.crowdLevel * (4.2 + timeSlot.crowdBias);
    const walkingPenalty = round(walkBurden * (22 + weatherModel.heatStress * 18), 1);
    const sunPenalty = round(sunExposure * (18 + weatherModel.heatStress * 22), 1);
    const shadeBonus = round(shadePotential * 12 + (route.usesTransit ? transitBonus : 0) + (route.riverAdjacent ? weather.wind * 1.1 : 0), 1);
    const recommendationScore = allowed
      ? Math.round(comfortScore * mode.weights.comfort + speedScore * mode.weights.speed)
      : Math.round((comfortScore * mode.weights.comfort + speedScore * mode.weights.speed) * 0.72);

    const reasons = [];
    if (route.riverAdjacent) reasons.push('세느강 인접 구간으로 바람과 개방감이 기대됩니다.');
    if (route.buildingDensity >= 0.65) reasons.push('건물 밀도가 높아 그늘 형성 가능성이 있습니다.');
    if (weather.wind >= 2.5) reasons.push('현재 풍속이 있어 체감 더위를 일부 낮출 수 있습니다.');
    if (route.usesTransit) reasons.push('대중교통을 활용해 도보 부담을 줄였습니다.');
    if (route.walkingKm <= 0.9) reasons.push('도보 거리가 짧아 이동 피로가 낮습니다.');
    if (weatherModel.feelsLike >= 32) reasons.push('기온과 습도로 인한 체감 더위가 높은 편입니다.');
    if (timeSlot.solarElevationDeg >= 55 && shadePotential < 0.45) reasons.push('햇빛 노출이 큰 시간대라 그늘이 부족할 수 있습니다.');
    if (route.minutes > baselineTravelTimeMin + 12) reasons.push('쾌적성을 위해 이동 시간이 다소 늘어납니다.');
    if (route.walkingKm >= 1.8) reasons.push('도보 거리가 길어 더운 시간대에는 부담이 될 수 있습니다.');
    if (!allowed) reasons.push('최단 경로 대비 +20분 제한을 넘어 기본 추천에서는 제외됩니다.');

    return {
      ...route,
      baselineTravelTimeMin,
      detourMinutes: route.minutes - baselineTravelTimeMin,
      allowed,
      heatScore: Math.round(heatScore),
      sunScore: Math.round(sunScore),
      mobilityScore: Math.round(mobilityScore),
      environmentScore: Math.round(environmentScore),
      comfortScore,
      speedScore,
      recommendationScore,
      grade: gradeScore(comfortScore),
      shadePotential: round(shadePotential, 2),
      exposureLabel: sunExposure > 0.68 ? '높음' : sunExposure > 0.42 ? '중간' : '낮음',
      summary: `${gradeScore(comfortScore)} 경로입니다. ${reasons.slice(0, 2).join(' ')}`,
      reasons,
      breakdown: {
        sunPenalty,
        walkingPenalty,
        transferPenalty: round(transferPenalty, 1),
        crowdPenalty: round(crowdPenalty, 1),
        shadeBonus,
      },
    };
  });
}

function buildNarrative(bestRoute, routes, context) {
  const fastest = [...routes].sort((a, b) => a.minutes - b.minutes)[0];
  const mostComfortable = [...routes].sort((a, b) => b.comfortScore - a.comfortScore)[0];
  const excluded = routes.filter((route) => !route.allowed);
  const heatPhrase =
    context.weatherModel.feelsLike >= 36
      ? '현재 조건은 열 노출 위험이 커서 장시간 도보를 강하게 감점했습니다'
      : context.weatherModel.feelsLike >= 32
        ? '현재 체감 더위가 높아 도보거리와 직사광선 노출을 크게 반영했습니다'
        : '현재 날씨에서는 시간과 도보 부담을 균형 있게 비교했습니다';
  const modePhrase =
    context.mode.id === 'time'
      ? '시간 우선 모드라 최단 이동시간과 대기 부담을 더 크게 보았습니다.'
      : context.mode.id === 'comfort'
        ? '쾌적 우선 모드라 더위, 햇빛, 도보거리 감점을 더 크게 적용했습니다.'
        : '균형 추천 모드라 시간 손실과 쾌적도 개선을 함께 계산했습니다.';
  const tradeoff =
    fastest.id !== bestRoute.id
      ? `${fastest.name}보다 ${bestRoute.detourMinutes}분 더 걸리지만 도보 부담과 햇빛 노출을 줄이는 쪽이 유리했습니다.`
      : '가장 빠른 후보이면서 현재 모드에서도 추천 점수가 가장 높게 계산되었습니다.';
  const comfortNote =
    mostComfortable.id !== bestRoute.id
      ? `${mostComfortable.name}의 Comfort Score가 더 높지만, 현재 모드에서는 추가 시간이 커서 추천 순위가 내려갔습니다.`
      : '쾌적도 기준에서도 가장 안정적인 후보로 계산되었습니다.';
  const excludedNote =
    excluded.length > 0 ? `${excluded.map((route) => route.name).join(', ')}은 +20분 우회 제한 때문에 보조 후보로만 표시했습니다.` : '';

  return {
    title: `${bestRoute.name}을 추천합니다`,
    body: `${heatPhrase}. ${modePhrase} ${bestRoute.name}은 총 ${bestRoute.minutes}분, 도보 ${bestRoute.walkingKm}km, 햇빛 노출 ${bestRoute.exposureLabel}으로 계산되었습니다.`,
    tradeoff,
    comfortNote,
    excludedNote,
  };
}

export function buildRouteRecommendation({ originId, destinationId, weather, timeSlotId, modeId, places }) {
  const origin = findById(places, originId);
  const destination = findById(places, destinationId);
  const selectedTimeSlot = findById(timeSlots, timeSlotId);
  const selectedMode = findById(userModes, modeId);
  const rawRoutes = createCandidateRoutes(origin, destination);
  const scoredRoutes = scoreRoutes(rawRoutes, weather, selectedTimeSlot, selectedMode).sort(
    (a, b) => b.recommendationScore - a.recommendationScore,
  );
  const allowedRoutes = scoredRoutes.filter((route) => route.allowed);
  const bestRoute = allowedRoutes[0] ?? scoredRoutes[0];
  const model = modelWeather(weather, selectedTimeSlot);

  return {
    origin,
    destination,
    timeSlot: selectedTimeSlot,
    mode: selectedMode,
    weatherModel: model,
    routes: scoredRoutes,
    bestRoute,
    narrative: buildNarrative(bestRoute, scoredRoutes, {
      mode: selectedMode,
      weatherModel: model,
    }),
  };
}
