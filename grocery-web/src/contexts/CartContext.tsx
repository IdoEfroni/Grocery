import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { sumTotals, type Discount, type Totals } from '../utils/money'

const STORAGE_KEY = 'grocery-cart'

/**
 * Where a line's price came from.
 *
 * 'catalog' is the shop's own price. 'manual' means the barcode was not in the
 * system and the price was entered at the till -- those need registering
 * afterwards, which is what the banner on the till screen is for.
 */
export type LineSource = 'catalog' | 'manual'

export interface CartLine {
  /** Line identity, not product identity: the same item can be added twice. */
  id: string
  sku: string
  name: string
  /** Price per unit at the moment it was scanned. */
  unitPrice: number
  quantity: number
  discount: Discount
  source: LineSource
  /** Present for catalog lines, so the product can be opened or edited. */
  productId?: string
}

export interface CartContextValue {
  lines: CartLine[]
  totals: Totals
  /** Catalog lines and manual lines, counted separately for the banner. */
  unregisteredCount: number
  itemCount: number
  addLine: (line: Omit<CartLine, 'id'>) => void
  setQuantity: (id: string, quantity: number) => void
  setDiscount: (id: string, discount: Discount) => void
  removeLine: (id: string) => void
  clear: () => void
  /** The SKU of an existing catalog line, if this barcode is already in the cart. */
  findLineBySku: (sku: string) => CartLine | undefined
}

const CartContext = createContext<CartContextValue | null>(null)

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readStoredLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Defensive: this data outlives deploys, so a shape change must not throw
    // and wipe out a transaction in progress.
    return parsed.filter(
      (l): l is CartLine =>
        l && typeof l.id === 'string' && typeof l.sku === 'string' && typeof l.unitPrice === 'number',
    )
  } catch {
    return []
  }
}

/**
 * The open transaction.
 *
 * Persisted to localStorage because a till session can be interrupted -- the
 * phone locks, the browser reloads, someone switches app to check something --
 * and losing a half-scanned basket in front of a customer is not recoverable
 * by any means except scanning it all again.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readStoredLines)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Storage full or blocked. The cart still works for this session.
    }
  }, [lines])

  const addLine = useCallback((line: Omit<CartLine, 'id'>) => {
    setLines((current) => [...current, { ...line, id: newId() }])
  }, [])

  const setQuantity = useCallback((id: string, quantity: number) => {
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, quantity: Math.max(quantity, 0) } : line,
      ),
    )
  }, [])

  const setDiscount = useCallback((id: string, discount: Discount) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, discount } : line)))
  }, [])

  const removeLine = useCallback((id: string) => {
    setLines((current) => current.filter((line) => line.id !== id))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const findLineBySku = useCallback(
    (sku: string) => lines.find((line) => line.sku === sku),
    [lines],
  )

  const totals = useMemo(() => sumTotals(lines), [lines])
  const unregisteredCount = useMemo(
    () => lines.filter((line) => line.source === 'manual').length,
    [lines],
  )
  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      totals,
      unregisteredCount,
      itemCount,
      addLine,
      setQuantity,
      setDiscount,
      removeLine,
      clear,
      findLineBySku,
    }),
    [
      lines,
      totals,
      unregisteredCount,
      itemCount,
      addLine,
      setQuantity,
      setDiscount,
      removeLine,
      clear,
      findLineBySku,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

