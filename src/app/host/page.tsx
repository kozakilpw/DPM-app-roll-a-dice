'use client';

import NextDynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  type ChartData,
  type ChartDataset,
  type ChartOptions,
} from 'chart.js';
import { supabase } from '@/lib/supabaseClient';
import { binomialPMF, binomialPValueTwoSided, headsHistogram } from '@/lib/binomial';
import { useI18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement);

const Bar = NextDynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), { ssr: false });

const FLIP_TARGET = 20;

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

type CombinedChartData = ChartData<'bar' | 'line', number[], string>;

export default function HostPage() {
  const { t, lang, setLang } = useI18n();
  const [origin, setOrigin] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [closing, setClosing] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const sessionId = session?.id;
    if (!sessionId) {
      setRealtimeReady(false);
      return;
    }

    let ignore = false;

    async function loadResults() {
      const { data, error: loadError } = await supabase
        .from('results')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

      if (ignore) {
        return;
      }

      if (loadError) {
        setError(t('couldNotLoadResults'));
        return;
      }

      setResults(data ?? []);
    }

    void loadResults();

    return () => {
      ignore = true;
    };
  }, [session?.id]);

  useEffect(() => {
    const sessionId = session?.id;
    if (!sessionId) {
      return;
    }

    const channel = supabase
      .channel(`results-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'results',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as ResultRow;
          setResults((prev) => [row, ...prev]);
          setRealtimeReady(true);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeReady(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setRealtimeReady(false);
    };
  }, [session?.id, t]);

  const joinUrl = useMemo(() => {
    if (!origin || !session?.id) {
      return '';
    }
    return `${origin}/join?session=${session.id}&lang=${lang}`;
  }, [lang, origin, session?.id]);

  const headsCounts = useMemo(() => results.map((row) => row.heads), [results]);
  const histogram = useMemo(() => headsHistogram(headsCounts, FLIP_TARGET), [headsCounts]);
  const participants = results.length;
  const totalHeads = useMemo(() => results.reduce((sum, row) => sum + row.heads, 0), [results]);
  const totalFlips = participants * FLIP_TARGET;
  const pValue = useMemo(() => {
    if (totalFlips === 0) {
      return null;
    }
    return binomialPValueTwoSided(totalFlips, totalHeads, 0.5);
  }, [totalFlips, totalHeads]);

  const normalizedHistogram = useMemo(() => {
    if (participants === 0) {
      return histogram.map(() => 0);
    }
    return histogram.map((value) => value / participants);
  }, [histogram, participants]);

  const expectedDistribution = useMemo(
    () => Array.from({ length: FLIP_TARGET + 1 }, (_, k) => binomialPMF(FLIP_TARGET, k, 0.5)),
    []
  );

  const observedDataset = useMemo<ChartDataset<'bar', number[]>>(() => ({
    type: 'bar' as const,
    label: 'Observed frequency',
    data: normalizedHistogram,
    backgroundColor: 'rgba(37, 99, 235, 0.6)',
    borderColor: 'rgba(37, 99, 235, 0.9)',
    borderWidth: 1,
    borderRadius: 4,
  }), [normalizedHistogram]);

  const expectedDataset = useMemo<ChartDataset<'line', number[]>>(() => ({
    type: 'line' as const,
    label: 'Expected PMF (p = 0.5)',
    data: expectedDistribution,
    borderColor: '#f97316',
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.35,
  }), [expectedDistribution]);

  const chartData = useMemo<CombinedChartData>(
    () => ({
      labels: Array.from({ length: FLIP_TARGET + 1 }, (_, index) => index.toString()),
      datasets: [observedDataset, expectedDataset],
    }),
    [observedDataset, expectedDataset]
  );
  const suggestedYMax = useMemo(() => {
    const allValues = [...normalizedHistogram, ...expectedDistribution];
    const max = allValues.reduce((current, value) => (value > current ? value : current), 0);
    return max === 0 ? 0.1 : Math.min(1, max * 1.2);
  }, [normalizedHistogram, expectedDistribution]);

  const chartOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true },
        title: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = typeof context.parsed.y === 'number' ? context.parsed.y : 0;
              const datasetType = (context.dataset as { type?: string }).type;
              const labelPrefix = datasetType === 'line' ? 'Expected' : 'Observed';
              return `${labelPrefix}: ${(value * 100).toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Heads (out of 20)' },
        },
        y: {
          title: { display: true, text: 'Probability' },
          suggestedMin: 0,
          suggestedMax: suggestedYMax,
          ticks: {
            callback: (value) => `${Number(value) * 100}%`,
          },
        },
      },
    }),
    [suggestedYMax]
  );

  const handleCopyLink = useCallback(async () => {
    if (!joinUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(joinUrl);
      setNotice(t('copySuccess'));
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setNotice(null), 2000);
      }
    } catch (error) {
      console.error('Failed to copy link', error);
      setNotice(t('copyError'));
    }
  }, [joinUrl, t]);

  const handleExportCsv = useCallback(() => {
    if (!session) {
      return;
    }

    const rows = results.map((row) => [
      row.id,
      row.nickname ?? '',
      row.heads.toString(),
      row.tails.toString(),
      row.sequence,
      row.created_at,
    ]);

    const csv = ['id,nickname,heads,tails,sequence,created_at', ...rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coin-toss-${session.id}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [results, session]);

  const openSession = useCallback(async () => {
    setError(null);
    setNotice(null);
    setLoadingSession(true);
    try {
      const { data, error: insertError } = await supabase
        .from('sessions')
        .insert({})
        .select('id, created_at, is_open')
        .single();

      if (insertError) {
        throw insertError;
      }

      setSession(data as Session);
      setResults([]);
      setRealtimeReady(false);
    } catch (error) {
      console.error('Failed to open session', error);
      setError(t('couldNotOpen'));
    } finally {
      setLoadingSession(false);
    }
  }, [t]);

  const closeSession = useCallback(async () => {
    if (!session?.id) {
      return;
    }

    setClosing(true);
    setError(null);
    setNotice(null);

    try {
      const { data, error: updateError } = await supabase
        .from('sessions')
        .update({ is_open: false })
        .eq('id', session.id)
        .select('id, created_at, is_open')
        .single();

      if (updateError) {
        throw updateError;
      }

      setSession(data as Session);
    } catch (error) {
      console.error('Failed to close session', error);
      setError(t('couldNotClose'));
    } finally {
      setClosing(false);
    }
  }, [session?.id, t]);

  return (
    <main className="min-h-dvh p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('appTitleHost')}</h1>
            <div className="text-sm text-gray-600">
              {t('participants')}: <b>{participants}</b> | {t('totalFlips')}: <b>{totalFlips}</b> | {t('totalHeads')}: <b>{totalHeads}</b> |{' '}
              {t('pvalueLabel')}: {pValue === null ? 'n/a' : <b>{pValue.toFixed(4)}</b>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium"
              role="group"
              aria-label={t('chooseLanguageLabel')}
            >
              {(['en', 'pl'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`rounded-full px-2 py-1 transition ${
                    lang === code ? 'bg-black text-white' : 'text-gray-600 hover:text-black'
                  }`}
                  aria-pressed={lang === code}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={openSession}
              disabled={loadingSession || (session?.is_open ?? false)}
              className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {loadingSession ? t('sending') : t('openSession')}
            </button>
            <button
              type="button"
              onClick={closeSession}
              disabled={!session?.is_open || closing}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {closing ? t('sending') : t('closeSession')}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!session || results.length === 0}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
            >
              {t('exportCsv')}
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {notice}
          </div>
        )}

        {!session && (
          <div className="rounded-2xl border px-6 py-12 text-center text-gray-700">
            {t('openSessionPrompt')}
          </div>
        )}

        {session && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-2xl border p-4">
              <h2 className="mb-3 text-lg font-semibold">{t('joinLink')}</h2>
              <div className="mb-3">
                <div className="mb-1 text-sm text-gray-600">{t('sessionId')}</div>
                <code className="break-all text-sm">{session.id}</code>
              </div>
              <div className="mb-3">
                <div className="mb-1 text-sm text-gray-600">{t('url')}</div>
                <div className="flex items-center gap-2">
                  <code className="break-all text-sm">{joinUrl || 'n/a'}</code>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="rounded-lg border px-2 py-1 text-sm disabled:opacity-50"
                    disabled={!joinUrl}
                  >
                    {t('copy')}
                  </button>
                </div>
              </div>
              <div className="mb-4 flex items-center justify-center">
                {joinUrl ? (
                  <QRCodeSVG value={joinUrl} size={196} includeMargin />
                ) : (
                  <div className="text-sm text-gray-500">{t('qrPending')}</div>
                )}
              </div>
              <div className="text-sm text-gray-700">
                Status:{' '}
                {session.is_open ? (
                  <span className="text-green-700">{t('statusOpen')}</span>
                ) : (
                  <span className="text-gray-600">{t('statusClosed')}</span>
                )}
                {realtimeReady ? (
                  <span className="ml-2 text-xs text-gray-500">{t('realtimeOn')}</span>
                ) : (
                  <span className="ml-2 text-xs text-gray-400">{t('realtimeLoading')}</span>
                )}
              </div>
            </section>

            <section className="rounded-2xl border p-4 lg:col-span-2">
              <h2 className="mb-3 text-lg font-semibold">{t('liveHistogram')}</h2>
              <div className="h-72">
                <Bar data={chartData as ChartData<'bar', number[], string>} options={chartOptions} />
              </div>
              <div className="mt-3 text-sm text-gray-700">
                {t('pvalueLabel')}: {pValue === null ? 'n/a' : <b>{pValue.toFixed(4)}</b>}
              </div>
            </section>

            <section className="rounded-2xl border p-4 lg:col-span-3">
              <h2 className="mb-3 text-lg font-semibold">{t('latestSubmissions')}</h2>
              {results.length === 0 ? (
                <div className="text-sm text-gray-600">{t('waitingForResults')}</div>
              ) : (
                <ul className="divide-y">
                  {results.slice(0, 20).map((row) => (
                    <li key={row.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800">
                          {row.nickname || 'n/a'}
                        </span>
                        <span className="text-sm text-gray-700">
                          {row.heads}H / {row.tails}T
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{new Date(row.created_at).toLocaleTimeString()}</span>
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