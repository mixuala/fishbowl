import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Plugins, App, AppState } from '@capacitor/core';
import { Subscription } from 'rxjs';

import { AppConfig, Helpful } from './services/app.helpers';
import { AuthService } from './services/auth-service.service';
import { UserGameService } from './services/user-game.service';
import { PwaUpdateService } from './services/pwa-update.service';
import { environment } from '../environments/environment';
import { UserGameEntry } from './fishbowl/types';

const { SplashScreen, StatusBar, Storage } = Plugins;

declare let window;
declare let document;


@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: [
    './side-menu/styles/side-menu.scss',
    './side-menu/styles/side-menu.shell.scss',
    './side-menu/styles/side-menu.responsive.scss'
  ]
})
export class AppComponent {

  public isAnonymous = false;
  public displayName = "";
  public myGames:UserGameEntry[] = [];

  appPages = [
   {
     title: 'Categories',
     url: '/app/categories',
     ionicIcon: 'list-outline'
   },
   {
     title: 'Profile',
     url: '/app/user',
     ionicIcon: 'person-outline'
   },
   {
     title: 'Contact Card',
     url: '/contact-card',
     customIcon: './assets/custom-icons/side-menu/contact-card.svg'
   },
   {
     title: 'Notifications',
     url: '/app/notifications',
     ionicIcon: 'notifications-outline'
   }
  ];
  accountPages = [
   {
     title: 'Log In',
     url: '/auth/login',
     ionicIcon: 'log-in-outline'
   },
   {
     title: 'Sign Up',
     url: '/auth/signup',
     ionicIcon: 'person-add-outline'
   },
   {
     title: 'Tutorial',
     url: '/walkthrough',
     ionicIcon: 'school-outline'
   },
   {
     title: 'Getting Started',
     url: '/getting-started',
     ionicIcon: 'rocket-outline'
   },
   {
     title: '404 page',
     url: '/page-not-found',
     ionicIcon: 'alert-circle-outline'
    }
  ];

  constructor(
    private authService: AuthService,
    private userGameService: UserGameService,
    private appConfig: AppConfig,
    private platform: Platform,
    private pwaUpdateService: PwaUpdateService,
  ) {
    this.initializeApp();
    this.pwaUpdateService.listenForUpdates();
    this.patch_PWA_bootstrap();
  }

  async initializeApp() {

    let dontWait = [
      SplashScreen.hide(),
      StatusBar.setStyle( null /* default */ ),
    ]
    Promise.all(dontWait).catch( (err)=>{
        console.log('This is normal in a browser', err);
    });

    this.authService.getCurrentUser$().subscribe( v=>{
      // AuthService.doAnonymousSignIn() enabled
      if (!!v){
        // 
        this.isAnonymous = v.isAnonymous;
        this.displayName = v.isAnonymous ? "Guest" : v.email;
        this.watchUserGames(v.uid);
      }
      else {
        this.isAnonymous = false;
        this.displayName = "";
      }
    });

    this.platform.ready().then( async ()=>{
      // continue init
      await AppConfig.init(this.platform);
      await this.listenAppState();
      this.exposeDebug();
    });

  }

  public watchUserGames(uid:string) {
    if (this.watchUserGames['_subscription']) {
      (this.watchUserGames['_subscription'] as Subscription).unsubscribe();
    }
    if (!uid) return;
    this.watchUserGames['_subscription'] = this.userGameService.getGames$(uid).subscribe( o=>{
      const LIMIT = 5;
      const now = Date.now()
      let games = Object.entries(o||{}).map( ([gid, g])=>(g['gameId']=gid, g ));
      if (games.length>LIMIT) {
        debugger;
        games.sort( (a,b)=>Math.abs(a.gameTime-now) - Math.abs(b.gameTime-now) );
        games = games.slice(0,LIMIT);
      }
      games.sort( (a,b)=>a.gameTime - b.gameTime );
      this.myGames = games;
    });
  }


  async patch_PWA_bootstrap(){
    console.warn( "TODO: CONFIRM PWA PATCH IS STILL REQUIRED")
    const RELOAD_LIMIT = 5000
    const el = document.getElementsByTagName('HTML')[0];
    const now = Date.now();
    if (el.classList.contains('plt-pwa')){
      const resp = await Storage.get({key:'PWA_RELOAD'});
      if ( now - JSON.parse(resp.value) < RELOAD_LIMIT) 
        return;  // wait at  before next reload

      const cancel = setTimeout( async ()=>{
        // something not bootstrapping correctly with pwa.  reload() fixes
        await Storage.set({key:'PWA_RELOAD', value:JSON.stringify(now)});
        window.location.reload();
      },100)
    }
  }

  async listenAppState(){
    let platform = AppConfig.device.platform;
    switch (platform){
      case 'ios':
      case 'android':
        // this.patch_PWA_bootstrap();
        // reset caches, currently not put in Storage
        App.addListener('appStateChange', (state: AppState) => {
          // state.isActive contains the active state
          console.log('### App state changed. active=', state.isActive);
          // AppCache.handleAppStateChange(state);
        });
        break;
    } 
  }

  private
  exposeDebug(){
    if (environment.production==false){
      // Static classes
      window['_AppConfig'] = AppConfig;
      window['_Storage'] = Storage;
    }
  }


}
