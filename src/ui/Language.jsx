import { createContext, useContext, useEffect, useState } from 'react';
const LanguageContext = createContext(null);
export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('whisperville.language') === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title =
      language === 'en'
        ? 'Whisperville · Follow the life of a message'
        : '耳语镇 · 看见消息如何传播';
    try {
      localStorage.setItem('whisperville.language', language);
    } catch {
      /* Optional storage. */
    }
  }, [language]);
  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, t: (zh, en) => (language === 'en' ? en : zh) }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
export const useLanguage = () => useContext(LanguageContext);
