export const spring = {
  snappy: { type: "spring", stiffness: 500, damping: 32 }, // тапы, тогглы, нажатия
  smooth: { type: "spring", stiffness: 260, damping: 28 }, // bottom sheets, layout
  bouncy: { type: "spring", stiffness: 420, damping: 18 }, // появление аватаров, галочка
} as const;

export const numberSpring = { stiffness: 120, damping: 20 }; // useSpring для сумм

// Чек-принтер: visualDuration + bounce — предсказуемое время, легко тюнить
export const receiptSpring = {
  print: (d: number) => ({ type: "spring", visualDuration: d, bounce: 0.12 }) as const,
  collapse: { type: "spring", visualDuration: 0.5, bounce: 0.2 }, // уход принтера
  select: { type: "spring", visualDuration: 0.25, bounce: 0.3 }, // галочка «моё»
  avatar: { type: "spring", visualDuration: 0.3, bounce: 0.45 },
  personal: { type: "spring", visualDuration: 1.1, bounce: 0.12 },
  arrive: { type: "spring", visualDuration: 0.45, bounce: 0.25 }, // принтер въезжает сверху
  tug: { type: "spring", visualDuration: 0.12, bounce: 0 }, // рывок отрыва бумаги
  tear: { type: "spring", visualDuration: 0.6, bounce: 0.55 }, // бумага качнулась и успокоилась
} as const;
