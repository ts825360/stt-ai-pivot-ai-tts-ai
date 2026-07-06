# CoolPath AI

CoolPath AI는 파리 여행자를 위한 모바일 중심 AI 여행 비서 프로토타입입니다.
여행 일정 생성, 날씨 기반 경로 추천, 지도 확인, 정보 질의응답, 카메라 기반 길안내 흐름을 하나의 모바일 웹에서 확인할 수 있습니다.

## 1. 실행 전 준비물

아래 프로그램이 설치되어 있어야 합니다.

- Git
- Node.js 20 이상
- Chrome 또는 Edge 브라우저
- 모바일 테스트가 필요하면 스마트폰
- 모바일 카메라/GPS 테스트가 필요하면 ngrok 계정 또는 HTTPS 배포 주소

설치 확인:

```powershell
git --version
node -v
npm -v
```

## 2. 프로젝트 다운로드

원하는 작업 폴더에서 아래 명령을 실행합니다.

```powershell
git clone https://github.com/ts825360/stt-ai-pivot-ai-tts-ai.git
cd stt-ai-pivot-ai-tts-ai
```

이미 프로젝트 폴더가 있다면 해당 폴더로 이동합니다.

```powershell
cd "C:\Users\ts825\OneDrive\바탕 화면\최종과제\stt-ai-pivot-ai-tts-ai"
```

## 3. 패키지 설치

```powershell
npm install
```

`node_modules` 폴더가 생성되면 설치가 완료된 것입니다.

## 4. 환경변수 설정

`.env.example` 파일을 복사해서 `.env.local`을 만듭니다.

```powershell
Copy-Item .env.example .env.local
```

`.env.local`에 실제 API 키를 입력합니다.
API 키는 GitHub에 올리면 안 됩니다.

```text
VITE_WEATHER_API_KEY=날씨_API_키
VITE_WEATHER_PROVIDER=google
VITE_GOOGLE_MAPS_REFERRER=http://127.0.0.1:5173/
VITE_MAP_API_KEY=구글_지도_API_키
OPENAI_API_KEY=OpenAI_API_키
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=low
OPENAI_TEXT_VERBOSITY=low
COOLPATH_ACCESS_TOKEN=배포_접근제한용_랜덤토큰
```

로컬 실행만 할 경우 `COOLPATH_ACCESS_TOKEN`은 비워도 됩니다.
Vercel 배포 접근 제한에만 사용합니다.

## 5. PC에서 실행

```powershell
npm run dev
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:5173/
```

만약 Vite가 다른 포트를 안내하면 터미널에 표시된 주소를 사용합니다.
예를 들어 `5174`, `5175`가 나올 수 있습니다.

## 6. 같은 와이파이에서 모바일로 실행

PC와 스마트폰이 같은 와이파이에 연결되어 있어야 합니다.

```powershell
npm run dev:host
```

터미널에 표시되는 `Network` 주소를 스마트폰 브라우저에서 엽니다.

예시:

```text
http://192.168.0.12:5173/
```

주의:
일반 HTTP 주소에서는 모바일 카메라/GPS 권한이 제한될 수 있습니다.
Plan, 지도, 정보 물어보기 화면 확인용으로 사용하고, 카메라/GPS 테스트는 HTTPS 방식으로 진행하는 것을 권장합니다.

## 7. 모바일 카메라/GPS 테스트

모바일 카메라와 GPS는 보안 연결인 HTTPS에서 가장 안정적으로 허용됩니다.
로컬에서 테스트할 때는 ngrok 사용을 권장합니다.

1. 개발 서버를 외부 접속 가능 모드로 실행합니다.

```powershell
npm run dev:host
```

2. 터미널에 표시된 포트를 확인합니다.

예시:

```text
Local:   http://127.0.0.1:5173/
Network: http://192.168.0.12:5173/
```

3. ngrok을 실행합니다.

```powershell
ngrok http 5173
```

포트가 `5175`라면 아래처럼 실행합니다.

```powershell
ngrok http 5175
```

4. ngrok이 제공하는 HTTPS 주소를 스마트폰에서 엽니다.

예시:

```text
https://example-name.ngrok-free.app/
```

5. 카메라 길안내는 아래 해시 주소로 바로 이동할 수 있습니다.

```text
https://example-name.ngrok-free.app/#camera
```

## 8. 주요 화면

```text
/#plan    새 여행 만들기, 장소 선택, AI 플랜 생성
/#routes  출발지/도착지 설정, 지도 경로 확인, 이동 취향 선택
/#extras  정보 물어보기, 여행 가이드형 질문 응답
/#trips   저장한 여행 플랜 확인
/#camera  모바일 후면카메라 기반 길안내
```

## 9. 배포 URL 접근 제한

Vercel 배포를 사용할 경우 일반 URL로 아무나 접속하지 못하도록 `COOLPATH_ACCESS_TOKEN`을 설정합니다.

Vercel 환경변수에 아래 값을 추가합니다.

```text
COOLPATH_ACCESS_TOKEN=24자_이상_랜덤토큰
```

팀원에게는 아래 형태의 링크를 공유합니다.

```text
https://배포주소.vercel.app/?access=COOLPATH_ACCESS_TOKEN에_넣은_값
```

최초 접속 후에는 7일 동안 보안 쿠키가 유지됩니다.
토큰이 유출되면 Vercel 환경변수 값을 바꾸고 Redeploy하면 됩니다.

## 10. 정상 동작 확인

개발 서버 실행 후 아래 항목을 확인합니다.

- Plan 탭에서 AI 플랜 생성 버튼이 동작하는지 확인
- 지도 탭에서 지도 이미지와 경로 선이 보이는지 확인
- 출발지/도착지 검색이 동작하는지 확인
- 정보 물어보기에서 답변이 돌아오는지 확인
- 모바일 HTTPS 주소에서 카메라 권한 요청이 뜨는지 확인
- 카메라 화면에서 후면카메라가 켜지는지 확인

API 연결 상태는 아래 주소에서 확인할 수 있습니다.

```text
http://127.0.0.1:5173/api/env-status
```

정상 예시:

```json
{
  "weather": true,
  "maps": true,
  "openai": true
}
```

## 11. 빌드 확인

배포 전에 production 빌드가 되는지 확인합니다.

```powershell
npm run build
```

성공하면 `dist` 폴더가 생성됩니다.

빌드된 결과를 로컬에서 확인하려면 아래 명령을 사용합니다.

```powershell
npm run preview
```

## 12. 자주 발생하는 문제

### 지도가 안 보이는 경우

`.env.local`의 `VITE_MAP_API_KEY`가 있는지 확인합니다.
Google Cloud Console에서 Static Maps API와 Geocoding API가 활성화되어 있어야 합니다.

### 날씨가 안 불러와지는 경우

`.env.local`의 `VITE_WEATHER_API_KEY`와 `VITE_WEATHER_PROVIDER`를 확인합니다.
현재 기본값은 `google`입니다.

### AI 답변이 안 오는 경우

`.env.local`의 `OPENAI_API_KEY`가 있는지 확인합니다.
또한 `OPENAI_MODEL` 값이 사용 가능한 모델인지 확인합니다.

### 모바일에서 카메라가 안 켜지는 경우

HTTP 주소에서는 카메라/GPS 권한이 제한될 수 있습니다.
ngrok HTTPS 주소 또는 Vercel 배포 주소에서 접속합니다.

### 전면카메라가 켜지는 경우

브라우저 권한을 초기화한 뒤 다시 접속합니다.
이 프로젝트는 후면카메라 `facingMode: environment`를 우선 요청합니다.

### 포트가 다르게 뜨는 경우

Vite는 기본 포트가 사용 중이면 `5174`, `5175`처럼 다른 포트를 사용할 수 있습니다.
터미널에 표시되는 실제 주소를 기준으로 접속합니다.

## 13. GitHub 반영 순서

작업 후 아래 순서로 반영합니다.

```powershell
git status
git add .
git commit -m "작업 내용 요약"
git push origin main
```

단, `.env.local`은 절대 커밋하지 않습니다.

## 14. 프로젝트 구조

```text
api/                  Vercel 배포용 API Functions
docs/                 팀 공유 문서
public/               정적 파일
server/               API 공용 로직
src/                  React 프론트엔드
src/data/             파리 장소 데이터
src/services/         API 호출 및 경로 추천 로직
vite.config.js        Vite 설정 및 로컬 API 미들웨어
vercel.json           Vercel 배포 설정
middleware.js         배포 접근 제한 미들웨어
```

## 15. 팀원에게 전달할 최소 실행 요약

```powershell
git clone https://github.com/ts825360/stt-ai-pivot-ai-tts-ai.git
cd stt-ai-pivot-ai-tts-ai
npm install
Copy-Item .env.example .env.local
notepad .env.local
npm run dev
```

브라우저에서:

```text
http://127.0.0.1:5173/
```

모바일 카메라/GPS까지 확인하려면:

```powershell
npm run dev:host
ngrok http 5173
```

ngrok이 알려준 HTTPS 주소를 스마트폰에서 엽니다.
