// Дословно из docs/SPEC.md «Данные → Состояние сессии». Все деньги — целые гроши.
export type Participant = { id: string; name: string; color: string; isHost: boolean };
export type Item = { id: string; name: string; priceGrosze: number };

export type Session = {
  id: string;
  merchant?: string;
  items: Item[];
  serviceGrosze: number;
  participants: Participant[];
  claims: Record<string /* itemId */, string[] /* participantIds */>;
  blikPhone?: string;
  createdAt: number;
};
