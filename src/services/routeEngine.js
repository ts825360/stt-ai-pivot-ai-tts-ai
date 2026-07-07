import { timeSlots, userModes } from '../data/parisPlaces.js';

const routePalette = {
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
  seineEast: { x: 64, y: 58, label: 'Cite 섬 진입' },
  saintGermain: { x: 52, y: 66, label: 'Saint-Germain' },
  luxNorth: { x: 57, y: 71, label: 'Luxembourg 북문' },
  champsAxis: { x: 34, y: 39, label: 'Champs-Elysees 축' },
  madeleine: { x: 44, y: 38, label: 'Madeleine' },
  opera: { x: 53, y: 34, label: 'Opera 연결' },
  pigalle: { x: 47, y: 24, label: 'Pigalle 환승축' },
  anvers: { x: 49, y: 20, label: 'Anvers 진입' },
  maraisWest: { x: 70, y: 47, label: 'Marais 골목' },
  busWest: { x: 31, y: 55, label: '서측 버스 정류장' },
  busCentral: { x: 47, y: 50, label: '중앙 환승 정류장' },
  busEast: { x: 66, y: 51, label: '동측 하차 정류장' },
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const clamp01 = (value) => clamp(value, 0, 1);
const round = (value, precision = 0) => Number(value.toFixed(precision));
const DAILY_WALK_BUDGET_MIN = 40;
const TRANSIT_WALK_BONUS_MIN = 6.5;
const WALK_BUDGET_CAP_BY_MODE = {
  comfort: 60,
  balanced: 70,
  time: 85,
};

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
  if (toEast) ids = ['tuileries', 'rivoli', 'maraisWest'];
  if (westToCenter && strategy !== 'riverside') ids = ['pontAlexandre', 'concorde', 'tuileries', 'palaisRoyal'];

  return ids.map(anchorPoint).filter((point) => isAnchorUseful(point, envelope));
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
    dynamicPoint('강변 접근', origin, destination, 0.35, 0, 8),
    dynamicPoint('강변 보행로', origin, destination, 0.65, 0, 8),
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

  if (strategyId === 'metro') return transfers > 1 ? 'Metro 환승 경로' : 'Metro 보행 절감';
  if (strategyId === 'shade') return labels.includes('Tuileries') ? 'Tuileries 그늘 우회' : '그늘축 우회';
  if (strategyId === 'riverside') return 'Seine 강변 우회';
  return 'Bus 접근 경로';
}

function createCandidateRoutes(origin, destination) {
  const avgShade = (origin.shadeProfile + destination.shadeProfile) / 2;
  const avgCrowd = (origin.crowdProfile + destination.crowdProfile) / 2;
  const originRef = origin.sourceId || origin.id;
  const destinationRef = destination.sourceId || destination.id;
  const hasHill = destinationRef === 'montmartre' || originRef === 'montmartre';
  const rawPaths = {
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
    const walkingMinutes = Math.round(walkMinutes(walkingKm));
    const rideMinutes = Math.round(inVehicleMinutes);
    const waitTransferMinutes = transitHeavy ? Math.round(waitMinutes + transfers * 3.5) : 0;
    const minutes = transitHeavy ? Math.round(walkingMinutes + rideMinutes + waitTransferMinutes) : walkingMinutes;
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
    const roadWidthM = id === 'riverside' ? 13 : id === 'shade' ? 9 : 8;
    const modeLabel = id === 'metro' ? 'Metro' : id === 'bus' ? 'Bus' : '도보';
    const segments = buildSegments(points, modeLabel);
    const walkingSegments = segments.filter((segment) => segment.mode === '도보');
    const maxWalkingSegmentKm = round(walkingSegments.length ? Math.max(...walkingSegments.map((segment) => segment.km)) : walkingKm, 1);

    return {
      id,
      name: nameRoute(id, points, transfers),
      type: id === 'metro' ? '도보 + Metro' : id === 'bus' ? '도보 + Bus' : id === 'riverside' ? '강변 보행' : '도보',
      color: routePalette[id],
      minutes,
      walkingKm: round(walkingKm, 1),
      walkingMinutes,
      rideMinutes,
      waitTransferMinutes,
      maxWalkingSegmentKm,
      roadWidthM,
      shadeCover,
      riverAdjacent,
      usesTransit: transitHeavy,
      transfers,
      waitMinutes,
      crowdLevel: clamp(avgCrowd + (id === 'metro' ? 0.12 : id === 'shade' ? -0.16 : id === 'riverside' ? -0.08 : 0.02), 0.22, 0.98),
      slopeStress: hasHill ? (id === 'metro' || id === 'bus' ? 0.08 : 0.17) : 0.03,
      routePoints: points,
      segments,
      segmentCount: points.length - 1,
      outdoorKm: transitHeavy ? walkingKm : pathKm,
      riverCooling: riverAdjacent ? 0.14 : 0,
      restStopScore: id === 'shade' ? 0.75 : id === 'riverside' ? 0.58 : transitHeavy ? 0.5 : 0.25,
      tags:
        id === 'metro'
          ? ['도보 절감', '실내 이동 포함']
          : id === 'shade'
            ? ['그늘 우선', '휴식 지점 많음']
            : id === 'riverside'
              ? ['강변 바람', '개방감']
              : ['도보 절감', '대기 변동'],
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
    conditionLabel: feelsLike >= 36 ? '야외 노출 위험' : feelsLike >= 32 ? '매우 더움' : feelsLike >= 28 ? '더움' : '보통',
  };
}

function gradeScore(score) {
  if (score >= 85) return '매우 쾌적';
  if (score >= 70) return '쾌적';
  if (score >= 55) return '보통';
  if (score >= 40) return '더위 주의';
  return '비추천';
}

function progressiveWalkPenalty(overageMinutes) {
  if (overageMinutes <= 0) return 0;
  if (overageMinutes <= 15) return overageMinutes;
  if (overageMinutes <= 30) return 15 + 1.5 * (overageMinutes - 15);
  return 37.5 + 2 * (overageMinutes - 30);
}

function calculateDailyScore(route, baselineTravelTimeMin, mode, plannedPlaceCount) {
  const legCount = Math.max(1, Math.round(plannedPlaceCount || 1));
  const transitLegCount = route.usesTransit ? legCount : 0;
  const walkBudgetCap = WALK_BUDGET_CAP_BY_MODE[mode.id] ?? WALK_BUDGET_CAP_BY_MODE.balanced;
  const walkBudgetMinutes = Math.min(walkBudgetCap, DAILY_WALK_BUDGET_MIN + transitLegCount * TRANSIT_WALK_BONUS_MIN);
  const detourMinutes = Math.max(0, route.minutes - baselineTravelTimeMin);
  const walkingTotalMinutes = route.walkingMinutes * legCount;
  const rideTotalMinutes = route.rideMinutes * legCount;
  const waitTransferTotalMinutes = route.waitTransferMinutes * legCount;
  const detourTotalMinutes = detourMinutes * legCount;
  const dailyBurdenMinutes =
    walkingTotalMinutes * 1.0 + rideTotalMinutes * 0.5 + waitTransferTotalMinutes * 0.8 + detourTotalMinutes * 1.3;
  const burdenOverBudgetMinutes = Math.max(0, dailyBurdenMinutes - walkBudgetMinutes);
  const walkOverBudgetMinutes = Math.max(0, walkingTotalMinutes - walkBudgetMinutes);
  const walkPenalty = progressiveWalkPenalty(walkOverBudgetMinutes);
  const recommendationScore = clamp(Math.round(100 - burdenOverBudgetMinutes - walkPenalty), 0, 100);

  return {
    recommendationScore,
    scoreModel: {
      legCount,
      transitLegCount,
      walkBudgetMinutes: round(walkBudgetMinutes, 1),
      dailyBurdenMinutes: round(dailyBurdenMinutes, 1),
      walkingTotalMinutes: round(walkingTotalMinutes, 1),
      rideTotalMinutes: round(rideTotalMinutes, 1),
      waitTransferTotalMinutes: round(waitTransferTotalMinutes, 1),
      detourTotalMinutes: round(detourTotalMinutes, 1),
      burdenOverBudgetMinutes: round(burdenOverBudgetMinutes, 1),
      walkOverBudgetMinutes: round(walkOverBudgetMinutes, 1),
      walkPenalty: round(walkPenalty, 1),
      weights: {
        walking: 1,
        ride: 0.5,
        waitTransfer: 0.8,
        detour: 1.3,
      },
    },
  };
}

function scoreRoutes(routes, weather, timeSlot, mode, context = {}) {
  const weatherModel = modelWeather(weather, timeSlot);
  const baselineTravelTimeMin = Math.min(...routes.map((route) => route.minutes));
  const preferredWalkSegmentKm = 0.85;
  const maxPreferredWalkKm = 2.5;
  const plannedPlaceCount = context.plannedPlaceCount ?? 1;

  return routes.map((route) => {
    const detourMinutes = route.minutes - baselineTravelTimeMin;
    const solarStress = clamp01(timeSlot.solarElevationDeg / 70);
    const shadePotential = clamp01(route.shadeCover + route.restStopScore * 0.08 + (route.riverAdjacent ? 0.04 : 0));
    const exposedWalkRatio = clamp01((route.outdoorKm * (1 - shadePotential) * (1 - route.riverCooling)) / 3.2);
    const sunExposure = solarStress * exposedWalkRatio;
    const walkBurden = clamp01((route.walkingKm - preferredWalkSegmentKm) / (maxPreferredWalkKm - preferredWalkSegmentKm));
    const continuousWalkBurden = clamp01((route.maxWalkingSegmentKm - preferredWalkSegmentKm) / (maxPreferredWalkKm - preferredWalkSegmentKm));
    const { recommendationScore, scoreModel } = calculateDailyScore(route, baselineTravelTimeMin, mode, plannedPlaceCount);
    const allowed = recommendationScore >= 55;
    const transferPenalty = route.transfers * 3.6 + route.waitMinutes * 0.16;
    const crowdPenalty = route.crowdLevel * (4.2 + timeSlot.crowdBias);
    const walkingPenalty = round(walkBurden * (18 + weatherModel.heatStress * 20), 1);
    const sunPenalty = round(sunExposure * (18 + weatherModel.heatStress * 24), 1);
    const shadeBonus = round(shadePotential * 13 + route.restStopScore * 3 + (route.usesTransit ? 5 : 0) + (route.riverAdjacent ? weather.wind * 0.7 : 0), 1);

    const reasons = [];
    if (detourMinutes === 0) reasons.push('가장 빠른 이동시간을 기준점으로 삼았습니다.');
    if (route.usesTransit) reasons.push('대중교통을 포함해 도보가 여러 구간으로 분산됩니다.');
    if (route.maxWalkingSegmentKm <= preferredWalkSegmentKm) reasons.push('1회 보행 거리가 짧아 이동 부담이 낮습니다.');
    if (route.maxWalkingSegmentKm > maxPreferredWalkKm) reasons.push('한 번에 걷는 거리가 길어 보조 후보로 봅니다.');
    if (scoreModel.walkingTotalMinutes > scoreModel.walkBudgetMinutes) reasons.push('하루 보행예산을 초과해 누진 도보 패널티를 적용했습니다.');
    if (route.shadeCover >= 0.66) reasons.push('그늘과 실내 대피 가능 구간이 있어 설명 문구에 반영합니다.');
    if (route.riverAdjacent) reasons.push('강변 이동 선호가 있을 때 선택 사유로 제시할 수 있습니다.');
    if (weatherModel.feelsLike >= 32) reasons.push('더운 날씨라 장시간 실외 보행을 주의 안내합니다.');
    if (detourMinutes > 20) reasons.push('최단 경로 대비 추가이동시간이 커 점수에서 강하게 감점됩니다.');
    if (!allowed) reasons.push('하루 이동부담이 커 일정 조정 후보로 표시합니다.');
    if (reasons.length === 0) reasons.push('하루 이동부담 기준으로 비교 가능한 후보입니다.');

    return {
      ...route,
      baselineTravelTimeMin,
      detourMinutes,
      allowed,
      heatScore: Math.round(100 - weatherModel.heatStress * 52),
      sunScore: Math.round(100 - sunExposure * 72),
      mobilityScore: recommendationScore,
      environmentScore: Math.round(shadePotential * 100),
      comfortScore: recommendationScore,
      speedScore: recommendationScore,
      timeScore: recommendationScore,
      recommendationScore,
      grade: gradeScore(recommendationScore),
      shadePotential: round(shadePotential, 2),
      exposureLabel: sunExposure > 0.68 ? '높음' : sunExposure > 0.42 ? '중간' : '낮음',
      summary: `하루 이동부담 기준 ${recommendationScore}점입니다. ${reasons.slice(0, 2).join(' ')}`,
      scoreModel,
      reasons,
      breakdown: {
        sunPenalty,
        walkingPenalty,
        dailyBurdenPenalty: round(scoreModel.burdenOverBudgetMinutes, 1),
        walkOverBudgetPenalty: round(scoreModel.walkPenalty, 1),
        transferPenalty: round(transferPenalty, 1),
        crowdPenalty: round(crowdPenalty, 1),
        shadeBonus,
      },
    };
  });
}

function buildNarrative(bestRoute, routes, context) {
  const fastest = [...routes].sort((a, b) => a.minutes - b.minutes)[0];
  const excluded = routes.filter((route) => !route.allowed);
  const heatPhrase =
    context.weatherModel.feelsLike >= 36
      ? '현재 조건은 야외 노출 부담이 커서 세부 안내에서 실외 보행 주의를 강조합니다'
      : context.weatherModel.feelsLike >= 32
        ? '현재 체감 더위가 높아 세부 안내에서 그늘과 실내 대피 지점을 함께 설명합니다'
        : '현재 날씨는 추천 사유와 현장 안내에 보조 정보로 사용합니다';
  const modePhrase = '추천점수는 도보, 탑승, 대기/환승, 최단 대비 추가시간을 하루 이동부담으로 환산해 계산합니다.';
  const tradeoff =
    fastest.id !== bestRoute.id
      ? `${fastest.name}보다 ${bestRoute.detourMinutes}분 더 걸리지만 보행 ${bestRoute.walkingKm}km, 예상 도보 ${bestRoute.walkingMinutes}분으로 비교할 수 있습니다.`
      : '가장 빠른 후보라서 추천 점수 기준에서도 우선 표시합니다.';
  const comfortNote = '그늘, 강변, 카페 선호 같은 요소는 점수 가중치가 아니라 사용자가 이해할 수 있는 추천 사유로 표시합니다.';
  const excludedNote =
    excluded.length > 0 ? `${excluded.map((route) => route.name).join(', ')}는 가장 빠른 후보보다 우회 시간이 커 보조 후보로만 표시합니다.` : '';

  return {
    title: `${bestRoute.name}을 추천합니다`,
    body: `${heatPhrase}. ${modePhrase} ${bestRoute.name}은 하루 환산부담 ${bestRoute.scoreModel.dailyBurdenMinutes}분, 보행예산 ${bestRoute.scoreModel.walkBudgetMinutes}분, 보행 ${bestRoute.walkingKm}km입니다.`,
    tradeoff,
    comfortNote,
    excludedNote,
  };
}

export function buildRouteRecommendation({ origin, originId, destination, destinationId, weather, timeSlotId, modeId, places, plannedPlaceCount = 1 }) {
  const selectedOrigin = origin ?? findById(places, originId);
  const selectedDestination = destination ?? findById(places, destinationId);
  const selectedTimeSlot = findById(timeSlots, timeSlotId);
  const selectedMode = findById(userModes, modeId);
  const rawRoutes = createCandidateRoutes(selectedOrigin, selectedDestination);
  const scoredRoutes = scoreRoutes(rawRoutes, weather, selectedTimeSlot, selectedMode, { plannedPlaceCount }).sort(
    (a, b) => b.recommendationScore - a.recommendationScore,
  );
  const allowedRoutes = scoredRoutes.filter((route) => route.allowed);
  const bestRoute = allowedRoutes[0] ?? scoredRoutes[0];
  const model = modelWeather(weather, selectedTimeSlot);

  return {
    origin: selectedOrigin,
    destination: selectedDestination,
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
