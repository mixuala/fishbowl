import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Plugins, } from '@capacitor/core';
import { interval, Subject } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

const { Storage } = Plugins;

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
  public static dismissed:any = null; // check before modal.present()
  public static last:HTMLIonModalElement;
  public template: string;

  /**
   * 
   * @param modalCtrl 
   * @param options 
   * @returns Promise<any> resolves on modelCtrl.onDidDismiss
   */
  public static
  async presentModal(modalCtrl:ModalController, options:any={}):Promise<any>{
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
      if (!!HelpComponent.last) {
        return HelpComponent.last && HelpComponent.last.dismiss(true);
      }
    })
    .then( async ()=>{

      // let ready = await 
      if (HelpComponent.dismissed == null) {
        await HelpComponent._loadStorage();
      }
      let dismissKey = typeof options.once == "string" ?  `${options.template}:${options.once}` : options.template;
      if (HelpComponent.dismissed[dismissKey]) {
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
      let waitForDissmissal = new Promise<any>( resolve=>{
        if (options.duration) {
          interval(options.duration).pipe(
            takeUntil(done$),
            tap(()=>modal.dismiss())
          ).subscribe();
        }
        modal.present()
        .then( async ()=>{
          await modal.onWillDismiss()
          .then( async (resp)=>{
            done$.next(true);
            options.onWillDismiss && options.onWillDismiss(resp);
          })
          modal.onDidDismiss()
          .then( (resp)=>{
            let result = (options.onDidDismiss) ? options.onDidDismiss(resp) : resp;
            HelpComponent.last = null;
            resolve(result)
            // let {template} = modal.componentProps;
          });
        })
        HelpComponent.last = modal;
      });
      return waitForDissmissal;
    })
    .catch( err=>{
      if (err=='skip') {
        return Promise.resolve(null)
      }
      return Promise.reject(err);
    });
  }  



  private static
  _loadStorage():Promise<void>{
    // load dismissed
    HelpComponent.dismissed = {};
    let key = HelpComponent.STORAGE_KEY;
    return Storage.get( {key} )
    .then( o=>{
      let value: any;
      try {
        value = JSON.parse(o.value);
        HelpComponent.dismissed = Object.assign(HelpComponent.dismissed, value);
      } catch (err) {
        value = o.value;
      }
      // console.log( "loaded", HelpComponent.dismissed, value)
    })
  }
  
  constructor(
  ) { 

  }  

  async ngOnInit() {
    HelpComponent._loadStorage();
  }

  onDismissClick(ev:MouseEvent){
    let self = this as any;
    if (!!self.once) {
      let dismissKey = typeof self.once == "string" ?  `${self.template}:${self.once}` : self.template;
      HelpComponent.dismissed[dismissKey] = true;
      let key = HelpComponent.STORAGE_KEY;
      let value = JSON.stringify(HelpComponent.dismissed);
      Storage.set( { key, value } )
      // .then( async ()=>{
      //   let res = await Storage.get( {key} );
      //   console.log("Storage set value=", key, JSON.parse(res.value) );
      // });
    }    
    self.modal.dismiss();
  }
}
