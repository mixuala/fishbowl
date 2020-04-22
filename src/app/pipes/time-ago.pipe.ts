import { Pipe, PipeTransform } from '@angular/core';

import * as dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

@Pipe({ name: 'appTimeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: any, format:any=false): string {
    dayjs.extend(relativeTime);
    let timeAgo = '';

    if (value) {
      if (!!format) {
        timeAgo = dayjs(value).format( typeof format=='string' ? format : 'D-MMM-YYYY');
      }
      else {
        const withoutSuffix = (dayjs(value).diff(dayjs(), 'day') < 0) ? false : true;
        timeAgo = dayjs()['to'](dayjs(value), withoutSuffix);
      }
    }

    return timeAgo;
  }
}

