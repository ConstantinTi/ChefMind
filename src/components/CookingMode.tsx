'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Recipe } from '@/domain/recipe/types';
import { scaleRecipe } from '@/domain/recipe/derive';
import { buttonClass, TEMPERATURE_MODE_LABELS } from './ui';

/**
 * One step per screen, for a phone propped against a bowl.
 *
 * Keeps the screen awake while it is open, because the single worst moment in a
 * recipe app is the display blanking with flour on both hands.
 */
export function CookingMode({ recipe, initialServings }: { recipe: Recipe; initialServings: number }) {
  const [servings, setServings] = useState(initialServings);
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const scaled = useMemo(() => scaleRecipe(recipe, servings), [recipe, servings]);
  const steps = scaled.steps;
  const step = steps[index];
  const stepIngredients = step ? scaled.stepIngredients[step.id] ?? [] : [];

  useWakeLock();

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(Math.max(0, i + delta), Math.max(0, steps.length - 1)));
  }, [steps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Swiping is how you turn a page with the back of a knuckle.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    const t = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Ignore anything that looks more like scrolling than a page turn.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? 1 : -1);
  };

  if (!steps.length) {
    return (
      <div className="py-16 text-center">
        <p>Für dieses Rezept sind keine Arbeitsschritte hinterlegt.</p>
        <Link href={`/rezepte/${recipe.slug}`} className={`${buttonClass()} mt-4`}>Zurück zum Rezept</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[75dvh] flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href={`/rezepte/${recipe.slug}`} className="text-sm text-muted hover:text-ink">
          ← {recipe.title}
        </Link>

        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted tabular-nums">Schritt {index + 1} von {steps.length}</span>
          <span className="text-muted">·</span>
          {/* Realising halfway through that you need one more portion should not
              mean leaving cooking mode. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setServings((s) => Math.max(0.5, s - 1))}
              aria-label="Eine Portion weniger"
              className="size-9 cursor-pointer rounded-lg border border-line leading-none hover:bg-accent-soft"
            >
              −
            </button>
            <span className="min-w-14 text-center tabular-nums">{servings} P.</span>
            <button
              type="button"
              onClick={() => setServings((s) => s + 1)}
              aria-label="Eine Portion mehr"
              className="size-9 cursor-pointer rounded-lg border border-line leading-none hover:bg-accent-soft"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div
        className="mb-5 h-1 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label="Fortschritt"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
      >
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="flex-1">
        {stepIngredients.length > 0 ? (
          <ul className="mb-6 flex flex-wrap gap-2">
            {stepIngredients.map((ing) => (
              <li
                key={ing.source.id}
                className="rounded-lg bg-accent-soft px-3 py-1.5 text-sm text-accent"
              >
                <strong className="tabular-nums">{ing.display}</strong> {ing.source.name}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-xl leading-relaxed sm:text-2xl">{step?.text}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {step?.temperatureC ? (
            <span className="rounded-lg border border-line px-3 py-2 text-sm">
              {step.temperatureC} °C
              {step.temperatureMode ? ` · ${TEMPERATURE_MODE_LABELS[step.temperatureMode]}` : ''}
            </span>
          ) : null}
          {step?.durationMinutes ? <Timer minutes={step.durationMinutes} key={step.id} /> : null}
        </div>

        {/* The whole list, without leaving the step you are on. */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="cursor-pointer text-sm text-muted underline-offset-2 hover:text-accent hover:underline"
          >
            {showAll ? 'Zutaten ausblenden' : 'Alle Zutaten anzeigen'}
          </button>
          {showAll ? (
            <ul className="mt-3 space-y-1 text-sm">
              {scaled.ingredients.map((ing) => (
                <li key={ing.source.id} className="flex gap-2">
                  <span className="min-w-[5.5rem] shrink-0 text-right font-medium tabular-nums">
                    {ing.display}
                  </span>
                  <span>{ing.source.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-16 mt-8 flex gap-3 border-t border-line bg-paper py-4 md:bottom-0">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} className={`${buttonClass()} flex-1 py-4`}>
          Zurück
        </button>
        {index === steps.length - 1 ? (
          <Link href={`/rezepte/${recipe.slug}`} className={`${buttonClass('primary')} flex-1 py-4`}>
            Fertig
          </Link>
        ) : (
          <button type="button" onClick={() => go(1)} className={`${buttonClass('primary')} flex-1 py-4`}>
            Weiter
          </button>
        )}
      </div>
    </div>
  );
}

/** Keeps the screen on while cooking mode is open, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        if (!('wakeLock' in navigator)) return;
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Denied, unsupported, or the tab is hidden — cooking still works.
      }
    };

    // The lock is dropped whenever the tab is backgrounded; take it again.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, []);
}

/**
 * A timer you can hear.
 *
 * Vibration alone is useless when the phone is propped against a bowl on the
 * other side of the counter, so this also beeps. The tone is synthesised rather
 * than loaded, because an audio file would have to survive the offline cache
 * and a deploy to be there at the one moment it matters.
 */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + i * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.45 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.45 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.45);
      osc.stop(now + i * 0.45 + 0.3);
    }
    setTimeout(() => void ctx.close().catch(() => {}), 2000);
  } catch {
    // No audio permission or no output device — the vibration still fires.
  }
}

function Timer({ minutes }: { minutes: number }) {
  const [remaining, setRemaining] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  const finished = remaining <= 0;
  const alerted = useRef(false);

  useEffect(() => {
    if (!running || finished) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [running, finished]);

  useEffect(() => {
    if (finished && running && !alerted.current) {
      alerted.current = true;
      setRunning(false);
      beep();
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 400]);
    }
  }, [finished, running]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        finished ? 'border-accent bg-accent-soft' : 'border-line'
      }`}
    >
      <span
        aria-live={running ? 'off' : 'polite'}
        className={`tabular-nums ${finished ? 'font-semibold text-accent' : ''}`}
      >
        {mm}:{ss}
      </span>
      <button
        type="button"
        onClick={() => {
          if (finished) {
            alerted.current = false;
            setRemaining(minutes * 60);
            setRunning(false);
          } else {
            setRunning((r) => !r);
          }
        }}
        className="min-h-9 cursor-pointer px-1 text-accent underline-offset-2 hover:underline"
      >
        {finished ? 'zurücksetzen' : running ? 'Pause' : 'Start'}
      </button>
    </span>
  );
}
