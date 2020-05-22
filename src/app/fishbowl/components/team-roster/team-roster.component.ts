import { Component, OnInit, SimpleChange, Input, Output, EventEmitter, } from '@angular/core';

import { Observable, zip, Subject } from 'rxjs';
import { first, tap, takeUntil, throttleTime } from 'rxjs/operators';

import { Game, GamePlayState, TeamRosters, GameDict, PlayerByUids, GamePlayRound, SpotlightPlayer, } from '../../types';
import { Player } from '../../../user/role';
import { FishbowlHelpers } from '../../fishbowl.helpers';
import { Helpful } from '../../../services/app.helpers';

/**
 * usage:
 *    <app-team-roster 
 *      [gameDict$]="gameWatch?.gameDict$" 
 *      [spotlight]="spotlight"
 *      asModerator="true" [player$]="player$"
 *      (onChange)="pushTeamRosters($event)"
 *    ></app-team-roster>
 */
@Component({
  selector: 'app-team-roster',
  templateUrl: './team-roster.component.html',
  styleUrls: ['./team-roster.component.scss'],
})
export class TeamRosterComponent implements OnInit {

  public teamNamesInPlayOrder: string[];
  public teams: TeamRosters;
  public teamRostersAsRows: any[];
  public isModerator = false;
  private done$:Subject<void>;
  private gameDict:GameDict;

  @Input() gameDict$:Observable<GameDict>;

  @Input() spotlight:SpotlightPlayer;         // spotlight.playerName, teamName used for .on-the-spot
  
  @Input() player$:Observable<Player>;

  @Input() asModerator:boolean = false;

  @Output() onChange = new EventEmitter<TeamRosters>();

  authorize(){
    if (this.asModerator && this.gameDict$ && this.player$) {
      zip( this.gameDict$, this.player$).pipe( first(), ).toPromise()
      .then( ([d,p])=>{
        this.isModerator = !!d.game.moderators[p.uid];
      })
    }
    else this.isModerator = false;
  }

  mergeRosterWithCheckIns(round:Partial<GamePlayRound>, gameDict: GameDict ):Partial<GamePlayRound>{
    let {players, checkIn} = gameDict.game;
    let combined = Object.assign({}, players, checkIn);
    let checkedInPlayers:PlayerByUids = Object.entries(checkIn).reduce( (o, [pid, v])=>{
      if (typeof v=='boolean' && v===false) {
        return o; // skip
      }
      o[pid] = players[pid];
      return o;
    },{});
    
    // remove departing players and add new checkIns
    let checkedInPlayerIds = Object.keys(checkedInPlayers);
    let lastRoundPlayerIds = Object.values(round.teams).reduce( (res, v)=>res.concat(v), [] );
    let newPlayerIds = checkedInPlayerIds.filter( k=>!lastRoundPlayerIds.includes(k));
    
    let copyTeams = {} as TeamRosters;
    Object.entries(round.teams).forEach( ([k,v])=>{
      // filter out players who have left game between rounds
      copyTeams[k] = v.filter( pid=>checkedInPlayerIds.includes(pid)).slice()
    });
    newPlayerIds.forEach( (v,i)=>copyTeams[ round.orderOfPlay[i%2] ].push(v) );
    return { 
      teams: copyTeams, 
      players: checkedInPlayers,
      orderOfPlay: round.orderOfPlay,
    };
  }

  getRostersForDisplay( teams:TeamRosters, players: PlayerByUids, orderOfPlay:string[] ){
    let rosters = orderOfPlay.map( (teamName)=>{
      let playerIds = teams[teamName];
      return playerIds.map( v=>{
        return {
          uid: v,
          displayName: players[v],
          teamName,
        }
      });
    })
    let teamRosters = Helpful.zip( rosters, null)
    return teamRosters
  }

  watchGame(gameDict$:Observable<GameDict>) {
    this.done$.next();
    this.done$ = new Subject();
    gameDict$.pipe(
      takeUntil(this.done$),
      throttleTime(100),
      tap( gameDict=>{
        let rosterData = FishbowlHelpers.getLatestRoster(gameDict);
        if (!rosterData) return

        let {teams, players, orderOfPlay} = this.mergeRosterWithCheckIns(rosterData, gameDict);
        this.teams = teams;
        this.teamNamesInPlayOrder = orderOfPlay;
        this.teamRostersAsRows = this.getRostersForDisplay(teams, players, orderOfPlay);
        this.gameDict = gameDict;
      }),
    ).subscribe();
  }

  constructor(
  ) {
    this.done$ = new Subject();
    this.teamRostersAsRows = [];
  }

  ngOnInit() {}

  ngOnDestroy() {
    this.done$.next();
  }


  ngOnChanges(o) {
    Object.entries(o).forEach( (en:[string, SimpleChange])=>{
      let [k, change] = en;
      switch(k){
        case "gameDict$": {
          if (!this.gameDict$) return
          this.watchGame(this.gameDict$);
          this.authorize();
          break;
        }
        case "player$":{
          this.authorize();
          break;
        }
        case "spotlight":{
          break;
        }
      }
    });
  }


  isOnlyPlayer(teamName) {
    
    return this.asModerator && this.teams[teamName].length==1;
  }

  doPlayerClick(item) {
    if (!this.isModerator) return;
    this.switchTeams(item)

  }

  switchTeams(item:any){
    if (!this.isModerator) return;

    let teams = this.teams;
    if (!teams) {
      let rosterData = FishbowlHelpers.getLatestRoster(this.gameDict);
      teams = rosterData.teams
    }
    let copyTeams = Object.entries(teams).reduce( (o, [k,v])=>(o[k]=v.slice(),o), {});
    let removeFromTeam = item.teamName;
    let addToTeam = Object.keys(copyTeams).filter( v=>v!=removeFromTeam).shift();
    if (copyTeams[removeFromTeam].length==1) {
      return
    }
    copyTeams[removeFromTeam] = copyTeams[removeFromTeam].filter( v=>v!=item.uid);
    copyTeams[addToTeam].push(item.uid);
    this.onChange.emit(copyTeams);
  }

}
