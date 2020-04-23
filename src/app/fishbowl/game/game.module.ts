import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PipesModule } from '../../pipes/pipes.module';
import { ComponentsModule } from '../../components/components.module';
import { IonicModule } from '@ionic/angular';

import { GamePageRoutingModule } from './game-routing.module';

import { GamePage } from './game.page';

@NgModule({
  imports: [
    CommonModule,
    // FormsModule,
    // ReactiveFormsModule,
    PipesModule,
    ComponentsModule,
    IonicModule,
    GamePageRoutingModule
  ],
  declarations: [GamePage]
})
export class GamePageModule {}
