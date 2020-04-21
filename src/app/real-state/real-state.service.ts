import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs';

import { RealStateListingModel } from './listing/real-state-listing.model';
import { RealStateDetailsModel } from './details/real-state-details.model';
import { DataStore } from '../shell/data-store';

@Injectable()
export class RealStateService {
  private listingDataStore: DataStore<RealStateListingModel>;
  private detailsDataStore: DataStore<RealStateDetailsModel>;

  constructor(private http: HttpClient) { }

  public getListingDataSource(): Observable<RealStateListingModel> {
    return this.http.get<RealStateListingModel>('./assets/sample-data/real-state/listing.json');
  }

  public getListingStore(dataSource: Observable<RealStateListingModel>): DataStore<RealStateListingModel> {
    // Use cache if available
    if (!this.listingDataStore) {
      // Initialize the model specifying that it is a shell model
      const shellModel: RealStateListingModel = new RealStateListingModel();
      this.listingDataStore = new DataStore(shellModel);
      // Trigger the loading mechanism (with shell) in the dataStore
      this.listingDataStore.load(dataSource);
    }
    return this.listingDataStore;
  }

  public getDetailsDataSource(): Observable<RealStateDetailsModel> {
    return this.http.get<RealStateDetailsModel>('./assets/sample-data/real-state/details.json');
  }

  public getDetailsStore(dataSource: Observable<RealStateDetailsModel>): DataStore<RealStateDetailsModel> {
    // Use cache if available
    if (!this.detailsDataStore) {
      // Initialize the model specifying that it is a shell model
      const shellModel: RealStateDetailsModel = new RealStateDetailsModel();
      this.detailsDataStore = new DataStore(shellModel);
      // Trigger the loading mechanism (with shell) in the dataStore
      this.detailsDataStore.load(dataSource);
    }
    return this.detailsDataStore;
  }
}
