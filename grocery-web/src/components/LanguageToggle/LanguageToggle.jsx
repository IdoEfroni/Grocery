import { useState } from 'react';
import { Button, Modal, Form } from 'react-bootstrap';
import { useLanguage } from '../../contexts/LanguageContext';

const LANG_OPTIONS = [
  { value: 'he', key: 'settings.israelHebrew' },
  { value: 'en', key: 'settings.unitedStatesEnglish' },
];

export default function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();
  const [show, setShow] = useState(false);

  const handleSelect = (e) => {
    const value = e.target.value;
    if (value === 'he' || value === 'en') setLanguage(value);
  };

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
        <span className="settings-icon" aria-hidden="true">⚙</span>
        <span className="d-none d-sm-inline">{t('settings.pageSettings')}</span>
      </Button>

      <Modal show={show} onHide={() => setShow(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('settings.pageSettings')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-0">
            <Form.Label className="fw-semibold">{t('settings.regionAndLanguage')}</Form.Label>
            <Form.Select
              value={language}
              onChange={handleSelect}
              className="mt-2"
              aria-label={t('settings.regionAndLanguage')}
            >
              {LANG_OPTIONS.map(({ value, key }) => (
                <option key={value} value={value}>
                  {t(key)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
      </Modal>
    </>
  );
}
