import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ReceiptSandbox } from "./ReceiptSandbox";

// Песочница анимации чека — только для разработки
export default function DevReceiptPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // useSearchParams в песочнице — под Suspense (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md)
  return (
    <Suspense fallback={null}>
      <ReceiptSandbox />
    </Suspense>
  );
}
