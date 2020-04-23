export interface Game {
  uid?: string;
  label: string;
  gameDateTime?: string;
  timer?: {
    seconds: number;
  };
}