import { Observable } from 'rxjs';

export type PlayerListByUids = string[];

export type PlayerByUids = {
  [uid:string]: string
}

export type CheckInByUids = {
  [uid:string]: string | boolean
}

export interface Game {
  uid: string;
  label: string;
  gameTime: number;
  activeGame?: boolean;
  chatRoom?: string;
  timezoneOffset: number;
  playerCount?: number;
  players?: PlayerByUids;
  checkIn?: CheckInByUids;
  moderators?: {
    [uid:string]: boolean;
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
  players: PlayerByUids;
  complete?: boolean;

}
export interface WordResult {
  teamName: string;
  playerName: string;
  result: boolean;
  word: string;
  time?: number;
  modifiedBy?: string;
}

/**
 * HACK: push GameAdminState to `/gamePlay`
 * - manage Game.activeGame==true BEFORE loadRounds()
 * - triggers cloudAction for all users
 * - monitor changes in Game.doInterstitials()
 */
export interface GameAdminState {
  // key: Game.uid
  // checkIn is NOT connected to an active round
  gameId: string;         // backref for cleanup
  // UX state variables
  doPlayerUpdate?: boolean; 
  doCheckIn?: boolean;
  checkInComplete?: boolean;
  // admin states 
  gameComplete?: boolean;
}

export interface GamePlayState extends GameAdminState {
  // key: GamePlayRound.uid
  spotlight:{
    teamIndex: number;
    playerIndex: number[];
    teamName?: string;
  }
  timer: {
    seconds?: number;
    key?: number;
    pause?: boolean;
  };
  log: GamePlayLogEntries;
  // activePlayer and game master must have access:
  timerDuration: number;
  word: string;
  remaining: number[];   
  isTicking: boolean;
  // admin states
  timerPausedAt?: number;
  playerRoundBegin?: boolean;
  playerRoundComplete?: boolean;
  gameRoundComplete?: boolean;
}

export interface GamePlayLogEntries {
  [timestampDesc: number]: WordResult
}

export interface GamePlayLog {
  round1: GamePlayLogEntries,
  round2: GamePlayLogEntries,
  round3: GamePlayLogEntries
}


export interface TeamRosters {
  [teamName:string]: PlayerListByUids
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