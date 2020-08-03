import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ModalController, IonSearchbar, } from '@ionic/angular';
import { Title } from '@angular/platform-browser';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import { Plugins, } from '@capacitor/core';
import * as dayjs from 'dayjs';

import { Observable, Subject, BehaviorSubject, of, from, interval, pipe, } from 'rxjs';
import { map, tap, switchMap, take, takeWhile, takeUntil, first, filter, withLatestFrom, throttleTime, } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { GamePackService } from '../../fishbowl/game-pack.service';
import { Player, } from '../../user/role';
import { AudioService } from '../../services/audio.service';
import { CountdownTimerComponent } from '../../components/countdown-timer/countdown-timer.component';
import { HelpComponent } from '../../components/help/help.component';
import { AppConfig, Helpful } from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers';
import { GameHelpers } from '../game-helpers';
import { 
  Game, GameWatch, GameDict, GameAdminState, RoundEnum,
  GamePlayWatch, GamePlayState, GamePlayRound, GamePlayLogEntries, GamePlayLog,
  SpotlightPlayer, WordResult, Scoreboard,
  PlayerListByUids, PlayerByUids, TeamRosters, 
} from '../types';


const { Storage } = Plugins;
declare let window;
declare let document;



@Component({
  selector: 'app-game',
  templateUrl: './game.page.html',
  styleUrls: ['./game.page.scss', './wobble.scss'],
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
  public gamePlay$: Observable<GamePlayState>;      // for async pipes
  public scoreboard:Scoreboard;


  /**
   * end GameWatch
   */

  public audioVolumeIcons = ["volume-mute","volume-low","volume-medium","volume-high"];
  public initialTimerDuration = 45;
  
  public stash:any = {
    // GameWatch changes
    audioVolumeIcon: null,
    activeGame: false,    // activeGame can be true between game.activeRound
    // end GameWatch
    playersSorted: [],          // Object.entries(game.players) sorted by player name
    showCheckInDetails: false,
    showTelepromter: false,


    // deprecate
    listen: true,
  };
  public displayName:string;

  public listen$ : Subject<boolean> = new Subject<boolean>();
  public upcomingGames$: Observable<Game[]>;
  public game$:Observable<Game>;
  private gameRef:AngularFireObject<Game>;
  public playerId: string;
  public player: Player;
  public isPlayerRegistered: boolean;
  private player$ = new BehaviorSubject<Player>(null);
  public spotlight:SpotlightPlayer;
  public onTheSpot:boolean;
  public gameSummary: any;      // for game.complete==true


  @ViewChild( 'animateTarget', {static:false} ) animateTarget:HTMLElement;
  @ViewChild( 'countdownTimer', {static:false} ) countdownTimer:CountdownTimerComponent;

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private loadingController: LoadingController,
    private modalCtrl: ModalController,
    private titleService: Title,
    private audio: AudioService,
    private db: AngularFireDatabase,
    private authService: AuthService,
    private gameHelpers: GameHelpers,
    private gamePackService: GamePackService,
  ) {

    if (environment.production==false){
      window['_dbg'] = window['_dbg'] || {};
      window._dbg.stash = this.stash
      window._dbg.dayjs = dayjs
    }

  }


  
  /** ************************************************************************************************
   * Page Lifecycle and event loop
   */

  async ngOnInit() {
    console.info("0>>> ***** ngOnInit(): load ******")
    Storage.get({key:'volume'}).then( (res)=>{
      let value = parseInt(res.value)
      this.volumeClick( value||0, false)
    });
    
    let loading = await this.presentLoading();
    // # set initial volume
    this.loadPlayer$().pipe(
      tap( ()=>{
        loading && loading.dismiss();
      }),
    ).subscribe();

  }

  ngOnDestroy(){
    this.gameId = null;  
    // complete subscription on this.loadGame$ 
    //    => completes gamePlayWatch.gamePlay$ and gameLog$
  }

  ngAfterViewInit(){
    this.preloadAudio();
  }

  // from ionViewWillEnter() > watchGame()
  public loadGame$(gameId):Observable<GameDict>{
    this.gameWatch = this.gameHelpers.getGameWatch( gameId );
    let {gameDict$, game$} = this.gameWatch;

    return this.gameWatch.gameDict$.pipe(
      // takeUntil(this.done$),
      // debounceTime(500),
      tap( d=>{
        this.gameDict = d;
        this.game = d.game;
      }),
      map( (gameDict)=>{
        gameDict.gamePlayWatch = this.gameHelpers.getGamePlay(gameId, gameDict.game);
        return gameDict;
      }),
    );
  }

  // called AFTER ngOnInit, before page transition begins
  ionViewWillEnter() {
    // const dontWait = HelpComponent.presentModal(this.modalCtrl, {template:'intro', once:false});
    this.stash.restoreTitle = this.titleService.getTitle();
    this.stash.isActivePage = true;
    this.gameId = this.activatedRoute.snapshot.paramMap.get('uid');
    this.gameRef = this.db.object<Game>(`/games/${this.gameId}`);
    this.stash.wasCached = this.watchGame(this.gameId);
  }
  
  ionViewDidEnter() {
    interval(500).pipe(first()).subscribe(()=>this.stash.showSocialButtons = true)
    if (this.stash.wasCached) {
      // just replay missing gamePlay events, ONCE
      this.gameDict.gamePlayWatch.gamePlay$.pipe(
        withLatestFrom( this.gameWatch.gameDict$ ),
        takeWhile( ()=>this.stash.isActivePage ),
        first(), 
        this.pipeCloudEventLoop_Foreground( this.player$.value), 
      )
      .subscribe( ([gamePlay,_]:[GamePlayState, any])=>{ 
        console.warn("120: REPLAY missed gamePlay events", gamePlay.changedKeys, gamePlay)
      });
    }
  }


  ionViewWillLeave() {
    this.stash.showSocialButtons = false;
    this.titleService.setTitle( this.stash.restoreTitle )
    this.stash.isActivePage = false;
    // console.warn("111: ionViewWillLeave$>>  isActivePage=", this.stash.isActivePage);
    // close modals
  }



  /**
   * 
   * @param gameId 
   * @return true if cached
   */
  watchGame(gameId:string):boolean{
    let isCached = this.gameDict && this.gameDict[this.stash.watchingGamePlayId];
    if (isCached) {
      return true;
    }
    else {
      this.stash.watchingGamePlayId = null;
    }


    /**
     * this is the MAIN game listener for cloud players
     */
    this.loadGame$(gameId).pipe(
      // takeUntil(this.done$),  // ??
      takeWhile( (d)=>!!d[gameId]),
      tap( d=>{
        let title = d && d.game && d.game.label;
        if (title) this.titleService.setTitle( `${title} –– Fishbowl`)
      }),
      map( (d)=>{
        let isGameOver = this.doGameOver(d);
        if (isGameOver) {
          return;
        }
        return d;
      }),
      tap( d=>{
        if (!d) return; // gameOver

        let game = d.game;                  // closure
        this.isPlayerRegistered = this.setGamePlayer(d) || this.isModerator();
        this.stash.playersSorted = Helpful.sortObjectEntriesByValues(game.players) as Array<[string,string]>
        this.watchGamePlay(gameId, d);
      }),
    ).subscribe(null,null,
      ()=>{
        console.info(">>> ***** loadGame$(): subscriber COMPLETE ******")
      }
    );

  }

  /**
   * 
   * 
   * @param gameId 
   * @param d 
   * @returns true if Subscription was already cached
   */
  watchGamePlay(gameId: string, d:GameDict){
    console.warn("120:0 \t\twatchGamePlay for uid=", d.gamePlayWatch.uid);
    let isCached = this.stash.watchingGamePlayId == d.gamePlayWatch.uid;
    if (isCached) {
      return true;
    }
    else {
      this.stash.watchingGamePlayId = null;
    }

    this.gamePlayWatch = d.gamePlayWatch;
    this.gamePlay$ = this.gamePlayWatch.gamePlay$;

    this.stash.watchingGamePlayId = d.gamePlayWatch.uid;
    if (this.stash.doneWatchingGamePlay) 
      this.stash.doneWatchingGamePlay.unsubscribe();  

    this.stash.doneWatchGamePlay = this.gamePlayWatch.gamePlay$.pipe(
      withLatestFrom( this.gameWatch.gameDict$ ),
      // automatcally completes when game.activeRound changes
      throttleTime(100),
      tap( (res:[GamePlayState, GameDict])=>{
        this.patchGameOver(res);
      }),
      this.pipeCloudEventLoop_Bkg(), 
      this.pipeCloudEventLoop_Foreground( this.player$.value), 
    ).subscribe(null,null,
      ()=>{
        this.stash.watchingGamePlayId = null;
        console.info(">>> ***** watchGamePlay(): subscriber COMPLETE ******")
      }
    );
  }

  private pipeCloudEventLoop_Bkg() {
    return pipe(
      tap( (res:[GamePlayState, GameDict])=>{
        if (!res) return;
        let [gamePlay, d] = res;
        let round = d.activeRound;          // closure

        let changed = gamePlay.changedKeys || [];
        if (changed.includes('spotlight')) {
          this.spotlight = Object.assign( {}, FishbowlHelpers.getSpotlightPlayer(gamePlay, round));
          this.onTheSpot = this.hasSpotlight('player');
        }        
        let isThrottling = this.throttleTimeAndWordEvents(gamePlay);        
        this.doGamePlayUx(gamePlay);
      }),
    );
  }
  
  private pipeCloudEventLoop_Foreground(spotlightPlayer:Player) {
    return pipe(
      filter( ()=>this.stash.isActivePage),
      tap( (res:[GamePlayState, GameDict])=>{
        if (!res) return;
        let [gamePlay, d] = res;
        let game = d.game;                  // closure
        let round = d.activeRound;          // closure
        if (!this.stash.isActivePage)
          return

        let spotlightPlayer = FishbowlHelpers.getSpotlightPlayer(gamePlay, round);
        this.doGamePlayExtras(gamePlay);
        this.doInterstitialsWithScoreboard(
          gamePlay, game, round, spotlightPlayer,
        );
        this.doInterstitialsPreGame(
          gamePlay, game,
        );
      }),
    );
  }

  private doInterstitialsWithScoreboard(
    gamePlay: GamePlayState,
    game: Game,
    round: GamePlayRound,
    spotlightPlayer: SpotlightPlayer,

  ) {
    let changed = gamePlay.changedKeys || [];

    const TIME={
      BUZZER_ANIMATION_COMPLETE: 2000,
      PLAYER_ROUND_DISMISS: 10000,
      GAME_ROUND_DISMISS: 10000,
    }

    // guards
    if (!game.rounds && !game.teamNames) 
        return;
    if (gamePlay && gamePlay.log && !round) {
      throw new Error( "ERROR: gamePlay.log should be undefined between, rounds, e.g. when activeRound=null")
    }

    // required
    let teamNames = Object.values(game.teamNames);
    let merge = {
      roundKey: round && `round${round.round}` || null,
      log: gamePlay && gamePlay.log || null,
    }

    /**
     * these interstitials must wait for the scoreboard to update
     */
    Promise.resolve(this.scoreboard)
    .then( async (scoreboard)=>{
      if (changed.includes('log') || !scoreboard) {
        scoreboard = await this.gameHelpers.scoreRound$(
          this.gamePlayWatch, 
          teamNames, 
          merge
        ).toPromise();
        this.scoreboard = scoreboard;
      }
      return scoreboard
    })
    .then( async (scoreboard)=>{

      if (changed.includes('playerRoundComplete')) {
        // guard: playerRoundComplete=true
        if (!round) throw new Error("round should not be empty when playerRoundComplete==true")

        let gamePlayCopy = Object.assign({}, gamePlay);
        gamePlayCopy.log = FishbowlHelpers.filter_BeginRoundMarker(gamePlay.log);
        let gameSummary = {
          spotlightPlayer,
          game: Helpful.pick(game, 'playerCount', 'teamNames'),
          roundNo: round.round || "––",
          duration: Date.now()+round.startTimeDesc,
          scoreboard,
        }


        // flash player round complete interstitial
        let interstitial = {
          template: "player-round-complete", 
          once:false,
          gamePlay: gamePlayCopy,
          gameSummary,
          getRemaining: FishbowlHelpers.getRemaining,
          onDidDismiss: (v)=>{
            console.info('player-round complete dismissed')
          },
          // dismiss:()=>{},
          duration: TIME.PLAYER_ROUND_DISMISS,
        }
        await Helpful.waitFor(TIME.BUZZER_ANIMATION_COMPLETE);
        await HelpComponent.presentModal(this.modalCtrl, interstitial)
        // wait for dismissal before continuing
      }
      return scoreboard;
    })
    .then( async (scoreboard)=>{
      if (changed.includes('gameRoundComplete')) {
        // guard: roundComplete=true
        // NOTE: playerRoundComplete==true when gameRoundComplete=true
        let teamNames = game.teamNames;
        let winnersByRound = Object.keys(scoreboard).reduce( (o, round)=>{ 
          let team0 = scoreboard[round][teamNames[0]] || {};
          let team1 = scoreboard[round][teamNames[1]] || {};
          o[round]==null;
          if ((team0.points || 0) > (team1.points  || 0)) o[round]=teamNames[0];
          if ((team1.points || 0) > (team0.points  || 0)) o[round]=teamNames[1];
          return o;
        }, {});

        let gameSummary = {
          teamNames: game.teamNames,
          roundNo: round.round || "––",
          duration: Date.now()+round.startTimeDesc,          
          scoreboard,
        }
        let duration = TIME.GAME_ROUND_DISMISS;
        if (round.round==3) duration *=2;       // GAME OVER
        console.log("2: gameRoundComplete=true", winnersByRound, gameSummary)

        let interstitial = {
          template: "game-round-complete", 
          once:false,
          gameSummary,
          winnersByRound,
          onDidDismiss: (v)=>{
            console.info('GAME-round-complete dismissed')
            return true;
          },
          dismiss:(v)=>{
            if (v===true) this.modalCtrl.dismiss()
          },
          duration,
        }
        await HelpComponent.presentModal(this.modalCtrl, interstitial);
        if (this.isModerator()) {
          console.log("2: beginNextGameRoundTimer() [by moderator]")
          this.beginNextGameRoundTimer();
        }
      }
      return scoreboard;
    });
  }



  /**
   * these interstitials do NOT depend on the scoreboard
   */
  private doInterstitialsPreGame(
    gamePlay: GamePlayState,
    game: Game,
  ) {
    let changed = gamePlay.changedKeys || [];
    
    let dontWait = Promise.resolve()
    // .then( ()=>{   
    //   // debug interstitial
    //   this.showBeginPlayerRoundInterstitial(gamePlay, game, true); 
    //   return Promise.reject('skip')
    // })
    .then( ()=>{   
      if (changed.includes('gameComplete')) {
        // just in case we missed the gameComplete trigger, the moderator will rerun on reload, skip interstitials
        return Promise.reject('skip');
      }  
    })
    .then( async ()=>{
      if (gamePlay.doBeginPlayerRound===false) {
        HelpComponent.dismissTemplate('begin-player-round')
      }
    })    
    .then( ()=>{   
      if (changed.includes('playerRoundBegin')) {
        // cancel all Interstitials
        console.warn("14: XXX playerRoundBegin cancel ALL interstitials ")
        HelpComponent.last &&  HelpComponent.last.dismiss(true)
      }
    })
    .then( async ()=>{   
      if (changed.includes('doBeginGameRound') && gamePlay.doBeginGameRound>0) {
        // beginGameRound Interstitial
        await this.showBeginGameRoundInterstitial(game, gamePlay.doBeginGameRound)
        if (changed.includes('doBeginPlayerRound')) {
          // show ready for Spotlight Player or PassThePhone
          // allow showBeginGameRound interstitial to appear
          // console.warn("14:a1 pass the phone, changed=",  changed )
          await Helpful.waitFor(1000);
          let waitFor = HelpComponent.last && HelpComponent.last.onDidDismiss();
          await waitFor
          this.showBeginPlayerRoundInterstitial(gamePlay, game);
        }    
        return Promise.reject('skip')
      }
    })
    .then( async ()=>{
      if (!!gamePlay.doBeginGameRound && changed.includes('spotlight')) {
        if (HelpComponent.curTemplate()=='begin-player-round'){
          return;
        }
        // fire interstitial only on first load, and AFTER showBeginGameRoundInterstitial()
        // otherwise fire AFTER scoreboards from doInterstitialsWithScoreboard()
        // console.warn("14:a2 pass the phone, changed=",  changed )å
        await Helpful.waitFor(1000); // (required)
        // console.warn("14:b  AFTER spotlightDidChange BEFORE passThePhone last=", HelpComponent.last.componentProps.template)
        let waitFor = HelpComponent.last && HelpComponent.last.onDidDismiss();
        await waitFor
        // console.warn("14:d  waitForDismissal resolved, promise=", waitFor)
        this.showBeginPlayerRoundInterstitial(gamePlay, game);
        return Promise.reject('skip');
      }
    })
    .then( async ()=>{
      if (changed.includes('teamRostersComplete')) {
        this.modalCtrl.dismiss(true).catch(()=>{});
      }    
    })
    .then( async ()=>{
      if (changed.includes('doTeamRosters')) {
        // HACK: use Date.now() to force change detection
        this.showTeamRostersInterstitial();
        return Promise.reject('skip')
      }    
    })
    .then( ()=>{
      if (changed.includes('checkInComplete')) {
        this.modalCtrl.dismiss(true).catch(()=>{});
      }
    })
    .then( async ()=>{
      if (changed.includes('doCheckIn')) {
        let status = game.checkIn && game.checkIn[this.playerId];
        // HACK: use Date.now() to force change detection
        let repeatCheckIn = typeof gamePlay.doCheckIn == "number";
        this.showCheckInInterstitial(status, repeatCheckIn);
        return Promise.reject('skip')
      }    
    })
    .then( ()=>{
      let doPlayerWelcome = changed.includes('doPlayerWelcome');
      doPlayerWelcome = doPlayerWelcome && !gamePlay.checkInComplete
      doPlayerWelcome = doPlayerWelcome || !this.isPlayerRegistered;
      if (doPlayerWelcome) {
        this.showWelcomeInterstitial(game);
        return Promise.reject('skip')
      }
    })
    .catch( (err)=>{
      if (err=="skip") return Promise.resolve()
    })
  }

  

  private doGamePlayExtras( 
    gamePlay: GamePlayState,
  ){
    let changed = gamePlay.changedKeys || [];

    if (changed.includes('remaining')) {
      this.stash.wordsRemaining = FishbowlHelpers.getRemaining(gamePlay);
    }
    if (changed.includes('doPlayerUpdate')) {
      this.setGamePlayer();
    }

  }  






  /** ************************************************************************************************
   * Interstitials to prompt player Action
   */


  /**
   * cloud action, trigger on gamePlay.doPlayerWelcome==true, GameAdminState
   */ 
  showWelcomeInterstitial(game:Game) {
    if (!this.stash.isActivePage) return
    this.player$.pipe(
      // filter( p=>!!p.displayName),
      take(1),
      tap( (player)=>{
        let playerId =  player.uid;
        let playerName = game.players && game.players[playerId];
        let hasEntry = (game.entries && !!game.entries[playerId]) || this.isModerator();
        let gameTitle = game.label;
        let entryLink = ['/app/game', this.gameId, 'player'];
        let chatRoom = game.chatRoom;
        // hasEntry = false;

        HelpComponent.presentModal(this.modalCtrl, {
          template:'player-welcome',
          once: true,
          replaceSame: false,
          dismissKeyPrefix: game.label,
          gameTitle, chatRoom,
          playerName, hasEntry, entryLink,
          backdropDismiss: false,
          // duration: status===false ? null : ALREADY_CHECKED_IN_DISMISS,
          swipeToClose: false,
          dismiss: (v)=>{ 
            if (this.isModerator()) v=true;
            if (v==true) this.modalCtrl.dismiss();
            this.modalCtrl.dismiss();
          }
        }).then( ()=>{
          this.audio.play('click') 
        });
      })
    ).subscribe();
  }  

  /**
   * cloud action, trigger on gamePlay.doCheckIn==true, GameAdminState
   */ 
  showCheckInInterstitial(status:string | boolean, doRepeatCheckIn: boolean=false) {
    // if (!!status) return;

    let isCheckedIn = !!status;
    if (doRepeatCheckIn) {
      if (isCheckedIn) return
    }

    const ALREADY_CHECKED_IN_DISMISS = 10000;
    this.player$.pipe(
      filter( p=>!!p.displayName),
      take(1),
      tap( player=>{
        let dontWait = HelpComponent.presentModal(this.modalCtrl, {
          template:'check-in',
          replace: true,
          playerName: player.displayName,
          backdropDismiss: false,
          // duration: status===false ? 9999 : ALREADY_CHECKED_IN_DISMISS,
          swipeToClose: true,
          playerReady: (res)=>{
            this.modalCtrl.dismiss(res);
            let sound = res ? 'ok' : 'click';
            this.audio.play(sound);
            let checkIn = {[player.uid]: res ? player.displayName : false };
            this.gameHelpers.pushCheckIn(this.gameId, checkIn).then( ()=>{
              isCheckedIn = true;
            });
          },
          dismiss: (v)=>{ 
            if (isCheckedIn) v=true;
            if (this.isModerator()) v=true;
            if (v===true || !!status) 
              return this.modalCtrl.dismiss();
          }
        })
        .then( ()=>{
          this.audio.play('click'); // on modal.present()
        });
      })
    ).subscribe();
  }

  showTeamRostersInterstitial(){
    const TEAM_ROSTER_DISMISS = 30*1000;
    let gameDict = this.gameDict;
    let done = this.gameHelpers.listenTeamRosters$(gameDict).subscribe(()=>{
      this.audio.play('click');
    })
    this.player$.pipe(
      filter( p=>!!p.displayName),
      take(1),
      tap( player=>{
        let dontWait = HelpComponent.presentModal(this.modalCtrl, {
          template:'team-rosters',
          once:false,
          playerName: player.displayName,
          backdropDismiss: false,
          replaceSame: false,
          duration: TEAM_ROSTER_DISMISS,
          swipeToClose: true,
          gameDict$: this.gameWatch.gameDict$,
          onDidDismiss: ()=>{
            done.unsubscribe();
          },
          dismiss: (v)=>{
            // if (this.isModerator()) v=true;
            // if (v===true) return this.modalCtrl.dismiss();
            return this.modalCtrl.dismiss();
           }
        }).then( ()=>{
          this.audio.play('click')  // on modal.present()
        });
      })
    ).subscribe();
  }


  async showBeginPlayerRoundInterstitial(gamePlay:GamePlayState, game:Game, doChangePlayer:boolean = false){
    if (this.isModerator()) return;
    
    // role & state guards
    let player = this.player$.getValue();
    if (!game.checkIn[ this.getActingPlayerId(player) ]) return
    if (!game.activeRound) return

    this.stash.playerCount = Object.keys(FishbowlHelpers.getCheckedInPlayers(game)).length;
    // confirm state, gamePlay.doBeginPlayerRound has not changed
    gamePlay = await this.gameDict.gamePlayWatch.gamePlay$.pipe( first() ).toPromise();
    if (!doChangePlayer){
      if (gamePlay.doBeginPlayerRound==false) {
        return
      }
    }

    let round = this.gameDict.activeRound;
    let spotlight = Object.assign( {}, FishbowlHelpers.getSpotlightPlayer(gamePlay, round));
    let modalOptions = {
      template:'begin-player-round',
      backdropDismiss: false,
      replaceSame: false,
      swipeToClose: true,
      dismissKeyPrefix: game.label,
      throttleTime: 10*1000,
      player$: this.player$,
      // react to spotlight changes
      spotlight$: this.gameDict.gamePlayWatch.gamePlay$.pipe( 
        map( gamePlay=>{
          // this instanceof GamePage
          let round = this.gameDict.activeRound;
          let spotlight = Object.assign( {}, FishbowlHelpers.getSpotlightPlayer(gamePlay, round));
          return spotlight;
        })
      ),   
      // beginPlayerRound
      spotlightPlayerReadyClick: this.spotlightPlayerReadyClick.bind(this),
      getActingPlayerId: this.getActingPlayerId.bind(this),
      // for TeamRoster
      gameDict$: this.gameWatch.gameDict$,
      dismiss: (v:boolean)=>{
        this.modalCtrl.dismiss(true);
        return null;
      },
      
      
      // unused
      self:this,
        // deprecate: playAs different player
      doChangePlayer,
      playAs : this.doPlayAsAlias.bind(this),
    }
    await HelpComponent.presentModal(this.modalCtrl, modalOptions);
    // dismissed
    this.gameHelpers.pushGamePlayState(this.gamePlayWatch, { doBeginPlayerRound:false, });
    return;
  }

  async showChangePlayerInterstitial(gamePlay:GamePlayState, game:Game,){
    // role & state guards
    let player = this.player$.getValue();
    if (!game.activeRound) return


    // confirm state, gamePlay.doBeginPlayerRound has not changed
    gamePlay = await this.gameDict.gamePlayWatch.gamePlay$.pipe( first() ).toPromise();
    if (!!gamePlay.playerRoundBegin) return // round has already begun
    let round = this.gameDict.activeRound;
    let spotlight = Object.assign( {}, FishbowlHelpers.getSpotlightPlayer(gamePlay, round));
    let modalOptions = {
      // modalOptions: this instanceof HelpComponent, self instanceof GamePage
      template:'change-player',
      backdropDismiss: false,
      replaceSame: false,
      swipeToClose: true,
      dismissKeyPrefix: game.label,
      throttleTime: 2*1000,
      player,
      player$: this.player$,
      // NOTE: do NOT react to spotlight changes, player should only be able 
      //    to playAs() a known spotlight player.
      //    OR, dismiss interstitial when spotlight player has changed
      // playAs spotlight player
      spotlight,
      doPlayAsClick: this.doPlayAsAlias.bind(this),
      dismiss: (v:boolean)=>{
        this.modalCtrl.dismiss(true);
        return null;
      },
      // unused
      getActingPlayerId: this.getActingPlayerId.bind(this),
    }
    await HelpComponent.presentModal(this.modalCtrl, modalOptions);
    // dismissed
    await this.gameHelpers.pushGamePlayState(this.gamePlayWatch, { doBeginPlayerRound:false, });
    // TODO: add announce change player?
    return;
  }

  showBeginGameRoundInterstitial(game:Game, round:number):Promise<void>{
    const BEGIN_ROUND_DISMISS = 8000;
    return HelpComponent.presentModal(this.modalCtrl, {
      template:'begin-game-round',
      dismissKeyPrefix: game.label,
      throttleTime: 60*1000,
      backdropDismiss: false,
      duration: BEGIN_ROUND_DISMISS,
      swipeToClose: true,
      round: round,
      onDidDismiss: ()=>{
      },
      dismiss: (v)=>{
        return this.modalCtrl.dismiss()
        .then( ()=>{
          this.audio.play('click');
        });
      }
    });
  }



  
  /** ************************************************************************************************
   * Helpers
   */
  async presentLoading() {
    const loading = await this.loadingController.create({
      message: 'Loading...',
      duration: 4000,
      spinner: "dots",
    });
    loading.present();
    return loading;
  }

  /**
   * player$ is set from AuthService.getCurrentUser$() and doGamePlayExtras() => setGamePlayer()
   */
  loadPlayer$():Observable<Player> {
    return this.authService.getCurrentUser$().pipe(
      takeWhile( ()=>this.gameId!==null),
      switchMap( u=>{
        if (!!u) return of(u);
        return from(this.authService.doAnonymousSignIn());
      }),
      switchMap( u=>{
        if (!u) 
          throw new Error( "loadPlayer$ user is undefined")

        this.playerId = u.uid;      // only change here

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
        return this.player$.asObservable();
      }),
      tap( p=>{
        this.player = p;
        // console.log("  >>> player ready, name=", this.player)
      }),
    );
  }
  

  /**
   * update this.player$ Observable with game and team details
   * @param d 
   * @returns isRegistered
   */
  setGamePlayer(d:GameDict=null):boolean {
    // trigger on gamePlay.doPlayerUpdate==true, set in loadGameRounds() and loadNextRound()
    // OR, every gameWatch.gameDict$ emit

    let {game, activeRound} = d || this.gameDict;
    let player = this.player$.value;
    let pid = player.uid; 
    // let pid = this.getActingPlayerId(player);
    let playerSettings = FishbowlHelpers.getPlayerSettings(pid, game, activeRound);
    let update = Object.assign({}, player, playerSettings);
    this.player$.next( update );
    return game.entries && !!game.entries[pid];
  }

  /**
   * (not fully tested) 
   * navigate to Player Settings page for a given stage name, prepare for EntryPage.onTakePlayerIdentity()
   * - called by IonSearchbar:ionBlur/ionChange event handler
   * - BEFORE game play begins
   * 
   * @param o 
   * @param reset 
   */
  async doFindStageName (o:IonSearchbar, reset:boolean=false){
    // guard(?)
    let player = this.player$.getValue();
    let isPlayer = !!this.game.players[player.uid];
    let isCheckedIn = !!this.game.checkIn[player.uid];
    if (isPlayer) return;

    // user does NOT have a spot in game
    this.stash.show_SearchByStageName_Empty = false;
    if (reset) {
      this.stash.show_SearchByStageName = false;
      o.value = "";
    }

    let allowChangePlayerIfALREADYcheckedIn = false;
    let name = o.value;
    if (!name) return;

    // find a game player by stage name
    let found = FishbowlHelpers.doPlayerEntryLookup(name, this.game);
    let pid = found && found[0];
    if (pid) {
      // goto Player Setting to allow EntryPage.onTakePlayerIdentity()
      let replace = JSON.stringify({uid:pid, playerName: name })
      setTimeout( ()=>{
        this.stash.show_SearchByStageName = false;
        o.value = "";
      },1000)
      return this.router.navigate( ['/app/game', this.gameId, "player", {replace}] );
    }
    else {
      this.stash.show_SearchByStageName_Empty = true;
    }
  }


  getActingPlayerId(player:Player=null) {
    try {
      player = player || this.player$.value;
      return player.playingAsUid || player.uid;
    } catch(err) {
      return null;
    }
  }


  /**
   * complete PassThePhone action from showChangePlayerInterstitial()
   * - DURING game play
   * 
   * @param assumePlayerAlias 
   */
  doPlayAsAlias( assumePlayerAlias:SpotlightPlayer ) {

    // NOTE: this.spotlight is responsive?  updated in pipeCloudEventLoop_Bkg()
    if (assumePlayerAlias.uid != this.spotlight.uid) {
      const msg="spotlight player has changed, please try again"
      // Toast 
      console.warn(msg);
      return;
    }


    console.warn("14: pass the phone to uid=", assumePlayerAlias);
    let p = Object.assign({}, this.player$.getValue()); // mutate
    let sound = assumePlayerAlias ? 'ok' : 'click'
    this.audio.play(sound);

    if (p.uid == assumePlayerAlias.uid) {
      delete p.playingAsUid;
    }
    else {
      p.playingAsUid = assumePlayerAlias.uid;
    }
    this.player$.next(p);
    this.onTheSpot = this.hasSpotlight(p);
  }

  

  




  /** ************************************************************************************************
   * game setup actions (moderator)
   */

  onGameTime(t:Date|{seconds:number}=null, buzz=true):Promise<void> {
    // reload page when game active
    window.location.href = window.location.href;
    return
  }

  doGameReset(hard=false){
    if (!this.isModerator()) return;

    Promise.resolve()
    .then( ()=>{
      let game = this.game;
      if (!game['isDev']) {
        let msg = `Are you sure you want to reset game: ${game.label}`;
        let resp = window.confirm(msg)
        if (!resp) return;
      }
      return this.gameHelpers.DEV_resetGame(this.gameId, game, this.gameDict, !hard)
    })
    .then( async ()=>{
      // bypass throttleTime()
      await Helpful.waitFor(1000);
      this.gameHelpers.initGameAdminState(this.gameDict.gamePlayWatch, {doPlayerWelcome: true});
    });
  }

  /**
   * triggered by moderator
   */
  async beginCheckIn(gameId:string){
    if (!this.isModerator()) return;

    let gamePlay = await this.gamePlayWatch.gamePlay$.pipe(first()).toPromise();
    let doRepeat = gamePlay && !!gamePlay.doCheckIn && !gamePlay.checkInComplete;
    if (doRepeat) {
      // repeat checkIn 
      await this.gameHelpers.pushGamePlayState(this.gamePlayWatch, { doCheckIn: Date.now() as any });
      return 
    }


    let update = { 
      doCheckIn: true,
      checkInComplete: false,
    }
    await this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update);
    await this.gameHelpers.pushGameState( this.gameId, {isGameOpen:true} );

    this.stash.showCheckInDetails = true;  // moderator control panel
  }


  async loadGameRounds(force=false):Promise<boolean>{
    if (!this.game) return false;
    if (!this.isModerator()) return false;

    let existingRoundEnums = Object.values(this.game.rounds || {});

    const WORDS_PER_QUICK_PLAYER = 3;
    let words = await this.gamePackService.getWords(this.game.quickPlay, 3);
    if ((!words) && this.game.quickPlay) {
      if (!environment.production){
        this.gamePackService.setWords(  this.game.quickPlay )
        words = await this.gamePackService.getWords(this.game.quickPlay, 3);
      }  
    }
    let checkedInPlayers = FishbowlHelpers.getCheckedInPlayers(this.game);
    let playerCount = Object.keys(checkedInPlayers).length;
    words = words && Helpful.shuffle(words, playerCount * WORDS_PER_QUICK_PLAYER );
    let teams: TeamRosters;
    let rounds:GamePlayRound[];
    try {
      rounds = [RoundEnum.Taboo, RoundEnum.OneWord, RoundEnum.Charades]
      .filter( e=>existingRoundEnums.find( ex=>ex==e )==null )
      .map( (round)=>{
        let gameRound = FishbowlHelpers.buildGamePlayRound(this.gameId, this.game, round, teams, words);
        teams = Object.assign({}, gameRound.teams); // copy teams between rounds
        gameRound.uid = this.db.createPushId();
        return gameRound;
      });
    } catch(err) {
      if (err="Not Enough Players CheckedIn") {
        // present Toast
        return Promise.resolve(false);
      }
    }
        
    // update Game
    // insert rounds in gameplay order
    let byUids = rounds.reduce( (o,v)=>(o[v.uid]=v.round, o), {})
    byUids = Object.assign(this.game.rounds || {}, byUids)  // merge with existing rounds
    let teamNames = this.game.teamNames || Object.keys(rounds[0].teams);

    let waitFor:Promise<any>[] = [];

    waitFor.push (
      // Game
      this.gameRef.update({
        teamNames, // DEV, add edit page for game to set/edit teams
        rounds: byUids,
      })
    )


    // NOTE: gameWatch.gameDict$ emits on update
    let rounds_DbRef = this.db.database.ref().child('/rounds');
    let updateBatch = rounds.reduce( (o, v)=>{
      let path = `/${v.uid}`
      o[path] = v
      return o
    }, {});
    waitFor.push (
      // insert all GamePlayRounds
      rounds_DbRef.update(updateBatch)
    )

    // trigger on gamePlay.doPlayerUpdate==true, set in loadGameRounds() and loadNextRound()
    let update = {
      gameId: this.gameId,
      doPlayerUpdate: true,           // handle in doGamePlayExtras()
      doCheckIn: false,
      checkInComplete: true,
    } as Partial<GameAdminState>
    // GamePlayAdminState
    // do gamePlay update FIRST to avoid duplicate doCheckIn screen.
    let doFirst = await this.gameHelpers.pushGamePlayState( {uid: this.gameId} as GamePlayWatch, update)

    return Promise.all(waitFor).then( ()=>true);
  }


  async beginTeamAssignments(){
    if (!this.isModerator()) return;

    let gamePlay = await this.gamePlayWatch.gamePlay$.pipe(first()).toPromise();
    let doRepeat = gamePlay && !!gamePlay.doTeamRosters && !gamePlay.teamRostersComplete;
    if (doRepeat) {
      // repeat teamRosters
      await this.gameHelpers.pushGamePlayState(this.gamePlayWatch, { doTeamRosters: Date.now() as any });
      return 
    }
  
    let update = { 
      doTeamRosters: true,
      teamRostersComplete: false,
    }
    await this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update);
    this.stash.showCheckInDetails = false;
    this.stash.showTeamRosters = true;
  }

  beginNextGameRoundTimer(duration:number=null){
    const BEGIN_NEXT_GAME_ROUND_AFTER = 10*1000;
    let isModeratorMakingChanges = false;
    if (!isModeratorMakingChanges) {
      let gameDict$ =  this.gameWatch.gameDict$;
      interval(duration || BEGIN_NEXT_GAME_ROUND_AFTER).pipe(
        withLatestFrom(gameDict$),
        first(),
      ).subscribe( ([_,d])=>{
        let hasStarted = !!d.activeRound;
        if (!hasStarted) this.beginNextGameRound();
      });
    }
  };

  /**
   * begin gameRound, get game.activeRound and set startTime 
   * - moveSpotlight() to first player
   * NOTE: 
   *  - call GameHelpers.loadNextRound() called after loadRounds()
   *  - called by Moderator click action, or beginNextGameRoundTimer
   * @param round 
   */
  async beginNextGameRound():Promise<GamePlayRound>{
    if (!this.game) return
    if (!this.isModerator()) return;
    
    let roundIndex:{next:string, prev:string}; // closure
    let isFirstRound: boolean;
    return Promise.resolve()
    .then( ()=>{
      roundIndex = FishbowlHelpers.getRoundIndex(this.gameDict);
      if (!roundIndex) {
        if (this.isGameOver(this.game)) {
          return Promise.reject("gameComplete")
        }
        console.warn( "unknown state")
      }
    })
    .then( ()=>{
      isFirstRound = roundIndex.prev==null;
      // NOTE: gameDict.activeRound == null
      if (isFirstRound) {
        // before round 1
        let update = {
          doTeamRosters: false,
          teamRostersComplete: true,
        }
        return this.gameHelpers.pushGamePlayState( this.gamePlayWatch, update)
      }
    })
    .then( (res)=>{
      // find activeRound or initialize/begin next round
      return this.gameHelpers.loadNextRound(
        this.gameId, 
        this.gameDict
      );
    })
    .then( async (res)=>{
      let isGameComplete = !res;
      if (isGameComplete) {
        return Promise.reject("gameComplete"); // => completeGame()
      }
      return res;
    })
    .then( async (res)=>{
      await Helpful.waitFor(1000);  // wait for loadNextRound() cloud actions
      let update = {
        doBeginGameRound: this.gameDict.activeRound.round,
        doBeginPlayerRound: true,
      }
      // trigger showRoundInterstitial()
      await this.gameHelpers.pushGamePlayState( this.gamePlayWatch, update)
      return res
    })
    .then( async (res)=>{
      let {rid, activeRound} = res;
      // just updates state info for Round
      await this.gameHelpers.beginRound(rid);
      return res;
    })
    .then( ()=>{
      if (!isFirstRound) {
        // clean up: gamePlay for last round
        let dontWait = this.db.list<GamePlayState>('/gamePlay').remove(roundIndex.prev)
      }
      return this.nextPlayerRound( {timerDuration: this.initialTimerDuration}); // TEST
    })
    .catch( err=>{
      if (err=="gameComplete") {
        return this.completeGame().then( ()=>null);
      }
      return Promise.reject(err);
    })
  }
  
  

  

  /** ************************************************************************************************
   * player round methods
   * - wordAction & timer
   */

  private wordAction( gamePlay: GamePlayState, action:string ){
    if (this.throttleTimeAndWordEvents()) return;
    if (!gamePlay) return;

    // role guard
    if (!(this.onTheSpot || this.isModerator())) return;

    /**
     * NOTES: round begins with beginPlayerRoundClick() => startTimer() => nextWord()
     *  - player/moderator button click in template => wordAction() 
     *  - do NOT start timer from wordAction
     */

    if (!gamePlay.playerRoundBegin ) {
      // Buttons should be disabled
      return;
    };
    if (!gamePlay.word) {
      // seems to hit when word.remaining==0, gameRoundComplete
      return;
    }
    
    let isOvertime = gamePlay.isTicking==false;
    let {word} = gamePlay;
    let correct = action=="OK" ? true : false;
    let available = !correct;
    let round = this.gameDict.activeRound;
    let update = {} as GamePlayState;

    Promise.resolve()
    .then( ()=>{ 
      if (gamePlay.word) {
        // onWordActionClick(): serve the next word off gamePlay.remaining
        let next = FishbowlHelpers.nextWord( round, gamePlay, {[word]: available} );
        if (isOvertime){
          next.word = null;
          // next.remaining does NOT change
        }
        Object.assign( update, next);         // add next word to GamePlayState
  
        // apply score the word, based on action=[OK,PASS] then get next word
        let entries = round.entries;
        if (entries.hasOwnProperty(word)==false) {
          return console.warn("wordAction(): INVALID WORD, word=", word);
        }
  
        // get spotlight for WordResult to credit point for the proper team
        let spotlight = FishbowlHelpers.getSpotlightPlayer(gamePlay, round);
        let {playerName, teamName} = spotlight;
  
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
        // console.log( ">>> wordAction, gamePlay=", update )
        return this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update)
        .then( async ()=>{
          let isLastWord = next.remaining.length==0;
          let isDone = round && (isLastWord || isOvertime);
          if (isDone) {
            // state: player got last word BEFORE Timer expired
            if (!isOvertime) {
              console.log("0: ******* onTimerDone() <= completePlayerRound(), from wordAction(),  buzz=FALSE, next=", next)
              let waitFor = await this.onTimerDone( new Date(), false);
            }
            console.log("1: ******* completePlayerRound(), from wordAction(), next.remaining==0")
            let isPlayerRoundComplete = isLastWord
            this.completePlayerRound(isPlayerRoundComplete);
          }
        });
      }
    })
  } 

  /**
   * push gamePlay.timer to cloud, timer actually starts from cloud event loop
   * - called by onTimerClick()
   * - guard: the Spotlight player
   * - guard: stash.onTheSpot = this.hasSpotlight(), set in this.loadGame$() event loop
   * - UX response in doGamePlayUx()
   * @param gamePlay 
   * @param duration 
   */
  private startTimer(gamePlay: GamePlayState, duration=null){
    if (this.throttleTimeAndWordEvents()) return;
    if (!gamePlay) {
      return console.warn("error: round is not loaded");
    }

    // role guard
    let canModeratorStart = this.isModerator() && this.spotlight && this.spotlight.uid
    if (!(this.onTheSpot || canModeratorStart)) return;

    // load round
    let rid = this.game.activeRound;
    let round = this.gameDict.activeRound;
    if (!rid) return // between rounds
      
    
    if (gamePlay.playerRoundComplete) {
      // BUG: this is not getting reset properly
      let msg = "startTimer called with playerRoundComplete"
      throw new Error(msg);
    }

    
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
        // startTimer(): serve FIRST word of round, from gamePlay.remaining 
        let next = FishbowlHelpers.nextWord(round, gamePlay);
        Object.assign( update, next);   // add next word to GamePlayState
        if (next.remaining.length==0){
          console.warn("INVALID STATE: playerRound should not begin with next.remaining.length=0")
          return this._completeGameRound(round)
        }

        let {playerName, teamName} = this.spotlight;
        let wordResult:WordResult = {
          // moveSpotlight(): push beginRound entry to gameLog
          playerName, teamName, 
          result: false, 
          word: FishbowlHelpers.BEGIN_ROUND_MARKER,
        }
        update.log = {
          [-1*Date.now()]: wordResult
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
    update.doPlayerUpdate = false;  // reset
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

  private pauseTimer(gamePlay):boolean{
    if (this.throttleTimeAndWordEvents(gamePlay)) return;
    if (!gamePlay.isTicking) return;

    // role guard
    if (!(this.onTheSpot || this.isModerator())) return;


    let update = {} as GamePlayState;
    let timeRemaining = this.countdownTimer.stop();
    if (!timeRemaining) {
      return;
    }

    update.timerPausedAt = timeRemaining;
    update.isTicking = false;
    update.timer = {pause: true};

    // if (!isOnTheSpot) return;
    this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update).then( ()=>{
      this.gamePlayWatch.gamePlay$.pipe( 
        take(1),
        tap(v=>{
          console.log("1> PAUSE Timer, update=", JSON.stringify(Helpful.cleanProperties(v, Object.keys(update))))
        })
      ).subscribe()
    });

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
  onTimerDone(t:Date|{seconds:number}=null, buzz=true):Promise<void> {
    /**
     * throttle duplicate click from moderator control panel
     */
    if (this.onTimerDone.hasOwnProperty('_done')==false){
      this.onTimerDone["_done"] = {};
    }

    let done = this.onTimerDone["_done"];
    let id = t instanceof Date ? t.getTime() : t.seconds;
    if (done[id]) {
      console.warn( "12: 2> THROTTLE: timer id=", id);
      return;
    }
    done[id]=true;
    this.doTimerDone(buzz);
  };
    


  /** ************************************************************************************************
   * game state methods
   */

  isActive(g:Game=null) {
    return FishbowlHelpers.isActive(g||this.game);
  }
  isGameOpen(g:Game=null){
    g = g || this.game;
    return !!g.isGameOpen;
  }
  isGameTime(g:Game=null) {
    return FishbowlHelpers.isGametime(g||this.game);
  }
  isGameOver(g:Game=null) {
    return FishbowlHelpers.isGameOver(g||this.game);
  }
  hasSpotlight(v:Player|string) {
    try {
      let player = (typeof v != "string") ? v : this.player$.value;
      if (!player) {
        return false
      }
      if (player && !!player.playingAsUid) {
        v=player;   // override with playAs player
      }
      switch (v) {
        case 'team':
          return !!this.game.activeRound && this.player$.value.teamName==this.spotlight.teamName;
        case 'player':
        default:          
          return !!this.game.activeRound && this.spotlight.uid==this.getActingPlayerId(player);
      }
    } catch(err) {
      return false;
    }
  }
  isModerator(pid=null) {
    pid = pid || this.playerId;
    return this.game && this.game.moderators && this.game.moderators[pid] == true
  }
  
  /** ************************************************************************************************
   * game state change methods
   */

  // called from game-controls
  nextPlayer(nextTeam=true):Promise<void>{
    let game = this.gameDict[this.gameId] as Game;
    if (!this.isActive(game)) return;

    let round = this.gameDict.activeRound;
    let defaultDuration = this.initialTimerDuration
    return this.gameHelpers.moveSpotlight(this.gamePlayWatch, round, {nextTeam, defaultDuration, useGamePlaySpotlight:true});
  }
  
  /**
   * orchestrate the timed sequence to complete the playerRound
   * [before]
   *    onTimerDone()
   * onTimerDone() or FishbowlHelpers.nextWord() is empty 
   */
  async completePlayerRound(gameRoundComplete=false):Promise<void>{
    if (!(this.onTheSpot || this.isModerator())) return;

    // only active player pushes updates to the cloud
    let activeRound = this.gameDict.activeRound;
    let rid = this.game.activeRound;

    let playerRoundComplete = true;
    let gameComplete = gameRoundComplete && activeRound.round==3;

    return Promise.resolve()
    .then( ()=>{
      // event: playerRoundWillComplete
      console.info("\t>>>> playerRoundWillComplete()")
    })
    .then( ()=>{
      // merge gamePlay.log => gameLog BEFORE playerRoundComplete=true
      console.log("4: >>>> gamePlay.log copied to gameLog and changes applied to round.entries");
      return this.gameHelpers.pushGameLog(this.gamePlayWatch, activeRound)
    })
    .then( ()=>{
      // reset player.playingAsUid 
      if (!!this.player.playingAsUid) {
        let p = Object.assign({}, this.player$.value);
        delete p.playingAsUid;
        this.player$.next(p);
      }
      // push complete game status to doInterstitials()
      let update = {
        playerRoundBegin: false,
        doBeginPlayerRound: false,
        playerRoundComplete, gameRoundComplete, gameComplete,
        timer: null,
      }
      return this.db.list<GamePlayState>('/gamePlay').update(rid, update)
      // NOTE: Handle UX response in doShowInterstitials()
    })
    .then( async ()=>{
      // allow PlayerRoundComplete interstitial to appear
      await Helpful.waitFor(1000)    
      // wait for PlayerRoundComplete interstitial to dismiss
      let done = await HelpComponent.last && HelpComponent.last.componentProps.waitForDismissal()
      console.info("\t>>>> playerRoundDidComplete()");

      if (!gameRoundComplete) {
        console.log("12: nextPlayerRound")
        return this.nextPlayerRound(); // calls moveSpotlight()
      }
      else {
        console.info("\t>>>> game Round WILL Complete()");
        return this._completeGameRound(this.gameDict.activeRound)
        // completePlayerRound()
        // => _completeGameRound()
        //  => pipeCloudEventLoop_Foreground() => doInterstitialsWithScoreboard()
        //    => beginNextGameRoundTimer()
        // => beginNextGameRound() 
            // guard [role=moderator]
            //  init gamePlay state; 
            // loadNextRound()
            // doBeginGameRound
            // doBeginPlayerRound
            // GameHelpers.beginRound()
            // => !isFirstRound
            //   => remove /gamePlay for previous round
            // nextPlayerRound()

      }
    })
  }


  /**
   * queue next PlayerRound AFTER completePlayerRound() or 
   */
  private nextPlayerRound( options:any={} ):Promise<void>{
    if (!(this.onTheSpot || this.isModerator())) {
      throw new Error( " spotlight changed before ready")
    }


    // reset gamePlay for next playerRound
    let activeRound = this.gameDict.activeRound;
    if (!activeRound) {
      console.warn("TODO: nextPlayerRound ECHO: activeRound is already null", this.gameDict)
    }
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
        // doBeginPlayerRound: true, set in moveSpotlight()
        playerRoundBegin: false,
        playerRoundComplete: false, 
        roundComplete: false,
      }
      return this.db.list<GamePlayState>('/gamePlay').update(rid, updateGamePlay)
    })
    .then( ()=>{
      console.info("12:\t>>>> spotlightWillChange()");
    })
    .then(()=>{
      let defaultDuration = options.timerDuration || this.initialTimerDuration;
      return this.gameHelpers.moveSpotlight(this.gamePlayWatch, activeRound, {defaultDuration}).then( ()=>{
        console.info("12: \t>>>> spotlightDidChange()");
      })
    })
  }

  private async _completeGameRound(round:GamePlayRound){
    if (!round || !this.game.activeRound) return; // echo?

    console.info("12:\t>>>> gameRoundWillComplete()");
    let rid = this.game.activeRound;
    let isGameComplete = round.round == 3
    let waitFor:Promise<void>[] = [];

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
      updateGame.teams = round.teams;
      updateGame.complete = true;
      updateGame.isGameOpen = null;
    }    
    waitFor.push(
      this.gameRef.update( updateGame )
    )

    
    Promise.all(waitFor)
    .then( ()=>{
      console.info("12:\t>>>> gameRoundDidComplete()");
    })
    .then( ()=>{
      if (isGameComplete) return this.completeGame();
    });
  }

  // this is incomplete, should do more than just update gamePlay.spotlight
  async completeGame(){
    this.db.list<GamePlayState>('/gamePlay').update(this.gameId, {spotlight:null})
    .then( ()=>{
      console.log("GAME COMPLETE");
    })
  }

  /**
   * render gameOver page
   * @param d 
   */
  doGameOver( d:GameDict ): boolean {
    if (!this.isGameOver(d.game)) return false

    this.isPlayerRegistered = this.setGamePlayer(d) || this.isModerator();
    let teamNames = d.game.teamNames.slice();
    let dontWait = this.gameHelpers.scoreRound$(
      d.gamePlayWatch, 
      teamNames,
    ).toPromise().then( (scoreboard)=>{            
      this.gameSummary = {
        teamNames,
        scoreboard,
      }
      console.warn("game over", this.gameSummary)
    });
    return true;
  }

  /**
   * trigger GameOver on reload + delay, if moderator missed the original event
   * @param d
   */
  patchGameOver(res:[GamePlayState, GameDict]){
    try {
      let gamePlay = res[0];
      if (gamePlay.gameComplete==true && this.isModerator()) {
        // if we somehow missed gameComplete event, moderator triggers on page reload()
        let dontWait = Helpful.waitFor(3000).then( ()=>{
          // how do we detect a reload? wait a moment
          this.gameWatch.game$.pipe( first() )
          .subscribe( game=>{
            if (!!game.complete) return;
            let round3 = res[1].activeRound;
            if (round3 && round3.round==3) {
              return this._completeGameRound(round3);
            }
          })
        });
      }
    } catch (err){}
  }


  /** ************************************************************************************************
   * UX methods
   */

  preloadAudio(){
    ["click","buzz","ok","pass","dq", "pause"].forEach( k=>this.audio.preload(k));
  }

  /**
   * apply CSS animation to HTMLElement
   *  - see animate.css, https://daneden.github.io/animate.css/
   * @param el HTMLElement to animate
   * @param animation 
   */
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

  /**
   * throttle LOCAL events, triggered on cloud state, 
   *  - sets 
   *  - prevent duplicate actions from moderator/spotlight
   * 
   * 
   * @param changed 
   */
  throttleTimeAndWordEvents(changed:Partial<GamePlayState>=null, duration:number=null):boolean {
    const THROTTLE_TIMER_AND_WORD_ACTIONS = 700;
    let isThrottling = !!this.stash.throttleTimeAndWordEvents;
    if (changed) {
      let doThrottle = changed.isTicking || !!changed.word;
      if (!isThrottling && doThrottle) {
        // throttle LOCAL actions after cloud emits
        this.stash.throttleTimeAndWordEvents = true;
        setTimeout( ()=>this.stash.throttleTimeAndWordEvents=false
          , duration || THROTTLE_TIMER_AND_WORD_ACTIONS
        )
      }
    }
    return isThrottling;
    return this.stash.throttleTimeAndWordEvents;
  }

  /**
   * play audio sounds based on changes in game state
   * 
   * TODO: exclude originator of state change
   * 
   * @param gamePlay 
   */
  private doGamePlayUx( 
    gamePlay: GamePlayState,
  ){
    const _alreadyDone = (gamePlay:GamePlayState):boolean => {
      // ignore Ux state changes if player was the source of the state change
      return false;
    }

    if (_alreadyDone(gamePlay)) return;


    let changed = gamePlay.changedKeys || [];

    // in order of priority
    if (changed.includes('isTicking')) {
      this.audio.play("click");
      console.info( "*** detect timer Start, sound=click");
      return;
    }
    else if (changed.includes('timerPausedAt')) {
      let sound = gamePlay.timerPausedAt ? "pause" : "click";
      this.audio.play(sound);
      console.info( "*** detect timer PAUSE, sound=", sound);
      return;
    }

    if (changed.includes('log')) {
      try {
        let lastKey = Object.keys(gamePlay.log).map( v=>-1*parseInt(v) ).reduce((max, n) => n > max ? n : max, 0 );
        let sound = gamePlay.log[-lastKey].result ? 'ok' : 'pass';
        this.audio.play(sound);
        // console.info( "*** doGamePlayUx(): detect timer WORD action by change in gamePlay.log", sound);
        return;
      } catch (err) {}
    }
  }

  async doTimerDone(buzz=true) {  
    const ADDED_DELAY_BEFORE_DISABLE_WORD_ACTIONS = 3000;
    if (!this.gameDict.activeRound) 
      return;

    let isAuthorized = this.onTheSpot || this.isModerator();
    let gamePlay:GamePlayState;

    return Promise.resolve()
    .then( ()=>{
      if (buzz) {
        // all players buzz Timer locally when timer expires, no cloud action required
        return this.animate(this.animateTarget)
      }
    })
    .then( ()=>{
      let silent = !buzz
      if (!isAuthorized || silent) {
        return Promise.reject("skip")

        // !isAuthorized: cloud response, no access to gamePlay
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
          let doPlayerRoundComplete = isAuthorized && gamePlay.playerRoundBegin==true;
          return {doPlayerRoundComplete, gamePlay};
        })
      ).toPromise()
      .then( (res)=>{
        let {doPlayerRoundComplete, gamePlay} = res;
        if (doPlayerRoundComplete) {
          // console.log("1:  ******* completePlayerRound, from onTimerDone() OVERTIME, clearTimer=false")
          return this.completePlayerRound(false);
        }
        else {
          // buzz=false/overtime=false silent OR playerRoundDidComplete()
          /**
           * NOTE: wordAction[remaining.length==0 && isTicking==true]
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









  

  /** ************************************************************************************************
   * player UX event handlers
   */

  goPlayerSettingsClick() {
    let gameId = this.game.uid || this.activatedRoute.snapshot.paramMap.get('uid');
    this.router.navigate( ['/app/game', gameId, "player"] );
  }

  beginChangePlayerClick(gamePlay, game) {
    return this.showChangePlayerInterstitial(gamePlay, game);
  }

  handleStageNameSearchbarChanged(o:IonSearchbar, reset:boolean=false) {
    this.doFindStageName(o, reset);
  }

  toggleStashClick(key, ev){
    let reqModerator = ['showCheckInDetails', 'showTeamRosters', 'showModeratorGameControls'];
    if (reqModerator.includes(key) && !this.isModerator()) return
    
    this.stash[key] = !this.stash[key]
    // not sure why this is necessary, but it is
    setTimeout( ()=>ev.target.checked = this.stash[key], 100)
  }

  volumeClick(volume:number = null, playSound=true){
    if (!volume) {
      volume = this.audioVolumeIcons.findIndex(v=>v==this.stash.audioVolumeIcon);
      volume += 1;
    }
    if (volume<0 || volume > 3) volume = 0;
    Storage.set({key:'volume', value: volume.toString() })
    .then( ()=>{
      this.stash.audioVolumeIcon = this.audioVolumeIcons[volume];
      this.audio.setVolume(volume, playSound);
    })
  }

  /** ************************************************************************************************
   * spotlight player UX event handlers
   */
  spotlightPlayerReadyClick() {
    let target = document.querySelector('#spotlight-button')
    let ev = {target}
    this.onTheSpotClick(ev);
    setTimeout( ()=>this.onTheSpotClick(ev), 100);
    setTimeout( ()=>this.beginPlayerRoundClick(), 1500);
  }

  /** ************************************************************************************************
   * spotlight player + moderator UX event handlers
   */

  beginPlayerRoundClick(){
    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        // onTimerClick() while timer isTicking => pause
        if (!gamePlay.isTicking) this.startTimer(gamePlay);
      })
    ).subscribe();
  }

  onTheSpotClick(ev) {
    let target = ev.target;
    let onTheSpot = this.hasSpotlight('player')
    if (onTheSpot) {
      target.scrollIntoView();
    }
  }

  onTimerClick(duration=null){
    if (!this.gameDict.activeRound) return

    // role guard
    if (!(this.onTheSpot || this.isModerator())) return;

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

  onWordActionClick(action:string) {
    if (!this.gameDict.activeRound) return

    // role guard
    if (!(this.onTheSpot || this.isModerator())) return;

    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        if (gamePlay.playerRoundBegin==true) {
          if (gamePlay.isTicking==false){
            // OK. use button[disabled=true] to add overtime
          }
          this.wordAction(gamePlay, action);
        }
      })
    ).subscribe();
  }

  /**
   * TODO: 
   *  - allow spotlight/designated player to make corrections(?), this would allow moderator to join gameplay
   * @param correction 
   */
  gameLogChangedByAuditorClick(correction: GamePlayLogEntries) {
    if (!this.isModerator()) return;

    let entries = this.gameDict.activeRound && this.gameDict.activeRound.entries;
    this.gameHelpers.pushGamePlayLogUpdate(this.gamePlayWatch, correction, this.playerId, entries)
    .then( (res)=>{
      console.log( "126: gameLogChangedByAuditorClick, changed=", res)
    })
  }

  /** ************************************************************************************************
   * moderator UX event handlers
   */

  goGameSettingsClick() {
    if (!this.isModerator()) return;
    
    let gameId = this.game.uid || this.activatedRoute.snapshot.paramMap.get('uid');
    this.router.navigate( ['/app/game', gameId, "settings"] );
  }

  gameStateToggle(g:Game, field:string) {
    if (!this.isModerator()) return
    let whitelist = ['activeGame', 'isGameOpen', 'complete', 'public', 'doPassThePhone'];
    if (!whitelist.includes(field)) return;
    let v = g[field];
    this.gameHelpers.pushGameState( this.gameId, {[field]:!v} );
  }

  resetGameClick(ev){
    let hard = ev.ctrlKey || ev.shiftKey;
    if (AppConfig.platform.is('mobile')) {
      hard=true;
    }
    this.doGameReset(hard)
  }

  doCheckInClick() {
    this.beginCheckIn(this.gameId);
    this.stash.showCheckInDetails = true;
  }

  /**
   * render template UX based on player CheckIn value, ["~show"|"~hide"|"~done"]
   */
  getPlayerCheckInValue(pid:string, game:Game):string{
    if (!this.isModerator()) return;

    if (!game.checkIn) return '~show';
    let resp = game.checkIn[pid];
    if (typeof resp=="undefined") return '~show';
    if (typeof resp=="string") {
      if (!this.isModerator(pid))
        return '~done';
      else return '~hide';  // moderators can still toggle after checkin
    }
    return (resp===false) ? '~show' : '~hide';  // toggle logic, set game.checkIn[pid]=undefined
  }

  /**
   * moderator hides a player from team assignment, spotlight. 
   * AFTER responses from doCheckIn => showCheckInInterstitial()
   * @param pid 
   * @param keep 
   */
  checkInPlayerToggle(pid:string, action: string){
    Promise.resolve()
    .then( async ()=>{
      switch (action){
        case '~hide': 
          await this.gameHelpers.pushCheckIn(this.gameId, {   [pid]: false });
          return false
        case '~show': 
          await this.gameHelpers.pushCheckIn(this.gameId, {   [pid]: true });
          return true
      }
    })
    .then( async (added:boolean)=>{
      // assign new CheckIns to a team ONCE, 
      if (!added) return;
      if (!this.game.activeRound) return;
      
      // add player team assignment
      let {teams} = this.gameDict.activeRound;
      let newTeams = FishbowlHelpers.assignPlayerToTeam(pid, teams);
      if (newTeams) {
        console.warn("15: checkInPlayer AFTER game begins", pid, newTeams)
        let patchRoundIds = Object.entries(this.gameDict).filter( ([k,round])=>{
          let isRound = this.game.rounds[k];
          return (isRound && !round['complete']);
        }).map( ([k,round])=>k );
        let waitFor = patchRoundIds.map( rid=>{
          let round = this.gameDict[rid] as GamePlayRound;
          let players = Object.assign( {}, round.players, {[pid]: this.game.players[pid] });
          return this.db.object<GamePlayRound>(`/rounds/${rid}`).update( {players, teams:newTeams} )
        });
        await Promise.all(waitFor)
        // update spotlight.playerIndex limits
      }
    })
  }

  async loadRoundClick(){
    let ok = await this.loadGameRounds();
    if (!ok) return;
    this.stash.showCheckInDetails = false;
    this.beginTeamAssignments()
  }

  teamRosterChangeClick(teams:TeamRosters) {
    if (!this.isModerator()) return;

    this.gameHelpers.pushTeamRosters(this.gameDict, teams);
  }

  showTeamRosterClick() {
    this.beginTeamAssignments();
  }

  beginGameRoundClick(){
    this.beginNextGameRound();
  }

  timerRangeChangeClick(range: CustomEvent) {
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

  
  
  
}
