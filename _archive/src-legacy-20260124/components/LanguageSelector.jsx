import React from 'react';
import i18n from '../i18n';

export default function LanguageSelector() {
  const [language, setLanguage] = React.useState(i18n.language);

  const change = e => {
    const newLang = e.target.value;
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  return (
    <select
      value={language}
      onChange={change}
      className="border p-1 text-xs rounded mx-2"
      title="Change language"
      aria-label="Select language"
    >
      <option value="en">EN</option>
      <option value="fr">FR</option>
      <option value="de">DE</option>
      <option value="ja">日本語</option>
    </select>
  );
}
