import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PlaygroundPage } from './playground.page';

import { PlaygroundPageResolver } from './playground-page.resolver';

const routes: Routes = [
  {
    path: '',
    component: PlaygroundPage,
    resolve: {
      data: PlaygroundPageResolver,
    }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
  providers: [
    PlaygroundPageResolver
  ]
})
export class PlaygroundPageRoutingModule {}
