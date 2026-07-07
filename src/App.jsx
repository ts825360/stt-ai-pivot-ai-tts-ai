import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Bot,
  Bus,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Coffee,
  Compass,
  CornerUpLeft,
  CornerUpRight,
  Droplets,
  Home,
  Landmark,
  ListChecks,
  Map,
  MapPin,
  MessagesSquare,
  Navigation,
  Plus,
  Route,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  ThermometerSun,
  TrainFront,
  Trees,
  Trash2,
  User,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { parisPlaces, weatherPresets } from './data/parisPlaces.js';
import { fetchLiveWeather, fetchPhotoGuideAnalysis, fetchPlaceGeocode, fetchReverseGeocode, fetchTravelGuideChat } from './services/liveApi.js';
import { buildRouteRecommendation } from './services/routeEngine.js';

const pages = [
  { id: 'plan', label: 'Plan', icon: CalendarDays },
  { id: 'routes', label: '지도', icon: Map },
  { id: 'extras', label: '정보 물어보기', icon: MessagesSquare },
  { id: 'trips', label: '내 여행', icon: Check },
];

const durationOptions = [
  { id: '1', label: '1박 2일', placeLimit: 3 },
  { id: '2', label: '2박 3일', placeLimit: 4 },
  { id: '3', label: '3박 4일', placeLimit: 5 },
  { id: '4', label: '4박 5일', placeLimit: 6 },
];

const parisMapBounds = {
  north: 48.895,
  south: 48.835,
  west: 2.255,
  east: 2.385,
};

const paceOptions = [
  {
    id: 'relaxed',
    label: '여유롭게',
    caption: '그늘과 휴식 우선',
    modeId: 'comfort',
    icon: Coffee,
  },
  {
    id: 'balanced',
    label: '밸런스',
    caption: '쾌적도와 시간 균형',
    modeId: 'balanced',
    icon: ShieldCheck,
  },
  {
    id: 'packed',
    label: '꽉 채워서',
    caption: '짧은 이동 우선',
    modeId: 'time',
    icon: Navigation,
  },
];

const placeMeta = {
  eiffel: { icon: Landmark, badge: '랜드마크', note: '야외 노출이 커서 오후에는 그늘 경로가 유리합니다.' },
  louvre: { icon: Landmark, badge: '실내 명소', note: '더운 시간대에 실내 대피가 쉬운 목적지입니다.' },
  orsay: { icon: Landmark, badge: '미술관', note: '센강 남안 이동과 실내 휴식을 함께 잡기 좋습니다.' },
  arc: { icon: Landmark, badge: '전망 포인트', note: '대로 주변 보행 노출이 있어 대중교통 접근이 좋습니다.' },
  montmartre: { icon: Coffee, badge: '언덕 동네', note: '오르막 부담이 커서 Metro나 Bus 후보를 우선 비교합니다.' },
  'notre-dame': { icon: Landmark, badge: '시테섬', note: '강변 접근과 중심부 이동을 함께 보기 좋습니다.' },
  sainte: { icon: Landmark, badge: '성당', note: '시테섬 안쪽 목적지라 표지판 확인이 중요합니다.' },
  luxembourg: { icon: Trees, badge: '쉴만한 곳', note: '그늘과 휴식 점수가 높은 공원형 목적지입니다.' },
  marais: { icon: Utensils, badge: '맛집/카페', note: '좁은 골목과 상권이 많아 도보 휴식 선택지가 좋습니다.' },
  champs: { icon: Search, badge: '쇼핑 거리', note: '혼잡과 햇빛 노출을 함께 고려해야 합니다.' },
};

const guideSuggestions = [
  '이 목적지 근처에서 더위를 피할 만한 곳을 추천해줘',
  '지하철 입구 사진을 찍으면 무엇을 확인해야 해?',
  '정류장이 맞는지 확인하려면 어떤 표지판을 봐야 해?',
];
const GUIDE_DAILY_LIMIT = 2;
const GUIDE_USAGE_STORAGE_KEY = 'coolpath-guide-usage-v1';
const GUIDE_LIMIT_MESSAGE =
  '오늘 무료 AI 질문 2회를 모두 사용했습니다. 추가 질문은 프리미엄 질문권 또는 여행 비서 구독으로 확장할 수 있습니다.';

function getGuideUsageDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function readGuideUsageCount() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GUIDE_USAGE_STORAGE_KEY) || 'null');
    return saved?.date === getGuideUsageDateKey() ? Math.min(Number(saved.count) || 0, GUIDE_DAILY_LIMIT) : 0;
  } catch {
    return 0;
  }
}

function writeGuideUsageCount(count) {
  try {
    window.localStorage.setItem(
      GUIDE_USAGE_STORAGE_KEY,
      JSON.stringify({ date: getGuideUsageDateKey(), count: Math.min(count, GUIDE_DAILY_LIMIT) }),
    );
  } catch {
    // Storage can fail in private mode; the in-memory state still enforces the current session.
  }
}

function normalizePage(page) {
  return ['plan', 'routes', 'extras', 'trips', 'camera'].includes(page) ? page : 'plan';
}

function getInitialScoreScenario() {
  const score = new URLSearchParams(window.location.search).get('score')?.toLowerCase();
  if (score === '80') return 'score80';
  if (score === 'low' || score === '20' || score === 'under20') return 'scoreLow';
  return 'normal';
}

function getInitialCameraScenario() {
  const value = new URLSearchParams(window.location.search).get('camera')?.toLowerCase().replace(/[_\s]/g, '-');
  if (['bus', 'stop', 'bus-stop'].includes(value)) return 'bus';
  if (['metro', 'subway', 'train', 'station'].includes(value)) return 'metro';
  if (['stairs', 'stair', 'steps'].includes(value)) return 'stairs';
  if (['stairs-down', 'down', 'downstairs', 'stairsdown'].includes(value)) return 'stairs-down';
  if (['stairs-up', 'up', 'upstairs', 'stairsup'].includes(value)) return 'stairs-up';
  return 'none';
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}시간 ${remaining}분` : `${hours}시간`;
}

function getWalkingMinutes(route) {
  return route.walkingMinutes ?? Math.round((route.walkingKm / 4.7) * 60);
}

function formatWalkingMinutes(route) {
  return formatMinutes(getWalkingMinutes(route));
}

function getRouteKindLabel(route) {
  if (route.id === 'metro') return '지하철 우선';
  if (route.id === 'bus') return '버스 우선';
  if (route.id === 'shade') return '그늘 우선';
  if (route.id === 'riverside') return '강변 우선';
  return '추천 경로';
}

function buildFriendlyRouteSummary(route) {
  const detourText =
    route.detourMinutes === 0
      ? '가장 빠른 후보입니다.'
      : `가장 빠른 후보보다 ${route.detourMinutes}분 더 걸리지만, 이동 부담을 줄일 수 있는 선택지입니다.`;
  const walkingText = `보행은 약 ${route.walkingKm}km, 예상 도보시간은 ${formatWalkingMinutes(route)}입니다.`;
  const scoreText = route.scoreModel
    ? `하루 환산부담은 ${route.scoreModel.dailyBurdenMinutes}분, 보행예산은 ${route.scoreModel.walkBudgetMinutes}분입니다.`
    : '';
  const routeFocus =
    route.id === 'metro'
      ? '긴 구간은 지하철로 넘기고, 걷는 구간을 짧게 나눕니다.'
      : route.id === 'bus'
        ? '버스로 큰 이동을 처리하고, 정류장 전후 도보만 확인합니다.'
        : route.id === 'shade'
          ? '햇빛 노출이 큰 길을 피하고 그늘이 있는 축을 우선합니다.'
          : route.id === 'riverside'
            ? '강변 쪽으로 우회해 길을 이해하기 쉽게 잡습니다.'
            : '이동 부담이 낮은 후보를 우선합니다.';

  return `${formatMinutes(route.minutes)} 경로입니다. ${detourText} ${walkingText} ${scoreText} ${routeFocus}`.replace(/\s+/g, ' ').trim();
}

function describeSegment(segment, index, segments) {
  const [from, to] = segment.label.split(' -> ');
  const destination = to || segment.label;
  const isFirst = index === 0;
  const isLast = index === segments.length - 1;

  if (segment.mode === 'Metro') {
    return `${from}에서 Metro를 타고 ${destination} 방면으로 이동합니다.`;
  }

  if (segment.mode === 'Bus') {
    return `${from}에서 Bus를 타고 ${destination} 방면으로 이동합니다.`;
  }

  if (isFirst) {
    return `${from}에서 ${destination}까지 걸어갑니다.`;
  }

  if (isLast) {
    return `${destination}까지 마지막 도보 구간을 이동합니다.`;
  }

  return `${destination} 방향으로 도보 이동합니다.`;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function calculateDistanceMeters(start, end) {
  const radius = 6371000;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(radius * c);
}

function stabilizeMapCoordinate(value) {
  return Number(value.toFixed(4));
}

function stabilizeMapPoint(point) {
  return {
    ...point,
    lat: stabilizeMapCoordinate(point.lat),
    lng: stabilizeMapCoordinate(point.lng),
  };
}

function calculateBearing(start, end) {
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return Math.round((toDegrees(Math.atan2(y, x)) + 360) % 360);
}

function normalizeHeading(value) {
  return ((value % 360) + 360) % 360;
}

function getHeadingDelta(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 360;
  return Math.abs(((a - b + 540) % 360) - 180);
}

function smoothHeading(previous, next, alpha = 0.24) {
  if (!Number.isFinite(previous)) return normalizeHeading(next);
  const shortestDelta = ((next - previous + 540) % 360) - 180;
  return normalizeHeading(previous + shortestDelta * alpha);
}

function smoothCoordinate(previous, next, alpha) {
  return {
    ...next,
    lat: previous.lat + (next.lat - previous.lat) * alpha,
    lng: previous.lng + (next.lng - previous.lng) * alpha,
  };
}

function projectLatLngToMeters(point, referenceLat) {
  return {
    x: point.lng * 111320 * Math.cos(toRadians(referenceLat)),
    y: point.lat * 110540,
  };
}

function pointToSegmentDistanceMeters(point, start, end) {
  const closest = getClosestPointOnSegment(point, start, end);
  return closest.distanceMeters;
}

function getClosestPointOnSegment(point, start, end) {
  const referenceLat = (point.lat + start.lat + end.lat) / 3;
  const p = projectLatLngToMeters(point, referenceLat);
  const a = projectLatLngToMeters(start, referenceLat);
  const b = projectLatLngToMeters(end, referenceLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      point: start,
      distanceMeters: calculateDistanceMeters(point, start),
    };
  }

  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared, 0, 1);
  const closest = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };
  const distanceX = p.x - closest.x;
  const distanceY = p.y - closest.y;
  const lat = closest.y / 110540;
  const lng = closest.x / (111320 * Math.cos(toRadians(referenceLat)));

  return {
    point: { lat, lng },
    distanceMeters: Math.round(Math.sqrt(distanceX * distanceX + distanceY * distanceY)),
  };
}

function calculateRouteRecoveryTarget(coords, route) {
  const routePoints = route.routePoints.map(canvasPointToLatLng);
  if (routePoints.length < 2) return null;

  return routePoints.slice(1).reduce((best, point, index) => {
    const candidate = getClosestPointOnSegment(coords, routePoints[index], point);
    return best === null || candidate.distanceMeters < best.distanceMeters ? candidate : best;
  }, null);
}

function calculateRouteDeviationMeters(coords, route) {
  return calculateRouteRecoveryTarget(coords, route)?.distanceMeters ?? null;
}

function getRelativeDirectionCue(relativeAngle) {
  if (!Number.isFinite(relativeAngle)) {
    return { key: 'straight', label: '앞으로', icon: ArrowUp };
  }

  if (relativeAngle < 45 || relativeAngle >= 315) return { key: 'straight', label: '앞으로', icon: ArrowUp };
  if (relativeAngle < 135) return { key: 'right', label: '오른쪽', icon: CornerUpRight };
  if (relativeAngle < 225) return { key: 'back', label: '뒤로', icon: ArrowDown };
  return { key: 'left', label: '왼쪽', icon: CornerUpLeft };
}

function getBufferedRelativeDirectionCue(relativeAngle, previousKey) {
  if (!Number.isFinite(relativeAngle) || !previousKey) {
    return getRelativeDirectionCue(relativeAngle);
  }

  const keepPrevious =
    (previousKey === 'straight' && (relativeAngle < 62 || relativeAngle >= 298)) ||
    (previousKey === 'right' && relativeAngle >= 28 && relativeAngle < 152) ||
    (previousKey === 'back' && relativeAngle >= 118 && relativeAngle < 242) ||
    (previousKey === 'left' && relativeAngle >= 208 && relativeAngle < 332);

  return keepPrevious ? getRelativeDirectionCueForKey(previousKey) : getRelativeDirectionCue(relativeAngle);
}

function getRelativeDirectionCueForKey(key) {
  if (key === 'right') return { key: 'right', label: '오른쪽', icon: CornerUpRight };
  if (key === 'back') return { key: 'back', label: '뒤로', icon: ArrowDown };
  if (key === 'left') return { key: 'left', label: '왼쪽', icon: CornerUpLeft };
  return { key: 'straight', label: '앞으로', icon: ArrowUp };
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '대기 중';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${meters}m`;
}

function parseCueDistanceMeters(distance) {
  if (!distance || distance === '전방') return 0;
  const value = Number(String(distance).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(value)) return Infinity;
  return String(distance).includes('km') ? Math.round(value * 1000) : Math.round(value);
}

function buildSpokenDistance(distance) {
  if (!distance || distance === '전방') return '전방';
  return String(distance).includes('km') ? distance.replace('km', '킬로미터') : distance.replace('m', '미터');
}

function getRecoveryCueFromState(locationState, compassState) {
  const facingHeading = Number.isFinite(compassState.heading)
    ? compassState.heading
    : Number.isFinite(locationState.coords?.heading)
      ? locationState.coords.heading
      : Number.isFinite(locationState.bearing)
        ? locationState.bearing
        : null;
  const relativeAngle =
    Number.isFinite(locationState.recoveryBearing) && Number.isFinite(facingHeading)
      ? (locationState.recoveryBearing - facingHeading + 360) % 360
      : 0;
  return getRelativeDirectionCue(relativeAngle);
}

function buildNavigationSpeechText({ cue, recommendation, locationState, compassState }) {
  if (locationState.isOffRoute) {
    const recoveryCue = getRecoveryCueFromState(locationState, compassState);
    return `경로를 벗어났습니다. ${recoveryCue.label} 방향으로 원래 경로에 합류하세요.`;
  }

  const spokenDistance = buildSpokenDistance(cue.distance);
  return ['전방', '지금'].includes(cue.distance)
    ? `${cue.title}. ${cue.terrain || '계속 전방을 확인하세요.'}`
    : `${spokenDistance} 후 ${cue.label}입니다. ${recommendation.destination.shortName} 방향으로 이동하세요.`;
}

function buildVoiceCueKey({ cue, route, locationState, compassState }) {
  if (cue.voiceKey) {
    return `camera-cue:${route.id}:${cue.voiceKey}`;
  }

  if (locationState.isOffRoute) {
    return `off-route:${route.id}`;
  }

  return `route-cue:${route.id}:${cue.key}:${cue.distance}:${cue.title}`;
}

function isMobileCameraDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight) <= 940;
  return mobileUserAgent || (coarsePointer && smallScreen);
}

function isSecureCameraOrigin() {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function isFrontCameraDescriptor({ label = '', facingMode = '' }) {
  return /front|user|face|facetime|전면|셀피|selfie/i.test(label) || facingMode === 'user';
}

function isRearCameraDescriptor({ label = '', facingMode = '' }) {
  return /back|rear|environment|world|wide|tele|ultra|후면|후방/i.test(label) || facingMode === 'environment';
}

function getCompassLabel(bearing) {
  if (!Number.isFinite(bearing)) return '방향 대기';
  const labels = ['북쪽', '북동쪽', '동쪽', '남동쪽', '남쪽', '남서쪽', '서쪽', '북서쪽'];
  return labels[Math.round(bearing / 45) % labels.length];
}

function getTransitIcon(routeType) {
  if (routeType.includes('Metro')) return TrainFront;
  if (routeType.includes('Bus')) return Bus;
  return Navigation;
}

function getPlaceMeta(placeId) {
  return placeMeta[placeId] ?? { icon: MapPin, badge: '저장 장소', note: '선택한 여정 후보입니다.' };
}

function getDuration(durationId) {
  return durationOptions.find((option) => option.id === durationId) ?? durationOptions[0];
}

function getPace(paceId) {
  return paceOptions.find((option) => option.id === paceId) ?? paceOptions[1];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function latLngToCanvasPoint(lat, lng) {
  return {
    x: clamp(((lng - parisMapBounds.west) / (parisMapBounds.east - parisMapBounds.west)) * 100, 8, 92),
    y: clamp(((parisMapBounds.north - lat) / (parisMapBounds.north - parisMapBounds.south)) * 100, 8, 92),
  };
}

function isWithinParisMap(lat, lng) {
  return (
    lat >= parisMapBounds.south &&
    lat <= parisMapBounds.north &&
    lng >= parisMapBounds.west &&
    lng <= parisMapBounds.east
  );
}

function shortLocationName(value, fallback) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed === '현재 위치') return '현재위치';
  if (trimmed.startsWith('현재 위치 주소')) return '출발지';
  return trimmed.split(',')[0].slice(0, 18);
}

function buildFlexibleLocation({ address, anchor, override, role }) {
  const trimmedAddress = address.trim();
  const hasCustomName = trimmedAddress && trimmedAddress !== anchor.name;
  const overridePoint = override?.lat && override?.lng ? latLngToCanvasPoint(override.lat, override.lng) : null;

  return {
    ...anchor,
    ...(overridePoint ?? {}),
    id: hasCustomName || override ? `${role}-${anchor.id}` : anchor.id,
    sourceId: anchor.id,
    name: override?.formattedAddress || trimmedAddress || anchor.name,
    shortName: shortLocationName(trimmedAddress, anchor.shortName),
    area: override?.source || (hasCustomName ? '직접 입력 주소' : anchor.area),
    lat: override?.lat ?? anchor.lat,
    lng: override?.lng ?? anchor.lng,
  };
}

function applyScoreScenario(recommendation, scenarioId) {
  if (scenarioId === 'normal') return recommendation;

  const isLowScore = scenarioId === 'scoreLow';
  const routes = recommendation.routes.map((route, index) => {
    const demoScore = isLowScore ? Math.max(6, 18 - index * 3) : Math.max(58, 80 - index * 7);
    const demoDetour = isLowScore ? Math.max(route.detourMinutes, 35 + index * 4) : Math.min(route.detourMinutes, 20);
    const demoAllowed = !isLowScore;
    const demoMinutes = isLowScore ? route.baselineTravelTimeMin + demoDetour : route.minutes;
    const scenarioReason = isLowScore
      ? '발표 시연용으로 가장 빠른 후보보다 우회 시간이 큰 상태입니다.'
      : '발표 시연용으로 추가 이동 부담이 낮은 80점 상황입니다.';

    return {
      ...route,
      minutes: demoMinutes,
      detourMinutes: demoDetour,
      allowed: demoAllowed,
      recommendationScore: demoScore,
      comfortScore: demoScore,
      speedScore: demoScore,
      timeScore: demoScore,
      grade: demoAllowed ? '추천 가능' : '우회 큼',
      summary: `하루 이동부담 기준 ${demoScore}점입니다. ${scenarioReason}`,
      reasons: [scenarioReason, ...route.reasons.filter((reason) => !reason.includes('발표 시연용'))].slice(0, 4),
    };
  });
  const bestRoute = routes[0];

  return {
    ...recommendation,
    routes,
    bestRoute,
    narrative: {
      ...recommendation.narrative,
      title: isLowScore ? '20점 미만 경고 상황입니다' : '80점 기준 경로를 시연합니다',
      body: isLowScore
        ? `${bestRoute.name}은 발표 시연에서 총 ${bestRoute.minutes}분, 최단 대비 +${bestRoute.detourMinutes}분으로 처리되어 20점 미만 경고를 보여줍니다.`
        : `${bestRoute.name}은 추가 이동 부담이 낮게 관리되는 80점 상황으로 보여줍니다.`,
    },
  };
}

function orderPlacesForPlan(places, weather, paceId) {
  const heatPressure = weather.temperature >= 30 || weather.humidity >= 68 ? 1 : 0.45;
  const pace = getPace(paceId);

  return [...places].sort((a, b) => {
    const score = (place) => {
      const shade = place.shadeProfile * (38 + heatPressure * 26);
      const crowdRelief = (1 - place.crowdProfile) * (pace.id === 'packed' ? 8 : 18);
      const transitRelief = place.id === 'montmartre' || place.id === 'arc' ? 6 : 0;
      const indoorRelief = ['louvre', 'orsay', 'sainte'].includes(place.id) ? 12 * heatPressure : 0;
      const parkRelief = place.id === 'luxembourg' ? 15 : 0;
      const speedBias = pace.modeId === 'time' ? -place.x * 0.05 : 0;
      return shade + crowdRelief + transitRelief + indoorRelief + parkRelief + speedBias;
    };

    return score(b) - score(a);
  });
}

function buildGuideWelcome(destination, route) {
  return {
    id: `welcome-${destination.id}-${route.id}`,
    role: 'assistant',
    text: `${destination.name} 여정을 기준으로 답변할게요. 여행 가이드처럼 주변 추천, 더위를 피하는 동선, 사진으로 표지판이나 정류장을 확인하는 방법까지 함께 봅니다.`,
  };
}

function buildPhotoAnalysis(route, destination) {
  if (route.id === 'metro') {
    return {
      title: 'Metro 입구와 노선 방향을 확인하세요',
      body: `${destination.shortName} 방향으로 가려면 역명, 노선 번호, 출구 표기가 함께 보이는지 확인하는 것이 좋습니다.`,
      checks: ['M 또는 Metro 표지', '노선 번호와 방향', '출구 번호 또는 거리 표지'],
    };
  }

  if (route.id === 'bus') {
    return {
      title: '정류장 이름과 진행 방향을 확인하세요',
      body: '버스 경로는 정류장 반대편으로 들어가면 시간이 크게 늘어납니다. 표지판의 정류장명과 노선 방향을 먼저 확인하세요.',
      checks: ['정류장 이름', '버스 번호', '종점 방향'],
    };
  }

  if (route.id === 'riverside') {
    return {
      title: '강변 보행로 진입 표식을 찾으세요',
      body: '강변으로 내려가는 계단이나 보행자 전용 표식을 확인하면 차량 동선과 섞이지 않고 이동할 수 있습니다.',
      checks: ['보행자 전용 표식', '강변 진입 계단', '다리 이름'],
    };
  }

  if (route.id === 'shade') {
    return {
      title: '그늘 골목과 공원 입구를 확인하세요',
      body: '건물 그늘이 이어지는 골목, 공원 입구, 아케이드 표식을 기준으로 직사광선 노출을 줄이는 방향을 잡습니다.',
      checks: ['공원 입구', '보행자 골목', '그늘이 이어지는 방향'],
    };
  }

  return {
    title: '목적지 방향 표지와 횡단 동선을 확인하세요',
    body: '최단 보행 경로는 빠르지만 노출이 큽니다. 표지판과 횡단보도를 확인하면서 그늘이 있는 쪽으로 붙어 이동하세요.',
    checks: ['목적지 방향 표지', '횡단보도', '그늘 보행 가능 구간'],
  };
}

function getTurnDirection(route) {
  const [first, second, third] = route.routePoints;
  if (!first || !second || !third) {
    return { key: 'straight', label: '직진', icon: ArrowUp, rotation: 0 };
  }

  const dx1 = second.x - first.x;
  const dy1 = second.y - first.y;
  const dx2 = third.x - second.x;
  const dy2 = third.y - second.y;
  const cross = dx1 * dy2 - dy1 * dx2;
  const dot = dx1 * dx2 + dy1 * dy2;
  const angle = Math.abs(toDegrees(Math.atan2(cross, dot)));

  if (angle < 24) return { key: 'straight', label: '직진', icon: ArrowUp, rotation: 0 };
  if (cross > 0) return { key: 'right', label: '우회전', icon: CornerUpRight, rotation: 0 };
  return { key: 'left', label: '좌회전', icon: CornerUpLeft, rotation: 0 };
}

function buildArHudCue(route, recommendation) {
  const turn = getTurnDirection(route);
  const nextSegment = route.segments[0];
  const routeName = route.name;
  const destinationName = recommendation.destination.shortName;
  const label = nextSegment?.label.split(' -> ').at(-1) ?? destinationName;

  if (route.id === 'metro') {
    return {
      ...turn,
      title: `${label} 방면 ${turn.label}`,
      subtitle: 'Metro 표지, 노선 번호, 입구 계단을 함께 확인하세요.',
      distance: nextSegment ? `${Math.round(nextSegment.km * 1000)}m` : '전방',
      terrain: '지하철 입구에서는 계단/에스컬레이터 방향을 확인',
      warning: '실내 진입 후에는 사진 분석으로 표지판을 확인하세요.',
      markers: ['stairsDown', 'sign'],
    };
  }

  if (route.id === 'bus') {
    return {
      ...turn,
      title: `${label} 정류장 쪽 ${turn.label}`,
      subtitle: '정류장명과 버스 진행 방향이 같은지 확인하세요.',
      distance: nextSegment ? `${Math.round(nextSegment.km * 1000)}m` : '전방',
      terrain: '반대편 정류장 진입 주의',
      warning: '정류장 표지판을 찍으면 AI가 방향을 확인합니다.',
      markers: ['sign', 'caution'],
    };
  }

  if (route.id === 'shade') {
    return {
      ...turn,
      title: `${label} 그늘 골목으로 ${turn.label}`,
      subtitle: '건물 그늘이 이어지는 쪽으로 붙어서 이동하세요.',
      distance: nextSegment ? `${Math.round(nextSegment.km * 1000)}m` : '전방',
      terrain: '좁은 골목/그늘축 확인',
      warning: '햇빛 노출이 큰 길이면 다음 그늘 구간을 우선하세요.',
      markers: ['shade', 'caution'],
    };
  }

  if (route.id === 'riverside') {
    return {
      ...turn,
      title: `${label} 강변 접근로 ${turn.label}`,
      subtitle: '강변 진입 계단이나 보행자 표식을 확인하세요.',
      distance: nextSegment ? `${Math.round(nextSegment.km * 1000)}m` : '전방',
      terrain: '강변 진입 계단/내려가는 길 가능',
      warning: '계단이 보이면 난간과 보행자 동선을 먼저 확인하세요.',
      markers: ['stairsDown', 'sign'],
    };
  }

  return {
    ...turn,
    title: `${label} 쪽으로 ${turn.label}`,
    subtitle: `${routeName}을 따라 횡단보도와 골목 입구를 확인하세요.`,
    distance: nextSegment ? `${Math.round(nextSegment.km * 1000)}m` : '전방',
    terrain: routeName.includes('Champs') ? '넓은 대로/오르막 가능' : '횡단보도와 골목 방향 확인',
    warning: '갈림길에서는 카메라 사진 분석으로 표지판을 확인하세요.',
    markers: ['caution', 'sign'],
  };
}

function buildCameraScenarioCue(scenarioId, elapsedSeconds, route, recommendation, demoStep = 0) {
  const baseCue = buildArHudCue(route, recommendation);
  if (!demoStep) return baseCue;

  const elapsed = Math.max(0, Math.round(elapsedSeconds));
  const isArrived = elapsed >= 10;
  const remainingSeconds = Math.max(0, 10 - elapsed);
  const distanceMeters = Math.max(0, Math.round(80 - elapsed * 8));

  if (scenarioId === 'bus') {
    if (!isArrived) return baseCue;

    return {
      key: 'bus-stop',
      label: '정류장 확인',
      icon: Bus,
      title: 'BUS 323 정류장 도착',
      subtitle: '정류장명과 Roger Salengro 방면 표기를 확인하세요.',
      distance: '지금',
      terrain: '반대편 정류장 진입 주의 · 버스 진행 방향 확인',
      warning: '정류장명과 노선 번호가 맞는지 카메라로 확인합니다.',
      markers: ['bus', 'sign'],
      mapLabel: 'BUS 323 정류장 위치 확인',
      statusText: '정류장 확인 중',
      voiceKey: 'bus-arrived',
      demo: true,
    };
  }

  if (scenarioId === 'metro') {
    if (!isArrived) return baseCue;

    return {
      key: 'metro-entry',
      label: '탑승',
      icon: TrainFront,
      title: 'Metro 입구로 들어가 탑승하세요',
      subtitle: 'M 표지와 노선 번호를 확인한 뒤 개찰구 방향으로 진입하세요.',
      distance: '지금',
      terrain: '입구 표지 · 노선 번호 · 개찰구 방향 확인',
      warning: '역명과 노선 번호가 맞는지 카메라로 확인합니다.',
      markers: ['metro', 'stairsDown', 'sign'],
      mapLabel: 'Metro 탑승 지점 확인',
      statusText: 'Metro 탑승 안내 중',
      voiceKey: 'metro-arrived',
      demo: true,
    };
  }

  if (scenarioId === 'stairs-down' || (scenarioId === 'stairs' && demoStep === 1)) {
    return {
      key: 'stairs-down',
      label: '내려가기',
      icon: ArrowDownToLine,
      title: '이 계단으로 내려가세요',
      subtitle: '난간과 보행 방향을 확인하고 아래층 통로로 진입하세요.',
      distance: '지금',
      terrain: '아래층 진입 · 계단 폭과 진행 방향 확인',
      warning: '내려가는 계단인지, 올라가는 계단인지 카메라 HUD로 구분합니다.',
      markers: ['stairsDown'],
      mapLabel: '내려가는 계단 진입',
      statusText: '하강 계단 안내 중',
      voiceKey: 'stairs-down-arrived',
      demo: true,
    };
  }

  if (scenarioId === 'stairs-up' || (scenarioId === 'stairs' && demoStep >= 2)) {
    return {
      key: 'stairs-up',
      label: '올라가기',
      icon: ArrowUpToLine,
      title: '이 계단으로 올라가세요',
      subtitle: '위층 출구 표지를 확인하고 플랫폼/거리 방향으로 올라가세요.',
      distance: '지금',
      terrain: '위층 이동 · 출구/플랫폼 방향 확인',
      warning: '출구 표지와 계단 방향을 카메라 HUD로 확인합니다.',
      markers: ['stairsUp'],
      mapLabel: '올라가는 계단 진입',
      statusText: '상승 계단 안내 중',
      voiceKey: 'stairs-up-arrived',
      demo: true,
    };
  }

  return buildArHudCue(route, recommendation);
}

function loadSavedTrips() {
  try {
    const raw = window.localStorage.getItem('coolpath.savedTrips');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function buildPlanTitle(durationId, plannedPlaces) {
  const duration = getDuration(durationId);
  const firstPlace = plannedPlaces[0]?.shortName ?? 'Paris';
  return `${firstPlace} 중심 ${duration.label} 플랜`;
}

function App() {
  const [activePage, setActivePage] = useState(() => normalizePage(window.location.hash.replace('#', '')));
  const [originAddress, setOriginAddress] = useState('현재 위치 주소 확인 중');
  const [originAnchorId] = useState('eiffel');
  const [originOverride, setOriginOverride] = useState(null);
  const [destinationAddress, setDestinationAddress] = useState('루브르 박물관, Paris');
  const [destinationOverride, setDestinationOverride] = useState(null);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState(['louvre', 'orsay', 'luxembourg']);
  const [destinationId, setDestinationId] = useState('louvre');
  const [durationId, setDurationId] = useState('3');
  const [dateMode, setDateMode] = useState('quick');
  const [tripStartDate, setTripStartDate] = useState('');
  const [tripEndDate, setTripEndDate] = useState('');
  const [orderMode, setOrderMode] = useState('auto');
  const [autoRecommendEnabled, setAutoRecommendEnabled] = useState(false);
  const [personalPreference, setPersonalPreference] = useState('');
  const [planGenerated, setPlanGenerated] = useState(false);
  const [paceId, setPaceId] = useState('balanced');
  const [scoreScenarioId] = useState(getInitialScoreScenario);
  const [cameraScenarioId] = useState(getInitialCameraScenario);
  const [cameraDemoElapsed, setCameraDemoElapsed] = useState(0);
  const [cameraDemoStep, setCameraDemoStep] = useState(0);
  const [cameraDemoStartedAt, setCameraDemoStartedAt] = useState(null);
  const [mapZoom, setMapZoom] = useState(14);
  const [savedTrips, setSavedTrips] = useState(loadSavedTrips);
  const [saveState, setSaveState] = useState('idle');
  const [expandedSections, setExpandedSections] = useState({
    basics: true,
    places: true,
    preference: true,
    weather: false,
  });
  const [weather, setWeather] = useState(weatherPresets[0].values);
  const [weatherApiState, setWeatherApiState] = useState({
    status: 'idle',
    message: '목적지를 선택하면 날씨를 자동 조회합니다.',
  });
  const [placeResolveState, setPlaceResolveState] = useState({
    origin: '현재 위치 주소를 확인하고 있습니다. 필요하면 지도 선택이나 주소 입력으로 바꿀 수 있습니다.',
    destination: '목적지는 직접 입력하거나 지도에서 선택할 수 있습니다.',
  });
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [guideMessages, setGuideMessages] = useState([]);
  const [guideInput, setGuideInput] = useState('');
  const [guideStatus, setGuideStatus] = useState('idle');
  const [guideUsageCount, setGuideUsageCount] = useState(readGuideUsageCount);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [locationState, setLocationState] = useState({
    status: 'idle',
    message: 'GPS 대기',
    coords: null,
    accuracy: null,
    distanceMeters: null,
    bearing: null,
    routeDeviationMeters: null,
    routeDeviationThreshold: null,
    recoveryBearing: null,
    isGpsStable: false,
    isOffRoute: false,
  });
  const [compassState, setCompassState] = useState({
    status: 'idle',
    message: '나침반 대기',
    heading: null,
  });
  const [visionStatus, setVisionStatus] = useState('idle');
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoAnalysis, setPhotoAnalysis] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const locationWatchRef = useRef(null);
  const lastStableLocationRef = useRef(null);
  const lastHudUpdateRef = useRef({ timestamp: 0, coords: null, bearing: null, isOffRoute: false });
  const routeAlertRef = useRef({ isOffRoute: false, offCount: 0, onCount: 0 });
  const compassListenerRef = useRef(null);
  const lastCompassHeadingRef = useRef({ heading: null, timestamp: 0 });
  const lastSpokenCueRef = useRef(null);
  const fileInputRef = useRef(null);
  const autoCameraStartedRef = useRef(false);
  const autoOriginResolvedRef = useRef(false);

  const selectedPlaces = useMemo(
    () => selectedPlaceIds.map((id) => parisPlaces.find((place) => place.id === id)).filter(Boolean),
    [selectedPlaceIds],
  );
  const candidatePlaces = useMemo(
    () => (autoRecommendEnabled ? parisPlaces : selectedPlaces),
    [autoRecommendEnabled, selectedPlaces],
  );
  const orderedPlaces = useMemo(
    () =>
      !autoRecommendEnabled && orderMode === 'manual'
        ? selectedPlaces
        : orderPlacesForPlan(candidatePlaces, weather, paceId),
    [autoRecommendEnabled, orderMode, selectedPlaces, candidatePlaces, weather, paceId],
  );
  const plannedPlaces = useMemo(() => {
    const limit = getDuration(durationId).placeLimit;
    return orderedPlaces.slice(0, limit);
  }, [durationId, orderedPlaces]);
  const pace = getPace(paceId);
  const modeId = pace.modeId;
  const originAnchor = useMemo(
    () => parisPlaces.find((place) => place.id === originAnchorId) ?? parisPlaces[0],
    [originAnchorId],
  );
  const destinationAnchor = useMemo(
    () => parisPlaces.find((place) => place.id === destinationId) ?? parisPlaces[1],
    [destinationId],
  );
  const destination = useMemo(
    () =>
      buildFlexibleLocation({
        address: destinationAddress,
        anchor: destinationAnchor,
        override: destinationOverride,
        role: 'destination',
      }),
    [destinationAddress, destinationAnchor, destinationOverride],
  );
  const originLocation = useMemo(
    () =>
      buildFlexibleLocation({
        address: originAddress,
        anchor: originAnchor,
        override: originOverride,
        role: 'origin',
      }),
    [originAddress, originAnchor, originOverride],
  );

  const baseRecommendation = useMemo(
    () =>
      buildRouteRecommendation({
        origin: originLocation,
        destination,
        weather,
        timeSlotId: '14',
        modeId,
        places: parisPlaces,
        plannedPlaceCount: plannedPlaces.length,
      }),
    [originLocation, destination, weather, modeId, plannedPlaces.length],
  );
  const recommendation = useMemo(
    () => applyScoreScenario(baseRecommendation, scoreScenarioId),
    [baseRecommendation, scoreScenarioId],
  );

  const selectedRoute = recommendation.routes.find((route) => route.id === selectedRouteId) ?? recommendation.bestRoute;
  const cameraCue = useMemo(
    () =>
      cameraScenarioId === 'none'
        ? buildArHudCue(selectedRoute, recommendation)
        : buildCameraScenarioCue(cameraScenarioId, cameraDemoElapsed, selectedRoute, recommendation, cameraDemoStep),
    [cameraScenarioId, cameraDemoElapsed, cameraDemoStep, selectedRoute, recommendation],
  );

  useEffect(() => {
    const handleHashChange = () => setActivePage(normalizePage(window.location.hash.replace('#', '')));
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    setSelectedRouteId(recommendation.bestRoute.id);
  }, [recommendation.bestRoute.id]);

  useEffect(() => {
    setGuideMessages([buildGuideWelcome(destination, selectedRoute)]);
    setGuideInput('');
    setGuideStatus('idle');
  }, [destination.id, selectedRoute.id]);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, activePage]);

  useEffect(() => {
    if (activePage !== 'camera' || cameraStatus !== 'live' || cameraScenarioId === 'none') {
      setCameraDemoElapsed(0);
      setCameraDemoStep(0);
      setCameraDemoStartedAt(null);
      return undefined;
    }

    if (!cameraDemoStartedAt) {
      setCameraDemoElapsed(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCameraDemoElapsed(Math.min(60, Math.floor((Date.now() - cameraDemoStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activePage, cameraStatus, cameraScenarioId, cameraDemoStartedAt]);

  useEffect(() => {
    if (!voiceEnabled || cameraStatus !== 'live') {
      return;
    }

    const cue = cameraCue;
    const cueDistanceMeters = parseCueDistanceMeters(cue.distance);
    const shouldSpeak = locationState.isOffRoute || cueDistanceMeters <= 100;

    if (!shouldSpeak) {
      lastSpokenCueRef.current = null;
      return;
    }

    const cueKey = buildVoiceCueKey({
      cue,
      route: selectedRoute,
      locationState,
      compassState,
    });

    if (lastSpokenCueRef.current === cueKey) {
      return;
    }

    lastSpokenCueRef.current = cueKey;
    speakNavigationCue(cue);
  }, [
    voiceEnabled,
    cameraStatus,
    cameraCue,
    selectedRoute.id,
    recommendation.destination.id,
    locationState.isOffRoute,
    locationState.recoveryBearing,
    compassState.heading,
  ]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (locationWatchRef.current !== null) {
        navigator.geolocation?.clearWatch(locationWatchRef.current);
      }
      if (compassListenerRef.current) {
        window.removeEventListener('deviceorientationabsolute', compassListenerRef.current, true);
        window.removeEventListener('deviceorientation', compassListenerRef.current, true);
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem('coolpath.savedTrips', JSON.stringify(savedTrips));
    } catch {
      // 저장 실패는 핵심 시연 흐름을 막지 않습니다.
    }
  }, [savedTrips]);

  useEffect(() => {
    if (saveState !== 'saved') return undefined;
    const timer = window.setTimeout(() => setSaveState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    let cancelled = false;

    async function loadDestinationWeather() {
      setWeatherApiState({
        status: 'loading',
        message: `${destination.name} 기준 날씨를 불러오는 중입니다.`,
      });

      try {
        const liveWeather = await fetchLiveWeather(destination);
        if (cancelled) return;
        setWeather({
          temperature: liveWeather.temperature,
          humidity: liveWeather.humidity,
          wind: liveWeather.wind,
        });
        setWeatherApiState({
          status: 'success',
          message: `${liveWeather.city || destination.name} · ${liveWeather.condition} · ${liveWeather.source}`,
        });
      } catch (error) {
        if (cancelled) return;
        setWeatherApiState({
          status: 'error',
          message: `날씨 조회 실패: ${error.message}`,
        });
      }
    }

    loadDestinationWeather();
    return () => {
      cancelled = true;
    };
  }, [destination.id]);

  const navigateTo = (page) => {
    if (page !== 'camera') stopCamera();
    setActivePage(page);
    if (window.location.hash !== `#${page}`) {
      window.location.hash = page;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changeOriginAddress = (value) => {
    setOriginAddress(value);
    setOriginOverride(null);
    setPlanGenerated(false);
    setPlaceResolveState((current) => ({
      ...current,
      origin: '주소를 바꾸면 지도 기준점으로 먼저 경로를 계산합니다. 필요하면 주소 좌표 찾기를 누르세요.',
    }));
  };

  const changeDestinationAddress = (value) => {
    setDestinationAddress(value);
    setDestinationOverride(null);
    setPlanGenerated(false);
    setPlaceResolveState((current) => ({
      ...current,
      destination: '주소를 바꾸면 지도 기준점으로 먼저 경로를 계산합니다. 필요하면 주소 좌표 찾기를 누르세요.',
    }));
  };

  const pickDestinationOnMap = (placeId) => {
    const place = parisPlaces.find((item) => item.id === placeId);
    if (!place) return;
    setDestinationId(place.id);
    setDestinationAddress(`${place.name}, Paris`);
    setDestinationOverride(null);
    setPlanGenerated(false);
    setPlaceResolveState((current) => ({
      ...current,
      destination: `${place.name} 기준으로 목적지를 설정했습니다.`,
    }));
  };

  const resolveAddress = async (kind) => {
    const address = kind === 'origin' ? originAddress : destinationAddress;
    const anchor = kind === 'origin' ? originAnchor : destinationAnchor;
    const setOverride = kind === 'origin' ? setOriginOverride : setDestinationOverride;

    if (!address.trim() || address.trim() === '현재 위치') {
      setPlaceResolveState((current) => ({
        ...current,
        [kind]: kind === 'origin' ? '현재위치는 GPS 버튼으로 갱신할 수 있습니다.' : '주소를 입력한 뒤 좌표를 찾을 수 있습니다.',
      }));
      return;
    }

    setPlaceResolveState((current) => ({
      ...current,
      [kind]: '주소 좌표를 찾는 중입니다.',
    }));

    try {
      const result = await fetchPlaceGeocode(address);
      const insideParis = isWithinParisMap(result.lat, result.lng);
      setOverride(
        insideParis
          ? {
              lat: result.lat,
              lng: result.lng,
              formattedAddress: result.formattedAddress,
              source: 'Google 주소 좌표',
            }
          : null,
      );
      setPlanGenerated(false);
      setPlaceResolveState((current) => ({
        ...current,
        [kind]: insideParis
          ? `${result.formattedAddress} 좌표를 반영했습니다.`
          : '파리 중심 지도 범위 밖 주소라 지도 위치는 기준점으로 보정합니다.',
      }));
    } catch (error) {
      setOverride(null);
      setPlaceResolveState((current) => ({
        ...current,
        [kind]: `주소 좌표를 찾지 못했습니다. 지도 기준점으로 계속 계산합니다. (${error.message})`,
      }));
    }
  };

  const useCurrentOrigin = () => {
    if (!navigator.geolocation) {
      setOriginAddress('현재 위치 주소 확인 실패');
      setPlaceResolveState((current) => ({
        ...current,
        origin: '이 브라우저에서는 현재 위치를 사용할 수 없습니다.',
      }));
      return;
    }

    setOriginAddress('현재 위치 주소 확인 중');
    setPlaceResolveState((current) => ({
      ...current,
      origin: '현재 위치 권한을 요청하는 중입니다.',
    }));

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const fallbackAddress = `GPS ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
        let resolvedAddress = fallbackAddress;
        let addressSource = 'GPS 현재 위치';

        try {
          const reverseResult = await fetchReverseGeocode(coords);
          resolvedAddress = reverseResult.formattedAddress || fallbackAddress;
          addressSource = reverseResult.source || addressSource;
        } catch {
          resolvedAddress = fallbackAddress;
        }

        setOriginAddress(resolvedAddress);

        if (!isWithinParisMap(coords.lat, coords.lng)) {
          setOriginOverride(null);
          setPlaceResolveState((current) => ({
            ...current,
            origin: `현재 위치는 ${resolvedAddress}입니다. 파리 지도 범위 밖이라 시연 기준점으로 계산합니다.`,
          }));
          return;
        }

        setOriginOverride({
          ...coords,
          formattedAddress: resolvedAddress,
          source: addressSource,
        });
        setPlanGenerated(false);
        setPlaceResolveState((current) => ({
          ...current,
          origin: `${resolvedAddress} 위치를 반영했습니다. 정확도 ±${Math.round(position.coords.accuracy ?? 0)}m`,
        }));
      },
      (error) => {
        setOriginAddress('현재 위치 주소 확인 실패');
        setOriginOverride(null);
        setPlaceResolveState((current) => ({
          ...current,
          origin: error.code === error.PERMISSION_DENIED ? '위치 권한이 거부되었습니다.' : '현재 위치를 가져오지 못했습니다.',
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 8000,
        timeout: 12000,
      },
    );
  };

  useEffect(() => {
    if (autoOriginResolvedRef.current) return;
    autoOriginResolvedRef.current = true;
    useCurrentOrigin();
  }, []);

  const togglePlace = (placeId) => {
    if (autoRecommendEnabled) return;
    setSelectedPlaceIds((current) => {
      if (current.includes(placeId)) {
        return current.length === 1 ? current : current.filter((id) => id !== placeId);
      }
      return [...current, placeId];
    });
    setPlanGenerated(false);
  };

  const generatePlan = () => {
    const firstDestination = plannedPlaces[0] ?? destinationAnchor;
    if (firstDestination?.id) {
      setDestinationId(firstDestination.id);
      setDestinationAddress(`${firstDestination.name}, Paris`);
      setDestinationOverride(null);
    }
    setSelectedRouteId(recommendation.bestRoute.id);
    setPlanGenerated(true);
    setSaveState('idle');
    if (window.location.hash !== '#plan') {
      window.location.hash = 'plan';
    }
  };

  const toggleSection = (sectionId) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };

  const regenerateOrder = () => {
    const aiOrder = orderPlacesForPlan(candidatePlaces, weather, paceId).map((place) => place.id);
    setOrderMode('auto');
    if (!autoRecommendEnabled) {
      setSelectedPlaceIds(aiOrder);
    }
    setPlanGenerated(true);
    setSaveState('idle');
  };

  const retryRecommendation = () => {
    setSelectedRouteId(recommendation.bestRoute.id);
    setPlanGenerated(true);
    setSaveState('idle');
  };

  const saveTrip = () => {
    const trip = {
      id: Date.now(),
      title: buildPlanTitle(durationId, plannedPlaces),
      createdAt: new Date().toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      durationLabel: getDuration(durationId).label,
      destinationName: destination.name,
      routeName: selectedRoute.name,
      routeMinutes: selectedRoute.minutes,
      preference: personalPreference.trim(),
      places: plannedPlaces.map((place) => place.name),
    };

    setSavedTrips((current) => [trip, ...current.filter((item) => item.title !== trip.title)].slice(0, 6));
    setSaveState('saved');
  };

  const clearSavedTrips = () => {
    setSavedTrips([]);
  };

  const changeMapZoom = (delta) => {
    setMapZoom((current) => Math.min(17, Math.max(12, current + delta)));
  };

  const speakNavigationCue = (cueOverride) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const cue = cueOverride ?? buildArHudCue(selectedRoute, recommendation);
    const text = buildNavigationSpeechText({
      cue,
      recommendation,
      locationState,
      compassState,
    });
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceGuidance = () => {
    setVoiceEnabled((current) => {
      const next = !current;
      lastSpokenCueRef.current = null;

      if (!next && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      return next;
    });
  };

  const triggerCameraScenario = () => {
    if (cameraStatus !== 'live' || cameraScenarioId === 'none') return;

    lastSpokenCueRef.current = null;
    setCameraDemoElapsed(0);
    setCameraDemoStartedAt(Date.now());
    setCameraDemoStep((current) => {
      if (cameraScenarioId === 'stairs') {
        return current >= 2 ? 1 : current + 1;
      }
      return 1;
    });
  };

  const askTravelGuide = async (questionOverride) => {
    const question = (questionOverride ?? guideInput).trim();
    if (!question || guideStatus === 'loading') return;

    const storedUsageCount = readGuideUsageCount();
    if (storedUsageCount !== guideUsageCount) {
      setGuideUsageCount(storedUsageCount);
    }

    if (storedUsageCount >= GUIDE_DAILY_LIMIT) {
      setGuideInput('');
      setGuideMessages((current) =>
        current.at(-1)?.text === GUIDE_LIMIT_MESSAGE
          ? current
          : [...current, { id: `assistant-limit-${Date.now()}`, role: 'assistant', text: GUIDE_LIMIT_MESSAGE }],
      );
      return;
    }

    const nextUsageCount = storedUsageCount + 1;
    writeGuideUsageCount(nextUsageCount);
    setGuideUsageCount(nextUsageCount);

    setGuideInput('');
    setGuideStatus('loading');
    setGuideMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text: question }]);

    try {
      const result = await fetchTravelGuideChat({
        question,
        recommendation,
        selectedRoute,
        plannedPlaces,
        personalPreference,
      });
      setGuideMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: result.text,
          source: result.source,
        },
      ]);
      setGuideStatus('idle');
    } catch (error) {
      setGuideMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: `지금은 AI 응답을 가져오지 못했습니다. 그래도 ${destination.name} 이동에서는 ${selectedRoute.name} 기준으로 표지판, 정류장명, 출구 번호를 먼저 확인하는 것이 안전합니다. (${error.message})`,
        },
      ]);
      setGuideStatus('error');
    }
  };

  const refreshCameraDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      setCameraDevices(videoDevices);
    } catch {
      setCameraDevices([]);
    }
  };

  const listVideoInputDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      setCameraDevices(videoDevices);
      return videoDevices;
    } catch {
      setCameraDevices([]);
      return [];
    }
  };

  const tuneCameraTrack = async (track) => {
    if (!track?.applyConstraints) return;

    const capabilities = track.getCapabilities?.() ?? {};
    const advanced = {};

    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
      advanced.focusMode = 'continuous';
    }
    if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
      advanced.exposureMode = 'continuous';
    }
    if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
      advanced.whiteBalanceMode = 'continuous';
    }

    const constraints = {
      frameRate: { ideal: 24, max: 30 },
      ...(Object.keys(advanced).length ? { advanced: [advanced] } : {}),
    };

    try {
      await track.applyConstraints(constraints);
    } catch {
      // 일부 모바일 브라우저는 초점/노출 제약을 무시하거나 거부합니다. 실패해도 카메라 실행은 유지합니다.
    }
  };

  const ensureRearCameraStream = async (stream, { allowAmbiguous = false } = {}) => {
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    const label = track?.label ?? '';
    const descriptor = { label, facingMode: settings.facingMode };
    const frontLike = isFrontCameraDescriptor(descriptor);
    const rearLike = isRearCameraDescriptor(descriptor);

    if (frontLike) {
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      throw new Error('전면 카메라는 길안내에서 사용하지 않습니다. 후면 카메라 권한을 허용해 주세요.');
    }

    if (!rearLike && !allowAmbiguous) {
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      throw new Error('후면 카메라를 확인하지 못했습니다. 브라우저 카메라 권한을 다시 확인해 주세요.');
    }

    await tuneCameraTrack(track);
    return stream;
  };

  const openCameraStream = async () => {
    const rearFirstAttempts = [
      {
        name: 'environment-exact-hd',
        allowAmbiguous: true,
        constraints: {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: { exact: 'environment' },
          },
          audio: false,
        },
      },
      {
        name: 'environment-ideal-hd',
        allowAmbiguous: false,
        constraints: {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        },
      },
      {
        name: 'environment-ideal-safe',
        allowAmbiguous: false,
        constraints: {
          video: {
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        },
      },
    ];
    let lastError = null;

    for (const attempt of rearFirstAttempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
        return await ensureRearCameraStream(stream, { allowAmbiguous: attempt.allowAmbiguous });
      } catch (error) {
        lastError = error;
      }
    }

    const devices = await listVideoInputDevices();
    const rearCandidates = devices.filter((device) => {
      const descriptor = { label: device.label };
      return isRearCameraDescriptor(descriptor) && !isFrontCameraDescriptor(descriptor);
    });

    for (const device of rearCandidates) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: device.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
        return await ensureRearCameraStream(stream, { allowAmbiguous: true });
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(lastError?.message || '후면 카메라를 찾지 못했습니다.');
  };

  const startCamera = async () => {
    setActivePage('camera');
    if (window.location.hash !== '#camera') {
      window.location.hash = 'camera';
    }

    if (!isMobileCameraDevice()) {
      stopCamera();
      stopGpsHud();
      stopCompassHud();
      setCameraStatus('desktop');
      setPhotoAnalysis({
        title: '모바일 후면카메라 전용',
        body: '이 길안내는 휴대폰 후면카메라에서만 실행됩니다. 컴퓨터에서는 카메라를 열지 않습니다.',
        checks: [],
      });
      return;
    }

    if (!isSecureCameraOrigin()) {
      stopCamera();
      stopGpsHud();
      stopCompassHud();
      setCameraStatus('insecure');
      setPhotoAnalysis({
        title: 'HTTPS 연결 필요',
        body: '휴대폰에서는 HTTPS 주소로 접속해야 후면카메라와 GPS 권한을 사용할 수 있습니다.',
        checks: [],
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      stopCamera();
      stopGpsHud();
      stopCompassHud();
      setCameraStatus('blocked');
      setPhotoAnalysis({
        title: '후면카메라를 사용할 수 없음',
        body: '이 브라우저는 모바일 후면카메라 실행을 지원하지 않습니다.',
        checks: [],
      });
      return;
    }

    setCameraStatus('loading');
    startGpsHud();
    startCompassHud();

    try {
      const stream = await openCameraStream();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus('live');
      stream.getVideoTracks()[0]?.addEventListener(
        'ended',
        () => {
          if (streamRef.current !== stream) return;
          streamRef.current = null;
          setCameraStream(null);
          stopGpsHud();
          stopCompassHud();
          setCameraStatus('blocked');
          setPhotoAnalysis({
            title: '카메라 연결이 중단되었습니다',
            body: '브라우저가 후면카메라 스트림을 종료했습니다. 다시 카메라를 켜서 길안내를 재시작해 주세요.',
            checks: [],
          });
        },
        { once: true },
      );
      await refreshCameraDevices();
    } catch (error) {
      setCameraStream(null);
      streamRef.current = null;
      stopGpsHud();
      stopCompassHud();
      setCameraStatus('blocked');
      setPhotoAnalysis({
        title: '후면카메라 실행 실패',
        body: `후면카메라 권한을 허용했는지 확인해 주세요. 이 기능은 전면카메라로 대체 실행하지 않습니다. (${error.message})`,
        checks: [],
      });
    }
  };

  const stopCamera = () => {
    const activeStream = streamRef.current;
    streamRef.current = null;
    activeStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraStatus('idle');
    lastSpokenCueRef.current = null;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const stopGpsHud = () => {
    if (locationWatchRef.current !== null) {
      navigator.geolocation?.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    setLocationState((current) => ({
      ...current,
      status: 'idle',
      message: 'GPS 대기',
      routeDeviationMeters: null,
      routeDeviationThreshold: null,
      recoveryBearing: null,
      isGpsStable: false,
      isOffRoute: false,
    }));
    lastStableLocationRef.current = null;
    lastHudUpdateRef.current = { timestamp: 0, coords: null, bearing: null, isOffRoute: false };
    routeAlertRef.current = { isOffRoute: false, offCount: 0, onCount: 0 };
  };

  const stopCompassHud = () => {
    if (compassListenerRef.current) {
      window.removeEventListener('deviceorientationabsolute', compassListenerRef.current, true);
      window.removeEventListener('deviceorientation', compassListenerRef.current, true);
      compassListenerRef.current = null;
    }
    lastCompassHeadingRef.current = { heading: null, timestamp: 0 };
    setCompassState({
      status: 'idle',
      message: '나침반 대기',
      heading: null,
    });
  };

  const startCompassHud = async () => {
    lastCompassHeadingRef.current = { heading: null, timestamp: 0 };

    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
      setCompassState({
        status: 'unsupported',
        message: '나침반을 사용할 수 없습니다.',
        heading: null,
      });
      return;
    }

    try {
      const permissionRequester = window.DeviceOrientationEvent.requestPermission;
      if (typeof permissionRequester === 'function') {
        const permission = await permissionRequester();
        if (permission !== 'granted') {
          setCompassState({
            status: 'error',
            message: '나침반 권한이 거부되었습니다.',
            heading: null,
          });
          return;
        }
      }

      if (compassListenerRef.current) {
        window.removeEventListener('deviceorientationabsolute', compassListenerRef.current, true);
        window.removeEventListener('deviceorientation', compassListenerRef.current, true);
      }

      const handleOrientation = (event) => {
        const webkitHeading = Number(event.webkitCompassHeading);
        const compassAccuracy = Number(event.webkitCompassAccuracy);
        const alpha = Number(event.alpha);
        const heading = Number.isFinite(webkitHeading)
          ? webkitHeading
          : Number.isFinite(alpha)
            ? (360 - alpha + 360) % 360
            : null;

        if (heading === null) {
          setCompassState((current) => ({
            ...current,
            status: 'loading',
            message: '나침반 방향을 기다리는 중입니다.',
          }));
          return;
        }

        const roundedHeading = Math.round(normalizeHeading(heading));
        const previous = lastCompassHeadingRef.current;
        const now = Date.now();
        const headingDelta = previous.heading === null ? 360 : getHeadingDelta(roundedHeading, previous.heading);
        if (previous.heading !== null && headingDelta < 5 && now - previous.timestamp < 220) {
          return;
        }
        const smoothedHeading =
          previous.heading === null
            ? roundedHeading
            : Math.round(smoothHeading(previous.heading, roundedHeading, headingDelta > 70 ? 0.4 : 0.24));
        lastCompassHeadingRef.current = { heading: smoothedHeading, timestamp: now };

        setCompassState({
          status: 'live',
          message: Number.isFinite(compassAccuracy) && compassAccuracy > 25 ? '나침반 보정 중' : '나침반 실행 중',
          heading: smoothedHeading,
        });
      };

      compassListenerRef.current = handleOrientation;
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
      window.addEventListener('deviceorientation', handleOrientation, true);
      setCompassState((current) => ({
        ...current,
        status: 'loading',
        message: '나침반 방향을 기다리는 중입니다.',
      }));
    } catch (error) {
      setCompassState({
        status: 'error',
        message: error.message || '나침반을 시작하지 못했습니다.',
        heading: null,
      });
    }
  };

  const startGpsHud = () => {
    if (!navigator.geolocation) {
      lastHudUpdateRef.current = { timestamp: 0, coords: null, bearing: null, isOffRoute: false };
      routeAlertRef.current = { isOffRoute: false, offCount: 0, onCount: 0 };
      setLocationState({
        status: 'unsupported',
        message: '이 브라우저에서는 GPS를 사용할 수 없습니다.',
        coords: null,
        accuracy: null,
        distanceMeters: null,
        bearing: null,
        routeDeviationMeters: null,
        routeDeviationThreshold: null,
        recoveryBearing: null,
        isGpsStable: false,
        isOffRoute: false,
      });
      return;
    }

    if (locationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }

    lastStableLocationRef.current = null;
    lastHudUpdateRef.current = { timestamp: 0, coords: null, bearing: null, isOffRoute: false };
    routeAlertRef.current = { isOffRoute: false, offCount: 0, onCount: 0 };
    setLocationState((current) => ({
      ...current,
      status: 'loading',
      message: 'GPS 권한을 요청하는 중입니다.',
    }));

    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
        };
        const timestamp = position.timestamp || Date.now();
        const target = { lat: recommendation.destination.lat, lng: recommendation.destination.lng };
        const accuracy = Math.round(position.coords.accuracy ?? 0);
        const previousFix = lastStableLocationRef.current;
        const movedFromPrevious = previousFix ? calculateDistanceMeters(coords, previousFix.coords) : Infinity;
        const elapsedMs = previousFix ? Math.max(0, timestamp - previousFix.timestamp) : Infinity;
        const reportedSpeed = Number(position.coords.speed);
        const isWalkingFast = Number.isFinite(reportedSpeed) && reportedSpeed > 1.15;
        const isLowAccuracy = accuracy > 50;
        const isVeryLowAccuracy = accuracy > 90;
        const holdDistance = isVeryLowAccuracy ? Math.max(58, accuracy * 0.72) : isLowAccuracy ? Math.max(36, accuracy * 0.55) : 14;
        const shouldHoldTinyMove = Boolean(previousFix) && movedFromPrevious < holdDistance && elapsedMs < 7500 && !isWalkingFast;
        const shouldHoldBadJump =
          Boolean(previousFix) &&
          isLowAccuracy &&
          movedFromPrevious > Math.max(accuracy * 1.35, 145) &&
          !isWalkingFast;
        const isGpsFiltered = shouldHoldTinyMove || shouldHoldBadJump;
        const stableCoords = isGpsFiltered
          ? previousFix.coords
          : previousFix && movedFromPrevious < 95
            ? smoothCoordinate(previousFix.coords, coords, isWalkingFast ? 0.58 : isLowAccuracy ? 0.28 : 0.42)
            : coords;
        const isGpsStable = accuracy <= 38 && !isGpsFiltered;
        lastStableLocationRef.current = { coords: stableCoords, timestamp, accuracy };

        const bearing = calculateBearing(stableCoords, target);
        const distanceMeters = calculateDistanceMeters(stableCoords, target);
        const routeRecoveryTarget = calculateRouteRecoveryTarget(stableCoords, selectedRoute);
        const routeDeviationMeters = routeRecoveryTarget?.distanceMeters ?? null;
        const recoveryBearing = routeRecoveryTarget ? calculateBearing(stableCoords, routeRecoveryTarget.point) : null;
        const routeDeviationThreshold = Math.max(130, Math.round(accuracy * 2.8));
        const routeReturnThreshold = Math.max(78, Math.round(accuracy * 1.55));
        const previousRouteAlert = routeAlertRef.current;
        const canTrustRouteDeviation = accuracy <= 85 && !isGpsFiltered;
        const offRouteCandidate =
          canTrustRouteDeviation &&
          routeDeviationMeters !== null &&
          distanceMeters > 80 &&
          (previousRouteAlert.isOffRoute
            ? routeDeviationMeters > routeReturnThreshold
            : routeDeviationMeters > routeDeviationThreshold);
        const nextRouteAlert = {
          isOffRoute: previousRouteAlert.isOffRoute,
          offCount: offRouteCandidate ? previousRouteAlert.offCount + 1 : 0,
          onCount: offRouteCandidate ? 0 : previousRouteAlert.onCount + 1,
        };

        if (!previousRouteAlert.isOffRoute && nextRouteAlert.offCount >= 3 && !isGpsFiltered) {
          nextRouteAlert.isOffRoute = true;
        }
        if (previousRouteAlert.isOffRoute && nextRouteAlert.onCount >= 2) {
          nextRouteAlert.isOffRoute = false;
        }
        routeAlertRef.current = nextRouteAlert;
        const isOffRoute = nextRouteAlert.isOffRoute;
        const previousHudUpdate = lastHudUpdateRef.current;
        const hudMoved = previousHudUpdate.coords ? calculateDistanceMeters(stableCoords, previousHudUpdate.coords) : Infinity;
        const hudBearingDelta = getHeadingDelta(previousHudUpdate.bearing, bearing);
        const now = Date.now();
        const shouldPublishHud =
          now - previousHudUpdate.timestamp > 950 ||
          hudMoved > 9 ||
          hudBearingDelta > 8 ||
          isOffRoute !== previousHudUpdate.isOffRoute;

        if (!shouldPublishHud) {
          return;
        }

        lastHudUpdateRef.current = {
          timestamp: now,
          coords: stableCoords,
          bearing,
          isOffRoute,
        };

        setLocationState({
          status: 'live',
          message: isOffRoute ? '경로 이탈 감지' : isGpsStable ? 'GPS 길안내 실행 중' : 'GPS 흔들림 보정 중',
          coords: stableCoords,
          rawCoords: coords,
          accuracy,
          distanceMeters,
          bearing,
          routeDeviationMeters,
          routeDeviationThreshold,
          recoveryBearing,
          isGpsStable,
          isOffRoute,
        });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? '위치 권한이 거부되었습니다.'
            : error.code === error.TIMEOUT
              ? 'GPS 응답 시간이 초과되었습니다.'
              : '현재 위치를 가져오지 못했습니다.';
        lastStableLocationRef.current = null;
        lastHudUpdateRef.current = { timestamp: 0, coords: null, bearing: null, isOffRoute: false };
        routeAlertRef.current = { isOffRoute: false, offCount: 0, onCount: 0 };
        setLocationState((current) => ({
          ...current,
          status: 'error',
          message,
          recoveryBearing: null,
          isGpsStable: false,
          isOffRoute: false,
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );
  };

  const analyzeCameraImage = async (imageDataUrl) => {
    if (!imageDataUrl || visionStatus === 'loading') return;

    setVisionStatus('loading');
    setPhotoAnalysis({
      title: 'AI가 주변 정보를 분석 중입니다',
      body: '표지판, 정류장명, 출입구, 방향 화살표를 확인하고 있습니다.',
      checks: [],
    });

    try {
      const result = await fetchPhotoGuideAnalysis({
        imageDataUrl,
        recommendation,
        selectedRoute,
        locationState,
      });
      setPhotoAnalysis({
        title: 'AI 주변 인식 결과',
        body: result.text || buildPhotoAnalysis(selectedRoute, recommendation.destination).body,
        checks: [],
      });
      setVisionStatus('success');
    } catch (error) {
      const fallback = buildPhotoAnalysis(selectedRoute, recommendation.destination);
      setPhotoAnalysis({
        ...fallback,
        body: `${fallback.body} AI 이미지 분석은 실패했습니다. (${error.message})`,
      });
      setVisionStatus('error');
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    let imageDataUrl = '';

    if (video && canvas && video.videoWidth && video.videoHeight) {
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      imageDataUrl = canvas.toDataURL('image/jpeg', 0.76);
      setPhotoPreview(imageDataUrl);
    }

    if (imageDataUrl) {
      await analyzeCameraImage(imageDataUrl);
    } else {
      setPhotoAnalysis(buildPhotoAnalysis(selectedRoute, recommendation.destination));
    }
  };

  const pickCameraPhoto = () => {
    fileInputRef.current?.click();
  };

  const importCameraPhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const imageDataUrl = String(reader.result || '');
      setPhotoPreview(imageDataUrl);
      await analyzeCameraImage(imageDataUrl);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  useEffect(() => {
    if (activePage !== 'camera') {
      autoCameraStartedRef.current = false;
      lastSpokenCueRef.current = null;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (locationWatchRef.current !== null) {
        navigator.geolocation?.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
        setLocationState((current) => ({
          ...current,
          status: 'idle',
          message: 'GPS 대기',
        }));
      }
      lastStableLocationRef.current = null;
      lastHudUpdateRef.current = { timestamp: 0, coords: null, bearing: null, isOffRoute: false };
      routeAlertRef.current = { isOffRoute: false, offCount: 0, onCount: 0 };
      if (compassListenerRef.current) {
        window.removeEventListener('deviceorientationabsolute', compassListenerRef.current, true);
        window.removeEventListener('deviceorientation', compassListenerRef.current, true);
        compassListenerRef.current = null;
        setCompassState({
          status: 'idle',
          message: '나침반 대기',
          heading: null,
        });
      }
      return;
    }

    if (cameraStatus === 'idle' && !autoCameraStartedRef.current) {
      autoCameraStartedRef.current = true;
      startCamera();
    }
  }, [activePage, cameraStatus]);

  if (activePage === 'camera') {
    return (
      <PhotoGuidancePage
        route={selectedRoute}
        recommendation={recommendation}
        cue={cameraCue}
        cameraStatus={cameraStatus}
        locationState={locationState}
        compassState={compassState}
        voiceEnabled={voiceEnabled}
        videoRef={videoRef}
        canvasRef={canvasRef}
        onStartCamera={startCamera}
        onStopCamera={stopCamera}
        onToggleVoice={toggleVoiceGuidance}
        onTriggerDemo={triggerCameraScenario}
        onBack={() => navigateTo('extras')}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className="mobile-frame">
        <MobileHeader activePage={activePage} />

        {activePage === 'plan' && (
          <PlanPage
            selectedPlaceIds={selectedPlaceIds}
            selectedPlaces={selectedPlaces}
            plannedPlaces={plannedPlaces}
            planGenerated={planGenerated}
            durationId={durationId}
            dateMode={dateMode}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            orderMode={orderMode}
            autoRecommendEnabled={autoRecommendEnabled}
            paceId={paceId}
            personalPreference={personalPreference}
            weather={weather}
            weatherApiState={weatherApiState}
            recommendation={recommendation}
            selectedRoute={selectedRoute}
            saveState={saveState}
            expandedSections={expandedSections}
            onTogglePlace={togglePlace}
            onDurationChange={setDurationId}
            onDateModeChange={setDateMode}
            onTripStartDateChange={setTripStartDate}
            onTripEndDateChange={setTripEndDate}
            onOrderModeChange={setOrderMode}
            onAutoRecommendChange={setAutoRecommendEnabled}
            onPaceChange={setPaceId}
            onPersonalPreferenceChange={setPersonalPreference}
            onToggleSection={toggleSection}
            onGeneratePlan={generatePlan}
            onRemovePlace={togglePlace}
            onRegenerateOrder={regenerateOrder}
            onRetryRecommendation={retryRecommendation}
            onSaveTrip={saveTrip}
          />
        )}

        {activePage === 'routes' && (
          <RouteSelectionPage
            places={parisPlaces}
            plannedPlaces={plannedPlaces}
            recommendation={recommendation}
            routes={recommendation.routes}
            selectedRoute={selectedRoute}
            originAddress={originAddress}
            destinationAddress={destinationAddress}
            placeResolveState={placeResolveState}
            mapZoom={mapZoom}
            onZoomChange={changeMapZoom}
            onOriginAddressChange={changeOriginAddress}
            onDestinationAddressChange={changeDestinationAddress}
            onDestinationAnchorChange={pickDestinationOnMap}
            onResolveAddress={resolveAddress}
            onUseCurrentOrigin={useCurrentOrigin}
            onRouteSelect={setSelectedRouteId}
          />
        )}

        {activePage === 'extras' && (
          <ExtraPage
            guideMessages={guideMessages}
            guideInput={guideInput}
            guideStatus={guideStatus}
            guideUsageCount={guideUsageCount}
            guideDailyLimit={GUIDE_DAILY_LIMIT}
            onGuideInputChange={setGuideInput}
            onAskGuide={askTravelGuide}
          />
        )}

        {activePage === 'trips' && (
          <TripsPage savedTrips={savedTrips} onOpenPlan={() => navigateTo('plan')} onClear={clearSavedTrips} />
        )}

        <BottomNavigation activePage={activePage} onNavigate={navigateTo} />
        {activePage !== 'camera' && (
          <button type="button" className="floating-camera-button" onClick={startCamera} aria-label="길안내 열기">
            <Camera size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </main>
  );
}

function MobileHeader({ activePage }) {
  const title =
    activePage === 'routes' ? '지도' : activePage === 'extras' ? '정보 물어보기' : activePage === 'trips' ? '내 여행' : '새 여행 만들기';
  const HeaderIcon =
    activePage === 'routes' ? Map : activePage === 'extras' ? MessagesSquare : activePage === 'trips' ? Check : CalendarDays;

  return (
    <header className="mobile-header">
      <span className="header-icon-tile">
        <HeaderIcon size={18} aria-hidden="true" />
      </span>
      <h1>{title}</h1>
    </header>
  );
}

function SectionTitle({ icon: Icon, title, caption }) {
  return (
    <div className="section-title">
      <Icon size={18} aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        {caption && <p>{caption}</p>}
      </div>
    </div>
  );
}

function MetricPill({ icon: Icon, label, value }) {
  return (
    <span className="metric-pill">
      <Icon size={15} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function AccordionSection({ id, icon, title, caption, badge, isOpen, onToggle, children }) {
  const Icon = icon;
  return (
    <section className="accordion-section">
      <button type="button" className="accordion-trigger" onClick={() => onToggle(id)} aria-expanded={isOpen}>
        <span className="accordion-title">
          <Icon size={18} aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            {caption && <small>{caption}</small>}
          </span>
        </span>
        <span className="accordion-side">
          {badge && <em>{badge}</em>}
        </span>
      </button>
      {isOpen && <div className="accordion-body">{children}</div>}
    </section>
  );
}

function PlanPage({
  selectedPlaceIds,
  selectedPlaces,
  plannedPlaces,
  planGenerated,
  durationId,
  dateMode,
  tripStartDate,
  tripEndDate,
  orderMode,
  autoRecommendEnabled,
  paceId,
  personalPreference,
  weather,
  weatherApiState,
  recommendation,
  selectedRoute,
  saveState,
  expandedSections,
  onTogglePlace,
  onDurationChange,
  onDateModeChange,
  onTripStartDateChange,
  onTripEndDateChange,
  onOrderModeChange,
  onAutoRecommendChange,
  onPaceChange,
  onPersonalPreferenceChange,
  onToggleSection,
  onGeneratePlan,
  onRemovePlace,
  onRegenerateOrder,
  onRetryRecommendation,
  onSaveTrip,
}) {
  const duration = getDuration(durationId);

  return (
    <section className="screen plan-screen">
      <AccordionSection
        id="basics"
        icon={CalendarDays}
        title="새 여행 만들기"
        caption="간편 기간을 고르거나 날짜를 직접 입력"
        badge={duration.label}
        isOpen={expandedSections.basics}
        onToggle={onToggleSection}
      >
        <div className="input-stack" aria-label="여행 기본 정보">
          <label className="field-row">
            <span>여행 도시</span>
            <span className="static-input">
              <MapPin size={16} aria-hidden="true" />
              Paris
            </span>
          </label>
        </div>

        <div className="segmented-control" aria-label="기간 입력 방식">
          <button type="button" className={dateMode === 'quick' ? 'is-active' : ''} onClick={() => onDateModeChange('quick')}>
            간편 선택
          </button>
          <button type="button" className={dateMode === 'custom' ? 'is-active' : ''} onClick={() => onDateModeChange('custom')}>
            날짜 직접 입력
          </button>
        </div>

        {dateMode === 'quick' ? (
          <div className="duration-grid" aria-label="간편 기간 선택">
            {durationOptions.map((option) => (
              <button
                type="button"
                key={option.id}
                className={option.id === durationId ? 'pill-option is-active' : 'pill-option'}
                onClick={() => onDurationChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="date-input-pair" aria-label="날짜 직접 입력">
            <label className="field-row">
              <span>출발일</span>
              <input type="date" value={tripStartDate} onChange={(event) => onTripStartDateChange(event.target.value)} />
            </label>
            <label className="field-row">
              <span>도착일</span>
              <input type="date" value={tripEndDate} onChange={(event) => onTripEndDateChange(event.target.value)} />
            </label>
          </div>
        )}

      </AccordionSection>

      <AccordionSection
        id="places"
        icon={MapPin}
        title="장소 선택"
        caption="장소를 고르거나 AI가 조건에 맞춰 자동 추천"
        badge={autoRecommendEnabled ? 'AI 자동추천' : `${selectedPlaceIds.length}개 선택`}
        isOpen={expandedSections.places}
        onToggle={onToggleSection}
      >
        <div className="recommend-switch-card">
          <div>
            <strong>AI 자동추천</strong>
            <small>장소를 선택하지 않아도 날씨, 이동 부담, 여행 페이스에 맞춰 행선지를 추천합니다.</small>
          </div>
          <button
            type="button"
            className={autoRecommendEnabled ? 'toggle-switch is-on' : 'toggle-switch'}
            onClick={() => onAutoRecommendChange(!autoRecommendEnabled)}
            aria-pressed={autoRecommendEnabled}
            aria-label="AI 자동추천 전환"
          >
            <span />
          </button>
        </div>

        {!autoRecommendEnabled && (
          <div className="segmented-control" aria-label="선택 장소 순서">
            <button type="button" className={orderMode === 'auto' ? 'is-active' : ''} onClick={() => onOrderModeChange('auto')}>
              AI 순서
            </button>
            <button type="button" className={orderMode === 'manual' ? 'is-active' : ''} onClick={() => onOrderModeChange('manual')}>
              선택 순서
            </button>
          </div>
        )}

        {autoRecommendEnabled && (
          <div className="auto-recommend-note">
            <Sparkles size={17} aria-hidden="true" />
            <span>장소를 선택하지 않아도 선택한 조건에 맞춰 AI가 오늘의 행선지를 자동으로 추천합니다.</span>
          </div>
        )}

        <div className={autoRecommendEnabled ? 'place-toggle-scroll is-disabled' : 'place-toggle-scroll'}>
          <div className="place-toggle-list">
            {parisPlaces.map((place) => {
              const enabled = selectedPlaceIds.includes(place.id);
              const selectedIndex = selectedPlaceIds.indexOf(place.id);
              const meta = getPlaceMeta(place.id);
              const Icon = meta.icon;
              return (
                <button
                  type="button"
                  key={place.id}
                  className={enabled ? 'place-toggle is-on' : 'place-toggle'}
                  onClick={() => onTogglePlace(place.id)}
                  aria-pressed={enabled}
                  disabled={autoRecommendEnabled}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>
                    <strong>{place.name}</strong>
                    <small>{meta.badge}</small>
                  </span>
                  <i>{enabled ? (orderMode === 'manual' ? selectedIndex + 1 : <Check size={14} aria-hidden="true" />) : null}</i>
                </button>
              );
            })}
          </div>
        </div>

        <div className="selected-place-row" aria-label="현재 플랜 순서">
          {plannedPlaces.map((place, index) => (
            <span key={place.id} className="selected-place-chip">
              {index + 1}. {place.shortName}
            </span>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection
        id="preference"
        icon={Compass}
        title="여행 페이스"
        caption="이동 부담과 휴식 우선순위를 정합니다"
        badge={getPace(paceId).label}
        isOpen={expandedSections.preference}
        onToggle={onToggleSection}
      >
        <div className="pace-grid">
          {paceOptions.map((pace) => {
            const Icon = pace.icon;
            return (
              <button
                type="button"
                key={pace.id}
                className={pace.id === paceId ? 'pace-option is-active' : 'pace-option'}
                onClick={() => onPaceChange(pace.id)}
              >
                <Icon size={20} aria-hidden="true" />
                <strong>{pace.label}</strong>
                <span>{pace.caption}</span>
              </button>
            );
          })}
        </div>
        <label className="field-row">
          <span>개인 성향</span>
          <textarea
            value={personalPreference}
            onChange={(event) => onPersonalPreferenceChange(event.target.value)}
            placeholder="ex. 더위를 많이 탄다. 오래 걷는 것을 싫어한다. 카페에 오래 머무는 것이 좋다. 사람이 많은 곳은 피하고 싶다."
            rows={4}
          />
        </label>
      </AccordionSection>

      <AccordionSection
        id="weather"
        icon={ThermometerSun}
        title="자동 날씨 정보"
        caption="행선지가 바뀔 때 자동으로 갱신"
        badge={`${weather.temperature}°C`}
        isOpen={expandedSections.weather}
        onToggle={onToggleSection}
      >
        <section className="weather-strip" aria-label="자동 날씨 상태">
          <MetricPill icon={ThermometerSun} label="기온" value={`${weather.temperature}°C`} />
          <MetricPill icon={Droplets} label="습도" value={`${weather.humidity}%`} />
          <MetricPill icon={Wind} label="풍속" value={`${weather.wind}m/s`} />
          <p className={`api-status is-${weatherApiState.status}`}>{weatherApiState.message}</p>
        </section>
      </AccordionSection>

      <button type="button" className="primary-cta" onClick={onGeneratePlan}>
        <Sparkles size={19} aria-hidden="true" />
        {plannedPlaces.length}개 장소로 AI 플랜 생성
      </button>

      {planGenerated ? (
        <PlanResultCard
          plannedPlaces={plannedPlaces}
          selectedPlaces={selectedPlaces}
          route={selectedRoute}
          recommendation={recommendation}
          personalPreference={personalPreference}
          saveState={saveState}
          onRemovePlace={onRemovePlace}
          onRegenerateOrder={onRegenerateOrder}
          onRetryRecommendation={onRetryRecommendation}
          onSaveTrip={onSaveTrip}
        />
      ) : null}
    </section>
  );
}

function PlanResultCard({
  plannedPlaces,
  selectedPlaces,
  route,
  recommendation,
  personalPreference,
  saveState,
  onRemovePlace,
  onRegenerateOrder,
  onRetryRecommendation,
  onSaveTrip,
}) {
  return (
    <section className="plan-result-card">
      <div className="route-score-row">
        <span className="score-token">
          <strong>{route.recommendationScore}</strong>
          <small>부담점수</small>
        </span>
        <div>
          <p className="eyebrow">생성된 AI 플랜</p>
          <h2>{recommendation.narrative.title}</h2>
          <p>{recommendation.narrative.body}</p>
        </div>
      </div>

      <div className="itinerary-list" aria-label="추천 일정">
        {plannedPlaces.map((place, index) => {
          const meta = getPlaceMeta(place.id);
          const Icon = meta.icon;
          return (
            <div key={place.id} className="itinerary-item">
              <span>{index + 1}</span>
              <Icon size={17} aria-hidden="true" />
              <div>
                <strong>{place.name}</strong>
                <small>{meta.note}</small>
              </div>
              <button
                type="button"
                onClick={() => onRemovePlace(place.id)}
                aria-label={`${place.name} 제거`}
                disabled={selectedPlaces.length <= 1}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="route-mini-steps">
        {route.segments.slice(0, 3).map((segment, index) => (
          <span key={`${segment.label}-${index}`}>
            {segment.mode} · {segment.km}km
          </span>
        ))}
      </div>

      <PlanRoutePreview recommendation={recommendation} route={route} />

      {personalPreference.trim() && (
        <p className="preference-note">
          개인 성향: {personalPreference.trim()}
        </p>
      )}

    </section>
  );
}

function PlanRoutePreview({ recommendation, route }) {
  const points = route.routePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const staticMapUrl = buildGoogleStaticMapUrl({
    origin: recommendation.origin,
    destination: recommendation.destination,
    route,
    mapZoom: 14,
  });

  return (
    <section className="plan-route-preview" aria-label="생성된 플랜 지도 미리보기">
      <img className="google-map-layer" src={staticMapUrl} alt="" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline className="route-shadow" points={points} />
        <polyline className="route-line" style={{ stroke: route.color }} points={points} />
      </svg>
      <div className="preview-caption">
        <Navigation size={16} aria-hidden="true" />
        <span>
          {recommendation.origin.shortName} → {recommendation.destination.shortName}
        </span>
      </div>
    </section>
  );
}

function RouteSelectionPage({
  places,
  plannedPlaces,
  recommendation,
  routes,
  selectedRoute,
  originAddress,
  destinationAddress,
  placeResolveState,
  mapZoom,
  onZoomChange,
  onOriginAddressChange,
  onDestinationAddressChange,
  onDestinationAnchorChange,
  onResolveAddress,
  onUseCurrentOrigin,
  onRouteSelect,
}) {
  const preferenceOrder = ['metro', 'bus', 'shade', 'riverside'];
  const preferenceRoutes = preferenceOrder.map((routeId) => routes.find((route) => route.id === routeId)).filter(Boolean);

  return (
    <section className="screen route-screen">
      <RouteInputPanel
        originAddress={originAddress}
        destinationAddress={destinationAddress}
        plannedPlaces={plannedPlaces}
        placeResolveState={placeResolveState}
        onOriginAddressChange={onOriginAddressChange}
        onDestinationAddressChange={onDestinationAddressChange}
        onDestinationAnchorChange={onDestinationAnchorChange}
        onResolveAddress={onResolveAddress}
        onUseCurrentOrigin={onUseCurrentOrigin}
      />

      <MapPanel
        places={places}
        origin={recommendation.origin}
        destination={recommendation.destination}
        route={selectedRoute}
        mapZoom={mapZoom}
        onZoomChange={onZoomChange}
      />

      <section className="route-sheet">
        <div className="route-score-row">
          <span className="score-token">
            <strong>{selectedRoute.recommendationScore}</strong>
            <small>부담점수</small>
          </span>
          <div>
            <p className="eyebrow">추천 경로</p>
            <h2>{selectedRoute.name}</h2>
            <p>{buildFriendlyRouteSummary(selectedRoute)}</p>
          </div>
        </div>

        <div className="route-preference-strip" aria-label="이동 취향 선택">
          {preferenceRoutes.map((route) => (
            <button
              type="button"
              key={route.id}
              className={route.id === selectedRoute.id ? 'route-preference is-active' : 'route-preference'}
              onClick={() => onRouteSelect(route.id)}
            >
              <strong>{getRouteKindLabel(route)}</strong>
              <span>{formatMinutes(route.minutes)} · 도보 {formatWalkingMinutes(route)}</span>
            </button>
          ))}
        </div>

        <div className="route-detail-card">
          <SectionTitle icon={Route} title="세부 이동 안내" />
          <div className="step-list">
            {selectedRoute.segments.map((segment, index) => (
              <div key={`${segment.label}-${index}`} className="map-step">
                <span>{index + 1}</span>
                <div>
                  <strong>{describeSegment(segment, index, selectedRoute.segments)}</strong>
                  <small>
                    {segment.mode} · 약 {segment.km}km
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="planned-strip" aria-label="AI 플랜 장소">
          {plannedPlaces.map((place, index) => (
            <span
              key={place.id}
              className={place.id === recommendation.destination.id || place.id === recommendation.destination.sourceId ? 'plan-dot is-current' : 'plan-dot'}
            >
              {index + 1}. {place.shortName}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}

function RouteInputPanel({
  originAddress,
  destinationAddress,
  plannedPlaces,
  placeResolveState,
  onOriginAddressChange,
  onDestinationAddressChange,
  onDestinationAnchorChange,
  onResolveAddress,
  onUseCurrentOrigin,
}) {
  return (
    <section className="route-input-panel" aria-label="지도 출발 도착 설정">
      <SectionTitle icon={MapPin} title="출발·도착 설정" caption="검색하거나 지도에서 눌러 위치를 바꿉니다." />

      <div className="route-search-stack">
        <label className="route-search-row">
          <span>출발</span>
          <input
            type="text"
            value={originAddress}
            onChange={(event) => onOriginAddressChange(event.target.value)}
            placeholder="현재 위치 또는 출발 주소"
          />
          <button type="button" onClick={() => onResolveAddress('origin')} aria-label="출발지 주소 좌표 찾기">
            <Search size={16} aria-hidden="true" />
          </button>
        </label>
        <label className="route-search-row">
          <span>도착</span>
          <input
            type="text"
            value={destinationAddress}
            onChange={(event) => onDestinationAddressChange(event.target.value)}
            placeholder="장소명 또는 도착 주소"
          />
          <button type="button" onClick={() => onResolveAddress('destination')} aria-label="도착지 주소 좌표 찾기">
            <Search size={16} aria-hidden="true" />
          </button>
        </label>
      </div>

      <div className="quick-location-row" aria-label="빠른 위치 선택">
        <button type="button" onClick={onUseCurrentOrigin}>
          <Navigation size={14} aria-hidden="true" />
          현재 위치
        </button>
        {plannedPlaces.slice(0, 3).map((place) => (
          <button type="button" key={place.id} onClick={() => onDestinationAnchorChange(place.id)}>
            <MapPin size={14} aria-hidden="true" />
            {place.shortName}
          </button>
          ))}
      </div>

      <p className="location-status">
        {placeResolveState.origin} · {placeResolveState.destination}
      </p>
    </section>
  );
}

function canvasPointToLatLng(point) {
  if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    return { lat: point.lat, lng: point.lng };
  }

  const lat = parisMapBounds.north - (point.y / 100) * (parisMapBounds.north - parisMapBounds.south);
  const lng = parisMapBounds.west + (point.x / 100) * (parisMapBounds.east - parisMapBounds.west);
  return { lat, lng };
}

function buildGoogleStaticMapUrl({ origin, destination, route, mapZoom }) {
  const url = new URL('/api/static-map', window.location.origin);
  url.searchParams.set('size', '760x760');
  url.searchParams.set('scale', '2');
  url.searchParams.set('maptype', 'roadmap');
  url.searchParams.set('language', 'ko');
  url.searchParams.set('center', `${(origin.lat + destination.lat) / 2},${(origin.lng + destination.lng) / 2}`);
  url.searchParams.set('zoom', String(mapZoom));
  url.searchParams.append('style', 'feature:water|color:0xd8edf2');
  url.searchParams.append('style', 'feature:landscape|color:0xf7f4ec');
  url.searchParams.append('style', 'feature:road|element:geometry|color:0xffffff');
  url.searchParams.append('style', 'feature:road|element:labels|visibility:simplified');
  url.searchParams.append('style', 'feature:poi|visibility:simplified');
  url.searchParams.append('style', 'feature:transit|visibility:simplified');
  url.searchParams.append('markers', `color:red|label:S|${origin.lat},${origin.lng}`);
  url.searchParams.append('markers', `color:green|label:G|${destination.lat},${destination.lng}`);
  const pathPoints = route.routePoints.map(canvasPointToLatLng).map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`);
  url.searchParams.append('visible', `${origin.lat},${origin.lng}`);
  url.searchParams.append('visible', `${destination.lat},${destination.lng}`);
  url.searchParams.append('path', `color:0x${route.color.replace('#', '')}dd|weight:6|${pathPoints.join('|')}`);
  return url.toString();
}

function buildCameraMiniMapUrl({ route, locationState }) {
  const url = new URL('/api/static-map', window.location.origin);
  const routeLatLngs = route.routePoints.map(canvasPointToLatLng);
  const hasLiveGps = locationState.status === 'live' && locationState.coords;
  const rawCurrentPoint = hasLiveGps ? locationState.coords : routeLatLngs[0];
  const currentPoint = stabilizeMapPoint(rawCurrentPoint);
  const canShowRouteContext = hasLiveGps && isWithinParisMap(rawCurrentPoint.lat, rawCurrentPoint.lng);
  const nextPoint = routeLatLngs[1] ?? routeLatLngs.at(-1) ?? currentPoint;
  const localPath = canShowRouteContext ? [currentPoint, ...routeLatLngs.slice(1, 4)] : routeLatLngs.slice(0, 3);

  url.searchParams.set('size', '760x320');
  url.searchParams.set('scale', '2');
  url.searchParams.set('maptype', 'roadmap');
  url.searchParams.set('language', 'ko');
  url.searchParams.set('center', `${currentPoint.lat.toFixed(4)},${currentPoint.lng.toFixed(4)}`);
  url.searchParams.set('zoom', canShowRouteContext ? '17' : '16');
  url.searchParams.append('style', 'feature:water|color:0xd8edf2');
  url.searchParams.append('style', 'feature:landscape|color:0xf7f4ec');
  url.searchParams.append('style', 'feature:road|element:geometry|color:0xffffff');
  url.searchParams.append('style', 'feature:road|element:labels|visibility:simplified');
  url.searchParams.append('style', 'feature:poi|visibility:simplified');
  url.searchParams.append('style', 'feature:transit|visibility:simplified');
  if (canShowRouteContext) {
    url.searchParams.append('markers', `color:green|${nextPoint.lat.toFixed(5)},${nextPoint.lng.toFixed(5)}`);
  }
  if (localPath.length >= 2) {
    url.searchParams.append(
      'path',
      `color:0x${route.color.replace('#', '')}dd|weight:6|${localPath.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join('|')}`,
    );
  }
  return url.toString();
}

function MapPanel({ places, origin, destination, route, mapZoom, onZoomChange }) {
  const points = route.routePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const staticMapUrl = buildGoogleStaticMapUrl({ origin, destination, route, mapZoom });

  return (
    <section className="map-panel" aria-label="지도형 경로 패널">
      <div className="map-heading">
        <div>
          <p className="eyebrow">Route map</p>
          <h2>{origin.shortName}에서 {destination.shortName}</h2>
        </div>
      </div>

      <div className="map-canvas">
        {staticMapUrl && <img className="google-map-layer" src={staticMapUrl} alt="" />}
        <div className="map-zoom-controls" aria-label="지도 확대 축소">
          <button type="button" onClick={() => onZoomChange(1)} aria-label="지도 확대">
            <span className="zoom-symbol" aria-hidden="true">+</span>
          </button>
          <button type="button" onClick={() => onZoomChange(-1)} aria-label="지도 축소">
            <span className="zoom-symbol" aria-hidden="true">-</span>
          </button>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline className="route-shadow" points={points} />
          <polyline className="route-line" style={{ stroke: route.color }} points={points} />
          {route.routePoints.map((point, index) => (
            <g key={`${point.label}-${index}`} className="route-node">
              <circle cx={point.x} cy={point.y} r={index === 0 || index === route.routePoints.length - 1 ? 2.6 : 2.1} />
            </g>
          ))}
        </svg>

        {places.map((place) => {
          const isEndpoint = place.id === destination.sourceId || place.id === origin.sourceId || place.id === destination.id;
          return (
            <div
              key={place.id}
              className={isEndpoint ? 'map-pin is-endpoint' : 'map-pin'}
              style={{ left: `${place.x}%`, top: `${place.y}%` }}
              title={place.name}
            >
              <span />
              {isEndpoint && <strong>{place.shortName}</strong>}
            </div>
          );
        })}

        {route.routePoints.slice(1, -1).map((point, index) => (
          <div key={`${point.label}-${index}`} className="map-annotation" style={{ left: `${point.x}%`, top: `${point.y}%` }}>
            {point.label}
          </div>
        ))}
      </div>

      <div className="map-stats">
        <StatBlock label="부담 점수" value={`${route.recommendationScore}점`} />
        <StatBlock label="예상 시간" value={formatMinutes(route.minutes)} />
        <StatBlock label="도보 예상 시간" value={formatWalkingMinutes(route)} />
        <StatBlock label="보행 거리" value={`${route.walkingKm}km`} />
      </div>
    </section>
  );
}

function StatBlock({ label, value }) {
  return (
    <div className="stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExtraPage({ guideMessages, guideInput, guideStatus, guideUsageCount, guideDailyLimit, onGuideInputChange, onAskGuide }) {
  const guideLimitReached = guideUsageCount >= guideDailyLimit;
  const isGuideLoading = guideStatus === 'loading';

  return (
    <section className="screen guide-screen">
      <div className="guide-suggestions">
        {guideSuggestions.map((question) => (
          <button type="button" key={question} onClick={() => onAskGuide(question)} disabled={guideLimitReached || isGuideLoading}>
            {question}
          </button>
        ))}
      </div>

      <section className="chat-panel" aria-label="여행 가이드 채팅">
        <div className="chat-list">
          {guideMessages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'chat-message is-user' : 'chat-message'}>
              <span className="chat-avatar">{message.role === 'user' ? <User size={15} /> : <Bot size={15} />}</span>
              <p>{message.text}</p>
            </div>
          ))}
          {guideStatus === 'loading' && (
            <div className="chat-message">
              <span className="chat-avatar">
                <Bot size={15} />
              </span>
              <p>여행 가이드 답변을 작성 중입니다.</p>
            </div>
          )}
        </div>

        <div className={guideLimitReached ? 'guide-usage-note is-limited' : 'guide-usage-note'}>
          {guideLimitReached
            ? `오늘 무료 질문 ${guideUsageCount}/${guideDailyLimit} · 추가 질문은 프리미엄 질문권으로 확장`
            : `오늘 무료 질문 ${guideUsageCount}/${guideDailyLimit}`}
        </div>

        <form
          className="guide-composer"
          onSubmit={(event) => {
            event.preventDefault();
            onAskGuide();
          }}
        >
          <input
            type="text"
            value={guideInput}
            onChange={(event) => onGuideInputChange(event.target.value)}
            placeholder={guideLimitReached ? '오늘 무료 질문 2회를 모두 사용했습니다.' : '행선지, 정류장, 표지판 확인 질문'}
            disabled={guideLimitReached}
          />
          <button type="submit" aria-label="질문 보내기" disabled={isGuideLoading || guideLimitReached}>
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      </section>
    </section>
  );
}

function TripsPage({ savedTrips, onOpenPlan, onClear }) {
  return (
    <section className="screen trips-screen">
      <div className="plan-hero compact">
        <div>
          <p className="eyebrow">Saved trips</p>
          <h2>내 여행에 저장한 플랜</h2>
          <p>발표에서는 Plan 생성 후 저장까지 이어지는 완성 흐름을 보여줄 수 있습니다.</p>
        </div>
        <Check size={23} aria-hidden="true" />
      </div>

      {savedTrips.length === 0 ? (
        <section className="empty-state">
          <CalendarDays size={30} aria-hidden="true" />
          <h2>아직 저장된 여행이 없습니다.</h2>
          <p>Plan에서 AI 플랜을 생성한 뒤 내 여행에 저장해보세요.</p>
          <button type="button" className="primary-action" onClick={onOpenPlan}>
            Plan 만들기
          </button>
        </section>
      ) : (
        <>
          <div className="saved-trip-list">
            {savedTrips.map((trip) => (
              <article key={trip.id} className="saved-trip-card">
                <div>
                  <p className="eyebrow">{trip.createdAt}</p>
                  <h2>{trip.title}</h2>
                  <p>
                    {trip.destinationName} · {trip.routeName} · {formatMinutes(trip.routeMinutes)}
                  </p>
                </div>
                <div className="planned-strip">
                  {trip.places.map((place, index) => (
                    <span key={`${trip.id}-${place}`} className="plan-dot">
                      {index + 1}. {place}
                    </span>
                  ))}
                </div>
                {trip.preference && <p className="preference-note">개인 성향: {trip.preference}</p>}
              </article>
            ))}
          </div>
          <button type="button" className="secondary-action" onClick={onClear}>
            저장 목록 비우기
          </button>
        </>
      )}
    </section>
  );
}

function NavigationMapStage({ recommendation, route, locationState, compassState, onStartGps, onStopGps, onStartCompass, onStopCompass }) {
  const points = route.routePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const staticMapUrl = buildGoogleStaticMapUrl({
    origin: recommendation.origin,
    destination: recommendation.destination,
    route,
    mapZoom: 17,
  });
  const hasLiveLocation = locationState.status === 'live';
  const hasLiveCompass = compassState.status === 'live';
  const bearing = locationState.bearing;
  const arrowRotation =
    Number.isFinite(bearing) && Number.isFinite(compassState.heading)
      ? (bearing - compassState.heading + 360) % 360
      : Number.isFinite(bearing)
        ? bearing
        : 0;
  const currentPoint =
    locationState.coords && isWithinParisMap(locationState.coords.lat, locationState.coords.lng)
      ? latLngToCanvasPoint(locationState.coords.lat, locationState.coords.lng)
      : route.routePoints[0];
  const nextTarget = route.segments[0]?.label.split(' -> ').at(-1) ?? recommendation.destination.shortName;

  return (
    <section className="nav-map-stage" aria-label="지도 기반 카메라 길안내">
      <img className="nav-map-layer" src={staticMapUrl} alt="" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline className="route-shadow" points={points} />
        <polyline className="route-line" style={{ stroke: route.color }} points={points} />
      </svg>

      <div className="nav-instruction-card">
        <span className="turn-arrow" style={{ transform: `rotate(${arrowRotation}deg)` }}>
          <Navigation size={30} aria-hidden="true" />
        </span>
        <div>
          <small>다음</small>
          <strong>{nextTarget} 방면</strong>
        </div>
        <Sparkles size={24} aria-hidden="true" />
      </div>

      <div
        className="nav-current-marker"
        style={{ left: `${currentPoint.x}%`, top: `${currentPoint.y}%`, transform: `translate(-50%, -50%) rotate(${arrowRotation}deg)` }}
      >
        <Navigation size={34} aria-hidden="true" />
      </div>

      <div className="nav-side-controls" aria-label="지도 도구">
        <button type="button" aria-label="지도 확대">
          <Plus size={20} aria-hidden="true" />
        </button>
        <button type="button" aria-label="현재 위치">
          <Navigation size={20} aria-hidden="true" />
        </button>
        <button type="button" aria-label="음성 안내">
          <MessagesSquare size={19} aria-hidden="true" />
        </button>
      </div>

      <button type="button" className="current-location-pill" onClick={hasLiveLocation ? onStopGps : onStartGps}>
        <Navigation size={16} aria-hidden="true" />
        {hasLiveLocation ? 'GPS 길안내 중지' : '현재 위치로 이동'}
      </button>

      <div className="nav-bottom-sheet">
        <button type="button" className="nav-close-button" aria-label="길안내 닫기">
          <X size={25} aria-hidden="true" />
        </button>
        <div>
          <strong>{formatMinutes(route.minutes)}</strong>
          <span>{formatDistance(locationState.distanceMeters)} · {route.name}</span>
        </div>
        <button type="button" className="nav-compass-button" onClick={hasLiveCompass ? onStopCompass : onStartCompass}>
          <Route size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="nav-status-strip">
        <span className={`gps-status is-${locationState.status}`}>{locationState.message}</span>
        <span>{compassState.message}</span>
      </div>
    </section>
  );
}

function GpsHudOverlay({ locationState, compassState, route, destination, onStartGps, onStopGps, onStartCompass, onStopCompass }) {
  const hasLiveLocation = locationState.status === 'live';
  const hasLiveCompass = compassState.status === 'live';
  const needsSecureOrigin =
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);
  const bearing = locationState.bearing;
  const arrowRotation =
    Number.isFinite(bearing) && Number.isFinite(compassState.heading)
      ? (bearing - compassState.heading + 360) % 360
      : Number.isFinite(bearing)
        ? bearing
        : 0;

  return (
    <div className="gps-hud" aria-label="GPS HUD 길안내">
      <div className="gps-hud-top">
        <span className={`gps-status is-${locationState.status}`}>
          <Navigation size={14} aria-hidden="true" />
          {locationState.message}
        </span>
        <div className="gps-hud-buttons">
          <button type="button" onClick={hasLiveLocation ? onStopGps : onStartGps}>
            {hasLiveLocation ? 'GPS 중지' : 'GPS 실행'}
          </button>
          <button type="button" onClick={hasLiveCompass ? onStopCompass : onStartCompass}>
            {hasLiveCompass ? '나침반 중지' : '나침반'}
          </button>
        </div>
      </div>

      <div className="gps-hud-center">
        <div className="hud-arrow" style={{ transform: `rotate(${arrowRotation}deg)` }}>
          <Navigation size={42} aria-hidden="true" />
        </div>
        <div>
          <strong>{formatDistance(locationState.distanceMeters)}</strong>
          <span>{destination.shortName} 방향 · {getCompassLabel(bearing)}</span>
          <small>{compassState.message}</small>
        </div>
      </div>

      <div className="gps-hud-bottom">
        <span>정확도 {locationState.accuracy ? `±${locationState.accuracy}m` : '대기'}</span>
        <span>{route.type}</span>
      </div>

      {needsSecureOrigin && (
        <p className="gps-warning">휴대폰에서는 HTTPS 주소로 접속해야 카메라와 GPS 권한이 허용됩니다.</p>
      )}
    </div>
  );
}

function CameraRouteMap({ recommendation, route }) {
  const points = route.routePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const staticMapUrl = buildGoogleStaticMapUrl({
    origin: recommendation.origin,
    destination: recommendation.destination,
    route,
    mapZoom: 14,
  });

  return (
    <section className="camera-route-map" aria-label="카메라 길안내 경로">
      <div>
        <p className="eyebrow">Route line</p>
        <h2>{route.name}</h2>
        <span>{formatMinutes(route.minutes)} · 보행 {route.walkingKm}km</span>
      </div>
      <div className="camera-mini-map">
        <img src={staticMapUrl} alt="" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline className="route-shadow" points={points} />
          <polyline className="route-line" style={{ stroke: route.color }} points={points} />
        </svg>
      </div>
      <div className="camera-route-steps">
        {route.segments.slice(0, 4).map((segment, index) => (
          <span key={`${segment.label}-${index}`}>
            {index + 1}. {segment.mode} {segment.km}km
          </span>
        ))}
      </div>
    </section>
  );
}

function ArCameraHud({ cue, route, recommendation, locationState, compassState, onTriggerDemo }) {
  const recoveryCueRef = useRef(null);
  const demoPressTimerRef = useRef(null);
  const isOffRoute = Boolean(locationState.isOffRoute);
  const isGpsUnstable = locationState.status === 'live' && !locationState.isGpsStable;
  const InstructionIcon = isOffRoute ? Route : cue.icon;
  const facingHeading = Number.isFinite(compassState.heading)
    ? compassState.heading
    : Number.isFinite(locationState.coords?.heading)
      ? locationState.coords.heading
      : Number.isFinite(locationState.bearing)
        ? locationState.bearing
        : null;
  const recoveryRelativeAngle =
    Number.isFinite(locationState.recoveryBearing) && Number.isFinite(facingHeading)
      ? (locationState.recoveryBearing - facingHeading + 360) % 360
      : 0;
  const recoveryCue = isOffRoute
    ? getBufferedRelativeDirectionCue(recoveryRelativeAngle, recoveryCueRef.current?.key)
    : getRelativeDirectionCue(recoveryRelativeAngle);
  const HudIcon = isOffRoute ? recoveryCue.icon : cue.icon;
  const instructionDistance = isOffRoute
    ? '현재 위치 기준'
    : ['지금', '전방'].includes(cue.distance)
      ? cue.distance
      : `${cue.distance} 후`;
  const instructionTitle = isOffRoute ? '복귀 경로 안내' : isGpsUnstable ? 'GPS 보정 중' : cue.title;
  const instructionSubtitle = isOffRoute
    ? `중앙 화살표가 가리키는 ${recoveryCue.label} 방향으로 원래 경로에 합류하세요 · 이탈 ${formatDistance(locationState.routeDeviationMeters)}`
    : isGpsUnstable
      ? '실내에서는 GPS가 튈 수 있어 위치가 안정될 때까지 방향 안내를 고정합니다.'
    : cue.subtitle;
  const terrainText = isOffRoute
    ? `${recoveryCue.label} 방향으로 이동 후 원래 경로 재합류`
    : isGpsUnstable
      ? `현재 정확도 ${locationState.accuracy ? `±${locationState.accuracy}m` : '확인 중'}`
      : cue.terrain;
  const statusText = isOffRoute
    ? '복귀 방향 안내 중'
    : cue.statusText
      ? cue.statusText
      : compassState.status === 'live'
      ? '방향 보정 중'
      : '나침반 대기';
  const miniMapUrl = buildCameraMiniMapUrl({ route, locationState });
  const hasLiveGps = locationState.status === 'live' && locationState.coords;
  const miniMapLabel =
    cue.mapLabel ??
    (hasLiveGps
      ? `${locationState.isGpsStable ? '내 위치 실시간 반영' : '실내 GPS 보정 중'} · 정확도 ${locationState.accuracy ? `±${locationState.accuracy}m` : '확인 중'}`
      : locationState.status === 'loading'
        ? 'GPS 위치 확인 중'
        : 'GPS 대기 · 출발지 기준 미리보기');
  const markerHeading = Number.isFinite(compassState.heading)
    ? compassState.heading
    : Number.isFinite(locationState.coords?.heading)
      ? locationState.coords.heading
      : Number.isFinite(locationState.bearing)
        ? locationState.bearing
        : 0;

  useEffect(() => {
    recoveryCueRef.current = isOffRoute ? recoveryCue : null;
  }, [isOffRoute, recoveryCue.key]);

  const cancelDemoPress = () => {
    if (demoPressTimerRef.current !== null) {
      window.clearTimeout(demoPressTimerRef.current);
      demoPressTimerRef.current = null;
    }
  };

  const startDemoPress = (event) => {
    if (typeof onTriggerDemo !== 'function') return;
    event.preventDefault();
    cancelDemoPress();
    demoPressTimerRef.current = window.setTimeout(() => {
      demoPressTimerRef.current = null;
      onTriggerDemo();
      navigator.vibrate?.(35);
    }, 850);
  };

  useEffect(() => () => cancelDemoPress(), []);

  return (
    <div className={isOffRoute ? 'ar-hud-layer is-rerouting' : 'ar-hud-layer'} aria-label="AR HUD 길안내">
      <div className="camera-map-overlay" aria-label="현재 구간 미니맵">
        <img src={miniMapUrl} alt="" />
        <div
          className={hasLiveGps ? 'live-location-marker is-live' : 'live-location-marker'}
          style={{ '--marker-heading': `${Math.round(markerHeading)}deg` }}
          aria-hidden="true"
        >
          <Navigation size={15} aria-hidden="true" />
        </div>
        <span>{miniMapLabel}</span>
      </div>

      <div className={[isOffRoute ? 'ar-top-instruction is-rerouting' : 'ar-top-instruction', cue.demo ? 'is-demo' : '', cue.key ? `is-${cue.key}` : ''].filter(Boolean).join(' ')}>
        <span className={`ar-turn-icon is-${cue.key}${cue.demo ? ' is-demo' : ''}`}>
          <InstructionIcon size={38} aria-hidden="true" />
        </span>
        <div>
          <small>{instructionDistance}</small>
          <strong>{instructionTitle}</strong>
          <p>{instructionSubtitle}</p>
          <span className="ar-cue-terrain">{terrainText}</span>
        </div>
      </div>

      <div className="ar-lane-guide">
        <button
          type="button"
          className={isOffRoute ? `ar-road-arrow is-recovery is-${recoveryCue.key}` : `ar-road-arrow is-${cue.key}${cue.demo ? ' is-demo' : ''}`}
          onPointerDown={startDemoPress}
          onPointerUp={cancelDemoPress}
          onPointerLeave={cancelDemoPress}
          onPointerCancel={cancelDemoPress}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="데모 안내 전환"
        >
          <HudIcon size={44} aria-hidden="true" />
          <small>{isOffRoute ? recoveryCue.label : cue.label}</small>
        </button>
      </div>

      <div className="ar-bottom-status">
        <span>{formatDistance(locationState.distanceMeters)} · {recommendation.destination.shortName}</span>
        <span>{route.type} · {statusText}</span>
      </div>
    </div>
  );
}

function PhotoGuidancePage({
  route,
  recommendation,
  cue,
  cameraStatus,
  locationState,
  compassState,
  voiceEnabled,
  videoRef,
  canvasRef,
  onStartCamera,
  onStopCamera,
  onToggleVoice,
  onTriggerDemo,
  onBack,
}) {
  const isOffRoute = Boolean(locationState.isOffRoute);
  const VoiceIcon = voiceEnabled ? Volume2 : VolumeX;
  const placeholderTitle =
    cameraStatus === 'loading'
      ? '후면 카메라를 여는 중'
      : cameraStatus === 'desktop'
        ? '휴대폰 후면카메라 전용'
        : cameraStatus === 'insecure'
          ? 'HTTPS로 접속해 주세요'
          : cameraStatus === 'blocked'
            ? '후면 카메라를 사용할 수 없습니다'
            : '길안내';
  const placeholderBody =
    cameraStatus === 'desktop'
      ? '컴퓨터에서는 카메라를 실행하지 않습니다. 휴대폰에서 접속해 주세요.'
      : cameraStatus === 'insecure'
        ? '모바일 카메라와 GPS는 보안 연결에서만 허용됩니다.'
        : cameraStatus === 'blocked'
          ? '전면 카메라나 데스크톱 카메라로 대체 실행하지 않습니다.'
          : '후면 카메라와 GPS를 기준으로 AR 화살표를 표시합니다.';
  const handleExitCamera = () => {
    onStopCamera();
    onBack();
  };

  return (
    <main className={isOffRoute ? 'photo-page is-route-alert' : 'photo-page'} aria-label="사진 기반 길안내">
      {isOffRoute && <div className="route-alert-flash" aria-hidden="true" />}
      <section className="camera-stage ar-camera-stage">
        {cameraStatus === 'live' && <video ref={videoRef} className="camera-video" autoPlay muted playsInline />}
        {cameraStatus !== 'live' && (
          <div className={cameraStatus === 'loading' ? 'camera-placeholder is-loading' : 'camera-placeholder'}>
            <Camera size={46} aria-hidden="true" />
            <strong>{placeholderTitle}</strong>
            <span>{placeholderBody}</span>
          </div>
        )}
        <canvas ref={canvasRef} hidden />
        <ArCameraHud
          cue={cue}
          route={route}
          recommendation={recommendation}
          locationState={locationState}
          compassState={compassState}
          onTriggerDemo={onTriggerDemo}
        />
      </section>

      <section className="camera-tools">
        <button type="button" className="secondary-action dark" onClick={handleExitCamera}>
          <X size={17} aria-hidden="true" />
          카메라 종료
        </button>
        <button
          type="button"
          className={cameraStatus === 'live' && !voiceEnabled ? 'primary-action is-muted' : 'primary-action'}
          onClick={cameraStatus === 'live' ? onToggleVoice : onStartCamera}
          aria-pressed={cameraStatus === 'live' ? voiceEnabled : undefined}
        >
          {cameraStatus === 'live' ? <VoiceIcon size={17} aria-hidden="true" /> : <Navigation size={17} aria-hidden="true" />}
          {cameraStatus === 'live' ? (voiceEnabled ? '음성 켜짐' : '음성 꺼짐') : '카메라 켜기'}
        </button>
      </section>
    </main>
  );
}

function BottomNavigation({ activePage, onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="앱 하단 탐색">
      <button type="button" className={activePage === 'plan' ? 'is-active' : ''} onClick={() => onNavigate('plan')}>
        <Home size={20} aria-hidden="true" />
        <span>Plan</span>
      </button>
      <button type="button" className={activePage === 'routes' ? 'is-active' : ''} onClick={() => onNavigate('routes')}>
        <Map size={20} aria-hidden="true" />
        <span>지도</span>
      </button>
      <button type="button" className={activePage === 'extras' ? 'is-active' : ''} onClick={() => onNavigate('extras')}>
        <MessagesSquare size={20} aria-hidden="true" />
        <span>정보 물어보기</span>
      </button>
      <button type="button" className={activePage === 'trips' ? 'is-active' : ''} onClick={() => onNavigate('trips')}>
        <Check size={20} aria-hidden="true" />
        <span>내 여행</span>
      </button>
    </nav>
  );
}

export default App;
