import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../../pipes/pipes.module';
import { ShellModule } from '../../shell/shell.module';

import { ScoreCardComponent } from './score-card/score-card.component';
import { TeamRosterComponent } from './team-roster/team-roster.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ShellModule,
    IonicModule,
    PipesModule,
  ],
  declarations: [
    ScoreCardComponent, TeamRosterComponent,
  ],
  exports: [
    ShellModule,
    ScoreCardComponent, TeamRosterComponent,
  ],
  entryComponents: [
    ScoreCardComponent, TeamRosterComponent,
  ],
})
export class FishbowlComponentsModule {}
