import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton, ToastController } from '@ionic/angular';
import { Validators, FormGroup, FormControl, ValidatorFn, AbstractControl } from '@angular/forms';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { Observable, Subject, of, from, } from 'rxjs';
import { map, tap, switchMap, take, filter } from 'rxjs/operators';

import { AuthService } from '../../services/auth-service.service';
import { Player } from '../../user/role';
import { AudioService } from '../../services/audio.service';
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
  validation_messages = {
    'name':[
      { type: 'required', message: 'Please enter your game name.' },
      // { type: 'unique', message: 'Wow, that name is already taken. You better choose another.' },
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
    public toastController: ToastController,
    private audio: AudioService,
    private db: AngularFireDatabase,
    private authService: AuthService,
    private gameHelpers: GameHelpers,
    ) {
      
    let validEntry = Validators.compose([
      Validators.required,
      Validators.pattern('^[a-zA-Z0-9_.+-\\s]+$')
    ]);


    this.entryForm = new FormGroup({
      'name': new FormControl('', Validators.compose([
        Validators.required,
        Validators.pattern('^[a-zA-Z0-9_.+-\\s]+$'),
        uniqueNameValidator(this),
      ])),
      'word_1': new FormControl('', validEntry),
      'word_2': new FormControl('', validEntry),
      'word_3': new FormControl('', validEntry),   
    });

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

  doPlayerEntryLookup(name:string=null):[string, string] {
    if (this.player.isAnonymous==false) return null;
    if (this.game.activeRound) return null;

    name = this.entryForm.get('name').value;
    let found = Object.entries(this.game.players).find( ([k,v])=>v.trim().toLowerCase()==name.toLowerCase());
    return !!found ? found : null;
  }

  async onTakePlayerIdentity(v:any) {
    try {
      if (v==false) throw new Error('cancel');
      let found = this.doPlayerEntryLookup();
      if (!found) throw new Error('cancel');
      let [oldPid, name] = found;
      if (!this.game.players[oldPid]) throw new Error('cancel');
      if (this.game.activeRound) throw new Error('cancel');
      
      let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
      let done = await this.gameHelpers.patchPlayerId( gameId, this.game, {
        old: oldPid, 
        new: this.player.uid,
      }).then( ()=>{
        this.entryForm.reset(this.entryForm.value);
      });
      return;
      // let game$ do the rest
    } catch (err) {
      if (err=='cancel')
        this.entryForm.patchValue({name:""});
    }
  }

  doValidate(form:FormGroup){
    Object.keys(form.controls).forEach(field => {
      const control = form.get(field);
      if (control instanceof FormGroup) this.doValidate(control)
      else control.markAsTouched({ onlySelf: true });
    })
  }
  
  doEntry(){
    if (!this.entryForm.valid) {
      this.doValidate(this.entryForm)
      return
    }
    let formData = this.entryForm.value;
    let u = this.player;
    let players = this.game.players || {};
    players[u.uid]=formData.name;
    let playerCount = Object.keys(players).length;
    let entries = this.game.entries || {};
    // trim
    Object.keys(entries).forEach( k=>{
      entries[k] = entries[k].map( v=>v.trim() )
    })
    entries[u.uid] = Object.entries(formData).filter( ([k,v])=>k.startsWith('word_')).map( ([k,v])=>v as string);
    let update = {players, playerCount, entries} as Game;
    this.gameRef.update( update ).then(
      res=>{
        let msg = "Your entry was accepted";
        this.presentToast(msg);
        let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
        this.router.navigate(['/app/game', gameId]);
      }
    );
  }

  async presentToast(msg, options:any={}) {
    let defaults = {
      message: msg,
      position: "top",
      animated: true,
      color: "tertiary",
      keyboardClose: true,
      cssClass: "toast-below-header",
      duration: 2000,
    }
    options = Object.assign( defaults, options);
    const toast = await this.toastController.create(options);
    toast.present();
  }


}


export function uniqueNameValidator(context:any): ValidatorFn {
  return (control: AbstractControl): {[key: string]: any} | null => {
    if (!context.player) return null;
    let game:Game = context.game;
    let name = control.value as string;
    const isTaken = game && Object.entries(game.players).find(([uid,v])=>v.trim().toLowerCase()==(name.trim().toLowerCase()));
    if (!!isTaken && context.player.uid != isTaken[0]){
      return {'unique': {value: control.value}}
    }
    return null;
  };
}