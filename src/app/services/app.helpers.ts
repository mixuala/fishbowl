import { ChangeDetectorRef, Injectable } from '@angular/core';
import { Plugins, AppState, DeviceInfo,  } from '@capacitor/core';
import { MenuController, Platform } from '@ionic/angular';

import { Observable, Subject, BehaviorSubject, ReplaySubject, } from 'rxjs';
import { } from 'rxjs/operators';

const { App, Device, SplashScreen, Storage } = Plugins;

const DEFAULT_LOC = {lat:3.157, lng:101.712};  // KLCC

/**
 * stash App (mostly) constants here. 
 * Can be injected or used as a static class
 */
@Injectable({
  providedIn: 'root'
})
export class AppConfig {
  static device:DeviceInfo;
  static platform: Platform;
  static devicePixelRatio:number;
  // changes on device rotate, or window dragged to new screen
  static screenWH:[number,number];

  // // googleMap vars initialized in AppComponent
  // static map: google.maps.Map;
  // static mapKey: string;
  // static mapReady: Promise<google.maps.Map>; // set in GoogleMapsHostComponent
  // static initialMapZoom:number = 4;
  // static currentLoc:{lat:number, lng:number} = DEFAULT_LOC;

  // init config "constants"
  static init(platform:Platform) {
    AppConfig.platform = platform;
    platform.ready().then(async ()=>{
      AppConfig.device = await Device.getInfo()
      AppConfig.detectBrowser(AppConfig.device);
  
      SplashScreen.hide().catch((err)=>{});  // Capacitor SplashScreen
      // await this.listenAppState();
      // this.exposeDebug();
  
      setTimeout( () => {
        AppConfig.devicePixelRatio = window.devicePixelRatio;
        ScreenDim.getWxH();
      }, 10);

      // if (!AppConfig.mapReady) AppConfig.mapReady = Promise.resolve(null);
    });
  }

  /**
   * for testing CSS4 on Mobile Safari
   * @param value 
   */
  static detectBrowser(device?:DeviceInfo):string {
    if (!device) device = AppConfig.device || {} as DeviceInfo;
    const {platform, model, manufacturer} = device;
    const el = document.getElementsByTagName('HTML')[0];
    el.classList.remove( 'mobile-safari', 'safari', 'chrome');

    let browser;

    if (platform=='ios' && model=='iPhone') {
      el.classList.add('safari');
      el.classList.add('mobile-safari');
      browser = 'mobile-safari';
    }
    else if (platform=='web' && model=='iPhone' && manufacturer == "Apple Computer, Inc.") {
      el.classList.add('safari'); // responsive mode
      browser = 'safari:responsive';
    }
    else if (platform=='web' && manufacturer == "Apple Computer, Inc.") {
      el.classList.add('safari'); // responsive mode
      browser = 'safari';
    }
    else if (platform=='web' && model=='iPhone' && manufacturer == "Google Inc.") {
      el.classList.add('chrome:responsive');
      browser = 'chrome';
    } else {
      // everything else is chrome
      el.classList.add('chrome');
      browser = 'chrome';
    }
    console.log('Detect browser for CSS, browser=',browser);
    return browser;
  }
  constructor(
    platform: Platform,
  ){
    AppConfig.init(platform);      
  }
}

/**
 * returns screen dimensions as ScreenDim.dim = Promise<`${w}x${h}`>
 * subscribe to ScreenDim.dim$ for updates, instead of 'window:resize' event
 * initialized on class load
 */
export class ScreenDim {
  private static _subj: ReplaySubject<string> = new ReplaySubject<string>(1);
  /**
   * use Observer when you want updates, e.g. async pipe
   *  this.screenDim$ = Screen.dim$
   *  <app-marker-item [dim]="screenDim$ | async"></app-marker-item>
   */
  static dim$:Observable<string> = ScreenDim._subj.asObservable();

  // called by AppComponent in 'window:resize' event
  static set(checkOnce:boolean=true, delay:number=10):Promise<string> {
    ScreenDim.dim = new Promise<string>( (resolve, reject)=>{
      setTimeout( ()=>{
        // add timeout to get correct values for innerWidth, innerHeight from resize event
        const _dim = [window.innerWidth, window.innerHeight].join('x');
        const check = _dim.split('x');
        if (check[0]==check[1] && checkOnce) {
          // 2nd try...
          return ScreenDim.set(false,100).then( __dim=>resolve(__dim));
        }
        console.log(`ScreenDim.set(${checkOnce}) [wxh]=`, _dim);
        ScreenDim.setOrientationClasses(_dim);
        resolve(_dim);
        AppConfig.screenWH = _dim.split('x').map(v=>parseInt(v)) as [number,number]
      }, delay);
    });
    ScreenDim.dim.then( _dim=>{ 
      ScreenDim._subj.next(_dim);
    })
    return ScreenDim.dim;
  }
  /**
   * use promise when you don't need updates, e.g. 
   *  const dim = await ScreenDim.dim
   * initialize on class load
   */
  static dim:Promise<string> = ScreenDim.set();

  // more helpers
  static getWxH():Promise<[number,number]> {
    return ScreenDim.dim.then( _dim=>_dim.split('x').map(v=>parseInt(v)) as [number,number] );
  }
  static getThumbDim(dim?:[number,number]):Promise<string> | string {
    function getSize(dim:[number,number]){
      const[fitW, fitH] = dim;
      const thumbsize = fitW < 768 ? 56 : 80;
      return `${thumbsize}x${thumbsize}`;
    }
    if (dim) return getSize(dim);
    return ScreenDim.getWxH().then( dim=>getSize(dim));
  }

  static setOrientationClasses(dim:string):string{
    const[fitW, fitH] = dim.split('x').map(v=>parseInt(v));
    const el = document.getElementsByTagName('HTML')[0]
    if (fitW>fitH) {
      el.classList.add('landscape');
      el.classList.remove('portrait')
      return 'landscape';
    }
    else {
      el.classList.add('portrait');
      el.classList.remove('landscape');
      return 'portrait';
    }
  }

}


/**
 * random helpful methods
 */
export class Helpful {
  public static shuffle(arr:any[], sample?:number|boolean):any[] {
    const shuffled = arr
      .map(a => [Math.random(), a])
      .sort((a, b) => a[0] - b[0])
      .map(a => a[1]);
    if (!sample) return shuffled
    if (sample===true)
      sample = Math.ceil(Math.random() * Math.floor(arr.length))
    return shuffled.slice(0,sample)
  }

  public static chunk(array:any[], size=10):any[][] {
    const chunked_arr:any[][] = [];
    let index = 0;
    while (index < array.length) {
      chunked_arr.push(array.slice(index, size + index));
      index += size;
    }
    return chunked_arr;
  }
  
  public static bytesToSize(bytes:number):string{ 
    if (bytes == 0) return '0 Bytes';
    const k = 1000;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toPrecision(3) + ' ' + sizes[i];
  }

  // example: 
  public static jsonEscape(str)  {
    return str.replace(/\n/g, "\\\\n").replace(/\r/g, "\\\\r").replace(/\t/g, "\\\\t");
  }
  // example: JSON.parse(  Helpful.jsonEncode( JSON.stringify( Helful.jsonEscape(data) )))
  public static jsonEncode(str)  {
    return str.replace(/\\n/g, "\\\\n").replace(/\\r/g, "\\\\r").replace(/\\t/g, "\\\\t");
  }

  public static isEmpty(o:any) {
    if (o===null) return true;
    switch(typeof o){
      case 'string':
      case 'object':
        return !o ? false : Object.keys(o).length===0; // ? null, ""  : {}, []
      case 'boolean':
        return false;
      case 'undefined':
      default: 
        return true;
    }
  }
  // e.g. pick( target, ...keys )
  public static pick(O:any, ...K:string[]){
    return K.reduce((o, k) => (O&&O.hasOwnProperty(k)?o[k]=O[k]:0, o), {});
  }

  // e.g. sortByids( {[id]: any}, ids)
  public static sortByIds(O:{[id:string]:any}[], ids:string[], key?:string|string[], strict=false){
    const dict = Helpful.indexByKey(O, key || 'id');
    if (strict) 
      return ids.map( k=>dict[k] || null ).filter(o=>!!o);
    const remainder = Object.keys(dict).filter(k=>!ids.includes(k));
    return ids.concat(remainder).map( k=>dict[k] || null );
  }

  public static indexByKey(O:any[], key:string|string[]='id'):{[id:string]:any}{
    return O.reduce( (d,o)=>{
      if (typeof key==='string') d[o[key]]=o;
      else if (key instanceof Array) {
        const useKey = key.find( k=>!!o[k] ); 
        if (useKey) d[o[useKey]]=o;
      }
      return d;
    }, {});
  }

  public static cleanProperties(o, keys?:string[]){
    let whitelist = Object.keys(o).filter( k=>!k.startsWith('_'));
    if (keys)
      whitelist = keys.filter( k=>whitelist.includes(k));
    return Helpful.pick( o, ...whitelist);
  }

  public static obj2String(o){
    const kv = Object.entries(o).reduce( (a,v)=>(a.push(v.join(':')), a) ,[])
    return `{ ${kv.join(', ')} }`;
  }

  public static findHtmlElement(o:any):HTMLElement{
    // while (!o.hasOwnProperty('classList')) {
    while (o instanceof HTMLElement == false) {
      let child = o['el'] || o['nativeElement'];
      if (!child) break;
      o = child;
    }
    return o;
  }

}