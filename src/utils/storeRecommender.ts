import { IngredientCategory, OnlineMallId, ShoppingItem } from '../types';

export interface OnlineMallMeta {
  id: OnlineMallId;
  name: string;
  shortName: string;
  deliveryType: string;
  freeShippingThreshold: number;
  membershipFreeThreshold?: number;
  membershipLabel?: string;
  baseShippingFee: number;
  pbBrandTip: string;
  buildSearchUrl: (keyword: string) => string;
}

export const ONLINE_MALLS: Record<OnlineMallId, OnlineMallMeta> = {
  coupang: {
    id: 'coupang',
    name: '쿠팡 로켓프레시',
    shortName: '쿠팡',
    deliveryType: '새벽·당일배송',
    freeShippingThreshold: 15000,
    membershipFreeThreshold: 15000,
    membershipLabel: '와우회원 15,000원 이상 무료배송 (최소주문 기준)',
    baseShippingFee: 3000,
    pbBrandTip: '곰곰(PB) 소포장 채소·두부·달걀·냉동식품 가성비 우수',
    buildSearchUrl: (keyword: string) =>
      `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&sorter=priceAsc`,
  },
  kurly: {
    id: 'kurly',
    name: '마켓컬리',
    shortName: '마켓컬리',
    deliveryType: '샛별배송',
    freeShippingThreshold: 40000,
    membershipFreeThreshold: 20000,
    membershipLabel: '컬리멤버스 쿠폰 시 20,000원 이상 무료배송',
    baseShippingFee: 3000,
    pbBrandTip: 'KF365(PB) 1인 가구용 소분 신선채소·정육·유제품 특가 강점',
    buildSearchUrl: (keyword: string) =>
      `https://www.kurly.com/search?sword=${encodeURIComponent(keyword)}`,
  },
  oasis: {
    id: 'oasis',
    name: '오아시스마켓',
    shortName: '오아시스',
    deliveryType: '새벽배송',
    freeShippingThreshold: 30000,
    baseShippingFee: 3000,
    pbBrandTip: '국산콩 두부·콩나물·애호박·무항생제 달걀 상시 초특가',
    buildSearchUrl: (keyword: string) =>
      `https://www.oasis.co.kr/product/search?keyword=${encodeURIComponent(keyword)}`,
  },
  ssg: {
    id: 'ssg',
    name: 'SSG닷컴 (이마트몰)',
    shortName: 'SSG닷컴',
    deliveryType: '주간·새벽 쓱배송',
    freeShippingThreshold: 40000,
    baseShippingFee: 3000,
    pbBrandTip: '노브랜드·피코크 가성비 식재료 및 주간 대량 장보기 유리',
    buildSearchUrl: (keyword: string) =>
      `https://www.ssg.com/search.ssg?query=${encodeURIComponent(keyword)}`,
  },
  naver: {
    id: 'naver',
    name: '네이버쇼핑 최저가',
    shortName: '네이버쇼핑',
    deliveryType: '택배·산지직송',
    freeShippingThreshold: 25000,
    baseShippingFee: 3000,
    pbBrandTip: '산지직송 양파·감자·과일·쌀 및 대용량 냉동육 오픈마켓 최저가 비교',
    buildSearchUrl: (keyword: string) =>
      `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}&sort=price_asc`,
  },
};

export const MALL_ORDER: OnlineMallId[] = ['coupang', 'kurly', 'oasis', 'ssg', 'naver'];

// Category-specific relative price factor (reference index around 1.00) and reasoning
const CATEGORY_MALL_PROFILE: Record<
  IngredientCategory,
  {
    ranking: OnlineMallId[];
    factors: Record<OnlineMallId, number>;
    tipByMall: Partial<Record<OnlineMallId, string>>;
  }
> = {
  채소: {
    ranking: ['oasis', 'kurly', 'coupang', 'ssg', 'naver'],
    factors: { oasis: 0.92, kurly: 0.95, coupang: 0.97, ssg: 1.0, naver: 0.94 },
    tipByMall: {
      oasis: '친환경 애호박·대파·양파 소포장 상시 할인가 강점',
      kurly: 'KF365 1인분 소분 채소로 폐기 없이 알뜰 구매 가능',
      coupang: '곰곰 신선채소 소포장 로켓프레시 묶음 구매 편리',
    },
  },
  과일: {
    ranking: ['coupang', 'naver', 'kurly', 'oasis', 'ssg'],
    factors: { coupang: 0.95, naver: 0.91, kurly: 0.98, oasis: 0.97, ssg: 0.99 },
    tipByMall: {
      coupang: '곰곰 소포장 세척사과·바나나 1인 가구 단가 우수',
      naver: '산지직송 못난이·가정용 과일 박스 구매 시 최저가',
    },
  },
  육류: {
    ranking: ['coupang', 'kurly', 'ssg', 'oasis', 'naver'],
    factors: { coupang: 0.94, kurly: 0.96, ssg: 0.95, oasis: 0.98, naver: 0.92 },
    tipByMall: {
      coupang: '한돈·수입육 300g~500g 소포장 및 냉동육 최저가 다수',
      kurly: 'KF365 삼겹살·다짐육 1인 조리용 소포장 마감세일 활용 추천',
      ssg: '이마트 한우·한돈 행사 주간 쓱배송 가성비 우수',
    },
  },
  해산물: {
    ranking: ['kurly', 'coupang', 'ssg', 'oasis', 'naver'],
    factors: { kurly: 0.95, coupang: 0.96, ssg: 0.97, oasis: 0.96, naver: 0.93 },
    tipByMall: {
      kurly: '손질 생선살·새우·오징어 1인분 개별 진공포장 강점',
      coupang: '냉동 새우·연어 필렛 대용량 가성비 우수',
    },
  },
  유제품: {
    ranking: ['coupang', 'ssg', 'kurly', 'oasis', 'naver'],
    factors: { coupang: 0.93, ssg: 0.94, kurly: 0.96, oasis: 0.96, naver: 0.95 },
    tipByMall: {
      coupang: '멸균우유·흰우유·스트링치즈 로켓프레시 상시 최저가권',
      ssg: '노브랜드 굿밀크·치즈 PB 상품 초저가 구성',
      kurly: 'KF365 1등급 우유 900ml 가성비 인기 품목',
    },
  },
  알류: {
    ranking: ['oasis', 'coupang', 'kurly', 'ssg', 'naver'],
    factors: { oasis: 0.91, coupang: 0.94, kurly: 0.95, ssg: 0.96, naver: 1.0 },
    tipByMall: {
      oasis: '무항생제 10구·15구 달걀 특가 빈도가 높음',
      coupang: '곰곰 대란/특란 15구·30구 새벽배송 파손 보상 편리',
      kurly: 'KF365 1+등급 특란 소포장 1인 가구 추천',
    },
  },
  곡류: {
    ranking: ['naver', 'coupang', 'ssg', 'oasis', 'kurly'],
    factors: { naver: 0.89, coupang: 0.91, ssg: 0.95, oasis: 0.98, kurly: 0.99 },
    tipByMall: {
      naver: '햅쌀·잡곡·오트밀 2kg~4kg 무료배송 오픈마켓 최저가 최강',
      coupang: '곰곰 소포장 쌀·즉석밥 로켓배송 무료배송 유리',
    },
  },
  가공식품: {
    ranking: ['coupang', 'oasis', 'ssg', 'naver', 'kurly'],
    factors: { coupang: 0.92, oasis: 0.93, ssg: 0.94, naver: 0.91, kurly: 0.96 },
    tipByMall: {
      oasis: '국산콩 두부·어묵·햄 첨가물 적은 가성비 제품 강점',
      coupang: '곰곰 두부·통조림·소스류 묶음 최저가 다수',
      ssg: '노브랜드 가공식품 라인업 단가 절약에 유리',
    },
  },
  기타: {
    ranking: ['coupang', 'naver', 'ssg', 'kurly', 'oasis'],
    factors: { coupang: 0.94, naver: 0.92, ssg: 0.95, kurly: 0.97, oasis: 0.97 },
    tipByMall: {
      coupang: '양념·조미료·기타 식재료 빠른 묶음 배송',
      naver: '전 쇼핑몰 최저가순 일괄 가격비교 적합',
    },
  },
};

export interface ItemStoreOption {
  mall: OnlineMallMeta;
  isTopPick: boolean;
  searchKeyword: string;
  searchUrl: string;
  estimatedUnitPrice: number;
  reason: string;
}

export function buildOptimalSearchKeyword(item: Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category'>): string {
  const cleanName = item.name.trim();
  if (!cleanName) return '식재료';
  // Add helpful unit hint if small household pack makes sense
  if (item.unit === 'g' || item.unit === 'ml') {
    return `${cleanName} ${item.quantity}${item.unit}`;
  }
  if (item.category === '채소' && item.quantity <= 2) {
    return `${cleanName} 소포장`;
  }
  return cleanName;
}

export function getItemStoreRecommendations(item: ShoppingItem): ItemStoreOption[] {
  const profile = CATEGORY_MALL_PROFILE[item.category] || CATEGORY_MALL_PROFILE['기타'];
  const basePrice = item.estimatedPrice > 0 ? item.estimatedPrice : 2500;
  const keyword = buildOptimalSearchKeyword(item);

  // Special keyword overrides (e.g. 두부 -> oasis/kurly/coupang, 우유 -> coupang/ssg/kurly)
  let ranking = [...profile.ranking];
  const lower = item.name.toLowerCase();
  if (lower.includes('두부') || lower.includes('콩나물')) {
    ranking = ['oasis', 'kurly', 'coupang', 'ssg', 'naver'];
  } else if (lower.includes('우유') || lower.includes('치즈')) {
    ranking = ['coupang', 'ssg', 'kurly', 'oasis', 'naver'];
  } else if (lower.includes('양파') || lower.includes('감자') || lower.includes('쌀')) {
    ranking = ['naver', 'coupang', 'oasis', 'ssg', 'kurly'];
  }

  return ranking.map((mallId, idx) => {
    const mall = ONLINE_MALLS[mallId];
    const factor = profile.factors[mallId] ?? 0.96;
    const estPrice = Math.max(500, Math.round((basePrice * factor) / 100) * 100);
    const reason =
      profile.tipByMall[mallId] || mall.pbBrandTip;

    return {
      mall,
      isTopPick: idx === 0,
      searchKeyword: keyword,
      searchUrl: mall.buildSearchUrl(item.name.trim()),
      estimatedUnitPrice: estPrice,
      reason,
    };
  });
}

export interface BasketMallSimulation {
  mall: OnlineMallMeta;
  estimatedItemsSubtotal: number;
  shippingFee: number;
  estimatedGrandTotal: number;
  shortfallForFreeShipping: number;
  belowMinimumOrderNote?: string;
  isLowestGrandTotal: boolean;
}

export function simulateBasketAcrossMalls(
  items: ShoppingItem[],
  options: { hasWowMembership: boolean; hasKurlyMembers: boolean }
): BasketMallSimulation[] {
  if (items.length === 0) return [];

  const rawResults = MALL_ORDER.map((mallId) => {
    const mall = ONLINE_MALLS[mallId];
    let subtotal = 0;

    for (const item of items) {
      const profile = CATEGORY_MALL_PROFILE[item.category] || CATEGORY_MALL_PROFILE['기타'];
      const basePrice = item.estimatedPrice > 0 ? item.estimatedPrice : 2500;
      const factor = profile.factors[mallId] ?? 0.96;
      subtotal += Math.max(500, Math.round((basePrice * factor) / 100) * 100);
    }

    let freeThreshold = mall.freeShippingThreshold;
    if (mallId === 'coupang' && options.hasWowMembership) {
      freeThreshold = mall.membershipFreeThreshold ?? 15000;
    }
    if (mallId === 'kurly' && options.hasKurlyMembers) {
      freeThreshold = mall.membershipFreeThreshold ?? 20000;
    }

    const isFreeShipping = subtotal >= freeThreshold;
    const shippingFee = isFreeShipping ? 0 : mall.baseShippingFee;
    const shortfall = isFreeShipping ? 0 : Math.max(0, freeThreshold - subtotal);

    let belowMinimumOrderNote: string | undefined;
    if (mallId === 'coupang' && options.hasWowMembership && subtotal < 15000) {
      belowMinimumOrderNote = `로켓프레시 최소주문(15,000원)까지 ${shortfall.toLocaleString('ko-KR')}원 부족`;
    }

    return {
      mall,
      estimatedItemsSubtotal: subtotal,
      shippingFee,
      estimatedGrandTotal: subtotal + shippingFee,
      shortfallForFreeShipping: shortfall,
      belowMinimumOrderNote,
      isLowestGrandTotal: false,
    };
  });

  const minGrand = Math.min(...rawResults.map((r) => r.estimatedGrandTotal));
  return rawResults
    .map((r) => ({
      ...r,
      isLowestGrandTotal: r.estimatedGrandTotal === minGrand,
    }))
    .sort((a, b) => a.estimatedGrandTotal - b.estimatedGrandTotal);
}

export function resolveMallSearchUrlByName(storeName: string, keyword: string): string {
  const lower = storeName.toLowerCase();
  if (lower.includes('쿠팡') || lower.includes('곰곰') || lower.includes('coupang')) {
    return ONLINE_MALLS.coupang.buildSearchUrl(keyword);
  }
  if (lower.includes('컬리') || lower.includes('kf365') || lower.includes('kurly')) {
    return ONLINE_MALLS.kurly.buildSearchUrl(keyword);
  }
  if (lower.includes('오아시스') || lower.includes('oasis')) {
    return ONLINE_MALLS.oasis.buildSearchUrl(keyword);
  }
  if (lower.includes('ssg') || lower.includes('이마트') || lower.includes('노브랜드') || lower.includes('쓱')) {
    return ONLINE_MALLS.ssg.buildSearchUrl(keyword);
  }
  return ONLINE_MALLS.naver.buildSearchUrl(keyword);
}
