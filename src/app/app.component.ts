import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Plugins, App, AppState } from '@capacitor/core';

import { AppConfig } from './services/app.helpers';
import { AuthService } from './services/auth-service.service';
import { PwaUpdateService } from './services/pwa-update.service';

import { environment } from '../environments/environment';

const { SplashScreen, StatusBar, Storage } = Plugins;

declare let window;


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

  public isAuthorized: boolean = false;

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
      this.isAuthorized = !!v;
    });

    this.platform.ready().then( async ()=>{
      // continue init
      await AppConfig.init(this.platform);
      await this.listenAppState();
      this.exposeDebug();
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
        this.patch_PWA_bootstrap();
        // reset caches, currently not put in Storage
        App.addListener('appStateChange', (state: AppState) => {
          // state.isActive contains the active state
          console.log('&&& App state changed. active=', state.isActive);
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
