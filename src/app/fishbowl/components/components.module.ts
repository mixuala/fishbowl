import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from '../../pipes/pipes.module';
import { ShellModule } from '../../shell/shell.module';

import { ScoreCardComponent } from './score-card/score-card.component';
import { TeamRosterComponent } from './team-roster/team-roster.component';
import { OverviewComponent } from './overview/overview.component';
import { GameOverComponent } from './game-over/game-over.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ShellModule,
    IonicModule,
    PipesModule,
  ],
  declarations: [
    ScoreCardComponent, TeamRosterComponent, OverviewComponent, GameOverComponent,
  ],
  exports: [
    ShellModule,
    ScoreCardComponent, TeamRosterComponent, OverviewComponent, GameOverComponent,
  ],
  entryComponents: [
    ScoreCardComponent, TeamRosterComponent, OverviewComponent, GameOverComponent,
  ],
})
export class FishbowlComponentsModule {}
