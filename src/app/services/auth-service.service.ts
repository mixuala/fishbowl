import { Injectable } from '@angular/core';
import * as firebase from 'firebase/app';
import { AngularFireAuth } from '@angular/fire/auth';

import { take, } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(
    public afAuth: AngularFireAuth
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

  doRegister(value){
   return new Promise<any>((resolve, reject) => {
     firebase.auth().createUserWithEmailAndPassword(value.email, value.password)
     .then(
       res => resolve(res),
       err => reject(err))
   })
  }

  doLogin(value){
   return new Promise<any>((resolve, reject) => {
     firebase.auth().signInWithEmailAndPassword(value.email, value.password)
     .then(
       res => resolve(res),
       err => reject(err))
   })
  }

  doLogout(){
    return new Promise((resolve, reject) => {
      this.afAuth.auth.signOut()
      .then(() => {
        // this.firebaseService.unsubscribeOnLogOut();
        resolve();
      }).catch((error) => {
        console.log(error);
        reject();
      });
    })
  }
}
