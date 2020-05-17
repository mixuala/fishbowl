import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton } from '@ionic/angular';
import { Validators, FormGroup, FormControl } from '@angular/forms';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { Observable, Subject, of, from, throwError } from 'rxjs';
import { map, tap, switchMap, take, takeWhile, filter } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth-service.service';
import { Player } from '../../user/role';
import { AudioService } from '../../services/audio.service';
import { Helpful } from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers'
import { GameHelpers } from '../game-helpers';
import { 
  Game, GameWatch, GameDict, RoundEnum,
  PlayerListByUids, TeamRosters,  
} from '../types';
import { takeUntil } from 'angular-pipes/utils/utils';

declare let window;

@Component({
  selector: 'app-game-settings',
  templateUrl: './game-settings.page.html',
  styleUrls: ['./game-settings.page.scss'],
})
export class GameSettingsPage implements OnInit {
  
  public stash:any = {
    listen: true,
  };
  public inviteLink: string;

  public listen$ : Subject<boolean> = new Subject<boolean>();
  public game$:Observable<Game>;
  public gameRef:AngularFireObject<Game>;
  public game:Game;
  private gameId:string;
  public player: Player;

  public entryForm: FormGroup;
  public gameForm: FormGroup;
  validation_messages = {
    'name':[
      { type: 'required', message: 'Please enter a screen name.' },
      { type: 'pattern', message: 'Your word must be letters and numbers only.' }
    ],
    'label':[
      { type: 'required', message: 'Please enter the title for this game.' },
      { type: 'pattern', message: 'Your word must be letters and numbers only.' }
    ],
    'team':[
      { type: 'required', message: 'Please enter team names for this game.' },
      { type: 'pattern', message: 'Your word must be letters and numbers only.' }
    ],    
    'startTime':[
      { type: 'required', message: 'Please enter a the start time for this game.' },
    ],
    'time':[
      { type: 'required', message: 'Please enter a the start time for this game.' },
    ],
    'chatRoom': [
      { type: 'required', message: 'Please enter the video meeting invitation for this game.' },
      { type: 'pattern', message: 'Must be a valid `https` web link' }
    ],
  };  

  
  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private loadingController: LoadingController,
    private audio: AudioService,
    private db: AngularFireDatabase,
    private authService: AuthService,
    private gameHelpers: GameHelpers,
    ) {
      
    // const urlRegex = '^(https?://)?([\\da-z.-]+)\\.([a-z.]{2,6})[/\\w .-]??(?:&\?[^=&]*=[^=&]*)$';
    const urlRegex = '^(https://)?([\\da-z.-]+)\\.([a-z.]{2,6})[/\\w .-]??.*$';

    let validEntry = Validators.compose([
      Validators.required,
      Validators.pattern('^[a-zA-Z0-9_.+-\\s]+$')
    ]);

    this.gameForm = new FormGroup({
      'label': new FormControl('', validEntry),
      'startTime': new FormControl('', Validators.compose([
        Validators.required,
      ])),  
      'chatRoom': new FormControl('', Validators.compose([
        // Validators.required,
        Validators.pattern(urlRegex),
      ])),
      'public': new FormControl(''),
    })
    
    this.entryForm = new FormGroup({
      'name': new FormControl('', validEntry),
      'teamA': new FormControl('', validEntry),
      'teamB': new FormControl('', validEntry),
      'game': this.gameForm,
    });

    if (environment.production==false){
      window['_dbg'] = window['_dbg'] || {};
      window._dbg.stash = this.stash
      window._dbg.dayjs = dayjs

      
      window._dbg.chatRoom = this.gameForm.get('chatRoom')
      window._dbg.Validators = Validators
      /* debug url pattern validation, paste to JS console
          chatRoom = _dbg.chatRoom
          val = _dbg.Validators
          s = "https://us04web.zoom.us/j/8705326103?pwd=WmRxdHNkbEEzaHc0Tkd1K1V0L0VtQT09"
          t = "https://us04web.zoom.us/j/8705326103"
          urlRegex = '^(https?://)?([\\da-z.-]+)\\.([a-z.]{2,6})[/\\w .-]\??(?:&?[^=&]*=[^=&]*)*$';
          urlRegex = '^(https?://)?([\\da-z.-]+)\\.([a-z.]{2,6})[/\\w .-]??.*$';
          val.pattern(urlRegex)({value:s})
      */
    }

  }

  async ngOnInit() {

    let loading = await this.presentLoading();

    this.loadPlayer$().pipe(
      take(1),
      tap( (p)=>{ 
        this.player = p;
      }),
      switchMap( ()=>{
        let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
        if (gameId=="new"){
          this.createNewGame();
          this.gameId = this.db.createPushId();
          return of({});
        }
        else {
          this.gameId = gameId;
          this.inviteLink = this.getInvite(gameId);
          this.gameRef = this.db.object(`/games/${this.gameId}`);  
          this.game$ = this.gameRef.valueChanges().pipe(
            // takeUntil($done)
            tap( o=>{
              if (!o) return
              this.loadData(o);
            })
          )
          return this.game$;      
        }
      }),
      filter( _=>this.stash.listen),
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
      })
    );
  }

  loadData(game:Partial<Game>={}){

    let gameData = Helpful.pick(game, 'label', 'gameTime', 'chatRoom', 'teamNames', 'public' ) as Partial<Game>;
    let name = game.players && game.players[this.player.uid] || this.player.displayName || "";
    let formData = {
      name,
      teamA: gameData.teamNames && gameData.teamNames[0] || "",
      teamB: gameData.teamNames && gameData.teamNames[1] || "",
      'game': {
        label: gameData.label, 
        startTime: gameData.gameTime,
        chatRoom: gameData.chatRoom,
        public: !!gameData.public,
      }
    }
    this.stash.pickDatetime = {
      format: "DDD, D-MMM @ HH:mm",
      min: dayjs().startOf('hour').format('YYYY-MM-DD'),
      max: dayjs().add(14, 'day').endOf('day').format('YYYY-MM-DD'),
      value: new Date(gameData.gameTime).toISOString(),
    }
    // console.log( "loadData=", game, formData)
    this.entryForm.setValue(  formData  )
    this.game = game as Game;
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

  isModerator() {
    let pid = this.player && this.player.uid
    return this.game && this.game.moderators && this.game.moderators[pid] == true
  }


  getInvite(gameId:string){
    gameId = gameId || this.activatedRoute.snapshot.paramMap.get('uid')
    if (gameId == "new") return;

    let baseurl = 'https://fishbowl-the-game.web.app';
    return `${baseurl}/app/invite/${gameId}`
  }

  gameTimeChanged(ev:CustomEvent){
    console.log(ev)
    let datetime = ev.detail.value;
    let gameTime = dayjs(datetime).toDate().getTime();
    let startTime = new Date(datetime).toISOString();
    this.gameForm.patchValue( { startTime:gameTime });
    console.log("gameTime=", startTime, gameTime);
  }

  createNewGame() {
    // create skeleton for new Game
    let gameDefaults = {
      label: "",
      gameTime: dayjs().add(1,'hour').startOf('hour').toDate().getTime(),
      chatRoom: "",
      public: false,
      moderators: {
        [this.player.uid]: true
      }
    }
    this.inviteLink = null;
    this.loadData(gameDefaults)
  }

  
  doSubmit(){
    let formData = this.entryForm.value;
    let u = this.player;

    let players = this.game.players || {};
    players[u.uid]=formData.name;
    let playerCount = Object.keys(players).length;
    let {label, startTime, chatRoom} = formData.game;
    let timezoneOffset = new Date(startTime).getTimezoneOffset();
    let teamNames = [formData.teamA, formData.teamB];
    
    let update = {players, playerCount, label, 
      gameTime:startTime,  timezoneOffset, chatRoom , teamNames, 
      public: formData.game.public
    } as Partial<Game>;

    let gameId = this.activatedRoute.snapshot.paramMap.get('uid');
    if (gameId=="new"){
      update.moderators = { [u.uid]: true };
      update.checkIn = { [u.uid]: false };    // default moderators are hidden from gameplay
      // show toast
    }
    
    this.gameRef = this.db.object(`/games/${this.gameId}`);
    this.gameRef.update( update ).then(
      res=>{
        this.router.navigate(['/app/game/', this.gameId]);
      }
    );
  }

}
