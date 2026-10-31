import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-3.8-flash';

const DEFAULT_OWNER_EMAIL = 'jseongho92@gmail.com';
const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function loadFirebaseProjectId(): string {
  const envCandidates = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.VITE_FIREBASE_PROJECT_ID,
  ];
  for (const candidate of envCandidates) {
    const trimmed = candidate?.trim();
    if (
      trimmed &&
      !trimmed.startsWith('YOUR_') &&
      !trimmed.startsWith('MY_')
    ) {
      return trimmed;
    }
  }
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    if (
      parsed.projectId &&
      typeof parsed.projectId === 'string' &&
      parsed.projectId.trim() &&
      !parsed.projectId.trim().startsWith('YOUR_')
    ) {
      return parsed.projectId.trim();
    }
  } catch {
    // Fallback to provisioned Firebase project ID
  }
  return 'influential-harmony-r4mm2';
}

const FIREBASE_PROJECT_ID = loadFirebaseProjectId();

function buildAllowedOwnerEmails(): Set<string> {
  const allowed = new Set<string>([DEFAULT_OWNER_EMAIL.toLowerCase()]);
  const rawEnv = process.env.ALLOWED_OWNER_EMAIL?.trim();
  if (rawEnv && rawEnv !== 'OWNER_GOOGLE_EMAIL' && rawEnv !== 'MY_OWNER_EMAIL') {
    for (const entry of rawEnv.split(',')) {
      const normalized = entry.trim().toLowerCase();
      if (normalized && normalized.includes('@')) {
        allowed.add(normalized);
      }
    }
  }
  return allowed;
}

const ALLOWED_OWNER_EMAILS = buildAllowedOwnerEmails();

export function redactSecrets(input: string): string {
  if (!input) return '';
  let scrubbed = input;
  const rawKey = process.env.GEMINI_API_KEY?.trim();
  if (rawKey && rawKey.length >= 8 && rawKey !== 'MY_GEMINI_API_KEY') {
    scrubbed = scrubbed.split(rawKey).join('[REDACTED_SECRET]');
  }
  scrubbed = scrubbed.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]');
  return scrubbed;
}

let cachedGoogleCerts: Record<string, string> | null = null;
let cachedGoogleCertsExpiresAt = 0;
let lastGoogleCertFetchAt = 0;

async function getGoogleSecureTokenCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedGoogleCerts && now < cachedGoogleCertsExpiresAt) {
    return cachedGoogleCerts;
  }
  if (forceRefresh && cachedGoogleCerts && now - lastGoogleCertFetchAt < 60_000) {
    return cachedGoogleCerts;
  }

  const response = await fetch(GOOGLE_SECURETOKEN_CERTS_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`CERT_FETCH_FAILED_${response.status}`);
  }

  const certs = (await response.json()) as Record<string, string>;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1]) || 3600) : 3600;

  cachedGoogleCerts = certs;
  cachedGoogleCertsExpiresAt = now + maxAgeSeconds * 1000;
  lastGoogleCertFetchAt = now;
  return certs;
}

interface VerifiedOwnerResult {
  ok: true;
  uid: string;
  email: string;
}

interface RejectedOwnerResult {
  ok: false;
  status: number;
  code: string;
  message: string;
}

type OwnerAuthVerification = VerifiedOwnerResult | RejectedOwnerResult;

async function verifyOwnerFirebaseIdToken(
  authHeader: string | undefined
): Promise<OwnerAuthVerification> {
  if (!authHeader || typeof authHeader !== 'string') {
    return {
      ok: false,
      status: 401,
      code: 'OWNER_AUTH_REQUIRED',
      message:
        '소유자 인증이 필요합니다. 상단의 서버 저장 연결(Google 로그인) 버튼으로 등록된 소유자 계정에 로그인한 뒤 AI 기능을 이용해주세요.',
    };
  }

  if (authHeader.length > 16_384) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_AUTH_TOKEN',
      message: '유효하지 않은 인증 토큰 형식입니다. 다시 로그인한 뒤 시도해주세요.',
    };
  }

  const match = authHeader.match(
    /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/
  );
  if (!match) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_AUTH_TOKEN',
      message: '인증 토큰이 누락되었거나 형식이 올바르지 않습니다. 소유자 계정으로 다시 로그인해주세요.',
    };
  }

  const [, encodedHeader, encodedPayload, encodedSignature] = match;

  let header: { alg?: unknown; kid?: unknown };
  let payload: {
    aud?: unknown;
    iss?: unknown;
    sub?: unknown;
    exp?: unknown;
    iat?: unknown;
    email?: unknown;
    email_verified?: unknown;
  };

  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as {
      alg?: unknown;
      kid?: unknown;
    };
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      aud?: unknown;
      iss?: unknown;
      sub?: unknown;
      exp?: unknown;
      iat?: unknown;
      email?: unknown;
      email_verified?: unknown;
    };
  } catch {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_AUTH_TOKEN',
      message: '인증 토큰을 해석할 수 없습니다. 다시 로그인해주세요.',
    };
  }

  if (
    header.alg !== 'RS256' ||
    typeof header.kid !== 'string' ||
    header.kid.length === 0 ||
    header.kid.length > 128
  ) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_AUTH_TOKEN',
      message: '서명 알고리즘이 유효하지 않은 인증 토큰입니다.',
    };
  }

  let certPem: string | undefined;
  try {
    let certs = await getGoogleSecureTokenCerts(false);
    certPem = certs[header.kid];
    if (!certPem) {
      certs = await getGoogleSecureTokenCerts(true);
      certPem = certs[header.kid];
    }
  } catch {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_VERIFIER_UNAVAILABLE',
      message: '인증 서버 공개키를 확인하는 중 일시적인 네트워크 지연이 발생했습니다. 잠시 후 다시 시도해주세요.',
    };
  }

  if (!certPem) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_AUTH_TOKEN',
      message: '만료되었거나 신뢰할 수 없는 서명 키입니다. 다시 로그인해주세요.',
    };
  }

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const signatureBuf = Buffer.from(encodedSignature, 'base64url');
    if (!verifier.verify(certPem, signatureBuf)) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_AUTH_SIGNATURE',
        message: '인증 토큰 서명 검증에 실패했습니다. 다시 로그인해주세요.',
      };
    }
  } catch {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_AUTH_SIGNATURE',
      message: '인증 토큰 서명 검증 중 오류가 발생했습니다.',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

  if (
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec - 15 ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSec + 60 ||
    payload.aud !== FIREBASE_PROJECT_ID ||
    payload.iss !== expectedIssuer ||
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0 ||
    payload.sub.length > 128
  ) {
    return {
      ok: false,
      status: 401,
      code: 'EXPIRED_OR_INVALID_CLAIMS',
      message: '로그인 세션이 만료되었거나 프로젝트 정보가 일치하지 않습니다. 다시 로그인해주세요.',
    };
  }

  if (payload.email_verified !== true || typeof payload.email !== 'string' || !payload.email.trim()) {
    return {
      ok: false,
      status: 403,
      code: 'UNVERIFIED_EMAIL',
      message: '이메일 인증이 완료된 소유자 Google 계정만 이용할 수 있습니다.',
    };
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  if (!ALLOWED_OWNER_EMAILS.has(normalizedEmail)) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_NOT_OWNER',
      message:
        '접근 차단됨: 등록된 앱 소유자 계정만 AI 기능을 호출할 수 있습니다. 다른 사용자는 소유자의 API 키를 사용할 수 없습니다.',
    };
  }

  return {
    ok: true,
    uid: payload.sub,
    email: normalizedEmail,
  };
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const ownerRequestLog = new Map<string, number[]>();

function checkOwnerRateLimit(uid: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (ownerRequestLog.get(uid) ?? []).filter((ts) => ts > windowStart);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    ownerRequestLog.set(uid, recent);
    return false;
  }
  recent.push(now);
  ownerRequestLog.set(uid, recent);
  return true;
}

const SENSITIVE_SERVER_PATH_REGEX =
  /^\/(?:\.env(?:\..+)?|\.git(?:\/.*)?|server\.(?:ts|js)|firestore\.rules(?:\.test\.ts)?|DRAFT_firestore\.rules|firebase-blueprint\.json|firebase-applet-config\.js|security_spec\.md)$/i;

const VALID_CATEGORIES = [
  '채소',
  '과일',
  '육류',
  '해산물',
  '유제품',
  '알류',
  '곡류',
  '가공식품',
  '기타',
];

const VALID_STORAGES = ['냉장', '냉동', '실온'];

const BASIC_SEASONING_KEYWORDS = [
  '물',
  '식용유',
  '올리브유',
  '참기름',
  '들기름',
  '소금',
  '설탕',
  '후추',
  '간장',
  '진간장',
  '국간장',
  '고춧가루',
  '고추장',
  '된장',
  '다진마늘',
  '마늘',
  '통깨',
  '깨',
  '식초',
  '맛술',
  '올리고당',
  '물엿',
];

function isApiKeyConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 10);
}

function createGeminiClient(): GoogleGenAI | null {
  if (!isApiKeyConfigured()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isNonRetryable =
        msg.includes('400') ||
        msg.includes('401') ||
        msg.includes('403') ||
        msg.includes('404') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('PERMISSION_DENIED');
      if (isNonRetryable || attempt === maxRetries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 700 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

function classifyGeminiError(err: unknown): { status: number; code: string; message: string } {
  const raw = redactSecrets(err instanceof Error ? err.message : String(err));
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403')) {
    return {
      status: 403,
      code: 'INVALID_API_KEY',
      message:
        'Gemini API 키가 유효하지 않거나 권한이 없습니다. AI Studio의 Settings > Secrets 패널에서 API 키 설정을 확인해주세요.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message:
        'AI 요청 한도를 일시적으로 초과했습니다. 잠시 후 다시 시도하거나 Settings > Secrets 패널에서 결제 연동 API 키를 확인해주세요.',
    };
  }
  return {
    status: 502,
    code: 'UPSTREAM_ERROR',
    message: 'AI 서버 응답 처리 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  };
}

function safeJsonParse<T>(rawText: string | undefined): T | null {
  if (!rawText) return null;
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function normalizeIngredientToken(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

function matchesOwnedFridgeItem(candidateName: string, fridgeNames: string[]): boolean {
  const normCandidate = normalizeIngredientToken(candidateName);
  if (!normCandidate) return false;
  return fridgeNames.some((fn) => {
    const normFridge = normalizeIngredientToken(fn);
    if (!normFridge) return false;
    return (
      normCandidate === normFridge ||
      normCandidate.includes(normFridge) ||
      normFridge.includes(normCandidate)
    );
  });
}

function isBasicSeasoning(name: string): boolean {
  const norm = normalizeIngredientToken(name);
  return BASIC_SEASONING_KEYWORDS.some((kw) => norm === kw || norm.endsWith(kw));
}

interface FridgeInputItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  storage: string;
  expiryDate?: string;
  daysRemaining?: number | null;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

  // Global security headers & sensitive server/config file access blocker
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(req.path);
    } catch {
      res.status(400).end();
      return;
    }

    if (SENSITIVE_SERVER_PATH_REGEX.test(decodedPath)) {
      res.status(404).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  // Prevent caching of any API response
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  // Status check: never reveals secrets or emails; indicates whether caller is authenticated as owner
  app.get('/api/ai/status', async (req: Request, res: Response) => {
    const configured = isApiKeyConfigured();
    let authorized = false;
    if (req.headers.authorization) {
      const verification = await verifyOwnerFirebaseIdToken(req.headers.authorization);
      authorized = verification.ok;
    }
    res.json({
      configured,
      authorized,
      ownerOnly: true,
    });
  });

  // Mandatory Owner-Only Gate + Cross-Site Guard + Rate Limiter for ALL /api/ai/* invocations
  app.use('/api/ai', async (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && req.path === '/status') {
      next();
      return;
    }

    if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({
        code: 'FORBIDDEN_CROSS_SITE',
        message: '외부 사이트에서의 교차 출처 AI 호출은 차단되어 있습니다.',
      });
      return;
    }

    const verification = await verifyOwnerFirebaseIdToken(req.headers.authorization);
    if (!verification.ok) {
      res.status(verification.status).json({
        code: verification.code,
        message: verification.message,
      });
      return;
    }

    if (!checkOwnerRateLimit(verification.uid)) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: '단시간 내 과도한 AI 호출이 감지되어 보호 잠금이 작동했습니다. 1분 후 다시 시도해주세요.',
      });
      return;
    }

    next();
  });

  // Feature A: Image Ingredient Recognition
  app.post('/api/ai/recognize-ingredients', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'AI_NOT_CONFIGURED',
        message:
          '현재 서버에 Gemini API 키가 연결되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 설정하면 사진 식재료 자동 인식을 사용할 수 있습니다.',
      });
      return;
    }

    const { imageBase64, mimeType } = req.body ?? {};
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: '분석할 이미지 데이터가 전달되지 않았습니다.',
      });
      return;
    }

    if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
      res.status(400).json({
        code: 'INVALID_MIME',
        message: 'JPG, PNG, WEBP 형식의 이미지만 분석할 수 있습니다.',
      });
      return;
    }

    // Approx base64 byte check (~10MB limit)
    if (imageBase64.length > 14_000_000) {
      res.status(400).json({
        code: 'FILE_TOO_LARGE',
        message: '이미지 용량이 너무 큽니다. 8MB 이하의 사진을 업로드해주세요.',
      });
      return;
    }

    try {
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              {
                text: `업로드된 냉장고 또는 장보기 사진에서 식별 가능한 식재료 목록을 분석하여 한국어 JSON으로 반환하세요.
규칙:
1. 사진에서 실제로 보이는 식재료만 추출하세요. 식재료가 아닌 용기, 배경 사물은 제외하세요.
2. 포장지나 가려짐으로 인해 품목이 불확실한 경우 confidence를 반드시 "low"로 지정하고 note에 이유를 적으세요.
3. 사진만으로 소비기한이나 신선도를 절대 단정하거나 확정하지 마세요.
4. category는 반드시 다음 중 하나만 사용하세요: 채소, 과일, 육류, 해산물, 유제품, 알류, 곡류, 가공식품, 기타.
5. recommendedStorage는 반드시 다음 중 하나만 사용하세요: 냉장, 냉동, 실온.`,
              },
            ],
          },
          config: {
            systemInstruction:
              '당신은 한국 자취생의 식재료 관리를 돕는 정확한 식품 비전 분석 도우미입니다. 확인되지 않은 정보를 추측하지 않고, 사진만으로 신선도나 소비기한을 단정하지 않습니다.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description: '식재료 한국어 이름 (예: 애호박, 달걀, 우유)',
                      },
                      estimatedQuantity: {
                        type: Type.NUMBER,
                        description: '추정 수량 (숫자, 최소 1)',
                      },
                      unit: {
                        type: Type.STRING,
                        description: '단위 (개, 모, 단, 팩, 봉, 병 등)',
                      },
                      category: {
                        type: Type.STRING,
                        description:
                          '채소, 과일, 육류, 해산물, 유제품, 알류, 곡류, 가공식품, 기타 중 하나',
                      },
                      recommendedStorage: {
                        type: Type.STRING,
                        description: '냉장, 냉동, 실온 중 하나',
                      },
                      confidence: {
                        type: Type.STRING,
                        description: 'high, medium, low 중 하나',
                      },
                      note: {
                        type: Type.STRING,
                        description: '인식 참고 메모 또는 확인 필요 사항',
                      },
                    },
                    required: [
                      'name',
                      'estimatedQuantity',
                      'unit',
                      'category',
                      'recommendedStorage',
                      'confidence',
                      'note',
                    ],
                  },
                },
                safetyNotice: {
                  type: Type.STRING,
                  description: '사진만으로는 소비기한과 신선도를 확정할 수 없다는 식품 안전 안내문',
                },
              },
              required: ['items', 'safetyNotice'],
            },
          },
        })
      );

      const parsed = safeJsonParse<{
        items: Array<{
          name: string;
          estimatedQuantity: number;
          unit: string;
          category: string;
          recommendedStorage: string;
          confidence: string;
          note: string;
        }>;
        safetyNotice: string;
      }>(response.text);

      if (!parsed || !Array.isArray(parsed.items)) {
        res.status(502).json({
          code: 'PARSE_ERROR',
          message: 'AI 인식 결과를 해석하는 중 오류가 발생했습니다. 다시 시도해주세요.',
        });
        return;
      }

      const sanitizedItems = parsed.items
        .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 0)
        .map((item) => ({
          name: item.name.trim(),
          estimatedQuantity:
            typeof item.estimatedQuantity === 'number' && item.estimatedQuantity > 0
              ? Math.round(item.estimatedQuantity * 10) / 10
              : 1,
          unit: item.unit?.trim() || '개',
          category: VALID_CATEGORIES.includes(item.category) ? item.category : '기타',
          recommendedStorage: VALID_STORAGES.includes(item.recommendedStorage)
            ? item.recommendedStorage
            : '냉장',
          confidence: ['high', 'medium', 'low'].includes(item.confidence)
            ? item.confidence
            : 'medium',
          note: item.note?.trim() || '등록 전 품목과 수량, 실제 소비기한을 직접 확인해주세요.',
        }));

      res.json({
        items: sanitizedItems,
        safetyNotice:
          parsed.safetyNotice?.trim() ||
          '사진 인식만으로는 실제 소비기한이나 부패 여부를 확정할 수 없습니다. 포장 표기 소비기한과 식재료 상태를 직접 확인한 뒤 등록해주세요.',
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        code: classified.code,
        message: classified.message,
      });
    }
  });

  // Feature B: AI Recipe Recommendation
  app.post('/api/ai/recommend-recipes', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'AI_NOT_CONFIGURED',
        message:
          '현재 서버에 Gemini API 키가 연결되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 설정하면 AI 맞춤 레시피 생성을 사용할 수 있습니다.',
      });
      return;
    }

    const {
      ingredients = [],
      mustUseIngredients = [],
      cuisine = '자유 선택',
      cookingTime = '제한 없음',
      difficulty = '쉬움',
      minimizeExtraShopping = true,
      allergiesAndDislikes = [],
      chefSecretMode = 'none',
    } = req.body ?? {};

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      res.status(400).json({
        code: 'NO_INGREDIENTS',
        message: '냉장고에 등록된 식재료가 없습니다. 식재료를 먼저 등록해주세요.',
      });
      return;
    }

    const typedIngredients: FridgeInputItem[] = ingredients.map((item: FridgeInputItem) => ({
      name: String(item.name || '').trim(),
      quantity: Number(item.quantity) || 1,
      unit: String(item.unit || '개').trim(),
      category: String(item.category || '기타').trim(),
      storage: String(item.storage || '냉장').trim(),
      expiryDate: item.expiryDate ? String(item.expiryDate) : '',
      daysRemaining: typeof item.daysRemaining === 'number' ? item.daysRemaining : null,
    }));

    const fridgeNames = typedIngredients.map((i) => i.name).filter(Boolean);

    const inventoryDescription = typedIngredients
      .map((item) => {
        const expiryInfo =
          typeof item.daysRemaining === 'number'
            ? item.daysRemaining < 0
              ? `소비기한 ${Math.abs(item.daysRemaining)}일 경과(상태 확인 필수)`
              : item.daysRemaining === 0
              ? '오늘 소비기한 마감(최우선 활용)'
              : `남은 기간 ${item.daysRemaining}일`
            : '소비기한 미입력';
        return `- ${item.name} (${item.quantity}${item.unit}, ${item.category}, ${item.storage}, ${expiryInfo})`;
      })
      .join('\n');

    const secretModeInstruction =
      chefSecretMode === 'omakase'
        ? '\n- [냉파 마스터 등급 특전 활성화 — 무지출 냉장고 오마카세 모드]: 추가 구매 없이 현재 보유 식재료만으로 1) 입맛을 돋우는 애피타이저/전채 요리, 2) 든든한 메인 일품 요리, 3) 따뜻한 국물 또는 곁들임 사이드 메뉴로 서로 조화로운 3품 코스처럼 3개의 레시피를 설계하고 조리 팁에 플레이팅 비법을 덧붙이세요.'
        : chefSecretMode === 'onepan'
        ? '\n- [냉파 고수 등급 특전 활성화 — 원팬·설거지 최소화 시크릿 모드]: 도마와 설거지를 최소화할 수 있도록 팬 또는 냄비 단 1개(원팬/원팟)로 끝내는 조리 순서를 설계하고, 마지막 단계에 남은 자투리 재료를 남김없이 쓰는 고수 비법을 포함하세요.'
        : '';

    const promptText = `다음은 1인 가구 사용자의 현재 냉장고 보유 식재료 목록과 요리 조건입니다. 실제로 맛있게 조리 가능한 현실적인 레시피 3개를 한국어 JSON으로 추천해주세요.

[현재 보유 식재료 목록 (이 목록에 있는 재료만 보유 재료로 인정)]
${inventoryDescription}

[사용자 요청 조건]
- 반드시 포함할 희망 재료: ${
      Array.isArray(mustUseIngredients) && mustUseIngredients.length > 0
        ? mustUseIngredients.join(', ')
        : '특별 지정 없음 (임박 재료 우선 활용)'
    }
- 희망 음식 종류: ${cuisine}
- 희망 조리 시간: ${cookingTime}
- 희망 난이도: ${difficulty}
- 추가 구매 재료 최소화 여부: ${minimizeExtraShopping ? '예 (보유 재료와 기본 양념 위주로 구성)' : '아니오 (필요 시 소량의 추가 재료 허용)'}
- 알레르기 및 기피 식재료 (절대 사용 금지): ${
      Array.isArray(allergiesAndDislikes) && allergiesAndDislikes.length > 0
        ? allergiesAndDislikes.join(', ')
        : '없음'
    }${secretModeInstruction}

[필수 준수 규칙]
1. 반드시 위 [현재 보유 식재료 목록]에 실제로 존재하는 식재료만 ownedIngredients에 넣으세요. 보유 목록에 없는 재료는 절대 ownedIngredients에 넣지 마세요.
2. 물, 소금, 설탕, 간장, 고추장, 된장, 고춧가루, 식용유, 참기름, 후추, 다진마늘 등 기본 양념/물은 basicSeasonings 배열로 별도 구분하세요.
3. 보유 목록에도 없고 기본 양념도 아닌 추가 필요 식재료는 반드시 missingIngredients 배열에 명확히 분리하세요.
4. 소비기한이 임박한 식재료를 우선 활용하되, 소비기한이 지난 식재료가 포함된 경우 사용 전 냄새·색·상태를 반드시 확인하라는 식품 안전 주의사항을 safetyAndAllergyNote에 명시하세요.
5. 알레르기 및 기피 식재료는 주재료뿐 아니라 부재료·양념에서도 완전히 제외하세요.`;

    try {
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: promptText,
          config: {
            systemInstruction:
              '당신은 1인 가구와 자취생을 위한 실용 요리 전문 셰프입니다. 보유하지 않은 재료를 보유 중이라고 절대 허위 표기하지 않으며, 식품 안전과 알레르기 수칙을 철저히 지킵니다.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                recipes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: '요리 이름' },
                      description: { type: Type.STRING, description: '요리 한 줄 소개' },
                      cuisine: {
                        type: Type.STRING,
                        description: '한식, 양식, 중식, 일식, 간편식 중 하나',
                      },
                      cookingTimeMinutes: {
                        type: Type.INTEGER,
                        description: '조리 소요 시간(분 단위 정수)',
                      },
                      difficulty: {
                        type: Type.STRING,
                        description: '쉬움, 보통, 어려움 중 하나',
                      },
                      ownedIngredients: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING, description: '보유 식재료명' },
                            amount: { type: Type.STRING, description: '필요 분량 (예: 1/2개, 2개)' },
                          },
                          required: ['name', 'amount'],
                        },
                      },
                      missingIngredients: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING, description: '부족한 식재료명' },
                            amount: { type: Type.STRING, description: '필요 분량 (예: 100g, 1개)' },
                            category: {
                              type: Type.STRING,
                              description:
                                '채소, 과일, 육류, 해산물, 유제품, 알류, 곡류, 가공식품, 기타 중 하나',
                            },
                            estimatedPrice: {
                              type: Type.INTEGER,
                              description: '1인 가구 소량 구매 시 예상 가격(원 단위 정수)',
                            },
                          },
                          required: ['name', 'amount', 'category', 'estimatedPrice'],
                        },
                      },
                      basicSeasonings: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: '물, 소금, 간장, 식용유 등 기본 양념 목록',
                      },
                      steps: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: '단계별 조리 순서 (번호 제외 문장)',
                      },
                      recommendationReason: {
                        type: Type.STRING,
                        description: '보유 재료 및 소비기한 임박 재료 활용 중심의 추천 이유',
                      },
                      safetyAndAllergyNote: {
                        type: Type.STRING,
                        description: '식품 안전(가열 조리, 상태 확인 등) 및 알레르기 주의사항',
                      },
                    },
                    required: [
                      'title',
                      'description',
                      'cuisine',
                      'cookingTimeMinutes',
                      'difficulty',
                      'ownedIngredients',
                      'missingIngredients',
                      'basicSeasonings',
                      'steps',
                      'recommendationReason',
                      'safetyAndAllergyNote',
                    ],
                  },
                },
              },
              required: ['recipes'],
            },
          },
        })
      );

      const parsed = safeJsonParse<{
        recipes: Array<{
          title: string;
          description: string;
          cuisine: string;
          cookingTimeMinutes: number;
          difficulty: string;
          ownedIngredients: Array<{ name: string; amount: string }>;
          missingIngredients: Array<{
            name: string;
            amount: string;
            category: string;
            estimatedPrice: number;
          }>;
          basicSeasonings: string[];
          steps: string[];
          recommendationReason: string;
          safetyAndAllergyNote: string;
        }>;
      }>(response.text);

      if (!parsed || !Array.isArray(parsed.recipes) || parsed.recipes.length === 0) {
        res.status(502).json({
          code: 'PARSE_ERROR',
          message: 'AI 레시피 응답 형식을 처리하지 못했습니다. 다시 시도해주세요.',
        });
        return;
      }

      // Server-side factual verification: never allow unowned ingredients inside ownedIngredients!
      const verifiedRecipes = parsed.recipes.slice(0, 3).map((recipe, idx) => {
        const verifiedOwned: Array<{ name: string; amount: string }> = [];
        const verifiedMissing: Array<{
          name: string;
          amount: string;
          category: string;
          estimatedPrice: number;
        }> = Array.isArray(recipe.missingIngredients)
          ? recipe.missingIngredients
              .filter((m) => m && m.name && !matchesOwnedFridgeItem(m.name, fridgeNames))
              .map((m) => ({
                name: m.name.trim(),
                amount: m.amount?.trim() || '1개',
                category: VALID_CATEGORIES.includes(m.category) ? m.category : '기타',
                estimatedPrice:
                  typeof m.estimatedPrice === 'number' && m.estimatedPrice >= 0
                    ? Math.round(m.estimatedPrice / 100) * 100
                    : 2500,
              }))
          : [];

        const verifiedSeasonings = new Set<string>(
          Array.isArray(recipe.basicSeasonings)
            ? recipe.basicSeasonings.map((s) => s.trim()).filter(Boolean)
            : []
        );

        for (const item of recipe.ownedIngredients || []) {
          if (!item || !item.name) continue;
          const cleanName = item.name.trim();
          if (matchesOwnedFridgeItem(cleanName, fridgeNames)) {
            verifiedOwned.push({
              name: cleanName,
              amount: item.amount?.trim() || '적당량',
            });
          } else if (isBasicSeasoning(cleanName)) {
            verifiedSeasonings.add(`${cleanName} ${item.amount?.trim() || ''}`.trim());
          } else {
            verifiedMissing.push({
              name: cleanName,
              amount: item.amount?.trim() || '1개',
              category: '기타',
              estimatedPrice: 2500,
            });
          }
        }

        const requiredIngredients = [
          ...verifiedOwned.map((o) => `${o.name} ${o.amount}`),
          ...verifiedMissing.map((m) => `${m.name} ${m.amount}`),
        ];

        return {
          id: `ai-recipe-${Date.now()}-${idx}`,
          title: recipe.title?.trim() || `추천 요리 ${idx + 1}`,
          description: recipe.description?.trim() || '보유 식재료를 활용한 실속 한 끼 메뉴입니다.',
          cuisine: recipe.cuisine?.trim() || cuisine,
          cookingTimeMinutes:
            typeof recipe.cookingTimeMinutes === 'number' && recipe.cookingTimeMinutes > 0
              ? recipe.cookingTimeMinutes
              : 15,
          difficulty: ['쉬움', '보통', '어려움'].includes(recipe.difficulty)
            ? recipe.difficulty
            : difficulty,
          requiredIngredients,
          ownedIngredients: verifiedOwned,
          missingIngredients: verifiedMissing,
          basicSeasonings: Array.from(verifiedSeasonings),
          steps:
            Array.isArray(recipe.steps) && recipe.steps.length > 0
              ? recipe.steps.map((s) => String(s).trim()).filter(Boolean)
              : ['재료를 손질한 뒤 중불에서 알맞게 조리해주세요.'],
          recommendationReason:
            recipe.recommendationReason?.trim() ||
            '현재 냉장고에 보유한 재료를 우선 소진할 수 있도록 구성했습니다.',
          safetyAndAllergyNote:
            recipe.safetyAndAllergyNote?.trim() ||
            '조리 전 식재료의 보관 상태와 소비기한, 개인 알레르기 유발 성분을 반드시 확인하세요.',
          createdAt: new Date().toISOString(),
        };
      });

      res.json({ recipes: verifiedRecipes });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        code: classified.code,
        message: classified.message,
      });
    }
  });

  // Feature C: Monthly Report Summary
  app.post('/api/ai/monthly-summary', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'AI_NOT_CONFIGURED',
        message:
          '현재 서버에 Gemini API 키가 연결되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 설정하면 AI 월간 리포트 심층 분석을 사용할 수 있습니다.',
      });
      return;
    }

    const { targetMonth, currentMonthStats, previousMonthStats } = req.body ?? {};
    if (!targetMonth || !currentMonthStats) {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: '분석할 월간 리포트 데이터가 부족합니다.',
      });
      return;
    }

    const promptText = `사용자가 실제로 기록한 ${targetMonth} 식비 및 식재료 관리 데이터를 바탕으로 사실에 근거한 월간 요약 리포트를 작성해주세요.

[이번 달 (${targetMonth}) 실제 기록 데이터]
- 식재료 구매 총액: ${Number(currentMonthStats.purchaseTotal || 0).toLocaleString('ko-KR')}원 (${Number(
      currentMonthStats.purchaseCount || 0
    )}건)
- 식재료 폐기 손실액: ${Number(currentMonthStats.wasteTotal || 0).toLocaleString('ko-KR')}원 (${Number(
      currentMonthStats.wasteCount || 0
    )}건)
- 냉장고 파먹기 레시피 활용 횟수: ${Number(currentMonthStats.cookedCount || 0)}회
- 기록된 절약 금액: ${Number(currentMonthStats.savedAmount || 0).toLocaleString('ko-KR')}원
- 카테고리별 지출 내역: ${
      Array.isArray(currentMonthStats.categoryBreakdown) &&
      currentMonthStats.categoryBreakdown.length > 0
        ? currentMonthStats.categoryBreakdown
            .map(
              (c: { category: string; amount: number }) =>
                `${c.category} ${Number(c.amount).toLocaleString('ko-KR')}원`
            )
            .join(', ')
        : '기록된 카테고리 지출 없음'
    }

[지난달 비교 기록 데이터]
- 지난달 구매 총액: ${Number(previousMonthStats?.purchaseTotal || 0).toLocaleString('ko-KR')}원
- 지난달 폐기 손실액: ${Number(previousMonthStats?.wasteTotal || 0).toLocaleString('ko-KR')}원
- 지난달 절약 금액: ${Number(previousMonthStats?.savedAmount || 0).toLocaleString('ko-KR')}원

[필수 준수 규칙]
1. 위 기록에 없는 금액이나 가상의 절약 성과를 절대 추측하거나 만들어내지 마세요.
2. 기록 건수가 0인 항목은 "아직 기록되지 않음"을 있는 그대로 반영하여 안내하세요.
3. 1인 가구가 다음 달에 실천할 수 있는 구체적인 장보기·소비기한 관리 제안을 2~3개 작성하세요.`;

    try {
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: promptText,
          config: {
            systemInstruction:
              '당신은 1인 가구 가계부 및 식재료 절약 코치입니다. 오직 사용자가 입력한 수치만을 근거로 분석하며, 없는 성과를 과장하거나 지어내지 않습니다.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                headline: {
                  type: Type.STRING,
                  description: '이번 달 식비 및 절약 현황 핵심 한 줄 요약',
                },
                summaryParagraph: {
                  type: Type.STRING,
                  description: '실제 수치를 반영한 2~3문장의 이해하기 쉬운 요약 설명',
                },
                actionTips: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '실천 가능한 개선 제안 2~3개',
                },
              },
              required: ['headline', 'summaryParagraph', 'actionTips'],
            },
          },
        })
      );

      const parsed = safeJsonParse<{
        headline: string;
        summaryParagraph: string;
        actionTips: string[];
      }>(response.text);

      if (!parsed || !parsed.headline) {
        res.status(502).json({
          code: 'PARSE_ERROR',
          message: 'AI 리포트 요약 응답을 해석하지 못했습니다. 다시 시도해주세요.',
        });
        return;
      }

      res.json({
        headline: parsed.headline.trim(),
        summaryParagraph: parsed.summaryParagraph?.trim() || '',
        actionTips: Array.isArray(parsed.actionTips)
          ? parsed.actionTips.map((t) => String(t).trim()).filter(Boolean)
          : [],
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        code: classified.code,
        message: classified.message,
      });
    }
  });

  // Feature D: Online Lowest-Price Store & Bundle Shipping Recommendation (Google Search Grounding)
  app.post('/api/ai/recommend-stores', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'AI_NOT_CONFIGURED',
        message:
          '현재 서버에 Gemini API 키가 연결되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 설정하면 AI 실시간 최저가 구매처 분석을 사용할 수 있습니다. (개별 쇼핑몰 최저가 바로가기 링크는 즉시 이용 가능합니다)',
      });
      return;
    }

    const { items = [], hasWowMembership = true, hasKurlyMembers = false } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        code: 'NO_ITEMS',
        message: '구매처를 분석할 장보기 품목이 없습니다. 미구매 품목을 먼저 추가해주세요.',
      });
      return;
    }

    const itemLines = items
      .slice(0, 15)
      .map(
        (it: {
          name?: string;
          quantity?: number;
          unit?: string;
          category?: string;
          estimatedPrice?: number;
        }) =>
          `- ${String(it.name || '').trim()} (${Number(it.quantity || 1)}${String(
            it.unit || '개'
          ).trim()}, 카테고리: ${String(it.category || '기타')}, 사용자 예산가: ${Number(
            it.estimatedPrice || 0
          ).toLocaleString('ko-KR')}원)`
      )
      .join('\n');

    const promptText = `다음은 한국 1인 가구 사용자의 장보기 미구매 식재료 목록입니다.
온라인에서 최저가 및 배송비 절약 기준으로 어디서 구매하는 것이 가장 유리한지 한국 주요 온라인 식재료 구매처(쿠팡 로켓프레시/곰곰, 마켓컬리/KF365, 오아시스마켓, SSG닷컴 이마트몰/노브랜드, 네이버쇼핑 산지직송·최저가)를 비교 분석해주세요.

[장보기 품목 목록]
${itemLines}

[사용자 멤버십 보유 상태]
- 쿠팡 와우 멤버십: ${hasWowMembership ? '보유 (로켓프레시 15,000원 이상 무료배송)' : '미보유'}
- 마켓컬리 컬리멤버스: ${hasKurlyMembers ? '보유 (20,000원 이상 무료배송 쿠폰 활용 가능)' : '미보유 (기본 40,000원 이상 무료배송)'}

[응답 형식 규칙]
반드시 아래 키 구조를 가진 순수 JSON 객체만 출력하세요 (마크다운 코드블록 없이 JSON만 출력):
{
  "primaryRecommendedMall": "이번 장바구니 묶음 구매 1순위 추천 몰 이름 (예: 쿠팡 로켓프레시, 마켓컬리, 오아시스마켓 등)",
  "overallStrategy": "장바구니 전체 총액과 배송비를 고려했을 때 한 곳에서 묶음 배송받는 것이 유리한지, 특정 대용량 품목만 분리 구매할지 2~3문장으로 명확히 설명",
  "bundleShippingTip": "무료배송 기준 금액 충족 여부와 배송비(약 3,000원)를 아끼기 위한 구체적인 1인 가구 장보기 팁",
  "itemGuides": [
    {
      "itemName": "품목명",
      "bestStore": "추천 구매처 (예: 마켓컬리 KF365, 쿠팡 곰곰, 오아시스마켓, 네이버쇼핑 최저가 등)",
      "reason": "해당 쇼핑몰의 PB 상품이나 소포장·특가 측면에서 저렴한 이유",
      "searchKeyword": "해당 몰에서 최저가로 찾기 좋은 구체적 검색어 (예: 곰곰 국내산 애호박, KF365 국산콩 두부)",
      "estimatedPriceRange": "온라인 일반적인 시세 범위 (예: 1,500원 ~ 2,300원)"
    }
  ],
  "priceDisclaimer": "온라인 판매가와 할인 행사는 실시간으로 변동되므로 각 쇼핑몰 검색 페이지의 낮은가격순 결과를 최종 확인하세요."
}`;

    try {
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: promptText,
          config: {
            systemInstruction:
              '당신은 한국 온라인 장보기(쿠팡 로켓프레시, 마켓컬리, 오아시스마켓, SSG닷컴, 네이버쇼핑) 가격 비교 및 1인 가구 배송비 최적화 전문가입니다. 허위 확정 가격을 단정하지 않고 현실적인 PB 브랜드(곰곰, KF365, 노브랜드)와 배송비 기준을 반영해 JSON으로만 답합니다.',
            tools: [{ googleSearch: {} }],
          },
        })
      );

      const rawText = response.text ?? '';
      let parsed = safeJsonParse<{
        primaryRecommendedMall?: string;
        overallStrategy?: string;
        bundleShippingTip?: string;
        itemGuides?: Array<{
          itemName?: string;
          bestStore?: string;
          reason?: string;
          searchKeyword?: string;
          estimatedPriceRange?: string;
        }>;
        priceDisclaimer?: string;
      }>(rawText);

      if (!parsed) {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          parsed = safeJsonParse(rawText.slice(firstBrace, lastBrace + 1));
        }
      }

      // Extract Google Search Grounding web sources if available
      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const sources: Array<{ title: string; uri: string }> = [];
      for (const chunk of rawChunks) {
        const uri = chunk.web?.uri;
        const title = chunk.web?.title;
        if (uri && !seenUris.has(uri)) {
          seenUris.add(uri);
          sources.push({
            title: title?.trim() || uri,
            uri,
          });
        }
      }

      const itemGuides = Array.isArray(parsed?.itemGuides)
        ? parsed!.itemGuides
            .filter((g) => g && g.itemName)
            .map((g) => ({
              itemName: String(g.itemName || '').trim(),
              bestStore: String(g.bestStore || '쿠팡 로켓프레시').trim(),
              reason:
                String(g.reason || '').trim() ||
                '소포장 PB 상품 및 묶음 배송 활용 시 단가 절약에 유리합니다.',
              searchKeyword: String(g.searchKeyword || g.itemName || '').trim(),
              estimatedPriceRange: String(g.estimatedPriceRange || '검색 결과 확인').trim(),
            }))
        : [];

      res.json({
        primaryRecommendedMall: parsed?.primaryRecommendedMall?.trim() || '쿠팡 로켓프레시 · 오아시스마켓',
        overallStrategy:
          parsed?.overallStrategy?.trim() ||
          redactSecrets(rawText.trim()) ||
          '1인 가구 소량 장보기는 배송비 중복을 막기 위해 무료배송 기준이 낮은 한 곳으로 묶음 주문하는 것이 가장 경제적입니다.',
        bundleShippingTip:
          parsed?.bundleShippingTip?.trim() ||
          '무료배송 기준 미달 시 3,000원 배송비가 추가되므로 달걀·우유·두부 등 자주 쓰는 기본 식재료를 함께 담아 무료배송 기준을 맞추세요.',
        itemGuides,
        sources: sources.slice(0, 6),
        priceDisclaimer:
          parsed?.priceDisclaimer?.trim() ||
          '실시간 할인가와 쿠폰 적용가는 시점마다 달라질 수 있으므로 각 구매처 바로가기에서 낮은가격순 결과를 확인하세요.',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        code: classified.code,
        message: classified.message,
      });
    }
  });

  // Feature E: 1-Month Ingredient Waste Root-Cause Diagnosis & Tailored Solutions
  app.post('/api/ai/analyze-waste-causes', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'AI_NOT_CONFIGURED',
        message:
          '현재 서버에 Gemini API 키가 연결되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 설정하면 AI 심층 낭비 원인 진단을 사용할 수 있습니다.',
      });
      return;
    }

    const {
      targetMonth = '',
      trackingSpanDays = 0,
      lifecycleSummary = {},
      events = [],
    } = req.body ?? {};

    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({
        code: 'NO_EVENTS',
        message: '분석할 식재료 등록·소비·폐기 누적 기록이 없습니다. 먼저 식재료 활동 기록을 쌓거나 1개월 누적 예시 데이터를 불러와주세요.',
      });
      return;
    }

    const eventLines = events
      .slice(0, 40)
      .map(
        (ev: {
          date?: string;
          action?: string;
          itemName?: string;
          category?: string;
          storage?: string;
          quantity?: number;
          unit?: string;
          amountKRW?: number;
          daysHeld?: number;
          causeTag?: string;
          note?: string;
        }) =>
          `- [${ev.date || ''}] ${
            ev.action === 'wasted' ? '폐기' : ev.action === 'consumed' ? '소비완료' : '입고등록'
          }: ${ev.itemName || ''} (${ev.quantity || 1}${ev.unit || '개'}, ${ev.category || '기타'}, ${
            ev.storage || '냉장'
          }, 금액 ${Number(ev.amountKRW || 0).toLocaleString('ko-KR')}원, 보유 ${
            ev.daysHeld ?? 0
          }일${ev.causeTag ? `, 원인태그: ${ev.causeTag}` : ''}${ev.note ? `, 메모: ${ev.note}` : ''})`
      )
      .join('\n');

    const promptText = `다음은 1인 가구 사용자의 누적 ${trackingSpanDays}일간(${targetMonth}) 식재료 입고·소비·폐기 생애주기 기록입니다.
단순한 일반론이 아니라, 실제 기록에 나타난 품목·보관장소·보유기간·원인태그를 근거로 사용자가 식재료를 낭비하는 구체적인 원인을 진단하고 바로 실천 가능한 맞춤형 해결 제안을 한국어 JSON으로 작성하세요.

[누적 요약 지표]
${JSON.stringify(lifecycleSummary, null, 2)}

[상세 생애주기 이벤트 로그]
${eventLines}

[작성 원칙]
1. 기록에 실제로 존재하는 품목명, 카테고리, 폐기 금액만을 근거로 원인을 진단하세요. 없는 내역을 지어내지 마세요.
2. 폐기 기록이 0건인 경우, 무폐기 달성 요인을 칭찬하고 현재 보유 습관을 유지하는 예방 수칙을 제안하세요.
3. 해결 제안(tailoredSolutions)은 '대파 구매 당일 흰대·초록잎 분리 냉동', '두부 반모 소포장 전환', '냉장실 앞줄 D-3 임박 바구니 운영'처럼 구체적인 행동 지침과 현실적인 월 예상 절약 금액(원 단위 정수)을 제시하세요.`;

    try {
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: promptText,
          config: {
            systemInstruction:
              '당신은 1인 가구 식생활 데이터 분석가이자 식품 보관·식비 절약 컨설턴트입니다. 실제 사용자 로그에 기반해 정확하고 실천 가능한 원인 분석과 해결책만 제시합니다.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                diagnosisHeadline: {
                  type: Type.STRING,
                  description: '사용자의 핵심 식재료 낭비 유형 한 줄 진단 제목',
                },
                primaryCauseSummary: {
                  type: Type.STRING,
                  description: '등록·소비·폐기 흐름에서 발견된 구체적인 낭비 발생 메커니즘 2~3문장 설명',
                },
                detectedPatterns: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      patternTitle: { type: Type.STRING, description: '발견된 낭비 원인 패턴명' },
                      evidence: { type: Type.STRING, description: '실제 기록된 품목·보관일수·사유 기반 근거' },
                      impactKRW: { type: Type.INTEGER, description: '해당 패턴과 연관된 손실 금액(원)' },
                    },
                    required: ['patternTitle', 'evidence', 'impactKRW'],
                  },
                },
                tailoredSolutions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: '맞춤 해결 제안 제목' },
                      actionStep: { type: Type.STRING, description: '장보기·소분·보관·조리 단계의 구체적 실천 방법' },
                      expectedMonthlySavingKRW: {
                        type: Type.INTEGER,
                        description: '실천 시 기대되는 월 절약 예상 금액(원)',
                      },
                    },
                    required: ['title', 'actionStep', 'expectedMonthlySavingKRW'],
                  },
                },
                recommendedBuyingRule: {
                  type: Type.STRING,
                  description: '다음 달 장보기 때 기억할 핵심 한 줄 규칙',
                },
              },
              required: [
                'diagnosisHeadline',
                'primaryCauseSummary',
                'detectedPatterns',
                'tailoredSolutions',
                'recommendedBuyingRule',
              ],
            },
          },
        })
      );

      const parsed = safeJsonParse<{
        diagnosisHeadline: string;
        primaryCauseSummary: string;
        detectedPatterns: Array<{ patternTitle: string; evidence: string; impactKRW: number }>;
        tailoredSolutions: Array<{
          title: string;
          actionStep: string;
          expectedMonthlySavingKRW: number;
        }>;
        recommendedBuyingRule: string;
      }>(response.text);

      if (!parsed || !parsed.diagnosisHeadline) {
        res.status(502).json({
          code: 'PARSE_ERROR',
          message: 'AI 낭비 원인 분석 결과를 해석하지 못했습니다. 다시 시도해주세요.',
        });
        return;
      }

      res.json({
        diagnosisHeadline: parsed.diagnosisHeadline.trim(),
        primaryCauseSummary: parsed.primaryCauseSummary?.trim() || '',
        detectedPatterns: Array.isArray(parsed.detectedPatterns)
          ? parsed.detectedPatterns.slice(0, 4).map((p) => ({
              patternTitle: String(p.patternTitle || '').trim(),
              evidence: String(p.evidence || '').trim(),
              impactKRW: Math.max(0, Math.round(Number(p.impactKRW) || 0)),
            }))
          : [],
        tailoredSolutions: Array.isArray(parsed.tailoredSolutions)
          ? parsed.tailoredSolutions.slice(0, 4).map((s) => ({
              title: String(s.title || '').trim(),
              actionStep: String(s.actionStep || '').trim(),
              expectedMonthlySavingKRW: Math.max(
                0,
                Math.round(Number(s.expectedMonthlySavingKRW) || 0)
              ),
            }))
          : [],
        recommendedBuyingRule:
          parsed.recommendedBuyingRule?.trim() ||
          '1인분 소포장 위주로 구매하고 묶음 채소는 구매 당일 1회분씩 냉동 소분하세요.',
        analyzedEventCount: events.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        code: classified.code,
        message: classified.message,
      });
    }
  });

  // Feature F: AI Personalized Fridge Mission Round Generator
  app.post('/api/ai/generate-missions', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'AI_NOT_CONFIGURED',
        message:
          '현재 서버에 Gemini API 키가 연결되어 있지 않습니다. 기본 맞춤 미션 생성기를 대신 사용할 수 있습니다.',
      });
      return;
    }

    const { ingredients = [], topWasteCauses = [], rankTitle = '냉파 초보' } = req.body ?? {};

    const invLines = Array.isArray(ingredients)
      ? ingredients
          .slice(0, 20)
          .map(
            (i: {
              name?: string;
              quantity?: number;
              unit?: string;
              category?: string;
              storage?: string;
              daysRemaining?: number | null;
            }) =>
              `- ${i.name || ''} (${i.quantity || 1}${i.unit || '개'}, ${i.category || '기타'}, ${
                i.storage || '냉장'
              }, 남은일수: ${typeof i.daysRemaining === 'number' ? `${i.daysRemaining}일` : '미입력'})`
          )
          .join('\n')
      : '';

    const promptText = `사용자의 현재 냉파 등급은 '${rankTitle}'이며, 냉장고 보유 식재료와 과거 주요 폐기 원인은 다음과 같습니다.
사용자가 오늘 바로 재미있게 실천할 수 있는 맞춤형 '냉장고 파먹기 미션' 정확히 3개를 한국어 JSON으로 설계하세요.

[보유 식재료]
${invLines || '현재 등록된 식재료 없음 (식재료 등록 및 소비기한 입력 미션 위주로 출제)'}

[과거 주요 낭비 원인]
${Array.isArray(topWasteCauses) && topWasteCauses.length > 0 ? topWasteCauses.join(', ') : '아직 폐기 이력 없음'}

[규칙]
1. 반드시 보유 식재료 목록에 실제로 있는 재료 이름을 targetItemName에 지정하세요 (식재료가 없을 때만 빈 문자열 허용).
2. kind는 반드시 urgent_rescue, combo_cook, category_focus, expiry_audit, zero_waste_register 중 하나여야 합니다.
3. points는 난이도에 따라 35~55 사이의 5단위 정수로 배정하세요.`;

    try {
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: promptText,
          config: {
            systemInstruction:
              '당신은 1인 가구 냉장고 파먹기 게이미피케이션 디자이너입니다. 실제 보유 재료만을 활용해 달성 가능하고 구체적인 주방 퀘스트 3개를 생성합니다.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                missions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      kind: {
                        type: Type.STRING,
                        description:
                          'urgent_rescue, combo_cook, category_focus, expiry_audit, zero_waste_register 중 하나',
                      },
                      title: { type: Type.STRING, description: '미션 제목 (간결하고 명확하게)' },
                      description: { type: Type.STRING, description: '구체적인 미션 수행 방법 설명' },
                      targetItemName: {
                        type: Type.STRING,
                        description: '대상 보유 식재료명 (없으면 빈 문자열)',
                      },
                      targetCategory: {
                        type: Type.STRING,
                        description: '대상 카테고리 (없으면 빈 문자열)',
                      },
                      points: { type: Type.INTEGER, description: '35~55 사이 점수' },
                    },
                    required: [
                      'kind',
                      'title',
                      'description',
                      'targetItemName',
                      'targetCategory',
                      'points',
                    ],
                  },
                },
              },
              required: ['missions'],
            },
          },
        })
      );

      const parsed = safeJsonParse<{
        missions: Array<{
          kind: string;
          title: string;
          description: string;
          targetItemName: string;
          targetCategory: string;
          points: number;
        }>;
      }>(response.text);

      if (!parsed || !Array.isArray(parsed.missions) || parsed.missions.length === 0) {
        res.status(502).json({
          code: 'PARSE_ERROR',
          message: 'AI 맞춤 미션을 해석하지 못했습니다. 다시 시도해주세요.',
        });
        return;
      }

      const allowedKinds = [
        'urgent_rescue',
        'combo_cook',
        'category_focus',
        'expiry_audit',
        'zero_waste_register',
      ];
      const now = Date.now();
      const missions = parsed.missions.slice(0, 3).map((m, idx) => ({
        id: `ai-msn-${now}-${idx}`,
        kind: allowedKinds.includes(m.kind) ? m.kind : 'urgent_rescue',
        title: String(m.title || `맞춤 냉파 미션 ${idx + 1}`).trim().slice(0, 110),
        description: String(m.description || '보유 식재료를 알뜰하게 활용해보세요.').trim().slice(0, 280),
        targetItemName: String(m.targetItemName || '').trim().slice(0, 70),
        targetCategory: String(m.targetCategory || '').trim().slice(0, 20),
        requiredCount: 1,
        currentCount: 0,
        points: Math.min(60, Math.max(30, Math.round((Number(m.points) || 40) / 5) * 5)),
        completed: false,
      }));

      res.json({ missions });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        code: classified.code,
        message: classified.message,
      });
    }
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      code: 'NOT_FOUND',
      message: '요청하신 API 경로를 찾을 수 없습니다.',
    });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      const safeErr = redactSecrets(err instanceof Error ? err.message : String(err));
      const isPayloadTooLarge = safeErr.toLowerCase().includes('too large');
      res.status(isPayloadTooLarge ? 413 : 400).json({
        code: isPayloadTooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: isPayloadTooLarge
          ? '요청 데이터 용량이 허용 한도를 초과했습니다.'
          : '요청 데이터 형식이 올바르지 않습니다.',
      });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FRIDGEPAGO server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
