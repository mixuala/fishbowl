
export interface GameAdmin {
}

export interface GameMaster {
}


export interface Player {
  uid: string;
  playingAsUid?: string; 
  displayName?: string;
  teamId?: string; 
  teamName?: string;
  gamesPlayed: number;
  isAnonymous: boolean;
}

export interface TeamCaptain extends Player {
}

