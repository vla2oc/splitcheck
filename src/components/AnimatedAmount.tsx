"use client";

import { useEffect } from "react";
import { motion, useSpring, useTransform } from "motion/react";
import { numberSpring } from "@/lib/motion";

type Props = { grosze: number; format: (grosze: number) => string; className?: string };

// Пружина отдаёт дробные гроши — округляет сам format (formatPLN / formatAmount), не компонент
export function AnimatedAmount({ grosze, format, className }: Props) {
  const value = useSpring(grosze, numberSpring);
  const text = useTransform(value, format);

  // useSpring(number) пружинит только на .set() — node_modules/framer-motion/dist/index.d.ts «useSpring»
  useEffect(() => {
    value.set(grosze);
  }, [value, grosze]);

  return <motion.span className={`font-mono tabular-nums ${className ?? ""}`}>{text}</motion.span>;
}
