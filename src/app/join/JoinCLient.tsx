'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { binomialPValueTwoSided, headsHistogram } from '@/lib/binomial';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type Session = { id: string; is_open: boolean; created_at: string };
type ResultRow = {
  id: string;
  session_id: string;
  nickname: string | null;
  heads: number;
  tails: number;
  sequence: string;
  created_at: string;
};

export default function JoinClient() {
  const [origin, setOrigin] = useState<string>('');
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [closing, setClosing] = useState(false);

  const [results, setResults] = useState<ResultRow[]>([]);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // Załaduj wyniki dla aktywnej sesji
  useEffect(() => {
    let ignore = false;
    async function loadResults() {
      if (!session?.id) return;
      const { data, error } = await supabase
        .from('results')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false });

      if (!ignore) {
        if (error) {
          setError('Failed to load results.');
        } else {
          setResults(data ?? []);
        }
      }
    }
    loadResults();
    return () => {
      ignore = true;
    };
  }, [session?.id]);

  // Realtime subskrypcja na INSERT w results
  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`results-session-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'results',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as ResultRow;
          setResults((prev) => [row, ...prev]);
          setRealtimeReady(true);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeReady(true);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  async function openSession() {
    setError(null);
    setLoadingSession(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .insert({})
        .select('id,created_at,is_open')
        .single();
      if (error) throw error;
      setSession(data as Session);
      setResults([]);
    } catch (e) {
      setError('Could not open a new session.');
    } finally {
      setLoadingSession(false);
    }
  }

  async function closeSession() {
    if (!session?.id) return;
    setClosing(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .update({ is_open: false })
        .eq('id', session.id)
        .select('id,created_at,is_open')
        .single();
      if (error) throw error;
      setSession(data as Session);
    } catch {
      setError('Could not close the session.');
    } finally {
      setClosing(false);
    }
  }

  const joinUrl = useMemo(() => {
    if (!origin || !session?.id) return '';
    return `${origin}/join?session=${session.id}`;
  }, [origin, session?.id]);

  // Histogram i p-value: sumujemy wszystkie „heads” i liczymy p-value
  const headsCounts = useMemo(() => results.map((r) => r.heads), [results]);
  const hist = useMemo(() => headsHistogram(headsCounts, 20), [headsCounts]);
  const participants = results.length;
  const totalHeads = useMemo(() => results.reduce((acc, r) => acc + r.heads, 0), [results]);
  const totalFlips = participants * 20;
  const pValue = useMemo(() => {
    if (totalFlips === 0) return null;
    return binomialPValueTwoSided(totalFlips, totalHeads, 0.5);
  }, [totalFlips, totalHeads]);

  const chartData = useMemo(
    () => ({
      labels: Array.from({ length: 21 }, (_, i) => i.toString()),
      datasets: [
        {
          label: 'Heads count (per participant, 20 flips)',
          data: hist,
        },
      ],
    }),
    [hist]
  );

  const chartOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      responsive: true,
      plugins: {
        legend: { display: true },
        title: { display: true, text: 'Histogram of heads in 20 flips' },
        tooltip: { enabled: true },
      },
      scales: {
        x: { title: { display: true, text: 'Heads (0..20)' } },
        y: { title: { display: true, text: 'Frequency' }, beginAtZero: true, ticks: { precision: 0 } },
      },
    }),
    []
  );

  return (
    <main className="min-h-dvh p-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Coin Toss — Host</h1>
          <div className="flex gap-2">
            <button
              onClick={openSession}
              disabled={loadingSession || (!!session && session.is_open)}
              className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50"
              title="Open a new session"
            >
              {loadingSession ? 'Opening…' : 'Open session'}
            </button>
            <button
              onClick={closeSession}
              disabled={!session?.is_open || closing}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
              title="Close current session"
            >
              {closing ? 'Closing…' : 'Close session'}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        {!session && (
          <div className="rounded-2xl border p-6">
            <p className="text-gray-700">
              Click <b>Open session</b> to start. A QR code and join link will appear here.
            </p>
          </div>
        )}

        {session && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Kolumna 1: QR + link + status */}
            <section className="rounded-2xl border p-4">
              <h2 className="font-semibold mb-3">Join link</h2>
              <div className="mb-3">
                <div className="text-sm text-gray-600 mb-1">Session ID</div>
                <code className="break-all text-sm">{session.id}</code>
              </div>
              <div className="mb-3">
                <div className="text-sm text-gray-600 mb-1">URL</div>
                <div className="flex items-center gap-2">
                  <code className="break-all text-sm">{joinUrl || '—'}</code>
                  {joinUrl && (
                    <button
                      className="rounded-lg border px-2 py-1 text-sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(joinUrl);
                        } catch {}
                      }}
                    >
                      Copy
                    </button>
                  )}
                </div>
              </div>
              <div className="mb-4">
                {joinUrl ? (
                  <div className="flex items-center justify-center">
                    <QRCodeSVG value={joinUrl} size={196} includeMargin />
                  </div>
                ) : (
                  <div className="text-gray-500 text-sm">QR will appear after opening session.</div>
                )}
              </div>
              <div className="text-sm">
                Status:{' '}
                {session.is_open ? (
                  <span className="text-green-700">OPEN</span>
                ) : (
                  <span className="text-gray-600">CLOSED</span>
                )}
                {realtimeReady ? (
                  <span className="ml-2 text-xs text-gray-500">(realtime on)</span>
                ) : (
                  <span className="ml-2 text-xs text-gray-400">(realtime…)</span>
                )}
              </div>
            </section>

            {/* Kolumna 2: Histogram */}
            <section className="rounded-2xl border p-4 lg:col-span-2">
              <h2 className="font-semibold mb-3">Live histogram</h2>
              <div className="mb-2 text-sm text-gray-700">
                Participants: <b>{participants}</b> &nbsp;|&nbsp; Total flips:{' '}
                <b>{totalFlips}</b> &nbsp;|&nbsp; Total heads: <b>{totalHeads}</b>
              </div>
              <Bar data={chartData} options={chartOptions} />
              <div className="mt-3 text-sm">
                Two-sided exact binomial p-value (vs fair coin, p=0.5):{' '}
                {pValue === null ? '—' : <b>{pValue.toFixed(4)}</b>}
              </div>
            </section>

            {/* Kolumna 3 (pod histogramem na mniejszych ekranach): lista nicków */}
            <section className="rounded-2xl border p-4 lg:col-span-3">
              <h2 className="font-semibold mb-3">Latest submissions</h2>
              {results.length === 0 ? (
                <div className="text-sm text-gray-600">Waiting for the first result…</div>
              ) : (
                <ul className="divide-y">
                  {results.slice(0, 20).map((r) => (
                    <li key={r.id} className="py-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-gray-100 text-gray-800 text-xs px-2 py-1">
                          {r.nickname || '—'}
                        </span>
                        <span className="text-sm text-gray-700">
                          {r.heads}H / {r.tails}T
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{new Date(r.created_at).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}