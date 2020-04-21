import { Component } from '@angular/core';
import { Plugins } from '@capacitor/core';
const { SplashScreen } = Plugins;

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

  constructor() {
    this.initializeApp();
  }

  async initializeApp() {
   try {
     await SplashScreen.hide();
   } catch (err) {
     console.log('This is normal in a browser', err);
   }
 }

}
