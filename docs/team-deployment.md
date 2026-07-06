# CoolPath AI 팀 공유 배포 가이드

## 목표

팀원이 언제든 같은 URL로 CoolPath AI 모바일 프로토타입을 확인할 수 있도록 Vercel에 배포한다.
로컬 개발 서버나 ngrok 주소에 의존하지 않는다.

## 권장 방식

Vercel에 GitHub 저장소를 연결한다.

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- API Functions: `/api/*.js`

현재 프로젝트에는 `vercel.json`과 배포용 API Functions가 추가되어 있어 Vercel에서 정적 프론트엔드와 서버 API가 함께 동작한다.

## Vercel 환경변수

Vercel 프로젝트의 Settings > Environment Variables에 아래 값을 등록한다.
값은 `.env.local`에 있는 실제 키를 복사하되, GitHub에는 절대 올리지 않는다.

```text
VITE_WEATHER_API_KEY=
VITE_WEATHER_PROVIDER=google
VITE_MAP_API_KEY=
VITE_GOOGLE_MAPS_REFERRER=https://배포도메인.vercel.app/
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=low
OPENAI_TEXT_VERBOSITY=low
```

## 배포 후 확인할 URL

```text
https://배포도메인.vercel.app/#plan
https://배포도메인.vercel.app/#routes
https://배포도메인.vercel.app/#extras
https://배포도메인.vercel.app/#trips
https://배포도메인.vercel.app/#camera
```

## 배포 후 필수 확인

1. `/api/env-status`에 접속해 `weather`, `maps`, `openai`가 모두 `true`인지 확인한다.
2. Plan 탭에서 AI 플랜 생성 버튼을 눌렀을 때 지도 미리보기가 뜨는지 확인한다.
3. 지도 탭에서 출발지/도착지 검색과 지도 선택이 동작하는지 확인한다.
4. 정보 물어보기에서 질문 응답이 돌아오는지 확인한다.
5. 모바일 HTTPS 주소에서 카메라와 GPS 권한 요청이 뜨는지 확인한다.

## 주의

- `.env.local`은 `.gitignore`에 포함되어 있으므로 GitHub에 올리면 안 된다.
- Google Maps API 키가 HTTP referrer 제한을 쓰고 있다면 Vercel 배포 도메인을 허용 도메인에 추가해야 한다.
- 환경변수를 새로 넣거나 수정한 뒤에는 Vercel에서 Redeploy해야 변경 사항이 적용된다.
