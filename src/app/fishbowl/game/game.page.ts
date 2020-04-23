import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { Player } from '../../user/role';
import { Game } from '../types';
import { AudioService } from '../../services/audio.service';
import { AppConfig } from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers'

import { Observable, Subject, of, from, throwError } from 'rxjs';
import { map, tap, switchMap, take, takeWhile, filter } from 'rxjs/operators';

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
    active: false,
  };

  public listen$ : Subject<boolean> = new Subject<boolean>();
  public upcomingGames$: Observable<Game[]>;
  public game$:Observable<Game>;
  public gameRef:AngularFireObject<Game>;


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
      tap( (p)=>{ console.log("player=", p) })
    ).subscribe();
    
    let loading = await this.presentLoading();
    
    of([]).pipe(
      tap( (game)=>{
        let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
        let now = new Date();
        this.gameRef = this.db.object(`/games/${gameId}`);  
        this.game$ = this.gameRef.valueChanges();
        this.game$.pipe( 
          take(1),
          tap( o=>{
            this.stash.active = new Date(o.gameDateTime) < now;
          })
        )

      }),
      filter( _=>this.stash.listen),
      tap( ()=>{
        loading && loading.dismiss();
      }),
    ).subscribe();

    // # set initial volume
    this.toggleVolumeIcon(1, false);
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
      })
    );
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

}
