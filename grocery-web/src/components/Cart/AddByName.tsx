import { useEffect, useRef, useState } from 'react'
import { Button, Form, InputGroup, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { searchProducts, type Product } from '../../api/products'
import { formatPrice } from '../../utils/formatPrice'
import Icon from '../Icon/Icon'
import './AddByName.css'

/** Below this a search matches most of the catalogue and tells the cashier nothing. */
const MIN_QUERY = 2

/** Long enough not to fire on every keystroke, short enough not to feel laggy. */
const DEBOUNCE_MS = 300

/** A till screen on a phone; more than this and the basket scrolls out of reach. */
const MAX_RESULTS = 6

export interface AddByNameProps {
  onPick: (product: Product) => void
  /** Chosen when the catalogue has no match and the sale still has to go through. */
  onAddWithoutBarcode: (name: string) => void
}

/**
 * Adding an item to the bill by typing its name.
 *
 * Not everything on the shelf has a barcode -- loose bread, produce, anything
 * repackaged in the shop -- and those items previously could not reach the bill
 * at all, because the till only had a scanner. This searches the catalogue by
 * name so a barcode-less product that *is* registered gets its real price
 * rather than one recalled from memory.
 *
 * Searching is debounced and aborts in flight, so typing a long name does not
 * queue a request per keystroke.
 */
export default function AddByName({ onPick, onAddWithoutBarcode }: AddByNameProps) {
  const { t, language } = useLanguage()
  const locale = language === 'he' ? 'he-IL' : 'en-IL'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < MIN_QUERY) {
      abortRef.current?.abort()
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      searchProducts(trimmed, 1, MAX_RESULTS, { signal: controller.signal })
        .then((page) => {
          if (controller.signal.aborted) return
          setResults(page.items)
          setSearched(true)
        })
        .catch(() => {
          // A failed search must not block the sale -- the cashier can still add
          // the item without a barcode, which is the fallback shown below.
          if (!controller.signal.aborted) {
            setResults([])
            setSearched(true)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [trimmed])

  const reset = () => {
    setQuery('')
    setResults([])
    setSearched(false)
  }

  const pick = (product: Product) => {
    onPick(product)
    reset()
  }

  const addManually = () => {
    onAddWithoutBarcode(trimmed)
    reset()
  }

  return (
    <div className="add-by-name">
      <Form
        onSubmit={(e) => {
          e.preventDefault()
          // The list already reflects what was typed; submitting from the phone
          // keyboard should just dismiss it, not re-run the same search.
          ;(document.activeElement as HTMLElement | null)?.blur()
        }}
      >
        <Form.Label htmlFor="cart-name-search" className="add-by-name__label">
          {t('cart.orTypeName')}
        </Form.Label>
        <InputGroup>
          <InputGroup.Text aria-hidden="true">
            <Icon name="search" />
          </InputGroup.Text>
          <Form.Control
            id="cart-name-search"
            type="search"
            autoComplete="off"
            value={query}
            placeholder={t('cart.nameSearchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && (
            <InputGroup.Text>
              <Spinner animation="border" size="sm" role="status" />
            </InputGroup.Text>
          )}
        </InputGroup>
      </Form>

      {results.length > 0 && (
        <ul className="add-by-name__results">
          {results.map((product) => (
            <li key={product.id}>
              <button type="button" className="add-by-name__result" onClick={() => pick(product)}>
                <span className="add-by-name__result-name">{product.name}</span>
                <span className="add-by-name__result-price">
                  {formatPrice(product.price, locale)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !loading && results.length === 0 && (
        <div className="add-by-name__empty">
          <p className="mb-2">{t('cart.noNameMatch', { query: trimmed })}</p>
          <Button variant="outline-secondary" size="sm" onClick={addManually}>
            {t('cart.addWithoutBarcode')}
          </Button>
        </div>
      )}
    </div>
  )
}
