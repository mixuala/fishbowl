import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import { Observable, BehaviorSubject, of, combineLatest, from, empty } from 'rxjs';
import { withLatestFrom, map, switchMap, take, concatMap, share, tap, mergeMap } from 'rxjs/operators';

import * as dayjs from 'dayjs';

import { Helpful } from '../services/app.helpers';
import { FishbowlHelpers } from './fishbowl.helpers';
import { 
  Game, GamePlayRound, GameWatch, GameDict, RoundEnum,
  GamePlayWatch, GamePlayState,
  PlayerByUids, TeamRosters, GamePlayLog, WordResult, Scoreboard, 
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
          let round = rounds.find( r=>r.round==v)
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
          .pipe( 
            // TODO: sort gamePlay.log desc
            share() 
          )
        else 
          return of({} as GamePlayState )
      })
    );
    let gameLog$ = of(uid).pipe(
      switchMap( uid=>{
        if (uid) 
        // GamePlayRound hasOne GamePlayLog, use SAME uid
          return this.db.object<GamePlayLog>(`/gameLog/${uid}`).valueChanges()
          .pipe( 
            // TODO: sort gamePlayLog.values desc
            share() 
          )
        else 
          return of({} as GamePlayLog )
      })
    );    
    return {uid, gamePlay$, gameLog$}
  }

  loadNextRound(gameDict:GameDict, gameId: string, ):Promise<GamePlayRound>{
    if (gameDict.activeRound) return Promise.resolve(gameDict.activeRound);

    // find next round and make active
    let game = gameDict[gameId] as Game;
    let sortedByRoundNumber = Object.entries(game.rounds).sort( (a,b)=>a[1]-b[1] );
    let found = sortedByRoundNumber.find( ([rid,roundNumber])=>{
      // find the next round that is not complete
      return !(gameDict[rid] as GamePlayRound).complete;
    });
    if (found) {
      // beginRound()
      let waitFor:Promise<void>[] = [];
      let [rid, _] = found;
      let updateGame = { 
        activeRound: rid 
      } as Game;
      waitFor.push( this.db.object<Game>(`/games/${gameId}`).update(updateGame) );

      let updateRound = { 
        startTimeDesc: -Date.now(),
        complete: false
      } as GamePlayRound;
      waitFor.push( this.db.object<GamePlayRound>(`/rounds/${rid}`).update(updateRound) );

      game.activeRound = rid;
      waitFor.push( this.initGamePlayState(game) );

      return Promise.all( waitFor ).then( ()=>{
        gameDict.activeRound = gameDict[rid] as GamePlayRound;
        // update cloud
        return gameDict.activeRound;
      })

    }
    return Promise.resolve(null);
  }

  initGamePlayState(game:Game):Promise<void>{
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
    let uid = game.activeRound;
    return this.db.list<GamePlayState>('/gamePlay').update(uid, gamePlayState)
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


  moveSpotlight(watch:GamePlayWatch, round:GamePlayRound, nextTeam=true ) :Promise<void>{
    let {uid, gamePlay$} = watch;
    return new Promise( (resolve, reject)=>{
      gamePlay$.pipe(
        take(1),
        tap( (gamePlay)=>{       
          
          if (!gamePlay) return;  // round is complete


          let spotlight = Object.assign( {} , gamePlay && gamePlay.spotlight );
          let teamRosters = Object.values(round.teams);
          let limits = {
            teamIndex: teamRosters.length,
            playerIndex: teamRosters.map( v=>v.length)
          }
          if (nextTeam){
            // increment team first
            spotlight.teamIndex +=1;
            if (spotlight.teamIndex >= limits.teamIndex){
              // after last team, 
              spotlight.teamIndex = 0;
              // increment players
              spotlight.playerIndex = spotlight.playerIndex.map( (v,i)=>{
                v +=1;
                return v >= limits.playerIndex[i] ? 0 : v;
              });
            }
          } else {
            // increment player on the SAME team
            if (spotlight.teamIndex == -1) spotlight.teamIndex = 0;
            let i = spotlight.teamIndex;
            spotlight.playerIndex[ i ] += 1;
            if (spotlight.playerIndex[ i ] >= limits.playerIndex[ i ]) spotlight.playerIndex[ i ] = 0;
          }

          let update = {
            spotlight,
            timer: null,
            log: {},
            isTicking: false,
            timerPausedAt: null,
            word: null,
          } as GamePlayState;
          this.pushGamePlayState(watch, update).then( ()=>{
            resolve();
          });
        }),
      ).subscribe();
    });  
  }


  /**
   * update GamePlayLog with the lastest values from the player round, gamePlay.log
   * - reset gamePlay.log in completePlayerRound()
   * @param watch 
   * @param round 
   */
  pushGameLog(watch:GamePlayWatch, round:GamePlayRound ) :Promise<void>{
    let {uid, gamePlay$, gameLog$} = watch;
    return new Promise( (resolve, reject)=>{
      combineLatest( gamePlay$, gameLog$ ).pipe(
        take(1),
        tap( res=>{
          let [gamePlay, gameLog] = res;
          gameLog = gameLog || {} as GamePlayLog;
  
          // copy results to GamePlayLog  path=/gamePlayLog/[gameId]
          let key = `round${round.round}`
          let curVal = gameLog[key]  as {[timestampDesc: number]: WordResult};
          let value = Object.assign( {} , gameLog[key], gamePlay.log)  as {[timestampDesc: number]: WordResult};
          let update = {[key]: value};
          return this.db.list<GamePlayLog>('/gameLog').update(watch.uid, update)
          .then( v=>{
            console.log("1> GameHelper.pushGameLog() update=", update);
            // update score from gameLog
            gameLog = Object.assign(gameLog, update);
            resolve();
          });
        }),   
      ).subscribe();
    });
  }

  /**
   * from ionViewWillEnter(): 
   * 
   * every wordAction() emits a new gamePlayState
   * - triggers getSpotlightPlayer (TODO: only changes at the end of player round, move)
   * - triggers gameHelpers.scoreRound$()
   *    - pushGameLog()
   *    - tabulate score
   * - triggers doGamePlayUx()
   * 
   * SHOULD BE:
   * wordAction() => gamePlayState
   * x => scoreRound$( gameLog, gamePlay.log ) [do NOT push to gameLog during playerRound]
   * x => trigger doGamePlayUx()
   * 
   * onTimerDone => completePlayerRound()
   * - pushGameLog(), activeRound.log=null
   * - scoreRound$()
   * - moveSpotlight()
   * 
   * completeRound()
   * - activeRound.complete = true
   * - gameDict.activeRound=null
   * - pushRound()
   * ???: how/when do we begin the next round()?
   * => gameHelpers.getActiveRound()
   * 
   * @param watch 
   * @param activeRound 
   */
  scoreRound$(watch:GamePlayWatch, activeRound:GamePlayRound=null, gamePlay:GamePlayState=null) : Observable<Scoreboard>{
    let keyedByTeams = Object.keys(activeRound && activeRound.teams || {}).reduce( (o,teamName)=>(o[teamName]={}, o), {});
    let score:Scoreboard = {
      round1: Object.assign({}, keyedByTeams),
      round2: Object.assign({}, keyedByTeams),
      round3: Object.assign({}, keyedByTeams),
      total: Object.assign({}, keyedByTeams), 
    }

    let playerRound = gamePlay && gamePlay.log || {};
    let activeRoundKey = activeRound ?  `round${activeRound.round}` : null;  // for current round

    return of(playerRound).pipe(
      withLatestFrom( watch.gameLog$),
      map( ([playerRound, gameLog])=>{

        // move this section to FishbowlHelpers.tabulateScore(gameLog, {playerRound:{}, mergeKey: string})

        // update score, OR just summarize GamePlayLog
        Object.entries(gameLog).filter( ([k,_])=>k.startsWith('round')).forEach( ([key,o])=>{
          if (key==activeRoundKey) {
            // merge playerRound (uncommitted) to db value before scoring
            o = Object.assign({}, o, playerRound);
          }
          Object.values(o).forEach( (o:WordResult)=>{
            let {teamName, playerName, result, time} = o;
            score[key][teamName] = score[key][teamName] || {points:0, passed:0};
            let target = result ? 'points' : 'passed';
            score[key][teamName][target] +=1;
          });
          // update totals
          Object.keys(activeRound.teams).forEach( teamName=>{
            score['total'][teamName] =  {points:0, passed:0};
            Object.keys(score).filter( k=>k.startsWith('round')).forEach( key=>{
              if (score[key][teamName]) {
                score['total'][teamName]['points'] += score[key][teamName]['points'];
                score['total'][teamName]['passed'] += score[key][teamName]['passed'];  
              }
            });
          });
        });
        return score;
      }),
    )
  }



  
}