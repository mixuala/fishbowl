import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import { Storage } from  '@ionic/storage';
import * as dayjs from 'dayjs';

import { Observable, Subject, of, from, interval } from 'rxjs';
import { map, tap, switchMap, take, takeWhile,  pairwise, first, withLatestFrom } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { Player, } from '../../user/role';
import { AudioService } from '../../services/audio.service';
import { CountdownTimerComponent } from '../../components/countdown-timer/countdown-timer.component';
import { Helpful } from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers';
import { GameHelpers } from '../game-helpers';
import { 
  Game, GamePlayRound, GameWatch, GameDict, RoundEnum,
  GamePlayWatch, GamePlayState,
  SpotlightPlayer,
  PlayerByUids, TeamRosters, WordResult, Scoreboard, GamePlayLogEntries, 
} from '../types';


declare let window;



@Component({
  selector: 'app-game',
  templateUrl: './game.page.html',
  styleUrls: ['./game.page.scss'],
})
export class GamePage implements OnInit {

  /**
   * attrs for GameWatch
   */
  private gameWatch:GameWatch;
  private gamePlayWatch: GamePlayWatch;
  private gameDict:GameDict;
  public gameId: string;
  public game: Game;
  public activeRound: GamePlayRound;
  public gamePlay$: Observable<GamePlayState>;
  public scoreboard:Scoreboard;

  public roundDesc = {
    1: "give clues but don\'t say the word (\"Taboo\") ",
    2: "only ONE word",
    3: "act it out (\"Charades\")"
  }

  // from ionViewWillEnter
  public loadGame$(gameId):Observable<GameDict>{
    this.gameWatch = this.gameHelpers.getGameWatch( gameId );
    return this.gameWatch.gameDict$.pipe(
      tap( d=>{
        this.gameDict = d;
        this.activeRound = d.activeRound; 
        this.game = this.gameDict[this.gameId] as Game;
        // this.activeRoundId = this.game.activeRound;
        this.gamePlayWatch = this.gameHelpers.getGamePlay(this.game, this.gameDict); 
      }),
    );
  }

  private doGamePlayUx( res:[GamePlayState, GamePlayState] ){
    let [prev, cur] = res;
    if (!cur) {
      console.warn( "show UX for event=completeGameRound")
      return;
    }
    if (cur.isTicking && !prev.isTicking) {
      this.audio.play("click");
      console.info( "*** detect timer Start, sound=click");
      return;
    }
    if (prev.timerPausedAt!=cur.timerPausedAt) {
      let sound = cur.timerPausedAt ? "pause" : "click";
      this.audio.play(sound);
      console.info( "*** detect timer PAUSE, sound=", sound);
      return;
    }
    if ( 
      (cur.log && !prev.log) || 
      ((cur.log && prev.log)  && Object.keys(cur.log).length > Object.keys(prev.log).length)
    ) {

      let lastKey = Object.keys(cur.log).map( v=>-1*parseInt(v) ).reduce((max, n) => n > max ? n : max, 0 );
      let sound = cur.log[-lastKey].result ? 'ok' : 'pass';
      this.audio.play(sound);
      console.info( "*** detect timer WORD action="), sound;
      return;
    }


    if (cur.roundComplete && !prev.roundComplete) {
      // flash round complete interstitial
    }
    else if (cur.playerRoundComplete && !prev.playerRoundComplete) {
      // flash player round complete interstitial
    }

  }
  /**
   * end GameWatch
   */

  public audioVolumeIcons = ["volume-mute","volume-low","volume-medium","volume-high"];
  
  public stash:any = {
    // GameWatch changes
    timerDuration: 30,
    audioVolumeIcon: null,
    activeGame: false,    // activeGame can be true between game.activeRound
    // activePlayer only
    onTheSpot: null,
    // end GameWatch


    // deprecate
    listen: true,
  };
  public displayName:string;

  public listen$ : Subject<boolean> = new Subject<boolean>();
  public upcomingGames$: Observable<Game[]>;
  public game$:Observable<Game>;
  public gameRef:AngularFireObject<Game>;
  private player: Player;
  public spotlight:SpotlightPlayer;


  @ViewChild( 'animateTarget', {static:false} ) animateTarget:HTMLElement;
  @ViewChild( 'countdownTimer', {static:false} ) countdownTimer:CountdownTimerComponent;

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private loadingController: LoadingController,
    private audio: AudioService,
    private db: AngularFireDatabase,
    private authService: AuthService,
    private gameHelpers: GameHelpers,
    private storage:  Storage,
  ) {

    if (environment.production==false){
      window['_dbg'] = window['_dbg'] || {};
      window._dbg.stash = this.stash
      window._dbg.dayjs = dayjs
    }

  }

  async ngOnInit() {
    console.info("0>>> ***** ngOnInit(): load ******")
    this.storage.get('volume').then( v=>this.toggleVolumeIcon(v||0, false));
    
    let loading = await this.presentLoading();
    // # set initial volume
    this.loadPlayer$().pipe(
      tap( (p)=>{ this.player = p }),
      tap( ()=>{
        loading && loading.dismiss();
      }),
    ).subscribe();

  }


  loadPlayer$():Observable<Player> {
    return this.authService.getCurrentUser$().pipe(
      switchMap( u=>{
        if (!!u) return of(u);
        return from(this.authService.doAnonymousSignIn());
      }),
      map( u=>{
        let p:Player = {
          uid: u.uid,
          name: u.displayName,
          gamesPlayed: 0,
          isAnonymous: u.isAnonymous,
          teamId: null,
          teamName: null,
        }
        return p;
      }),
      tap( p=>{
        this.player = p;
      }),
    );
  }



  /**
   * GameMaster components
   */

  // retest
  // TODO: move the gameHelpers
  async loadRounds(force=false):Promise<boolean>{
    if (!this.game) return false;

    //TODO: need a form to add teamNames

    let existingRoundEnums = Object.values(this.game.rounds || {});

    let rounds = [RoundEnum.Taboo, RoundEnum.OneWord, RoundEnum.Charades]
      .filter( e=>existingRoundEnums.find( ex=>ex==e )==null )
      .map( (round)=>{
      let gameRound = FishbowlHelpers.buildGamePlayRound(this.game, round);
      gameRound.uid = this.db.createPushId();
      return gameRound;
    });

    // update Game, use AngularFire ref
    // insert rounds in gameplay order
    const gameRef = this.db.object<Game>(`/games/${this.gameId}`);
    let byUids = rounds.reduce( (o,v)=>(o[v.uid]=v.round, o), {})
    byUids = Object.assign(this.game.rounds || {}, byUids)  // merge with existing rounds
    let teamNames = this.game.teamNames || Object.keys(rounds[0].teams);
    let result = gameRef.update({
      teamNames, // DEV
      rounds: byUids
    })
    .then( ()=>{
      // update rounds AFTER update game, 
      // gameWatch.gameDict$ emits on update
      let rounds_DbRef = this.db.database.ref().child('/rounds');
      // insert Rounds
      let updateBatch = rounds.reduce( (o, v)=>{
        let path = `/${v.uid}`
        o[path] = v
        return o
      }, {});
      return rounds_DbRef.update(updateBatch);  // firebase directly
    });
    return true;
  }

  async beginGameRound(round:RoundEnum=RoundEnum.Taboo):Promise<GamePlayRound>{
    if (!this.game) return


    // find activeRound or initialize/begin next round
    let activeRound = await this.gameHelpers.loadNextRound(this.gameDict, this.gameId)
    if (activeRound) {

      // DEV
      if ("reset round" && true){
        // DEV: manual reset of words in round
        let rid = this.game.activeRound;
        let entries = activeRound.entries;
        Object.keys(entries).forEach( k=>entries[k]=true )
        await this.db.object<GamePlayRound>(`/rounds/${rid}`).update( {entries})
      }

      this.gameHelpers.moveSpotlight(this.gamePlayWatch, activeRound);
    }
    else {
      console.info("GAME COMPLETE")
    }
    return activeRound
  }

  // called from game-controls
  // tested OK
  nextPlayer(nextTeam=true){
    if (!this.stash.activeGame) return;

    let game = this.gameDict[this.gameId] as Game;
    let round = this.activeRound;
    this.gameHelpers.moveSpotlight(this.gamePlayWatch, round, nextTeam);
  }


  ngAfterViewInit(){
    this.preloadAudio();
  }
  

  
  // called AFTER ngOnInit, before page transition begins
  ionViewWillEnter() {
    this.gameId = this.activatedRoute.snapshot.paramMap.get('uid');
    if (this.gameDict && this.gameDict[this.gameId]) {
      // continue with current game
    } else {
      // release old game, should be handled by takeWhile();
      console.info(" 0>>> ***** ionViewWillEnter(): load ******")

      // load new game
      let game:Game;
      let round:GamePlayRound;
      this.loadGame$(this.gameId).pipe(
        takeWhile( (d)=>!!d[this.gameId]),
        tap( d=>{
          game = d[this.gameId] as Game;
          this.stash.activeGame = game.activeGame || game.gameTime < Date.now();
        }),
        tap( d=>{
          // NOTE: this can be moved elsewhere, run once at beginRound
          let name = game.players && game.players[this.player.uid];
          let playerTeam = {displayName: name};
          if (this.activeRound ) {
            Object.entries(this.activeRound.teams).find( ([teamName, players], i)=>{
              if (players.find( uid=>uid==this.player.uid)) {
                Object.assign(playerTeam, {teamId: i, teamName});
                return true;
              }
            });
          }
          if (!!name) this.player = Object.assign({}, this.player, playerTeam)
        }),
        switchMap( (d)=>{
          return this.gamePlayWatch.gamePlay$;
          /**
           * every NEW gamePlayState, caused by wordAction()
           */
        }),
        tap( gamePlay=>{
          this.stash.wordsRemaining = gamePlay && gamePlay.remaining;
          if (!this.activeRound) {
            return
          }
          round = this.activeRound;
          this.spotlight = FishbowlHelpers.getSpotlightPlayer(gamePlay, round);
          // true if this player is under the spotlight
          // TODO: use roles here
          this.stash.onTheSpot = (this.spotlight.uid === this.player.uid);
          this.stash.timerDuration = gamePlay && gamePlay.timerDuration || this.stash.timerDuration;
        }),
        tap( (gamePlay)=>{
          // score round
          if (!this.game.rounds && !this.game.teamNames) return;
          // required
          let teamNames = Object.values(this.game.teamNames);
          
          let round = this.activeRound || null;
          let merge = {
            roundKey: round && `round${round.round}` || null,
            log: gamePlay && gamePlay.log || null,
          }

          if (gamePlay && gamePlay.log && !round) throw new Error( "ERROR: gamePlay.log should be undefined betwee, rounds, e.g. when activeRound=null")

          this.gameHelpers.scoreRound$(
            this.gamePlayWatch, 
            teamNames, 
            merge
          ).pipe(
            take(1),
            tap( score=>{
              this.scoreboard = score;
            })
          ).subscribe();
        }),
        pairwise(),
        tap( (res)=>{
          this.doGamePlayUx(res);
        })
      ).subscribe(null,null,
        ()=>console.info(" 10>>> ***** ionViewWillEnter(): subscriber COMPLETE ******")
      );
    }
  }


  ionViewDidLeave() {
    this.stash.watchingGameId = false;
  }

  // Helpers
  async presentLoading() {
    const loading = await this.loadingController.create({
      message: 'Loading...',
      duration: 4000,
      spinner: "dots",
    });
    loading.present();
    return loading;
  }
  
  // Helpers
  toggleVolumeIcon(volume:number = null, playSound=true){

    if (!volume) {
      volume = this.audioVolumeIcons.findIndex(v=>v==this.stash.audioVolumeIcon);
      volume += 1;
    }
    if (volume<0 || volume > 3) volume = 0;
    this.storage.set('volume', volume).then( ()=>{
      this.stash.audioVolumeIcon = this.audioVolumeIcons[volume];
      this.audio.setVolume(volume, playSound);
    })
  }

  preloadAudio(){
    ["click","buzz","ok","pass","dq", "pause"].forEach( k=>this.audio.preload(k));
  }

  onTimerRangeChange(range: CustomEvent) {
    this.stash.timerDuration = range.detail.value;
    let update = {timerDuration: this.stash.timerDuration} as GamePlayState;
    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        if (!gamePlay || gamePlay.isTicking==false)
          this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update);
      })
    ).subscribe()
  }

  beginPlayerRoundClick(){
    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        // onTimerClick() while timer isTicking => pause
        if (!gamePlay.isTicking) this.startTimer(gamePlay);
      })
    ).subscribe();
  }

  onTimerClick(duration=null){
    if (!this.gameDict.activeRound) return

    // role guard
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) return;

    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        // onTimerClick() while timer isTicking => pause
        if (gamePlay.isTicking && !gamePlay.timerPausedAt) 
          this.pauseTimer(gamePlay)
        else this.startTimer(gamePlay, duration);
      })
    ).subscribe();
  }

  private startTimer(gamePlay: GamePlayState, duration=null){
    if (!gamePlay) {
      return console.warn("error: round is not loaded");
    }

    // role guard
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) return; 
    if (gamePlay.playerRoundComplete) {
      // BUG: this is not getting reset properly
      // return;
    }

    // load round
    let rid = this.game.activeRound;
    let round = this.gameDict.activeRound;
    
    if (this.stash.onTheSpot) {
      let timeOnClock = duration || this.stash.timerDuration;
      
      let update = {} as GamePlayState;
      if (gamePlay.timerPausedAt) {
        // clear pause, then restart
        // word has already been served
        timeOnClock = gamePlay.timerPausedAt;

        // TODO: move to separate subscriber for audio actions, otherwise use CSS
        // play sound for cloud

      }
      else {
        // serve next word        
        // TODO: LET this.wordAction start timer, not the other way around
        if (!gamePlay.word) {
          let next = FishbowlHelpers.nextWord(round, gamePlay);
          update.word = next.word || null;
          update.remaining = next.remaining;
          if (update.remaining==0){
            // end of round
            return this.completeGameRound(this.activeRound);
          }
        }
      }

      update.timer = {
        seconds: Math.max(timeOnClock,0),
        key: Date.now(),
      };
      update.isTicking = true;
      update.timerPausedAt = null;
      
      // console.log("0> startTimer, update=", JSON.stringify(update))
    
      this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update).then( ()=>{
        this.gamePlayWatch.gamePlay$.pipe( 
          take(1),
          tap(v=>{
            console.log("1> startTimer, update=", JSON.stringify(Helpful.cleanProperties(v, Object.keys(update))))
          })
        ).subscribe()

        // // TODO: play for cloud 
        // this.audio.play("click");
      });
    }
  }

  private pauseTimer(gamePlay):boolean{
    if (!gamePlay.isTicking) return;

    // role guard
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) return;



    let update = {} as GamePlayState;
    let timeRemaining = this.countdownTimer.stop();
    if (!timeRemaining) this.onTimerDone();

    update.timerPausedAt = timeRemaining;
    update.isTicking = false;
    update.timer = {pause: true};

    // push to cloud
    if (this.stash.onTheSpot) {
      this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update).then( ()=>{
        this.gamePlayWatch.gamePlay$.pipe( 
          take(1),
          tap(v=>{
            console.log("1> PAUSE Timer, update=", JSON.stringify(Helpful.cleanProperties(v, Object.keys(update))))
          })
        ).subscribe()
      })
    }
  }

  async onTimerDone(t:Date|{seconds:number}=null, buzz=true):Promise<void> {
    if (!this.gameDict.activeRound) 
      return;

    let wasOnTheSpot = this.stash.onTheSpot;
    return Promise.resolve()
    .then( ()=>{
      if (buzz) {
        // event fired locally when timer expires, no cloud action required
        return this.animate(this.animateTarget)
      }
    })
    .then( ()=>{
      if (wasOnTheSpot) {
        // role guard also in completePlayerRound
       if (buzz) {
         return this.completePlayerRound();
       }
       // if silent, we probably CAME from completePlayerRound()
      }
    });
  }

  onWordActionClick(action:string) {
    if (!this.gameDict.activeRound) return

    // role guard
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) return;

    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        this.wordAction(gamePlay, action);
      })
    ).subscribe();
  }

  // TODO: let the game master can also trigger a wordAction
  private wordAction( gamePlay: GamePlayState, action:string=null ){
    // role guard
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) return;


    // TODO: clean up circular logic
    // wordAction=OK => if (!isTicking) startTimer() to begin
    // startTimer => if (!word) wordAction()


    if (!gamePlay.isTicking || action==null) {
      // start player round
      this.onTimerClick();
      return
    };
    
    let {word} = gamePlay;
    let correct = action=="OK" ? true : false;
    let available = !correct;
    let round = this.activeRound;
    let update = {} as GamePlayState;

    let next = FishbowlHelpers.nextWord( round, gamePlay, {[word]:available} );
    update.word = next.word || null;
    update.remaining = next.remaining;
    if (next.remaining && !gamePlay.word) {
      // move to onPlayerRoundWillBegin()
      // load initial word, ignore action
      this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update).then( ()=>{
        console.log("1> queue FIRST word, update=", update);
      });

      return



    }
    else if (gamePlay.word) {
      // apply score the word, based on action=[OK,PASS] then get next word
      let entries = round.entries;
      if (entries.hasOwnProperty(word)==false) {
        return console.warn("wordAction(): INVALID WORD, word=", word);
      }

      // get spotlight for WordResult to credit point for the proper team
      let spotlight = FishbowlHelpers.getSpotlightPlayer(gamePlay, round);
      let teamName = spotlight.teamName;
      let playerName = spotlight.label;

      let now = Date.now();
      let log:GamePlayLogEntries = gamePlay.log || {};
      let roundStartTime = gamePlay.timer.key || Date.now()
      let lastTime = Object.keys(log ).map( v=>-1*parseInt(v) ).reduce((max, n) => n > max ? n : max, 0 ) 
      lastTime = Math.max(lastTime, roundStartTime);

      let score:WordResult = {
        teamName, playerName, word,
        result: correct,
        time: Math.round((now-lastTime)/1000)  // in secs
      }
      
      update.log = Object.assign( log, {
        [-1*now]: score,
      });
      console.log( "wordAction, gamePlay=", update )
      return this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update)
      .then( ()=>{
        if (next.remaining==0) this.completePlayerRound(true, true);
      });

    }

    if (next.remaining==0 && this.activeRound) {
      this.completePlayerRound(true, true);
      // => this.nextPlayerRound();
      //    => this.completeGameRound()
    }

  }

  /**
   * onTimerDone() or FishbowlHelpers.nextWord() is empty 
   */
  async completePlayerRound(clearTimer=false, roundComplete=false):Promise<void>{
    let wasOnTheSpot = this.stash.onTheSpot;
    if (clearTimer) {
      await this.onTimerDone( null, false);
      // stop timer gracefully, (cloud sound), 
      // wait for animation to begin, then continue
    }

    /**
     * 
     */

    // role guard
    if (!wasOnTheSpot) 
      return;

    // only active player pushes updates to the cloud
    let activeRound = this.activeRound;
    let rid = this.game.activeRound;
    return Promise.resolve()
    .then( ()=>{
      // gameLog must be updated with LAST gamePlay.log BEFORE round is complete
      return this.gameHelpers.pushGameLog(this.gamePlayWatch, activeRound)
    })
    .then( ()=>{

      return this.nextPlayerRound();

    })
    // .then( ()=>{

    //   // not working 
    
    //   /**
    //    * TODO: flash/toast playerRound complete
    //    * - in doGamePlayUx(): 
    //    *      - watch for gamePlay$ =>gamePlay.playerRoundComplete 
    //    *      - show words 
    //    * - then continue on timer or game Master click
    //    */
    //   let playerRoundComplete = true;
    //   let update = { playerRoundComplete, roundComplete }
    //   return this.db.list<GamePlayState>('/gamePlay').update(rid, update)
    // })
    // .then( ()=>{
    //   console.log(" >>>> completePlayerRound() DONE");
    // })
    // .then( ()=>{
    //   const PLAYER_ROUND_INTERSITITIAL_DELAY =  3000;
    //   return interval(PLAYER_ROUND_INTERSITITIAL_DELAY).pipe(
    //     first(),
    //     map( ()=>{
    //       this.nextPlayerRound();
    //     })
    //   ).toPromise();
    // });
  }

  /**
   * queue next PlayerRound AFTER completePlayerRound() or 
   */
  private nextPlayerRound():Promise<void>{
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) {
      // DEV: test this 
      console.warn( "has spotlight already changed? should happen below in moveSpotlight() "  )
      throw new Error( " spotlight changed before ready")
    }


    // reset gamePlay for next playerRound
    let activeRound = this.activeRound;
    let rid = this.game.activeRound;

    // only active player pushes updates to the cloud
    return Promise.resolve()
    .then( ()=>{
      // reset gamePlay.log
      let updateGamePlay = {
        timer: null,
        log: {},
        isTicking: false,
        timerPausedAt: null,
        word: null,
        playerRoundComplete: false,
        roundComplete: false,
      }
      return this.db.list<GamePlayState>('/gamePlay').update(rid, updateGamePlay)
    })
    .then( ()=>{
      console.log(" >>>> gameLog and gamePlay reset for next playerRound");
    })
    .then( ()=>{
      // move spotlight, or complete Round
      //  ???: activeRound.entries is STALE, pushGameLog() updates to the cloud! 

      this.db.object<GamePlayRound>(`/rounds/${rid}`).valueChanges().pipe(
        take(1),
        map( activeRound=>{
          let entries = Object.entries(activeRound.entries).filter( ([word,avail])=>avail===true );
          if (entries.length==0){
            return this.completeGameRound(activeRound);
          }
          return this.gameHelpers.moveSpotlight(this.gamePlayWatch, activeRound)
        })
      ).subscribe();
    });
  }

  async completeGameRound(round:GamePlayRound){

    let isGameComplete = round.round == 3
    let rid = this.game.activeRound;
    let waitFor:Promise<void>[] = [];

    // only active player pushes updates to the cloud
    waitFor.push(
      this.db.list<GamePlayState>('/gamePlay').remove(rid)
    );


    /**
     * TODO: - in doGamePlayUx():
     * - watch for round.complete==true
     * - flash/toast Round complete
     * - show round score
     * - then continue on timer or game Master click
     */    
    let updateRound = {
      complete: true,
    } as GamePlayRound;
    waitFor.push(
      this.db.object<GamePlayRound>(`/rounds/${rid}`).update( updateRound )
    );

    let updateGame = {
      activeRound: null,
    } as Game;
    if (isGameComplete) {
      updateGame.complete = true;
    }    
    waitFor.push(
      this.db.object<Game>(`/games/${this.gameId}`).update( updateGame )
    )
    Promise.all(waitFor)
    // .then( ()=>{
    //   const GAME_ROUND_INTERSITITIAL_DELAY =  10000
    //   return interval(GAME_ROUND_INTERSITITIAL_DELAY).pipe(
    //     first(),
    //     map( ()=>{
    //       // this.completeGame();
    //     })
    //   ).toPromise();
    // })
    .then( ()=>{
      if (isGameComplete) return this.completeGame();
    });
  }

  async completeGame(){
    console.log("GAME COMPLETE")
  }

  async animate( el:any, animation="long-wobble" ){
    el = Helpful.findHtmlElement(el);
    el.classList.add("animated", "slow", animation)
    let stop = await this.audio.play("buzz");
    el.addEventListener('animationend', ()=>{ 
      el.classList.remove("animated", "slow", animation);
      stop();
    });
    return
  }

  doSettings() {
    // let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
    this.router.navigate(['/app/entry', this.game.uid])
  }

  check() {
    this.gameHelpers.set_DayOfWeekTeams(this.gameDict, this.gameId)
  }

}
