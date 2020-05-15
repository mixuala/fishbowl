import { Component, OnInit, SimpleChange, Input, Output, EventEmitter } from '@angular/core';

import { Observable, zip, Subject } from 'rxjs';
import { first, tap, takeUntil, withLatestFrom } from 'rxjs/operators';

import { Game, GamePlayState, TeamRosters, GameDict, PlayerByUids, GamePlayRound, SpotlightPlayer, } from '../../types';
import { Player } from '../../../user/role';
import { FishbowlHelpers } from '../../fishbowl.helpers';
import { Helpful } from '../../../services/app.helpers';

/**
 * usage:
 *    <app-team-roster 
 *      [gameDict$]="gameWatch?.gameDict$" 
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

  public teamNames: string[];
  public teamRostersAsRows: any[];
  public spotlight: SpotlightPlayer;
  public isModerator = false;
  private done$:Subject<void>;
  private gameDict:GameDict;

  @Input() gameDict$:Observable<GameDict>;
  
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
    let checkedInPlayers:PlayerByUids = Object.entries(combined).reduce( (o, [pid, v])=>{
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
    newPlayerIds.forEach( (v,i)=>copyTeams[ i%2 ].push(v) );
    return { 
      teams: copyTeams, 
      players: checkedInPlayers,
    };
  }

  getSpotlight(gameDict) {
    let {activeRound, gamePlayWatch} = gameDict;
    if (activeRound) {
      gamePlayWatch.gamePlay$.pipe(
        takeUntil(this.done$),
        withLatestFrom(this.gameDict$), 
      ).subscribe( ([gamePlay, d])=>{
        let round = d.activeRound;
        this.spotlight = FishbowlHelpers.getSpotlightPlayer(gamePlay, round)
      });
    }
  }

  getRostersForDisplay( teams:TeamRosters, players: PlayerByUids ){
    let rosters = Object.entries(teams).map( ([teamName, playerIds])=>{
      return playerIds.map( v=>{
        return {
          uid: v,
          displayName: players[v],
          teamName,
        }
      });
    });
    let teamRosters = Helpful.zip( rosters, null)
    return teamRosters
  }

  watchGame(gameDict$:Observable<GameDict>) {
    this.done$.next();
    this.done$ = new Subject();
    gameDict$.pipe(
      takeUntil(this.done$),
      tap( gameDict=>{
        let rosterData = FishbowlHelpers.getLatestRoster(gameDict);
        if (!rosterData) return

        let {teams, players} = this.mergeRosterWithCheckIns(rosterData, gameDict);
        this.teamNames = Object.keys(teams);
        this.teamRostersAsRows = this.getRostersForDisplay(teams, players);
        this.getSpotlight(gameDict);
        this.gameDict = gameDict;
      }),
    ).subscribe();
  }

  constructor() {
    this.done$ = new Subject();
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
      }
    });
  }


  doPlayerClick(item) {
    if (!this.isModerator) return;
    this.switchTeams(item)

  }

  switchTeams(item:any){
    if (!this.isModerator) return;

    let rosterData = FishbowlHelpers.getLatestRoster(this.gameDict);
    let copyTeams = Object.entries(rosterData.teams).reduce( (o, [k,v])=>(o[k]=v.slice(),o), {});
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
