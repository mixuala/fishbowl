import { Observable } from 'rxjs';

export type PlayerListByUids = string[];

export type PlayerByUids = {
  [uid:string]: string
}

export type CheckInByUids = {
  [uid:string]: string | boolean
}

export interface GameCodeEntry{
  gameId: string;
  created: number;
}

export interface UserGameEntry{
  gameId?: string;
  label: string;
  gameTime: number;
  stageName: string;
  modified?: number;
}
export interface UserGames {
  [gameId:string]: UserGameEntry;
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
  isGameOpen?: boolean;
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
  teams?: TeamRosters;    // final team roster
  public?: boolean;
  doPassThePhone?: boolean;
  quickPlay?:string;
  gameCode?:string;
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
 * - manage isActive(game) BEFORE loadRounds()
 * - triggers cloudAction for all users
 * - monitor changes in Game.doInterstitials()
 */
export interface GameAdminState {
  // key: Game.uid
  // checkIn is NOT connected to an active round
  gameId: string;         // backref for cleanup
  timestamp?: number | Object;
  changedKeys?: string[];
  doPlayerUpdate?: boolean; 
  // UX state variables
  doPlayerWelcome?: boolean;
  doCheckIn?: boolean;
  checkInComplete?: boolean;
  doTeamRosters?:boolean;
  teamRostersComplete?:boolean;
  // admin states 
  gameComplete?: boolean;

  /**
   * 
   * additional private attrs for internal processing
      _deviceId: for detecting local state changes
      _rid: roundId or gameId
      _isBootstrap: used to detect countdownTimer elapsed vs offset time
          isReloadWhileTicking = isBootstrap && isTicking;
   *
   */
  
}

export interface Spotlight {
  teamIndex: number;
  playerIndex: number[];
  teamName?: string;
}

export interface GamePlayState extends GameAdminState {
  // key: GamePlayRound.uid
  spotlight: Spotlight;
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
  doBeginGameRound?: number;
  doBeginPlayerRound?: boolean;
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
  playerName: string;
  teamName: string;
  teamIndex?: number;
}

export enum RoundEnum {
  Taboo = 1,
  OneWord = 2,
  Charades = 3,
}

export interface GameDict {
  [uid: string]: Game | GamePlayRound | GamePlayWatch;
  game: Game;
  activeRound?: GamePlayRound;
  gamePlayWatch?: GamePlayWatch; 
}

export interface GameWatch {
  gameId: string,
  game$: Observable<Game>,
  hasManyRounds$: Observable<GamePlayRound[]>,
  gameDict$: Observable<GameDict>,
}

export interface GamePlayWatch {
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