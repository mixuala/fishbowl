import { TestBed } from '@angular/core/testing';

import { GameCodeService } from './game-code.service';

describe('GameCodeService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: GameCodeService = TestBed.get(GameCodeService);
    expect(service).toBeTruthy();
  });
});
