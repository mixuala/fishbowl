import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { Player } from '../../user/role';
import { FishbowlHelpers } from '../fishbowl.helpers'

import { Observable, Subject, of, from, throwError } from 'rxjs';
import { map, tap, switchMap, take, takeWhile, filter } from 'rxjs/operators';
import { Game } from '../types';

declare let window;

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {

  public stash:any = {
    listen: true,
  };

  public listen$ : Subject<boolean> = new Subject<boolean>();
  public games$: Observable<Game[]>;
  public player: Player;

  constructor(
    private  activatedRoute: ActivatedRoute,
    private  router: Router,
    private loadingController: LoadingController,
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
      tap( (p)=>{ 
        this.player = p;
        console.log("player=", p);
      })
    ).subscribe();
    
    let loading = await this.presentLoading();
    
    of([]).pipe(
      switchMap( ()=>{
        this.games$ =  this.db.list<Game>('games').snapshotChanges().pipe(
          map( sa=>sa.map( o=>{
            let value = o.payload.val();
            value.uid = o.key;
            return value;
          }))
        );
        return this.games$
      }),
      filter( _=>this.stash.listen),
      tap( gameList=>{
        console.log( "games=", gameList);
        let createGame = false;
        if (createGame){
          this.createGame("the next game")
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
  
  join(game, index) {
    if (game.players && game.players[this.player.uid]) {
      this.router.navigate(['/app/game', game.uid]);
    }
    else {
      this.router.navigate(['/app/entry', game.uid]);
    }
  }



  // admin
  create3Games(){
    [
      {label:"Fish Taco Tuesday",day:2},
      {label:"Saturday Night Special",day:6},
      {label:"Maybe Sunday",day:7}
    ].forEach( o=>{
      this.createGame(o.label, o.day)
    });
  }

  createGame(label:string, day:number=7){
    let createGame = true;
    if (createGame){
      let date = FishbowlHelpers.setGameDateTime(day,19).toDate();
      let cloudGame:Game = {
        uid: this.db.createPushId(),
        label,
        gameDatetimeDesc: date.getTime(),
        timezoneOffset: date.getTimezoneOffset()
      }
      this.db.list<Game>('/games').update(cloudGame.uid, cloudGame).then( v=>{
        console.log("ngOnInit list<Games>", v )
      });
    }
    else console.warn( "createGame: set createGame=true")
  }
}
