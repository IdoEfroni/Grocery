import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './ThemeContext'

let systemDark = false
let changeHandler: ((e: MediaQueryListEvent) => void) | null = null

function stubMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('dark') ? systemDark : false,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      changeHandler = cb
    },
    removeEventListener: () => {
      changeHandler = null
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function Harness() {
  const { preference, theme, setPreference } = useTheme()
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setPreference('light')}>light</button>
      <button onClick={() => setPreference('dark')}>dark</button>
      <button onClick={() => setPreference('system')}>system</button>
    </div>
  )
}

const setup = () =>
  render(
    <ThemeProvider>
      <Harness />
    </ThemeProvider>,
  )

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    systemDark = false
    changeHandler = null
    document.documentElement.removeAttribute('data-theme')
    stubMatchMedia()
  })

  it('follows the system by default', () => {
    systemDark = true
    setup()
    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('leaves data-theme unset while following the system', () => {
    // The stylesheet's media query must be the only thing deciding here;
    // writing an attribute too would give two sources of truth.
    systemDark = true
    setup()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('lets an explicit light choice override a dark system', async () => {
    systemDark = true
    setup()
    await userEvent.click(screen.getByText('light'))

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('lets an explicit dark choice override a light system', async () => {
    systemDark = false
    setup()
    await userEvent.click(screen.getByText('dark'))

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('keeps up when the device flips at dusk', async () => {
    systemDark = false
    setup()
    expect(screen.getByTestId('theme')).toHaveTextContent('light')

    // No reload: the provider listens for the change.
    await act(async () => {
      changeHandler?.({ matches: true } as MediaQueryListEvent)
    })
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('remembers the choice across reloads', async () => {
    setup()
    await userEvent.click(screen.getByText('dark'))
    expect(localStorage.getItem('grocery-theme')).toBe('dark')

    screen.getByTestId('theme') // still mounted
    const again = render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    )
    expect(again.getAllByTestId('preference')[1]).toHaveTextContent('dark')
  })

  it('updates the browser chrome colour', async () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)

    setup()
    await userEvent.click(screen.getByText('dark'))
    expect(meta.getAttribute('content')).toBe('#16181c')

    await userEvent.click(screen.getByText('light'))
    expect(meta.getAttribute('content')).toBe('#ffffff')

    meta.remove()
  })

  it('falls back to system when storage is unavailable', () => {
    // Private browsing throws on access rather than returning null.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    setup()
    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    spy.mockRestore()
  })
})
