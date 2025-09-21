'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/lib/i18n';

type Flip = 'H' | 'T';

type SessionState = 'loading' | 'ready' | 'closed' | 'missing';

const FLIP_TARGET = 20;

const storageKey = (sessionId: string) => `tossed:${sessionId}`;

export default function JoinClient() {
  const search = useSearchParams();
  const sessionId = search.get('session');
  const { t, lang, setLang } = useI18n();

  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [flips, setFlips] = useState<Flip[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [wasSubmittedLocally, setWasSubmittedLocally] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [hasLangPreference, setHasLangPreference] = useState(false);

  const animationTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSessionState('missing');
      setSessionMessage(t('missingSessionDescription'));
      return;
    }

    let ignore = false;

    async function verifySession() {
      setSessionState('loading');
      setSessionMessage(null);

      const { data, error } = await supabase
        .from('sessions')
        .select('id, is_open')
        .eq('id', sessionId)
        .maybeSingle();

      if (ignore) return;

      if (error) {
        setSessionState('missing');
        setSessionMessage(t('couldNotLoadResults'));
        return;
      }

      if (!data) {
        setSessionState('missing');
        setSessionMessage(t('missingSessionDescription'));
        return;
      }

      if (!data.is_open) {
        setSessionState('closed');
        setSessionMessage(null);
        return;
      }

      setSessionState('ready');
      setSessionMessage(null);
    }

    void verifySession();

    return () => {
      ignore = true;
    };
  }, [sessionId, t]);

  useEffect(() => {
    if (!sessionId || typeof window === 'undefined') {
      setSubmitted(false);
      setWasSubmittedLocally(false);
      return;
    }

    const key = storageKey(sessionId);
    const alreadySubmitted = window.localStorage.getItem(key) === 'true';
    setSubmitted(alreadySubmitted);
    setWasSubmittedLocally(alreadySubmitted);
  }, [sessionId]);

  useEffect(() => {
    setFlips([]);
    setFormError(null);
    setSubmitting(false);
    setIsFlipping(false);

    return () => {
      if (animationTimer.current) {
        window.clearTimeout(animationTimer.current);
        animationTimer.current = null;
      }
    };
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (animationTimer.current) {
        window.clearTimeout(animationTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem('lang');
    setHasLangPreference(stored === 'en' || stored === 'pl');
  }, [lang]);

  const heads = useMemo(() => flips.filter((flip) => flip === 'H').length, [flips]);
  const tails = flips.length - heads;

  const canInteract = sessionState === 'ready' && !submitted && !submitting;

  const flipOnce = useCallback(() => {
    if (!canInteract) return;

    setFormError(null);
    setFlips((prev) => {
      if (prev.length >= FLIP_TARGET) {
        return prev;
      }

      const value: Flip = Math.random() < 0.5 ? 'H' : 'T';
      setIsFlipping(true);
      if (animationTimer.current) {
        window.clearTimeout(animationTimer.current);
      }
      animationTimer.current = window.setTimeout(() => {
        setIsFlipping(false);
        animationTimer.current = null;
      }, 600);

      return [...prev, value];
    });
  }, [canInteract]);

  const resetFlips = useCallback(() => {
    if (!canInteract) return;
    setFormError(null);
    setFlips([]);
  }, [canInteract]);

  const submitResult = useCallback(async () => {
    if (!sessionId || !canInteract) return;

      if (!nickname.trim()) {
        setFormError(t('nicknameRequired'));
        return;
      }

      if (flips.length !== FLIP_TARGET) {
        setFormError(t('flipsRequired'));
        return;
      }

    setFormError(null);
    setSubmitting(true);

    try {
      const sequence = flips.join('');
      const { error } = await supabase.from('results').insert({
        session_id: sessionId,
        nickname: nickname.trim(),
        heads,
        tails,
        sequence,
      });

      if (error) {
        throw error;
      }

      setSubmitted(true);

      if (typeof window !== 'undefined') {
        const key = storageKey(sessionId);
        window.localStorage.setItem(key, 'true');
        setWasSubmittedLocally(true);
      }
    } catch (error) {
      console.error('Failed to submit result', error);
        setFormError(t('couldNotSubmit'));
      } finally {
        setSubmitting(false);
      }
  }, [sessionId, canInteract, nickname, flips, heads, tails, t]);

  if (sessionState === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-lg">{t('waitingSessionCheck')}</div>
      </div>
    );
  }

  if (sessionState === 'missing') {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <h1 className="text-2xl font-semibold mb-3">{t('missingSession')}</h1>
          <p className="mb-4 text-red-600">{sessionMessage ?? t('missingSessionDescription')}</p>
          <p className="text-sm text-gray-600">
            {t('missingSessionHelp')}
            <br />
            <code className="break-all">/join?session=&lt;uuid&gt;</code>
          </p>
        </div>
      </div>
    );
  }

  if (sessionState === 'closed') {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-semibold mb-2">{t('sessionClosed')}</h1>
          <p className="text-gray-600">{t('sessionClosedDescription')}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {!hasLangPreference && (
          <div
            className="mb-3 rounded-full border bg-white px-3 py-2 text-xs text-gray-700"
            role="group"
            aria-label={t('chooseLanguage')}
          >
            <span className="mr-2 font-medium">{t('languageBar')}</span>
            {(['en', 'pl'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLang(code);
                  setHasLangPreference(true);
                }}
                className={`mr-2 rounded-full border px-2 py-1 ${
                  lang === code ? 'bg-black text-white' : 'border-gray-300 text-gray-700'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <h1 className="text-2xl font-bold mb-4">{t('appTitleJoin')}</h1>

        {!submitted && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" htmlFor="nickname">
              {t('nickname')}
            </label>
            <input
              id="nickname"
              value={nickname}
              onChange={(event) => {
                setNickname(event.target.value);
                if (formError) {
                  setFormError(null);
                }
              }}
              placeholder={t('nicknamePlaceholder')}
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-black"
              disabled={!canInteract}
            />
          </div>
        )}

        {!submitted && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-700">
                {t('flips')}: {flips.length}/{FLIP_TARGET}
              </div>
              <button
                type="button"
                onClick={resetFlips}
                className="text-sm underline disabled:opacity-50"
                disabled={!canInteract || flips.length === 0}
              >
                {t('reset')}
              </button>
            </div>

            <div className="flex items-center justify-center mb-3">
              <button
                type="button"
                onClick={flipOnce}
                disabled={!canInteract || flips.length >= FLIP_TARGET}
                className={`coin-button ${isFlipping ? 'coin-button-flip' : ''} ${
                  !canInteract || flips.length >= FLIP_TARGET ? 'coin-button-disabled' : ''
                }`}
                aria-label={t('flip')}
              >
                <span className="sr-only">{t('flip')}</span>
                <img
                  src={
                    flips.length === 0
                      ? '/coin/heads-pl.svg'
                      : flips[flips.length - 1] === 'H'
                      ? '/coin/heads-pl.svg'
                      : '/coin/tails-pl.svg'
                  }
                  alt=""
                  className="coin-face"
                />
              </button>
            </div>

            <div className="grid grid-cols-10 gap-1 mb-2">
              {Array.from({ length: FLIP_TARGET }).map((_, index) => (
                <div
                  key={index}
                  className={`h-8 rounded-md flex items-center justify-center text-sm border ${
                    flips[index] ? 'bg-gray-100 font-medium' : 'bg-white'
                  }`}
                >
                  {flips[index] ?? ''}
                </div>
              ))}
            </div>

            <div className="text-sm text-gray-700 mb-4">
              {t('heads')}: <b>{heads}</b> | {t('tails')}: <b>{tails}</b>
            </div>

            <button
              type="button"
              onClick={submitResult}
              disabled={!canInteract || flips.length !== FLIP_TARGET || !nickname.trim()}
              className="w-full rounded-xl bg-black text-white py-3 font-medium disabled:opacity-50"
            >
              {submitting ? t('sending') : t('submit')}
            </button>
          </div>
        )}

        {formError && !submitted && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        {submitted && (
          <div className="rounded-2xl border px-6 py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
              🎉
            </div>
            <h2 className="text-xl font-semibold mb-2">{t('thankYou')}</h2>
            <p className="text-gray-700 mb-2">{t('resultRecorded', { heads, tails })}</p>
            <p className="text-sm text-gray-500">
              {wasSubmittedLocally ? t('submittedInfo') : t('submittedNeedUpdate')}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}