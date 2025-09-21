'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Flip = 'H' | 'T';

type SessionState = 'loading' | 'ready' | 'closed' | 'missing';

const FLIP_TARGET = 20;

const storageKey = (sessionId: string) => `tossed:${sessionId}`;

export default function JoinClient() {
  const search = useSearchParams();
  const sessionId = search.get('session');

  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [flips, setFlips] = useState<Flip[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [wasSubmittedLocally, setWasSubmittedLocally] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);

  const animationTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSessionState('missing');
      setSessionMessage('Missing session id in the URL. Use the QR code link from the host.');
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
        setSessionMessage('Could not verify the session. Please try again later.');
        return;
      }

      if (!data) {
        setSessionState('missing');
        setSessionMessage('Session not found.');
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
  }, [sessionId]);

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
      }, 300);

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
      setFormError('Please enter a nickname.');
      return;
    }

    if (flips.length !== FLIP_TARGET) {
      setFormError('Please complete exactly 20 flips.');
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
      setFormError('Could not submit your result. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, canInteract, nickname, flips, heads, tails]);

  if (sessionState === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-lg">Checking session...</div>
      </div>
    );
  }

  if (sessionState === 'missing') {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <h1 className="text-2xl font-semibold mb-3">Session issue</h1>
          <p className="mb-4 text-red-600">{sessionMessage ?? 'Session not found.'}</p>
          <p className="text-sm text-gray-600">
            Make sure you scanned the QR code from the host screen. The link should look like
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
          <h1 className="text-2xl font-semibold mb-2">This session is closed</h1>
          <p className="text-gray-600">Please ask the host for an active session link.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Coin Toss - Join</h1>

        {!submitted && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" htmlFor="nickname">
              Nickname
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
              placeholder="Your nickname"
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-black"
              disabled={!canInteract}
            />
          </div>
        )}

        {!submitted && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-700">Flips: {flips.length}/{FLIP_TARGET}</div>
              <button
                type="button"
                onClick={resetFlips}
                className="text-sm underline disabled:opacity-50"
                disabled={!canInteract || flips.length === 0}
              >
                Reset
              </button>
            </div>

            <div className="flex items-center justify-center mb-3">
              <button
                type="button"
                onClick={flipOnce}
                disabled={!canInteract || flips.length >= FLIP_TARGET}
                className="w-48 h-48 rounded-full border shadow bg-white text-4xl font-bold flex items-center justify-center transition-transform duration-300 ease-out active:scale-95 disabled:opacity-50"
                style={{ transform: isFlipping ? 'rotateX(180deg)' : 'rotateX(0deg)' }}
                aria-label="Flip the coin"
              >
                {flips.length === 0 ? 'Flip' : flips[flips.length - 1]}
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
              Heads: <b>{heads}</b> | Tails: <b>{tails}</b>
            </div>

            <button
              type="button"
              onClick={submitResult}
              disabled={!canInteract || flips.length !== FLIP_TARGET || !nickname.trim()}
              className="w-full rounded-xl bg-black text-white py-3 font-medium disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Submit my 20 flips'}
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
              ?
            </div>
            <h2 className="text-xl font-semibold mb-2">Thank you!</h2>
            <p className="text-gray-700 mb-2">
              We recorded {heads} heads and {tails} tails for this session.
            </p>
            <p className="text-sm text-gray-500">
              {wasSubmittedLocally
                ? 'This browser is already marked as submitted. You are all set.'
                : 'If you need to update your result, please ask the host to reopen the form.'}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}