import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { GamePage } from './game.page';

const routes: Routes = [
  {
    path: '',
    component: GamePage,
    resolve: {
      // data: {}
    }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GamePageRoutingModule {}
