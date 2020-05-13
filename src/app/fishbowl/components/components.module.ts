import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../../pipes/pipes.module';
import { ShellModule } from '../../shell/shell.module';

import { ScoreCardComponent } from './score-card/score-card.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ShellModule,
    IonicModule,
    PipesModule,
  ],
  declarations: [
    ScoreCardComponent,
  ],
  exports: [
    ShellModule,
    ScoreCardComponent,
  ],
  entryComponents: [
    ScoreCardComponent,
  ],
})
export class FishbowlComponentsModule {}
