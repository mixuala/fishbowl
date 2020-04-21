import { ShellModel } from '../../shell/data-store';

export class RealStateDetailsModel extends ShellModel {
  picture: string;
  location: {
    address: string,
    city: string,
    latlng: string,
    mapImage: string
  };
  description: string;
  price: string;
  accommodations: {
    guests: number,
    bedrooms: number,
    patios: number,
    bathrooms: number
  };
  amenities: Array<{name: string, icon: string}> = [
    {
      name: '',
      icon: ''
    },
    {
      name: '',
      icon: ''
    },
    {
      name: '',
      icon: ''
    },
    {
      name: '',
      icon: ''
    },
    {
      name: '',
      icon: ''
    },
    {
      name: '',
      icon: ''
    }
  ];

  constructor() {
    super();
  }
}
