import * as dayjs from 'dayjs';

export class FishbowlHelpers {

  static 
  setGameDateTime(day:number=5, hour:number=19):dayjs.Dayjs {
    let datetime = {
      day, // Fri=5
      hour,
      startOf: 'hour'
    }
    let startTime = Object.entries(datetime).reduce( (d, [k,v])=>{
      if (k=='startOf') return d.startOf(v as dayjs.UnitType)
      return d.set(k as dayjs.UnitType, v as number);
    }, dayjs() );
    console.log("Set gameDateTime=", startTime);
    return startTime;
  }
  
}