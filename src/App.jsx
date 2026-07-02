import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bus,
  Camera,
  ChevronUp,
  Clock3,
  Compass,
  Droplets,
  Info,
  Map,
  MapPin,
  Navigation,
  Route,
  ShieldCheck,
  Sparkles,
  Sun,
  ThermometerSun,
  TrainFront,
  Wind,
  X,
} from 'lucide-react';
import { parisPlaces, timeSlots, userModes, weatherPresets } from './data/parisPlaces.js';
import { fetchAiRecommendation, fetchLiveWeather } from './services/liveApi.js';
import { buildRouteRecommendation } from './services/routeEngine.js';

const googleMapKey = import.meta.env.VITE_MAP_API_KEY;

const initialWeather = {
  temperature: 35,
  humidity: 72,
  wind: 1,
};

const modeIcons = {
  time: Clock3,
  balanced: ShieldCheck,
  comfort: Sun,
};

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}시간 ${remaining}분` : `${hours}시간`;
}

function getTransitIcon(routeType) {
  if (routeType.includes('Metro')) return TrainFront;
  if (routeType.includes('Bus')) return Bus;
  return Navigation;
}

function App() {
  const [originId, setOriginId] = useState('eiffel');
  const [destinationId, setDestinationId] = useState('louvre');
  const [timeSlotId, setTimeSlotId] = useState('14');
  const [modeId, setModeId] = useState('balanced');
  const [weather, setWeather] = useState(initialWeather);
  const [weatherApiState, setWeatherApiState] = useState({
    status: 'idle',
    message: '목업 날씨 사용 중',
  });
  const [aiState, setAiState] = useState({
    status: 'idle',
    message: '',
    text: '',
    source: '',
  });
  const [isHudOpen, setIsHudOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const recommendation = useMemo(
    () =>
      buildRouteRecommendation({
        originId,
        destinationId,
        weather,
        timeSlotId,
        modeId,
        places: parisPlaces,
      }),
    [originId, destinationId, weather, timeSlotId, modeId],
  );

  const [selectedRouteId, setSelectedRouteId] = useState(recommendation.bestRoute.id);
  const selectedRoute = recommendation.routes.find((route) => route.id === selectedRouteId) ?? recommendation.bestRoute;

  useEffect(() => {
    setSelectedRouteId(recommendation.bestRoute.id);
  }, [recommendation.bestRoute.id]);

  useEffect(() => {
    setAiState({
      status: 'idle',
      message: '',
      text: '',
      source: '',
    });
  }, [selectedRouteId, recommendation.bestRoute.id, weather, modeId]);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const updateWeather = (field, value) => {
    setWeather((current) => ({
      ...current,
      [field]: Number(value),
    }));
  };

  const selectPlace = (field, value) => {
    if (field === 'origin') {
      setOriginId(value);
      if (value === destinationId) {
        const next = parisPlaces.find((place) => place.id !== value);
        setDestinationId(next.id);
      }
      return;
    }

    setDestinationId(value);
    if (value === originId) {
      const next = parisPlaces.find((place) => place.id !== value);
      setOriginId(next.id);
    }
  };

  const loadDemoScenario = () => {
    setOriginId('eiffel');
    setDestinationId('louvre');
    setTimeSlotId('14');
    setModeId('comfort');
    setWeather(weatherPresets[0].values);
    setWeatherApiState({
      status: 'idle',
      message: '폭염 시연값 적용',
    });
  };

  const loadLiveWeather = async () => {
    setWeatherApiState({
      status: 'loading',
      message: `${recommendation.destination.name} 기준 날씨를 불러오는 중`,
    });

    try {
      const liveWeather = await fetchLiveWeather(recommendation.destination);
      setWeather({
        temperature: liveWeather.temperature,
        humidity: liveWeather.humidity,
        wind: liveWeather.wind,
      });
      setWeatherApiState({
        status: 'success',
        message: `${liveWeather.city || recommendation.destination.name} · ${liveWeather.condition} · ${liveWeather.source}`,
      });
    } catch (error) {
      setWeatherApiState({
        status: 'error',
        message: error.message,
      });
    }
  };

  const generateAiExplanation = async () => {
    setAiState({
      status: 'loading',
      message: 'OpenAI가 추천 이유를 생성하는 중',
      text: '',
      source: '',
    });

    try {
      const result = await fetchAiRecommendation({
        recommendation,
        selectedRoute,
      });
      setAiState({
        status: 'success',
        message: 'OpenAI 설명 생성 완료',
        text: result.text,
        source: result.source,
      });
    } catch (error) {
      setAiState({
        status: 'error',
        message: error.message,
        text: '',
        source: '',
      });
    }
  };

  const startGuidance = async () => {
    setIsHudOpen(true);
    setCameraStatus('loading');

    const forceMockCamera = new URLSearchParams(window.location.search).get('camera') === 'mock';
    if (forceMockCamera) {
      setCameraStatus('mock');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('mock');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus('live');
    } catch {
      setCameraStream(null);
      setCameraStatus('mock');
    }
  };

  const stopGuidance = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    setCameraStatus('idle');
    setIsHudOpen(false);
  };

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="앱 요약">
        <div className="brand-block">
          <img src="/coolpath-mark.svg" alt="" className="brand-mark" />
          <div>
            <p className="eyebrow">Paris comfort routing MVP</p>
            <h1>CoolPath AI</h1>
            <p className="brand-line">날씨, 시간대, 도보 부담을 계산해 오늘의 이동 전략을 비교합니다.</p>
          </div>
        </div>
        <div className="condition-strip" aria-label="현재 추천 요약">
          <MetricPill icon={ThermometerSun} label="체감" value={`${recommendation.weatherModel.feelsLike}°C`} />
          <MetricPill icon={Sun} label="햇빛" value={recommendation.timeSlot.sunLabel} />
          <MetricPill icon={ShieldCheck} label="추천점수" value={`${recommendation.bestRoute.recommendationScore}점`} />
        </div>
      </section>

      <section className="app-layout">
        <ControlPanel
          originId={originId}
          destinationId={destinationId}
          timeSlotId={timeSlotId}
          modeId={modeId}
          weather={weather}
          onPlaceChange={selectPlace}
          onTimeChange={setTimeSlotId}
          onModeChange={setModeId}
          onWeatherChange={updateWeather}
          onWeatherPreset={(values) => setWeather(values)}
          onDemoScenario={loadDemoScenario}
          onLiveWeather={loadLiveWeather}
          weatherApiState={weatherApiState}
        />

        <section className="visual-column" aria-label="경로 시각화와 비교">
          <MapPanel
            places={parisPlaces}
            origin={recommendation.origin}
            destination={recommendation.destination}
            route={selectedRoute}
            routes={recommendation.routes}
            onRouteSelect={setSelectedRouteId}
            mapApiKey={googleMapKey}
          />
          <RouteComparison
            routes={recommendation.routes}
            bestRouteId={recommendation.bestRoute.id}
            selectedRouteId={selectedRouteId}
            onRouteSelect={setSelectedRouteId}
          />
        </section>

        <InsightPanel
          recommendation={recommendation}
          selectedRoute={selectedRoute}
          aiState={aiState}
          onGenerateAi={generateAiExplanation}
        />
      </section>

      <DataNotice />
      <GuidanceLauncher onStart={startGuidance} />
      {isHudOpen && (
        <GuidanceHud
          route={selectedRoute}
          recommendation={recommendation}
          cameraStatus={cameraStatus}
          videoRef={videoRef}
          onClose={stopGuidance}
        />
      )}
    </main>
  );
}

function MetricPill({ icon: Icon, label, value }) {
  return (
    <div className="metric-pill">
      <Icon size={17} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ControlPanel({
  originId,
  destinationId,
  timeSlotId,
  modeId,
  weather,
  onPlaceChange,
  onTimeChange,
  onModeChange,
  onWeatherChange,
  onWeatherPreset,
  onDemoScenario,
  onLiveWeather,
  weatherApiState,
}) {
  return (
    <aside className="control-panel" aria-label="경로 조건 입력">
      <div className="panel-action-row">
        <SectionTitle icon={Route} title="여행지 선택" />
        <button type="button" className="ghost-button" onClick={onDemoScenario}>
          폭염 시연값
        </button>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>출발지</span>
          <select value={originId} onChange={(event) => onPlaceChange('origin', event.target.value)}>
            {parisPlaces.map((place) => (
              <option key={place.id} value={place.id} disabled={place.id === destinationId}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>도착지</span>
          <select value={destinationId} onChange={(event) => onPlaceChange('destination', event.target.value)}>
            {parisPlaces.map((place) => (
              <option key={place.id} value={place.id} disabled={place.id === originId}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="place-chip-grid" aria-label="주요 여행지 빠른 선택">
        {parisPlaces.slice(0, 8).map((place) => (
          <button
            type="button"
            key={place.id}
            className={place.id === destinationId ? 'place-chip is-active' : 'place-chip'}
            onClick={() => onPlaceChange('destination', place.id)}
            disabled={place.id === originId}
          >
            <MapPin size={14} aria-hidden="true" />
            <span>{place.shortName}</span>
          </button>
        ))}
      </div>

      <SectionTitle icon={Clock3} title="시간대" />
      <div className="segmented-grid">
        {timeSlots.map((slot) => (
          <button
            type="button"
            key={slot.id}
            className={slot.id === timeSlotId ? 'segment is-active' : 'segment'}
            onClick={() => onTimeChange(slot.id)}
          >
            {slot.label}
          </button>
        ))}
      </div>

      <SectionTitle icon={ThermometerSun} title="날씨 조건" />
      <div className="preset-row" aria-label="날씨 프리셋">
        {weatherPresets.map((preset) => (
          <button type="button" key={preset.id} className="preset-button" onClick={() => onWeatherPreset(preset.values)}>
            {preset.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="api-button"
        onClick={onLiveWeather}
        disabled={weatherApiState.status === 'loading'}
      >
        {weatherApiState.status === 'loading' ? '날씨 불러오는 중' : 'API 날씨 불러오기'}
      </button>
      <p className={`api-status is-${weatherApiState.status}`}>{weatherApiState.message}</p>
      <div className="weather-stack">
        <WeatherInput
          icon={ThermometerSun}
          label="기온"
          unit="°C"
          value={weather.temperature}
          min="15"
          max="42"
          step="1"
          onChange={(value) => onWeatherChange('temperature', value)}
        />
        <WeatherInput
          icon={Droplets}
          label="습도"
          unit="%"
          value={weather.humidity}
          min="20"
          max="95"
          step="1"
          onChange={(value) => onWeatherChange('humidity', value)}
        />
        <WeatherInput
          icon={Wind}
          label="풍속"
          unit="m/s"
          value={weather.wind}
          min="0"
          max="14"
          step="0.1"
          onChange={(value) => onWeatherChange('wind', value)}
        />
      </div>

      <SectionTitle icon={ShieldCheck} title="추천 기준" />
      <div className="mode-stack">
        {userModes.map((mode) => {
          const Icon = modeIcons[mode.id];
          return (
            <button
              type="button"
              key={mode.id}
              className={mode.id === modeId ? 'mode-button is-active' : 'mode-button'}
              onClick={() => onModeChange(mode.id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>
                <strong>{mode.label}</strong>
                <small>{mode.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="section-title">
      <Icon size={18} aria-hidden="true" />
      <h2>{title}</h2>
    </div>
  );
}

function WeatherInput({ icon: Icon, label, unit, value, min, max, step, onChange }) {
  return (
    <label className="weather-input">
      <span className="weather-label">
        <Icon size={17} aria-hidden="true" />
        {label}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} />
      <span className="number-box">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} ${unit}`}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function canvasPointToLatLng(point) {
  const bounds = {
    north: 48.895,
    south: 48.835,
    west: 2.255,
    east: 2.385,
  };
  const lat = bounds.north - (point.y / 100) * (bounds.north - bounds.south);
  const lng = bounds.west + (point.x / 100) * (bounds.east - bounds.west);
  return { lat, lng };
}

function buildGoogleStaticMapUrl({ origin, destination, route, mapApiKey }) {
  const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
  url.searchParams.set('size', '760x480');
  url.searchParams.set('scale', '2');
  url.searchParams.set('maptype', 'roadmap');
  url.searchParams.set('language', 'ko');
  url.searchParams.set('center', `${(origin.lat + destination.lat) / 2},${(origin.lng + destination.lng) / 2}`);
  url.searchParams.set('zoom', '13');
  url.searchParams.append('markers', `color:red|label:S|${origin.lat},${origin.lng}`);
  url.searchParams.append('markers', `color:green|label:G|${destination.lat},${destination.lng}`);
  const pathPoints = route.routePoints.map(canvasPointToLatLng).map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`);
  url.searchParams.append('path', `color:0x${route.color.replace('#', '')}ff|weight:5|${pathPoints.join('|')}`);
  url.searchParams.set('key', mapApiKey);
  return url.toString();
}

function MapPanel({ places, origin, destination, route, routes, onRouteSelect, mapApiKey }) {
  const points = route.routePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const staticMapUrl = mapApiKey ? buildGoogleStaticMapUrl({ origin, destination, route, mapApiKey }) : '';

  return (
    <section className="map-panel" aria-label="지도형 경로 패널">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Mock Paris route map</p>
          <h2>
            {origin.name} <ArrowRight size={18} aria-hidden="true" /> {destination.name}
          </h2>
        </div>
        <div className="map-route-tabs">
          {routes.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              style={{ '--route-color': candidate.color }}
              className={candidate.id === route.id ? 'route-tab is-active' : 'route-tab'}
              onClick={() => onRouteSelect(candidate.id)}
              title={`${candidate.name} 보기`}
            >
              <span aria-hidden="true" />
              {candidate.name}
            </button>
          ))}
        </div>
      </div>

      <div className="map-canvas">
        {staticMapUrl && <img className="google-map-layer" src={staticMapUrl} alt="" />}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="seine" d="M5 61 C24 48, 35 66, 50 55 S78 48, 96 57" />
          <path className="boulevard" d="M11 35 C28 31, 43 38, 56 30 S78 26, 92 35" />
          <path className="boulevard thin" d="M18 83 C33 71, 52 79, 67 69 S82 57, 94 65" />
          <polyline className="route-shadow" points={points} />
          <polyline className="route-line" style={{ stroke: route.color }} points={points} />
          {route.routePoints.map((point, index) => (
            <g key={`${point.label}-${index}`} className="route-node">
              <circle cx={point.x} cy={point.y} r={index === 0 || index === route.routePoints.length - 1 ? 2.6 : 2.1} />
            </g>
          ))}
        </svg>

        {places.map((place) => {
          const isEndpoint = place.id === origin.id || place.id === destination.id;
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
        <StatBlock label="예상 시간" value={formatMinutes(route.minutes)} />
        <StatBlock label="도보 거리" value={`${route.walkingKm}km`} />
        <StatBlock label="햇빛 노출" value={route.exposureLabel} />
        <StatBlock label="그늘 보정" value={`${Math.round(route.shadePotential * 100)}%`} />
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

function RouteComparison({ routes, bestRouteId, selectedRouteId, onRouteSelect }) {
  return (
    <section className="comparison-panel" aria-label="후보 경로 비교">
      <div className="panel-heading compact">
        <SectionTitle icon={BarChart3} title="후보 경로 비교" />
      </div>
      <div className="route-card-grid">
        {routes.map((route) => {
          const Icon = getTransitIcon(route.type);
          return (
            <button
              type="button"
              key={route.id}
              className={route.id === selectedRouteId ? 'route-card is-selected' : 'route-card'}
              style={{ '--route-color': route.color }}
              onClick={() => onRouteSelect(route.id)}
            >
              <span className="route-card-topline">
                <Icon size={19} aria-hidden="true" />
                <strong>{route.name}</strong>
                {route.id === bestRouteId && <em>추천</em>}
                {!route.allowed && <em className="muted-badge">보조</em>}
              </span>
              <span className="route-card-summary">{route.summary}</span>
              <span className="tag-row">
                {route.tags.map((tag) => (
                  <small key={tag}>{tag}</small>
                ))}
              </span>
              <span className="route-metrics">
                <span>
                  Comfort
                  <b>{route.comfortScore}</b>
                </span>
                <span>
                  시간
                  <b>{formatMinutes(route.minutes)}</b>
                </span>
                <span>
                  도보
                  <b>{route.walkingKm}km</b>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function InsightPanel({ recommendation, selectedRoute, aiState, onGenerateAi }) {
  const { bestRoute, narrative, weatherModel, mode } = recommendation;
  const route = selectedRoute ?? bestRoute;

  return (
    <aside className="insight-panel" aria-label="추천 결과">
      <SectionTitle icon={Sparkles} title="AI 추천 결과" />
      <div className="result-card">
        <span className="score-ring" style={{ '--score-angle': `${route.comfortScore * 3.6}deg` }}>
          <strong>{route.comfortScore}</strong>
          <small>Comfort</small>
        </span>
        <div>
          <p className="result-label">{route.id === bestRoute.id ? '최종 추천 경로' : '선택한 후보 경로'}</p>
          <h2>{route.name}</h2>
          <p>{route.type}</p>
        </div>
      </div>

      <div className="ai-copy">
        <h3>{route.id === bestRoute.id ? narrative.title : `${route.name} 상세 분석`}</h3>
        <p>{route.id === bestRoute.id ? narrative.body : route.summary}</p>
        <p>{route.id === bestRoute.id ? narrative.tradeoff : `${route.name}은 ${formatMinutes(route.minutes)}, 도보 ${route.walkingKm}km로 계산되었습니다.`}</p>
        <p>{route.id === bestRoute.id ? narrative.comfortNote : `현재 ${mode.label} 기준 추천 점수는 ${route.recommendationScore}점입니다.`}</p>
        {route.id === bestRoute.id && narrative.excludedNote && <p>{narrative.excludedNote}</p>}
      </div>

      <div className="live-ai-box">
        <button
          type="button"
          className="api-button"
          onClick={onGenerateAi}
          disabled={aiState.status === 'loading'}
        >
          {aiState.status === 'loading' ? 'OpenAI 생성 중' : 'OpenAI 설명 생성'}
        </button>
        {aiState.message && <p className={`api-status is-${aiState.status}`}>{aiState.message}</p>}
        {aiState.text && (
          <div className="openai-copy">
            <strong>{aiState.source}</strong>
            <p>{aiState.text}</p>
          </div>
        )}
      </div>

      <ScoreComponents route={route} />

      <div className="breakdown-list">
        <BreakdownRow label="직사광선 노출 감점" value={route.breakdown.sunPenalty} tone="danger" />
        <BreakdownRow label="도보거리 감점" value={route.breakdown.walkingPenalty} tone="danger" />
        <BreakdownRow label="환승/대기 감점" value={route.breakdown.transferPenalty} tone="warning" />
        <BreakdownRow label="혼잡 감점" value={route.breakdown.crowdPenalty} tone="warning" />
        <BreakdownRow label="그늘/대중교통 보너스" value={route.breakdown.shadeBonus} tone="good" />
      </div>

      <div className="context-box">
        <Info size={18} aria-hidden="true" />
        <p>
          현재 입력값 기준 체감 {weatherModel.feelsLike}°C, 상태는 {weatherModel.conditionLabel}입니다. {mode.label} 가중치로 Comfort Score와
          속도 점수를 합산해 추천 순위를 정했습니다.
        </p>
      </div>
    </aside>
  );
}

function ScoreComponents({ route }) {
  const rows = [
    ['더위', route.heatScore],
    ['햇빛', route.sunScore],
    ['이동부담', route.mobilityScore],
    ['공간환경', route.environmentScore],
  ];

  return (
    <div className="component-grid">
      {rows.map(([label, value]) => (
        <div key={label} className="component-cell">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function BreakdownRow({ label, value, tone }) {
  const capped = Math.min(Math.abs(value), 42);
  return (
    <div className="breakdown-row">
      <span>{label}</span>
      <div className="bar-track">
        <i className={tone} style={{ width: `${(capped / 42) * 100}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function DataNotice() {
  return (
    <section className="data-notice" aria-label="한계와 데이터 출처">
      <div>
        <SectionTitle icon={Info} title="MVP 범위" />
        <p>
          이 프로토타입은 실시간 교통·정밀 그림자·혼잡도 API 없이 동작합니다. 파리 주요 여행지 목업 좌표와 후보 경로를 기반으로 날씨,
          시간대, 도보거리, 도로폭, 건물 밀도, 강가 여부를 규칙 기반 Comfort Score로 계산합니다.
        </p>
      </div>
      <div className="source-grid">
        <span>여행지: 파리 주요 명소 목업 좌표</span>
        <span>날씨: 사용자가 입력한 시나리오 값</span>
        <span>경로: 교체 가능한 후보 생성 엔진</span>
        <span>확장: 지도·날씨·대중교통 API 연동</span>
      </div>
    </section>
  );
}

function GuidanceLauncher({ onStart }) {
  return (
    <button type="button" className="guidance-launcher" onClick={onStart} aria-label="HUD 길안내 시작">
      <Camera size={20} aria-hidden="true" />
      <span>길안내 시작</span>
    </button>
  );
}

function GuidanceHud({ route, recommendation, cameraStatus, videoRef, onClose }) {
  const points = route.routePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const nextStep = getHudInstruction(route);
  const cameraLabel =
    cameraStatus === 'live'
      ? '실시간 카메라'
      : cameraStatus === 'loading'
        ? '카메라 연결 중'
        : '목업 카메라 HUD';

  return (
    <section className="hud-overlay" aria-label="실감형 길안내 HUD">
      <div className="hud-camera-layer">
        {cameraStatus === 'live' && <video ref={videoRef} className="hud-video" autoPlay muted playsInline />}
        {cameraStatus !== 'live' && (
          <div className={cameraStatus === 'loading' ? 'hud-mock-camera is-loading' : 'hud-mock-camera'}>
            <span className="street-line line-left" />
            <span className="street-line line-right" />
            <span className="street-building building-left" />
            <span className="street-building building-right" />
            <span className="street-skyline" />
          </div>
        )}
      </div>

      <div className="hud-vignette" />

      <header className="hud-header">
        <div>
          <p className="eyebrow">Immersive guidance mode</p>
          <h2>
            {recommendation.origin.shortName} <ArrowRight size={17} aria-hidden="true" /> {recommendation.destination.shortName}
          </h2>
        </div>
        <button type="button" className="hud-close" onClick={onClose} aria-label="HUD 닫기">
          <X size={22} aria-hidden="true" />
        </button>
      </header>

      <div className="hud-status-strip">
        <HudChip icon={Camera} label={cameraLabel} />
        <HudChip icon={ThermometerSun} label={`체감 ${recommendation.weatherModel.feelsLike}°C`} />
        <HudChip icon={ShieldCheck} label={`${route.grade} · ${route.comfortScore}점`} />
      </div>

      <div className="hud-center-guide">
        <div className="hud-arrow-ring">
          <ChevronUp size={86} aria-hidden="true" />
        </div>
        <div className="hud-step-card">
          <span>{nextStep.kicker}</span>
          <strong>{nextStep.title}</strong>
          <p>{nextStep.detail}</p>
        </div>
      </div>

      <aside className="hud-mini-map" aria-label="HUD 미니맵">
        <div className="hud-map-title">
          <Map size={17} aria-hidden="true" />
          <strong>{route.name}</strong>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="hud-river" d="M5 61 C24 48, 35 66, 50 55 S78 48, 96 57" />
          <polyline className="hud-route-line" style={{ stroke: route.color }} points={points} />
          {route.routePoints.map((point, index) => (
            <circle
              key={`${point.label}-${index}`}
              cx={point.x}
              cy={point.y}
              r={index === 0 || index === route.routePoints.length - 1 ? 3 : 2.2}
            />
          ))}
        </svg>
        <div className="hud-map-metrics">
          <span>{formatMinutes(route.minutes)}</span>
          <span>{route.walkingKm}km 도보</span>
        </div>
      </aside>

      <footer className="hud-footer">
        <div>
          <Compass size={18} aria-hidden="true" />
          <span>{route.summary}</span>
        </div>
        <small>프로토타입 HUD: 실제 경로 추적 대신 선택된 후보 경로의 다음 행동을 시각화합니다.</small>
      </footer>
    </section>
  );
}

function HudChip({ icon: Icon, label }) {
  return (
    <span className="hud-chip">
      <Icon size={16} aria-hidden="true" />
      {label}
    </span>
  );
}

function getHudInstruction(route) {
  if (route.id === 'metro') {
    return {
      kicker: '120m 앞',
      title: 'Metro 진입 방향으로 이동',
      detail: '도보 노출을 줄이기 위해 가장 가까운 지하철 진입 지점까지 직진하세요.',
    };
  }

  if (route.id === 'bus') {
    return {
      kicker: '90m 앞',
      title: '버스 정류장 쪽으로 이동',
      detail: '현재 더위 조건에서는 대기 시간이 있어도 도보 부담을 줄이는 전략입니다.',
    };
  }

  if (route.id === 'riverside') {
    return {
      kicker: '다음 구간',
      title: '세느강 방향으로 우회',
      detail: '강가의 개방감과 바람 가능성을 활용해 체감 쾌적도를 높입니다.',
    };
  }

  if (route.id === 'shade') {
    return {
      kicker: '150m 앞',
      title: '그늘 골목으로 진입',
      detail: '건물 밀도가 높은 구간을 따라 직사광선 노출을 줄입니다.',
    };
  }

  return {
    kicker: '현재 방향',
    title: '목적지 방향으로 계속 직진',
    detail: '가장 빠른 후보이지만 더운 시간대에는 햇빛 노출에 주의하세요.',
  };
}

export default App;
