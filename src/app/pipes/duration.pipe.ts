import { Pipe, PipeTransform } from '@angular/core';


/**
 * get milliseconds between Date.now() and a time in the past
 * usage: 
 *      {{ startTime | duration | date:"hh:mm:ss"}}
 */
@Pipe({name: 'duration'}) 
export class DurationPipe implements PipeTransform{
  // transform = Object.entries; 
  transform(value: any, from: any=null): number {
    from = new Date(from).getTime() || Date.now();
    let startTime = new Date(value).getTime();
    // console.log( new Date(from) , new Date(value), from-startTime)
    return from-startTime
  }
}

