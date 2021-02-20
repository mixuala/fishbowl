import { Injectable } from '@angular/core';
import { Plugins, } from '@capacitor/core';
import * as firebase from 'firebase/app';
import { AngularFireAuth } from '@angular/fire/auth';

import { Observable, } from 'rxjs';
import { take, } from 'rxjs/operators';

const { Storage } = Plugins;

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(
    public afAuth: AngularFireAuth,
  ){}

  getCurrentUser():Promise<firebase.User>{
    return this.afAuth.user.pipe( take(1) ).toPromise();
  }

  getCurrentUser$():Observable<firebase.User>{
    return this.afAuth.user;
  }

  doAnonymousSignIn():Promise<firebase.User>{
    return firebase.auth().signInAnonymously()
    .then( res=>res.user )
    .catch( (error)=>{
      // Handle Errors here.
      var errorCode = error.code;
      var errorMessage = error.message;
      // ...
      return Promise.reject(error)
    });
  }

  async doRegister(value):Promise<firebase.auth.UserCredential>{
    let anon = await this.getCurrentUser();
    return firebase.auth().createUserWithEmailAndPassword(value.email, value.password)
    .then( res=>{
      return (anon && anon.isAnonymous) ? anon.linkWithCredential(res.credential) : res;
    })
    .catch(err=>{
      console.error("doRegister", err);
      return Promise.reject(err);
    })
  }

  doLogin(value):Promise<firebase.User>{
    return firebase.auth().signInWithEmailAndPassword(value.email, value.password)
    .then( res=>res.user)
  }

  doLogout():Promise<void>{
    return new Promise((resolve, reject) => {
      this.afAuth.signOut()
      .then( async () => {
        // this.firebaseService.unsubscribeOnLogOut();
        Storage.keys().then( o=>{
          o.keys.forEach( k=>{
            Storage.remove({key:k})
          });
        });
        resolve();
      }).catch((error) => {
        console.log(error);
        reject();
      });
    })
  }

  // legacy
  isLoggedIn$():Observable<firebase.User> {
    return this.getCurrentUser$()
  }

}
