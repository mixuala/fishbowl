import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PipesModule } from '../pipes/pipes.module';

import { IonicModule } from '@ionic/angular';

import { PlaygroundPageRoutingModule } from './playground-routing.module';

import { PlaygroundPage } from './playground.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PipesModule,
    IonicModule,
    PlaygroundPageRoutingModule
  ],
  declarations: [PlaygroundPage]
})
export class PlaygroundPageModule {}
