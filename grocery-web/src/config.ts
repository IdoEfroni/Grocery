/**
 * The city passed to the price-comparison endpoint, which scrapes chp.co.il and
 * needs a shopping location to compare prices against.
 *
 * The value is 'Hifa', not 'Haifa'. That looks like a typo but it is the string
 * the upstream service has been accepting, so it is preserved verbatim rather
 * than "corrected" -- changing it risks silently breaking autofill. Override
 * with VITE_SHOPPING_CITY if a different store location is needed.
 */
export const SHOPPING_CITY = import.meta.env.VITE_SHOPPING_CITY || 'Hifa'

/** Max results requested from the comparison scrape. */
export const COMPARE_RESULT_COUNT = 100
