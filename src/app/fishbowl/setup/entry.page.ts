import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton, ToastController, IonInput } from '@ionic/angular';
import { Validators, FormGroup, FormControl, ValidatorFn, AbstractControl } from '@angular/forms';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';

import { Observable, Subject, of, from, } from 'rxjs';
import { map, tap, switchMap, take, filter } from 'rxjs/operators';

import { AuthService } from '../../services/auth-service.service';
import { UserGameService } from '../../services/user-game.service';
import { GamePackService } from '../../fishbowl/game-pack.service';
import { Player } from '../../user/role';
import { AudioService } from '../../services/audio.service';
import { Helpful } from '../../services/app.helpers';
import { FishbowlHelpers } from '../fishbowl.helpers';
import { GameHelpers } from '../game-helpers';
import { 
  Game, GameWatch, GameDict, RoundEnum,
  PlayerListByUids, TeamRosters, UserGames, UserGameEntry,  
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
    addMoreWords: false,
    autoFillIndex: [],
  };

  public listen$ : Subject<boolean> = new Subject<boolean>();
  public game$:Observable<Game>;
  public gameRef:AngularFireObject<Game>;
  private game:Game;
  public player: Player;

  public entryForm: FormGroup;
  public validation_messages = {
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
    private userGameService: UserGameService,
    private gameHelpers: GameHelpers,
    private gamePackService: GamePackService,
    ) {
      
    let validEntry = Validators.compose([
      Validators.required,
      Validators.pattern('^[a-zA-Z0-9_.+-\\s]+$')
    ]);
    let validExtraEntry = Validators.compose([
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
      'word_4': new FormControl('', validExtraEntry),
      'word_5': new FormControl('', validExtraEntry),   
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
            // # do NOT reload if the page is dirty
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
          displayName: u.displayName,
          gamesPlayed: 0,
          isAnonymous: u.isAnonymous,
        }
        return p;
      })
    );
  }

  loadEntries(force=false){
    // "{"fhffJXHehaUdO4OUiZfZfRQEZVc2":["Benjamin Button","Hollywood","Climbing Wall"],"u1NQyAWAKaSs9sdOKBVQcJSYpGH3":["Alex Trebek","Mt Fuji","Hot Tub"]}"
    const isDirty = this.entryForm.dirty
    if (isDirty && !force) {
      // do NOT reset form if dirty, or after onTakePlayerIdentity()
      return 
    }

    let entry = {
      name: "",
      word_1: "",
      word_2: "",
      word_3: "",
      word_4: "",
      word_5: "",
    }
    let words = this.game.entries && this.game.entries[this.player.uid] || [];
    let stageName = this.game.players && this.game.players[this.player.uid] || null;
    let name = stageName || this.player.displayName || "";

    let replace = this.activatedRoute.snapshot.paramMap.get('replace');
    if (replace) {
      let {uid, playerName} = JSON.parse(replace)
      name = playerName;
    }

    words.forEach( (v,i)=>{
      entry[`word_${i+1}`] = v;
    });
    if (words.length>3) {
      this.stash.addMoreWords = true;
    }
    entry['name'] = name as string;
    this.entryForm.setValue(entry);

    if (replace) {
      const control = this.entryForm.get('name');
      control.markAsTouched({ onlySelf: true });
    }
  }

  onWordChanged(o:IonInput, i:number) {
    this.stash.autoFillIndex = this.stash.autoFillIndex.filter( v=>v!=i);
  }

  onWordCleared(o:IonInput, i:number) {
    let value = o.value;
    if (!value) {
      this.stash.autoFillIndex.push(i);
    }
  }

  async doAutoFillClick(game:Game){
    let keys = ["word_1", "word_2", "word_3", "word_4", "word_5",]
    let categories = ['person', 'place', 'thing'];

    let _getEntries = (game:Game):string[]=>{
      return Object.values(game.entries || []).reduce( (arr, v)=>arr.concat(...v), []);
    }
    let _getSuggestions = async (categories:string[], whitelist:string[]=[]) =>{
      if (categories==null) categories = whitelist
      else if (categories.length) categories = categories.filter( v=>whitelist.includes(v) );
      else return; // use cached words

      let suggestions = await categories.reduce( async (o,k)=>{
        let words = await this.gamePackService.getWords(k);
        (await o)[k] = Helpful.shuffle(words);
        return o;
      }, {});
      return suggestions;
    }

    let autoFillWords = this.stash.autoFillWords || null;
    let refresh = autoFillWords && categories.filter( k=>!autoFillWords[k] || !autoFillWords[k].length );
    let suggestions = await _getSuggestions( refresh, categories );
    this.stash.autoFillWords = autoFillWords = Object.assign(autoFillWords || {}, suggestions);

    // track autoFill word slots, do NOT replace manually entered/modified words
    if (this.stash.autoFillIndex.length==0) {
      this.stash.autoFillIndex = keys.map( (k,i)=>{
        let input = this.entryForm.get(k);
        if (!input.value) return i;
        return null;
      }).filter( v=>v!==null);
    }

    // console.log( "autoFillIndex", this.stash.autoFillIndex)

    let exclude = keys.reduce( (arr,k,i)=>{ 
      if (!this.stash.autoFillIndex.includes(i)) {
        let word = this.entryForm.get(k).value as string;
        arr.push(word);
      }
      return arr;
    }, []);
    exclude = exclude.concat( _getEntries(game) )

    this.stash.autoFillIndex.forEach( (i,j)=>{
      if (!this.stash.addMoreWords && i>=3) return;
      let k = keys[i];
      let input = this.entryForm.get(k);
      let word:string;
      let categoryIndex = i<3 ? i%categories.length : (Date.now()%categories.length);
      let categoryWords = autoFillWords[ categories[categoryIndex]];
      do {
        word = categoryWords.pop();
      } while (exclude.includes(word) && categoryWords.length)
      input.patchValue(word);
    });
    this.entryForm.markAsTouched();
  }


  ionViewDidEnter() {
    this.stash.listen = true;
  }
  ionViewDidLeave() {
    this.stash.listen = false;
  }

  // Helpers

  isPregame(g:Game=null) {
    g = g || this.game;
    return !FishbowlHelpers.isGameOver(g) && !FishbowlHelpers.isGametime(g);
  }

  toggleStashClick(key, ev){
    this.stash[key] = !this.stash[key]
    // not sure why this is necessary, but it is
    setTimeout( ()=>ev.target.checked = this.stash[key], 100)
  }
  
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
    name = name || this.entryForm.get('name').value;
    return FishbowlHelpers.doPlayerEntryLookup(name, this.game);
  }

  async onTakePlayerIdentity(v:any) {
    try {
      if (v==false) throw 'cancel';

      let found = this.doPlayerEntryLookup();
      if (!found) throw 'cancel';
      let [oldPid, name] = found;
      if (!this.game.players[oldPid]) throw 'cancel';
      
      let gameId = this.activatedRoute.snapshot.paramMap.get('uid')
      // TODO: add a [force] button, so Moderator can change devices
      let allowChangePlayerIfALREADYcheckedIn = true;
      let done = await this.gameHelpers.patchPlayerId( gameId, this.game, {
          old: oldPid, 
          new: this.player.uid,
        }, allowChangePlayerIfALREADYcheckedIn
      ).then( 
        ()=>{
          // set words to player Entry values
          // show [OK] button when entryForm.pristine==true && entryForm.status=="VALID" 
          this.entryForm.reset(this.entryForm.value);
          this.doValidate(this.entryForm);
          this.entryForm.markAsPristine();
          this.entryForm.markAsDirty(); // prevent reload
        }
        , (err)=>{
          return Promise.reject(err)
      });
      return;
      // let game$ do the rest
    } catch (err) {
      if (err=="ERROR: player already checked in"){
        this.presentToast(`Sorry, player ${name} has already checked in.`)
        this.entryForm.patchValue({name:""});
      }
      else if (err=='cancel'){
        this.entryForm.patchValue({name:""});
      }
    }
  }

  getButtonAttrs(name:string):object {
    switch (name) {
      case "submit_OK":
        if (this.entryForm.status=="VALID" && !!this.entryForm.pristine){
          // no changes needed, usually from onTakePlayerIdentity() 
          return {color:'tertiary', label:'OK', 'disabled': false}
        }
        const isNotReady = ['name', 'word_1', 'word_2', 'word_3',].find( v=>this.entryForm.value[v]==false );
        return {color:'primary', label:'Submit', 'disabled': isNotReady}
    }
    return {}
  }

  doValidate(form:FormGroup){
    // mark all controls as touched, does markAsTouched() set control.errors?
    Object.keys(form.controls).forEach(field => {
      const control = form.get(field);
      if (control instanceof FormGroup) this.doValidate(control)
      else control.markAsTouched({ onlySelf: true });
    })
  }
  
  doEntry(){
    this.doValidate(this.entryForm);
    if (this.game.quickPlay) {
      // validate just the name control
      let nameControl = this.entryForm.get('name');
      if (!!nameControl.errors)
        return
    }
    else if (!this.entryForm.valid) {
        return
    }
    let formData = this.entryForm.value;
    let u = this.player;
    let stageName = formData.name;
    let players = this.game.players || {};
    players[u.uid]=stageName;
    let playerCount = Object.keys(players).length;
    let entries = this.game.entries || {};
    if (this.game.quickPlay) {
      entries[u.uid]=['~quickPlay~'];
    }
    else {
      // trim
      Object.keys(entries).forEach( k=>{
        entries[k] = entries[k].map( v=>v.trim() )
      });
      let keys = [
        "word_1", "word_2", "word_3", "word_4", "word_5",
      ]
      let entry = keys.filter( (k,i)=>{
        if (!this.stash.addMoreWords && i>=3) return false;
        return true;
      }).map( k=>{
        let v = formData[k];
        return (v as string).trim();
      }); 
      entries[u.uid] = entry;
    }


    let update = {players, playerCount, entries} as Game;
    this.gameRef.update( update ).then(
      res=>{
        let gameId = this.activatedRoute.snapshot.paramMap.get('uid');
        let item = Object.assign({stageName}, Helpful.pick(this.game, 'label', 'gameTime')) as UserGameEntry;
        let dontwait = this.userGameService.setGame(u.uid, gameId, item);
        // this.db.object<UserGames>(`/userGames/${u.uid}`).update( {[gameId]:item});
        let msg = this.game.quickPlay ? "You are in the game." :  "Your entry was accepted";
        this.presentToast(msg);
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