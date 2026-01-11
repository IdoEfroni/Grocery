import { useLanguage } from '../../contexts/LanguageContext';

export default function LanguageToggle() {
  const { language, setLanguage, dir } = useLanguage();

  const positionStyle = {
    position: 'absolute',
    top: 16,
    zIndex: 1000,
    ...(dir === 'rtl' ? { left: 16 } : { right: 16 }),
  };

  return (
    <div style={positionStyle}>
      <button
        onClick={() => setLanguage(language === 'en' ? 'he' : 'en')}
        style={{
          padding: '8px 16px',
          borderRadius: '8px',
          border: '1px solid #666',
          background: '#1a1a1a',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '0.9em',
          fontWeight: 500,
        }}
        title={language === 'en' ? 'Switch to Hebrew' : 'עבור לאנגלית'}
      >
        {language === 'en' ? 'EN' : 'עברית'}
      </button>
    </div>
  );
}

