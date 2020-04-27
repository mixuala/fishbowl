import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { withLatestFrom, map, switchMap, take, concatMap, share, tap } from 'rxjs/operators';

import * as dayjs from 'dayjs';

import { Helpful } from '../services/app.helpers';
import { FishbowlHelpers } from './fishbowl.helpers';
import { 
  Game, GamePlayRound, GameWatch, GameDict, RoundEnum,
  GamePlayWatch, GamePlayState,
  PlayerByUids, TeamRosters, 
} from './types';

@Injectable({
  providedIn: 'root'
})
export class GameHelpers {

  constructor(
    private db: AngularFireDatabase,
  ) {
  }

  getGames$(daysAgo=7):Observable<Game[]>{
    let d = dayjs().subtract(daysAgo, 'day').startOf('day').toDate();
    return this.db.list<Game>('games', 
      ref=>ref.orderByChild('gameTime').startAt( d.getTime() )
    ).snapshotChanges().pipe(
      FishbowlHelpers.pipeSnapshot2Data(),
      FishbowlHelpers.pipeSort('gameTime')
    )
  }

  getGameWatch(gameId:string):GameWatch{
    console.log("gameId=", gameId);

    let games = this.db.list<Game>(`/games`);
    let game_af = this.db.object<Game>(`/games/${gameId}`);
    let rounds_dbRef = this.db.database.ref('/games').child('/rounds');
    let hasManyRounds_af = this.db.list<GamePlayRound>('/rounds',
      ref=>ref.orderByChild('gameId').equalTo(gameId)
    );
    

    // game with no rounds built?
    let games$ = games.snapshotChanges().pipe(
      FishbowlHelpers.pipeSnapshot2Data(),
      FishbowlHelpers.pipeSort('gameTime'),
    )
    // games$.subscribe( (v)=>console.log("games$:", v));

    let hasManyRounds$ = hasManyRounds_af.valueChanges().pipe(
      FishbowlHelpers.pipeSort('round'),
    )
    let game$ = game_af.valueChanges();

    let gameDict$:Observable<GameDict> = hasManyRounds_af.valueChanges().pipe(
      withLatestFrom( game$ ),
      map( ([rounds,g])=>{
        let uidLookup:GameDict = {
          [gameId]: g
        };
        let gamePlay$: Observable<GamePlayState>;
        Object.entries(g.rounds).forEach( ([k,v])=>{
          let round = rounds.find( r=>r.round=v)
          uidLookup[k] = round;
          if (k==g.activeRound){
            uidLookup['activeRound'] = round
          }
        });
        return uidLookup;
      }),
    )
    return {
      gameId,
      game$,
      hasManyRounds$, // sorted
      gameDict$, // by key
    }
  }

  getGamePlay$(game:Game, gameDict:GameDict):GamePlayWatch{
    let uid = game.activeRound;
    let gamePlay$ = of(uid).pipe(
      switchMap( uid=>{
        if (uid) 
        // GamePlayRound hasOne GamePlayWatch, use SAME uid
          return this.db.object<GamePlayState>(`/gamePlay/${uid}`).valueChanges()
          .pipe( share() )
        else 
          return of({} as GamePlayState )
      })
    );
    return {uid, gamePlay$}
  }

  initGamePlayState(game:Game){
    let gamePlayState = {
      spotlight: {
        teamIndex: -1,  
        playerIndex: game.teamNames.map( v=>0 ),
      },
      timer: null,
      log: {},
      isTicking: false,
      timerPausedAt: null,
      word: null,
    }
    this.db.list<GamePlayState>('/gamePlay').update(game.activeRound, gamePlayState)
    .then( v=>{
      console.log("GameHelper.createGamePlayState() GamePlayState=", gamePlayState)
    });
  }

  pushGamePlayState(watch:GamePlayWatch, gamePlay:GamePlayState, ...changes):Promise<void>{
    // push to cloud
    let fields = changes.length ? [].concat(...changes) : null;
    let update = Helpful.cleanProperties(gamePlay, fields);
    return this.db.list<GamePlayState>('/gamePlay').update(watch.uid, update)
    // .then( v=>{
    //   console.log("1> GameHelper.pushGamePlayState() update=", update)
    // });
  }

  scoreRound(gameId:string, round:GamePlayRound, ) {
    return;

    
    // copy results to GamePlayLog  path=/gamePlayLog/[gameId]
    let key = `round${round.round}`
    let value = Object.assign( {} , gamePlayLog[key], gamePlay.log);
    let gpl_update = {[key]: value};

    // update score, OR just summarize GamePlayLog
    let pointsGained = Object.values(gamePlay.log).filter( o=>o.result ).length
    
  }
  
}