import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { Observable, Subject, of, from,  combineLatest, timer } from 'rxjs';
import { map, tap, switchMap, take, takeWhile,  pairwise } from 'rxjs/operators';

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
  PlayerByUids, TeamRosters, WordResult, Scoreboard, 
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
        this.gamePlayWatch = this.gameHelpers.getGamePlay$(this.game, this.gameDict); 
      }),
    );
  }

  private doGamePlayUx( res:[GamePlayState, GamePlayState] ){
    let [prev, cur] = res;
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
  }
  /**
   * end GameWatch
   */

  public audioVolumeIcons = ["volume-mute","volume-low","volume-medium","volume-high"];
  
  public stash:any = {
    // GameWatch changes
    timerDuration: 10,
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
    private  activatedRoute: ActivatedRoute,
    private  router: Router,
    private loadingController: LoadingController,
    private audio: AudioService,
    private db: AngularFireDatabase,
    private authService: AuthService,
    private gameHelpers: GameHelpers,
  ) {

    if (environment.production==false){
      window['_dbg'] = window['_dbg'] || {};
      window._dbg.stash = this.stash
      window._dbg.dayjs = dayjs
    }

  }

  async ngOnInit() {
    console.info("0>>> ***** ngOnInit(): load ******")
    this.toggleVolumeIcon(1, false);
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
        }
        return p;
      }),
      tap( p=>{
        this.player = p;
      })
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
    if (existingRoundEnums.find( v=>v>1000) && !force) {
      return false; // game has already begun, round value is unixtime/timestamp
    }

    let rounds = [RoundEnum.Taboo, RoundEnum.OneWord, RoundEnum.Charades]
      .filter( e=>existingRoundEnums.find( ex=>ex==e )==null )
      .map( (round)=>{
      let gameRound = FishbowlHelpers.buildGamePlayRound(this.game, round);
      gameRound.uid = this.db.createPushId();
      return gameRound;
    });
    // DEV: init if missing
    let teamNames = this.game.teamNames || Object.keys(rounds[0].teams);
    let rounds_DbRef = this.db.database.ref().child('/rounds');

    // insert Rounds
    let updateBatch = rounds.reduce( (o, v)=>{
      let path = `/${v.uid}`
      o[path] = v
      return o
    }, {});
    await rounds_DbRef.update(updateBatch);  // firebase directly

    // update Game, use AngularFire ref
    // insert rounds in gameplay order
    let result = this.gameRef.update({
      teamNames, // DEV
      rounds: rounds.reduce( (o,v)=>(o[v.uid]=v.round, o), {})
    });
    // console.log("FFF> update Game, result=", result);
    return true;
  }

  // retest
  async beginRound(round:RoundEnum=RoundEnum.Taboo):Promise<GamePlayRound>{
    if (!this.game) return

    // find activeRound or initialize/begin next round
    let activeRound = await this.gameHelpers.loadNextRound(this.gameDict, this.gameId)
    if (activeRound) {
      this.gameHelpers.moveSpotlight(this.gamePlayWatch, activeRound);
      let entries = Object.entries(activeRound.entries).filter( ([word,avail])=>avail===true );
      this.stash.wordsRemaining = entries && entries.length;
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
          let name = game.players && game.players[this.player.uid];
          this.player.displayName = name;

          this.stash.active = game.gameTime < Date.now();
          // DEV
          this.stash.activeGame = true;          
        }),
        switchMap( (d)=>{
          return this.gamePlayWatch.gamePlay$;
          /**
           * every NEW gamePlayState, caused by wordAction()
           */
        }),
        tap( gamePlay=>{
          if (!this.activeRound) return
          round = this.activeRound;
          if (!this.stash.wordsRemaining) {
            let entries = Object.entries(round.entries).filter( ([word,avail])=>avail===true );
            this.stash.wordsRemaining = entries && entries.length;          
          }
          this.spotlight = FishbowlHelpers.getSpotlightPlayer(gamePlay, round);
          // true if this player is under the spotlight
          this.stash.onTheSpot = (this.spotlight.uid === this.player.uid);
        }),
        tap( (gamePlay)=>{
          this.gameHelpers.scoreRound$(this.gamePlayWatch, this.activeRound, gamePlay ).pipe(
            take(1),
            tap( score=>{
              console.info( "score", score)
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

    this.stash.audioVolumeIcon = this.audioVolumeIcons[volume];
    this.audio.setVolume(volume, playSound);
  }

  preloadAudio(){
    ["click","buzz","ok","pass","dq", "pause"].forEach( k=>this.audio.preload(k));
  }

  onTimerClick(duration=null){
    if (!this.gameDict.activeRound) return

    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        // onTimerClick() while timer isTicking => pause
        if (gamePlay.isTicking && !gamePlay.timerPausedAt) this.pauseTimer(gamePlay)
        else this.startTimer(gamePlay, duration);
      })
    ).subscribe();
  }

  private startTimer(gamePlay: GamePlayState, duration=null){
    if (!gamePlay) {
      return console.warn("error: round is not loaded");
    }
    
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
      if ("reset round"){
        // DEV: manual reset of words in round
        let round = this.activeRound;
        let entries = round.entries;
        Object.keys(entries).forEach( k=>entries[k]=true )
      }
      
      // load word for gamePlay
      // TODO: LET this.wordAction start timer, not the other way around
      if (!gamePlay.word) {
        let round = this.activeRound;
        let {word, remaining} = FishbowlHelpers.nextWord(round, gamePlay);
        update.word = word;
        this.stash.wordsRemaining = remaining;
      }
    }

    update.timer = {
      seconds: Math.max(timeOnClock,0),
      key: Date.now(),
    };
    update.isTicking = true;
    update.timerPausedAt = null;
    
    // console.log("0> startTimer, update=", JSON.stringify(update))
    if (this.stash.onTheSpot) {
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
    console.log( "TTT  0 > timer done")
    return Promise.resolve()
    .then( ()=>{
      if (buzz) {
        // event fired locally when timer expires, no cloud action required
        return this.animate(this.animateTarget)
      }
    })
    .then( ()=>{
      if (wasOnTheSpot) {
        // TODO: do I need an extra delay here?
        return this.completePlayerRound();
      }
    });
  }

  onWordActionClick(action:string) {
    if (!this.gameDict.activeRound) return

    this.gamePlayWatch.gamePlay$.pipe(
      take(1),
      tap( gamePlay=>{
        this.wordAction(gamePlay, action);
      })
    ).subscribe();
  }

  // TODO: let the game master can also trigger a wordAction
  private wordAction( gamePlay: GamePlayState, action:string=null ){

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
    this.stash.wordsRemaining = next.remaining;
    update.word = next.word;
    
    if (!word) {
      // load initial word, ignore action
      this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update).then( ()=>{
        console.log("1> queue FIRST word, update=", update);
      });
      return



    }
    else {
      // apply action to word, then get next word
      let entries = round.entries;
      if (entries.hasOwnProperty(word)==false) {
        return console.warn("wordAction(): INVALID WORD, word=", word);
      }

      let spotlight = FishbowlHelpers.getSpotlightPlayer(gamePlay, round);
      let teamName = spotlight.teamName;
      let playerName = spotlight.label;
      let now = Date.now();
      let log = gamePlay.log || {};
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
      })
      console.log( update )
      this.gameHelpers.pushGamePlayState(this.gamePlayWatch, update)
      .then( ()=>{
        if (!next.word) this.completePlayerRound(true);
      });

    }

  }

  /**
   * onTimerDone() or FishbowlHelpers.nextWord() is empty 
   */
  async completePlayerRound(clearTimer=false):Promise<void>{
    let wasOnTheSpot = this.stash.onTheSpot;
    if (clearTimer) {
      return this.onTimerDone( null, false);
      // stop timer gracefully, (cloud sound), 
      // wait for animation to complete
      // then try again recursively
    }

    if (!wasOnTheSpot) 
      return;

    let activeRound = this.activeRound;
    let rid = this.game.activeRound;
    let updateGamePlay = {
      timer: null,
      log: {},
      isTicking: false,
      timerPausedAt: null,
      word: null,
    }

    // only active player pushes updates to the cloud
    return Promise.resolve()
    .then( ()=>{
      return this.gameHelpers.pushGameLog(this.gamePlayWatch, activeRound)
    })
    .then( ()=>{
      return this.db.list<GamePlayState>('/gamePlay').update(rid, updateGamePlay)
    })
    .then( ()=>{
      console.log(" >>>> completePlayerRound() DONE")
      let entries = Object.entries(activeRound.entries).filter( ([word,avail])=>avail===true );
      if (entries.length==0){
        return this.completeGameRound(activeRound);
      }
      // TODO: disable timer until moveSpotlight() complete
      console.warn("DISABLE timer on playerRoundComplete()")
      return new Promise( resolve=>{
        const PLAYER_ROUND_DELAY = 2000;
        setTimeout( ()=>{
          this.gameHelpers.moveSpotlight(this.gamePlayWatch, activeRound).then( ()=>{
            // TODO: enable timer
            console.warn("ENABLE timer after moveSpotlight");
            resolve()
          });
        }, PLAYER_ROUND_DELAY);
      })
    });
  }

  async completeGameRound(round:GamePlayRound){

    // wrap this with a setTimeout()

    let isGameComplete = round.round == 3
    let rid = this.game.activeRound;
    let updateRound = {
      complete: true,
    } as GamePlayRound;

    let updateGame = {
      activeRound: null,
    } as Game;
    if (isGameComplete) {
      updateGame.complete = true;
    }

    let waitFor:Promise<void>[] = [];
    // only active player pushes updates to the cloud
    waitFor.push(
      this.db.list<GamePlayState>('/gamePlay').remove(rid)
    );
    waitFor.push(
      this.db.object<GamePlayRound>(`/rounds/${rid}`).update( updateRound )
    );
    waitFor.push(
      this.db.object<Game>(`/games/${this.gameId}`).update( updateGame )
    )
    Promise.all(waitFor).then( ()=>{
      if (isGameComplete) return this.completeGame();
    });
  }

  async completeGame(){
    console.log("GAME COMPLETE")
  }

  async animate( el:any, animation="long-wobble" ){
    el = Helpful.findHtmlElement(el);
    console.log( "TTT  1 > animate, el=", el)
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
    let start = Date.now()
    let gameWatch = this.gameHelpers.getGameWatch( this.game.uid );
    gameWatch.gameDict$.pipe(
      tap( o=>{
        let et = Date.now()-start
        console.log("emit gameDict$ ms, o=", et, o)
      })
    ).subscribe()
  }

}
