# extract ionicThemes template
> template: `ionic5-full-starter-app-capacitor-2.0.0.zip`
```
# cd working dir
npm install
npm audit fix
```

# firebase config
see: 
* https://ionicthemes.com/tutorials/about/building-a-ionic-firebase-app-step-by-step
* https://ionicthemes.com/tutorials/about/firebase-authentication-in-ionic-framework-apps
* https://github.com/angular/angularfire

```
npm install firebase angularfire2 --save
# npm install firebase @angular/fire --save
```

## firebase console 
- project name: fishbowl
- project id: fishbowl-the-game

```
npm install -g firebase-tools --save-dev
firebase login
firebase init
# choose: database, functions, hosting
```


### deploy



# PWA
> https://angular.io/guide/service-worker-getting-started
> https://ionicthemes.com/tutorials/about/the-complete-guide-to-progressive-web-apps-with-ionic4
> https://firebase.google.com/docs/cloud-messaging/js/client
```
npm install -g @angular/cli lighthouse
// project listed in angular.json
ng add @angular/pwa --project app
```

```
lighthouse http://localhost:8100 --view
```
