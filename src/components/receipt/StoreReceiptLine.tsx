"use client";

import { memo, useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { ReceiptLine } from "@/components/receipt/ReceiptLine";
import { useSessionStore } from "@/lib/store";
import type { Participant } from "@/lib/types";

// Общая константа: селектор без отметок не возвращает новый [] на каждый вызов
const EMPTY: never[] = [];

type Props = {
  itemId: string;
  meId: string | null;
  canEdit: boolean;
  onToggle: (itemId: string) => void;
  onPriceChange: (itemId: string, grosze: number) => void;
};

// Строка чека, подписанная только на свою позицию и своих отметивших: тап по одной строке
// не перерисовывает остальные (ReceiptLine — презентационная, в memo).
// Селекторы отдают плоские примитивы: снимок из транспорта приходит новыми объектами (JSON / BroadcastChannel),
// и сравнение по ссылкам перерисовывало бы все строки после каждого тапа.
export const StoreReceiptLine = memo(function StoreReceiptLine({ itemId, ...rest }: Props) {
  const fields = useSessionStore(
    useShallow((s): [string, number] | never[] => {
      const item = s.session?.items.find((i) => i.id === itemId);
      return item ? [item.name, item.priceGrosze] : EMPTY;
    }),
  );
  // [id, name, color, isHost] подряд на каждого отметившего, в порядке входа, как в split.ts
  const flat = useSessionStore(
    useShallow((s): (string | boolean)[] => {
      const ids = s.session?.claims[itemId];
      if (!s.session || !ids?.length) return EMPTY;
      return s.session.participants.filter((p) => ids.includes(p.id)).flatMap((p) => [p.id, p.name, p.color, p.isHost]);
    }),
  );

  const item = useMemo(
    () => (fields.length === 2 ? { id: itemId, name: fields[0], priceGrosze: fields[1] } : null),
    [itemId, fields],
  );
  const claimers = useMemo(() => {
    const result: Participant[] = [];
    for (let i = 0; i < flat.length; i += 4) {
      result.push({ id: flat[i] as string, name: flat[i + 1] as string, color: flat[i + 2] as string, isHost: flat[i + 3] as boolean });
    }
    return result;
  }, [flat]);

  if (!item) return null;
  return <ReceiptLine item={item} claimers={claimers} {...rest} />;
});
