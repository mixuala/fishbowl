import { Observable } from 'rxjs';

export interface Game {
  uid: string;
  label: string;
  gameTime: number;
  timezoneOffset: number;
  playerCount?: number;
  players?: {
    [uid:string]: string;
  }
  entries?: {
    [uid:string]: string[]
  }
  teamNames?: string[],
  rounds?: {
    [rid: string]:  number // Date.now() or RoundTypeEnum
  }
  // TODO: rename activeRoundId
  activeRound?: string;
  complete?: boolean;
}

// TODO: refactor
export interface FishbowlWords {
  [word:string]: boolean
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
  },
  complete?: boolean;

}
export interface WordResult {
  teamName: string;
  playerName: string;
  result: boolean;
  word: string;
  time?: number;
}

export interface GamePlayState {
  spotlight:{
    teamIndex: number;   
    playerIndex: number[];
  }
  timer: {
    seconds?: number;
    key?: number;
    pause?: boolean;
  };
  log: GamePlayLogEntries;
  // activePlayer and game master must have access:
  isTicking: boolean;
  word: string;
  remaining: number;   
  timerPausedAt: number;
  playerRoundComplete?: boolean;
  roundComplete?: boolean;
}

export interface GamePlayLogEntries {
  [timestampDesc: number]: WordResult
}

export interface GamePlayLog {
  round1: GamePlayLogEntries,
  round2: GamePlayLogEntries,
  round3: GamePlayLogEntries
}

export type PlayerByUids = string[];

export interface TeamRosters {
  [teamName:string]: PlayerByUids
}

export interface SpotlightPlayer {
  uid: string;
  label: string;
  teamName: string;
}

export enum RoundEnum {
  Taboo = 1,
  OneWord = 2,
  Charades = 3,
}

export interface GameDict {
  [uid: string]: Game | GamePlayRound;
  activeRound?: GamePlayRound;
}

export interface GameWatch {
  gameId: string,
  game$: Observable<Game>,
  hasManyRounds$: Observable<GamePlayRound[]>,
  gameDict$: Observable<GameDict>,
}

// TODO: refactor, uid=>roundId
export interface GamePlayWatch {
  uid: string;  // activeRound.uid
  gamePlay$: Observable<GamePlayState>;
  gameLog$: Observable<GamePlayLog>;
}

export interface RoundTeamScore {
  [teamName:string]: {
    points: number;
    passed: number;
  }
}
export interface Scoreboard {
  round1: RoundTeamScore;
  round2: RoundTeamScore;
  round3: RoundTeamScore;
  total: RoundTeamScore;
}