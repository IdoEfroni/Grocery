import type { PriceOffer, ProductCompareResponse } from './products'

/**
 * Builds a ProductCompareResponse for tests, so a test only has to state the
 * fields it actually cares about.
 */
export function compareResponse(
  overrides: Partial<ProductCompareResponse> = {},
): ProductCompareResponse {
  return {
    productName: '',
    description: '',
    averagePrice: 'N/A',
    typicalPrice: 'N/A',
    bestSingleUnit: null,
    highestRealPrice: null,
    bestBulk: null,
    inflatedOffers: [],
    resultCount: 0,
    inStoreCount: 0,
    onlineCount: 0,
    degraded: false,
    ...overrides,
  }
}

export function priceOffer(overrides: Partial<PriceOffer> = {}): PriceOffer {
  return {
    price: '0.00',
    chain: 'chain',
    storeName: 'branch',
    location: 'somewhere',
    source: 'InStore',
    requiredQuantity: 1,
    promotionDescription: null,
    expiresOn: null,
    ...overrides,
  }
}
