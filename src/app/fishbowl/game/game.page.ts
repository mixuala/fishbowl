import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { Player, } from '../../user/role';
import { Game, SpotlightPlayer } from '../types';
import { AudioService } from '../../services/audio.service';
import { AppConfig, Helpful} from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers'

import { Observable, Subject, of, from, throwError, pipe, combineLatest } from 'rxjs';
import { map, tap, switchMap, take, takeWhile, filter, concatMap, withLatestFrom } from 'rxjs/operators';

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
            this.stash.activeGame = new Date(o.gameDateTime) < now;
            // DEV
            this.stash.activeGame = true;
          })
        );
      }),
      tap( (game)=>{
        this.spotlightPlayer();
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

  beginRound():boolean{
    if (!this.stash.activeGame) return;
    if (!this.game) return;
    if (!this.game.lineup) {
      let spotlightIndex:number;
      let lineup:number[];
      // ignore teams for now
      let players = Object.entries(this.game.players).map( ([uid, name])=> {
        return {
          uid,
          displayName: name as string
        }
      });
      lineup = Helpful.shuffle(Array.from(Array(players.length).keys()));
      spotlightIndex = 0;
      this.gameRef.update( {lineup, spotlightIndex} );
      return true;
    }
    return;
  }

  nextPlayer(){
    if (this.stash.activeGame) {
      let spotlightIndex = this.game.spotlightIndex +1;
      if (spotlightIndex==this.game.lineup.length){
        console.log("ROUND IS COMPLETE");
        spotlightIndex = 0;
      }
      this.gameRef.update( {spotlightIndex})
    }
  }

  spotlightPlayer(){
    if (this.stash.activeGame) {
      try {
        let {lineup, spotlightIndex} = this.game;
        let playerIndex = lineup[spotlightIndex];
        let [uid, displayName] = Object.entries(this.game.players)[ playerIndex ];
        this.spotlight =  {uid, displayName}
      
        // this player is under the spotlight
        this.stash.isUnderSpotlight =  (uid === this.player.uid);
        
      } catch (err) {
        // console.error( "spotlightPlayer", err);
      }
    }
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
    ["click","buzz"].forEach( k=>this.audio.preload(k));
  }

  resetTimer(duration=3){
    this.gameRef
    this.gameRef.update({ timer:{seconds: duration} }).then( _=>{
      this.audio.play("click");
    });
  }

  onTimerDone(t:Date|{seconds:number}) {
    this.gameRef.update({ timer:null }).then( _=>{
    });
    console.log("BUZZ done at t=", t);
    this.animate(this.playTimer);

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
    let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
    this.router.navigate(['/app/entry', gameId])
  }

}
