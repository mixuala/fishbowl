import { Component, OnInit, HostBinding } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { RealStateDetailsModel } from './real-state-details.model';

@Component({
  selector: 'app-real-state-details',
  templateUrl: './real-state-details.page.html',
  styleUrls: [
    './styles/real-state-details.page.scss',
    './styles/real-state-details.shell.scss'
  ]
})
export class RealStateDetailsPage implements OnInit {
  details: RealStateDetailsModel;

  @HostBinding('class.is-shell') get isShell() {
    return (this.details && this.details.isShell) ? true : false;
  }

  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.route.data.subscribe((resolvedRouteData) => {
      const detailsDataStore = resolvedRouteData['data'];

      detailsDataStore.state.subscribe(
        (state) => {
          this.details = state;
        },
        (error) => {}
      );
    },
    (error) => {});
  }
}
