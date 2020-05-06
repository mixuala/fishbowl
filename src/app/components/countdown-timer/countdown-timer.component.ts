import { Component, Input, OnInit, OnDestroy, Output, EventEmitter, SimpleChange } from '@angular/core';

import { Observable, Subject, interval, BehaviorSubject, Subscription } from 'rxjs';
import { takeUntil, takeWhile, filter} from 'rxjs/operators';

import * as dayjs from 'dayjs';

const LATENCY_MS = 900;  // add time so timer display begins at 30

@Component({
  selector: 'app-countdown-timer',
  templateUrl: './countdown-timer.component.html',
  styleUrls: [
    './countdown-timer.component.scss'
  ]
})
export class CountdownTimerComponent implements OnInit, OnDestroy {
  _endingTime: any;
  _initialUnit = 'hour';
  _endingUnit = 'second';

  _updateInterval: Observable<any> = interval(1000);
  private _unsubscribeSubject: Subject<void> = new Subject();
  pauseTimer$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  complete$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  // display values
  _daysLeft: number;
  _hoursLeft: number;
  _minutesLeft: number;
  _secondsLeft: number;

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
   * set duration to operation in "timer" mode
   *  o={
   *    seconds: number
   *    key: number (use unixtime)
   *  }
   *  o==null cancels timer
   *  o=={ pause:true } pauses timer, without  clearing ending time
   */
  set duration( o: {seconds?: number, pause?:boolean, key?: number}) {
    if (!o || o.seconds===null) {
      // reset timer
      this._endingTime=null;
      return;
    }
    
    if (o && o.key && o.key==this.key){
      // console.info("-1> $$$ timer ending time:", this._endingTime.toDate())
      return
    }

    let {pause, key, seconds } = Object.assign({},o);  // mutating somehow?
    if (pause){
      this.stop();  // and do NOT restart ngOnChange
      return;
    }
    

    /**
     * ngOnChange gets called regardless, so trigger on 
     * SimpleChange.currentValue, not this._endingTime which is mutated here
     */
    if (key) {
      this.offset = 0;
      if (typeof key == "number"){
        let offset = Date.now()-key;
        if (offset < 10*1000) {
          this.offset = offset;
        }
      }
    }

    let duration = seconds*1000 - this.offset + LATENCY_MS;
    this._endingTime = dayjs().add(duration, 'millisecond');
    // => onto ngOnChange()
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

  @Output() onBuzz = new EventEmitter<Date | {seconds: number}>(); 
  @Input() stopAtZero:boolean = false;

  key: number;          // id for active timer, use unixtime()
  offset: number;       // latency between db post time and first() response
  subscription: Subscription;
  hasBuzzed: boolean;   // [duration=[o]] && [stopAtZero=false] should only buzz once

  constructor() { }

  ngOnInit(): void {
    this.startCountdown();
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
    this.key = null;
    return time;
  }

  public buzzTimer(reset=false) {
    let result = (this._endingTime as dayjs.Dayjs).toDate();
    this.onBuzz.emit(result);
    this.hasBuzzed = true;
    if (reset){
      this.complete$.next(true);
      this._secondsLeft = 0;
    }
  }

  startCountdown(o:{key?:number}={}): void {
    if (!!o.key && o.key == this.key){
      // same timer, pass
      // BUG: timer resets if the spotlightUser is signed in multiple times!!!
      // console.info( "TIMER   1>>> key unchanged, skip ngOnChange, key=", o.key)
      return
    }

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
    this.key = o.key || Date.now();
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

        if (secondsLeft <=0 ) {
          let result = (this._endingTime as dayjs.Dayjs).toDate();
          let doReset = this.stopAtZero;
          if (!this.hasBuzzed) this.buzzTimer(doReset);
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
          this.startCountdown(this._endingTime);
          break;
        }
        case 'duration':
        {
          if (change.firstChange) {  // skip firstChange from ngOnInit()
            return
          }
          if (this._endingTime>0 && change.currentValue.pause!=true)  {
            this.startCountdown(change.currentValue);
          }
          else if (this._endingTime===null || this._endingTime===0) {
            this.complete$.next(true);
            this.pauseTimer$.next(true);
            this._secondsLeft = 0;
            // console.log("countdownTimer stopped with value=null");
          }
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
