import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Storage } from  '@ionic/storage';
import { environment } from '../../../environments/environment';
import { interval, Subject } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';

@Component({
  selector: 'app-help',
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss']
})
export class HelpComponent implements OnInit {

  public static STORAGE_KEY = 'help-dismissed';
  /**
   * launch as Modal
   * @param modalCtrl 
   * @param options
   */
  public static dismissed:any = {}; // check before modal.present()

  public static  
  async presentModal(modalCtrl:ModalController, options:any={}):Promise<HTMLIonModalElement>{
    if (environment.production==false){
      // cancel when DEV
      // return Promise.resolve();
    }
    const defaults:any = {
      once: true,
      // backdropDismiss: true,
      // enableBackdropDismiss: true,
      // showBackdrop: true,
    };
    options = Object.assign( defaults, options);
    let done$ = new Subject<boolean>();      

    return Promise.resolve()
    .then( ()=>{

    /**
     * BUG: static method does not wait for instance to load 
     *      this.storage.get(HelpComponent.STORAGE_KEY)
     * 
     */

      // let ready = await 
      if (HelpComponent.dismissed[options.template]) {
        return Promise.reject('skip');
      }
    })
    .then( ()=>{
      return modalCtrl.create({
        component: HelpComponent,
        componentProps: options,
      });
    })
    .then( async (modal) => {
      modal.classList.add('help-modal');  
      modal.style.zIndex = '99999';       // force z-index
      if (options.duration) {
        interval(options.duration).pipe(
          takeUntil(done$),
          tap(()=>modal.dismiss())
        ).subscribe();
      }
      await modal.present();
      await modal.onWillDismiss()
      .then( async (resp)=>{
        done$.next(true);
        options.onWillDismiss && options.onWillDismiss(resp); 
      })
      await modal.onDidDismiss()
      .then( async (resp)=>{
        options.onDidDismiss && options.onDidDismiss(resp);
        let {template} = modal.componentProps;
      })
      return modal;
    })
    .catch( err=>{
      if (err=='skip') {
        return Promise.resolve(null)
      }
      return Promise.reject(err);
    });
  }  


  public template: string;
  
  constructor(
    private storage:  Storage,
  ) { 
    // load dismissed
    this.storage.get(HelpComponent.STORAGE_KEY)
    .then( dismissed=>{
      Object.assign(HelpComponent.dismissed, dismissed);
    })
  }  

  async ngOnInit() {
  }

  dismiss(ev:MouseEvent, instance){
    let self = instance;
    if (!!self.once) {
      HelpComponent.dismissed[self.template] = true;
      self.storage.set(HelpComponent.STORAGE_KEY, HelpComponent.dismissed)
    }    
    self.modal.dismiss();
  }
}
