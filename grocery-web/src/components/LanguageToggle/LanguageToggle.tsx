import { useState } from 'react'
import { Button, Modal, Form } from 'react-bootstrap'
import { useLanguage, type Language } from '../../contexts/LanguageContext'
import { useTheme, type ThemePreference } from '../../contexts/ThemeContext'
import Icon from '../Icon/Icon'
import './LanguageToggle.css'

const LANG_OPTIONS: { value: Language; key: string }[] = [
  { value: 'he', key: 'settings.israelHebrew' },
  { value: 'en', key: 'settings.unitedStatesEnglish' },
]

/**
 * 'system' first, because following the phone is the right default for a device
 * that switches itself at dusk. The explicit options are for overriding it --
 * a bright shop floor, or a dark chiller aisle.
 */
const THEME_OPTIONS: { value: ThemePreference; key: string }[] = [
  { value: 'system', key: 'settings.themeSystem' },
  { value: 'light', key: 'settings.themeLight' },
  { value: 'dark', key: 'settings.themeDark' },
]

/** Settings panel: language and appearance. */
export default function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage()
  const { preference, theme, setPreference } = useTheme()
  const [show, setShow] = useState(false)

  return (
    <>
      <Button
        variant="outline-light"
        size="sm"
        className="d-flex align-items-center gap-1 px-2 py-1 settings-trigger"
        onClick={() => setShow(true)}
        title={t('settings.pageSettings')}
        aria-label={t('settings.pageSettings')}
      >
        <Icon name="settings" className="settings-icon" />
        <span className="d-none d-sm-inline">{t('settings.pageSettings')}</span>
      </Button>

      <Modal show={show} onHide={() => setShow(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {t('settings.pageSettings')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-4">
            <Form.Label htmlFor="settings-language" className="fw-semibold">
              {t('settings.regionAndLanguage')}
            </Form.Label>
            <Form.Select
              id="settings-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              {LANG_OPTIONS.map(({ value, key }) => (
                <option key={value} value={value}>
                  {t(key)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-0">
            <Form.Label as="p" className="fw-semibold mb-2">
              {t('settings.appearance')}
            </Form.Label>

            {/* Segmented buttons rather than a dropdown: three short options
                that benefit from being visible at a glance, and each is a
                comfortable tap target. */}
            <div className="theme-choice" role="radiogroup" aria-label={t('settings.appearance')}>
              {THEME_OPTIONS.map(({ value, key }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={preference === value}
                  className={`theme-choice__option${preference === value ? ' is-selected' : ''}`}
                  onClick={() => setPreference(value)}
                >
                  {t(key)}
                </button>
              ))}
            </div>

            {preference === 'system' && (
              <Form.Text className="text-muted">
                {t('settings.themeFollowingSystem', {
                  mode: theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight'),
                })}
              </Form.Text>
            )}
          </Form.Group>
        </Modal.Body>
      </Modal>
    </>
  )
}
