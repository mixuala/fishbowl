import { Component, OnInit, HostBinding } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { RealStateListingModel } from './real-state-listing.model';

@Component({
  selector: 'app-real-state-listing',
  templateUrl: './real-state-listing.page.html',
  styleUrls: [
    './styles/real-state-listing.page.scss',
    './styles/real-state-listing.shell.scss'
  ]
})
export class RealStateListingPage implements OnInit {
  listing: RealStateListingModel;

  @HostBinding('class.is-shell') get isShell() {
    return (this.listing && this.listing.isShell) ? true : false;
  }

  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.route.data.subscribe((resolvedRouteData) => {
      const listingDataStore = resolvedRouteData['data'];

      listingDataStore.state.subscribe(
        (state) => {
          this.listing = state;
        },
        (error) => {}
      );
    },
    (error) => {});
  }
}
