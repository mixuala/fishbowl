import { Injectable } from '@angular/core';

// import 'hammerjs';

import { Plugins, AppState } from '@capacitor/core';
import { SwUpdate } from '@angular/service-worker';
import { interval, Observable } from 'rxjs';


const CHECK_UPDATE_INTERVAL = 60*1000;

/**
 * service worker update service
 */
@Injectable({
  providedIn: 'root'
})
export class PwaUpdateService {
  timer:Observable<any>;
  constructor(
    private pwaUpdates: SwUpdate
  ) { }

  /**
   * subscribe to PWA update notifcation, then check for updates on CHECK_UPDATE_INTERVAL
   * @param pwaUpdates 
   */
  public listenForUpdates(): void {
    if (this.pwaUpdates.isEnabled) {
      console.log('ServiceWorker updates enabled');
      this.pwaUpdates.available.subscribe(event => this.promptUser());
      this.pwaUpdates.checkForUpdate()
      .then(()=>{
        this.timer = interval(CHECK_UPDATE_INTERVAL)
        this.timer.subscribe(() =>{ 
          this.pwaUpdates.checkForUpdate()
          .then(() => console.log('checking for updates'))
        });
      })    
    }
  }

  /**
   * notify use PWA update is available for reload
   */
  public promptUser(): void {
    const resp =  window.confirm(`Update available. Please reload the page.`);
    if (resp==true){
      this.pwaUpdates.activateUpdate().then(() => {
        document.location.reload();
      }); 
    }
  }
}
