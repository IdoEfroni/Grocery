/**
 * The shopping address passed to the price-comparison endpoint, which scrapes
 * chp.co.il and needs a location to compare prices against.
 *
 * It must be written in Hebrew. chp cannot geocode a Latin transliteration: given
 * 'Hifa' it still answers 200 OK, but with only its online-retailers table and no
 * nearby branches at all -- 11 listings instead of 84 for the same barcode. That
 * failure is completely silent, which is how the previous value survived.
 *
 * Override with VITE_SHOPPING_CITY if a different store location is needed, in
 * Hebrew.
 */
export const SHOPPING_CITY = import.meta.env.VITE_SHOPPING_CITY || 'חיפה'
