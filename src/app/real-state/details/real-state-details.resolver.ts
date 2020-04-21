import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import { RealStateService } from '../real-state.service';
import { RealStateDetailsModel } from '../details/real-state-details.model';
import { DataStore } from '../../shell/data-store';
import { Observable } from 'rxjs';

@Injectable()
export class RealStateDetailsResolver implements Resolve<any> {

  constructor(private realStateService: RealStateService) {}

  resolve() {
    const dataSource: Observable<RealStateDetailsModel> = this.realStateService.getDetailsDataSource();
    const dataStore: DataStore<RealStateDetailsModel> = this.realStateService.getDetailsStore(dataSource);

    return dataStore;
  }
}
