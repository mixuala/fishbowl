import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';

import { IonicModule } from '@ionic/angular';

import { ComponentsModule } from '../../components/components.module';

import { RealStateDetailsPage } from './real-state-details.page';
import { RealStateDetailsResolver } from './real-state-details.resolver';
import { RealStateService } from '../real-state.service';

const routes: Routes = [
  {
    path: '',
    component: RealStateDetailsPage,
    resolve: {
      data: RealStateDetailsResolver
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
    RealStateDetailsPage
  ],
  providers: [
    RealStateDetailsResolver,
    RealStateService
  ]
})
export class RealStateDetailsPageModule {}
