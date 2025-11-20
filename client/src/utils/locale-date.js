export const formatLocaleDate = isoString => {
  const date = new Date(isoString);
  const language = localStorage.getItem('i18nextLng') || 'en';

  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  return date.toLocaleString(language, options);
};
