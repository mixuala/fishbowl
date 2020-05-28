import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as firebase from 'firebase/app';

import { Observable, of, combineLatest, ReplaySubject, Subject, } from 'rxjs';
import { map, take, share, tap, first, debounceTime, pairwise, startWith, takeUntil, withLatestFrom } from 'rxjs/operators';

import * as dayjs from 'dayjs';

import { Helpful } from '../services/app.helpers';
import { FishbowlHelpers } from './fishbowl.helpers';
import { Player } from '../user/role';
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

  getGamesByInvite$(uid:string):Observable<Game[]>{
    return this.db.object<Game>(`/games/${uid}`).snapshotChanges().pipe(
      map(g=>[g]),
      FishbowlHelpers.pipeSnapshot2Data(),
    );
  }

  getGames$(player$:Observable<Player>, daysAgo=7):Observable<Game[]>{
    let d = dayjs().subtract(daysAgo, 'day').startOf('day').toDate();
    return this.db.list<Game>('games', 
      ref=>ref.orderByChild('gameTime').startAt( d.getTime() )
    ).snapshotChanges().pipe(
      FishbowlHelpers.pipeSnapshot2Data(),
      FishbowlHelpers.pipeGameIsPublished(player$),
      // FishbowlHelpers.pipeSort('gameTime'),
      FishbowlHelpers.pipeSortKeys(['complete', 'gameTime'], [true,true], ['complete']),
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

    let HOT_gameDict$ = new ReplaySubject<GameDict>(1);
    combineLatest(
      hasManyRounds_af.valueChanges().pipe(
        debounceTime(100),      // loadGameRounds() will update 3 rounds "together"
      ),
      HOT_game$,
    ).pipe(
      map( ([rounds,g])=>{
        console.warn("\t>>> 121: gameDict$ combineLatest() emits g, rounds=", g, rounds)
        let uidLookup:GameDict = {
          [gameId]: g,
          'game': g,
        };
        if (!g.rounds) return uidLookup;

        Object.entries(g.rounds).forEach( ([k,v])=>{
          let round = rounds.find( r=>r.round==v && g.rounds[r.uid])
          uidLookup[k] = round;
          if (k==g.activeRound){
            uidLookup['activeRound'] = round
          }
        });
        return uidLookup;
      }),
    ).subscribe(HOT_gameDict$);  // "hot" observable
    return {
      gameId,
      game$: HOT_game$,   // same as gameDict.game
      hasManyRounds$,     // sorted
      gameDict$: HOT_gameDict$,          // by key
    }
  }

  /**
   * 
   * NOTE: automatically completes existing Subscriptions when gameId|game.activeRound changes
   * @param gameId 
   * @param game 
   * @returns {
   *  uid: gameID or roundId being watched
   *  gamePlay$:  HOT gamePlay passed through pairwise() with extra attrs
   *              - changedKeys: only keys where value is truthy and != old value
   *              - timestamp
   *              - resolves to {} when requesting empty db key
   *  gameLog$: 
   *              - resolves to {} when requesting empty db key
   *              - TODO: resolve to null
   * }
   */
  _memo_GamePlayWatch: {
    watch: GamePlayWatch,
    done$: Subject<void>
  }
  getGamePlay(gameId: string, game:Game):GamePlayWatch{
    let rid = game.activeRound || gameId;

    /**
     * memoize results
     */
    let isFresh = this._memo_GamePlayWatch && this._memo_GamePlayWatch.watch.uid == rid;
    if (isFresh) {
      console.warn("120: >> reuse CACHED gamePlayWatch uid=", rid);
      return this._memo_GamePlayWatch.watch;
    }
    if (this._memo_GamePlayWatch && this._memo_GamePlayWatch.done$) {
      // complete gamePlay$, gameLog$
      console.warn("120: >> TEARDOWN old gamePlayWatch uid=", this._memo_GamePlayWatch.watch.uid);
      this._memo_GamePlayWatch.done$.next();
    }
    /**
     * end memoize
     */    
    
    
    this._memo_GamePlayWatch = {
      watch: null,
      done$: new Subject(),
    }
    let HOT_gamePlay$ = new ReplaySubject<GamePlayState>(1);
    
    console.warn("121: 0>> gameWatch.gamePlay$ has changed!!! uid=", rid);
    this.db.object<GamePlayState>(`/gamePlay/${rid}`).valueChanges().pipe(
      takeUntil(this._memo_GamePlayWatch.done$),
      startWith(undefined),
      pairwise(),
      tap( v=>console.log("120: gamePlay$ > pairwise", v[0], v[1])), 
      map( ([prev, gamePlay])=>{
        if (prev===undefined && gamePlay) 
          console.log( "120: ===>>> gamePlay isFirst==true, rid=", rid)
        if (gamePlay){
          // gamePlay==null after RESET, from valueChanges() on empty key
          let changedKeys = Object.keys(gamePlay).filter( k=>{
            if (gamePlay[k]===false) return false;
            if (prev==null) return true;
            if (['spotlight','timer','remaining'].includes(k)) {
              // let changed = JSON.stringify(gamePlay[k])!=JSON.stringify(prev[k]);
              // if (changed) console.warn( "120: spotlight changed:  ", JSON.stringify(gamePlay[k]),JSON.stringify(prev[k]) )
              return JSON.stringify(gamePlay[k])!=JSON.stringify(prev[k])
            }
            return gamePlay[k]!==prev[k];
          });
          // if (changedKeys.length==1 && changedKeys[0]=="timestamp") {
          //   // HACK: [OK] skipPlayer does NOT go through pairwise correctly
          //   //    prev.spotlight is ALREADY changed, only cur.timestamp is detected
          //   changedKeys.push('spotlight');
          // }
          console.warn( `120: ===>>> getGamePlay changedKeys=` , changedKeys)
          gamePlay.changedKeys = changedKeys;
        }
        return gamePlay || {}
      }),
    )
    .subscribe(HOT_gamePlay$);

    let gamePlay$ = HOT_gamePlay$.asObservable();

    let gameLog$:Observable<GamePlayLog>
    if (gameId) {
      gameLog$ = this.db.object<GamePlayLog>(`/gameLogs/${gameId}`).valueChanges()
      .pipe(
        takeUntil(this._memo_GamePlayWatch.done$),
        share() 
      )
    }
    else {
      gameLog$ = of({} as GamePlayLog )
    }
    this._memo_GamePlayWatch.watch = {uid:rid, gamePlay$, gameLog$};
    return this._memo_GamePlayWatch.watch;
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

  /**
   * set game.activeRound to the next round, begin with `round1`
   * - called AFTER doCheckIn, adjustTeamRosters()
   *  - expects: 
   *    - gamePlayState from prev round, copy timerDuration and spotlight
   *    - teamRosters to be set by adjustTeamRosters()
   *    - 
   * - sets:
   *    - game.activeRound, trigger gameDict$ emit
   *    - inits /gamePlay/[rid], copy timerDuration and spotlight from prev round gamePlay
   *    - does NOT update round
   *    - copy teams from prev round, DEPRECATE
   *    - set gameDict.activeRound locally, DEPRECATE
   * 
   * - next:
   *  - gameHelpers.beginRound(rid) to set round.startTime, round.complete
   * 
   * @param gameDict 
   */
  async loadNextRound(gameId: string, gameDict:GameDict)
    : Promise<{rid:string, activeRound:GamePlayRound}>
  {
    // from beginNextGameRound(): calls
    //  => loadNextRound() [here]
    //  => beginRound(rid): {startTimeDesc, complete:false }

    let roundIndex = FishbowlHelpers.getRoundIndex(gameDict);
    if (!roundIndex) {
      // gameOver, all rounds complete
      return Promise.resolve(null);
    }
    let nextRoundId = roundIndex.next;
    let activeRound = gameDict[nextRoundId] as GamePlayRound;
    

    let waitFor:Promise<void>[] = [];
    let playerCount = Object.values(activeRound.teams).reduce( (res,v)=>(res+v.length), 0);
    let updateGame = { 
      activeRound: nextRoundId,
      playerCount
    } as Game;
    waitFor.push(
      // update Game
        this.db.object<Game>(`/games/${gameId}`).update(updateGame) 
    );


    /**
     * initialize gamePlay for next round with timerDuration and spotlight from LAST gamePlay
     *  - expects spotlight to be on the correct player
     */

    let self = this;
    let promise = Promise.resolve()
    .then( ()=>{
      let teamCount = Object.keys(activeRound.teams).length
      if (roundIndex.prev) {
        return this.db.object<GamePlayState>(`/gamePlay/${roundIndex.prev}`).valueChanges().pipe(
          take(1),
        ).toPromise().then( (copyFrom)=>{
          // copy state from LAST GamePlayState to NEXT GamePlayState
          let gamePlay = Object.assign( {},
            this.initGamePlayState(nextRoundId, teamCount, copyFrom), 
            {
              gameId,
              doPlayerUpdate: true,           // update teamName, if changed
          });
          return gamePlay
        })
      }
      else {
        let gamePlay = Object.assign( {},
          this.initGamePlayState(nextRoundId, teamCount), 
          {
            gameId,
            doPlayerUpdate: true,           // update teamName, if changed
        });
        return gamePlay
      }
    })
    .then( (gamePlay)=>{
      // wait for updated gameDict.gamePlayWatch?
      let watch = {uid:nextRoundId} as GamePlayWatch;
      return this.pushGamePlayState( watch, gamePlay)
      .then( v=>{
        console.log("GameHelper.createGamePlayState() GamePlayState=", gamePlay)
      });
    })
    waitFor.push( promise );


    // teamRosters adjusted realtime in GameHelpers.pushTeamRosters()
    let lastRound = gameDict[ roundIndex.prev ]  as GamePlayRound;
    if (lastRound) {
      waitFor.push(
        // update activeRound.teams
        this.copyTeams( nextRoundId, lastRound.teams)
      )
    }


    return Promise.all( waitFor )
    .then( ()=>{
      return {activeRound, rid: nextRoundId};
    });
  }



  /**
   * init GamePlay for activeRound
   * @param rid 
   * @param teamCount 
   * @param lastGamePlay 
   */
  initGamePlayState(rid: string, teamCount:number, lastGamePlay:Partial<GamePlayState>=null):Partial<GamePlayState>{
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
    return gamePlayState;
  }



  /**
   * init GameAdminState to begin game
   * @param gameId 
   * @param watch 
   */
  // gamePlay is null after RESET
  initGameAdminState(watch:GamePlayWatch, gamePlay:Partial<GameAdminState>={}){
    let reset:GameAdminState = {
      gameId: watch.uid,
      doPlayerWelcome: false,
    }
    let update = Object.assign({}, reset, gamePlay)
    this.pushGamePlayState(watch, update).then( ()=>{
      console.info( "GameAdminState created, testing doCheckIn()", )
    });
  }  

  pushGamePlayState(watch:GamePlayWatch, gamePlay:Partial<GamePlayState>, ...changes):Promise<void>{
    // push to cloud, add timestamp
    const USE_SERVER_TIMESTAMP = false;
    console.info("120: =========>>> pushGamePlayState ",gamePlay)
    let fields = changes.length ? [].concat(...changes) : null;
    let update = Object.assign(Helpful.cleanProperties(gamePlay, fields), {
      timestamp: USE_SERVER_TIMESTAMP ? firebase.database.ServerValue.TIMESTAMP : Date.now(),
    });
    return this.db.list<GamePlayState>('/gamePlay').update(watch.uid, update)
    // .then( v=>{
    //   console.log(">>> GameHelper.pushGamePlayState() COMPLETE update=", update)
    // });
  }


  /**
   * WARNING: repeats gamePlay for ALL players
   * @param watch 
   */
  repeatGamePlay(watch:GamePlayWatch){
    watch.gamePlay$.pipe( 
      first(),
    ).subscribe( (gamePlay)=>{
      this.pushGamePlayState( watch, Object.assign({},gamePlay));
    })
  } 

  /**
   * push moderator corrections to the GamePlay.log
   * @param watch 
   * @param correction corrected by Moderator
   * @param playerId moderatorId
   */
  pushGamePlayLogUpdate(
    watch:GamePlayWatch, correction:GamePlayLogEntries, 
    playerId:string,
    roundEntries: { [word:string]: boolean}
  ):Promise<any>{
    // push to cloud
    let _patch_gamePlay_remaining = (
      corrected:Partial<WordResult>, 
      remaining:number[],
      roundEntries: { [word:string]: boolean}
    ):number[]=>{
      // patch next.remaining
      let available = !corrected.result;
      let word = corrected.word;
      // TODO: need round.entries
      let wordIndex = Object.keys(roundEntries).findIndex( k=>k==word);
      if (available && ~wordIndex) {
        remaining = remaining.concat(wordIndex);
      }
      else if (!available && ~wordIndex) {
        remaining = remaining.filter( v=>v!=wordIndex)
      }
      return remaining;
    }

    return new Promise( resolve=>{
      watch.gamePlay$.pipe( 
        first(), 
        ).subscribe( gamePlay=>{
          let now = Date.now();
          let remaining = gamePlay.remaining;
          Object.entries(correction).forEach( ([k,v],i)=>{
            //NOTE: by resetting the key to "now", the scorecard will sort the corrected entry to the last position
            let oldResult = gamePlay.log[k];
            gamePlay.log[-1*(now+i)] = Object.assign({}, gamePlay.log[k], oldResult, v, {modifiedBy: playerId});
            delete gamePlay.log[k];
            remaining = _patch_gamePlay_remaining(v, remaining, roundEntries);
          });
          console.warn("TODO: need to update next.remaining")
          let update = { 
            log: gamePlay.log,
            remaining,
          }
          this.pushGamePlayState(watch, update).then( ()=>{
            console.warn(">>> 126: pushGamePlayLogUpdate(), moderator update=", update);
            resolve(update);
          });
      })
    })
  }


  /**
   * moveSpotlight to next player, by default it will infer spotlight from 
   * the last entry in the GameLog. 
   * to advance spotlight manually, set options.useGamePlaySpotlight==true
   * 
   * @param watch 
   * @param round 
   * @param options 
   *    useGamePlaySpotlight: if true, use spotlight from gamePlay 
   */
  moveSpotlight(
    watch:GamePlayWatch, 
    round:GamePlayRound, 
    options:{ nextTeam?:boolean, defaultDuration?:number
      , spotlightState?:any   // deprecate
      , useGamePlaySpotlight?:boolean
    } = {} 
  ): 
    Promise<void>
  {
    let teamNamesInPlayOrder = round.orderOfPlay;
    let limits = {
      teamIndex: teamNamesInPlayOrder.length,
      playerIndex: teamNamesInPlayOrder.map( teamName=>{
        return round.teams[teamName].length
      })
    }
    let {uid, gamePlay$, gameLog$ } = watch;
    return gameLog$.pipe(
      withLatestFrom(gamePlay$),
      first(),
      map( (res:[GamePlayLog, GamePlayState])=>{
        let [gameLog, gamePlay ] = res;
        let spotlight:any;
        if (!gameLog || !!options.useGamePlaySpotlight ) {
          spotlight = Helpful.pick(gamePlay.spotlight, "teamIndex", "teamName", "playerIndex");
        }
        else {
          // get spotlight state from gameLog
          let roundKey = `round${gamePlay.doBeginGameRound}`;
          let log = gameLog[roundKey]
          let sortedTimestamps = Object.keys(log).map( v=>parseInt(v) ).sort().reverse();  // sort Timestamps in MostRecent first, DESC order
          let lastWordResult = log[ sortedTimestamps[0] ];
          let {playerName, teamName } = lastWordResult;
          let teamIndex = teamNamesInPlayOrder.findIndex( v=>v==teamName);
          let playerIndex = teamNamesInPlayOrder.map( (t,i)=>{
            let found = sortedTimestamps.find( k=> log[k] && log[k].teamName==t );
            let wordResult = found && log[found];
            if (!wordResult) return 0;
            let j = round.teams[t].findIndex( k=>round.players[k]==wordResult.playerName );
            if (~j) {
              if (i>teamIndex) {
                j++; // pre-increment playerIndex, for teamIndex++
              }
              if (j>=limits.playerIndex[i]) {
                j=0;
              }
            }
            return ~j ? j : 0;
          });
          
          let spotlight0 = {teamIndex, teamName, playerIndex };
          console.warn("13:a gameLog spotlight=", JSON.stringify(spotlight0), limits.playerIndex)
          spotlight = {teamIndex, teamName, playerIndex };
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
          // console.log("13:a2 SKIP player on same team",  JSON.stringify(spotlight))
          if (spotlight.teamIndex == -1) spotlight.teamIndex = 0;
          let i = spotlight.teamIndex;
          spotlight.playerIndex[ i ] += 1;
          if (spotlight.playerIndex[ i ] >= limits.playerIndex[ i ]) spotlight.playerIndex[ i ] = 0;
        }
        spotlight.teamName = teamNamesInPlayOrder[spotlight.teamIndex];
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
          doBeginPlayerRound: true,
        } as GamePlayState;
        console.warn("13:b moveSpotlight=", JSON.stringify(spotlight))
        return this.pushGamePlayState(watch, update).then( o=>{return});
      }),
    ).toPromise().then( ()=>{return});
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
            console.log("13: >>> pushGameLog(): mergeLogEntries", mergeLogEntries)
            return this.db.object<GamePlayLog>(logPath).update(mergeLogEntries)
          })
          .then( v=>{
            // merge gameLog entries into round.entries
            let cleanLog = FishbowlHelpers.filter_BeginRoundMarker(gamePlay.log);
            let merged = FishbowlHelpers.updateFishbowl(round, cleanLog);
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

  async patchPlayerId( gameId: string, game:Game, changeId:{old:string, new:string}): Promise<any>{
    if (!!game.activeRound) {
      // reject if already checkedIn
      if (!!game.checkIn[changeId.old])
        return Promise.reject("ERROR: player already checked in")
    }
    let update = {}
    let keys = ['players', 'entries', 'checkIn', 'moderators'];
    keys.map( k=>{
      let value = Object.assign({}, game[k]);
      if (value.hasOwnProperty(changeId.old)) {
        value[changeId.new] = value[changeId.old];
        value[changeId.old] = null;
        update[k] = value;
      }
    });

    let waitFor = Object.entries(update).map( ([k,v])=>{
      return this.db.object<Game>(`/games/${gameId}/${k}`).set( v as any )
    });
    return Promise.all(waitFor).then( ()=>{
      console.warn( "patchPlayerid DONE  ", gameId, update)
    },
    (err)=>{
      console.warn(err)
    }
    )
  }



  /**
   * moderator/admin methods
   */
  pushTeamRosters( gameDict:GameDict, teams:TeamRosters): Promise<void>{
    let activeRoundId = gameDict.game.activeRound;
    if (!activeRoundId) {
      let {prev, next} = FishbowlHelpers.getRoundIndex(gameDict)
      activeRoundId = next;
    }
    // update gamePlay.spotlight.playerIndex
    return gameDict.gamePlayWatch.gamePlay$.pipe(
      first(),
    ).toPromise()
    .then( gamePlay=>{
      let teamCount = Object.keys(teams).length;
      let spotlight = gamePlay && gamePlay.spotlight || {
        teamIndex: -1,  
        playerIndex: new Array(teamCount).fill(0),
      };
      Object.entries(teams).forEach( ([teamName,playerIds], i)=>{
        if (spotlight.playerIndex[i]>playerIds.length-1) spotlight.playerIndex[i]=0;
      });
      let waitFor=[
        this.db.object<GamePlayRound>(`/rounds/${activeRoundId}`).update( {teams} ),
        this.pushGamePlayState( gameDict.gamePlayWatch, {spotlight} ),
      ];
      return Promise.all(waitFor)
    })
    .then( ()=>{return} );
  }

  listenTeamRosters$( gameDict:GameDict):Observable<TeamRosters>{
    let activeRoundId = gameDict.game.activeRound;
    if (!activeRoundId) {
      let {prev, next} = FishbowlHelpers.getRoundIndex(gameDict)
      activeRoundId = next;
    }
    return this.db.object<TeamRosters>(`/rounds/${activeRoundId}/teams`).valueChanges();
  }

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

    let _isPushId = (v)=>v.startsWith('-');

    return Promise.resolve()
    .then( ()=>{
      let removeIds = Object.keys(gameDict).filter( k=>_isPushId(k))
      if (onlyUnplayed) {
        let unplayedKeys = Object.keys(unplayed);
        removeIds = removeIds.filter( id=>!(unplayedKeys.find(rid=>rid==id)));
      }
      let resetGame = {
        complete: false,
        isGameOpen: null,
        activeRound: null,
        checkIn: Object.keys(game.moderators).reduce( (o,k)=>(o[k]=false,o),{}),   // default moderator are hidden
        rounds: onlyUnplayed ? unplayed : null,
      }
      // let resetRound = {
      //   startTimeDesc: null,
      //   entries: null,
      //   complete: false,
      //   players: null,
      // }
      removeIds.forEach( uid=>{
        if (uid==gameId)
          this.db.object<Game>(`/games/${uid}`).update(resetGame)
        else {
          // this.db.object<GamePlayRound>(`/rounds/${uid}`).update(resetRound)
          this.db.object<GamePlayRound>(`/rounds/${uid}`).remove()
        }
        console.warn("120: ==> resetGame, gamePlay.uid=", uid)
        this.db.object<GamePlayState>(`/gamePlay/${uid}`).remove();
        this.db.object<GamePlayLog>(`/gameLogs/${uid}`).remove();
      })
    })
  }
}