# 냉파고 (FRIDGEPAGO)

> **냉장고 속 재료가 최고의 요리가 되는 순간**
> 자취생과 1인 가구를 위한 스마트 식재료 관리 · AI 맞춤 레시피 추천 · 유통기한 및 식비 절약 관리 웹서비스

---

## 주요 기능

1. **대시보드**: 등록 식재료 현황, 소비기한 확인 필요 품목, 이번 달 실제 절약 금액, 소비 우선순위 식재료 및 오늘의 추천 레시피 3선 한눈에 보기
2. **내 냉장고**: 식재료 직접 등록/수정/삭제, 카테고리·보관장소 필터, 중복 식재료 수량 합산/별도 등록 선택, **Gemini 비전 기반 사진 식재료 자동 인식 및 검수 등록**
3. **AI 레시피 추천**: 냉장고 보유 재료 및 임박 재료 우선 활용 3종 맞춤 레시피 생성, 보유 재료·부족 재료·기본 양념 엄격 분리, 알레르기·기피 재료 제외, 부족 재료 원클릭 장보기 전송
4. **유통기한 관리**: 남은 일수(D-Day) 자동 계산, `임박` · `여유` · `날짜 확인 필요` 상태 분류, 부분/전량 소비 완료 처리 및 폐기 연동, 식품 안전 주의 안내
5. **장보기 리스트**: 미구매/구매 완료 분리, 예상 금액 합산, 레시피 부족 재료 불러오기, 구매 완료 품목 냉장고 재고 일괄 입고 및 식비 지출 연동
6. **절약 리포트**: 월별 식재료 구매 비용·폐기 손실·레시피 활용 절약 내역 기록, 지난달 대비 비교 차트, 카테고리별 지출 비중 시각화 및 **Gemini AI 월간 식비 분석 요약**

---

## 기술 스택

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Backend**: Node.js, Express (`server.ts` 서버 측 API 프록시)
- **AI SDK**: `@google/genai` (`gemini-3.8-flash`, Structured JSON Schema)
- **Persistence**: 브라우저 `LocalStorage` 기반 영속 저장 (손상 복구 및 샘플 데이터 분리 지원)

---

## 환경변수 설정 및 API 키 보안 안내

본 프로젝트는 **서버 전용 비밀 키(`GEMINI_API_KEY`)와 클라이언트 Firebase 웹 설정(`VITE_FIREBASE_*`)을 엄격히 분리**하여 관리합니다.

### 1. 서버 전용 비밀 키 (`GEMINI_API_KEY`)
- 모든 Gemini AI 요청(사진 식재료 인식, 맞춤 레시피 추천, 월간 식비 요약, 최저가 구매처 추천, 낭비 원인 진단, 맞춤 미션 생성)은 백엔드 서버(`server.ts`)에서만 실행되며, **검증된 앱 소유자 Google 계정의 Firebase RS256 ID 토큰**이 확인된 요청만 허용됩니다.
- `GEMINI_API_KEY`에는 절대 `VITE_` 접두사를 붙이지 마세요(`vite.config.ts`에서 `envPrefix: ['VITE_']` 및 `sourcemap: false` 적용).
- Google AI Studio 환경에서는 **Settings > Secrets** 패널을 통해 서버 런타임 환경변수(`process.env.GEMINI_API_KEY`)로만 주입됩니다.

### 2. Firebase 웹 설정 및 키 제한 안내
- 로컬/외부 배포 시 `.env`의 `VITE_FIREBASE_*` 환경변수(또는 Git 추적에서 제외된 로컬 `firebase-applet-config.json`)를 사용합니다.
- `.gitignore`를 통해 `.env*`, `firebase-applet-config.js`, `firebase-applet-config.json`, 서비스 계정 키 파일이 GitHub에 커밋되지 않도록 차단되어 있습니다(예시 템플릿은 `.env.example`, `firebase-applet-config.example.json` 참고).
- Firebase 웹 `apiKey`는 Google Cloud 콘솔(`APIs & Services > Credentials`)에서 **애플리케이션 제한(HTTP 리퍼러)** 및 **API 제한(Identity Toolkit API, Token Service API, Cloud Firestore API, Firebase Installations API만 허용)**을 반드시 적용하세요.

### 3. 로컬 개발 환경 실행 방법

```bash
# 1) 환경변수 템플릿 복사 후 값 입력 (.env는 Git 추적 제외됨)
cp .env.example .env

# 2) 의존성 설치 및 개발 서버 실행 (포트 3000)
npm install
npm run dev

# 3) 프로덕션 빌드 및 실행
npm run build
NODE_ENV=production npm start
```

### 4. 미인증 / 오프라인 동작 안내
- 로그인하지 않거나 외부 키가 설정되지 않은 환경에서도 **식재료 등록/수정/삭제, 유통기한 관리, 미니게임 미션, 장보기 리스트, 절약 리포트 계산 등 핵심 기능은 브라우저 LocalStorage 기반으로 정상 작동**합니다.

