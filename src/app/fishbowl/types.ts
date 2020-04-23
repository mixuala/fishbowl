export interface Game {
  uid?: string;
  label: string;
  gameDateTime?: string;
  playerCount?: number;
  players?: {
    [uid:string]: string;
  }
  entries?: {
    [uid:string]: string[]
  }
  timer?: {
    seconds: number;
  };
  lineup?:number[]
  spotlightIndex?: number
}

export interface SpotlightPlayer {
  uid: string;
  displayName: string;
}