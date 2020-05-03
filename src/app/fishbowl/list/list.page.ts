import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ModalController, } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { Observable, Subject, of, from, throwError } from 'rxjs';
import { map, tap, switchMap, take, takeWhile, filter } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { HelpComponent } from '../../components/help/help.component';
import { Player } from '../../user/role';
import { Helpful } from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers'
import { GameHelpers } from '../game-helpers';
import { 
  Game, GameWatch, GameDict, RoundEnum,
  PlayerByUids, TeamRosters,  
} from '../types';

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
    private modalCtrl: ModalController,
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
    // let dontWait = HelpComponent.presentModal(this.modalCtrl, {
    //   template:'intro',
    // });

    this.loadPlayer$().pipe(
      take(1),
      tap( (p)=>{ 
        this.player = p;
        console.log("player=", p);
      })
    ).subscribe();
    
    let loading = await this.presentLoading();
    this.games$ = this.gameHelpers.getGames$();

    let invite = this.activatedRoute.snapshot.queryParamMap.get('invite');
    if (invite) {
      this.games$ = this.games$.pipe(
        map( (games, i)=>{
          return games.filter( g=>g.uid==invite)
        }),
      )
    }
    
    this.games$.pipe(
      filter( ()=>this.stash.listen),
      map( (games, i)=>{
        if (!invite) return games;
        return games.filter( g=>g.uid==invite)
      }),
      tap( (gameList:Game[])=>{
        console.log( "games=", gameList);
        this._moveExpiredGamesToNextWeek(gameList)
      }),
      tap( ()=>{
        loading && loading.dismiss();
      }),
    ).subscribe();
  }

  private _moveExpiredGamesToNextWeek(gameList){
    let now = Date.now();
    let updates:any[] = gameList.filter(g=>g.gameTime < now)
      .map( g=>{
          let later = dayjs(g.gameTime).add(7,'day').toDate().getTime()
          return {[g.uid]: { label: g.label, gameTime: later} }
      });
    if (updates && updates.length) {
      updates.forEach( (o)=>{
        Object.entries(o).forEach( ([gid,update])=>{
          console.warn( "DEV: update gameTimes to next week, uid=",gid, update);
          this.db.object<Game>(`/games/${gid}`).update(update);
        })
      });
    }
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
          isAnonymous: u.isAnonymous,
        }
        // DEV Hack
        if (u.email=="sunday@test.com") {
          p['isAdmin'] = true;
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

  createGame(label:string="Super Sunday", day:number=7){
    let createGame = true;
    if (createGame){
      let date = FishbowlHelpers.setGameDateTime(day,19).toDate();
      let cloudGame:Game = {
        uid: this.db.createPushId(),
        label,
        gameTime: date.getTime(),
        timezoneOffset: date.getTimezoneOffset()
      }
      this.db.list<Game>('/games').update(cloudGame.uid, cloudGame)
      .then( v=>{
        console.log("ngOnInit list<Games>", v )
      });
    }
    else console.warn( "createGame: set createGame=true")
  }
}
