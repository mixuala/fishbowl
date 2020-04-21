import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';

import { environment } from '../../environments/environment';
import { HttpParams } from '@angular/common/http';
import { tap } from 'rxjs/operators';

declare let window;

@Component({
  selector: 'app-playground',
  templateUrl: './playground.page.html',
  styleUrls: ['./playground.page.scss'],
})
export class PlaygroundPage implements OnInit {
  public data: {
    rows: Array<any>,
    count: number,
  };
  public stash:object = {};


  constructor(
    private  activatedRoute: ActivatedRoute,
    private  router: Router,
    private loadingController: LoadingController,  
  ) {

    if (environment.production==false){
      window['_dbg'] = window['_dbg'] || {};
      window._dbg.stash = this.stash
    }
  }

  ngOnInit() {
    if (this.activatedRoute && this.activatedRoute.snapshot) {
      const routeData = this.activatedRoute.snapshot.data['data'];
      const {user$, user} = routeData;
      user$.pipe(
        tap( (u:firebase.User)=>{
          let {uid, displayName, email, isAnonymous } = u;
          console.log("user=", {uid, displayName, email, isAnonymous });
        })
      ).subscribe();
      Object.assign(this, {user$, user});
    }    
  }

  ionViewDidEnter() {
    const id = this.activatedRoute.snapshot.paramMap.get('id');
  }

  // Helpers
  async presentLoading() {
    const loading = await this.loadingController.create({
      message: 'Please wait...',
      duration: 2000
    });
    await loading.present();

    const { role, data } = await loading.onDidDismiss();
    console.log('Loading dismissed!');
  }

}
