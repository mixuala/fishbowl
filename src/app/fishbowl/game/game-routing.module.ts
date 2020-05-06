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
  },
  {
    path: 'settings',
    loadChildren: () => import('../setup/setup.module').then( m => m.SetupPageModule)
  },
  {
    path: 'player',
    loadChildren: () => import('../setup/setup.module').then( m => m.SetupPageModule)
  },
  {
    path: 'moderator',
    loadChildren: () => import('../setup/setup.module').then( m => m.SetupPageModule)
  },    
  // {
  //   path: 'entry',
  //   loadChildren: () => import('../setup/setup.module').then( m => m.SetupPageModule)
  // },    
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GamePageRoutingModule {}
