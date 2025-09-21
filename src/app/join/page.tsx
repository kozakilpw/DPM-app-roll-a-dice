'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Flip = 'H' | 'T';

export default function JoinPage() {
  const search = useSearchParams();
  const sessionId = search.get('session');

  const [loaded, setLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [nickname, setNickname] = useState('');
  const [flips, setFlips] = useState<Flip[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // policz heads/tails
  const heads = useMemo(() => flips.filter(f => f === 'H').length, [flips]);
  const tails = useMemo(() => flips.filter(f => f === 'T').length, [flips]);

  // sprawdź sesję
  useEffect(() => {
    let ignore = false;

    async function checkSession() {
      if (!sessionId) {
        setError('Missing session id in the URL. Use the QR code link from the host.');
        setLoaded(true);
        return;
      }
      const { data, error } = await supabase
        .from('sessions')
        .select('id,is_open')
        .eq('id', sessionId)
        .maybeSingle();

      if (!ignore) {
        if (error) {
          setError('Could not verify the session. Please try again later.');
          setIsOpen(null);
        } else if (!data) {
          setError('Session not found.');
          setIsOpen(null);
        } else {
          setIsOpen(!!data.is_open);
        }
        setLoaded(true);
      }
    }

    checkSession();
    return () => {
      ignore = true;
    };
  }, [sessionId]);

  function flipOnce() {
    if (submitted) return;
    if (flips.length >= 20) return;
    const v: Flip = Math.random() < 0.5 ? 'H' : 'T';
    setFlips(prev => [...prev, v]);
  }

  function resetFlips() {
    if (submitted) return;
    setFlips([]);
  }

  async function submitResult() {
    if (!sessionId) return;
    if (!nickname.trim()) {
      setError('Please enter a nickname.');
      return;
    }
    if (flips.length !== 20) {
      setError('Please complete exactly 20 flips.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const sequence = flips.join('');
    const { error } = await supabase.from('results').insert({
      session_id: sessionId,
      nickname: nickname.trim(),
      heads,
      tails,
      sequence,
    });
    setSubmitting(false);
    if (error) {
      setError('Could not submit your result. Please try again.');
      return;
    }
    setSubmitted(true);
  }

  // UI stany wstępne
  if (!loaded) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center text-lg">Loading session…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <h1 className="text-2xl font-semibold mb-3">Problem</h1>
          <p className="mb-4 text-red-600">{error}</p>
          <p className="text-sm text-gray-600">
            Make sure you scanned the QR code from the host screen. It should look like:
            <br />
            <code className="break-all">/join?session=&lt;uuid&gt;</code>
          </p>
        </div>
      </div>
    );
  }
  if (isOpen === false) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-semibold mb-2">Session is closed</h1>
          <p className="text-gray-600">Please check the host screen for the active session.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Coin Toss — Join</h1>

        {!submitted && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Nickname</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname"
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2"
            />
          </div>
        )}

        {!submitted && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-700">Flips: {flips.length}/20</div>
              <button
                onClick={resetFlips}
                className="text-sm underline disabled:opacity-50"
                disabled={flips.length === 0}
              >
                Reset
              </button>
            </div>

            <div className="flex items-center justify-center mb-3">
              <button
                onClick={flipOnce}
                disabled={flips.length >= 20}
                className="w-48 h-48 rounded-full border shadow text-4xl font-bold flex items-center justify-center active:scale-95 transition disabled:opacity-50"
                aria-label="Flip the coin"
                title="Flip the coin"
              >
                {flips.length === 0 ? 'Flip' : flips[flips.length - 1]}
              </button>
            </div>

            <div className="grid grid-cols-10 gap-1 mb-2">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-8 rounded-md flex items-center justify-center text-sm border ${
                    flips[i] ? (flips[i] === 'H' ? 'bg-gray-100' : 'bg-gray-50') : 'bg-white'
                  }`}
                >
                  {flips[i] ?? ''}
                </div>
              ))}
            </div>

            <div className="text-sm text-gray-700 mb-4">
              Heads: <b>{heads}</b> &nbsp;|&nbsp; Tails: <b>{tails}</b>
            </div>

            <button
              onClick={submitResult}
              disabled={submitting || flips.length !== 20 || !nickname.trim()}
              className="w-full rounded-xl bg-black text-white py-3 font-medium disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Submit my 20 flips'}
            </button>
          </div>
        )}

        {submitted && (
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Thank you!</h2>
            <p className="text-gray-600">Your result has been submitted.</p>
          </div>
        )}
      </div>
    </main>
  );
}