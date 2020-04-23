import { Component } from '@angular/core';
import { ActivatedRoute, Router, RoutesRecognized } from '@angular/router';
import { MenuController } from '@ionic/angular';

import { Game } from '../fishbowl/types';
import { tap, filter } from 'rxjs/operators';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: [
    './styles/tabs.page.scss'
  ]
})
export class TabsPage  {

  constructor(
    public menu: MenuController,
    private  activatedRoute: ActivatedRoute,
    private  router: Router,
  ) { }

  activeGame:Game;
  stash:any = {
    gameId: null
  }

  ngOnInit(){
    this.spyOnPageData()
  }

  ionViewWillEnter() {
    this.menu.enable(true);
  }

  /**
   * capture `this.activatedRoute.snapshot.paramMap` from TabPages
   */
  spyOnPageData(){
    this.router.events.pipe(
      filter( v=>v instanceof RoutesRecognized ),
      tap( (v:RoutesRecognized)=>{
        try {
          let url = v.urlAfterRedirects.split('?').pop()
          if (url.startsWith('/app/game/')) {
            let paramMap = v.state.root.firstChild.firstChild.firstChild.paramMap;
            this.stash.gameId = paramMap.get('uid')
          }
        } catch (err) {}
      }),
    ).subscribe(); 
  }

  // TODO: create an activeGame service instead

  
}
