import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, IonButton } from '@ionic/angular';
import * as dayjs from 'dayjs';

import { environment } from '../../environments/environment';
import { HttpParams } from '@angular/common/http';
import { Player } from '../user/role';

import { Observable, Subject } from 'rxjs';
import { map, tap } from 'rxjs/operators';

declare let window;

@Component({
  selector: 'app-playground',
  templateUrl: './playground.page.html',
  styleUrls: ['./playground.page.scss', './animate.css'],
})
export class PlaygroundPage implements OnInit {
  public data: {
    rows: Array<any>,
    count: number,
  };
  public stash:object = {};
  public gameDateTime:dayjs.Dayjs;
  public timer$:Subject<{seconds:number}>;

  @ViewChild( 'playTimer', {static:false} ) playTimer:IonButton; 

  constructor(
    private  activatedRoute: ActivatedRoute,
    private  router: Router,
    private loadingController: LoadingController,  
  ) {

    if (environment.production==false){
      window['_dbg'] = window['_dbg'] || {};
      window._dbg.stash = this.stash
      window._dbg.dayjs = dayjs
    }

    // timers
    this.gameDateTime = this.setGameDateTime()
    this.timer$ = new Subject();
  }

  ngOnInit() {
    const routeData = this.activatedRoute && this.activatedRoute.snapshot && this.activatedRoute.snapshot.data['data'];
    if (routeData) {
      const {user$, user} = routeData;
      Object.assign(this, {user$, user});
      this.loadPlayer$(user$).pipe(
        tap( (p)=>{
          console.log("player=", p);
        })
      ).subscribe();
    }

    this.timer$.pipe(
      tap( v=>console.log("RESET timer=", v) ),
    ).subscribe();
  }

  loadPlayer$(user$:Observable<firebase.User>):Observable<Player> {
    return user$.pipe(
      map( u=>{
        let p:Player = {
          uid: u.uid,
          name: u.displayName,
          gamesPlayed: 0,
        }
        return p;
      })
    )
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
  
  // Helpers
  resetTimer(duration=3){
    this.timer$.next( {seconds: duration} );
  }

  onTimerDone(t:Date|{seconds:number}) {
    console.log("BUZZ done at t=", t);
    this.animate(this.playTimer);

  }

  animate( el:HTMLElement | any, animation="long-wobble" ){
    el = el.hasOwnProperty('el') ? el['el'] : el;
    el.classList.add("animated", "slow", animation)
    el.addEventListener('animationend', ()=>{ el.classList.remove("animated", "slow", animation) })
  }


  setGameDateTime(day:number=5, hour:number=19){
    let datetime = {
      day, // Fri
      hour,
      startOf: 'hour'
    }
    let startTime = Object.entries(datetime).reduce( (d, [k,v])=>{
      if (k=='startOf') return d.startOf(v as dayjs.UnitType)
      return d.set(k as dayjs.UnitType, v as number);
    }, dayjs() );
    console.log("Game starts at=", startTime);
    return startTime
  }

}
