import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Bus,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Coffee,
  Compass,
  Droplets,
  Home,
  Image,
  Landmark,
  Laptop,
  ListChecks,
  Map,
  MapPin,
  MessagesSquare,
  Navigation,
  Route,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  ThermometerSun,
  TrainFront,
  Trees,
  User,
  Users,
  Utensils,
  Wind,
  X,
} from 'lucide-react';
import { parisPlaces, userModes, weatherPresets } from './data/parisPlaces.js';
import { fetchLiveWeather, fetchTravelGuideChat } from './services/liveApi.js';
import { buildRouteRecommendation } from './services/routeEngine.js';

const pages = [
  { id: 'plan', label: 'Plan', icon: CalendarDays },
  { id: 'routes', label: '지도', icon: Map },
  { id: 'extras', label: '가이드', icon: MessagesSquare },
];

const durationOptions = [
  { id: '2', label: '2박', placeLimit: 2 },
  { id: '3', label: '3박', placeLimit: 3 },
  { id: '4', label: '4박', placeLimit: 4 },
  { id: '5', label: '5박', placeLimit: 5 },
];

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

function normalizePage(page) {
  return ['plan', 'routes', 'extras', 'camera'].includes(page) ? page : 'plan';
}

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

function getPlaceMeta(placeId) {
  return placeMeta[placeId] ?? { icon: MapPin, badge: '저장 장소', note: '선택한 여정 후보입니다.' };
}

function getDuration(durationId) {
  return durationOptions.find((option) => option.id === durationId) ?? durationOptions[1];
}

function getPace(paceId) {
  return paceOptions.find((option) => option.id === paceId) ?? paceOptions[1];
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

function App() {
  const [activePage, setActivePage] = useState(() => normalizePage(window.location.hash.replace('#', '')));
  const [originAddress, setOriginAddress] = useState('12 Rue de la Bourdonnais, Paris');
  const [originAnchorId, setOriginAnchorId] = useState('eiffel');
  const [selectedPlaceIds, setSelectedPlaceIds] = useState(['louvre', 'orsay', 'luxembourg']);
  const [destinationId, setDestinationId] = useState('louvre');
  const [durationId, setDurationId] = useState('3');
  const [paceId, setPaceId] = useState('balanced');
  const [weather, setWeather] = useState(weatherPresets[0].values);
  const [weatherApiState, setWeatherApiState] = useState({
    status: 'idle',
    message: '목적지를 선택하면 날씨를 자동 조회합니다.',
  });
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [guideMessages, setGuideMessages] = useState([]);
  const [guideInput, setGuideInput] = useState('');
  const [guideStatus, setGuideStatus] = useState('idle');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoAnalysis, setPhotoAnalysis] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const selectedPlaces = useMemo(
    () => selectedPlaceIds.map((id) => parisPlaces.find((place) => place.id === id)).filter(Boolean),
    [selectedPlaceIds],
  );
  const orderedPlaces = useMemo(() => orderPlacesForPlan(selectedPlaces, weather, paceId), [selectedPlaces, weather, paceId]);
  const plannedPlaces = useMemo(
    () => orderedPlaces.slice(0, Math.min(getDuration(durationId).placeLimit, orderedPlaces.length)),
    [durationId, orderedPlaces],
  );
  const pace = getPace(paceId);
  const modeId = pace.modeId;
  const originAnchor = useMemo(
    () => parisPlaces.find((place) => place.id === originAnchorId) ?? parisPlaces[0],
    [originAnchorId],
  );
  const destination = useMemo(
    () => parisPlaces.find((place) => place.id === destinationId) ?? plannedPlaces[0] ?? parisPlaces[1],
    [destinationId, plannedPlaces],
  );
  const originLocation = useMemo(() => {
    const trimmedAddress = originAddress.trim();

    return {
      ...originAnchor,
      id: trimmedAddress ? `custom-${originAnchor.id}` : originAnchor.id,
      sourceId: originAnchor.id,
      name: trimmedAddress || originAnchor.name,
      shortName: trimmedAddress ? '내 출발지' : originAnchor.shortName,
      area: trimmedAddress ? '직접 입력 주소' : originAnchor.area,
    };
  }, [originAddress, originAnchor]);

  const recommendation = useMemo(
    () =>
      buildRouteRecommendation({
        origin: originLocation,
        destination,
        weather,
        timeSlotId: '14',
        modeId,
        places: parisPlaces,
      }),
    [originLocation, destination, weather, modeId],
  );

  const selectedRoute = recommendation.routes.find((route) => route.id === selectedRouteId) ?? recommendation.bestRoute;

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

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

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

  const togglePlace = (placeId) => {
    setSelectedPlaceIds((current) => {
      if (current.includes(placeId)) {
        return current.length === 1 ? current : current.filter((id) => id !== placeId);
      }
      return [...current, placeId];
    });
  };

  const generatePlan = () => {
    const nextDestination = plannedPlaces[0] ?? selectedPlaces[0] ?? parisPlaces[1];
    setDestinationId(nextDestination.id);
    navigateTo('routes');
  };

  const askTravelGuide = async (questionOverride) => {
    const question = (questionOverride ?? guideInput).trim();
    if (!question || guideStatus === 'loading') return;

    setGuideInput('');
    setGuideStatus('loading');
    setGuideMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text: question }]);

    try {
      const result = await fetchTravelGuideChat({
        question,
        recommendation,
        selectedRoute,
        plannedPlaces,
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
      if (!selectedDeviceId && videoDevices[0]) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch {
      setCameraDevices([]);
    }
  };

  const startCamera = async (deviceId = selectedDeviceId) => {
    setActivePage('camera');
    if (window.location.hash !== '#camera') {
      window.location.hash = 'camera';
    }
    setCameraStatus('loading');

    const forceMockCamera = new URLSearchParams(window.location.search).get('camera') === 'mock';
    if (forceMockCamera || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('mock');
      setPhotoAnalysis(buildPhotoAnalysis(selectedRoute, recommendation.destination));
      return;
    }

    try {
      const video = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
      const stream = await navigator.mediaDevices.getUserMedia({
        video,
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus('live');
      await refreshCameraDevices();
    } catch {
      setCameraStream(null);
      setCameraStatus('mock');
      setPhotoAnalysis(buildPhotoAnalysis(selectedRoute, recommendation.destination));
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    setCameraStatus('idle');
  };

  const changeCameraDevice = async (deviceId) => {
    setSelectedDeviceId(deviceId);
    if (cameraStatus === 'live') {
      await startCamera(deviceId);
    }
  };

  const capturePhoto = () => {
    const analysis = buildPhotoAnalysis(selectedRoute, recommendation.destination);
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      setPhotoPreview(canvas.toDataURL('image/jpeg', 0.82));
    }

    setPhotoAnalysis(analysis);
  };

  if (activePage === 'camera') {
    return (
      <PhotoGuidancePage
        route={selectedRoute}
        recommendation={recommendation}
        cameraStatus={cameraStatus}
        videoRef={videoRef}
        canvasRef={canvasRef}
        cameraDevices={cameraDevices}
        selectedDeviceId={selectedDeviceId}
        photoPreview={photoPreview}
        photoAnalysis={photoAnalysis}
        onDeviceChange={changeCameraDevice}
        onStartCamera={() => startCamera(selectedDeviceId)}
        onStopCamera={stopCamera}
        onCapturePhoto={capturePhoto}
        onBack={() => navigateTo('routes')}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className="mobile-frame">
        <MobileHeader activePage={activePage} onBack={() => navigateTo(activePage === 'plan' ? 'plan' : 'routes')} />

        {activePage === 'plan' && (
          <PlanPage
            originAddress={originAddress}
            originAnchorId={originAnchorId}
            selectedPlaceIds={selectedPlaceIds}
            plannedPlaces={plannedPlaces}
            durationId={durationId}
            paceId={paceId}
            weather={weather}
            weatherApiState={weatherApiState}
            recommendation={recommendation}
            onOriginAddressChange={setOriginAddress}
            onOriginAnchorChange={setOriginAnchorId}
            onTogglePlace={togglePlace}
            onDurationChange={setDurationId}
            onPaceChange={setPaceId}
            onGeneratePlan={generatePlan}
          />
        )}

        {activePage === 'routes' && (
          <RouteSelectionPage
            places={parisPlaces}
            plannedPlaces={plannedPlaces}
            recommendation={recommendation}
            selectedRoute={selectedRoute}
            onRouteSelect={setSelectedRouteId}
            onOpenPlan={() => navigateTo('plan')}
            onExtra={() => navigateTo('extras')}
            onStartCamera={() => startCamera(selectedDeviceId)}
          />
        )}

        {activePage === 'extras' && (
          <ExtraPage
            recommendation={recommendation}
            selectedRoute={selectedRoute}
            plannedPlaces={plannedPlaces}
            guideMessages={guideMessages}
            guideInput={guideInput}
            guideStatus={guideStatus}
            onGuideInputChange={setGuideInput}
            onAskGuide={askTravelGuide}
            onBack={() => navigateTo('routes')}
            onStartCamera={() => startCamera(selectedDeviceId)}
          />
        )}

        <BottomNavigation activePage={activePage} onNavigate={navigateTo} onCamera={() => startCamera(selectedDeviceId)} />
      </div>
    </main>
  );
}

function MobileHeader({ activePage, onBack }) {
  const title =
    activePage === 'routes' ? '경로 선택' : activePage === 'extras' ? '여행 가이드' : 'AI Plan';
  const subtitle =
    activePage === 'routes'
      ? '지도에서 경로를 고르고 점수를 확인'
      : activePage === 'extras'
        ? '행선지와 사진 안내 질문'
        : '저장한 장소로 최적 일정 생성';

  return (
    <header className="mobile-header">
      <button type="button" className="icon-button" onClick={onBack} aria-label="뒤로">
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
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

function PlanPage({
  originAddress,
  originAnchorId,
  selectedPlaceIds,
  plannedPlaces,
  durationId,
  paceId,
  weather,
  weatherApiState,
  recommendation,
  onOriginAddressChange,
  onOriginAnchorChange,
  onTogglePlace,
  onDurationChange,
  onPaceChange,
  onGeneratePlan,
}) {
  return (
    <section className="screen plan-screen">
      <div className="plan-callout">
        <Sparkles size={17} aria-hidden="true" />
        <p>My Place List의 장소를 기반으로 AI가 쾌적한 루트와 일정을 만듭니다.</p>
      </div>

      <section className="content-block">
        <SectionTitle icon={ListChecks} title={`AI가 사용할 저장 장소 (${plannedPlaces.length})`} />
        <div className="selected-place-row">
          {plannedPlaces.map((place) => {
            const meta = getPlaceMeta(place.id);
            const Icon = meta.icon;
            return (
              <span key={place.id} className="selected-place-chip">
                <Icon size={13} aria-hidden="true" />
                {place.name}
              </span>
            );
          })}
        </div>
      </section>

      <section className="input-stack" aria-label="여행 기본 정보">
        <label className="field-row">
          <span>여행 도시</span>
          <span className="static-input">
            <MapPin size={16} aria-hidden="true" />
            Paris
          </span>
        </label>
        <label className="field-row">
          <span>내 출발지</span>
          <input
            type="text"
            value={originAddress}
            onChange={(event) => onOriginAddressChange(event.target.value)}
            placeholder="출발지 주소 입력"
          />
        </label>
        <label className="field-row compact-field">
          <span>지도 기준</span>
          <select value={originAnchorId} onChange={(event) => onOriginAnchorChange(event.target.value)}>
            {parisPlaces.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name} · {place.area}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="control-section">
        <SectionTitle icon={CalendarDays} title="여행 기간" />
        <div className="duration-grid">
          {durationOptions.map((duration) => (
            <button
              type="button"
              key={duration.id}
              className={duration.id === durationId ? 'pill-option is-active' : 'pill-option'}
              onClick={() => onDurationChange(duration.id)}
            >
              {duration.label}
            </button>
          ))}
        </div>
      </section>

      <section className="control-section">
        <SectionTitle icon={Compass} title="여행 페이스" />
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
      </section>

      <section className="control-section">
        <SectionTitle icon={MapPin} title="장소 온오프" caption="켜진 장소만 이번 AI 플랜에 사용합니다." />
        <div className="place-toggle-list">
          {parisPlaces.map((place) => {
            const enabled = selectedPlaceIds.includes(place.id);
            const meta = getPlaceMeta(place.id);
            const Icon = meta.icon;
            return (
              <button
                type="button"
                key={place.id}
                className={enabled ? 'place-toggle is-on' : 'place-toggle'}
                onClick={() => onTogglePlace(place.id)}
                aria-pressed={enabled}
              >
                <Icon size={17} aria-hidden="true" />
                <span>
                  <strong>{place.name}</strong>
                  <small>{meta.badge}</small>
                </span>
                <i>{enabled && <Check size={14} aria-hidden="true" />}</i>
              </button>
            );
          })}
        </div>
      </section>

      <section className="weather-strip" aria-label="자동 날씨 상태">
        <MetricPill icon={ThermometerSun} label="기온" value={`${weather.temperature}°C`} />
        <MetricPill icon={Droplets} label="습도" value={`${weather.humidity}%`} />
        <MetricPill icon={Wind} label="풍속" value={`${weather.wind}m/s`} />
        <p className={`api-status is-${weatherApiState.status}`}>{weatherApiState.message}</p>
      </section>

      <button type="button" className="primary-cta" onClick={onGeneratePlan}>
        <Sparkles size={19} aria-hidden="true" />
        {plannedPlaces.length}개 장소로 AI 플랜 생성
      </button>

      <div className="next-route-peek">
        <span>현재 예상 추천</span>
        <strong>{recommendation.bestRoute.name}</strong>
        <small>
          {formatMinutes(recommendation.bestRoute.minutes)} · 추천 {recommendation.bestRoute.recommendationScore}점
        </small>
      </div>
    </section>
  );
}

function RouteSelectionPage({ places, plannedPlaces, recommendation, selectedRoute, onRouteSelect, onOpenPlan, onExtra, onStartCamera }) {
  return (
    <section className="screen route-screen">
      <MapPanel
        places={places}
        origin={recommendation.origin}
        destination={recommendation.destination}
        route={selectedRoute}
        routes={recommendation.routes}
        onRouteSelect={onRouteSelect}
      />

      <section className="route-sheet">
        <div className="route-score-row">
          <span className="score-token">
            <strong>{selectedRoute.recommendationScore}</strong>
            <small>추천점수</small>
          </span>
          <div>
            <p className="eyebrow">선택한 경로</p>
            <h2>{selectedRoute.name}</h2>
            <p>{selectedRoute.summary}</p>
          </div>
        </div>

        <div className="planned-strip" aria-label="AI 플랜 장소">
          {plannedPlaces.map((place, index) => (
            <span key={place.id} className={place.id === recommendation.destination.id ? 'plan-dot is-current' : 'plan-dot'}>
              {index + 1}. {place.shortName}
            </span>
          ))}
        </div>

        <div className="action-grid">
          <button type="button" className="secondary-action" onClick={onOpenPlan}>
            <CalendarDays size={17} aria-hidden="true" />
            Plan
          </button>
          <button type="button" className="secondary-action" onClick={onExtra}>
            <MessagesSquare size={17} aria-hidden="true" />
            가이드
          </button>
          <button type="button" className="primary-action" onClick={onStartCamera}>
            <Camera size={17} aria-hidden="true" />
            사진 안내
          </button>
        </div>
      </section>
    </section>
  );
}

function canvasPointToLatLng(point) {
  if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    return { lat: point.lat, lng: point.lng };
  }

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

function buildGoogleStaticMapUrl({ origin, destination, route }) {
  const url = new URL('/api/static-map', window.location.origin);
  url.searchParams.set('size', '760x760');
  url.searchParams.set('scale', '2');
  url.searchParams.set('maptype', 'roadmap');
  url.searchParams.set('language', 'ko');
  url.searchParams.set('center', `${(origin.lat + destination.lat) / 2},${(origin.lng + destination.lng) / 2}`);
  url.searchParams.set('zoom', '14');
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

function MapPanel({ places, origin, destination, route, routes, onRouteSelect }) {
  const points = route.routePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const staticMapUrl = buildGoogleStaticMapUrl({ origin, destination, route });

  return (
    <section className="map-panel" aria-label="지도형 경로 패널">
      <div className="map-heading">
        <div>
          <p className="eyebrow">Route map</p>
          <h2>
            {origin.shortName} <ArrowRight size={16} aria-hidden="true" /> {destination.shortName}
          </h2>
        </div>
      </div>

      <div className="map-route-tabs" aria-label="지도 위 경로 선택">
        {routes.map((candidate) => {
          const Icon = getTransitIcon(candidate.type);
          return (
            <button
              key={candidate.id}
              type="button"
              style={{ '--route-color': candidate.color }}
              className={candidate.id === route.id ? 'route-tab is-active' : 'route-tab'}
              onClick={() => onRouteSelect(candidate.id)}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{candidate.name}</span>
              <strong>{candidate.recommendationScore}</strong>
            </button>
          );
        })}
      </div>

      <div className="map-canvas">
        {staticMapUrl && <img className="google-map-layer" src={staticMapUrl} alt="" />}
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
        <StatBlock label="추천 점수" value={`${route.recommendationScore}점`} />
        <StatBlock label="예상 시간" value={formatMinutes(route.minutes)} />
        <StatBlock label="보행 거리" value={`${route.walkingKm}km`} />
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

function ExtraPage({
  recommendation,
  selectedRoute,
  plannedPlaces,
  guideMessages,
  guideInput,
  guideStatus,
  onGuideInputChange,
  onAskGuide,
  onBack,
  onStartCamera,
}) {
  const destinationMeta = getPlaceMeta(recommendation.destination.id);

  return (
    <section className="screen guide-screen">
      <section className="guide-context">
        <div>
          <p className="eyebrow">Travel guide</p>
          <h2>{recommendation.destination.name}</h2>
          <p>{destinationMeta.note}</p>
        </div>
        <div className="guide-metrics">
          <MetricPill icon={ThermometerSun} label="체감" value={`${recommendation.weatherModel.feelsLike}°C`} />
          <MetricPill icon={ShieldCheck} label="경로" value={`${selectedRoute.recommendationScore}점`} />
        </div>
      </section>

      <div className="guide-suggestions">
        {guideSuggestions.map((question) => (
          <button type="button" key={question} onClick={() => onAskGuide(question)}>
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
            placeholder="행선지, 정류장, 사진 안내 질문"
          />
          <button type="submit" aria-label="질문 보내기" disabled={guideStatus === 'loading'}>
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      </section>

      <section className="guide-route-card">
        <SectionTitle icon={Route} title="선택 경로 요약" />
        <div className="step-list">
          {selectedRoute.segments.slice(0, 4).map((segment, index) => (
            <div key={`${segment.label}-${index}`} className="map-step">
              <span>{index + 1}</span>
              <div>
                <strong>{segment.label}</strong>
                <small>
                  {segment.mode} · 약 {segment.km}km
                </small>
              </div>
            </div>
          ))}
        </div>
        <div className="planned-strip">
          {plannedPlaces.map((place, index) => (
            <span key={place.id} className={place.id === recommendation.destination.id ? 'plan-dot is-current' : 'plan-dot'}>
              {index + 1}. {place.shortName}
            </span>
          ))}
        </div>
      </section>

      <div className="action-grid">
        <button type="button" className="secondary-action" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          지도
        </button>
        <button type="button" className="primary-action" onClick={onStartCamera}>
          <Camera size={17} aria-hidden="true" />
          사진 안내
        </button>
      </div>
    </section>
  );
}

function PhotoGuidancePage({
  route,
  recommendation,
  cameraStatus,
  videoRef,
  canvasRef,
  cameraDevices,
  selectedDeviceId,
  photoPreview,
  photoAnalysis,
  onDeviceChange,
  onStartCamera,
  onStopCamera,
  onCapturePhoto,
  onBack,
}) {
  const cameraLabel =
    cameraStatus === 'live' ? '카메라 연결됨' : cameraStatus === 'loading' ? '카메라 연결 중' : cameraStatus === 'mock' ? '데모 분석 모드' : '카메라 대기';

  return (
    <main className="photo-page" aria-label="사진 기반 길안내">
      <header className="photo-header">
        <button type="button" className="icon-button dark" onClick={onBack} aria-label="경로 선택으로 돌아가기">
          <X size={21} aria-hidden="true" />
        </button>
        <div>
          <p>{cameraLabel}</p>
          <h1>
            {recommendation.origin.shortName} <ArrowRight size={16} aria-hidden="true" /> {recommendation.destination.shortName}
          </h1>
        </div>
      </header>

      <section className="camera-stage">
        {cameraStatus === 'live' && <video ref={videoRef} className="camera-video" autoPlay muted playsInline />}
        {cameraStatus !== 'live' && (
          <div className={cameraStatus === 'loading' ? 'camera-placeholder is-loading' : 'camera-placeholder'}>
            <Camera size={46} aria-hidden="true" />
            <strong>{cameraStatus === 'loading' ? '카메라를 여는 중' : '표지판 사진 안내'}</strong>
            <span>정류장, 지하철 입구, 방향 표지를 찍어 확인합니다.</span>
          </div>
        )}
        <canvas ref={canvasRef} hidden />
      </section>

      <section className="camera-tools">
        <label className="camera-select">
          <Laptop size={15} aria-hidden="true" />
          <select value={selectedDeviceId} onChange={(event) => onDeviceChange(event.target.value)} aria-label="카메라 선택">
            <option value="">자동 선택</option>
            {cameraDevices.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {device.label || `카메라 ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary-action dark" onClick={cameraStatus === 'live' ? onStopCamera : onStartCamera}>
          {cameraStatus === 'live' ? '카메라 끄기' : '카메라 켜기'}
        </button>
        <button type="button" className="primary-action" onClick={onCapturePhoto}>
          <Image size={17} aria-hidden="true" />
          사진 분석
        </button>
      </section>

      <section className="photo-analysis">
        {photoPreview && <img src={photoPreview} alt="촬영한 주변 사진" />}
        <div>
          <p className="eyebrow">Navigation check</p>
          <h2>{(photoAnalysis ?? buildPhotoAnalysis(route, recommendation.destination)).title}</h2>
          <p>{(photoAnalysis ?? buildPhotoAnalysis(route, recommendation.destination)).body}</p>
          <div className="check-list">
            {(photoAnalysis ?? buildPhotoAnalysis(route, recommendation.destination)).checks.map((item) => (
              <span key={item}>
                <Check size={14} aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className="photo-footer">
        <Compass size={18} aria-hidden="true" />
        <span>{route.summary}</span>
      </footer>
    </main>
  );
}

function BottomNavigation({ activePage, onNavigate, onCamera }) {
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
        <span>가이드</span>
      </button>
      <button type="button" onClick={onCamera}>
        <Camera size={20} aria-hidden="true" />
        <span>사진</span>
      </button>
    </nav>
  );
}

export default App;
