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
const LAST_SESSION_STORAGE_KEY = 'lastSessionId';

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setOrigin(window.location.origin);
  }, []);

  const mergeSessionIntoState = useCallback((next: Session) => {
    setSessions((previous) => {
      const filtered = previous.filter((item) => item.id !== next.id);
      const merged = [next, ...filtered];
      merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return merged.slice(0, 20);
    });
    setSession((current) => {
      if (current?.id === next.id) {
        return next;
      }
      return current;
    });
  }, []);

  const loadSessionById = useCallback(
    async (id: string) => {
      const { data, error: loadError } = await supabase
        .from('sessions')
        .select('id, created_at, is_open')
        .eq('id', id)
        .maybeSingle();

      if (loadError || !data) {
        return null;
      }

      const loaded = data as Session;
      mergeSessionIntoState(loaded);
      return loaded;
    },
    [mergeSessionIntoState],
  );

  const activateSession = useCallback(
    (next: Session, options?: { replaceUrl?: boolean }) => {
      setSession(next);
      setResults([]);
      setRealtimeReady(false);
      mergeSessionIntoState(next);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, next.id);
        const params = new URLSearchParams(window.location.search);
        params.set('session', next.id);
        params.set('lang', lang);
        const query = params.toString();
        const method: 'pushState' | 'replaceState' = options?.replaceUrl ? 'replaceState' : 'pushState';
        window.history[method]({}, '', `${window.location.pathname}?${query}`);
      }
    },
    [lang, mergeSessionIntoState],
  );

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    const { data, error: listError } = await supabase
      .from('sessions')
      .select('id, created_at, is_open')
      .order('created_at', { ascending: false })
      .limit(20);

    if (listError) {
      setSessionsError(t('couldNotLoadResults'));
      setSessionsLoading(false);
      return null;
    }

    const list = (data ?? []) as Session[];
    setSessions(list);
    setSessionsLoading(false);
    return list;
  }, [t]);

  useEffect(() => {
    const sessionId = session?.id;
    if (!sessionId) {
      setRealtimeReady(false);
      setResults([]);
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
  }, [session?.id, t]);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      void refreshSessions();
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      await refreshSessions();

      if (cancelled) {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('session');
      const stored = window.localStorage.getItem(LAST_SESSION_STORAGE_KEY);
      const target = fromUrl ?? stored ?? null;

      if (!target) {
        return;
      }

      const loaded = await loadSessionById(target);

      if (cancelled || !loaded) {
        if (stored && !loaded) {
          window.localStorage.removeItem(LAST_SESSION_STORAGE_KEY);
        }
        return;
      }

      activateSession(loaded, { replaceUrl: true });
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [activateSession, loadSessionById, refreshSessions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (session?.id) {
      params.set('session', session.id);
    }
    params.set('lang', lang);
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}?${query}`);
  }, [lang, session?.id]);

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

      activateSession(data as Session);
      void refreshSessions();
    } catch (error) {
      console.error('Failed to open session', error);
      setError(t('couldNotOpen'));
    } finally {
      setLoadingSession(false);
    }
  }, [activateSession, refreshSessions, t]);

  const handleCloseSessionById = useCallback(
    async (sessionId: string, { updateLocalState = true }: { updateLocalState?: boolean } = {}) => {
      const { data, error: updateError } = await supabase
        .from('sessions')
        .update({ is_open: false })
        .eq('id', sessionId)
        .select('id, created_at, is_open')
        .single();

      if (updateError) {
        throw updateError;
      }

      if (updateLocalState) {
        mergeSessionIntoState(data as Session);
        setSession((current) => {
          if (current?.id === sessionId) {
            return data as Session;
          }
          return current;
        });
      }

      return data as Session;
    },
    [mergeSessionIntoState],
  );

  const closeSession = useCallback(async () => {
    if (!session?.id) {
      return;
    }

    setClosing(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await handleCloseSessionById(session.id, { updateLocalState: false });
      mergeSessionIntoState(updated);
      setSession(updated);
      void refreshSessions();
    } catch (error) {
      console.error('Failed to close session', error);
      setError(t('couldNotClose'));
    } finally {
      setClosing(false);
    }
  }, [handleCloseSessionById, mergeSessionIntoState, refreshSessions, session?.id, t]);

  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      setError(null);
      setNotice(null);
      setResumingSessionId(sessionId);
      try {
        const loaded = await loadSessionById(sessionId);
        if (!loaded) {
          setError(t('couldNotLoadResults'));
          return;
        }
        activateSession(loaded);
      } catch (resumeError) {
        console.error('Failed to resume session', resumeError);
        setError(t('couldNotLoadResults'));
      } finally {
        setResumingSessionId(null);
      }
    },
    [activateSession, loadSessionById, t],
  );

  const handleCloseSessionFromList = useCallback(
    async (sessionId: string) => {
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(t('confirmClose'));
        if (!confirmed) {
          return;
        }
      }

      setError(null);
      setNotice(null);
      setClosingSessionId(sessionId);

      try {
        const updated = await handleCloseSessionById(sessionId, { updateLocalState: false });
        mergeSessionIntoState(updated);
        void refreshSessions();
      } catch (closeError) {
        console.error('Failed to close session', closeError);
        setError(t('couldNotClose'));
      } finally {
        setClosingSessionId(null);
      }
    },
    [handleCloseSessionById, mergeSessionIntoState, refreshSessions, t],
  );

  const handleCopySessionId = useCallback(async () => {
    if (!session?.id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(session.id);
      setNotice(t('copySuccess'));
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setNotice(null), 2000);
      }
    } catch (copyError) {
      console.error('Failed to copy session id', copyError);
      setNotice(t('copyError'));
    }
  }, [session?.id, t]);

  return (
    <main className="min-h-dvh p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t('appTitleHost')}</h1>
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              {t('participants')}: <b>{participants}</b> | {t('totalFlips')}: <b>{totalFlips}</b> | {t('totalHeads')}:{' '}
              <b>{totalHeads}</b> | {t('pvalueLabel')}: {pValue === null ? 'n/a' : <b>{pValue.toFixed(4)}</b>}
            </div>
            {session && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                <span>{t('lastSession')}:</span>
                <code className="font-mono text-[11px]">{session.id}</code>
                <button
                  type="button"
                  onClick={handleCopySessionId}
                  className="rounded-full border border-transparent bg-zinc-900 px-2 py-1 text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white/80"
                >
                  {t('copyId')}
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              role="group"
              aria-label={t('chooseLanguageLabel')}
            >
              {(['en', 'pl'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`rounded-full px-2 py-1 transition ${
                    lang === code
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
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
              className="rounded-xl bg-zinc-900 px-4 py-2 text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white/80"
            >
              {loadingSession ? t('sending') : t('openSession')}
            </button>
            <button
              type="button"
              onClick={closeSession}
              disabled={!session?.is_open || closing}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-zinc-800 transition hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500"
            >
              {closing ? t('sending') : t('closeSession')}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!session || results.length === 0}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-zinc-800 transition hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500"
            >
              {t('exportCsv')}
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
            {notice}
          </div>
        )}

        {!session && (
          <div className="rounded-2xl border border-zinc-300 bg-white px-6 py-12 text-center text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
            {t('openSessionPrompt')}
          </div>
        )}

        {session && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
            <section className="rounded-2xl border border-zinc-300 bg-white p-4 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
              <h2 className="mb-3 text-lg font-semibold">{t('sessionsPanel')}</h2>
              {sessionsError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200">
                  {sessionsError}
                </div>
              )}
              {sessionsLoading ? (
                <div className="text-sm text-zinc-600 dark:text-zinc-300">{t('waiting')}</div>
              ) : sessions.length === 0 ? (
                <div className="text-sm text-zinc-600 dark:text-zinc-300">{t('noSessionsYet')}</div>
              ) : (
                <ul className="space-y-3">
                  {sessions.map((item) => {
                    const createdAt = new Date(item.created_at);
                    const isCurrent = session?.id === item.id;
                    return (
                      <li
                        key={item.id}
                        className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-200"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-1">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {createdAt.toLocaleString()}
                            </div>
                            <div className="break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-300">{item.id}</div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {item.is_open ? t('statusOpen') : t('statusClosed')}
                              {isCurrent ? (
                                <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-200">
                                  {t('lastSession')}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => handleResumeSession(item.id)}
                              disabled={resumingSessionId === item.id}
                              className="rounded-lg bg-zinc-900 px-2 py-1 text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white/80"
                            >
                              {resumingSessionId === item.id ? t('sending') : t('resume')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCloseSessionFromList(item.id)}
                              disabled={!item.is_open || closingSessionId === item.id}
                              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-zinc-700 transition hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-500"
                            >
                              {closingSessionId === item.id ? t('sending') : t('close')}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-300 bg-white p-4 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 xl:col-span-1">
              <h2 className="mb-3 text-lg font-semibold">{t('joinLink')}</h2>
              <div className="mb-3">
                <div className="mb-1 text-sm text-zinc-600 dark:text-zinc-300">{t('sessionId')}</div>
                <code className="break-all text-sm text-zinc-800 dark:text-zinc-100">{session.id}</code>
              </div>
              <div className="mb-3">
                <div className="mb-1 text-sm text-zinc-600 dark:text-zinc-300">{t('url')}</div>
                <div className="flex items-center gap-2">
                  <code className="break-all text-sm text-zinc-800 dark:text-zinc-100">{joinUrl || 'n/a'}</code>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 transition hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-500"
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
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">{t('qrPending')}</div>
                )}
              </div>
              <div className="text-sm text-zinc-700 dark:text-zinc-200">
                Status:{' '}
                {session.is_open ? (
                  <span className="text-green-700 dark:text-emerald-300">{t('statusOpen')}</span>
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">{t('statusClosed')}</span>
                )}
                {realtimeReady ? (
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-300">{t('realtimeOn')}</span>
                ) : (
                  <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">{t('realtimeLoading')}</span>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-300 bg-white p-4 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 xl:col-span-2">
              <h2 className="mb-3 text-lg font-semibold">{t('liveHistogram')}</h2>
              <div className="h-72">
                <Bar data={chartData as ChartData<'bar', number[], string>} options={chartOptions} />
              </div>
              <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">
                {t('pvalueLabel')}: {pValue === null ? 'n/a' : <b>{pValue.toFixed(4)}</b>}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-300 bg-white p-4 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 xl:col-span-4">
              <h2 className="mb-3 text-lg font-semibold">{t('latestSubmissions')}</h2>
              {results.length === 0 ? (
                <div className="text-sm text-zinc-600 dark:text-zinc-300">{t('waitingForResults')}</div>
              ) : (
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {results.slice(0, 20).map((row) => (
                    <li key={row.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
                          {row.nickname || 'n/a'}
                        </span>
                        <span className="text-sm text-zinc-700 dark:text-zinc-200">
                          {row.heads} {t('heads')} / {row.tails} {t('tails')}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{new Date(row.created_at).toLocaleTimeString()}</span>
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