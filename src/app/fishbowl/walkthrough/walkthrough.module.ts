import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { ComponentsModule } from '../../components/components.module';
import { FishbowlComponentsModule } from '../components/components.module';
import { WalkthroughPage } from './walkthrough.page';

const routes: Routes = [
  {
    path: '',
    component: WalkthroughPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    ComponentsModule,
    FishbowlComponentsModule,
  ],
  declarations: [WalkthroughPage]
})
export class WalkthroughPageModule {}
