import { Component, OnInit, SimpleChange, Input, Output, EventEmitter } from '@angular/core';

import { Observable, zip, Subscription } from 'rxjs';
import { first, tap, pairwise, startWith, filter } from 'rxjs/operators';

import { Game, GamePlayState, WordResult, GamePlayLogEntries, } from '../../types';
import { Player } from '../../../user/role';


/**
 * usage:
 *    <app-score-card [gamePlay$]="" 
 *      asModerator="true" [game$]="" [player$]="" (onChanged)="pushGameLog($event)"
 *    ></app-score-card>
 */
@Component({
  selector: 'app-score-card',
  templateUrl: './score-card.component.html',
  styleUrls: ['./score-card.component.scss'],
})
export class ScoreCardComponent implements OnInit {

  public PLAYER_ROUND_COMPLETE_DELAY = 1000;
  public isModerator = false;
  public lastResult:WordResult;
  private changes:GamePlayLogEntries = {};
  private done:Subscription;

  @Input() gamePlay$:Observable<GamePlayState>;

  @Input() game$:Observable<Game>;

  @Input() player$:Observable<Player>;

  @Input() asModerator:boolean = false;

  @Output() onGameLogChanged = new EventEmitter<GamePlayLogEntries>();


  getLog(gamePlay:GamePlayState) {
    if (!this.isModerator) return gamePlay.log;
    return Object.assign( {}, gamePlay.log, this.changes);
  }

  authorize(){
    if (this.asModerator && this.game$ && this.player$) {
      zip( this.game$, this.player$).pipe( first(), ).toPromise()
      .then( ([g,p])=>{
        this.isModerator = !!g.moderators[p.uid];
      })
    }
    else this.isModerator = false;
  }

  doReset(){
    this.changes = {};
    this.lastResult = null;
    // TODO: need to refresh the component
  }

  toggleChange( v:{key:number, value:WordResult}, ev:CustomEvent){
    let {word, result, playerName, teamName} = v.value;
    let update = { 
      word, 
      result: ev.target['checked'],
    } as Partial<WordResult>;
    let logEntry = {[v.key]: update} as GamePlayLogEntries;
    // emit changes immediately
    this.onGameLogChanged.emit( logEntry );
    // console.log("126: >>> update gamePlay.log changes=", logEntry);
    // this.changes = Object.assign({}, this.changes, logEntry);
  }

  constructor() { }

  ngOnInit() {
  }

  ngOnDestroy() {
    this.done && this.done.unsubscribe();
  }

  watchGamePlay( gamePlay$: Observable<GamePlayState>){
    console.warn("\t\t### 123:  watchGamePlay()")
    this.done = gamePlay$.pipe(
      filter( v=>!!v),
      // tap( v=>console.log("### 123: v.playerRoundComplete=", v.playerRoundComplete)),
      startWith(null),
      pairwise(),
      tap( gamePlayChange=>{
        let [prev, cur] = gamePlayChange;
        let isFirst = prev===null
        let changed = isFirst ? cur : Object.keys(cur).filter( k=>cur[k]!==prev[k]).reduce( (o,k)=>(o[k]=cur[k],o), {}) as GamePlayState;

        if (!!changed.playerRoundComplete) {
          let changes = Object.assign({}, this.changes);
          this.doReset();
          // (NOT USED) nowposting changes to gamePlay in REAL TIME, so the spotlight player can see updates
          // WARNING: must emit before gamePlay.gameRoundComplete
          // console.warn( "\t\t\t###126:0 playerRoundComplete gameLog changes =", changes)
          // setTimeout( ()=>{
          //   console.warn( "\t\t\t###126:1 playerRoundComplete gameLog changes =", changes)
          //   this.onGameLogChanged.emit( changes );
          // }, this.PLAYER_ROUND_COMPLETE_DELAY);
        }
        else if (!!changed.playerRoundBegin) {
          return this.doReset()
        }
        if (changed.log) {
          let keys = Object.keys(changed.log);
          this.lastResult = changed.log[ keys[keys.length-1] ];
        }
      })
    ).subscribe();
  }

  ngOnChanges(o) {
    Object.entries(o).forEach( (en:[string, SimpleChange])=>{
      let [k, change] = en;
      switch(k){
        case "gamePlay$":{
          // console.log("2: ### ngOnChanges gamePlay$")
          if (this.asModerator){
            if (this.done) this.done.unsubscribe();
            // called on every reload or gamePlay update
            // console.log("3: ### watchGamePlay")
            this.watchGamePlay(this.gamePlay$);
          }
        }
        case "player$":
        case "game$":{
          this.authorize(); break;
        }
      }
    });
  }

}
