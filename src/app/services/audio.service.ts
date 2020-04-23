import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { NativeAudio } from '@ionic-native/native-audio/ngx';


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
    buzz: "assets/audio/54047__guitarguy1985__buzzer.wav",
    bells: "assets/audio/106803__robinhood76__02252-ding-dong-bell-door-long-nasty.wav",
    click: "assets/audio/448080__breviceps__wet-click.wav",
  }


  private sounds: Sound[] = [];
  private audioPlayer: HTMLAudioElement;
  private forceWebAudio: boolean = true;

  constructor(
    private platform: Platform, 
    private nativeAudio: NativeAudio,
  ){
    // safari HTML5 hack
    this.audioPlayer = new Audio();
  }

  preload(key: string, asset: string=null): void {

    asset = asset || this.library[key];

    if(this.platform.is('cordova') && !this.forceWebAudio){

      this.nativeAudio.preloadSimple(key, asset);

      this.sounds.push({
        key: key,
        asset: asset,
        isNative: true
      });

    } else {

      let audio = new Audio();
      audio.src = asset;

      this.sounds.push({
        key: key,
        asset: asset,
        isNative: false
      });

    }

  }

  play(key: string): Promise<any> {

    let soundToPlay = this.sounds.find((sound) => {
      return sound.key === key;
    });

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
      this.audioPlayer.volume = 0.1;
      this.audioPlayer.src = soundToPlay.asset;
      this.audioPlayer.play();
      let stop = ()=>{
        this.audioPlayer.pause();
      }
      return Promise.resolve(stop);

    }

  }

}