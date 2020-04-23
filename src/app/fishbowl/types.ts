export interface Game {
  uid?: string;
  label: string;
  gameDateTime?: string;
  playerCount?: number;
  timer?: {
    seconds: number;
  };
}