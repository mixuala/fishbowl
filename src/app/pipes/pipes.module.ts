import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { NgFloorPipeModule } from 'angular-pipes';

import { TimeDifferencePipe } from './time-difference.pipe';
import { TimeAgoPipe } from './time-ago.pipe';
import { DurationPipe } from './duration.pipe';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    NgFloorPipeModule
  ],
  declarations: [
    TimeDifferencePipe,
    TimeAgoPipe,
    DurationPipe,
  ],
  exports: [
    NgFloorPipeModule,
    TimeDifferencePipe,
    TimeAgoPipe,
    DurationPipe,
  ],
  entryComponents: [],
})
export class PipesModule {}
