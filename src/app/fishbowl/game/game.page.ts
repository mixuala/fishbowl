import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ModalController, } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import { Storage } from  '@ionic/storage';
import * as dayjs from 'dayjs';

import { Observable, Subject, BehaviorSubject, of, from, timer, interval, } from 'rxjs';
import { map, tap, switchMap, take, takeWhile, pairwise, first, filter, startWith, withLatestFrom, } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { Player, } from '../../user/role';
import { AudioService } from '../../services/audio.service';
import { CountdownTimerComponent } from '../../components/countdown-timer/countdown-timer.component';
import { HelpComponent } from '../../components/help/help.component';
import { Helpful } from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers';
import { GameHelpers } from '../game-helpers';
import { 
  Game, GameWatch, GameDict, GameAdminState, RoundEnum,
  GamePlayWatch, GamePlayState, GamePlayRound, GamePlayLogEntries, GamePlayLog,
  SpotlightPlayer, WordResult, Scoreboard,
  PlayerListByUids, PlayerByUids, TeamRosters, 
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
      // takeUntil(this.done$),
      tap( d=>{
        this.gameDict = d;
        this.activeRound = d.activeRound; 
      }),
      tap( d=>{
        this.gameWatch.game$.pipe(
          // takeUntil(this.done$),
          tap( g=>{
            this.game = g;
            // console.log(g);
          }),          
          startWith(null),
          pairwise(),
          tap( ([prev,cur])=>{
            // console.log("  >>>> game$ emits game=",cur)
            if (
              prev===null ||
              prev.activeRound!=cur.activeRound
            ) {
              // NOTE: this must trigger whenever game.activeRound changes
              // this should also emit GameAdminState
              this.gamePlayWatch = this.gameHelpers.getGamePlay(this.game, this.gameDict); 
            }
          }),
        ).subscribe();
      }),
    );
  }

  private doInterstitials(
    // res:[GamePlayState, GamePlayState],
    changed: Partial<GamePlayState>,
    cur: GamePlayState,
    player: Player,
    game: Game,
    round: GamePlayRound,
    scoreboard: Scoreboard,
  ) {

    const TIME={
      BUZZER_ANIMATION_COMPLETE: 2000,
      PLAYER_ROUND_DISMISS: 10000,
      GAME_ROUND_DISMISS: 10000,
    }

    let dontWait = Promise.resolve()
    .then( ()=>{
      // DEBUG
    })
    .then( ()=>{
      if (changed.playerRoundComplete && cur.playerRoundComplete) {

        // guard: playerRoundComplete=true
        if (!round) throw new Error("round should not be empty when playerRoundComplete==true")

        let gamePlayCopy = Object.assign({}, cur);
        gamePlayCopy.log = Object.assign({}, cur.log);
        let gameSummary = {
          player: Helpful.pick(player, 'displayName', 'teamName'),
          game: Helpful.pick(game, 'playerCount', 'teamNames'),
          round: Helpful.pick(round, 'round', 'startTimeDesc', ),
          scoreboard,
        }


        // flash player round complete interstitial
        let interstitial = {
          template: "player-round-complete", 
          once:false,
          duration: TIME.PLAYER_ROUND_DISMISS,
          gamePlay: gamePlayCopy,
          gameSummary,

          onDidDismiss: (v)=>{
            console.info('player-round complete dismissed')
          }
        }
        return Helpful.waitFor(TIME.BUZZER_ANIMATION_COMPLETE)
        .then( ()=>{
          return HelpComponent.presentModal(this.modalCtrl, interstitial)
        });
      }
    })
    .then( ()=>{
      if (changed.gameRoundComplete && cur.gameRoundComplete) {

        // guard: roundComplete=true
        // NOTE: playerRoundComplete==true when gameRoundComplete=true
        let teamNames = game.teamNames;
        let winnersByRound = Object.keys(scoreboard).reduce( (o, round)=>{ 
          let team0 = scoreboard[round][teamNames[0]];
          let team1 = scoreboard[round][teamNames[1]];
          if (team0 && team1){
            if (team0.point > (team1.point || 0)) o[round]=teamNames[0];
            if (team1.point > (team0.point || 0)) o[round]=teamNames[1];
          } 
          else o[round]==null;
          return o;
        }, {});

        let gameSummary = {
          teamNames: game.teamNames,
          roundNumber: round.round,
          scoreboard,
        }
        console.log(winnersByRound,gameSummary)
    
        return this.gamePlayWatch.gameLog$.pipe(
          take(1),
        ).toPromise()
        .then( gameLog=>{
          let interstitial = {
            template: "game-round-complete", 
            once:false,
            duration: TIME.GAME_ROUND_DISMISS,
            gameSummary,
            winnersByRound,
            onDidDismiss: (v)=>{
              console.info('round-complete dismissed')
              return true;
            }
          }
          return HelpComponent.presentModal(this.modalCtrl, interstitial);            
        });
      }
    })
    .then( ()=>{
      if (changed.checkInComplete && cur.checkInComplete) {
      }
    })
    .then( ()=>{
      if (changed.doCheckIn && cur.doCheckIn) {
        if (!game.checkIn || !game.checkIn[this.player.uid]){
          this.showCheckInInterstitial();
        }
      }
    });
  }

  private doGamePlayUx( 
    changed: Partial<GamePlayState>,
    cur: GamePlayState,
  ){
 
    // in order of priority
    if (changed.isTicking && cur.isTicking) {
      this.audio.play("click");
      console.info( "*** detect timer Start, sound=click");
      return;
    }
    if (changed.timerPausedAt) {
      let sound = cur.timerPausedAt ? "pause" : "click";
      this.audio.play(sound);
      console.info( "*** detect timer PAUSE, sound=", sound);
      return;
    }
    if (changed.log) {
      let curEntries = cur.log && Object.keys(cur.log).length || 0;
      // [OK]: TEST detect new word action when we don't look at prevEntries
      let lastKey = Object.keys(cur.log).map( v=>-1*parseInt(v) ).reduce((max, n) => n > max ? n : max, 0 );
      let sound = cur.log[-lastKey].result ? 'ok' : 'pass';
      this.audio.play(sound);
      // console.info( "*** doGamePlayUx(): detect timer WORD action by change in gamePlay.log", sound);
      return;
    }
  }
  /**
   * end GameWatch
   */

  public audioVolumeIcons = ["volume-mute","volume-low","volume-medium","volume-high"];
  public initialTimerDuration = 45;
  
  public stash:any = {
    // GameWatch changes
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
  private player$ = new BehaviorSubject<Player>(null);
  public spotlight:SpotlightPlayer;


  @ViewChild( 'animateTarget', {static:false} ) animateTarget:HTMLElement;
  @ViewChild( 'countdownTimer', {static:false} ) countdownTimer:CountdownTimerComponent;

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private loadingController: LoadingController,
    private modalCtrl: ModalController,
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
      // takeUntil(this.done$),
      switchMap( u=>{
        if (!!u) return of(u);
        return from(this.authService.doAnonymousSignIn());
      }),
      switchMap( u=>{
        let p:Player = {
          uid: u.uid,
          name: u.displayName, // deprecate
          displayName: u.displayName,
          gamesPlayed: 0,
          isAnonymous: u.isAnonymous,
          teamId: null,
          teamName: null,
        }
        this.player$.next(p);
        return this.player$.asObservable()
      }),
      tap( p=>{
        this.player = p;
        console.log("  >>> player ready, name=", this.player)
      }),
    );
  }



  /**
   * GameMaster components
   */

  doCheckInClick() {
    this.requestCheckIn(this.gameId);
  }
  loadRoundClick(){
    this.loadGameRounds();
  }
  beginGameRoundClick(){
    this.beginNextGameRound()
    .then( (v)=>{
      // handle error in game state
      if (v===null) this.completeGame();
    })
  }
  resetGameClick(ev){
    let hard = ev.ctrlKey;
    this.doGameReset(hard)
  }


  doGameReset(hard=false){
    let isModerator = Object.keys(this.game.moderators).find( uid=>this.player.uid);
    if (!isModerator) return;

    Promise.resolve()
    .then( ()=>{
      let game = this.game;
      if (!game['isDev']) {
        let msg = `Are you sure you want to reset game: ${game.label}`;
        let resp = window.confirm(msg)
        if (!resp) return;
      }
      return this.gameHelpers.DEV_resetGame(game, this.gameDict, !hard)
    });
  }

  /**
   * triggered by moderator
   */
  requestCheckIn(gameId:string){
    let isModerator = Object.keys(this.game.moderators).find( uid=>this.player.uid);
    if (!isModerator) return;

    this.gameHelpers.requestCheckIn(this.gameId);
  }

  /**
   * cloud action, trigger on gamePlay.doCheckIn==true, GameAdminState
   */ 
  showCheckInInterstitial() {
    this.player$.pipe(
      filter( p=>!!p.displayName),
      take(1),
      tap( player=>{
        let dontWait = HelpComponent.presentModal(this.modalCtrl, {
          template:'check-in',
          once:false,
          playerName: player.displayName,
          backdropDismiss: false,
          swipeToClose: true,
          playerReady: ()=>{
            this.modalCtrl.dismiss("ok");
            let checkIn = {[player.uid]: player.displayName};
            console.log( "player checked in: ", checkIn)
            this.gameHelpers.pushCheckIn(this.gameId, checkIn);
          },
          dismiss: (v)=>{ return false;}
        });
      })
    ).subscribe();
  }


  async loadGameRounds(force=false):Promise<boolean>{
    if (!this.game) return false;
    let isModerator = Object.keys(this.game.moderators).find( uid=>this.player.uid);
    if (!isModerator) return;

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


  /**
   * begin gameRound, get game.activeRound and set startTime and moveSpotlight() to first player
   * NOTE: 
   *  - call GameHelpers.loadNextRound() called after loadRounds()
   * @param round 
   */
  async beginNextGameRound():Promise<GamePlayRound>{
    if (!this.game) return
    let isModerator = Object.keys(this.game.moderators).find( uid=>this.player.uid);
    if (!isModerator) return;

    // find activeRound or initialize/begin next round
    return this.gameHelpers.loadNextRound(
      this.gameDict, this.gameId, this.gamePlayWatch.gamePlay$
    )
    .then( async (res)=>{
      let isGameComplete = !res;
      if (isGameComplete) {
        return Promise.reject("skip"); // => completeGame()
      }
      else {
        let {rid, activeRound} = res;

        /**
         * optional: allow moderator to adjust teams
         * BEFORE calling beginRound
         */


      }
      return res;
    })
    .then( async (res)=>{
      // ???: move to another method and trigger from buttonClick?
      let {rid, activeRound} = res;
      await this.gameHelpers.beginRound(rid)
      if (activeRound.round==1){
        await this.gameHelpers.moveSpotlight(this.gamePlayWatch, activeRound, {
          nextTeam: true,
          defaultDuration: this.initialTimerDuration
        });
      }
      return activeRound;
    })
    .catch( err=>{
      if (err=="skip") return Promise.resolve(null)
      return Promise.reject(err)
    })
  }

  // called from game-controls
  // tested OK
  nextPlayer(nextTeam=true){
    if (!this.stash.activeGame) return;

    let game = this.gameDict[this.gameId] as Game;
    let round = this.activeRound;
    this.gameHelpers.moveSpotlight(this.gamePlayWatch, round, {nextTeam});
  }


  ngAfterViewInit(){
    this.preloadAudio();
  }

  // called AFTER ngOnInit, before page transition begins
  ionViewWillEnter() {
    // const dontWait = HelpComponent.presentModal(this.modalCtrl, {template:'intro', once:false});

    this.gameId = this.activatedRoute.snapshot.paramMap.get('uid');
    if (this.gameDict && this.gameDict[this.gameId]) {
      // continue with current game
    } else {
      // release old game, should be handled by takeWhile();
      console.info(" 0>>> ***** ionViewWillEnter(): load ******")

      /**
       * this is the MAIN game listener for cloud players
       */
      let game:Game;
      let round:GamePlayRound;
      this.loadGame$(this.gameId).pipe(
        // takeUntil(this.done$),  // ??
        takeWhile( (d)=>!!d[this.gameId]),
        tap( d=>{
          game = d[this.gameId] as Game;
          this.stash.activeGame = game.activeGame || game.gameTime < Date.now();
          round = d[game.activeRound] as GamePlayRound;
        }),
        tap( d=>{
          if (!!this.player.displayName) 
            return

          let playerSettings = FishbowlHelpers.getPlayerSettings(this.player.uid, game, round)
          let player = Object.assign({}, this.player, playerSettings)
          // NOTE: this is where the player.displayName is set!!!
          this.player$.next( player );
          this.player = player;   // TODO: is this required for downstream processing?
        }),
        switchMap( (d)=>{
          return this.gamePlayWatch.gamePlay$;
          /**
           * every NEW gamePlayState, caused by wordAction()
           */
        }),
        tap( gamePlay=>{
          this.stash.wordsRemaining = gamePlay && gamePlay.remaining;
          if (!round)
            return

          this.spotlight = FishbowlHelpers.getSpotlightPlayer(gamePlay, round);
          // true if this player is under the spotlight
          // TODO: use roles here
          this.stash.onTheSpot = (this.spotlight.uid === this.player.uid);
        }),
        tap( (gamePlay)=>{
          // score round
          if (!this.game.rounds && !this.game.teamNames) 
            return;

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
              // console.log("scoreboard:", score)
            })
          ).subscribe();
        }),
        startWith(null),
        pairwise(),
        tap( (gamePlayChange)=>{
          console.log( `===>>> loadGame() gamePlay`, gamePlayChange)
          let [prev, cur] = gamePlayChange;
          if (cur===null) 
            return

          let isFirst = prev===null
          let changed = isFirst ? cur : Object.keys(cur).filter( k=>cur[k]!=prev[k]).reduce( (o,k)=>(o[k]=cur[k],o), {}) as GamePlayState;
          this.doGamePlayUx(changed, cur);
          this.doInterstitials(
            changed, cur,
            this.player, this.game, 
            this.activeRound, this.scoreboard
          )
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
    this.initialTimerDuration = range.detail.value;
    let update = {timerDuration: range.detail.value} as GamePlayState;
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
      let msg = "startTimer called with playerRoundComplete"
      throw new Error(msg);
    }

    // load round
    let rid = this.game.activeRound;
    let round = this.gameDict.activeRound;
    
    if (this.stash.onTheSpot) {
      let timeOnClock = duration || gamePlay.timerDuration || this.initialTimerDuration;
      
      let update = {
        timerDuration: timeOnClock
      } as Partial<GamePlayState>;

      if (gamePlay.timerPausedAt) {
        // clear pause, then restart
        // word has already been served
        timeOnClock = gamePlay.timerPausedAt;
        update.timerPausedAt = null;
      }
      else {
        if (!gamePlay.word) {
          // serve FIRST word of round
          let next = FishbowlHelpers.nextWord(round, gamePlay);
          update.word = next.word || null;
          update.remaining = next.remaining;
          if (update.remaining==0){
            // end of round, already?
            console.warn("ERROR: how can you start the timer with next.remaining==0??")
            return this.completeGameRound(this.activeRound);
          }

          console.info("\t>>>> playerRoundWillBegin()");
          update.playerRoundBegin = true;

        }
      }

      update.timer = {
        seconds: Math.max(timeOnClock,0),
        key: Date.now(),
      };
      update.isTicking = true;
      // console.log("0> startTimer, update=", JSON.stringify(update))
    
      this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update).then( ()=>{
        this.gamePlayWatch.gamePlay$.pipe( 
          take(1),
          tap(v=>{
            console.log("1> startTimer, update=", JSON.stringify(Helpful.cleanProperties(v, Object.keys(update))))
          })
        ).subscribe()
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
    if (!timeRemaining) {
      return;
    }

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

  /**
   * launch the timed sequence
   * o timerWillComplete()
   * - push gamePlayState: isTicking=false
   *    o timerDidComplete()
   *    - start OVERTIME delay for accepting wordAction
   *      o timerDidComplete with OVERTIME
   *      - completePlayerRound() if playerRoundBegin==true (still)
   *    
   * 
   * 
   * @param t Date or unixtime of completion
   * @param buzz animate & buzz timer on the local device, default true, false=silent 
   *    when trigged externally, e.g. gameRoundComplete when player gets last word
   */
  async onTimerDone(t:Date|{seconds:number}=null, buzz=true):Promise<void> {
    const ADDED_DELAY_BEFORE_DISABLE_WORD_ACTIONS = 5000;
    if (!this.gameDict.activeRound) 
      return;

    let wasOnTheSpot = this.stash.onTheSpot;
    return Promise.resolve()
    .then( ()=>{
      if (buzz) {
        // all players buzz Timer locally when timer expires, no cloud action required
        return this.animate(this.animateTarget)
      }
    })
    .then( ()=>{
      let silent = !buzz
      if (!wasOnTheSpot || silent) {
        return Promise.reject("skip")

        // !wasOnTheSpot: cloud response, no access to gamePlay
        // silent: timerDidComplete() should ALREADY have happened
      }
    })
    .then( ()=>{
      // stop timer isTicking, but do OVERTIME
      let update = { 
        isTicking: false, 
        // playerRoundBegin: true,      // should be already set
      };
      console.info("\t>>>> timerWillComplete()")
      return this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update)
    })      
    .then( ()=>{
      console.info("\t>>>> timerDidComplete()")
      // delay disabling wordAction buttons
      // but, last wordAction() will trigger completePlayerRound()
      // no OVERTIME if the next.remaining==0, but buzz=false in this case
      let dontWait = interval(ADDED_DELAY_BEFORE_DISABLE_WORD_ACTIONS).pipe(
        withLatestFrom(this.gamePlayWatch.gamePlay$),
        take(1),
        map( ([_,gamePlay] )=>{
          console.info("\t>>>> timerDidComplete with OVERTIME")
          // check if playerRoundDidComplete(), 
          // if not, set playerRoundBegin=false, disable wordAction buttons
          let doPlayerRoundComplete = this.stash.onTheSpot && 
            gamePlay.playerRoundBegin==true;
          if (doPlayerRoundComplete){
            console.info("\t>>>> wordAction OVERTIME DidComplete() => completePlayerRound()")
          }
          else {

            // OK: score and next.remaining are not being updated correctly from here
            // BUG: playerRoundComplete=true for [nextPlayer]

            console.info("\t>>>> wordAction Complete() before OVERTIME, completePlayerRound() ALREADY fired on last word in overtime ")
          }
          return doPlayerRoundComplete;
        })
      ).toPromise()
      .then( (doPlayerRoundComplete)=>{
        if (doPlayerRoundComplete) {
          console.log("0: ******* completePlayerRound, from onTimerDone() OVERTIME, clearTimer=false")
          return this.completePlayerRound(false);
        }
        else {
          // buzz=false/overtime=false silent OR playerRoundDidComplete()
          /**
           * NOTE: wordAction[remaining==0 && isTicking==true]
           *  => onTimerDone()    ( <== here )
           *  => completePlayerRound()  // do NOT call onTimerDone from completePlayerRound
           */
          return
        }
      })
    })
    .catch( err=>{
      if (err=="skip") return Promise.resolve()
      return Promise.reject(err)
    })
  }

  onWordActionClick(action:string) {
    if (!this.gameDict.activeRound) return

    // role guard
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) return;

    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        if (gamePlay.playerRoundBegin==true) {
          if (gamePlay.isTicking==false){
            console.warn("TODO: decide if player can click wordAction when timer is paused");
            // also happens during extra time
          }
          // accept wordAction
          this.wordAction(gamePlay, action);
        }
      })
    ).subscribe();
  }

  // TODO: let the game master also trigger a wordAction
  private wordAction( gamePlay: GamePlayState, action:string ){
    // role guard
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) return;

    /**
     * NOTES: round begins with beginPlayerRoundClick() => startTimer() => nextWord()
     *  - player/moderator button click in template => wordAction() 
     *  - do NOT start timer from wordAction
     */

    if (!gamePlay.playerRoundBegin ) {
      // Buttons should be disabled
      return;
    };
    
    let isOvertime = gamePlay.isTicking==false;
    let {word} = gamePlay;
    let correct = action=="OK" ? true : false;
    let available = !correct;
    let round = this.activeRound;
    let update = {} as GamePlayState;

    Promise.resolve()
    .then( ()=>{
      if (!gamePlay.word) {
        // TODO: move to onPlayerRoundWillBegin()

        // load initial word
        let next = FishbowlHelpers.nextWord( round, gamePlay, {[word]:available} );
        update.word = next.word || null;
        update.remaining = next.remaining;
        return this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update)
        .then( async ()=>{
          // move to a catch block
          if (next.remaining===0 && this.activeRound) {
            throw new Error("INVALID STATE: playerRound has not begun and no more words.");
            // await this.onTimerDone( new Date(), false);
            // return this.completePlayerRound(true);
          }
        });
      }
    })
    .then( ()=>{ 
      if (gamePlay.word) {
        let next = FishbowlHelpers.nextWord( round, gamePlay, {[word]:available} );
        update.remaining = next.remaining;
        if (isOvertime){
          update.word = null;
        }
        else {
          update.word = next.word || null;
        }
  
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
        let roundStartTime = Date.now() - gamePlay.timerDuration * 1000;
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
        .then( async ()=>{
          let isLastWord = next.remaining==0;
          let isDone = this.activeRound && (isLastWord || isOvertime);
          if (isDone) {
            // state: player got last word BEFORE Timer expired
            if (!isOvertime) {
              console.log("0: ******* onTimerDone() <= completePlayerRound(), from wordAction(),  buzz=FALSE")
              await this.onTimerDone( new Date(), false);
            }
            console.log("0: ******* completePlayerRound(), from wordAction(), next.remaining==0")
            this.completePlayerRound(isLastWord);
          }
        });
      }
    })
  }

  /**
   * orchestrate the timed sequence to complete the playerRound
   * [before]
   *    onTimerDone()
   * onTimerDone() or FishbowlHelpers.nextWord() is empty 
   */
  async completePlayerRound(gameRoundComplete=false):Promise<void>{
    console.log("1: ******* completePlayerRound, roundComplete=", gameRoundComplete)
    let wasOnTheSpot = this.stash.onTheSpot;

    // role guard
    if (!wasOnTheSpot) 
      return;



    // only active player pushes updates to the cloud
    let activeRound = this.activeRound;
    let rid = this.game.activeRound;

    let playerRoundComplete = true;
    let gameComplete = gameRoundComplete && activeRound.round==3;

    return Promise.resolve()
    .then( ()=>{
      // event: playerRoundWillComplete
      console.info("\t>>>> playerRoundWillComplete()")
    })
    .then( ()=>{
      // push complete game status to doInterstitials()
      let update = {
        playerRoundBegin: false,
        playerRoundComplete, gameRoundComplete, gameComplete,
        timer: null,
      }
      return this.db.list<GamePlayState>('/gamePlay').update(rid, update)
      // NOTE: Handle UX response in doShowInterstitials()
    })
    .then( ()=>{
      // wait for interstitial to grab closure data before 
      return Helpful.waitFor(2000)
    })
    .then( ()=>{
      // merge gamePlay.log => gameLog
      console.log(" >>>> gamePlay.log copied to gameLog and changes applied to round.entries");
      return this.gameHelpers.pushGameLog(this.gamePlayWatch, activeRound)
    })
    .then( ()=>{
      // event: playerRoundDidComplete
      console.info("\t>>>> playerRoundDidComplete()");
      // NOTE: Handle UX response in doShowInterstitials()
      return Helpful.waitFor(2000)
    })
    .then( ()=>{
      return this.nextPlayerRound();
    })
    .then( ()=>{
      if (gameRoundComplete) {
        return this.completeGameRound(this.activeRound)
      }
    });
  }

  /**
   * queue next PlayerRound AFTER completePlayerRound() or 
   */
  private nextPlayerRound():Promise<void>{
    let isOnTheSpot = this.stash.onTheSpot;
    if (!isOnTheSpot) {
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
        playerRoundBegin: false,
        playerRoundComplete:false, 
        roundComplete: false,
      }
      return this.db.list<GamePlayState>('/gamePlay').update(rid, updateGamePlay)
    })
    .then( ()=>{
      console.info("\t>>>> spotlightWillChange()");
    })
    .then(()=>{
      this.gameHelpers.moveSpotlight(this.gamePlayWatch, activeRound).then( ()=>{
        console.info("\t>>>> spotlightDidChange()");
      })
    })
  }

  async completeGameRound(round:GamePlayRound){

    let isGameComplete = round.round == 3
    let rid = this.game.activeRound;
    let waitFor:Promise<void>[] = [];

    // only active player pushes updates to the cloud
    waitFor.push(
      this.db.list<GamePlayState>('/gamePlay').remove(rid)
    );

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

    console.info("\t>>>> gameRoundWillComplete()");
    Promise.all(waitFor)
    .then( ()=>{
      console.info("\t>>>> gameRoundDidComplete()");
    })
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
