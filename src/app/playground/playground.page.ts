import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth-service.service';
import { Player } from '../user/role';
import { AudioService } from '../services/audio.service';

import { Observable, Subject, of, from, throwError } from 'rxjs';
import { map, tap, switchMap, take } from 'rxjs/operators';

declare let window;

interface Game {     
  uid?: string
  label: string;
  gameDateTime?: string;
  timer?: {seconds: number};
}

@Component({
  selector: 'app-playground',
  templateUrl: './playground.page.html',
  styleUrls: ['./playground.page.scss', './animate.css'],
})
export class PlaygroundPage implements OnInit {
  public data: {
    rows: Array<any>,
    count: number,
  };
  public stash:object = {};
  public gameDateTime:dayjs.Dayjs;
  public timer$:Subject<{seconds:number}>;

  public upcomingGames$: Observable<Game[]>;
  public game$:Observable<Game>;
  public gameRef:AngularFireObject<Game>;


  @ViewChild( 'playTimer', {static:false} ) playTimer:IonButton; 

  constructor(
    private  activatedRoute: ActivatedRoute,
    private  router: Router,
    private loadingController: LoadingController,
    private nativeAudio: AudioService,
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
      tap( (p)=>{ console.log("player=", p) })
    ).subscribe();
    
    let loading = await this.presentLoading();
    
    of([]).pipe(
      switchMap( ()=>{
        this.upcomingGames$ =  this.db.list<Game>('games').snapshotChanges().pipe(
          map( sa=>sa.map( o=>{
            let value = o.payload.val();
            value.uid = o.key;
            return value;
          }))
        );
        return this.upcomingGames$
      }),
      tap( gameList=>{
        console.log( "games=", gameList);
        let isEmpty = gameList.length==0;
        if (isEmpty){
          let cloudGame = {
            label: 'game-in-cloud',
            gameDateTime: this.setGameDateTime(6,19).toJSON(),
          }
          this.db.list<Game>('games').push(cloudGame).then( v=>{
            console.log("ngOnInit list<Games>", v )
          });
          return throwError( "DEV: no games")
          // emits valueChanges() from above
        }
      }),
      map( gameList=>gameList.shift() ),
      tap( (game)=>{
        let gameId = game.uid || this.activatedRoute.snapshot.paramMap.get('id')
        if (!this.gameRef) {
          this.gameRef = this.db.object(`/games/${gameId}`);  
          this.game$ = this.gameRef.valueChanges();
        }
      }),
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
    ["click","buzz",].forEach( k=>this.nativeAudio.preload(k));
  }

  ionViewDidEnter() {

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
  resetTimer(duration=3){
    this.gameRef.update({ timer:{seconds: duration} }).then( _=>{
      this.nativeAudio.play("click");
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
    let stop = await this.nativeAudio.play("buzz");
    el.addEventListener('animationend', ()=>{ 
      el.classList.remove("animated", "slow", animation);
      stop();
    });
  }


  setGameDateTime(day:number=5, hour:number=19):dayjs.Dayjs{
    let datetime = {
      day, // Fri
      hour,
      startOf: 'hour'
    }
    let startTime = Object.entries(datetime).reduce( (d, [k,v])=>{
      if (k=='startOf') return d.startOf(v as dayjs.UnitType)
      return d.set(k as dayjs.UnitType, v as number);
    }, dayjs() );
    console.log("Set gameDateTime=", startTime);
    return startTime;
  }

}
