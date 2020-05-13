import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import { Observable, of, combineLatest, ReplaySubject, } from 'rxjs';
import { withLatestFrom, map, switchMap, take, share, tap, first } from 'rxjs/operators';

import * as dayjs from 'dayjs';

import { Helpful } from '../services/app.helpers';
import { FishbowlHelpers } from './fishbowl.helpers';
import { 
  Game, GameWatch, GameDict, GameAdminState, RoundEnum,
  GamePlayWatch, GamePlayState, GamePlayRound, GamePlayLogEntries, GamePlayLog,
  SpotlightPlayer, WordResult, Scoreboard,
  PlayerListByUids, PlayerByUids, TeamRosters, CheckInByUids, 
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
  this.db.list<GamePlayState>('/gamePlay').update(rid, gamePlayState)
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
    

    // // game with no rounds built?
    // let games$ = games.snapshotChanges().pipe(
    //   FishbowlHelpers.pipeSnapshot2Data(),
    //   FishbowlHelpers.pipeSort('gameTime'),
    // )
    // games$.subscribe( (v)=>console.log("games$:", v));

    let hasManyRounds$ = hasManyRounds_af.valueChanges().pipe(
      // or use Helpful.sortByIds() on uids
      FishbowlHelpers.pipeSort('round'),
    )
    // let game$ = game_af.valueChanges();
    let HOT_game$ = new ReplaySubject<Game>(1);
    game_af.valueChanges().pipe(
      map( g=>{
        return FishbowlHelpers.DEV_patchMissingAttrs(g, 'game')
      })
    )
    .subscribe(HOT_game$);  // "hot" observable

    // NOTE: only emits when rounds change
    // DOES NOT emit when game changes
    let gameDict$:Observable<GameDict> = hasManyRounds_af.valueChanges().pipe(
      withLatestFrom( HOT_game$ ),
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
      game$: HOT_game$,
      hasManyRounds$, // sorted
      gameDict$, // by key
    }
  }

  getGamePlay(gameId: string, game:Game, gameDict:GameDict):GamePlayWatch{
    if (!gameId) {
      gameId = gameDict.activeRound ? gameDict.activeRound.gameId : Object.keys(gameDict)[0];
    }
    let rid = game.activeRound || gameId;
    let gamePlay$ = of(rid).pipe(
      switchMap( rid=>{
        if (rid) {
          // GamePlayRound hasOne GamePlayWatch, use SAME rid
          let HOT_gamePlay$ = new ReplaySubject<GamePlayState>(1);
          this.db.object<GamePlayState>(`/gamePlay/${rid}`).valueChanges()
          .pipe( 
            // TODO: sort gamePlay.log desc
            // this is a COLD observable, does not emit until subscribed
          ).subscribe(HOT_gamePlay$)
          return HOT_gamePlay$;
        }
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

  /**
   * set game.activeRound to the next round, begin with `round1`
   * - called AFTER doCheckIn
   * - team assignments are now visible, allow player/moderator changes
   * - call beginGameRound() to begin game play
   * - activeRound != round has begun
   * @param gameDict 
   * @param gameId 
   */
  async loadNextRound(gameId: string, gameDict:GameDict, gamePlay$:Observable<GamePlayState> )
    : Promise<{rid:string, activeRound:GamePlayRound}>
  {
    let game = gameDict[gameId] as Game;

    // find next round and make active
    let sortedRids = Object.entries(game.rounds).sort( (a,b)=>a[1]-b[1] ).map( v=>v[0]);
    let foundIndex = sortedRids.findIndex( rid=>{
      // find the next round that is not complete
      return !(gameDict[rid] as GamePlayRound).complete;
    });
    if (foundIndex==-1){
      // gameOver, all rounds complete
      return Promise.resolve(null);
    }

    let activeRoundId = sortedRids[foundIndex];
    let activeRound = gameDict[activeRoundId] as GamePlayRound;
    let lastRound = foundIndex>0 && gameDict[sortedRids[foundIndex-1 ]]  as GamePlayRound;

    let waitFor:Promise<void>[] = [];
    let updateGame = { 
      activeRound: activeRoundId 
    } as Game;
    waitFor.push(
      // update Game
        this.db.object<Game>(`/games/${gameId}`).update(updateGame) 
    );

    // beginNextGameRound() calls
    //  => loadNextRound() [here]
    //    ??? => allow state for moderator actions on next round, e.g. adjust teams
    //  => beginRound(rid): {startTimeDesc, complete:false }



    // game.activeRound == null, gamePlay$ emits from game.activeRound
    /**
     * NOTE: completePlayerRound 
     *          => nexPlayer()
     *          => completeGameRound, if lastWord=true
     * expect spotlight to be on the correct player, so just copy from lastGamePlay
     */

    let lastRid = foundIndex>0 && sortedRids[foundIndex-1];
    let prom = Promise.resolve()
    .then( ()=>{
      if (lastRid) {
        return this.db.object<GamePlayState>(`/gamePlay/${lastRid}`).valueChanges().pipe(
          take(1),
        ).toPromise().then( (v)=>{
          console.log("last gamePlay=",v)
          return v
        })
      }
    })
    .then( (lastGamePlay)=>{
      // update GamePlayState
      return this.initGamePlayState(activeRoundId, Object.keys(activeRound.teams).length, lastGamePlay) 
    }) 
    waitFor.push( prom );


    if (lastRound) {
      waitFor.push(
        // update activeRound.teams
        this.copyTeams( activeRoundId, lastRound.teams)
      )
    }

    return Promise.all( waitFor )
    .then( ()=>{
      // update gameDict locally, but it should happen in the cloud after beginRound()
      // deprecate
      gameDict.activeRound = gameDict[activeRoundId] as GamePlayRound;
      // update cloud
      return Promise.resolve({activeRound, rid: activeRoundId})
    });
  }




  initGamePlayState(rid: string, teamCount:number, lastGamePlay:Partial<GamePlayState>):Promise<void>{
    let spotlight = lastGamePlay && lastGamePlay.spotlight || {
      teamIndex: -1,  
      playerIndex: new Array(teamCount).fill(0),
    };
    let timerDuration = lastGamePlay && lastGamePlay.timerDuration || null;

    let gamePlayState = {
      // gameId,
      spotlight,
      timer: null,
      log: {},
      timerDuration,
      word: null,
      remaining: [],
      isTicking: false,
    }
    return this.db.list<GamePlayState>('/gamePlay').update(rid, gamePlayState)
    .then( v=>{
      console.log("GameHelper.createGamePlayState() GamePlayState=", gamePlayState)
    });
  }

  pushGamePlayState(watch:GamePlayWatch, gamePlay:Partial<GamePlayState>, ...changes):Promise<void>{
    // push to cloud
    let fields = changes.length ? [].concat(...changes) : null;
    let update = Helpful.cleanProperties(gamePlay, fields);
    return this.db.list<GamePlayState>('/gamePlay').update(watch.uid, update)
    .then( v=>{
      console.log("1> GameHelper.pushGamePlayState() update=", update)
    });
  }

  pushGamePlayLogUpdate(watch:GamePlayWatch, update:GamePlayLogEntries, playerId:string):Promise<void>{
    // push to cloud
    let waitFor = [];
    Object.entries(update).forEach( ([k,v])=>{
      let partial = Object.assign({}, v, {modifiedBy: playerId});
      let path = `/gamePlay/${watch.uid}/log/${k}`;
      let one = this.db.database.ref().child(path).update( partial ).then( ()=>{
        console.warn(">>> 126: pushGamePlayLogUpdate(), moderator update=", partial, path)
      });
      waitFor.push( one );
    });
    return Promise.all(waitFor).then( ()=>{return} );
  }

  requestCheckIn(gameId:string){
    let gamePlayState:GameAdminState = {
      gameId,
      doCheckIn: true,
      checkInComplete: false,
    }
    this.db.list<GameAdminState>('/gamePlay').update(gameId, gamePlayState).then( ()=>{
      console.info( "GameAdminState created, testing doCheckIn()", )
    });
  }

  copyTeams(rid: string, teams:TeamRosters){
    // do BEFORE beginGameRound()
    let updateRound = { 
      teams,
    } as GamePlayRound;
    return this.db.object<GamePlayRound>(`/rounds/${rid}`).update(updateRound);   
  }

  beginRound(rid: string):Promise<void>{
    // updateRound in beginGameRound()
    let updateRound = { 
      startTimeDesc: -Date.now(),
      complete: false
    } as GamePlayRound;
    return this.db.object<GamePlayRound>(`/rounds/${rid}`).update(updateRound);   
  }
      
  moveSpotlight(
    watch:GamePlayWatch, 
    round:GamePlayRound, 
    options:{ nextTeam?:boolean, defaultDuration?:number} = {} 
  ): 
    Promise<void>
  {
    let {uid, gamePlay$} = watch;
    // rewrite without promise
    return new Promise( (resolve, reject)=>{
      gamePlay$.pipe(
        take(1),
        tap( (gamePlay)=>{       
          
          if (!gamePlay) return;  // round is complete
          if (!round) {
            console.error("round is empty")
            return      // not sure this is the right path
          }


          let spotlight = Object.assign( {} , gamePlay && gamePlay.spotlight );
          let teamRosters = Object.values(round.teams);
          let limits = {
            teamIndex: teamRosters.length,
            playerIndex: teamRosters.map( v=>v.length)
          }
          if (options.nextTeam!==false){
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
          // where does gamePlayTimerDuration first get set?
          let timerDuration = gamePlay.timerDuration || options.defaultDuration;

          let update = {
            spotlight,
            timer: null,
            log: {},
            timerDuration,
            word: null,
            isTicking: false,
            timerPausedAt: null,
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
            let logPath = `/gameLogs/${gameId}/${roundKey}`;
            // console.log(">>> pushGameLog(): mergeLogEntries", mergeLogEntries)
            return this.db.object<GamePlayLog>(logPath).update(mergeLogEntries)
          })
          .then( v=>{
            // merge gameLog entries into round.entries
            let merged = FishbowlHelpers.updateFishbowl(round, mergeLogEntries);
            let updateRound = {
              entries: merged,
            } as GamePlayRound;
            return this.db.object<GamePlayRound>(`/rounds/${rid}`).update(updateRound).then(
              ()=>console.log("0>>> update round.entries=", updateRound)
            )
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
        if (!gameLog) {
          console.log( "scoreRound$, gameLog is empty ")
          return score;
        }
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


  DEV_set_DayOfWeekTeams(gameDict:GameDict, gameId:string){
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

  pushCheckIn( gameId: string, checkIn:CheckInByUids): Promise<void>{
    let update = checkIn;
    return this.db.object<Game>(`/games/${gameId}/checkIn`).update( update )
  }



  /**
   * moderator/admin methods
   */


  /***
   * DEV methods
   */
  async DEV_resetRoundEntries(rid:string, round:GamePlayRound){
    let roundKey = `round${round.round}`;
    console.warn("DEV: beginGameRound() resetting round entries to true, round",rid, roundKey);
    let entries = Object.assign({}, round.entries);
    Object.keys(entries).forEach( k=>entries[k]=true )
    await this.db.object<GamePlayRound>(`/rounds/${rid}`).update( {entries})
    await this.db.object<GamePlayLog>(`/gameLogs/${rid}/${roundKey}`).set(null);
  }

  DEV_resetGame(gameId: string, game:Game, gameDict:GameDict, onlyUnplayed=true){
    let sortedByRoundNumber = Object.entries(game.rounds || {}).sort( (a,b)=>a[1]-b[1] );
    let unplayed = sortedByRoundNumber.filter( ([rid,roundNumber])=>{
      // find the next round that is not complete
      let round = gameDict[rid] as GamePlayRound;
      return !(round && round.complete);
    }).reduce( (o,v)=>(o[v[0]]=v[1],o),{});

    return Promise.resolve()
    .then( ()=>{
      let removeIds = Object.keys(gameDict).filter( k=>k!='activeRound')
      if (onlyUnplayed) {
        let unplayedKeys = Object.keys(unplayed);
        removeIds = removeIds.filter( id=>!(unplayedKeys.find(rid=>rid==id)));
      }
      let resetGame = {
        complete: false,
        activeRound: null,
        checkIn: Object.keys(game.moderators).reduce( (o,k)=>(o[k]=false,o),{}),   // default moderator are hidden
        rounds: onlyUnplayed ? unplayed : null,
      }
      let resetRound = {
        startTimeDesc: null,
        entries: null,
        complete: false,
        players: null,
      }
      removeIds.forEach( uid=>{
        if (uid==gameId)
          this.db.object<Game>(`/games/${uid}`).update(resetGame)
        else {
          // this.db.object<GamePlayRound>(`/rounds/${uid}`).update(resetRound)
          this.db.object<GamePlayRound>(`/rounds/${uid}`).remove()
        }
        this.db.object<GamePlayState>(`/gamePlay/${uid}`).remove();
        this.db.object<GamePlayLog>(`/gameLogs/${uid}`).remove();
      })
    })
  }
}