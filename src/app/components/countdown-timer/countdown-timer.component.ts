import { Component, Input, OnInit, OnDestroy, Output, EventEmitter, SimpleChange } from '@angular/core';

import { Observable, Subject, interval, BehaviorSubject, Subscription } from 'rxjs';
import { takeUntil, takeWhile, filter} from 'rxjs/operators';

import * as dayjs from 'dayjs';

const LATENCY_MS = 900;  // add time so timer display begins at 30

export interface CountdownTimerDurationOptions {
  seconds: number;
  key: number;
  offset?: number;
}

@Component({
  selector: 'app-countdown-timer',
  templateUrl: './countdown-timer.component.html',
  styleUrls: [
    './countdown-timer.component.scss'
  ]
})
export class CountdownTimerComponent implements OnInit, OnDestroy {
  static completed = {};

  _endingTime: dayjs.Dayjs;
  _initialUnit = 'hour';
  _endingUnit = 'second';

  _updateInterval: Observable<any> = interval(1000);
  private _unsubscribeSubject: Subject<void> = new Subject();

  /**
   * detect component bootstrap 
   * - required for adjusting elapsed time when duration timer is already ticking
   */
  private _isBootstrap: boolean = true;

  pauseTimer$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  complete$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  // display values
  _daysLeft: number;
  _hoursLeft: number;
  _minutesLeft: number;
  _secondsLeft: number = 0;

  // DIVISORS
  // 60 seconds * 60 (minutes) * 24 (hours) = 86400 seconds = 1 day
  _dayDivisor = (60 * 60 * 24);
  // 60 seconds * 60 (minutes) = 3600 seconds = 1 hour
  _hourDivisor = (60 * 60);
  // 60 seconds = 1 minute
  _minuteDivisor = 60;
  _secondDivisor = 1;

  // MODULUS
  // Neutral modulus
  _dayModulus = (secondsLeft) => secondsLeft;
  // The modulus operator (%) returns the division remainder.
  // To figure out how many hours are left after taking in consideration the days, we should do:
  //    (secondsLeft % hourModulus) / hourDivisor
  // In 1 day there are 86400 seconds, and in 1 hour 3600 seconds. 1 day + 1 hour = 90000 seconds
  //    (90000s % 86400s) / 3600s = 1h
  _hourModulus = (secondsLeft) => (secondsLeft % this._dayDivisor);
  _minuteModulus = (secondsLeft) => (secondsLeft % this._hourDivisor);
  _secondModulus = (secondsLeft) => (secondsLeft % this._minuteDivisor);

  @Input()
  set end(endingTime: string) {
    this._endingTime = (endingTime !== undefined && endingTime !== null) ? dayjs(endingTime) : dayjs();
  }

  @Input() 
  /**
   * set countdownTimer in "timer" mode
   * 
   *  o={
   *    seconds: number
   *    key: number (use unixtime)
   *    serverTime: firebase serverTime, common to all clients
   *    serverOffset0: serverTime - timer.key (reference timestamp for options.seconds)
   *    serverOffset1: serverTime - now (time on local client)
   *    elapsed: now - (timer.key + serverOffset0) if timer is ALREADY ticking, otherwise 0
   *  }
   *  o==null cancels timer without buzz
   *  o=={ pause:true } pauses timer, without clearing ending time
   * 
   *  NOTE: this.duration is NEVER set, use this._endingTime
   */
  set duration( options:CountdownTimerDurationOptions|{pause?:boolean} ) {
    // console.warn("\n\n\t\t 28::::A set duration(), options=", options);
    const MAX_OFFSET_MS = 2000  // max timer offset to account for network latency
    let { pause, key, seconds } = options || {} as any;
        
    if (!!pause){
      this.stop();  // and do NOT restart ngOnChanges
      return;
    }

    if (!seconds || options==null || JSON.stringify(options)==="{}") {
      this._endingTime=null;
      return;
    }
    
    if (!!this.timerOptions){
      let tid = JSON.parse(this.timerOptions);
      if (!!key && key===tid.key){
        // console.info("28::::A \t ### countdownTimer  duration timer >>> CACHE HIT, SKIP, timer:", this.timerOptions)
        return
      }
    }

    
    
    /**
     * ngOnChange gets called regardless, so trigger on 
     * SimpleChange.currentValue, not this._endingTime which is mutated here
     */
    let now = Date.now();
    let duration = seconds*1000 + LATENCY_MS;
    let offset: number;
    let {serverTime, serverOffset0, serverOffset1, elapsed} = options as any;
    if (!serverTime) {
      // set countdownTimer from pushGamePlayState( localFirst ), skip cloud state change
      elapsed = now - key; // key = now
      offset = -elapsed;
      // console.warn("120:LOCAL\t y> countdownTimer: set duration(), LOCAL=", {offset, elapsed, key, now})
    } else {
      // from cloud state change
      // (remote) serverTime = timer.key + serverOffset0
      // (local) serverTime = now + serverOffset1
      // key = now -serverOffset0 +serverOffset1 (mov avg)
      // now = -serverOffset0 + serverOffset1 + key

      offset = (serverOffset1||-elapsed) -serverOffset0
      // console.warn("120:\t y> countdownTimer: set duration(), adding offsetMS=", {
      //   offset, elapsed, serverOffset0, serverOffset1, serverTime, key, 
      // });
    }

    let clock = duration -elapsed
    // same as clock=duration -serverOffset1
    if (this._isBootstrap) {
      clock -= serverOffset0;     // serverOffset0 represents elapsed time at bootstrap
      // same as clock=duration -serverOffset1 - serverOffset0
      // console.warn("\t\t 28::::B set duration", serverOffset0, options);
    }
    this._endingTime = dayjs(key-offset).add(clock, 'millisecond');
    // same as key-serverOffset1+serverOffset0 + duration -serverOffset1 - serverOffset0
  }

  @Input()
  set units(units: {from: string, to: string}) {
    // 'day', 'hour, 'minute', 'second'
    this._initialUnit = (units !== undefined && (units.from !== undefined && units.from !== null)) ? units.from : 'hour';
    this._endingUnit = (units !== undefined && (units.to !== undefined && units.to !== null)) ? units.to : 'second';

    // For 'day' unit, use the default modulus

    // Adjust modulus depending on the unit
    if (this._initialUnit === 'hour') {
      // Cancelation modulus
      this._dayModulus = (secondsLeft) => 1;
      // Neutral modulus
      this._hourModulus = (secondsLeft) => secondsLeft;
    }

    if (this._initialUnit === 'minute') {
      // Cancelation modulus
      this._dayModulus = (secondsLeft) => 1;
      this._hourModulus = (secondsLeft) => 1;
      // Neutral modulus
      this._minuteModulus = (secondsLeft) => secondsLeft;
    }

    if (this._initialUnit === 'second') {
      // Cancelation modulus
      this._dayModulus = (secondsLeft) => 1;
      this._hourModulus = (secondsLeft) => 1;
      this._minuteModulus = (secondsLeft) => 1;
      // Neutral modulus
      this._secondModulus = (secondsLeft) => secondsLeft;
    }
  }

  @Output() onBuzz = new EventEmitter<Date | CountdownTimerDurationOptions>(); 

  @Input() stopAtZero:boolean = false;

  timerOptions: string; // options for active timer, JSON.stringify()
  subscription: Subscription;
  hasBuzzed: boolean;   // [duration=[o]] && [stopAtZero=false] should only buzz once

  constructor() { }

  ngOnInit(): void {
  }

  public getTimeRemaining(units:dayjs.UnitType='second'):number{
    return this._endingTime && this._endingTime.diff(dayjs().add(LATENCY_MS/4,'millisecond'), units);
  }

  public stop(units:dayjs.UnitType='second'):number {
    let time = this.getTimeRemaining(units);
    if (this.stopAtZero && time<=0) {
      return null; // too late, do NOT pause, 
      // let timer buzz as usual

      // // don't pause, just finish
      // this.buzzTimer();
    }
    this.complete$.next(true);
    this.pauseTimer$.next(true);
    this.timerOptions = null;
    return time;
  }

  public buzzTimer(reset=false) {
    let resp = JSON.parse(this.timerOptions);
    if (CountdownTimerComponent.completed[this.timerOptions]) {

      
      // TODO: countdownTimer must return animateTarget if we want to animate/buzz(silent) multiple timers on moderator page
      

      // resp['silent']=true;
      console.warn( "\t>>> 16. Timer already buzzed by another instance, timer=", resp);
      // this.onBuzz.emit(resp);
    }
    else {
      this.onBuzz.emit(resp);
    }
    this.hasBuzzed = true;
    CountdownTimerComponent.completed[this.timerOptions] = 1
    reset && this.doReset();
  }

  public doReset() {
    this.complete$.next(true);
    this._secondsLeft = 0;
    this.timerOptions = null;
    setTimeout( ()=>{this.timerOptions = null}, 500);
  }

  startCountdown(options:any=null): void {
    try {
      let o = JSON.parse(this.timerOptions);
      let shouldSkip = !this._isBootstrap;
      shouldSkip = shouldSkip && !!options.key && options.key===o.key;
      if (shouldSkip){
        // console.info("\t\t 28::::A startCountdown() >>> CACHE HIT, SKIP, timer=", o);
        return
      }
    } catch (err) {}

    if (!this._endingTime) {
      this._secondsLeft = 0;
      return
    }

    if (this.stopAtZero) {
      const secondsLeft = this._endingTime.diff(dayjs(), 'second');
      if (secondsLeft<=0) {
        this._secondsLeft = 0;
        this.stop();
        return;
      }
    }

    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.complete$.next(false);
    this.pauseTimer$.next(false);
    this.hasBuzzed = false;
    if (!this.timerOptions){
      // save options so we can detect and ignore duplicate calls by options.key
      this.timerOptions = JSON.stringify(options || this._endingTime.unix());
    }
    // console.warn("\t\t 28::::A startCountdown() [options,timerOptions]=", options, this.timerOptions, "\n\n\n");



    this.subscription = this._updateInterval.pipe(
      takeUntil(this._unsubscribeSubject),
      takeWhile( _=>this.complete$.value==false),
      filter( _=> this.pauseTimer$.value==false ),
    ).subscribe(
      (val) => {
        if (!this._endingTime) return;

        // console.info("1> $$$ timer ending time:", this._endingTime.toDate())
        const secondsLeft = this._endingTime.diff(dayjs(), 'second');
        
        this._daysLeft = Math.floor(this._dayModulus(secondsLeft) / this._dayDivisor);
        this._hoursLeft = Math.floor(this._hourModulus(secondsLeft) / this._hourDivisor);
        this._minutesLeft = Math.floor(this._minuteModulus(secondsLeft) / this._minuteDivisor);
        this._secondsLeft = Math.floor(this._secondModulus(secondsLeft) / this._secondDivisor);
        if (isNaN(this._secondsLeft)) this._secondsLeft=0;

        if (secondsLeft <=0 ) {
          let result = (this._endingTime as dayjs.Dayjs).toDate();
          if (!this.hasBuzzed) this.buzzTimer( this.stopAtZero );
        }
      },
      (error) => console.error(error),
      // () => console.log('CountdownTimer subscription complete at', this._endingTime)
    );
  }

  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k, change] = en;
      switch(k){
        case 'end': {
          if (dayjs(this._endingTime) < dayjs()) {
            if (this.stopAtZero){
              this._daysLeft = 0;
              this._hoursLeft = 0;
              this._minutesLeft = 0;
              this._secondsLeft = 0;
              // dont start expired timers
              return;
            }
          }
          else {
            this.startCountdown();
          }
          if (!!change.firstChange) this._isBootstrap = false;
          break;
        }
        case 'duration':
        {
          /**
           * bootstrap lifecycle for:
           *  - duration setter()
           *    - this._endingTime
           *  - ngOnChanges({duration: timerOptions})
           *    - startCountdown(change.currentValue)
           *  - ngOnInit()
           * */ 
          if (!!this._endingTime && change.currentValue.pause!=true)  {
            this.startCountdown(change.currentValue);
          }
          else if (!this._endingTime) {
            this.complete$.next(true);
            this.pauseTimer$.next(true);
            this._secondsLeft = 0;
            // console.log("countdownTimer stopped with value=null");
          }
          if (!!change.firstChange) this._isBootstrap = false;
          break;
        }
      }
    });
  }
  
  ngOnDestroy(): void {
    this._unsubscribeSubject.next();
    this._unsubscribeSubject.complete();
  }
}
