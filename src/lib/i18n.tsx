'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Lang = 'en' | 'pl';

type TranslationKey =
  | 'appTitleHost'
  | 'appTitleJoin'
  | 'openSession'
  | 'closeSession'
  | 'exportCsv'
  | 'joinLink'
  | 'url'
  | 'sessionId'
  | 'statusOpen'
  | 'statusClosed'
  | 'realtimeOn'
  | 'realtimeLoading'
  | 'liveHistogram'
  | 'participants'
  | 'totalFlips'
  | 'totalHeads'
  | 'pvalueLabel'
  | 'latestSubmissions'
  | 'waiting'
  | 'waitingSessionCheck'
  | 'waitingForResults'
  | 'copy'
  | 'copySuccess'
  | 'copyError'
  | 'qrPending'
  | 'nickname'
  | 'nicknamePlaceholder'
  | 'nicknameRequired'
  | 'flips'
  | 'flipsRequired'
  | 'reset'
  | 'flip'
  | 'heads'
  | 'tails'
  | 'submit'
  | 'sending'
  | 'thankYou'
  | 'resultRecorded'
  | 'submittedInfo'
  | 'submittedNeedUpdate'
  | 'sessionClosed'
  | 'sessionClosedDescription'
  | 'missingSession'
  | 'missingSessionHelp'
  | 'missingSessionDescription'
  | 'couldNotOpen'
  | 'couldNotClose'
  | 'couldNotLoadResults'
  | 'couldNotSubmit'
  | 'openSessionPrompt'
  | 'chooseLanguage'
  | 'languageBar'
  | 'chooseLanguageLabel';

type Dictionary = Record<TranslationKey, string>;

const dictionaries: Record<Lang, Dictionary> = {
  en: {
    appTitleHost: 'Coin Toss · Host',
    appTitleJoin: 'Coin Toss · Join',
    openSession: 'Open session',
    closeSession: 'Close session',
    exportCsv: 'Export CSV',
    joinLink: 'Join link',
    url: 'URL',
    sessionId: 'Session ID',
    statusOpen: 'OPEN',
    statusClosed: 'CLOSED',
    realtimeOn: '(realtime on)',
    realtimeLoading: '(realtime pending)',
    liveHistogram: 'Live histogram',
    participants: 'Participants',
    totalFlips: 'Total flips',
    totalHeads: 'Total heads',
    pvalueLabel: 'Two-sided exact binomial p-value (p = 0.5)',
    latestSubmissions: 'Latest submissions',
    waiting: 'Loading…',
    waitingSessionCheck: 'Checking session…',
    waitingForResults: 'Waiting for the first result…',
    copy: 'Copy',
    copySuccess: 'Link copied to clipboard.',
    copyError: 'Could not copy the link. Copy it manually.',
    qrPending: 'QR will appear after opening a session.',
    nickname: 'Nickname',
    nicknamePlaceholder: 'Your nickname',
    nicknameRequired: 'Please enter a nickname.',
    flips: 'Flips',
    flipsRequired: 'Please complete exactly 20 flips.',
    reset: 'Reset',
    flip: 'Flip the coin',
    heads: 'Heads',
    tails: 'Tails',
    submit: 'Submit result',
    sending: 'Sending…',
    thankYou: 'Thank you!',
    resultRecorded: 'We recorded {heads} heads and {tails} tails for this session.',
    submittedInfo: 'This browser is already marked as submitted. You are all set.',
    submittedNeedUpdate: 'If you need to update your result, please ask the host to reopen the form.',
    sessionClosed: 'This session is closed',
    sessionClosedDescription: 'Please ask the host for an active session link.',
    missingSession: 'Session issue',
    missingSessionHelp: 'Make sure you scanned the QR code from the host screen. The link should look like',
    missingSessionDescription: 'Missing session id in the URL. Use the QR code link from the host.',
    couldNotOpen: 'Could not open a new session.',
    couldNotClose: 'Could not close the session.',
    couldNotLoadResults: 'Failed to load results.',
    couldNotSubmit: 'Could not submit your result. Please try again.',
    openSessionPrompt: 'Click Open session to start. A QR code and join link will appear here.',
    chooseLanguage: 'Choose language',
    languageBar: 'Choose language / Wybierz język:',
    chooseLanguageLabel: 'Language',
  },
  pl: {
    appTitleHost: 'Rzut monetą · Prowadzący',
    appTitleJoin: 'Rzut monetą · Dołącz',
    openSession: 'Otwórz sesję',
    closeSession: 'Zamknij sesję',
    exportCsv: 'Eksportuj CSV',
    joinLink: 'Link dołączenia',
    url: 'Adres URL',
    sessionId: 'ID sesji',
    statusOpen: 'OTWARTA',
    statusClosed: 'ZAMKNIĘTA',
    realtimeOn: '(realtime działa)',
    realtimeLoading: '(oczekiwanie na realtime)',
    liveHistogram: 'Histogram na żywo',
    participants: 'Uczestnicy',
    totalFlips: 'Łącznie rzutów',
    totalHeads: 'Łącznie orłów',
    pvalueLabel: 'Dwustronne p-value z rozkładu dwumianowego (p = 0,5)',
    latestSubmissions: 'Ostatnie zgłoszenia',
    waiting: 'Ładowanie…',
    waitingSessionCheck: 'Sprawdzanie sesji…',
    waitingForResults: 'Czekamy na pierwszy wynik…',
    copy: 'Kopiuj',
    copySuccess: 'Skopiowano link do schowka.',
    copyError: 'Nie udało się skopiować linku. Skopiuj go ręcznie.',
    qrPending: 'QR pojawi się po otwarciu sesji.',
    nickname: 'Pseudonim',
    nicknamePlaceholder: 'Twój pseudonim',
    nicknameRequired: 'Podaj pseudonim.',
    flips: 'Rzuty',
    flipsRequired: 'Wykonaj dokładnie 20 rzutów.',
    reset: 'Wyczyść',
    flip: 'Rzuć monetą',
    heads: 'Orzeł',
    tails: 'Reszka',
    submit: 'Wyślij wynik',
    sending: 'Wysyłanie…',
    thankYou: 'Dziękujemy!',
    resultRecorded: 'Zapisaliśmy {heads} orłów i {tails} reszek dla tej sesji.',
    submittedInfo: 'Ta przeglądarka ma już zapisany wynik. Wszystko gotowe.',
    submittedNeedUpdate: 'Jeśli chcesz poprawić wynik, poproś prowadzącego o ponowne otwarcie formularza.',
    sessionClosed: 'Sesja jest zamknięta',
    sessionClosedDescription: 'Poproś prowadzącego o aktywny link.',
    missingSession: 'Problem z sesją',
    missingSessionHelp: 'Upewnij się, że skanowałeś kod QR z ekranu prowadzącego. Link powinien wyglądać tak',
    missingSessionDescription: 'Brak identyfikatora sesji w adresie. Użyj linku z kodu QR.',
    couldNotOpen: 'Nie udało się otworzyć nowej sesji.',
    couldNotClose: 'Nie udało się zamknąć sesji.',
    couldNotLoadResults: 'Nie udało się pobrać wyników.',
    couldNotSubmit: 'Nie udało się wysłać wyniku. Spróbuj ponownie.',
    openSessionPrompt: 'Kliknij „Otwórz sesję”, aby rozpocząć. Tutaj pojawi się kod QR i link.',
    chooseLanguage: 'Wybierz język',
    languageBar: 'Choose language / Wybierz język:',
    chooseLanguageLabel: 'Język',
  },
};

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('pl');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem('lang');
    let initialLang: Lang | null = stored === 'en' || stored === 'pl' ? stored : null;

    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('lang');
    if (fromQuery === 'en' || fromQuery === 'pl') {
      initialLang = fromQuery;
      window.localStorage.setItem('lang', fromQuery);
    }

    if (initialLang) {
      setLangState(initialLang);
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lang', next);
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const template = dictionaries[lang][key];
      if (!template) {
        return key;
      }
      if (!vars) {
        return template;
      }
      return Object.entries(vars).reduce(
        (acc, [token, value]) => acc.replaceAll(`{${token}}`, String(value)),
        template,
      );
    },
    [lang],
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
    }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
