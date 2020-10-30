import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, } from '@ionic/angular';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { Observable, Subject, of, from, BehaviorSubject, interval, Subscription } from 'rxjs';
import { map, tap, switchMap, take, filter, first } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { UserGameService } from '../../services/user-game.service';
import { HelpComponent } from '../../components/help/help.component';
import { Player } from '../../user/role';
import { Helpful } from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers'
import { GameHelpers } from '../game-helpers';
import { 
  Game, GameWatch, GameDict, RoundEnum, UserGameEntry, UserGames,  
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
  public playerId: string;
  private player$ = new BehaviorSubject<Player>(null);
  public myGames:UserGames = {};

  constructor(
    private  activatedRoute: ActivatedRoute,
    private  router: Router,
    private loadingController: LoadingController,
    private db: AngularFireDatabase,
    private authService: AuthService,
    private userGameService: UserGameService,
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
    let invite = this.activatedRoute.snapshot.queryParamMap.get('invite');
    invite = invite || this.activatedRoute.snapshot.paramMap.get('uid');
    this.stash.useInviteLayout = !!invite;
    
    if (invite) {
      this.games$ = this.gameHelpers.getGamesByInvite$(invite);
    }
    else {
      this.games$ = this.gameHelpers.getGames$(this.player$);
    }
    
    this.games$.pipe(
      filter( ()=>this.stash.listen),
      map( (games, i)=>{
        games.forEach( g=>{
          g.activeGame = FishbowlHelpers.isActive(g);
        })
        if (!invite) return games;
        return games.filter( g=>g.uid==invite)
      }),
      tap( (gameList:Game[])=>{
        // console.log( "games=", gameList);
        this._moveExpiredGamesToNextWeek(gameList)
      }),
      tap( ()=>{
        loading && loading.dismiss();
      }),
    ).subscribe();
  }

  private _moveExpiredGamesToNextWeek(gameList:Game[]){
    
    let limit = dayjs().subtract(8,'hour').toDate().getTime()
    let updates:any[] = gameList.filter(game=>!!game['isDev'])        // use game.isDev attr 
      .filter(g=>g.gameTime < limit)
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
      }),
      switchMap( u=>{
        this.playerId = u.uid;      // only change here

        let p:Player = {
          uid: u.uid,
          displayName: u.displayName,
          gamesPlayed: 0,
          isAnonymous: u.isAnonymous,
        }
        this.watchUserGames(this.playerId);
        this.player$.next(p);

        return this.player$.asObservable();
      })
    );
  }

  public watchUserGames(uid:string) {
    if (this.watchUserGames['_subscription']) {
      (this.watchUserGames['_subscription'] as Subscription).unsubscribe();
    }
    if (!uid) return;
    let now = Date.now();
    this.watchUserGames['_subscription'] = this.userGameService.getGames$(uid).subscribe( o=>{
      Object.keys(o||{}).forEach( k=>o[k]['countdown']=o[k].gameTime-now );
      this.myGames = o;
    });
  }

  ionViewDidEnter() {
    interval(500).pipe(first()).subscribe(()=>this.stash.showSocialButtons = true)
    this.stash.listen = true;
  }
  ionViewDidLeave() {
    this.stash.showSocialButtons = false;
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

    
  isGameOver( g:Game) {
    return FishbowlHelpers.isGameOver(g);
  }

  isActive( g:Game) {
    return FishbowlHelpers.isActive(g);
  }

  isGametime( g:Game) {
    return FishbowlHelpers.isGametime(g);
  }

  getCallToAction( g:Game ) {
    if (FishbowlHelpers.isGameOver(g)) return "Game Over";
    if (FishbowlHelpers.isGametime(g)) return "Join Game";
    let gameEntries = this.userGameService.getGames$(this.playerId);
    let entry = this.myGames[g.uid];
    if (!!entry) {
      if (FishbowlHelpers.isPlayersLoungeOpen(g)) return "Enter the Players Lounge"
      else return "Review Game Entry"
    }
    return "Grab a Spot Now";
  }

  onGameTime(t:Date|{seconds:number}=null, buzz=true):Promise<void> {
    // reload page
    window.location.href = window.location.href;
    return
  }
  
  doAction(game:Game, index) {
    this.player$.pipe(
      tap( p=>{
        if( FishbowlHelpers.isGameOver(game) ) {
          // activeGame
          this.router.navigate(['/app/game', game.uid]);
        }
        else if (game.players && game.players[p.uid]) {
          if (!this.myGames[game.uid]) {
            // patch UserGames
            let stageName = game.players[p.uid];
            let item = Object.assign({stageName}, Helpful.pick(game, 'label', 'gameTime')) as UserGameEntry;
            let dontwait = this.userGameService.setGame(p.uid, game.uid, item);
          }
          
          // preGame with registered player
          let isModerator = game.moderators && game.moderators[p.uid];
          let isPlayersLoungeOpen = FishbowlHelpers.isPlayersLoungeOpen(game);

          if (!isModerator && isPlayersLoungeOpen==false) {
            // players, but not moderators, can go directly to review Entry
            this.router.navigate(['/app/game', game.uid, 'player']);  
          }
          else this.router.navigate(['/app/game', game.uid]);
        }
        else {
          // playerEntry CTA
          this.router.navigate(['/app/game', game.uid, 'player']);
        }
      })
    ).subscribe()
  }

}
