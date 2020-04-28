import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { NgMathPipesModule } from 'angular-pipes';
import { FloorPipe } from 'angular-pipes';

import { TimeDifferencePipe } from './time-difference.pipe';
import { TimeAgoPipe } from './time-ago.pipe';
import { DurationPipe } from './duration.pipe';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    NgMathPipesModule
  ],
  declarations: [
    TimeDifferencePipe,
    TimeAgoPipe,
    DurationPipe,
  ],
  exports: [
    FloorPipe,
    TimeDifferencePipe,
    TimeAgoPipe,
    DurationPipe,
  ],
  entryComponents: [],
})
export class PipesModule {}
