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

declare let window;

@Component({
  selector: 'app-entry',
  templateUrl: './entry.page.html',
  styleUrls: ['./entry.page.scss'],
})
export class EntryPage implements OnInit {
  
  public stash:any = {
    listen: true,
  };

  public listen$ : Subject<boolean> = new Subject<boolean>();
  public game$:Observable<Game>;
  public gameRef:AngularFireObject<Game>;
  private game:Game;
  public player: Player;

  public entryForm: FormGroup;
  public gameForm: FormGroup;
  validation_messages = {
    'name':[
      { type: 'required', message: 'Please enter your name.' },
      { type: 'pattern', message: 'Your word must be letters and numbers only.' }
    ],
    'word': [
      { type: 'required', message: 'Please enter a Person, Place or Thing.' },
      { type: 'pattern', message: 'Your word must be letters and numbers only.' }
    ],
    'chatRoom': [
      { type: 'required', message: 'Please enter the link for a video chat room' },
      { type: 'pattern', message: 'Must be a valid `https` web link' }
    ],
  };  


  @ViewChild( 'playTimer', {static:false} ) playTimer:IonButton; 
  
  
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
      'chatRoom': new FormControl('', Validators.compose([
        // Validators.required,
        Validators.pattern(urlRegex),
      ])),
    })

    this.entryForm = new FormGroup({
      'name': new FormControl('', Validators.compose([
        Validators.required,
        Validators.pattern('^[a-zA-Z0-9_.+-\\s]+$')
      ])),
      'word_1': new FormControl('', validEntry),
      'word_2': new FormControl('', validEntry),
      'word_3': new FormControl('', validEntry),   
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
      tap( (game)=>{
        let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
        let now = new Date();
        this.gameRef = this.db.object(`/games/${gameId}`);  
        this.game$ = this.gameRef.valueChanges().pipe( 
          tap( o=>{
            this.game = o;
            this.stash.activeGame = o.gameTime < Date.now();
            this.loadEntries();
          })
        )

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
        return p;
      })
    );
  }

  loadEntries(){
    let entry = {
      name: "",
      word_1: "",
      word_2: "",
      word_3: "",
    }
    let words = this.game.entries && this.game.entries[this.player.uid] || [];
    words.forEach( (v,i)=>{
      entry[`word_${i+1}`] = v;
    });

    let name = this.game.players && this.game.players[this.player.uid] || this.player.displayName || "";
    entry['name'] = name as string;
    entry['game'] = {chatRoom: this.game.chatRoom || ""};
    this.entryForm.setValue(entry)
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
  
  doEntry(){
    let formData = this.entryForm.value;
    let u = this.player;
    let players = this.game.players || {};
    players[u.uid]=formData.name;
    let playerCount = Object.keys(players).length;
    let entries = this.game.entries || {};
    entries[u.uid] = Object.entries(formData).filter( ([k,v])=>k.startsWith('word_')).map( ([k,v])=>v as string);
    let update = {players, playerCount, entries} as Game;
    if (formData.game){
      let {chatRoom} = formData.game;
      if (chatRoom) update.chatRoom = chatRoom;
    }
    this.gameRef.update( update ).then(
      res=>{
        let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
        this.router.navigate(['/app/game', gameId]);
      }
    );
  }

}
