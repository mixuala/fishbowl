import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';

import { IonicModule } from '@ionic/angular';

import { ComponentsModule } from '../../components/components.module';

import { RealStateListingPage } from './real-state-listing.page';
import { RealStateListingResolver } from './real-state-listing.resolver';
import { RealStateService } from '../real-state.service';

const routes: Routes = [
  {
    path: '',
    component: RealStateListingPage,
    resolve: {
      data: RealStateListingResolver
    }
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    ComponentsModule,
    HttpClientModule
  ],
  declarations: [
    RealStateListingPage
  ],
  providers: [
    RealStateListingResolver,
    RealStateService
  ]
})
export class RealStateListingPageModule {}
