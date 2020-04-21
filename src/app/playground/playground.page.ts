import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';

import { environment } from '../../environments/environment';
import { HttpParams } from '@angular/common/http';

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
