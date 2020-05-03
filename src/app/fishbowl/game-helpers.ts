import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import { Observable, of, combineLatest, } from 'rxjs';
import { withLatestFrom, map, switchMap, take, share, tap, first } from 'rxjs/operators';

import * as dayjs from 'dayjs';

import { Helpful } from '../services/app.helpers';
import { FishbowlHelpers } from './fishbowl.helpers';
import { 
  Game, GamePlayRound, GameWatch, GameDict, RoundEnum,
  GamePlayWatch, GamePlayState,
  PlayerListByUids, TeamRosters, GamePlayLog, WordResult, Scoreboard, GamePlayLogEntries, 
} from './types';


/* Firebase dbRef cheat sheet:

  games = this.db.list<Game>(`/games`);
  gamesByStartTime = this.db.list<Game>('games', 
      ref=>ref.orderByChild('gameTime').startAt( d.getTime() )
    )

  gameById = this.db.object<Game>(`/games/${gameId}`)
  roundById = this.db.object<GamePlayRound>(`/rounds/${rid}`)
  roundsByGameId = this.db.list<GamePlayRound>('/rounds',
      ref=>ref.orderByChild('gameId').equalTo(gameId)
    )

  activeRound$ = this.gameWatch.gameDict$.pipe()

  gamePlayByRoundId = this.db.object<GamePlayState>(`/gamePlay/${uid}`)
  gameLogByRoundId = this.db.object<GamePlayLog>(`/gameLogs/${uid}`)
  gamelogsByGameId = this.db.list<GamePlayRound>('/gameLogs',
      ref=>ref.orderByChild('gameId').equalTo(gameId)
    )
*/

/**
 *    Lifecycle Notes
 * 

   TODO: add lifecycle events:
    - onGameWillBegin()
    - onGameRoundWillBegin()
    - onPlayerRoundWillBegin()
    - onPlayerRoundDidBegin()
      - onGameRoundDidBegin()
      - onGameDidBegin()

    - onPlayerRoundDidEnd()
    - onGameRoundDidEnd()
    - onGameDidEnd()
  
ionViewWillEnter():
=> gameDict$:
  => loadGame$: [roundsByGameId, gameById] emit=>
    - set: gameDict, activeRound, game
    - set: gamePlayWatch if game.activeRound
      - [activeRoundId, gamePlayByRoundId$, gameLogByRoundId$]
  - set: stash.activeGame <= game.gameTime
  - set: player {name, teamId, teamName}
  => gamePlay$:  
    - set: wordsRemaining
    - set: spotlight
    - set: stash.onTheSpot ( implicit ROLE assignment )
    - set: tabulate scoreboard from gameLog, gamePlay.log
  => pairwise(gamePlay$)
    - doGamePlayUX()

wordAction(): (Role=onTheSpot)
=> gamePlay$
  - if !playerRound, call onPlayerRoundWillBegin()  (move to parent)
    => start timer
      - push gamePlay( { word, timer, isTicking } )      => UX
  - FishbowlHelpers.nextWord()
  - if wordsRemaining==0, 
    => call onPlayerRoundDidEnd()
  - if first word, (move to onPlayerRoundWillBegin) 
    - set spotlight
    => push gamePlay({word, remaining})  => UX
  - (next word)
    => push gamePlay( {log, word, })     => UX, update score, game-summary

onPlayerRoundWillBegin(): [TODO]
  - nextPlayerRound()
  - (wait for onTheSpot to startTimer, don't show first word until timer begins)

onPlayerRoundDidEnd(): 
  - completePlayerRound()
    - clear Timer
  - (Role=onTheSpot)
    - push gamePlay({ playerRoundComplete })     => UX
    => nextPlayerRound(), (move to onPlayerRoundWillBegin())

onGameRoundDidEnd():
- completePlayerRound() // deprecate, separate from onPlayerRoundDidEnd()
- completeGameRound()

completeGameRound()
  - move to onGameRoundDidEnd()

TODO: 
  - push all items that trigger UX changes into gamePlay
  - all UX actions triggered from cloud, e.g. sounds, animations, class manipulations, score, words remaining, timer 
    - move this.animate() from onTimerDone() => doGamePlayUX()
    - move scoreboard results into gamePlay, tabulate scores BEFORE push
  - flash intersitials at the end of playerRound, round, game
  - move nextPlayerRound() to onPlayerRoundWillBegin()



 */

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
      // or use Helpful.sortByIds() on uids
      FishbowlHelpers.pipeSort('round'),
    )
    let game$ = game_af.valueChanges();

    // NOTE: only emits when rounds change
    // DOES NOT emit when game changes
    let gameDict$:Observable<GameDict> = hasManyRounds_af.valueChanges().pipe(
      withLatestFrom( game$ ),
      map( ([rounds,g])=>{
        let uidLookup:GameDict = {
          [gameId]: g
        };
        if (!g.rounds) return uidLookup;

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

  getGamePlay(game:Game, gameDict:GameDict):GamePlayWatch{
    let gameId = game.uid || gameDict.activeRound.gameId;
    let rid = game.activeRound;
    let gamePlay$ = of(rid).pipe(
      switchMap( rid=>{
        if (rid) 
        // GamePlayRound hasOne GamePlayWatch, use SAME rid
          return this.db.object<GamePlayState>(`/gamePlay/${rid}`).valueChanges()
          .pipe( 
            // TODO: sort gamePlay.log desc
            share() 
          )
        else 
          return of({} as GamePlayState )
      })
    );
    let gameLog$ = of(gameId).pipe(
      switchMap( gameId=>{
        if (gameId) 
        // GamePlayRound hasOne GamePlayLog, use SAME gameId
          return this.db.object<GamePlayLog>(`/gameLogs/${gameId}`).valueChanges()
          .pipe( 
            // TODO: sort gamePlayLog.values desc
            share() 
          )
        else 
          return of({} as GamePlayLog )
      })
    );    
    return { uid:rid, gamePlay$, gameLog$}
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
    .then( v=>{
      // console.log("1> GameHelper.pushGamePlayState() update=", update)
    });
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
          spotlight.teamName =  Object.keys(round.teams)[spotlight.teamIndex];

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
   * - does NOT reset gamePlay.log
   * @param watch 
   * @param round 
   */
  pushGameLog(watch:GamePlayWatch, round:GamePlayRound ) :Promise<void>{
    let {uid, gamePlay$, gameLog$} = watch;
    let gameId = round.gameId;
    let rid = uid;
    return new Promise( (resolve, reject)=>{
      combineLatest( gamePlay$, gameLog$ ).pipe(
        take(1),
        tap( res=>{
          let [gamePlay, gameLog] = res;
          gameLog = gameLog || {} as GamePlayLog;
  
          // copy results to GamePlayLog  path=/gamePlayLog/[gameId]
          let roundKey = `round${round.round}`
          let curVal = gameLog[roundKey] as GamePlayLogEntries;
          let mergeLogEntries = Object.assign( {} , curVal, gamePlay.log) as GamePlayLogEntries;
          // let updateLog = {[roundKey]: mergeLogEntries};
          // updateLog = Helpful.sortObjectByKey( updateLog, -1 ); // DESC
          return Promise.resolve()
          .then( ()=>{
            // TODO: refactor /gameLogs => /gameLogss
            let logPath = `/gameLogs/${gameId}/${roundKey}`;
            return this.db.object<GamePlayLog>(logPath).update(mergeLogEntries)
          })
          .then( v=>{
            // merge gameLog entries into round.entries
            let merged = FishbowlHelpers.updateFishbowl(round, mergeLogEntries);
            let updateRound = {
              entries: merged,
            } as GamePlayRound;
            return this.db.object<GamePlayRound>(`/rounds/${rid}`).update(updateRound).then(
              ()=>console.log("0>>> updateRound=", updateRound)
            )
          })
          .then( v=>{
            // update in the Cloud, but not here
            console.log("1> GameHelper.pushGameLog() update round.entries=",  round.entries);
          })
          .then( v=>{
            resolve();
          })
        }),   
      ).subscribe();
    });
  }

  /**
   * scoreRound, called from ionViewWillEnter: gamePlay$
   * 
   * @param watch 
   * @param activeRound 
   */


  scoreRound$(watch:GamePlayWatch, teamNames:string[], merge:{roundKey: string, log: GamePlayLogEntries} = null) : Observable<Scoreboard>{
    
    let initTeamScore = ()=>({points:0, passed:0});
    let keyedByTeams = teamNames.reduce( (o,teamName)=>(o[teamName]=null, o), {});
    let score:Scoreboard = {
      round1: Object.assign({}, keyedByTeams),
      round2: Object.assign({}, keyedByTeams),
      round3: Object.assign({}, keyedByTeams),
      total: Object.assign({}, keyedByTeams), 
    }

    return watch.gameLog$.pipe( 
      first(), 
      map( (gameLog)=>{
        if (!gameLog) return score;
        // move this section to FishbowlHelpers.tabulateScore(gameLog, {playerRound:{}, mergeKey: string})

        // update score, OR just summarize GamePlayLog
        Object.entries(gameLog).filter( ([k,_])=>k.startsWith('round')).forEach( res=>{
          let [key, gameLogEntries]:[string, GamePlayLogEntries] = res;
          // console.log(">>> scoreRound$  ", key, "  count=",  Object.values(gameLogEntries).length)

          if (merge && merge.roundKey==key) {
            // merge playerRound (uncommitted) to gameLog[round?] before scoring
            gameLogEntries = Object.assign({}, gameLogEntries, merge && merge.log);
            // console.log("    >>> scoreRound$  ", key, "  count=",  Object.values(gameLogEntries).length)
          }
          Object.values(gameLogEntries).forEach( (o:WordResult)=>{
            let {teamName, playerName, result, time} = o;
            score[key][teamName] = score[key][teamName] || initTeamScore();
            let target = result ? 'points' : 'passed';
            score[key][teamName][target] +=1;
          });
        });

        // update totals
        Object.values(teamNames).forEach( teamName=>{
          score['total'][teamName] =  initTeamScore();
          Object.keys(score).filter( k=>k.startsWith('round')).forEach( key=>{
            if (score[key][teamName]) {
              score['total'][teamName]['points'] += score[key][teamName]['points'];
              score['total'][teamName]['passed'] += score[key][teamName]['passed'];  
            }
          });
        });

        return score;
      }),
    )
  }


  set_DayOfWeekTeams(gameDict:GameDict, gameId:string){
    let roundUpdate = {
      teams : {
        "blue team": ["JJM3Ct3iPzNR8gMy5DkSZB5UdOn2","tRIagpG1P5ToB4jhxMzGghQKbNx2","enJzDKGvvoQPTONESYGN03cVYPZ2","8seIMvmHXBSvAo07scJxaeKxhFI3"],
        "red team": ["qOMioJk9BRbgK5ViqLRePxIAt3D3","nhjC74LbBNdRBV5rkAosmu9tPrF2","aCMCLiQmcBRRUFZmH0GmWi9LF202"]
        }
    }

    let roundIds = Object.keys(gameDict).filter( k=>!['activeRound', gameId].find( skip=>k==skip))
    roundIds.forEach( rid=>{
      this.db.object<GamePlayRound>(`/rounds/${rid}`).update(roundUpdate);
    });
  }


  
}