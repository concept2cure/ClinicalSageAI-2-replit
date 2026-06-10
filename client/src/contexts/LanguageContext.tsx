/**
 * Language Context Provider
 *
 * The single mutation entry point for the app's UI language. It wraps i18next
 * so components never touch the i18n instance or `fetch` directly, and keeps
 * three stores in sync:
 *   - i18next        (drives every translated string + <html lang>)
 *   - localStorage   (instant, offline, survives reload — written immediately)
 *   - the account    (users.preferences.language via PATCH /api/users/me, so
 *                     the choice follows the user across devices)
 *
 * Precedence on load: localStorage gives a flicker-free default; once the
 * authenticated profile resolves, the account preference wins — unless the
 * user has explicitly switched during this session.
 *
 * Mounted inside AuthProvider (it subscribes to authService events) and
 * outside TenantProvider (language is user-scoped, not tenant-scoped).
 */

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import i18n from '@/i18n';
import {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  type LanguageCode,
  type LanguageDef,
} from '@/i18n/languages';
import { authService } from '@/services/portal/authService';

interface LanguageContextType {
  language: LanguageCode;
  availableLanguages: readonly LanguageDef[];
  setLanguage: (code: LanguageCode) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

function getAccessToken(): string | null {
  try {
    return (
      localStorage.getItem('trialsage_access_token') ||
      sessionStorage.getItem('trialsage_access_token')
    );
  } catch {
    return null;
  }
}

function normalize(lng: string | undefined): LanguageCode {
  const base = (lng || '').split('-')[0];
  return isSupportedLanguage(base) ? base : DEFAULT_LANGUAGE;
}

/** Read the account's saved language preference, if any. */
async function fetchAccountLanguage(): Promise<LanguageCode | null> {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lang = data?.preferences?.language;
    return isSupportedLanguage(lang) ? lang : null;
  } catch {
    return null;
  }
}

/** Persist the language to the account, merging with existing preferences. */
async function persistAccountLanguage(code: LanguageCode): Promise<void> {
  const token = getAccessToken();
  if (!token) return;
  try {
    // Read current preferences first — PATCH replaces the whole JSONB blob.
    const meRes = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    const existing = meRes.ok ? (await meRes.json())?.preferences || {} : {};
    await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'include',
      body: JSON.stringify({ preferences: { ...existing, language: code } }),
    });
  } catch {
    // Non-blocking: localStorage already holds the choice.
  }
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => normalize(i18n.language));
  // True once the user explicitly picks a language this session — account
  // hydration must not override an explicit in-session choice.
  const userChoseThisSession = useRef(false);

  const setLanguage = (code: LanguageCode) => {
    if (!isSupportedLanguage(code)) return;
    userChoseThisSession.current = true;
    void i18n.changeLanguage(code);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      /* private mode / quota — language still applies for this session */
    }
    if (authService.isAuthenticated()) {
      void persistAccountLanguage(code);
    }
  };

  // Keep local state aligned with i18next (covers detector + external changes).
  useEffect(() => {
    const onChanged = (lng: string) => setLanguageState(normalize(lng));
    i18n.on('languageChanged', onChanged);
    return () => i18n.off('languageChanged', onChanged);
  }, []);

  // Hydrate from the account: on mount and whenever the user (re)authenticates.
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const accountLang = await fetchAccountLanguage();
      if (cancelled || !accountLang) return;
      if (userChoseThisSession.current) return; // explicit choice wins
      if (accountLang !== normalize(i18n.language)) {
        void i18n.changeLanguage(accountLang);
        try {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, accountLang);
        } catch {
          /* ignore */
        }
      }
    };

    void hydrate();

    const unsubLogin = authService.on('login', () => {
      userChoseThisSession.current = false; // fresh session, account is authority
      void hydrate();
    });
    const unsubUpdated = authService.on('user_updated', () => void hydrate());

    return () => {
      cancelled = true;
      unsubLogin();
      unsubUpdated();
    };
  }, []);

  return (
    <LanguageContext.Provider
      value={{ language, availableLanguages: LANGUAGES, setLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageContext;
