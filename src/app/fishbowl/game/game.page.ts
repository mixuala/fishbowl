import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { Player, } from '../../user/role';
import { AudioService } from '../../services/audio.service';
import { AppConfig, Helpful} from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers';
import { 
  Game, GamePlayRound, RoundEnum,
  PlayerByUids, TeamRosters,
  SpotlightPlayer 
} from '../types';

import { Observable, Subject, of, from, throwError, pipe, combineLatest } from 'rxjs';
import { map, tap, switchMap, take, takeWhile, filter, concatMap, withLatestFrom } from 'rxjs/operators';
import { ThrowStmt } from '@angular/compiler';

declare let window;




@Component({
  selector: 'app-game',
  templateUrl: './game.page.html',
  styleUrls: ['./game.page.scss'],
})
export class GamePage implements OnInit {

  public audioVolumeIcons = ["volume-mute","volume-low","volume-medium","volume-high"];
  
  public stash:any = {
    listen: true,
    audioVolumeIcon: null,
    activeGame: false,
  };
  public displayName:string;

  public listen$ : Subject<boolean> = new Subject<boolean>();
  public upcomingGames$: Observable<Game[]>;
  public game$:Observable<Game>;
  public gameRef:AngularFireObject<Game>;
  private game:Game;
  private gameId:string;
  private player: Player;
  public spotlight:SpotlightPlayer;


  @ViewChild( 'playTimer', {static:false} ) playTimer:IonButton; 

  constructor(
    private  activatedRoute: ActivatedRoute,
    private  router: Router,
    private loadingController: LoadingController,
    private audio: AudioService,
    private db: AngularFireDatabase,
    private authService: AuthService,
  ) {

    if (environment.production==false){
      window['_dbg'] = window['_dbg'] || {};
      window._dbg.stash = this.stash
      window._dbg.dayjs = dayjs
    }

  }

  async ngOnInit() {

    this.loadPlayer$().pipe(
      take(1),
      tap( (p)=>{ this.player = p })
    ).subscribe();
    
    let loading = await this.presentLoading();
    
    of([]).pipe(
      switchMap( (game)=>{
        let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
        let now = new Date();
        this.gameRef = this.db.object(`/games/${gameId}`);  
        return this.game$ = this.gameRef.valueChanges().pipe( 
          tap( o=>{
            this.game = o;
            this.game['uid'] = gameId;  // stash here
            this.stash.activeGame = new Date(o.gameDateTime) < now;
            // DEV
            this.stash.activeGame = true;
          })
        );
      }),
      tap( (game)=>{
        this.listenToGame(game);
      }),
      tap( ()=>{
        loading && loading.dismiss();
      }),
    ).subscribe();

    // # set initial volume
    this.toggleVolumeIcon(1, false);

    combineLatest([this.loadPlayer$(), this.game$]).pipe(
      take(1),
      tap( (res)=>{
        let name = this.game.players && this.game.players[this.player.uid]
        if (typeof name == "number") name = this.player.displayName || "";
        this.displayName = name;
      })
    ).subscribe()
  }


  loadPlayer$():Observable<Player> {
    return this.authService.getCurrentUser$().pipe(
      switchMap( u=>{
        if (!!u) return of(u);

        return from(this.authService.doAnonymousSignIn());

        // email/passwd signIn with DEV user
        console.log( `DEV: auto-login to default app user.`);
        return this.authService.doLogin({email:'test@test.com', password:'hellow'})

      }),
      map( u=>{
        let p:Player = {
          uid: u.uid,
          name: u.displayName,
          gamesPlayed: 0,
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

  // tested OK
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
    console.log("FFF> update Game, result=", result);
    return true;
  }


  beginRound(round:RoundEnum=RoundEnum.Taboo):boolean{
    if (!this.stash.activeGame) return;
    if (!this.game) return;

    // get round, NOTE: rounds are created in gameplay order
    let {rounds} = this.game;
    let [roundId, timestamp] = Object.entries(rounds)[round-1];
    let gameData = {
      activeRound: roundId
    }
    if (timestamp < 1000) {
      // upgrade Game.rounds{ [uid]: RoundEnum => Date.now() }
      rounds = Object.assign({}, rounds, {[roundId]: Date.now()});
      gameData['rounds'] = rounds;
    }
    this.gameRef.update(gameData);


    let roundRef = this.db.object<GamePlayRound>(`/rounds/${roundId}`);
    let round$ = roundRef.valueChanges();
    round$.pipe(
      take(1),
      tap( round=>{
        this.stash.gamePlay = { round, round$, roundRef };
        FishbowlHelpers.moveSpotlight(round, roundRef);
      })
    ).subscribe();
    return true;
  }

  nextPlayer(){
    if (!this.stash.activeGame) return;
    if (!this.game) return;
    if (!this.stash.gamePlay) return;

    let { roundRef } = this.stash.gamePlay;
    roundRef.valueChanges().pipe( 
      take(1),
      tap( (round:GamePlayRound)=>{
        FishbowlHelpers.moveSpotlight(round, roundRef);
      })
    ).subscribe();
    return true;

  }

  listenToGame(game:Game){
    if (!this.stash.activeGame) return;
    if (!game.activeRound) return;
    
    let { done, round, roundRef } = this.stash.gamePlay || {done:null, round:null, roundRef:null};
    if (done && round && round.uid !== game.activeRound) {
      done.unsubscribe();
      this.spotlight = null;
      roundRef = null;
      round = null;
    }

    // TODO: handle case when activeRound changes
    roundRef = this.db.object<GamePlayRound>(`/rounds/${game.activeRound}`);
    let round$ = roundRef.valueChanges();
    done = round$.pipe(
      tap( (round:GamePlayRound)=>{
        this.spotlight = FishbowlHelpers.getSpotlightPlayer(round);
        // this player is under the spotlight
        this.stash.onTheSpot = (this.spotlight.uid === this.player.uid);
      }),
    ).subscribe();

    round$.pipe(
      take(1),
      tap( round=>{
        this.stash.gamePlay = Object.assign(this.stash.gamePlay||{}, { done, round, roundRef, });
        console.info("listenToGame()>>> stash.gamePlay", this.stash.gamePlay);
      })
    ).subscribe();
  }


  ngAfterViewInit(){
    this.preloadAudio();
  }
  
  ionViewDidEnter() {
    this.stash.listen = true;
  }
  ionViewDidLeave() {
    this.stash.listen = false;
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
    ["click","buzz", "bells"].forEach( k=>this.audio.preload(k));
  }

  resetTimer(duration=30){
    let {gamePlay} = this.stash;
    if (!gamePlay) {
      return console.warn("error: round is not loaded");
    }

    // manual reset for testing
    let entries = gamePlay.round.entries;
    Object.keys(entries).forEach( k=>entries[k]=true )

    gamePlay.word = FishbowlHelpers.nextWord(gamePlay.round);
    this.gameRef.update({ timer:{seconds: duration} }).then( _=>{
      this.audio.play("click");
    });
    gamePlay.ticking = true;
    // console.log(this.stash.gamePlay)
  }

  onTimerDone(t:Date|{seconds:number}, buzz=true) {
    let {gamePlay} = this.stash;
    if (!gamePlay) {
      return console.warn("error: round is not loaded");
    }

    this.gameRef.update({ timer:null }).then( ()=>{
      this.audio.play('bells')
    });
    if (buzz) {
      // console.log("BUZZ done at t=", t);
      this.animate(this.playTimer);
      gamePlay.ticking = false;
    } 
    FishbowlHelpers.cleanupEntries(gamePlay.round, gamePlay.roundRef);
  }

  // TODO: the game master can also trigger a wordAction
  wordAction( word:string, action:string){
    let {gamePlay} = this.stash;
    if (!gamePlay) {
      return console.warn("error: round is not loaded");
    }
    if (gamePlay.ticking==false) return;
    if (!word) return
    if (gamePlay.word != word ) {
      return console.warn("error: wordAction value does not gamePlay", word, gamePlay.word);
    }

    this.audio.play("click");
    let entries = gamePlay.round.entries;
    if (entries.hasOwnProperty(word)==false) 
      return console.warn("wordAction(): INVALID WORD, word=", word);

    let correct = action=="OK" ? true : false;
    let nextWord = FishbowlHelpers.nextWord( gamePlay.round, word, correct);
    if (!nextWord) this.onTimerDone( new Date(), false);
    gamePlay.word = nextWord;

  }

  async animate( el:HTMLElement | any, animation="long-wobble" ){
    el = el.hasOwnProperty('el') ? el['el'] : el;
    el.classList.add("animated", "slow", animation)
    let stop = await this.audio.play("buzz");
    el.addEventListener('animationend', ()=>{ 
      el.classList.remove("animated", "slow", animation);
      stop();
    });
  }

  doSettings() {
    // let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
    this.router.navigate(['/app/entry', this.game.uid])
  }

}
