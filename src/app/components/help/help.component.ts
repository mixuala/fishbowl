import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-help',
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss']
})
export class HelpComponent implements OnInit {

  public template: string;
  
  /**
   * launch as Modal
   * @param modalCtrl 
   * @param options
   */
  public static dismissed:any = {}; // check before modal.present()
  static async presentModal(modalCtrl:ModalController, options:any={}):Promise<any>{
    if (environment.production==false){
      // cancel when DEV
      // return Promise.resolve();
    }
    if (HelpComponent.dismissed[options.template]) return Promise.resolve();

    const defaults:any = {
      once: true,
      // backdropDismiss: true,
      // enableBackdropDismiss: true,
      // showBackdrop: true,
    };
    options = Object.assign( defaults, options);
    return modalCtrl.create({
      component: HelpComponent,
      componentProps: options,
    })
    .then( async (modal) => {
      modal.classList.add('help-modal');  
      modal.style.zIndex = '99999';       // force z-index
      await modal.present();
      await modal.onWillDismiss()
      .then( async (resp)=>{
        options.onWillDismiss && options.onWillDismiss(resp); 
      })
      await modal.onDidDismiss()
      .then( async (resp)=>{
        options.onDidDismiss && options.onDidDismiss(resp);
        let {template} = modal.componentProps;
        if (!!options.once) {
          HelpComponent.dismissed[template] = true;
        }
      })
      return modal;
    });
  }  


  constructor(
    private modalCtrl: ModalController,
  ) { }  

  ngOnInit() {
  }

  dismiss(ev:MouseEvent, instance){
    instance.modal.dismiss();
  }
}
