export interface Game {
  uid: string;
  label: string;
  // TODO: convert to Date.now()
  gameDateTime?: string;
  playerCount?: number;
  players?: {
    [uid:string]: string;
  }
  entries?: {
    [uid:string]: string[]
  }
  teamNames: string[],
  rounds: {
    [rid: string]:  number // Date.now() or RoundTypeEnum
  }
  activeRound?: string;
  
    // deprecate below
  timer?: {
    seconds: number;
  }
  lineup?:number[]
  spotlightIndex?: number
}

export interface GamePlayRound {
  uid: string;
  gameId: string;
  round: RoundEnum;
  startTimeDesc: number;
  teams: TeamRosters;
  orderOfPlay: string[]
  entries: {
    // unique word: available
    // Object.entries(GamePlayRound.entries).filter( ([k,v])=>!!v ), then sample 1
    [word:string]: boolean,
  }
  players: {
    // player id:name
    [uid:string]: string;
  }
  spotlight:{
    // Object.entries(GamePlayRound.teams).map( [teamName, lineupOfPlayerUids]=>{ }), increment teamIndex, then playerIndex
    teamIndex: number;   
    playerIndex: number[];
  }
  lineup?:string[]; // deprecate
  spotlightIndex?: number;  // deprecate

  timer: {
    seconds: number;
  };
}

export type PlayerByUids = string[];

export interface TeamRosters {
  [teamName:string]: PlayerByUids
}

export interface SpotlightPlayer {
  uid: string;
  label: string;
}

export enum RoundEnum {
  Taboo = 1,
  OneWord = 2,
  Charades = 3,
}