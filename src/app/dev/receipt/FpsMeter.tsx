"use client";

import { useEffect, useState } from "react";

type Stats = { fps: number; worstMs: number; janky: number; frames: number };

// Только песочница (?fps=1): кадры с монтирования / Replay. Рывок — кадр дольше 1,5× медианы
// (порог сам подстраивается под 60 и 120 Гц). Цифры — для проверки на телефоне без DevTools.
export function FpsMeter() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const deltas: number[] = [];
    let last = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (last) deltas.push(now - last);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = setInterval(() => {
      if (deltas.length < 10) return;
      const sorted = [...deltas].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const total = deltas.reduce((sum, d) => sum + d, 0);
      setStats({
        fps: Math.round((deltas.length / total) * 1000),
        worstMs: Math.round(sorted[sorted.length - 1]),
        janky: deltas.filter((d) => d > median * 1.5).length,
        frames: deltas.length,
      });
    }, 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="fixed right-2 bottom-2 z-50 rounded-lg bg-black/80 px-2.5 py-1.5 font-mono text-[11px] leading-tight text-white tabular-nums">
      {stats ? (
        <>
          <div>{stats.fps} fps · max {stats.worstMs} ms</div>
          <div className={stats.janky > 0 ? "text-[#ffb4a2]" : "text-[#9ee6c4]"}>
            рывков: {stats.janky} / {stats.frames}
          </div>
        </>
      ) : (
        "…"
      )}
    </div>
  );
}
