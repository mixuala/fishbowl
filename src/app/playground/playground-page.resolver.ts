import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Resolve } from '@angular/router';
import { AuthService } from '../services/auth-service.service';


@Injectable()
export class PlaygroundPageResolver implements Resolve<any> {

  constructor(
    private authService: AuthService,
  ) {}

  async resolve(snapshot: ActivatedRouteSnapshot) {

    await this.authService.getCurrentUser()
    .then(res=>{
      if (res) return Promise.resolve(res);
      return Promise.reject('unauthorized')
    })
    .catch( (error)=>{
      if (error=="unauthorized") {
        // anonymous signIn
        if ("doAnonymousSignIn" && true) {
          return this.authService.doAnonymousSignIn()
        }
        else {
          // email/passwd signIn with DEV user
          console.log( `DEV: auto-login to default app user.`);
          return this.authService.doLogin({email:'test@test.com', password:'hellow'})
        }
      }
      return Promise.reject(error);
    })
    .catch( (error)=>{
      // Handle Errors here.
      let errorCode = error.code;
      let errorMessage = error.message;
      console.error("authService.getCurrentUser()", error)
    });


    window['start_'] = Date.now();          // for timing
    const data = {
      'userP': this.authService.getCurrentUser(),
      'user$': this.authService.getCurrentUser$(), 
    }
    return data;
  }
}
