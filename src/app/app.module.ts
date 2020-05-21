import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { ServiceWorkerModule } from '@angular/service-worker';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ComponentsModule } from './components/components.module';
import { environment } from '../environments/environment';

import { AngularFireModule } from '@angular/fire';
// import { AngularFireMessagingModule } from '@angular/fire/messaging';
// import { AngularFirestoreModule, FirestoreSettingsToken } from '@angular/fire/firestore';
// import { AngularFireStorageModule } from '@angular/fire/storage';
import { AngularFireAuthModule } from '@angular/fire/auth';
import { AngularFireDatabase, AngularFireDatabaseModule } from '@angular/fire/database';

import { NativeAudio } from '@ionic-native/native-audio/ngx';

@NgModule({
  declarations: [AppComponent],
  entryComponents: [],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    ComponentsModule,

    ServiceWorkerModule.register('/ngsw-worker.js', { enabled: environment.production }),       // OK
    // ServiceWorkerModule.register('/combined-sw.js', { enabled: environment.production }),    // FAIL

    AngularFireModule.initializeApp(environment.firebase), // imports firebase/app
    // AngularFirestoreModule, // imports firebase/firestore
    // AngularFirestoreModule.enablePersistence(),    // with offline support
    AngularFireAuthModule, // imports firebase/auth
    // AngularFireStorageModule, // imports firebase/storage
    // AngularFireMessagingModule,
    AngularFireDatabaseModule,
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    NativeAudio,
    // AngularFireDatabase
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
