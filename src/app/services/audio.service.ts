import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { NativeAudio } from '@ionic-native/native-audio/ngx';
import {Howl, Howler} from 'howler';

import { AppConfig } from '../services/app.helpers';

declare let document;

interface Sound {
  key: string;
  asset: string;
  isNative: boolean
}

@Injectable({
  providedIn: 'root'
})
export class AudioService {

  public library:{ [propname:string]: string } = {
    // timer buzz
    buzz: "assets/audio/54047__guitarguy1985__buzzer.wav",
    click: "assets/audio/448080__breviceps__wet-click.wav", 
    ok: "assets/audio/66717__cj4096__bell.wav",
    bell: "assets/audio/66717__cj4096__bell.wav",
    pass: "assets/audio/28477__simmfoc__buzz-1.wav",
    dq: "assets/audio/511883__audiopapkin__impact-sfx-017.wav",
    pause: "assets/audio/511883__audiopapkin__impact-sfx-017.wav",
    // bells: "assets/audio/106803__robinhood76__02252-ding-dong-bell-door-long-nasty.wav",
  }

  private sounds: Sound[] = [];
  private forceWebAudio: boolean = true;

  constructor(
    private platform: Platform, 
    private nativeAudio: NativeAudio,
  ){
    let initialVolume = 1;
    this.setVolume(initialVolume, false);
  }

  preload(key: string, asset: string=null): boolean {

    asset = asset || this.library[key];

    if(this.platform.is('cordova') && !this.forceWebAudio){

      this.nativeAudio.preloadSimple(key, asset);

      this.sounds.push({
        key: key,
        asset: asset,
        isNative: true
      });

    } else {

      new Howl({
        src: [asset],
        preload: true,
        mute: true,
      });

      this.sounds.push({
        key: key,
        asset: asset,
        isNative: false
      });

    }
    return !!asset;

  }

  play(key: string): Promise<any> {

    let soundToPlay = this.sounds.find((sound) => {
      return sound.key === key;
    });

    if (!soundToPlay) {
      if (this.preload(key)==false) return
      return this.play(key);
    }

    if(soundToPlay.isNative){

      return this.nativeAudio.play(soundToPlay.asset).then((id) => {
        console.log(id);
        return ()=>{
          this.nativeAudio.stop(id);
        };
      }, (err) => {
        console.log(err);
      });

    } else {
      console.warn(">>> play sound", soundToPlay.key)
      let sound = new Howl({
        src: [soundToPlay.asset]
      });
      let id = sound.play();
      return Promise.resolve( ()=>{
        sound.stop([id]);
      });
    }

  }

  setVolume(value:number, playClick=true){
    let decode = [0, 0.1, 0.3, 1];
    Howler.volume( decode[value] );
    if (playClick) this.play('click');
  }

}