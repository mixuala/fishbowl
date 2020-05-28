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
   *        dismissKeyPrefix: add prefix to dismissKey, e.g. game.label
   *        throttleTime:number, skip creation until throttleTime has passed
   *        replace:boolean, when true, dismiss HelpComponent.last
   *        replaceSame:boolean, when true replace duplicate template
   * @returns Promise<any> resolves on modelCtrl.onDidDismiss
   */
  public static
  async presentModal(modalCtrl:ModalController, options:any={}):Promise<any>{
    if (environment.production==false){
      // cancel when DEV
      // return Promise.resolve();
    }
    const defaults:any = {
      once: false,
      replaceSame: false,
      // backdropDismiss: true,
      // enableBackdropDismiss: true,
      // showBackdrop: true,
    };
    options = Object.assign( defaults, options);
    let done$ = new Subject<boolean>(); 
    
    console.log("14:2 HelpComponent.presentModal(), template=", options.template)
    return Promise.resolve()
    .then( ()=>{
      if (!!HelpComponent.last) {
        let template = HelpComponent.curTemplate();
        if (!!options.replace) {
          return HelpComponent.dismissTemplate();
        }
        if (template==options.template){
          if (!options.replaceSame) {
            return Promise.reject('skip');
          }
          return HelpComponent.dismissTemplate(template);
        }
      }
    })
    .then( async ()=>{

      // let ready = await 
      if (HelpComponent.dismissed == null) {
        await HelpComponent._loadStorage();
      }
      let dismissKey = HelpComponent.getDismissKey(options);
      let dismissedValue = HelpComponent.dismissed[dismissKey];
      switch (typeof dismissedValue) {
        case 'number': {
          // dismissedValue = timestamp of last dismissal
          let {throttleTime} = options;
          if (throttleTime && Date.now() < (dismissedValue+throttleTime)) {
            return Promise.reject('skip');
          }
          break;
        }
        case 'boolean':{
          if (dismissedValue) return Promise.reject('skip');
        }
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
            // console.warn("14:4 modal.onDidDismiss(), template=", modal.componentProps.template)
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

  public static
  getDismissKey(options):string {
    let dismissKey = [options.template]
    if (!!options.dismissKeyPrefix) dismissKey.unshift( options.dismissKeyPrefix );
    return dismissKey.join('~')
  }

  public static
  curTemplate():string{
    try {
      return HelpComponent.last.componentProps.template;
    } catch (err) {
      return null;
    }
  }

  public static
  dismissTemplate(template:string=null):Promise<boolean>{
    try {
      let lastTemplate = HelpComponent.curTemplate();
      if (template && template==lastTemplate) {
        return HelpComponent.last.dismiss(true);
      }
      if (!template) return HelpComponent.last.dismiss(true);
    } catch (err) {
    }
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
    let self = this as any;  // same as self.modal.componentProps 
    let options = self.modal.componentProps || {};
    let dismissKey = HelpComponent.getDismissKey(options);
    if (!!options.once) {
      HelpComponent.dismissed[dismissKey] = true;
    }
    else if (!!options.throttleTime) {
      HelpComponent.dismissed[dismissKey] = Date.now();
    }
    let key = HelpComponent.STORAGE_KEY;
    let value = JSON.stringify(HelpComponent.dismissed);
    Storage.set( { key, value } )
    self.modal.dismiss(true);
  }
}
