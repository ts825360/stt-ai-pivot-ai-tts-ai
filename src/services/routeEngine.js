import { timeSlots, userModes } from '../data/parisPlaces.js';

const routePalette = {
  direct: '#d56d4b',
  metro: '#15958f',
  shade: '#557f3f',
  riverside: '#5f93a8',
  bus: '#5867b0',
};

const anchors = {
  pontIena: { x: 24, y: 64, label: 'Pont d Iena' },
  invalides: { x: 36, y: 66, label: 'Invalides 그늘축' },
  pontAlexandre: { x: 39, y: 56, label: 'Pont Alexandre III' },
  concorde: { x: 42, y: 45, label: 'Concorde 광장' },
  tuileries: { x: 49, y: 48, label: 'Tuileries 정원' },
  palaisRoyal: { x: 56, y: 42, label: 'Palais Royal' },
  rivoli: { x: 62, y: 46, label: 'Rue de Rivoli' },
  seineWest: { x: 33, y: 60, label: 'Seine 서측 보행로' },
  seineMid: { x: 48, y: 58, label: 'Seine 중앙 보행로' },
  seineEast: { x: 64, y: 58, label: 'Cite 수변 진입' },
  cite: { x: 64, y: 57, label: 'Cite 섬' },
  saintGermain: { x: 52, y: 66, label: 'Saint-Germain' },
  luxNorth: { x: 57, y: 71, label: 'Luxembourg 북문' },
  champsAxis: { x: 34, y: 39, label: 'Champs-Elysees 축' },
  madeleine: { x: 44, y: 38, label: 'Madeleine' },
  opera: { x: 53, y: 34, label: 'Opera 연결' },
  pigalle: { x: 47, y: 24, label: 'Pigalle 환승축' },
  anvers: { x: 49, y: 20, label: 'Anvers 진입' },
  lesHalles: { x: 61, y: 42, label: 'Les Halles' },
  maraisWest: { x: 70, y: 47, label: 'Marais 골목' },
  busWest: { x: 31, y: 55, label: '서측 버스 정류장' },
  busCentral: { x: 47, y: 50, label: '중앙 환승 정류장' },
  busEast: { x: 66, y: 51, label: '동측 하차 정류장' },
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const clamp01 = (value) => clamp(value, 0, 1);
const round = (value, precision = 0) => Number(value.toFixed(precision));

function findById(collection, id) {
  return collection.find((item) => item.id === id) ?? collection[0];
}

function placePoint(place, label = place.shortName) {
  return {
    x: place.x,
    y: place.y,
    lat: place.lat,
    lng: place.lng,
    label,
  };
}

function anchorPoint(id) {
  return { ...anchors[id] };
}

function dynamicPoint(label, origin, destination, ratio, offsetX = 0, offsetY = 0) {
  return {
    x: clamp(origin.x + (destination.x - origin.x) * ratio + offsetX, 8, 92),
    y: clamp(origin.y + (destination.y - origin.y) * ratio + offsetY, 8, 92),
    label,
  };
}

function dedupePoints(points) {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    if (!previous) return true;
    return Math.abs(previous.x - point.x) > 2 || Math.abs(previous.y - point.y) > 2 || previous.label !== point.label;
  });
}

function segmentDistanceKm(start, end) {
  const dx = ((end.x - start.x) / 100) * 8.9;
  const dy = ((end.y - start.y) / 100) * 9.5;
  return Math.sqrt(dx * dx + dy * dy) * 1.12;
}

function pathDistanceKm(points) {
  return points.slice(1).reduce((sum, point, index) => sum + segmentDistanceKm(points[index], point), 0);
}

function walkMinutes(km) {
  return (km / 4.7) * 60;
}

function routeEnvelope(origin, destination) {
  return {
    minX: Math.min(origin.x, destination.x),
    maxX: Math.max(origin.x, destination.x),
    minY: Math.min(origin.y, destination.y),
    maxY: Math.max(origin.y, destination.y),
  };
}

function isAnchorUseful(anchor, envelope, margin = 18) {
  return (
    anchor.x >= envelope.minX - margin &&
    anchor.x <= envelope.maxX + margin &&
    anchor.y >= envelope.minY - margin &&
    anchor.y <= envelope.maxY + margin
  );
}

function pickSpineAnchors(origin, destination, strategy) {
  const envelope = routeEnvelope(origin, destination);
  const toNorth = envelope.minY < 30;
  const toSouth = envelope.maxY > 68;
  const toEast = envelope.maxX > 66;
  const westToCenter = envelope.minX < 38 && envelope.maxX > 44;

  let ids = ['concorde', 'tuileries', 'palaisRoyal'];

  if (toNorth) ids = ['champsAxis', 'madeleine', 'opera', 'pigalle', 'anvers'];
  if (toSouth) ids = ['concorde', 'tuileries', 'saintGermain', 'luxNorth'];
  if (toEast) ids = ['tuileries', 'rivoli', 'cite', 'maraisWest'];
  if (westToCenter && strategy !== 'riverside') ids = ['pontAlexandre', 'concorde', 'tuileries', 'palaisRoyal'];

  return ids.map(anchorPoint).filter((point) => isAnchorUseful(point, envelope));
}

function buildDirectPath(origin, destination) {
  const spine = pickSpineAnchors(origin, destination, 'direct').slice(0, 4);
  const fallback = dynamicPoint('직선 보행축', origin, destination, 0.5);
  return dedupePoints([placePoint(origin), ...(spine.length ? spine : [fallback]), placePoint(destination)]);
}

function buildShadePath(origin, destination) {
  const envelope = routeEnvelope(origin, destination);
  const gardenIds = ['invalides', 'pontAlexandre', 'tuileries', 'palaisRoyal', 'saintGermain', 'luxNorth', 'maraisWest'];
  const gardens = gardenIds.map(anchorPoint).filter((point) => isAnchorUseful(point, envelope, 22));
  const fallback = [
    dynamicPoint('건물 그늘축', origin, destination, 0.35, destination.x > origin.x ? -5 : 5, 4),
    dynamicPoint('좁은 골목 우회', origin, destination, 0.68, destination.x > origin.x ? 4 : -4, 3),
  ];
  return dedupePoints([placePoint(origin), ...(gardens.length >= 2 ? gardens.slice(0, 4) : fallback), placePoint(destination)]);
}

function buildRiversidePath(origin, destination) {
  const envelope = routeEnvelope(origin, destination);
  const river = ['pontIena', 'seineWest', 'pontAlexandre', 'seineMid', 'seineEast']
    .map(anchorPoint)
    .filter((point) => isAnchorUseful(point, envelope, 26));
  const fallback = [
    dynamicPoint('수변 접근', origin, destination, 0.35, 0, 8),
    dynamicPoint('수변 보행로', origin, destination, 0.65, 0, 8),
  ];
  return dedupePoints([placePoint(origin), ...(river.length >= 2 ? river : fallback), placePoint(destination)]);
}

function buildMetroPath(origin, destination) {
  const envelope = routeEnvelope(origin, destination);
  const stationA = dynamicPoint(`${origin.shortName} 인근 Metro`, origin, destination, 0.18, 0, -5);
  const stationB = dynamicPoint(`${destination.shortName} 인근 Metro`, origin, destination, 0.82, 0, -4);
  const hubs = pickSpineAnchors(origin, destination, 'metro')
    .filter((point) => point.y <= Math.max(origin.y, destination.y) + 10)
    .slice(0, envelope.maxY - envelope.minY > 40 ? 2 : 1);
  return dedupePoints([placePoint(origin), stationA, ...hubs, stationB, placePoint(destination)]);
}

function buildBusPath(origin, destination) {
  const envelope = routeEnvelope(origin, destination);
  const busIds = envelope.maxX > 64 ? ['busWest', 'busCentral', 'busEast'] : ['busWest', 'concorde', 'busCentral'];
  const stops = busIds.map(anchorPoint).filter((point) => isAnchorUseful(point, envelope, 24));
  const fallback = [
    dynamicPoint('승차 정류장', origin, destination, 0.24, 2, 5),
    dynamicPoint('하차 정류장', origin, destination, 0.76, -2, 5),
  ];
  return dedupePoints([placePoint(origin), ...(stops.length >= 2 ? stops : fallback), placePoint(destination)]);
}

function buildSegments(points, modeLabel) {
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    const isAccessWalk = modeLabel !== '도보' && (index === 0 || index === points.length - 2);
    return {
      label: `${previous.label} -> ${point.label}`,
      mode: isAccessWalk ? '도보' : modeLabel,
      km: round(segmentDistanceKm(previous, point), 1),
    };
  });
}

function nameRoute(strategyId, points, transfers) {
  const labels = points.map((point) => point.label).join(' ');

  if (strategyId === 'direct') {
    if (labels.includes('Rue de Rivoli')) return 'Rivoli 직진 도보';
    if (labels.includes('Champs')) return '샹젤리제 축 도보';
    return '최단 보행축';
  }

  if (strategyId === 'metro') return transfers > 1 ? 'Metro 환승 압축' : 'Metro 도보 절감';
  if (strategyId === 'shade') return labels.includes('Tuileries') ? 'Tuileries 그늘 우회' : '그늘축 우회';
  if (strategyId === 'riverside') return 'Seine 수변 완충';
  return 'Bus 접근 압축';
}

function createCandidateRoutes(origin, destination) {
  const avgShade = (origin.shadeProfile + destination.shadeProfile) / 2;
  const avgCrowd = (origin.crowdProfile + destination.crowdProfile) / 2;
  const hasHill = destination.id === 'montmartre' || origin.id === 'montmartre';
  const rawPaths = {
    direct: buildDirectPath(origin, destination),
    metro: buildMetroPath(origin, destination),
    shade: buildShadePath(origin, destination),
    riverside: buildRiversidePath(origin, destination),
    bus: buildBusPath(origin, destination),
  };

  return Object.entries(rawPaths).map(([id, points]) => {
    const pathKm = pathDistanceKm(points);
    const transitHeavy = id === 'metro' || id === 'bus';
    const transfers = id === 'metro' ? (pathKm > 4.8 || hasHill ? 2 : 1) : id === 'bus' ? 1 : 0;
    const waitMinutes = id === 'metro' ? (transfers > 1 ? 8 : 6) : id === 'bus' ? 9 : 0;
    const walkingKm =
      id === 'metro'
        ? clamp(pathKm * 0.28 + 0.36, 0.55, 1.85)
        : id === 'bus'
          ? clamp(pathKm * 0.24 + 0.42, 0.55, 1.65)
          : round(pathKm, 1);
    const inVehicleMinutes = id === 'metro' ? pathKm * 3.25 : id === 'bus' ? pathKm * 4.9 : 0;
    const strategyBuffer = id === 'shade' ? 5 : id === 'riverside' ? 6 : id === 'direct' ? 2 : 0;
    const minutes = Math.round(walkMinutes(walkingKm) + inVehicleMinutes + waitMinutes + transfers * 3.5 + strategyBuffer);
    const shadeCover =
      id === 'shade'
        ? clamp(0.7 + avgShade * 0.16, 0.68, 0.9)
        : id === 'metro'
          ? clamp(0.52 + avgShade * 0.14, 0.48, 0.68)
          : id === 'bus'
            ? clamp(0.46 + avgShade * 0.12, 0.42, 0.62)
            : id === 'riverside'
              ? clamp(0.36 + avgShade * 0.12, 0.32, 0.54)
              : clamp(0.22 + avgShade * 0.22, 0.18, 0.48);
    const riverAdjacent = id === 'riverside';
    const roadWidthM = id === 'riverside' ? 13 : id === 'shade' ? 9 : id === 'direct' ? 7 : 8;
    const modeLabel = id === 'metro' ? 'Metro' : id === 'bus' ? 'Bus' : '도보';

    return {
      id,
      name: nameRoute(id, points, transfers),
      type: id === 'metro' ? '도보 + Metro' : id === 'bus' ? '도보 + Bus' : id === 'riverside' ? '수변 보행' : '도보',
      color: routePalette[id],
      minutes,
      walkingKm: round(walkingKm, 1),
      roadWidthM,
      buildingDensity: shadeCover,
      shadeCover,
      riverAdjacent,
      usesTransit: transitHeavy,
      transfers,
      waitMinutes,
      crowdLevel: clamp(avgCrowd + (id === 'metro' ? 0.12 : id === 'shade' ? -0.16 : id === 'riverside' ? -0.08 : 0.02), 0.22, 0.98),
      slopeStress: hasHill ? (id === 'metro' || id === 'bus' ? 0.08 : 0.17) : 0.03,
      routePoints: points,
      segments: buildSegments(points, modeLabel),
      segmentCount: points.length - 1,
      outdoorKm: transitHeavy ? walkingKm : pathKm,
      riverCooling: riverAdjacent ? 0.14 : 0,
      restStopScore: id === 'shade' ? 0.75 : id === 'riverside' ? 0.58 : transitHeavy ? 0.5 : 0.25,
      tags:
        id === 'direct'
          ? ['최단 시간', '야외 노출 큼']
          : id === 'metro'
            ? ['도보 절감', '실내 이동 포함']
            : id === 'shade'
              ? ['그늘 우선', '휴식 지점 많음']
              : id === 'riverside'
                ? ['수변 바람', '개방감']
                : ['도보 압축', '대기 변수'],
    };
  });
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
    const shadePotential = clamp01(route.shadeCover + route.restStopScore * 0.08 + (route.riverAdjacent ? 0.04 : 0));
    const exposedWalkRatio = clamp01((route.outdoorKm * (1 - shadePotential) * (1 - route.riverCooling)) / 3.2);
    const sunExposure = solarStress * exposedWalkRatio;
    const heatScore = clamp(100 - weatherModel.heatStress * 52 - exposedWalkRatio * 18 - route.slopeStress * 18, 0, 100);
    const sunScore = clamp(100 - sunExposure * 72, 0, 100);
    const walkBurden = clamp01((route.walkingKm * 1000) / 2400);
    const timeBurden = clamp01((route.minutes - baselineTravelTimeMin) / 20);
    const transitRelief = route.usesTransit ? 10 : 0;
    const mobilityScore = clamp(100 - walkBurden * 58 - timeBurden * 24 - route.transfers * 4 + transitRelief, 0, 100);
    const environmentScore = clamp(
      28 * clamp01(route.roadWidthM / 14) + 38 * shadePotential + 18 * route.restStopScore + 16 * (route.riverAdjacent ? 1 : 0),
      0,
      100,
    );
    const comfortScore = Math.round(
      weights.heat * heatScore + weights.sun * sunScore + weights.mobility * mobilityScore + weights.environment * environmentScore,
    );
    const speedScore = clamp(Math.round(100 - (route.minutes - baselineTravelTimeMin) * 3.2 - route.minutes * 0.08), 0, 100);
    const allowed = route.minutes <= baselineTravelTimeMin + 20;
    const transferPenalty = route.transfers * 3.6 + route.waitMinutes * 0.16;
    const crowdPenalty = route.crowdLevel * (4.2 + timeSlot.crowdBias);
    const walkingPenalty = round(walkBurden * (18 + weatherModel.heatStress * 20), 1);
    const sunPenalty = round(sunExposure * (18 + weatherModel.heatStress * 24), 1);
    const shadeBonus = round(shadePotential * 13 + route.restStopScore * 3 + (route.usesTransit ? 5 : 0) + (route.riverAdjacent ? weather.wind * 0.7 : 0), 1);
    const recommendationScore = allowed
      ? Math.round(comfortScore * mode.weights.comfort + speedScore * mode.weights.speed)
      : Math.round((comfortScore * mode.weights.comfort + speedScore * mode.weights.speed) * 0.72);

    const reasons = [];
    if (route.riverAdjacent) reasons.push('세느강 인접 구간으로 바람과 개방감을 반영했습니다.');
    if (route.shadeCover >= 0.66) reasons.push('정원과 건물 그늘축을 통과해 직사광선 노출을 줄입니다.');
    if (weather.wind >= 2.5) reasons.push('현재 풍속이 있어 체감 더위를 일부 낮출 수 있습니다.');
    if (route.usesTransit) reasons.push('대중교통을 활용해 실제 도보 거리를 줄였습니다.');
    if (route.walkingKm <= 0.9) reasons.push('도보 거리가 짧아 이동 피로가 낮습니다.');
    if (weatherModel.feelsLike >= 32) reasons.push('체감 더위가 높아 야외 보행 구간을 강하게 감점했습니다.');
    if (timeSlot.solarElevationDeg >= 55 && shadePotential < 0.45) reasons.push('강한 햇빛 시간대라 개방 보행로의 부담이 큽니다.');
    if (route.minutes > baselineTravelTimeMin + 12) reasons.push('쾌적성을 위해 이동 시간이 다소 늘어납니다.');
    if (route.walkingKm >= 1.8) reasons.push('도보 거리가 길어 더운 시간대에는 부담이 될 수 있습니다.');
    if (!allowed) reasons.push('최단 경로 대비 +20분 제한을 넘어 보조 후보로 분류했습니다.');

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
