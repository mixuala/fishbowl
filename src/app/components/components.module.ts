import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../pipes/pipes.module';
import { ShellModule } from '../shell/shell.module';

import {RouterModule} from '@angular/router';

import { CheckboxWrapperComponent } from './checkbox-wrapper/checkbox-wrapper.component';
import { ShowHidePasswordComponent } from './show-hide-password/show-hide-password.component';
import { CountdownTimerComponent } from './countdown-timer/countdown-timer.component';
import { CounterInputComponent } from './counter-input/counter-input.component';
import { RatingInputComponent } from './rating-input/rating-input.component';
import { HelpComponent } from './help/help.component';
import { FishbowlComponentsModule } from '../fishbowl/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ShellModule,
    IonicModule,
    PipesModule,
    RouterModule,
    FishbowlComponentsModule,
  ],
  declarations: [
    CheckboxWrapperComponent,
    ShowHidePasswordComponent,
    CountdownTimerComponent,
    CounterInputComponent,
    RatingInputComponent,
    HelpComponent,
  ],
  exports: [
    ShellModule,
    CheckboxWrapperComponent,
    ShowHidePasswordComponent,
    CountdownTimerComponent,
    CounterInputComponent,
    RatingInputComponent,
    HelpComponent,
  ],
  entryComponents: [
    HelpComponent,
  ],
})
export class ComponentsModule {}
