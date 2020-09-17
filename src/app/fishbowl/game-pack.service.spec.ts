import { TestBed } from '@angular/core/testing';

import { GamePackService } from './game-pack.service';

describe('GamePackService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: GamePackService = TestBed.get(GamePackService);
    expect(service).toBeTruthy();
  });
});
