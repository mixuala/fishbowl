
export interface GameAdmin {
}

export interface GameMaster {
}


export interface Player {
  uid: string;
  name: string;
  displayName?: string;
  teamId?: string; 
  teamName?: string;
  gamesPlayed: number;
  isAnonymous: boolean;
}

export interface TeamCaptain extends Player {
}

