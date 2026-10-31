"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { BottomBar } from "@/components/BottomBar";
import { NameSheet } from "@/components/NameSheet";
import { ClaimForBar } from "@/components/receipt/ClaimForBar";
import { PersonalReceipt } from "@/components/receipt/PersonalReceipt";
import { ReceiptPaper } from "@/components/receipt/ReceiptPaper";
import { ReceiptPrinter } from "@/components/receipt/ReceiptPrinter";
import { ReceiptTotals } from "@/components/receipt/ReceiptTotals";
import { StoreReceiptLine } from "@/components/receipt/StoreReceiptLine";
import { ShareSheet } from "@/components/ShareSheet";
import { Toast, type ToastMessage } from "@/components/Toast";
import { copyText } from "@/lib/clipboard";
import { simulateGuests } from "@/lib/devSimulate";
import { ReceiptHeader } from "@/components/ReceiptHeader";
import { spring } from "@/lib/motion";
import { allocated, itemSharesFor, shareOf, totalOf } from "@/lib/split";
import { loadSession, markGuestTab, readMe, subscribeSession, useSessionStore, writeMe } from "@/lib/store";
import type { Session } from "@/lib/types";

// cacheComponents без generateStaticParams: params — данные запроса, доступ только под Suspense
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md «With Cache Components»)
export default function SessionPage({ params }: PageProps<"/s/[id]">) {
  return (
    <Suspense fallback={null}>
      <SessionLoader params={params} />
    </Suspense>
  );
}

type Status = "loading" | "ready" | "missing";

function SessionLoader({ params }: { params: PageProps<"/s/[id]">["params"] }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const asGuest = searchParams.get("as") === "guest";
  const dev = searchParams.get("dev") === "1";
  const session = useSessionStore((state) => state.session);
  // Переход с главной — сессия уже в сторе. F5 / новая вкладка — ждём транспорт.
  // На сервере стор пуст → loading, как и при гидрации: без вспышки «Nie ma…»
  const [status, setStatus] = useState<Status>(() =>
    !asGuest && useSessionStore.getState().session?.id === id ? "ready" : "loading",
  );

  useEffect(() => {
    // До первого рендера экрана: иначе вкладка на миг унаследует «кто я» хоста из localStorage
    if (asGuest) markGuestTab(id);
    let active = true;
    loadSession(id).then((found) => {
      if (active) setStatus(found ? "ready" : "missing");
    });
    const unsubscribe = subscribeSession(id);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [id, asGuest]);

  // Сетевой load (Supabase) — сотни мс; на сервере тоже loading, поэтому разметка совпадает при гидрации
  if (status === "loading") {
    return (
      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col items-center justify-center px-4 text-center">
        <p className="text-text-muted">Wczytuję paragon…</p>
      </main>
    );
  }
  if (status === "missing" || !session || session.id !== id) {
    return (
      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-text-muted">Nie ma tego paragonu.</p>
        <Link href="/" className="flex min-h-12 items-center px-4 text-vista underline-offset-4 hover:underline">
          Zeskanuj paragon
        </Link>
      </main>
    );
  }
  return <SessionScreen session={session} dev={dev} />;
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// «Кто я» из localStorage; на сервере null — без hydration mismatch
// (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md)
function useMeId(sessionId: string) {
  return useSyncExternalStore(subscribeStorage, () => readMe(sessionId), () => null);
}

function SessionScreen({ session, dev }: { session: Session; dev: boolean }) {
  const toggleClaim = useSessionStore((state) => state.toggleClaim);
  const addParticipant = useSessionStore((state) => state.addParticipant);
  const updateItemPrice = useSessionStore((state) => state.updateItemPrice);
  // Тап гостя без имени: позиция ждёт, пока он не введёт имя
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  // Хост: за кого отмечаются позиции (ClaimForBar); null — за себя
  const [claimForId, setClaimForId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const closePersonal = useCallback(() => setPersonalOpen(false), []);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const hideToast = useCallback(() => setToast(null), []);
  const meId = useMeId(session.id);
  const me = session.participants.find((p) => p.id === meId);
  const total = totalOf(session);

  // Критерий 5 фазы 3: инвариант split.ts на живых данных; в production не выполняется
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const sum = session.participants.reduce((acc, p) => acc + shareOf(session, p.id), 0);
    if (sum !== totalOf(session)) console.error("[split] Σ shareOf ≠ total", { sum, total: totalOf(session) });
  }, [session]);

  // Стабильные колбэки: строки чека в memo, новый колбэк на каждый рендер перерисовал бы все
  const sessionId = session.id;
  const handleToggle = useCallback(
    (itemId: string) => {
      // Читаем заново, а не из рендера: смена ключа meKey в DevTools не вызывает перерисовку
      const fresh = useSessionStore.getState().session;
      const current = fresh?.participants.find((p) => p.id === readMe(sessionId));
      if (!fresh || !current) {
        setPendingItemId(itemId);
        return;
      }
      navigator.vibrate?.(10);
      const forOther = current.isHost && claimForId !== null && fresh.participants.some((p) => p.id === claimForId);
      toggleClaim(itemId, forOther ? claimForId : current.id);
    },
    [sessionId, claimForId, toggleClaim],
  );
  const handlePriceChange = useCallback(
    (itemId: string, grosze: number) => updateItemPrice(itemId, grosze),
    [updateItemPrice],
  );

  async function copyBlik() {
    // В буфер — 9 цифр без пробелов: так их вставляют в поле перевода на телефон
    if (session.blikPhone && (await copyText(session.blikPhone))) setToast({ id: Date.now(), text: "Skopiowano" });
  }

  function handleName(name: string) {
    const id = addParticipant(name);
    if (!id || !pendingItemId) return;
    writeMe(session.id, id);
    navigator.vibrate?.(10);
    toggleClaim(pendingItemId, id); // исходный тап применяется после ввода имени
    setPendingItemId(null);
  }

  return (
    <>
      {dev && <DevSimulateButton />}
      {/* Под персональным чеком основной уезжает вниз и темнеет; без перепечатки при возврате */}
      <motion.main
        initial={false}
        animate={personalOpen ? { y: 48, opacity: 0.3 } : { y: 0, opacity: 1 }}
        transition={spring.smooth}
        className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-6 px-4 py-8"
      >
        <ReceiptHeader totalGrosze={total} allocatedGrosze={allocated(session)} />
        {me?.isHost && session.participants.length > 1 && (
          <ClaimForBar
            participants={session.participants}
            meId={me.id}
            activeId={claimForId ?? me.id}
            onSelect={setClaimForId}
          />
        )}
        {/* Скролл — страницы, не бумаги: --paper-max-h не задаём (docs/DECISIONS.md) */}
        <ReceiptPrinter sessionId={session.id} lines={session.items.length}>
          <ReceiptPaper title={session.merchant} subtitle="Paragon" createdAt={session.createdAt} code={session.id}>
            <ul role="list" className="flex flex-col">
              {session.items.map((item) => (
                <li key={item.id}>
                  <StoreReceiptLine
                    itemId={item.id}
                    meId={me?.id ?? null}
                    canEdit={me?.isHost ?? false}
                    onToggle={handleToggle}
                    onPriceChange={handlePriceChange}
                  />
                </li>
              ))}
            </ul>
            <ReceiptTotals
              itemsGrosze={total - session.serviceGrosze}
              serviceGrosze={session.serviceGrosze}
              unallocatedGrosze={total - allocated(session)}
              totalGrosze={total}
              canEdit={me?.isHost ?? false}
            />
          </ReceiptPaper>
        </ReceiptPrinter>
      </motion.main>
      <BottomBar
        shareGrosze={me ? shareOf(session, me.id) : 0}
        isHost={me?.isHost ?? false}
        blikPhone={session.blikPhone}
        onShare={() => setShareOpen(true)}
        onCopyBlik={copyBlik}
        canShowReceipt={me !== undefined && itemSharesFor(session, me.id).items.length > 0}
        onShowReceipt={() => setPersonalOpen(true)}
      />
      <PersonalReceipt open={personalOpen} session={session} me={me} onClose={closePersonal} onCopyBlik={copyBlik} />
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        sessionId={session.id}
        merchant={session.merchant}
        blikPhone={session.blikPhone}
      />
      <Toast toast={toast} onHide={hideToast} />
      <NameSheet open={pendingItemId !== null} onClose={() => setPendingItemId(null)} onSubmit={handleName} />
    </>
  );
}

// Только при ?dev=1. Одно нажатие — одна волна гостей; уход со страницы отменяет оставшиеся тапы
function DevSimulateButton() {
  const cancel = useRef<(() => void) | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => () => cancel.current?.(), []);

  return (
    <button
      type="button"
      disabled={started}
      onClick={() => {
        cancel.current = simulateGuests();
        setStarted(true);
      }}
      className="fixed top-3 right-3 z-30 min-h-10 rounded-full border border-border bg-surface-2 px-4 text-sm text-text-muted hover:text-text disabled:opacity-50"
    >
      {started ? "Goście tapają…" : "Symuluj gości"}
    </button>
  );
}
