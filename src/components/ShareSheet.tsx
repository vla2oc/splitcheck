"use client";

import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { Sheet } from "@/components/Sheet";
import { copyText } from "@/lib/clipboard";
import { spring } from "@/lib/motion";
import { formatBlik, useSessionStore } from "@/lib/store";

type Props = { open: boolean; onClose: () => void; sessionId: string; merchant?: string; blikPhone?: string };

// Шит «Udostępnij» хоста — docs/SPEC.md «Экраны → 3 → Шит „Udostępnij“»
export function ShareSheet({ open, onClose, ...rest }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Udostępnij paragon">
      {/* Содержимое монтируется только открытым — window.location читается в браузере */}
      <ShareContent {...rest} />
    </Sheet>
  );
}

function ShareContent({ sessionId, merchant, blikPhone }: Omit<Props, "open" | "onClose">) {
  const url = `${window.location.origin}/s/${sessionId}`;
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!(await copyText(url))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function share() {
    // navigator.share тоже только в secure context; нет его — копируем
    if (!navigator.share) return copyLink();
    try {
      await navigator.share({ title: merchant ?? "Paragon", url });
    } catch {
      // пользователь закрыл системный шит — это не ошибка
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2">
        {/* Белая плашка с тёмными модулями: инвертированный QR читают не все сканеры. fill не понимает var() → hex = --oxford */}
        <div className="rounded-[20px] bg-white p-2">
          <QRCodeSVG value={url} size={220} level="M" marginSize={2} fgColor="#0e0929" bgColor="#ffffff" />
        </div>
        <p className="max-w-full truncate font-mono text-xs text-text-muted">{url}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <motion.button
          type="button"
          onClick={copyLink}
          whileTap={{ scale: 0.96 }}
          transition={spring.snappy}
          className="h-12 rounded-full border border-border bg-surface-1 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vista"
        >
          {copied ? "Skopiowano" : "Kopiuj link"}
        </motion.button>
        <motion.button
          type="button"
          onClick={share}
          whileTap={{ scale: 0.96 }}
          transition={spring.snappy}
          className="h-12 rounded-full bg-vista font-medium text-on-vista hover:bg-vista-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vista"
        >
          Udostępnij…
        </motion.button>
      </div>
      <BlikField blikPhone={blikPhone} />
    </div>
  );
}

function BlikField({ blikPhone }: { blikPhone?: string }) {
  const setBlikPhone = useSessionStore((state) => state.setBlikPhone);
  const [value, setValue] = useState(blikPhone ? formatBlik(blikPhone) : "");
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const ok = setBlikPhone(value);
    setInvalid(!ok);
    if (ok) {
      // Показываем нормализованный номер из стора
      const saved = useSessionStore.getState().session?.blikPhone;
      setValue(saved ? formatBlik(saved) : "");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <label htmlFor="blik" className="text-sm text-text-muted">
        Numer do BLIK (opcjonalnie)
      </label>
      <input
        id="blik"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        inputMode="tel"
        autoComplete="tel-national"
        enterKeyHint="done"
        placeholder="600 123 456"
        aria-invalid={invalid}
        aria-describedby={invalid ? "blik-error" : undefined}
        className={`h-12 rounded-2xl border bg-surface-1 px-4 font-mono text-base tabular-nums outline-none placeholder:text-text-muted ${invalid ? "border-danger" : "border-border focus:border-vista"}`}
      />
      {invalid && (
        <p id="blik-error" className="text-sm text-danger">
          Wpisz 9 cyfr numeru telefonu.
        </p>
      )}
    </form>
  );
}
