import { Component, Input, OnInit, OnDestroy, Output, EventEmitter, SimpleChange } from '@angular/core';

import { Observable, Subject, interval, BehaviorSubject } from 'rxjs';
import { takeUntil, takeWhile, filter} from 'rxjs/operators';

import * as dayjs from 'dayjs';

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
  set duration( o: {seconds: number}) {
    const LATENCY_MS = 1005;
    if (o && o.hasOwnProperty('seconds')) {
      if (o.seconds===null) {
        this._endingTime=null;
      }
      else {
        this.stash.duration = o;
        let duration = o.seconds*1000 + LATENCY_MS;
        this._endingTime = dayjs().add(duration, 'millisecond');
      }
    }
    else {
      this._endingTime=null;
    }
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

  stash:any = {};

  constructor() { }

  ngOnInit(): void {
    this.startCountdown();
  }

  startCountdown(): void {
    if (!this._endingTime) {
      this._secondsLeft = 0;
      return
    }
    if (this.stopAtZero) {
      const secondsLeft = this._endingTime.diff(dayjs(), 'second');
      if (secondsLeft<=0) {
        this._secondsLeft = 0;
        return
      }
    }    

    if (this.stash.running) {
      this.stash.running.unsubscribe();
    }
    this.complete$.next(false);
    this.pauseTimer$.next(false);
    this.stash.running = this._updateInterval.pipe(
      takeUntil(this._unsubscribeSubject),
      takeWhile( _=>this.complete$.value==false),
      filter( _=> this.pauseTimer$.value==false ),
    ).subscribe(
      (val) => {
        if (!this._endingTime) return;

        const secondsLeft = this._endingTime.diff(dayjs(), 'second');
        
        this._daysLeft = Math.floor(this._dayModulus(secondsLeft) / this._dayDivisor);
        this._hoursLeft = Math.floor(this._hourModulus(secondsLeft) / this._hourDivisor);
        this._minutesLeft = Math.floor(this._minuteModulus(secondsLeft) / this._minuteDivisor);
        this._secondsLeft = Math.floor(this._secondModulus(secondsLeft) / this._secondDivisor);

        if (secondsLeft <=0 ) {
          let result = this.stash.duration || (this._endingTime as dayjs.Dayjs).toDate();
          if (this.stopAtZero) {
            this.complete$.next(true);
            this._secondsLeft = 0;
            this.onBuzz.emit(result);
          }
          else if (!this.stash.buzzed)
          {
            // buzz ONCE when complete, but may continue counting negative
            this.onBuzz.emit(result);
            this.stash.buzzed = true;
          }
        }
      },
      (error) => console.error(error),
      // () => console.log('CountdownTimer subscription complete')
    );
  }

  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k, change] = en;
      switch(k){
        case 'duration':
        case 'end': {
          if (change.firstChange) {  // skip firstChange from ngOnInit()
            return
          }
          if (this._endingTime) {
            this.startCountdown();
          }
          else if (this._endingTime===null) {
            this.complete$.next(false);
            this.pauseTimer$.next(false);
            this._secondsLeft = 0;
            console.log("countdownTimer stopped with value=null")
          }
        }
      }
    });
  }
  
  ngOnDestroy(): void {
    this._unsubscribeSubject.next();
    this._unsubscribeSubject.complete();
  }
}
