import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PipesModule } from '../../pipes/pipes.module';
import { ComponentsModule } from '../../components/components.module';
import { IonicModule } from '@ionic/angular';

import { SetupPageRoutingModule } from './setup-routing.module';

import { EntryPage } from './entry.page';
import { GameSettingsPage } from './game-settings.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,    
    PipesModule,
    ComponentsModule,
    IonicModule,
    SetupPageRoutingModule
  ],
  declarations: [
    EntryPage, GameSettingsPage,
  ]
})
export class SetupPageModule {}
